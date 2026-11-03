import { isDeepStrictEqual } from "node:util";
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

// FL-20 ecology-tolerance (see spec-fl-20-ecological-tolerance)
export const ECOLOGY_TOLERANCE_ACTIVITY_KEY = "ecology-tolerance-checkpoints";
export const ECOLOGY_TOLERANCE_RUBRIC = "ecology-tolerance-checkpoints@1.0.0";
const ECO_CHECKPOINTS = ["T_INSIDE", "T_ABOVE", "LIMITS", "IMPORT", "DENSITY", "AGE"] as const;
type EcoCheckpointId = (typeof ECO_CHECKPOINTS)[number];
const ECO_CHOICES: Record<Exclude<EcoCheckpointId, "DENSITY">, readonly string[]> = {
  T_INSIDE: ["PERSISTS", "NOT_PERSIST"],
  T_ABOVE: ["PERSISTS", "NOT_PERSIST"],
  LIMITS: ["L1", "L2", "L3", "L4"],
  IMPORT: ["FISH_A", "FISH_B", "FISH_C", "NONE"],
  AGE: ["GROWING", "STABLE", "DECLINING"],
};
/** Option ranges of the LIMITS reading, fixed in activity version 1. */
const ECO_LIMIT_OPTIONS: Record<string, { minDeciC: number; maxDeciC: number }> = {
  L1: { minDeciC: 56, maxDeciC: 420 },
  L2: { minDeciC: 0, maxDeciC: 420 },
  L3: { minDeciC: 56, maxDeciC: 300 },
  L4: { minDeciC: 300, maxDeciC: 440 },
};
const ECO_DENSITY_UNITS: Record<string, string> = { ha: "PER_HA", m2: "PER_M2", m3: "PER_M3" };
const ECO_REQUIRED_STATE: Record<EcoCheckpointId, Record<string, unknown>> = {
  T_INSIDE: { setup: "tolerance", speciesId: "ca-ro-phi", factor: "TEMPERATURE", valueDeciC: 300 },
  T_ABOVE: { setup: "tolerance", speciesId: "ca-ro-phi", factor: "TEMPERATURE", valueDeciC: 440 },
  LIMITS: { setup: "tolerance-sweep", speciesId: "ca-ro-phi", factor: "TEMPERATURE" },
  IMPORT: { setup: "import-comparison", siteId: "site-demo", factor: "TEMPERATURE" },
  DENSITY: { setup: "density", populationId: "bap-cai" },
  AGE: { setup: "age-structure", sampleId: "P3" },
};
const densityAnswer = z.object({ value: z.string().regex(/^\d{1,9}([.,]\d{1,3})?$/), unit: z.enum(["PER_HA", "PER_M2", "PER_M3"]) }).strict();
type DensityAnswer = z.infer<typeof densityAnswer>;

/** "4,0" → 40/10; exact decimal as a fraction so the comparison never uses floats. */
const decimalFraction = (value: string) => {
  const [whole, decimals = ""] = value.replace(",", ".").split(".");
  return { num: Number(whole + decimals), den: 10 ** decimals.length };
};

export function evaluateEcologyToleranceActivity(checkpoints: Array<{ id: EcoCheckpointId; state: unknown; prediction: unknown }>, explanation: string) {
  const byId = new Map(checkpoints.map((checkpoint) => [checkpoint.id, checkpoint]));
  const model = resolveModel("ecology-tolerance@1.0.0");
  const expectedChoice = (id: EcoCheckpointId, observation: any): string | null => {
    if (id === "T_INSIDE" || id === "T_ABOVE") return observation.canPersist ? "PERSISTS" : "NOT_PERSIST";
    if (id === "LIMITS")
      return Object.entries(ECO_LIMIT_OPTIONS).find(([, range]) =>
        range.minDeciC === observation.limits.minDeciC && range.maxDeciC === observation.limits.maxDeciC)?.[0] ?? null;
    if (id === "IMPORT") {
      const suitable = observation.candidates.filter((candidate: any) => candidate.suitable);
      if (suitable.length > 1) throw new Error("Dữ liệu so sánh có nhiều hơn một loài phù hợp");
      return suitable.length ? suitable[0].speciesId.replace("fish-", "FISH_").toUpperCase() : "NONE";
    }
    return observation.pyramid;
  };
  const evaluated = ECO_CHECKPOINTS.map((id) => {
    const checkpoint = byId.get(id);
    if (!checkpoint) throw new Error("All six ecology checkpoints are required");
    const required = ECO_REQUIRED_STATE[id];
    const state = checkpoint.state as Record<string, unknown> | null;
    if (!state || typeof state !== "object" || Object.keys(state).length !== Object.keys(required).length ||
        Object.entries(required).some(([key, value]) => state[key] !== value))
      throw new Error(`Trạng thái thí nghiệm không khớp checkpoint ${id}`);
    const observation = model.simulate(state);
    let predictionCorrect: boolean;
    if (id === "DENSITY") {
      const answer = densityAnswer.parse(checkpoint.prediction) as DensityAnswer;
      const given = decimalFraction(answer.value);
      predictionCorrect = answer.unit === ECO_DENSITY_UNITS[observation.unit] &&
        given.num * observation.density.den === observation.density.num * given.den;
    } else predictionCorrect = checkpoint.prediction === expectedChoice(id, observation);
    return { id, scientificObservation: observation, prediction: checkpoint.prediction, predictionCorrect };
  });
  return assessment(evaluated, explanation === "A");
}

