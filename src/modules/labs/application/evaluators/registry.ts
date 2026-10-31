import { circuitBulbEvaluator } from "./circuit-bulb-checkpoints.evaluator";
import { z } from "zod";
import { CHECKPOINT_ACTIVITIES, EM_INDUCTION_RUBRIC } from "../checkpoint-activities";
import { densityStationsEvaluator } from "./density-stations.evaluator";
import { geneProteinStationsEvaluator } from "./gene-protein-stations.evaluator";
import { legacyChallengeEvaluator } from "./legacy-challenge.evaluator";
import type { LabEvaluation, LabEvaluator, LabRuntimeConfig } from "./lab-evaluator";

export function createLabEvaluatorRegistry(evaluators: ReadonlyArray<LabEvaluator<any>>, fallback: LabEvaluator<any> = legacyChallengeEvaluator) {
  const byRubric = new Map<string, LabEvaluator<any>>([[fallback.rubricRef, fallback]]);
  for (const evaluator of evaluators) {
    if (!evaluator.activity || !evaluator.modelRefs.length)
      throw new Error(`${evaluator.rubricRef}: a registered rubric must pin its activity and models`);
    if (byRubric.has(evaluator.rubricRef)) throw new Error(`${evaluator.rubricRef}: duplicate rubric`);
    if (evaluators.some((other) => other !== evaluator && other.activity?.key === evaluator.activity!.key && other.activity?.version === evaluator.activity!.version))
      throw new Error(`${evaluator.activity.key}@${evaluator.activity.version}: duplicate activity`);
    byRubric.set(evaluator.rubricRef, evaluator);
  }

  /** Unknown references fail closed, like model resolution. */
  function resolve(rubricRef: string) {
    const evaluator = byRubric.get(rubricRef);
    if (!evaluator) throw new Error(`Rubric ${rubricRef} không nằm trong danh sách cho phép`);
    return evaluator;
  }

  return {
    rubricRefs: [...byRubric.keys()] as readonly string[],
    isRegistered: (rubricRef: string) => byRubric.has(rubricRef),
    resolve,
    /**
     * Rubric for a pack's activity/model pair. A registered activity or model
     * must match its rubric exactly; anything else uses the legacy fallback.
     */
    rubricRefForActivity(activityKey: string, activityVersion: number, modelRef: string) {
      if (!evaluators.some((item) => item.activity!.key === activityKey || item.modelRefs.includes(modelRef)))
        return fallback.rubricRef;
      const match = evaluators.find((item) =>
        item.activity!.key === activityKey && item.activity!.version === activityVersion && item.modelRefs.includes(modelRef));
      if (!match) throw new Error(`${activityKey}@${activityVersion} and ${modelRef} are incompatible`);
      return match.rubricRef;
    },
    /** Validates learner data against the pinned rubric, then evaluates it. */
    evaluate(rubricRef: string, labRunId: string | null, studentData: unknown, config: LabRuntimeConfig): LabEvaluation {
      const evaluator = resolve(rubricRef);
      const parsed = evaluator.evidenceSchema.safeParse(studentData);
      if (!parsed.success) throw new Error("Bằng chứng không đúng định dạng của hoạt động đã ghim");
      return evaluator.evaluate(labRunId, parsed.data, config);
    },
  };
}

export type LabEvaluatorRegistry = ReturnType<typeof createLabEvaluatorRegistry>;

/** Every released activity rubric. Add new Lab evaluators here; never edit a released one. */
const inductionActivity = CHECKPOINT_ACTIVITIES.find((activity) => activity.rubricRef === EM_INDUCTION_RUBRIC)!;
const inductionEvaluator: LabEvaluator<any> = {
  rubricRef: inductionActivity.rubricRef,
  activity: { key: inductionActivity.activityKey, version: inductionActivity.activityVersion },
  modelRefs: [inductionActivity.modelRef],
  rendererKey: inductionActivity.rendererKey,
  envelope: "checkpoints",
  evidenceSchema: z.object(inductionActivity.submission).strict().superRefine(inductionActivity.refine),
  evaluate: (_labRunId, evidence) => inductionActivity.evaluate(evidence.checkpoints, evidence.explanation),
};
const fl10Evaluator: LabEvaluator<any> = {
  rubricRef: "mass-conservation-poea@1.0.0",
  activity: { key: "mass-conservation-poea", version: 1 },
  modelRefs: ["mass-conservation@1.0.0"],
  rendererKey: "mass-conservation",
  envelope: "labState",
  evidenceSchema: z.unknown(),
  evaluate: () => { throw new Error("FL-10 requires server event history"); },
};
export const labEvaluators = createLabEvaluatorRegistry([circuitBulbEvaluator, inductionEvaluator, fl10Evaluator, densityStationsEvaluator, geneProteinStationsEvaluator]);
