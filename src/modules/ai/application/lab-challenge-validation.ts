import { stableStringify } from "../../../common/idempotency";
import { ENGINE, evaluate } from "../../labs/application/simulation-versions";
import { CHALLENGE_PARAMETERS, aiOfferedLabs, challengeObjective, challengeParamErrors } from "../../lessons/application/lesson-content";
import { buildPassages, selectOutcomes, type LessonSource } from "./input-snapshot";
import { LAB_CHALLENGE_INPUT_VERSION, labChallengeProposalsV1, type LabChallengeFlags, type LabChallengeProposal, type LabDropReason } from "./lab-challenge-contract";
import type { LabChallengeSnapshotV1, LabModelSnapshot } from "./lab-challenge-prompt";
import type { LabContext } from "./lab-reference-states";
import { isUnsafeText } from "./validate-items";

/**
 * TAI6-T2 snapshot builder and pure proposal validation (LV-01..LV-09). `CHALLENGE_PARAMETERS` and
 * `challengeParamErrors` are the single source of the allowed lab/parameter ranges; `evaluate()` is the engine. A
 * proposal that is not inside the validated ranges or that the engine cannot verify never reaches the teacher.
 */
export const MAX_RATIONALE = 500;

/** Offered models (range review approved or team-lead default) that have reference states; each carries its pack ranges. */
export function offeredModels(contexts: Map<string, LabContext>): LabModelSnapshot[] {
  const models: LabModelSnapshot[] = [];
  for (const [labId, spec] of aiOfferedLabs()) {
    const context = contexts.get(labId);
    if (!context || context.referenceStates.length === 0) continue;
    const params: LabModelSnapshot["params"] = {};
    const packRanges: Record<string, { min: number; max: number }> = {};
    for (const [name, param] of Object.entries(spec.params)) {
      if (param.kind === "number") {
        params[name] = { kind: "number", min: param.min, max: param.max, step: param.step, unit: param.unit, label: param.label };
        const range = context.packRanges?.[name];
        if (range && Number.isFinite(range.min) && Number.isFinite(range.max)) packRanges[name] = { min: range.min, max: range.max };
      } else params[name] = { kind: "choice", options: param.options, label: param.label };
    }
    models.push({ labId, modelRef: spec.modelRef, params, ...(Object.keys(packRanges).length ? { packRanges } : {}) });
  }
  return models;
}

export function buildLabChallengeSnapshot(
  lesson: LessonSource,
  statements: Map<string, string>,
  models: LabModelSnapshot[],
  request: { instruction: string | null; proposalCount: number },
): LabChallengeSnapshotV1 {
  return {
    version: LAB_CHALLENGE_INPUT_VERSION,
    lesson: { id: lesson.id, title: lesson.title, grade: lesson.grade, domain: lesson.domain, topic: lesson.topic, learningObjective: lesson.learningObjective },
    passages: buildPassages(lesson),
    outcomes: selectOutcomes(lesson, null, statements),
    models,
    instruction: request.instruction,
    proposalCount: request.proposalCount,
  };
}

/** The lesson-derived part of a snapshot (never the allowlist), used for the "lesson changed since" flag. */
export const lessonPartDigest = (snapshot: Pick<LabChallengeSnapshotV1, "lesson" | "passages" | "outcomes">) =>
  stableStringify({ lesson: snapshot.lesson, passages: snapshot.passages, outcomes: snapshot.outcomes });

