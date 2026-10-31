import { z } from "zod";
import { resolveModel } from "./sim-packs";
import { normalizeVerdict } from "./simulation-versions";

/**
 * Pinned checkpoint activities. Each entry binds one activity version to one
 * observation-only model, its rubric and FE renderer key. Model observations
 * and learning assessment stay separate; a new rubric is a new entry.
 */
export type CheckpointActivity = {
  activityKey: string;
  activityVersion: number;
  modelRef: string;
  rubricRef: string;
  rendererKey: string;
  /** Checkpoint evidence fields added to the run submission envelope. */
  submission: z.ZodRawShape;
  refine: (evidence: any, ctx: z.RefinementCtx) => void;
  evaluate: (checkpoints: unknown[], explanation: string) => { result: any; verdict: string };
};

const boundedState = z.unknown().refine((v) => v !== undefined && JSON.stringify(v).length <= 20000);
const limitEvidenceSize = (evidence: any, ctx: z.RefinementCtx) => {
  if (JSON.stringify({ checkpoints: evidence.checkpoints, explanation: evidence.explanation }).length > 20000)
    ctx.addIssue({ code: "custom", message: "Evidence is too large" });
};

function assessment(observations: Array<{ id: string; predictionCorrect: boolean }>, explanationCorrect: boolean) {
  const unmetCriteria = [
    ...observations.filter((checkpoint) => !checkpoint.predictionCorrect).map((checkpoint) => `prediction:${checkpoint.id}`),
    ...(explanationCorrect ? [] : ["explanation"]),
  ];
  const maximumScore = observations.length + 1;
  const score = maximumScore - unmetCriteria.length;
  const rawVerdict = score === maximumScore ? "passed" : "not_passed";
  return {
    result: { version: "1.0.0", observations, assessment: { score, maximumScore, unmetCriteria, passed: score === maximumScore }, verdict: rawVerdict },
    verdict: normalizeVerdict(rawVerdict),
  };
}

// Circuit bulb (FL-01 pilot)
export const CIRCUIT_BULB_ACTIVITY_KEY = "circuit-bulb-checkpoints";
export const CIRCUIT_BULB_RUBRIC = "circuit-bulb-checkpoints@1.0.0";

