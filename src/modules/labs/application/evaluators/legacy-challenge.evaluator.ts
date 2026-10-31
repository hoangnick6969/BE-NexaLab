import { z } from "zod";
import { resolveModel } from "../sim-packs";
import { normalizeVerdict } from "../simulation-versions";
import type { ChallengeParams } from "../../../lessons/application/lesson-content";
import type { LabEvaluator } from "./lab-evaluator";

export const LEGACY_CHALLENGE_RUBRIC = "legacy-challenge@1.0.0";

/** Bounded raw model state, shared by every submission envelope. */
export const boundedState = z.unknown().refine((v) => v !== undefined && JSON.stringify(v).length <= 20000);

/**
 * Frozen compatibility rubric. Its identity is recorded on LabRun; new
 * assessment behavior must use another implementation and version.
 */
export function evaluateRunV1(labId: string, state: any, params: ChallengeParams | null, modelRef: string) {
  if (modelRef === "mass-conservation@1.0.0") throw new Error("FL-10 requires its pinned activity rubric");
  let result: any = resolveModel(modelRef).simulate(state);
  if (params) {
    const unmet: string[] = [];
    let verdict = result.verdict as string;
    if (labId === "circuit") {
      const maxA = Number(params.maxCurrentMa ?? 20) / 1000;
      const branches: Array<{ current: number | null; leds: number }> = result.branches ?? [];
      const lit = branches.filter((b) => b.leds > 0 && b.current !== null && b.current >= 0.001 && b.current <= 0.02 + 1e-12);
      const litLeds = lit.reduce((sum, b) => sum + b.leds, 0);
      if (branches.some((b) => b.leds > 0 && b.current !== null && b.current > maxA + 1e-12)) unmet.push("maxCurrentMa");
      if (litLeds < Number(params.minLitLeds ?? 1)) unmet.push("minLitLeds");
      if (verdict === "passed" && unmet.length) verdict = "partial";
    } else if (labId === "chemistry") {
      if (params.experiment === "ph") {
        const samples: Array<{ type: string | null }> = result.samples ?? [];
        if (samples.length !== 3 || samples.some((sample) => sample.type == null)) verdict = "not_passed";
      } else if (params.reactionId && state?.reactionId !== params.reactionId) {
        unmet.push("reactionId");
        verdict = "not_passed";
      }
    } else if (labId === "eye") {
      const score = Number(result.score ?? 0);
      if (score >= Number(params.minScore ?? 100)) verdict = "passed";
      else {
        unmet.push("minScore");
        verdict = score > 0 ? "partial" : "not_passed";
      }
    }
    result = { ...result, verdict, challengeCheck: { params, unmet } };
  }
  return { result, verdict: normalizeVerdict(result.verdict) };
}

/** Fallback for activities without a registered rubric. */
export const legacyChallengeEvaluator: LabEvaluator<unknown> = {
  rubricRef: LEGACY_CHALLENGE_RUBRIC,
  activity: null,
  modelRefs: [],
  rendererKey: null,
  envelope: "labState",
  evidenceSchema: boundedState,
  evaluate: (_labRunId, labState, config) => evaluateRunV1(config.labId, labState, config.params, config.modelRef),
};
