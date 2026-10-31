import { describe, expect, it } from "vitest";
import { rubricRefForActivity, runSubmissionSchema } from "./lab-run";
import { ECOLOGY_TOLERANCE_RUBRIC, evaluateEcologyToleranceActivity } from "./checkpoint-activities";

describe("FL-20 ecology-tolerance checkpoint activity", () => {
  const water = (valueDeciC: number) => ({ setup: "tolerance", speciesId: "ca-ro-phi", factor: "TEMPERATURE", valueDeciC });
  const checkpoints = () => [
    { id: "T_INSIDE" as const, state: water(300) as Record<string, unknown>, prediction: "PERSISTS" as unknown },
    { id: "T_ABOVE" as const, state: water(440) as Record<string, unknown>, prediction: "NOT_PERSIST" as unknown },
    { id: "LIMITS" as const, state: { setup: "tolerance-sweep", speciesId: "ca-ro-phi", factor: "TEMPERATURE" } as Record<string, unknown>, prediction: "L1" as unknown },
    { id: "IMPORT" as const, state: { setup: "import-comparison", siteId: "site-demo", factor: "TEMPERATURE" } as Record<string, unknown>, prediction: "FISH_B" as unknown },
    { id: "DENSITY" as const, state: { setup: "density", populationId: "bap-cai" } as Record<string, unknown>, prediction: { value: "4", unit: "PER_M2" } as unknown },
    { id: "AGE" as const, state: { setup: "age-structure", sampleId: "P3" } as Record<string, unknown>, prediction: "DECLINING" as unknown },
  ];
  const base = { contract: "lab-contract/1" as const, runId: "run", idempotencyKey: "ba8ccedf-ae67-460e-8b58-056146ef5a8a", stateSchemaVersion: 1 as const, evidenceSchemaVersion: 1 as const, durationMs: 10 };
  const withAnswer = (index: number, prediction: unknown) => {
    const evidence = checkpoints();
    evidence[index] = { ...evidence[index], prediction };
    return evidence;
  };

  it("passes 7/7 and returns the model observations", () => {
    const correct = evaluateEcologyToleranceActivity(checkpoints(), "A");
    expect(correct).toMatchObject({ verdict: "passed", result: { assessment: { score: 7, maximumScore: 7, passed: true, unmetCriteria: [] } } });
    expect(correct.result.observations[1].scientificObservation).toMatchObject({ zone: "ABOVE_MAX", canPersist: false });
    expect(correct.result.observations[4].scientificObservation).toMatchObject({ density: { num: 4, den: 1 }, unit: "m2" });
  });

  it.each([
    { index: 0, prediction: "NOT_PERSIST", criterion: "prediction:T_INSIDE" },
    { index: 1, prediction: "PERSISTS", criterion: "prediction:T_ABOVE" },
    { index: 2, prediction: "L2", criterion: "prediction:LIMITS" },
    { index: 3, prediction: "FISH_A", criterion: "prediction:IMPORT" },
    { index: 3, prediction: "NONE", criterion: "prediction:IMPORT" },
    { index: 4, prediction: { value: "4.01", unit: "PER_M2" }, criterion: "prediction:DENSITY" },
    { index: 4, prediction: { value: "4", unit: "PER_HA" }, criterion: "prediction:DENSITY" },
    { index: 5, prediction: "STABLE", criterion: "prediction:AGE" },
  ])("records $criterion as the single unmet criterion ($prediction)", ({ index, prediction, criterion }) => {
    expect(evaluateEcologyToleranceActivity(withAnswer(index, prediction), "A")).toMatchObject({
      verdict: "needs_practice", result: { assessment: { score: 6, passed: false, unmetCriteria: [criterion] } },
    });
  });

  it.each(["4,0", "4.000", "04"])("accepts the density written as %s", (value) => {
    expect(evaluateEcologyToleranceActivity(withAnswer(4, { value, unit: "PER_M2" }), "A").verdict).toBe("passed");
  });

  it("fails explanation B or C without invalidating the attempt", () => {
    expect(evaluateEcologyToleranceActivity(checkpoints(), "B").result.assessment.unmetCriteria).toEqual(["explanation"]);
    expect(evaluateEcologyToleranceActivity(checkpoints(), "C").verdict).toBe("needs_practice");
  });

  it("rejects a checkpoint whose state differs from the fixed step", () => {
    const warmer = checkpoints();
    warmer[1] = { ...warmer[1], state: water(430) };
    expect(() => evaluateEcologyToleranceActivity(warmer, "A")).toThrow(/checkpoint T_ABOVE/);
    const otherSample = checkpoints();
    otherSample[5] = { ...otherSample[5], state: { setup: "age-structure", sampleId: "P1" } };
    expect(() => evaluateEcologyToleranceActivity(otherSample, "A")).toThrow(/checkpoint AGE/);
    expect(() => evaluateEcologyToleranceActivity(withAnswer(4, { value: "abc", unit: "PER_M2" }), "A")).toThrow();
    expect(() => evaluateEcologyToleranceActivity(checkpoints().slice(0, 5), "A")).toThrow();
  });

  it("pins the rubric to its model and validates the run envelope", () => {
    expect(rubricRefForActivity("ecology-tolerance-checkpoints", 1, "ecology-tolerance@1.0.0")).toBe(ECOLOGY_TOLERANCE_RUBRIC);
    expect(() => rubricRefForActivity("ecology-tolerance-checkpoints", 1, "em-induction@1.0.0")).toThrow();
    expect(runSubmissionSchema.safeParse({ ...base, checkpoints: checkpoints(), explanation: "A" }).success).toBe(true);
    expect(runSubmissionSchema.safeParse({ ...base, checkpoints: [...checkpoints()].reverse(), explanation: "A" }).success).toBe(false);
    expect(runSubmissionSchema.safeParse({ ...base, checkpoints: withAnswer(0, "L1"), explanation: "A" }).success).toBe(false);
    expect(runSubmissionSchema.safeParse({ ...base, checkpoints: withAnswer(4, "PERSISTS"), explanation: "A" }).success).toBe(false);
    expect(runSubmissionSchema.safeParse({ ...base, checkpoints: withAnswer(2, { value: "4", unit: "PER_M2" }), explanation: "A" }).success).toBe(false);
    expect(runSubmissionSchema.safeParse({ ...base, checkpoints: withAnswer(4, { value: "4e3", unit: "PER_M2" }), explanation: "A" }).success).toBe(false);
  });
});