/** Pinned Circuit bulb activity; model observations and learning rubric stay separate. */
export function evaluateCircuitBulbActivity(checkpoints: Array<{ id: "CLOSED" | "OPEN"; state: unknown; prediction: "ON" | "OFF" }>, explanation: string) {
  const byId = new Map(checkpoints.map((checkpoint) => [checkpoint.id, checkpoint]));
  const evaluated = (["CLOSED", "OPEN"] as const).map((id) => {
    const checkpoint = byId.get(id);
    if (!checkpoint) throw new Error("Both Circuit checkpoints are required");
    const observation = resolveModel("circuit-bulb@1.0.0").simulate(checkpoint.state);
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
  return assessment(evaluated, explanation === "A");
}

const circuitBulbActivity: CheckpointActivity = {
  activityKey: CIRCUIT_BULB_ACTIVITY_KEY,
  activityVersion: 1,
  modelRef: "circuit-bulb@1.0.0",
  rubricRef: CIRCUIT_BULB_RUBRIC,
  rendererKey: "circuit-bulb",
  submission: {
    checkpoints: z.array(z.object({ id: z.enum(["CLOSED", "OPEN"]), state: boundedState, prediction: z.enum(["ON", "OFF"]) }).strict()).length(2),
    explanation: z.enum(["A", "B", "C"]),
  },
  refine: (evidence, ctx) => {
    if (evidence.checkpoints[0].id !== "CLOSED" || evidence.checkpoints[1].id !== "OPEN")
      ctx.addIssue({ code: "custom", message: "Circuit checkpoints must be ordered CLOSED then OPEN" });
    limitEvidenceSize(evidence, ctx);
  },
  evaluate: (checkpoints, explanation) => evaluateCircuitBulbActivity(checkpoints as any, explanation),
};

// FL-25 em-induction (private engineering prototype; see spec-fl-25-em-induction)
export const EM_INDUCTION_ACTIVITY_KEY = "em-induction-checkpoints";
export const EM_INDUCTION_RUBRIC = "em-induction-checkpoints@1.0.0";
const EM_CHECKPOINTS = ["STILL", "PUSH", "PULL", "ROTATE"] as const;
type EmCheckpointId = (typeof EM_CHECKPOINTS)[number];
const EM_PREDICTIONS: Record<EmCheckpointId, readonly string[]> = {
  STILL: ["CURRENT", "NO_CURRENT"],
  PUSH: ["CURRENT", "NO_CURRENT"],
  PULL: ["SAME", "OPPOSITE", "NONE"],
  ROTATE: ["ONE_DIRECTION", "ALTERNATING", "NONE"],
};
/** The fixed apparatus state each checkpoint must submit. */
const EM_REQUIRED_STATE: Record<EmCheckpointId, Record<string, unknown>> = {
  STILL: { setup: "magnet-coil", circuit: "CLOSED", poleFacingCoil: "N", magnetPosition: "OUTSIDE", motion: "STILL" },
  PUSH: { setup: "magnet-coil", circuit: "CLOSED", poleFacingCoil: "N", magnetPosition: "INSIDE", motion: "TOWARD" },
  PULL: { setup: "magnet-coil", circuit: "CLOSED", poleFacingCoil: "N", magnetPosition: "OUTSIDE", motion: "AWAY" },
  ROTATE: { setup: "generator", circuit: "CLOSED", rotation: "CW", turns: 1 },
};

export function evaluateEmInductionActivity(checkpoints: Array<{ id: EmCheckpointId; state: unknown; prediction: string }>, explanation: string) {
  const byId = new Map(checkpoints.map((checkpoint) => [checkpoint.id, checkpoint]));
  const observed = EM_CHECKPOINTS.map((id) => {
    const checkpoint = byId.get(id);
    if (!checkpoint) throw new Error("All four induction checkpoints are required");
    const required = EM_REQUIRED_STATE[id];
    const state = checkpoint.state as Record<string, unknown> | null;
    if (!state || typeof state !== "object" || Object.keys(state).length !== Object.keys(required).length ||
        Object.entries(required).some(([key, value]) => state[key] !== value))
      throw new Error(`Trạng thái thí nghiệm không khớp checkpoint ${id}`);
    return { id, checkpoint, observation: resolveModel("em-induction@1.0.0").simulate(state) };
  });
  const push = observed[1].observation;
  const expected = (id: EmCheckpointId, observation: any): string => {
    if (id === "PULL")
      return observation.direction === "NONE" ? "NONE" : observation.direction === push.direction ? "SAME" : "OPPOSITE";
    if (id === "ROTATE")
      return observation.currentKind === "ALTERNATING" ? "ALTERNATING" : observation.inducedCurrent === "PRESENT" ? "ONE_DIRECTION" : "NONE";
    return observation.inducedCurrent === "PRESENT" ? "CURRENT" : "NO_CURRENT";
  };
  const evaluated = observed.map(({ id, checkpoint, observation }) => ({
    id,
    scientificObservation: observation,
    prediction: checkpoint.prediction,
    predictionCorrect: checkpoint.prediction === expected(id, observation),
  }));
  return assessment(evaluated, explanation === "A");
}

const emInductionActivity: CheckpointActivity = {
  activityKey: EM_INDUCTION_ACTIVITY_KEY,
  activityVersion: 1,
  modelRef: "em-induction@1.0.0",
  rubricRef: EM_INDUCTION_RUBRIC,
  rendererKey: "em-induction",
  submission: {
    checkpoints: z.array(z.object({
      id: z.enum(EM_CHECKPOINTS),
      state: boundedState,
      prediction: z.enum(["CURRENT", "NO_CURRENT", "SAME", "OPPOSITE", "NONE", "ONE_DIRECTION", "ALTERNATING"]),
    }).strict()).length(4),
    explanation: z.enum(["A", "B", "C"]),
  },
  refine: (evidence, ctx) => {
    evidence.checkpoints.forEach((checkpoint: { id: EmCheckpointId; prediction: string }, index: number) => {
      if (checkpoint.id !== EM_CHECKPOINTS[index])
        ctx.addIssue({ code: "custom", message: "Induction checkpoints must be ordered STILL, PUSH, PULL, ROTATE" });
      else if (!EM_PREDICTIONS[checkpoint.id].includes(checkpoint.prediction))
        ctx.addIssue({ code: "custom", message: `Prediction is not a choice of checkpoint ${checkpoint.id}` });
    });
    limitEvidenceSize(evidence, ctx);
  },
  evaluate: (checkpoints, explanation) => evaluateEmInductionActivity(checkpoints as any, explanation),
};

export const CHECKPOINT_ACTIVITIES: readonly CheckpointActivity[] = [circuitBulbActivity, emInductionActivity];
export const LEGACY_RUBRIC = "legacy-challenge@1.0.0";
export const RUBRIC_REFS = [LEGACY_RUBRIC, ...CHECKPOINT_ACTIVITIES.map((activity) => activity.rubricRef)] as [string, ...string[]];
export const checkpointActivityForRubric = (rubricRef: string) => CHECKPOINT_ACTIVITIES.find((activity) => activity.rubricRef === rubricRef) ?? null;
export const checkpointActivityForModel = (modelRef: string) => CHECKPOINT_ACTIVITIES.find((activity) => activity.modelRef === modelRef) ?? null;
