import { z } from "zod";
import { resolveModel } from "../sim-packs";
import { normalizeVerdict } from "../simulation-versions";
import { boundedState } from "./legacy-challenge.evaluator";
import type { LabEvaluator } from "./lab-evaluator";

export const CIRCUIT_BULB_ACTIVITY_KEY = "circuit-bulb-checkpoints";
export const CIRCUIT_BULB_RUBRIC = "circuit-bulb-checkpoints@1.0.0";
export const CIRCUIT_BULB_MODEL = "circuit-bulb@1.0.0";

export const circuitCheckpointSchema = z.object({
  id: z.enum(["CLOSED", "OPEN"]),
  state: boundedState,
  prediction: z.enum(["ON", "OFF"]),
}).strict();

/** Fields of the `checkpoints` submission envelope. */
export const circuitBulbEvidenceShape = {
  checkpoints: z.array(circuitCheckpointSchema).length(2),
  explanation: z.enum(["A", "B", "C"]),
};
export const circuitCheckpointOrder = (evidence: { checkpoints: Array<{ id: string }> }) =>
  evidence.checkpoints[0].id === "CLOSED" && evidence.checkpoints[1].id === "OPEN";

export const circuitBulbEvidenceSchema = z.object(circuitBulbEvidenceShape).strict()
  .refine(circuitCheckpointOrder, "Circuit checkpoints must be ordered CLOSED then OPEN")
  .refine((evidence) => JSON.stringify(evidence).length <= 20000, "Evidence is too large");

export type CircuitBulbEvidence = z.infer<typeof circuitBulbEvidenceSchema>;

/** Pinned Circuit bulb activity; model observations and learning rubric stay separate. */
export function evaluateCircuitBulbActivity(checkpoints: Array<{ id: "CLOSED" | "OPEN"; state?: unknown; prediction: "ON" | "OFF" }>, explanation: string) {
  const byId = new Map(checkpoints.map((checkpoint) => [checkpoint.id, checkpoint]));
  const evaluated = (["CLOSED", "OPEN"] as const).map((id) => {
    const checkpoint = byId.get(id);
    if (!checkpoint) throw new Error("Both Circuit checkpoints are required");
    const observation = resolveModel(CIRCUIT_BULB_MODEL).simulate(checkpoint.state);
    const expectedCircuitPath = id === "CLOSED" ? "CLOSED" : "OPEN";
    if (observation.circuitPath !== expectedCircuitPath)
      throw new Error(`Trạng thái mạch không khớp checkpoint ${id}`);
    return {
      id,
      scientificObservation: observation,
      prediction: checkpoint.prediction,
      predictionCorrect: checkpoint.prediction === observation.bulbState,
    };
  });
  const unmetCriteria = [
    ...evaluated.filter((checkpoint) => !checkpoint.predictionCorrect).map((checkpoint) => `prediction:${checkpoint.id}`),
    ...(explanation === "A" ? [] : ["explanation"]),
  ];
  const score = 3 - unmetCriteria.length;
  const rawVerdict = score === 3 ? "passed" : "not_passed";
  return {
    result: {
      version: "1.0.0",
      observations: evaluated,
      assessment: { score, maximumScore: 3, unmetCriteria, passed: score === 3 },
      verdict: rawVerdict,
    },
    verdict: normalizeVerdict(rawVerdict),
  };
}

export const circuitBulbEvaluator: LabEvaluator<CircuitBulbEvidence> = {
  rubricRef: CIRCUIT_BULB_RUBRIC,
  activity: { key: CIRCUIT_BULB_ACTIVITY_KEY, version: 1 },
  modelRefs: [CIRCUIT_BULB_MODEL],
  rendererKey: "circuit-bulb",
  envelope: "checkpoints",
  evidenceSchema: circuitBulbEvidenceSchema,
  evaluate: (_labRunId, evidence) => evaluateCircuitBulbActivity(evidence.checkpoints, evidence.explanation),
};
