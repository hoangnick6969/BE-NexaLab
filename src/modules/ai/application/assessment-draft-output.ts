import { z } from "zod";
import { normalizeExam } from "../../classes/application/exam-contract";
import {
  allocatePoints,
  buildSlots,
  COGNITIVE_LEVELS,
  fitRubric,
  levelTargets,
  type CognitiveLevel,
  type NormalizedAssessmentRequest,
  type RubricCriterion,
} from "./assessment-blueprint";
import type { AssessmentSnapshotV1 } from "./generate-assessment-prompt";
import { buildPassages, selectOutcomes, type LessonSource } from "./input-snapshot";
import { jaccard, NEAR_DUPLICATE_THRESHOLD, normalizeText, trigrams, type QuestionItem } from "./resource-items";
import { contentFlags, isUnsafeText, structuralDropReasons, type DropReason } from "./validate-items";

/** `assessment-items@1`: the strict schema fixes structure and types only; rules below drop single slots (like VR-01..). */
const mcqOut = z.object({ slot: z.number().int(), prompt: z.string(), options: z.array(z.string()), correctOption: z.number(), explanation: z.string(), sourceRefs: z.array(z.string()) }).strict();
const criterionOut = z
  .object({ code: z.string(), description: z.string(), maxPoints: z.number(), anchors: z.array(z.object({ points: z.number(), description: z.string() }).strict()) })
  .strict();
const writtenOut = z
  .object({ slot: z.number().int(), prompt: z.string(), maxChars: z.number(), referenceAnswer: z.string(), criteria: z.array(criterionOut), sourceRefs: z.array(z.string()) })
  .strict();
const labOut = z.object({ prompt: z.string(), sourceRefs: z.array(z.string()) }).strict();
export const assessmentItemsV1 = z.object({ mcq: z.array(mcqOut), written: z.array(writtenOut), lab: labOut.nullable() }).strict();

export type AssessmentDropReason = DropReason | "SLOT_MISSING" | "RUBRIC_INVALID";
export type AssessmentDropped = { position: number; reasonCodes: AssessmentDropReason[] };
export type AssessmentWarning = "SLOTS_DROPPED" | "MATRIX_DRIFT" | "RUBRIC_RESCALED" | "LAB_PROMPT_FALLBACK" | "BATCH_DUPLICATE" | "NUMERIC_REVIEW" | "ANSWER_LENGTH_CUE" | "NEGATIVE_STEM";

const WARNING_ORDER: AssessmentWarning[] = ["SLOTS_DROPPED", "MATRIX_DRIFT", "RUBRIC_RESCALED", "LAB_PROMPT_FALLBACK", "BATCH_DUPLICATE", "NUMERIC_REVIEW", "ANSWER_LENGTH_CUE", "NEGATIVE_STEM"];

export type AssessmentLab = { labId: string; releaseId: string; challengeId: string; labTitle: string; objective: string };

/** Builds the stored input snapshot: lesson passages and outcomes (as TAI-01), the server blueprint and the picked Lab. */
export function buildAssessmentSnapshot(lesson: LessonSource, statements: Map<string, string>, request: NormalizedAssessmentRequest, lab: AssessmentLab | null): AssessmentSnapshotV1 {
  const slots = buildSlots(request.sections, request.matrix);
  const mcq = slots.filter((s) => s.kind === "MCQ");
  const written = slots.filter((s) => s.kind === "WRITTEN");
  const points = allocatePoints({ mcq: mcq.length, written: written.length, lab: !!lab })!;
  return {
    lesson: { id: lesson.id, title: lesson.title, grade: lesson.grade, domain: lesson.domain, topic: lesson.topic, learningObjective: lesson.learningObjective },
    passages: buildPassages(lesson),
    outcomes: selectOutcomes(lesson, null, statements),
    assessmentType: request.assessmentType,
    matrix: request.matrix,
    blueprint: {
      mcq: mcq.map((s) => ({ slot: s.index, cognitiveLevel: s.cognitiveLevel })),
      written: written.map((s) => {
        const budgetPoints = points.writtenUnits[s.index]! / 100;
        return { slot: s.index, cognitiveLevel: s.cognitiveLevel, budgetPoints, maxCriteria: Math.max(1, Math.min(3, Math.floor(budgetPoints))) };
      }),
      lab: lab ? { cognitiveLevel: "APPLY", labTitle: lab.labTitle, objective: lab.objective } : null,
    },
    lab: lab ?? null,
    instruction: request.instruction,
  };
}

