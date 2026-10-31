import { z } from "zod";
import { DENSITY_BLOCK_IDS, DENSITY_EXPLORE_IDS, DENSITY_PEBBLE_IDS } from "../../../../../packages/sim";
import { resolveModel } from "../sim-packs";
import { normalizeVerdict } from "../simulation-versions";
import type { LabEvaluator } from "./lab-evaluator";

export const DENSITY_ACTIVITY_KEY = "density-stations";
export const DENSITY_RUBRIC = "density-stations@1.0.0";
export const DENSITY_MODEL = "density-bench@1.0.0";

const EPSILON = 1e-9;
const positive = z.number().finite().positive().max(100000);
const densityUnit = z.enum(["g/cm3", "g/ml", "kg/m3"]);
export type DensityUnit = z.infer<typeof densityUnit>;
const densityEntry = z.object({ value: positive, unit: densityUnit }).strict();
const choice = z.enum(["A", "B", "C"]);

/**
 * Evidence v1: what the learner read and calculated at each textbook station
 * (KHTN 8 Bài 13 TN1–TN2, Bài 14 I–III). The server recomputes every expected
 * reading; nothing here is trusted as an observation.
 */
export const densityEvidenceSchema = z.object({
  explore: z.object({
    masses: z.array(z.object({ specimenId: z.enum(DENSITY_EXPLORE_IDS), massG: positive }).strict()).length(DENSITY_EXPLORE_IDS.length),
    conclusion: choice,
  }).strict(),
  block: z.object({
    specimenId: z.enum(DENSITY_BLOCK_IDS),
    trials: z.array(z.object({ aMm: positive, bMm: positive, cMm: positive, massG: positive }).strict()).min(1).max(3),
    density: densityEntry,
  }).strict(),
  water: z.object({
    pouredMl: z.number().int().min(10).max(90),
    volumeMl: positive,
    m1G: positive,
    m2G: positive,
    density: densityEntry,
  }).strict(),
  pebble: z.object({
    specimenId: z.enum(DENSITY_PEBBLE_IDS),
    initialMl: z.number().int().min(20).max(80),
    massG: positive,
    v1Ml: positive,
    v2Ml: positive,
    density: densityEntry,
  }).strict(),
  units: z.object({ woodKgm3: positive, irregularReason: choice }).strict(),
}).strict()
  .refine((e) => new Set(e.explore.masses.map((item) => item.specimenId)).size === DENSITY_EXPLORE_IDS.length, "Each bar must be weighed once")
  .refine((e) => e.water.m2G > e.water.m1G, "Cốc có nước phải nặng hơn cốc rỗng")
  .refine((e) => e.pebble.v2Ml > e.pebble.v1Ml, "Mực nước sau khi thả vật phải cao hơn mực nước ban đầu")
  .refine((e) => e.pebble.v2Ml <= 100, "Mực nước vượt dung tích ống đong")
  .refine((e) => JSON.stringify(e).length <= 20000, "Evidence is too large");

export type DensityEvidence = z.infer<typeof densityEvidenceSchema>;

const TO_GCM3: Record<DensityUnit, number> = { "g/cm3": 1, "g/ml": 1, "kg/m3": 0.001 };
/** Density in g/cm³ (1 g/mL = 1 g/cm³; 1 kg/m³ = 0.001 g/cm³). */
export const densityToGcm3 = (entry: { value: number; unit: DensityUnit }) => entry.value * TO_GCM3[entry.unit];

const mean = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;
const round = (value: number, places = 4) => Number(value.toFixed(places));
const within = (reading: number, expected: number, tolerance: number) => Math.abs(reading - expected) <= tolerance + EPSILON;

export const DENSITY_CRITERIA = ["balance", "ruler", "cylinder", "calculation", "unitConversion", "concept"] as const;
export type DensityCriterion = (typeof DENSITY_CRITERIA)[number];