const ecologyToleranceActivity: CheckpointActivity = {
  activityKey: ECOLOGY_TOLERANCE_ACTIVITY_KEY,
  activityVersion: 1,
  modelRef: "ecology-tolerance@1.0.0",
  rubricRef: ECOLOGY_TOLERANCE_RUBRIC,
  rendererKey: "ecology-tolerance",
  submission: {
    checkpoints: z.array(z.object({
      id: z.enum(ECO_CHECKPOINTS),
      state: boundedState,
      prediction: z.union([z.enum(["PERSISTS", "NOT_PERSIST", "L1", "L2", "L3", "L4", "FISH_A", "FISH_B", "FISH_C", "NONE", "GROWING", "STABLE", "DECLINING"]), densityAnswer]),
    }).strict()).length(6),
    explanation: z.enum(["A", "B", "C"]),
  },
  refine: (evidence, ctx) => {
    evidence.checkpoints.forEach((checkpoint: { id: EcoCheckpointId; prediction: unknown }, index: number) => {
      if (checkpoint.id !== ECO_CHECKPOINTS[index])
        ctx.addIssue({ code: "custom", message: "Ecology checkpoints must be ordered T_INSIDE, T_ABOVE, LIMITS, IMPORT, DENSITY, AGE" });
      else if (checkpoint.id === "DENSITY" ? typeof checkpoint.prediction !== "object" : !ECO_CHOICES[checkpoint.id].includes(checkpoint.prediction as string))
        ctx.addIssue({ code: "custom", message: `Prediction is not a choice of checkpoint ${checkpoint.id}` });
    });
    limitEvidenceSize(evidence, ctx);
  },
  evaluate: (checkpoints, explanation) => evaluateEcologyToleranceActivity(checkpoints as any, explanation),
};

// FL-21 food-web (see spec-fl-21-food-web)
export const FOOD_WEB_ACTIVITY_KEY = "food-web-checkpoints";
export const FOOD_WEB_RUBRIC = "food-web-checkpoints@1.0.0";
const FOOD_WEB_MODEL = "food-web@1.0.0";
const FW_CHECKPOINTS = ["ROLES", "CHAIN", "ENERGY", "HUNT", "DEFOREST", "CAUSES"] as const;
type FwCheckpointId = (typeof FW_CHECKPOINTS)[number];
/** Fixed state per checkpoint; CHAIN is learner-built and only schema-checked. */
const FW_REQUIRED_STATE: Record<Exclude<FwCheckpointId, "CHAIN">, Record<string, unknown>> = {
  ROLES: { setup: "roles", webId: "W1" },
  ENERGY: { setup: "energy", webId: "W1", chain: ["co", "chau-chau", "ech", "ran"] },
  HUNT: { setup: "remove", webId: "W1", speciesId: "ran" },
  DEFOREST: { setup: "remove", webId: "W1", speciesId: "cay-xanh" },
  CAUSES: { setup: "causes", webId: "W1" },
};
/** The species each removal question asks about. */
const FW_ASKED: Record<"HUNT" | "DEFOREST", string> = { HUNT: "ech", DEFOREST: "sau" };
const FW_ROLE_ITEMS = ["co", "ech", "nam-vi-khuan"] as const;
const FW_CAUSE_IDS = ["bao-ton", "khai-thac", "o-nhiem", "pha-rung", "san-bat", "trong-rung"] as const;
const fwRole = z.enum(["PRODUCER", "CONSUMER", "DECOMPOSER"]);
const fwEffect = z.enum(["INCREASE", "DECREASE", "NO_DIRECT_EFFECT"]);
const fwPrediction = {
  ROLES: z.object({ co: fwRole, ech: fwRole, "nam-vi-khuan": fwRole }).strict(),
  CHAIN: z.literal("CHAIN"),
  ENERGY: z.object({ value: z.string().regex(/^\d{1,9}([.,]\d{1,3})?$/) }).strict(),
  HUNT: fwEffect,
  DEFOREST: fwEffect,
  CAUSES: z.array(z.enum(FW_CAUSE_IDS)).max(FW_CAUSE_IDS.length)
    .refine((ids) => ids.every((id, i) => i === 0 || ids[i - 1] < id), "Causes must be sorted and distinct"),
} satisfies Record<FwCheckpointId, z.ZodTypeAny>;

