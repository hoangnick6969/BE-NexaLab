import { resolveModel } from "../sim-packs";
import { normalizeVerdict } from "../simulation-versions";
import { eyeOpticsEvidenceSchema, EYE_OPTICS_PART_IDS, EYE_OPTICS_SCENARIOS, type EyeOpticsEvidence } from "../../../../../packages/sim/eye-optics";
import type { LabEvaluator } from "./lab-evaluator";

export const EYE_OPTICS_ACTIVITY_KEY = "eye-anatomy-optics";
export const EYE_OPTICS_RUBRIC = "eye-anatomy-optics@1.0.0";
export const EYE_OPTICS_MODEL = "eye-optics@1.0.0";
export const EYE_OPTICS_MAXIMUM_SCORE = EYE_OPTICS_PART_IDS.length + EYE_OPTICS_SCENARIOS.length;
/** Partial credit floor; 'passed' requires every criterion. */
export const EYE_OPTICS_PARTIAL_SCORE = 6;

/**
 * Pinned rubric. Phase 1 scores one criterion per eye part; phase 2 scores one
 * criterion per optical scenario (in focus, right distance, right glasses sign,
 * and relaxed lens for a distant object). The model observes; this rubric scores.
 */
export function evaluateEyeOpticsActivity(evidence: EyeOpticsEvidence) {
  const observation = resolveModel(EYE_OPTICS_MODEL).simulate(evidence) as {
    phase1: { correct: string[] };
    phase2: Array<{
      scenarioId: string;
      inFocus: boolean;
      distanceMatches: boolean;
      relaxedWhenFar: boolean;
      glassesMatchAmetropia: boolean;
      defocusD: number;
    }>;
  };
  const phase1Unmet = EYE_OPTICS_PART_IDS
    .filter((id) => !observation.phase1.correct.includes(id))
    .map((id) => `phase1:${id}`);
  const phase2Unmet = EYE_OPTICS_SCENARIOS.flatMap((scenario) => {
    const attempt = observation.phase2.find((item) => item.scenarioId === scenario.id)!;
    const reasons = [
      attempt.inFocus ? null : "focus",
      attempt.distanceMatches ? null : "distance",
      attempt.glassesMatchAmetropia ? null : "glasses",
      attempt.relaxedWhenFar ? null : "relaxedFar",
    ].filter((reason): reason is string => reason !== null);
    return reasons.length ? [`phase2:${scenario.id}:${reasons.join("+")}`] : [];
  });
  const unmetCriteria = [...phase1Unmet, ...phase2Unmet];
  const score = EYE_OPTICS_MAXIMUM_SCORE - unmetCriteria.length;
  const rawVerdict = score === EYE_OPTICS_MAXIMUM_SCORE ? "passed" : score >= EYE_OPTICS_PARTIAL_SCORE ? "partial" : "not_passed";
  return {
    result: {
      version: "1.0.0",
      observations: observation,
      assessment: {
        score,
        maximumScore: EYE_OPTICS_MAXIMUM_SCORE,
        phase1Score: EYE_OPTICS_PART_IDS.length - phase1Unmet.length,
        phase2Score: EYE_OPTICS_SCENARIOS.length - phase2Unmet.length,
        unmetCriteria,
        passed: score === EYE_OPTICS_MAXIMUM_SCORE,
      },
      verdict: rawVerdict,
    },
    verdict: normalizeVerdict(rawVerdict),
  };
}

export const eyeOpticsEvaluator: LabEvaluator<EyeOpticsEvidence> = {
  rubricRef: EYE_OPTICS_RUBRIC,
  activity: { key: EYE_OPTICS_ACTIVITY_KEY, version: 1 },
  modelRefs: [EYE_OPTICS_MODEL],
  rendererKey: EYE_OPTICS_ACTIVITY_KEY,
  envelope: "evidence",
  evidenceSchema: eyeOpticsEvidenceSchema,
  evaluate: (_labRunId, evidence) => evaluateEyeOpticsActivity(evidence),
};