export function evaluateDensityStations(evidence: DensityEvidence) {
  const truth = resolveModel(DENSITY_MODEL).simulate({
    blockId: evidence.block.specimenId,
    pebbleId: evidence.pebble.specimenId,
    pouredMl: evidence.water.pouredMl,
    pebbleInitialMl: evidence.pebble.initialMl,
  });
  const { instruments, tolerances } = truth;
  const massTol = tolerances.readingDivisions * instruments.balance.resolutionG;
  const lengthTol = tolerances.readingDivisions * instruments.ruler.resolutionMm;
  const volumeTol = tolerances.readingDivisions * instruments.cylinder.resolutionMl;
  const unmet: string[] = [];
  const check = (criterion: DensityCriterion, station: string, ok: boolean) => { if (!ok) unmet.push(`${criterion}:${station}`); };

  // R1 balance readings
  const exploreOk = truth.explore.every((expected: any) => {
    const reading = evidence.explore.masses.find((item) => item.specimenId === expected.specimenId)!;
    return within(reading.massG, expected.massG, massTol);
  });
  check("balance", "explore", exploreOk);
  check("balance", "block", evidence.block.trials.every((trial) => within(trial.massG, truth.block.massG, massTol)));
  check("balance", "water", within(evidence.water.m1G, truth.water.cupMassG, massTol) && within(evidence.water.m2G, truth.water.cupPlusWaterG, massTol));
  check("balance", "pebble", within(evidence.pebble.massG, truth.pebble.massG, massTol));

  // R2 ruler readings: each edge, in any order
  const expectedEdges = [...truth.block.edgesMm].sort((a: number, b: number) => a - b);
  check("ruler", "block", evidence.block.trials.every((trial) => {
    const edges = [trial.aMm, trial.bMm, trial.cMm].sort((a, b) => a - b);
    return edges.every((edge, index) => within(edge, expectedEdges[index], lengthTol));
  }));

  // R3 graduated-cylinder readings
  check("cylinder", "water", within(evidence.water.volumeMl, truth.water.pouredMl, volumeTol));
  check("cylinder", "pebble", within(evidence.pebble.v1Ml, truth.pebble.v1Ml, volumeTol) && within(evidence.pebble.v2Ml, truth.pebble.v2Ml, volumeTol));

  // R4 calculation consistent with the learner's own readings, by the textbook method
  const calculationOk = (own: number, entry: { value: number; unit: DensityUnit }) => {
    const given = densityToGcm3(entry);
    return within(given, own, Math.max(tolerances.relativeCalculation * own, tolerances.absoluteCalculationGcm3));
  };
  const blockVolumes = evidence.block.trials.map((trial) => (trial.aMm * trial.bMm * trial.cMm) / 1000);
  const ownBlock = mean(evidence.block.trials.map((trial) => trial.massG)) / mean(blockVolumes);
  const ownWater = (evidence.water.m2G - evidence.water.m1G) / evidence.water.volumeMl;
  const ownPebble = evidence.pebble.massG / (evidence.pebble.v2Ml - evidence.pebble.v1Ml);
  check("calculation", "block", calculationOk(ownBlock, evidence.block.density));
  check("calculation", "water", calculationOk(ownWater, evidence.water.density));
  check("calculation", "pebble", calculationOk(ownPebble, evidence.pebble.density));

  // R5 unit conversion of the wood density the learner measured (own m/V, so a misread
  // or a wrong density unit is not penalised again here)
  const woodKgm3 = ownBlock * 1000;
  check("unitConversion", "block", within(evidence.units.woodKgm3, woodKgm3, Math.max(tolerances.relativeCalculation * woodKgm3, tolerances.absoluteCalculationGcm3 * 1000)));

  // R6 concepts (answer A is the reviewed correct statement for both questions)
  check("concept", "explore", evidence.explore.conclusion === "A");
  check("concept", "irregular", evidence.units.irregularReason === "A");

  const criteria = Object.fromEntries(DENSITY_CRITERIA.map((criterion) => [criterion, !unmet.some((item) => item.startsWith(`${criterion}:`))])) as Record<DensityCriterion, boolean>;
  const score = DENSITY_CRITERIA.filter((criterion) => criteria[criterion]).length;
  const passed = score === DENSITY_CRITERIA.length;
  const feedback = (own: number, expected: { densityGcm3: number; referenceGcm3: number }) => ({
    ownDensityGcm3: round(own),
    referenceDensityGcm3: expected.referenceGcm3,
    withinReferenceBand: Math.abs(own - expected.referenceGcm3) <= tolerances.referenceBand * expected.referenceGcm3 + EPSILON,
  });
  const rawVerdict = passed ? "passed" : "not_passed";
  return {
    result: {
      version: "1.0.0",
      // Feedback only: no expected readings are returned, so a retry cannot copy them.
      observations: {
        block: feedback(ownBlock, truth.block),
        water: feedback(ownWater, truth.water),
        pebble: feedback(ownPebble, truth.pebble),
      },
      assessment: { score, maximumScore: DENSITY_CRITERIA.length, criteria, unmetCriteria: unmet, passed },
      verdict: rawVerdict,
    },
    verdict: normalizeVerdict(rawVerdict),
  };
}

export const densityStationsEvaluator: LabEvaluator<DensityEvidence> = {
  rubricRef: DENSITY_RUBRIC,
  activity: { key: DENSITY_ACTIVITY_KEY, version: 1 },
  modelRefs: [DENSITY_MODEL],
  rendererKey: "density-bench",
  envelope: "evidence",
  evidenceSchema: densityEvidenceSchema,
  evaluate: (_labRunId, evidence) => evaluateDensityStations(evidence),
};