export function evaluateFoodWebActivity(checkpoints: Array<{ id: FwCheckpointId; state: unknown; prediction: unknown }>, explanation: string) {
  const byId = new Map(checkpoints.map((checkpoint) => [checkpoint.id, checkpoint]));
  const model = resolveModel(FOOD_WEB_MODEL);
  const evaluated = FW_CHECKPOINTS.map((id) => {
    const checkpoint = byId.get(id);
    if (!checkpoint) throw new Error("All six food-web checkpoints are required");
    // Deep equality ignores object key order, which stored JSONB does not keep.
    if (id !== "CHAIN" && !isDeepStrictEqual(checkpoint.state, FW_REQUIRED_STATE[id]))
      throw new Error(`Trạng thái thí nghiệm không khớp checkpoint ${id}`);
    const observation = model.simulate(checkpoint.state);
    const answer = fwPrediction[id].parse(checkpoint.prediction) as any;
    let predictionCorrect: boolean;
    if (id === "ROLES") predictionCorrect = FW_ROLE_ITEMS.every((item) => answer[item] === observation.roles[item]);
    else if (id === "CHAIN") predictionCorrect = observation.valid && observation.startsWithProducer && observation.length >= 4;
    else if (id === "ENERGY") {
      const given = decimalFraction(answer.value);
      predictionCorrect = given.num === observation.levelsKJ[observation.levelsKJ.length - 1] * given.den;
    } else if (id === "HUNT" || id === "DEFOREST") predictionCorrect = answer === observation.effects[FW_ASKED[id]].effect;
    else {
      const expected = Object.entries(observation.causes).filter(([, cause]: any) => cause.disturbs).map(([cause]) => cause).sort();
      predictionCorrect = JSON.stringify(answer) === JSON.stringify(expected);
    }
    return { id, scientificObservation: observation, prediction: checkpoint.prediction, predictionCorrect };
  });
  return assessment(evaluated, explanation === "A");
}

const foodWebActivity: CheckpointActivity = {
  activityKey: FOOD_WEB_ACTIVITY_KEY,
  activityVersion: 1,
  modelRef: FOOD_WEB_MODEL,
  rubricRef: FOOD_WEB_RUBRIC,
  rendererKey: "food-web",
  submission: {
    checkpoints: z.array(z.object({ id: z.enum(FW_CHECKPOINTS), state: boundedState, prediction: z.unknown() }).strict()).length(6),
    explanation: z.enum(["A", "B", "C"]),
  },
  refine: (evidence, ctx) => {
    evidence.checkpoints.forEach((checkpoint: { id: FwCheckpointId; prediction: unknown }, index: number) => {
      if (checkpoint.id !== FW_CHECKPOINTS[index])
        ctx.addIssue({ code: "custom", message: "Food-web checkpoints must be ordered ROLES, CHAIN, ENERGY, HUNT, DEFOREST, CAUSES" });
      else if (!fwPrediction[checkpoint.id].safeParse(checkpoint.prediction).success)
        ctx.addIssue({ code: "custom", message: `Prediction is not a choice of checkpoint ${checkpoint.id}` });
    });
    limitEvidenceSize(evidence, ctx);
  },
  evaluate: (checkpoints, explanation) => evaluateFoodWebActivity(checkpoints as any, explanation),
};

export const CHECKPOINT_ACTIVITIES: readonly CheckpointActivity[] = [circuitBulbActivity, emInductionActivity, ecologyToleranceActivity, foodWebActivity];
export const LEGACY_RUBRIC = "legacy-challenge@1.0.0";
export const RUBRIC_REFS = [LEGACY_RUBRIC, ...CHECKPOINT_ACTIVITIES.map((activity) => activity.rubricRef)] as [string, ...string[]];
export const checkpointActivityForRubric = (rubricRef: string) => CHECKPOINT_ACTIVITIES.find((activity) => activity.rubricRef === rubricRef) ?? null;
export const checkpointActivityForModel = (modelRef: string) => CHECKPOINT_ACTIVITIES.find((activity) => activity.modelRef === modelRef) ?? null;