const CODE_LIKE =
  /<\s*\/?\s*(script|iframe|style|object|embed)\b|javascript:|\beval\s*\(|\bnew\s+Function\b|\bfunction\s*\(|=>|\brequire\s*\(|\bimport\s+[\w{*]|\bexec\s*\(|\bprocess\.|`{3}|\bDROP\s+TABLE\b|\bSELECT\b[^.]{0,60}\bFROM\b/i;

/** LV-09: the TAI-01 safety patterns (VR-08) plus a code-like text check, since AI must never produce code. */
export const rationaleUnsafe = (rationale: string) => isUnsafeText(rationale) || CODE_LIKE.test(rationale);

const sameParams = (a: Record<string, unknown>, b: Record<string, unknown>) => stableStringify(a) === stableStringify(b);

/**
 * LV-01..LV-03 against the current allowlist and pack ranges. Shared by the validation pipeline and the apply route
 * (which repeats it so a range change after generation returns AI_PROPOSAL_NO_LONGER_VALID).
 */
export function rangeReasons(
  labId: string,
  params: Record<string, number | string>,
  models: LabModelSnapshot[],
): Array<"MODEL_NOT_ALLOWED" | "PARAMS_OUT_OF_RANGE" | "PARAMS_OUTSIDE_PACK_RANGE"> {
  const model = models.find((candidate) => candidate.labId === labId);
  if (!model || !CHALLENGE_PARAMETERS[labId]) return ["MODEL_NOT_ALLOWED"];
  const reasons: Array<"MODEL_NOT_ALLOWED" | "PARAMS_OUT_OF_RANGE" | "PARAMS_OUTSIDE_PACK_RANGE"> = [];
  if (challengeParamErrors(labId, params).length > 0) reasons.push("PARAMS_OUT_OF_RANGE");
  for (const [name, range] of Object.entries(model.packRanges ?? {})) {
    const value = params[name];
    if (typeof value === "number" && (value < range.min || value > range.max)) {
      reasons.push("PARAMS_OUTSIDE_PACK_RANGE");
      break;
    }
  }
  return reasons;
}

export type KeptProposal = { payload: LabChallengeProposal; flags: LabChallengeFlags };
export type DroppedProposal = { position: number; reasonCodes: LabDropReason[] };
export type CurrentChallenge = { labId: string | null; challengeParams: Record<string, number | string> | null };

/** Runs the engine on every reference state: the verdict per state, in the order of the states. Unevaluable states are skipped. */
export function engineResultsFor(context: LabContext, labId: string, params: Record<string, number | string>) {
  const results: Array<{ label: string; verdict: string }> = [];
  for (const reference of context.referenceStates) {
    try {
      results.push({ label: reference.label, verdict: evaluate(labId, reference.state, params, context.modelRef).verdict });
    } catch {
      // A state the model rejects is not a reference for this model.
    }
  }
  return results;
}

/** LV-01..LV-09 over parsed proposals. Order of kept proposals follows the provider's order. */
export function validateProposals(
  snapshot: LabChallengeSnapshotV1,
  contexts: Map<string, LabContext>,
  current: CurrentChallenge,
  proposals: LabChallengeProposal[],
): { kept: KeptProposal[]; dropped: DroppedProposal[] } {
  const kept: KeptProposal[] = [];
  const dropped: DroppedProposal[] = [];
  const passageIds = new Set(snapshot.passages.map((passage) => passage.id));
  const outcomeCodes = new Set(snapshot.outcomes.map((outcome) => outcome.code));
  proposals.forEach((proposal, position) => {
    const reasons: LabDropReason[] = [];
    const range = rangeReasons(proposal.labId, proposal.challengeParams, snapshot.models);
    reasons.push(...range);
    if (proposal.sourceRefs.length === 0 || proposal.sourceRefs.some((ref) => !passageIds.has(ref))) reasons.push("GROUNDING_REF_INVALID");
    if (new Set(proposal.outcomeCodes).size !== proposal.outcomeCodes.length || proposal.outcomeCodes.some((code) => !outcomeCodes.has(code))) reasons.push("OUTCOME_INVALID");
    let flags: LabChallengeFlags | null = null;
    if (range.length === 0) {
      const context = contexts.get(proposal.labId);
      const results = context ? engineResultsFor(context, proposal.labId, proposal.challengeParams) : [];
      if (!context || results.length === 0) reasons.push("NO_REFERENCE_STATES");
      else {
        if (!results.some((result) => result.verdict === "passed")) reasons.push("CHALLENGE_UNSOLVABLE");
        if (!results.some((result) => result.verdict !== "passed")) reasons.push("CHALLENGE_NOT_DISCRIMINATING");
        flags = {
          engineResults: results,
          objectivePreview: challengeObjective(proposal.labId, proposal.challengeParams),
          engineVersion: ENGINE,
          modelRef: context.modelRef,
          referenceSource: context.referenceSource,
        };
      }
      const duplicate =
        (current.labId === proposal.labId && current.challengeParams && sameParams(current.challengeParams, proposal.challengeParams)) ||
        kept.some((other) => other.payload.labId === proposal.labId && sameParams(other.payload.challengeParams, proposal.challengeParams));
      if (duplicate) reasons.push("DUPLICATE_PROPOSAL");
    }
    const rationale = proposal.rationale.trim();
    if (rationale.length < 1 || rationale.length > MAX_RATIONALE) reasons.push("LENGTH_INVALID");
    else if (rationaleUnsafe(rationale)) reasons.push("SAFETY_REJECTED");
    if (reasons.length === 0 && kept.length >= snapshot.proposalCount) reasons.push("OVER_COUNT");
    if (reasons.length > 0 || !flags) dropped.push({ position, reasonCodes: [...new Set(reasons)] });
    else kept.push({ payload: { ...proposal, rationale }, flags });
  });
  return { kept, dropped };
}

export type ProcessedLabOutput =
  | { ok: true; items: KeptProposal[]; dropped: DroppedProposal[] }
  | { ok: false; code: "OUTPUT_SCHEMA_INVALID" | "OUTPUT_VALIDATION_FAILED"; dropped: DroppedProposal[] };

/**
 * Provider text -> validated proposals. Not JSON or not `lab-challenge-proposals@1` is OUTPUT_SCHEMA_INVALID (retried
 * once by the runner); zero kept proposals is OUTPUT_VALIDATION_FAILED (not retried). Raw text is never kept.
 */
export function processLabChallengeOutput(
  snapshot: LabChallengeSnapshotV1,
  contexts: Map<string, LabContext>,
  current: CurrentChallenge,
  text: string,
): ProcessedLabOutput {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, code: "OUTPUT_SCHEMA_INVALID", dropped: [] };
  }
  const parsed = labChallengeProposalsV1.safeParse(raw);
  if (!parsed.success) return { ok: false, code: "OUTPUT_SCHEMA_INVALID", dropped: [] };
  const { kept, dropped } = validateProposals(snapshot, contexts, current, parsed.data.proposals);
  if (kept.length === 0) return { ok: false, code: "OUTPUT_VALIDATION_FAILED", dropped };
  return { ok: true, items: kept, dropped };
}