export type AssessmentDraftPayload = {
  /** Exactly the input of `normalizeExam` / the EXAM editor: it already passed that gate (10,00 points, ≥ 2 sections). */
  content: {
    questions: Array<{ prompt: string; options: string[]; correctOption: number; explanation: string; points: number; cognitiveLevel: CognitiveLevel }>;
    prompts: Array<{ prompt: string; maxChars: number; referenceAnswer?: string; criteria: RubricCriterion[]; points: number; cognitiveLevel: CognitiveLevel }>;
    labs: Array<{ labId: string; releaseId: string; challengeId: string; prompt: string; points: number; cognitiveLevel: "APPLY" }>;
  };
  review: {
    matrix: { requested: Record<CognitiveLevel, number>; target: Record<CognitiveLevel, number>; actual: Record<CognitiveLevel, number> };
    totals: { points: number; mcq: number; written: number; lab: number };
    items: Array<{ section: "MCQ" | "WRITTEN" | "LAB"; index: number; cognitiveLevel: CognitiveLevel; points: number; sourceRefs: string[]; flags: AssessmentWarning[] }>;
  };
};

export type ProcessedAssessment =
  | { ok: true; payload: AssessmentDraftPayload; flags: AssessmentWarning[]; dropped: AssessmentDropped[]; validCount: number }
  | { ok: false; code: "OUTPUT_SCHEMA_INVALID" | "OUTPUT_VALIDATION_FAILED"; dropped: AssessmentDropped[] };

const clean = (text: string) => text.trim().normalize("NFC");
const groundingOk = (refs: string[], passageIds: Set<string>) => refs.length > 0 && refs.every((ref) => passageIds.has(ref));
const emptyCounts = (): Record<CognitiveLevel, number> => ({ RECALL: 0, UNDERSTAND: 0, APPLY: 0 });

/**
 * Provider text -> a paper that `normalizeExam` accepts (TAI7-T5). Not JSON, or not `assessment-items@1`, is
 * OUTPUT_SCHEMA_INVALID (retried once by the runner). Each slot is then checked on its own and dropped with reason codes
 * (VR-02..VR-05, VR-08 for multiple choice, grounding for MCQ and written, rubric validity for written); a missing Lab prompt
 * falls back to the challenge objective because the teacher chose that Lab. Points and levels always come from the blueprint:
 * survivors are re-allocated to exactly 10,00 and every rubric is fitted to its question's budget, so a total that is off
 * is corrected (and flagged), never stored. Fewer than two surviving sections, or a paper `normalizeExam` rejects, is
 * OUTPUT_VALIDATION_FAILED (not retried). Raw text is never kept.
 */
