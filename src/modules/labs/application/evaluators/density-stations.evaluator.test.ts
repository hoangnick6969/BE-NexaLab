import { describe, expect, it } from "vitest";
import { DENSITY_SPECIMENS, densityBench } from "../../../../../packages/sim";
import { DENSITY_RUBRIC, densityEvidenceSchema, densityToGcm3, evaluateDensityStations, type DensityEvidence } from "./density-stations.evaluator";
import { labEvaluators } from "./registry";
import { executionSchema, runSubmissionSchema, submittedEvidence } from "../lab-run";

/** A learner who reads every instrument correctly and follows the textbook method. */
const perfect = (): DensityEvidence => ({
  explore: {
    masses: ["iron-1v", "iron-2v", "iron-3v", "aluminium-1v", "copper-1v"].map((specimenId) => ({ specimenId: specimenId as any, massG: DENSITY_SPECIMENS[specimenId as keyof typeof DENSITY_SPECIMENS].massG })),
    conclusion: "A",
  },
  block: { specimenId: "wood-block-a", trials: [{ aMm: 100, bMm: 60, cMm: 40, massG: 144 }], density: { value: 0.6, unit: "g/cm3" } },
  water: { pouredMl: 50, volumeMl: 50, m1G: 48.6, m2G: 98.6, density: { value: 1, unit: "g/ml" } },
  pebble: { specimenId: "pebble-a", initialMl: 50, massG: 31.2, v1Ml: 50, v2Ml: 62, density: { value: 2.6, unit: "g/cm3" } },
  units: { woodKgm3: 600, irregularReason: "A" },
});
const evaluate = (change: (e: DensityEvidence) => void) => {
  const evidence = perfect();
  change(evidence);
  return evaluateDensityStations(densityEvidenceSchema.parse(evidence));
};
const unmet = (change: (e: DensityEvidence) => void) => evaluate(change).result.assessment.unmetCriteria;

describe("FL-03 density model (observation only)", () => {
  const state = { blockId: "wood-block-a", pebbleId: "pebble-a", pouredMl: 50, pebbleInitialMl: 50 };

  it("G1 textbook cast-iron block: 2 × 3 × 5 cm, 210 g is 7 g/cm³ = 7000 kg/m³", () => {
    const { massG, sizeMm } = DENSITY_SPECIMENS["cast-iron-block"];
    const volumeCm3 = (sizeMm[0] * sizeMm[1] * sizeMm[2]) / 1000;
    expect(volumeCm3).toBe(30);
    expect(massG / volumeCm3).toBe(7);
    expect(densityToGcm3({ value: 7000, unit: "kg/m3" })).toBe(7);
  });

  it("G2–G5 report the readings a correct learner takes", () => {
    const truth = densityBench(state);
    expect(truth.block).toMatchObject({ volumeCm3: 240, massG: 144, densityGcm3: 0.6 });
    expect(truth.water).toMatchObject({ cupPlusWaterG: 98.6, waterMassG: 50, densityGcm3: 1 });
    expect(truth.pebble).toMatchObject({ volumeCm3: 12, v2Ml: 62, densityGcm3: 2.6 });
    expect(truth.explore.map((item) => item.massG)).toEqual([78, 156, 234, 27, 89]);
    expect(truth.explore.slice(0, 3).map((item) => item.densityGcm3)).toEqual([7.8, 7.8, 7.8]);
  });

  it("G6 unit conversions", () => {
    expect(densityToGcm3({ value: 7800, unit: "kg/m3" })).toBeCloseTo(7.8, 12);
    expect(densityToGcm3({ value: 1, unit: "g/ml" })).toBe(1);
  });

  it("keeps every specimen mass consistent with its reference density", () => {
    for (const specimen of Object.values(DENSITY_SPECIMENS)) {
      const volume = specimen.shape === "box" ? (specimen.sizeMm[0] * specimen.sizeMm[1] * specimen.sizeMm[2]) / 1000 : specimen.volumeMl;
      expect(Math.abs(specimen.massG / volume - specimen.referenceGcm3) / specimen.referenceGcm3).toBeLessThan(0.005);
    }
  });

  it("rejects unknown specimens and out-of-range set-ups", () => {
    expect(() => densityBench({ ...state, blockId: "iron-1v" })).toThrow();
    expect(() => densityBench({ ...state, pouredMl: 95 })).toThrow();
    expect(() => densityBench({ ...state, pebbleInitialMl: 81 })).toThrow();
    expect(() => densityBench({ ...state, extra: 1 })).toThrow();
  });

  it("keeps the displaced level inside the cylinder for every allowed set-up", () => {
    for (const pebbleId of ["pebble-a", "pebble-b"]) {
      expect(densityBench({ ...state, pebbleId, pebbleInitialMl: 80 }).pebble.v2Ml).toBeLessThanOrEqual(100);
    }
  });
});

