import { describe, expect, it } from "vitest";
import { rubricRefForActivity, runSubmissionSchema } from "./lab-run";
import { FOOD_WEB_RUBRIC, evaluateFoodWebActivity } from "./checkpoint-activities";

describe("FL-21 food-web checkpoint activity", () => {
  const checkpoints = () => [
    { id: "ROLES" as const, state: { setup: "roles", webId: "W1" } as Record<string, unknown>, prediction: { co: "PRODUCER", ech: "CONSUMER", "nam-vi-khuan": "DECOMPOSER" } as unknown },
    { id: "CHAIN" as const, state: { setup: "chain", webId: "W1", nodes: ["co", "chau-chau", "ech", "ran"] } as Record<string, unknown>, prediction: "CHAIN" as unknown },
    { id: "ENERGY" as const, state: { setup: "energy", webId: "W1", chain: ["co", "chau-chau", "ech", "ran"] } as Record<string, unknown>, prediction: { value: "10" } as unknown },
    { id: "HUNT" as const, state: { setup: "remove", webId: "W1", speciesId: "ran" } as Record<string, unknown>, prediction: "INCREASE" as unknown },
    { id: "DEFOREST" as const, state: { setup: "remove", webId: "W1", speciesId: "cay-xanh" } as Record<string, unknown>, prediction: "DECREASE" as unknown },
    { id: "CAUSES" as const, state: { setup: "causes", webId: "W1" } as Record<string, unknown>, prediction: ["khai-thac", "o-nhiem", "pha-rung", "san-bat"] as unknown },
  ];
  const base = { contract: "lab-contract/1" as const, runId: "run", idempotencyKey: "ba8ccedf-ae67-460e-8b58-056146ef5a8a", stateSchemaVersion: 1 as const, evidenceSchemaVersion: 1 as const, durationMs: 10 };
  const change = (index: number, patch: Record<string, unknown>) => {
    const evidence = checkpoints();
    evidence[index] = { ...evidence[index], ...patch } as any;
    return evidence;
  };
  const chainOf = (...nodes: string[]) => ({ state: { setup: "chain", webId: "W1", nodes } });

  it("passes 7/7 and returns the model observations", () => {
    const result = evaluateFoodWebActivity(checkpoints(), "A");
    expect(result).toMatchObject({ verdict: "passed", result: { assessment: { score: 7, maximumScore: 7, passed: true, unmetCriteria: [] } } });
    expect(result.result.observations[2].scientificObservation).toMatchObject({ levelsKJ: [10000, 1000, 100, 10] });
    expect(result.result.observations[3].scientificObservation).toMatchObject({ removed: "ran", brokenChains: 4 });
  });

  it.each([
    { index: 0, patch: { prediction: { co: "PRODUCER", ech: "CONSUMER", "nam-vi-khuan": "CONSUMER" } }, criterion: "prediction:ROLES" },
    { index: 1, patch: chainOf("co", "tho", "cao"), criterion: "prediction:CHAIN" },
    { index: 1, patch: chainOf("co", "ech", "ran", "dai-bang"), criterion: "prediction:CHAIN" },
    { index: 1, patch: chainOf("chau-chau", "ech", "ran", "dai-bang"), criterion: "prediction:CHAIN" },
    { index: 2, patch: { prediction: { value: "100" } }, criterion: "prediction:ENERGY" },
    { index: 3, patch: { prediction: "DECREASE" }, criterion: "prediction:HUNT" },
    { index: 4, patch: { prediction: "NO_DIRECT_EFFECT" }, criterion: "prediction:DEFOREST" },
    { index: 5, patch: { prediction: ["khai-thac", "o-nhiem", "pha-rung", "san-bat", "trong-rung"] }, criterion: "prediction:CAUSES" },
    { index: 5, patch: { prediction: ["o-nhiem", "pha-rung", "san-bat"] }, criterion: "prediction:CAUSES" },
  ])("records $criterion as the single unmet criterion", ({ index, patch, criterion }) => {
    expect(evaluateFoodWebActivity(change(index, patch), "A")).toMatchObject({
      verdict: "needs_practice", result: { assessment: { score: 6, passed: false, unmetCriteria: [criterion] } },
    });
  });

  it("accepts any valid learner chain of four or more links from a producer", () => {
    expect(evaluateFoodWebActivity(change(1, chainOf("cay-xanh", "sau", "chim-sau", "ran", "dai-bang")), "A").verdict).toBe("passed");
    expect(evaluateFoodWebActivity(change(2, { prediction: { value: "10,0" } }), "A").verdict).toBe("passed");
  });

  it("accepts stored states whose keys were reordered (JSONB)", () => {
    expect(evaluateFoodWebActivity(change(2, { state: { webId: "W1", chain: ["co", "chau-chau", "ech", "ran"], setup: "energy" } }), "A").verdict).toBe("passed");
  });

  it("fails explanation B or C without invalidating the attempt", () => {
    expect(evaluateFoodWebActivity(checkpoints(), "B").result.assessment.unmetCriteria).toEqual(["explanation"]);
  });

  it("rejects fixed checkpoints whose state differs, and malformed chains", () => {
    expect(() => evaluateFoodWebActivity(change(3, { state: { setup: "remove", webId: "W1", speciesId: "dai-bang" } }), "A")).toThrow(/checkpoint HUNT/);
    expect(() => evaluateFoodWebActivity(change(1, chainOf("co", "lua", "ech", "ran")), "A")).toThrow();
    expect(() => evaluateFoodWebActivity(change(1, chainOf("co", "chau-chau", "co", "ran")), "A")).toThrow();
    expect(() => evaluateFoodWebActivity(checkpoints().slice(0, 5), "A")).toThrow();
  });

  it("pins the rubric to its model and validates the run envelope", () => {
    expect(rubricRefForActivity("food-web-checkpoints", 1, "food-web@1.0.0")).toBe(FOOD_WEB_RUBRIC);
    expect(() => rubricRefForActivity("food-web-checkpoints", 1, "ecology-tolerance@1.0.0")).toThrow();
    expect(runSubmissionSchema.safeParse({ ...base, checkpoints: checkpoints(), explanation: "A" }).success).toBe(true);
    expect(runSubmissionSchema.safeParse({ ...base, checkpoints: [...checkpoints()].reverse(), explanation: "A" }).success).toBe(false);
    expect(runSubmissionSchema.safeParse({ ...base, checkpoints: change(5, { prediction: ["san-bat", "pha-rung"] }), explanation: "A" }).success).toBe(false);
    expect(runSubmissionSchema.safeParse({ ...base, checkpoints: change(3, { prediction: "MAYBE" }), explanation: "A" }).success).toBe(false);
    expect(runSubmissionSchema.safeParse({ ...base, checkpoints: change(1, { prediction: "DONE" }), explanation: "A" }).success).toBe(false);
  });
});