export function processGenerateAssessmentOutput(snapshot: AssessmentSnapshotV1, text: string): ProcessedAssessment {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, code: "OUTPUT_SCHEMA_INVALID", dropped: [] };
  }
  const parsed = assessmentItemsV1.safeParse(raw);
  if (!parsed.success) return { ok: false, code: "OUTPUT_SCHEMA_INVALID", dropped: [] };
  const out = parsed.data;
  const passageIds = new Set(snapshot.passages.map((p) => p.id));
  const bp = snapshot.blueprint;
  const dropped: AssessmentDropped[] = [];
  const drop = (position: number, ...reasonCodes: AssessmentDropReason[]) => dropped.push({ position, reasonCodes });
  const warnings = new Map<string, Set<AssessmentWarning>>(); // key "MCQ:0"
  const warn = (key: string, flag: AssessmentWarning) => (warnings.get(key) ?? warnings.set(key, new Set()).get(key)!).add(flag);

  // ---- multiple choice (position = slot) ----
  const mcqKept: Array<{ slot: number; level: CognitiveLevel; item: QuestionItem; sourceRefs: string[] }> = [];
  for (const cell of bp.mcq) {
    const item = out.mcq.find((entry) => entry.slot === cell.slot);
    if (!item) { drop(cell.slot, "SLOT_MISSING"); continue; }
    const question: QuestionItem = {
      type: "SINGLE_CHOICE", prompt: clean(item.prompt), options: item.options.map(clean), correctOption: item.correctOption,
      explanation: clean(item.explanation), difficulty: "STANDARD", outcomeCodes: [], sourceRefs: item.sourceRefs,
    };
    const reasons = new Set<AssessmentDropReason>(structuralDropReasons(question));
    if (!groundingOk(item.sourceRefs, passageIds)) reasons.add("GROUNDING_REF_INVALID");
    if (reasons.size) { drop(cell.slot, ...reasons); continue; }
    mcqKept.push({ slot: cell.slot, level: cell.cognitiveLevel, item: question, sourceRefs: item.sourceRefs });
    for (const flag of contentFlags(question, null)) if (flag === "NUMERIC_REVIEW" || flag === "ANSWER_LENGTH_CUE" || flag === "NEGATIVE_STEM") warn(`MCQ:${cell.slot}`, flag);
  }
  // Batch duplicates among the surviving questions: a warning only.
  const keys = mcqKept.map((q) => normalizeText(q.item.prompt));
  const grams = keys.map(trigrams);
  mcqKept.forEach((q, i) => {
    for (let other = 0; other < i; other++) if (keys[other] === keys[i] || jaccard(grams[i]!, grams[other]!) >= NEAR_DUPLICATE_THRESHOLD) warn(`MCQ:${q.slot}`, "BATCH_DUPLICATE");
  });

  // ---- written (position = mcq count + slot) ----
  type WrittenKept = { slot: number; level: CognitiveLevel; prompt: string; maxChars: number; referenceAnswer: string; criteria: RubricCriterion[]; sourceRefs: string[]; maxCriteria: number };
  const writtenKept: WrittenKept[] = [];
  for (const cell of bp.written) {
    const position = bp.mcq.length + cell.slot;
    const item = out.written.find((entry) => entry.slot === cell.slot);
    if (!item) { drop(position, "SLOT_MISSING"); continue; }
    const reasons = new Set<AssessmentDropReason>();
    const prompt = clean(item.prompt);
    const referenceAnswer = clean(item.referenceAnswer).slice(0, 2000);
    if (prompt.length < 1 || prompt.length > 2000) reasons.add("LENGTH_INVALID");
    if (!groundingOk(item.sourceRefs, passageIds)) reasons.add("GROUNDING_REF_INVALID");
    const criteria: RubricCriterion[] = item.criteria.map((c) => ({
      code: c.code, description: clean(c.description).slice(0, 500), maxPoints: c.maxPoints,
      anchors: c.anchors.map((a) => ({ points: a.points, description: clean(a.description).slice(0, 300) })).filter((a) => a.description.length > 0 && Number.isFinite(a.points)),
    }));
    if (criteria.length === 0 || criteria.some((c) => c.description.length < 1)) reasons.add("RUBRIC_INVALID");
    const texts = [prompt, referenceAnswer, ...criteria.flatMap((c) => [c.description, ...c.anchors.map((a) => a.description)])];
    if (texts.some(isUnsafeText)) reasons.add("SAFETY_REJECTED");
    if (reasons.size) { drop(position, ...reasons); continue; }
    // Criteria without usable anchors get neutral defaults; the rubric is fitted to the budget below.
    for (const c of criteria) if (c.anchors.length < 2) c.anchors = [{ points: 0, description: "Chưa đạt yêu cầu" }, { points: Math.max(c.maxPoints, 1), description: "Đạt đầy đủ yêu cầu" }];
    const maxChars = Number.isFinite(item.maxChars) ? Math.min(5000, Math.max(100, Math.round(item.maxChars))) : 1000;
    writtenKept.push({ slot: cell.slot, level: cell.cognitiveLevel, prompt, maxChars, referenceAnswer, criteria, sourceRefs: item.sourceRefs, maxCriteria: cell.maxCriteria });
  }

  // ---- Lab (position = mcq + written) ----
  let labKept: null | { prompt: string; sourceRefs: string[]; fallback: boolean } = null;
  if (bp.lab && snapshot.lab) {
    const prompt = out.lab ? clean(out.lab.prompt) : "";
    const usable = prompt.length >= 1 && prompt.length <= 2000 && !isUnsafeText(prompt);
    labKept = { prompt: usable ? prompt : snapshot.lab.objective.trim().slice(0, 2000), sourceRefs: usable ? out.lab!.sourceRefs : [], fallback: !usable };
  }

  // ---- survivors -> points ----
  const allocation = allocatePoints({ mcq: mcqKept.length, written: writtenKept.length, lab: !!labKept });
  if (!allocation) return { ok: false, code: "OUTPUT_VALIDATION_FAILED", dropped };
  const questions = mcqKept.map((q, i) => ({
    prompt: q.item.prompt, options: q.item.options, correctOption: q.item.correctOption, explanation: q.item.explanation,
    points: allocation.mcqUnits[i]! / 100, cognitiveLevel: q.level,
  }));
  const prompts: AssessmentDraftPayload["content"]["prompts"] = [];
  for (const [i, w] of writtenKept.entries()) {
    const fit = fitRubric(w.criteria, allocation.writtenUnits[i]!, w.maxCriteria);
    if (!fit) return { ok: false, code: "OUTPUT_VALIDATION_FAILED", dropped };
    if (fit.changed) warn(`WRITTEN:${w.slot}`, "RUBRIC_RESCALED");
    prompts.push({
      prompt: w.prompt, maxChars: w.maxChars, ...(w.referenceAnswer ? { referenceAnswer: w.referenceAnswer } : {}),
      criteria: fit.criteria, points: allocation.writtenUnits[i]! / 100, cognitiveLevel: w.level,
    });
  }
  const labs: AssessmentDraftPayload["content"]["labs"] = labKept && snapshot.lab
    ? [{ labId: snapshot.lab.labId, releaseId: snapshot.lab.releaseId, challengeId: snapshot.lab.challengeId, prompt: labKept.prompt, points: allocation.labUnits / 100, cognitiveLevel: "APPLY" }]
    : [];
  if (labKept?.fallback) warn("LAB:0", "LAB_PROMPT_FALLBACK");

  // ---- final gate: the exact contract of the EXAM resource (≥ 2 sections, exactly 10 points, rubric = question points) ----
  const content = { questions, prompts, labs };
  try {
    normalizeExam(content);
  } catch {
    return { ok: false, code: "OUTPUT_VALIDATION_FAILED", dropped };
  }

  // ---- review block ----
  const target = levelTargets(snapshot.matrix, bp.mcq.length + bp.written.length + (bp.lab ? 1 : 0));
  const actual = emptyCounts();
  for (const level of [...questions, ...prompts, ...labs].map((item) => item.cognitiveLevel)) actual[level]++;
  const slotsDropped = dropped.length > 0;
  const drift = COGNITIVE_LEVELS.some((level) => Math.abs(actual[level] - (target[level] ?? 0)) > 1);
  const flagsOf = (key: string) => WARNING_ORDER.filter((flag) => warnings.get(key)?.has(flag));
  const items: AssessmentDraftPayload["review"]["items"] = [
    ...mcqKept.map((q, i) => ({ section: "MCQ" as const, index: i, cognitiveLevel: q.level, points: questions[i]!.points, sourceRefs: q.sourceRefs, flags: flagsOf(`MCQ:${q.slot}`) })),
    ...writtenKept.map((w, i) => ({ section: "WRITTEN" as const, index: i, cognitiveLevel: w.level, points: prompts[i]!.points, sourceRefs: w.sourceRefs, flags: flagsOf(`WRITTEN:${w.slot}`) })),
    ...(labKept ? [{ section: "LAB" as const, index: 0, cognitiveLevel: "APPLY" as const, points: labs[0]!.points, sourceRefs: labKept.sourceRefs, flags: flagsOf("LAB:0") }] : []),
  ];
  const flags = WARNING_ORDER.filter((flag) => (flag === "SLOTS_DROPPED" ? slotsDropped : flag === "MATRIX_DRIFT" ? drift : items.some((item) => item.flags.includes(flag))));
  const sum = (list: Array<{ points: number }>) => Math.round(list.reduce((a, b) => a + Math.round(b.points * 100), 0)) / 100;
  return {
    ok: true,
    payload: {
      content,
      review: {
        matrix: { requested: snapshot.matrix, target, actual },
        totals: { points: sum([...questions, ...prompts, ...labs]), mcq: sum(questions), written: sum(prompts), lab: sum(labs) },
        items,
      },
    },
    flags,
    dropped,
    validCount: questions.length + prompts.length + labs.length,
  };
}