describe("FL-03 density-stations rubric", () => {
  it("passes a learner who reads and calculates correctly at every station", () => {
    const { result, verdict } = evaluate(() => undefined);
    expect(verdict).toBe("passed");
    expect(result.assessment).toMatchObject({ score: 6, maximumScore: 6, passed: true, unmetCriteria: [] });
    expect(result.observations.block).toMatchObject({ ownDensityGcm3: 0.6, withinReferenceBand: true });
  });

  it("accepts readings one division off and rejects two divisions off (B1)", () => {
    // Each learner calculates from their own readings, so only the reading criterion can fail.
    expect(evaluate((e) => {
      e.block.trials[0].aMm = 101; e.block.density = { value: 144 / 242.4, unit: "g/cm3" }; e.units.woodKgm3 = (144 / 242.4) * 1000;
      e.water.volumeMl = 51; e.water.density = { value: 50 / 51, unit: "g/ml" };
      e.explore.masses[0].massG = 78.1;
      e.pebble.v2Ml = 63; e.pebble.density = { value: 31.2 / 13, unit: "g/cm3" };
    }).verdict).toBe("passed");
    expect(unmet((e) => { e.block.trials[0].aMm = 102; e.block.density = { value: 144 / 244.8, unit: "g/cm3" }; e.units.woodKgm3 = (144 / 244.8) * 1000; })).toEqual(["ruler:block"]);
    expect(unmet((e) => { e.explore.masses[1].massG = 156.2; })).toEqual(["balance:explore"]);
    expect(unmet((e) => { e.water.volumeMl = 53; e.water.density = { value: 50 / 53, unit: "g/ml" }; })).toEqual(["cylinder:water"]);
  });

  it("accepts the edges in any order and averages up to three trials", () => {
    expect(evaluate((e) => { e.block.trials = [{ aMm: 40, bMm: 100, cMm: 60, massG: 144 }, { aMm: 60, bMm: 40, cMm: 100, massG: 144 }, { aMm: 100, bMm: 60, cMm: 40, massG: 144 }]; }).verdict).toBe("passed");
  });

  it("judges the calculation against the learner's own readings, not twice for one misreading (B2)", () => {
    // 0.9 % off passes, 1.5 % off does not.
    expect(evaluate((e) => { e.pebble.density = { value: 2.6 * 1.009, unit: "g/cm3" }; }).verdict).toBe("passed");
    expect(unmet((e) => { e.pebble.density = { value: 2.6 * 1.015, unit: "g/cm3" }; })).toEqual(["calculation:pebble"]);
    // Misread volume, but a density that matches the learner's own m/V: only the reading is wrong.
    expect(unmet((e) => { e.pebble.v2Ml = 64; e.pebble.density = { value: 31.2 / 14, unit: "g/cm3" }; })).toEqual(["cylinder:pebble"]);
    // Using V2 instead of V2 − V1 contradicts the textbook method.
    expect(unmet((e) => { e.pebble.density = { value: 31.2 / 62, unit: "g/cm3" }; })).toEqual(["calculation:pebble"]);
  });

  it("evaluates the same density in any supported unit and flags a unit mix-up", () => {
    expect(evaluate((e) => { e.block.density = { value: 600, unit: "kg/m3" }; }).verdict).toBe("passed");
    // A wrong density unit is one mistake: calculation only, not the conversion as well.
    expect(unmet((e) => { e.block.density = { value: 0.6, unit: "kg/m3" }; })).toEqual(["calculation:block"]);
    expect(unmet((e) => { e.units.woodKgm3 = 0.6; })).toEqual(["unitConversion:block"]);
  });

  it("scores the textbook concepts separately", () => {
    expect(unmet((e) => { e.explore.conclusion = "B"; })).toEqual(["concept:explore"]);
    const wrong = evaluate((e) => { e.units.irregularReason = "C"; e.explore.conclusion = "C"; });
    expect(wrong.verdict).toBe("needs_practice");
    expect(wrong.result.assessment).toMatchObject({ score: 5, passed: false, unmetCriteria: ["concept:explore", "concept:irregular"] });
  });

  it("returns feedback without revealing the expected readings", () => {
    const { result } = evaluate((e) => { e.water.volumeMl = 51; });
    expect(JSON.stringify(result)).not.toContain("98.6");
    expect(Object.keys(result.observations.water).sort()).toEqual(["ownDensityGcm3", "referenceDensityGcm3", "withinReferenceBand"]);
  });

  it("is deterministic for replay", () => {
    expect(evaluate(() => undefined)).toEqual(evaluate(() => undefined));
  });
});

describe("FL-03 evidence validation (no attempt is created)", () => {
  const parse = (change: (e: any) => void) => {
    const evidence: any = perfect();
    change(evidence);
    return densityEvidenceSchema.safeParse(evidence).success;
  };

  it("I1 rejects impossible readings", () => {
    expect(parse(() => undefined)).toBe(true);
    expect(parse((e) => { e.pebble.v2Ml = 50; })).toBe(false);
    expect(parse((e) => { e.pebble.v2Ml = 40; })).toBe(false);
    expect(parse((e) => { e.water.m2G = 48.6; })).toBe(false);
    expect(parse((e) => { e.water.m1G = -1; })).toBe(false);
    expect(parse((e) => { e.block.trials[0].massG = Number.NaN; })).toBe(false);
    expect(parse((e) => { e.block.trials[0].massG = Number.POSITIVE_INFINITY; })).toBe(false);
    expect(parse((e) => { e.block.trials[0].aMm = 0; })).toBe(false);
  });

  it("I2 rejects unknown specimens and wrong explore sets", () => {
    expect(parse((e) => { e.block.specimenId = "cast-iron-block"; })).toBe(false);
    expect(parse((e) => { e.pebble.specimenId = "pebble-z"; })).toBe(false);
    expect(parse((e) => { e.explore.masses[4].specimenId = "iron-1v"; })).toBe(false);
    expect(parse((e) => { e.explore.masses.pop(); })).toBe(false);
  });

  it("I3 rejects missing stations, unsupported units, extra fields and too many trials", () => {
    expect(parse((e) => { delete e.pebble; })).toBe(false);
    expect(parse((e) => { e.block.density.unit = "lb/ft3"; })).toBe(false);
    expect(parse((e) => { e.extra = 1; })).toBe(false);
    expect(parse((e) => { e.block.trials = Array(4).fill(e.block.trials[0]); })).toBe(false);
    expect(parse((e) => { e.block.trials = []; })).toBe(false);
  });

});

describe("FL-03 through the shared runtime", () => {
  const base = { contract: "lab-contract/1" as const, runId: "run", idempotencyKey: "ba8ccedf-ae67-460e-8b58-056146ef5a8a", stateSchemaVersion: 1 as const, evidenceSchemaVersion: 1 as const, durationMs: 10 };
  const config = { labId: "density", modelRef: "density-bench@1.0.0", engineVersion: "1.0.0", params: null, template: null };

  it("pins the rubric to its exact activity and model", () => {
    expect(labEvaluators.rubricRefForActivity("density-stations", 1, "density-bench@1.0.0")).toBe(DENSITY_RUBRIC);
    expect(() => labEvaluators.rubricRefForActivity("density-stations", 2, "density-bench@1.0.0")).toThrow();
    expect(() => labEvaluators.rubricRefForActivity("density-stations", 1, "circuit-bulb@1.0.0")).toThrow();
    expect(labEvaluators.resolve(DENSITY_RUBRIC).rendererKey).toBe("density-bench");
    const tuple = { modelRef: "density-bench@1.0.0", engineVersion: "1.0.0", packVersionId: "p", configVersionId: "c", activityVersionId: "a", activityDigest: "d", activityKey: "density-stations", activityVersion: 1, rubricRef: DENSITY_RUBRIC, params: null, stateSchemaVersion: 1, evidenceSchemaVersion: 1, template: {} };
    expect(executionSchema.safeParse(tuple).success).toBe(true);
    expect(executionSchema.safeParse({ ...tuple, rubricRef: "legacy-challenge@1.0.0" }).success).toBe(false);
  });

  it("accepts the evidence envelope and evaluates it by the pinned rubric", () => {
    const parsed = runSubmissionSchema.parse({ ...base, evidence: perfect() });
    const submitted = submittedEvidence(parsed);
    expect(submitted.envelope).toBe("evidence");
    expect(labEvaluators.evaluate(DENSITY_RUBRIC, "run", submitted.data, config)).toMatchObject({ verdict: "passed" });
    expect(() => labEvaluators.evaluate(DENSITY_RUBRIC, "run", { labState: 1 }, config)).toThrow(/định dạng/);
  });
});
