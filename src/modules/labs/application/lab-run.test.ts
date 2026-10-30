import { describe, expect, it } from "vitest";
import { CIRCUIT_BULB_RUBRIC, digest, evaluateCircuitBulbActivity, evaluateRunV1, executionSchema, rubricRefForActivity, runSubmissionSchema } from "./lab-run";
import { evaluate } from "./simulation-versions";

describe("frozen LabRun compatibility rubric", () => {
  const circuit = {
    nodes: [{ id: "b", type: "battery", value: 9 }, { id: "r", type: "resistor", value: 470 }, { id: "l", type: "led" }],
    edges: [{ source: "b", target: "r" }, { source: "r", target: "l" }, { source: "l", target: "b" }],
  };
  const cases = [
    { lab: "circuit", ref: "circuit@1.0.0", state: circuit, params: { maxCurrentMa: 10, minLitLeds: 1 } },
    { lab: "chemistry", ref: "chemistry@1.0.0", state: { reactionId: "mg-hcl", molesA: 0.1, molesB: 0.2 }, params: { reactionId: "mg-hcl" } },
    { lab: "eye", ref: "eye@1.0.0", state: { answers: {} }, params: { minScore: 100 } },
  ];
  it.each(cases)("matches the existing $lab assessment at the v1 boundary", ({ lab, ref, state, params }) => {
    expect(evaluateRunV1(lab, state, params, ref)).toEqual(evaluate(lab, state, params, ref));
    expect(evaluateRunV1(lab, state, null, ref)).toEqual(evaluate(lab, state, null, ref));
  });
  it("uses stable key ordering but distinguishes changed evidence", () => {
    expect(digest({ b: 2, a: { y: 4, x: 3 } })).toBe(digest({ a: { x: 3, y: 4 }, b: 2 }));
    expect(digest({ a: 1 })).not.toBe(digest({ a: 2 }));
  });
});

describe("versioned Circuit bulb activity", () => {
  const circuitState = (closed: boolean) => ({
    nodes: [
      { id: "battery", type: "battery" },
      { id: "bulb", type: "bulb" },
      { id: "switch", type: "switch", closed },
    ],
    edges: [
      { source: "battery", target: "bulb" },
      { source: "bulb", target: "switch" },
      { source: "switch", target: "battery" },
    ],
  });
  const checkpoints = [
    { id: "CLOSED" as const, state: circuitState(true), prediction: "ON" as const },
    { id: "OPEN" as const, state: circuitState(false), prediction: "OFF" as const },
  ];

  it("separates the valid open-circuit observation from activity assessment", () => {
    const correct = evaluateCircuitBulbActivity(checkpoints, "A");
    expect(correct.result.observations[1].scientificObservation).toMatchObject({ circuitPath: "OPEN", bulbState: "OFF" });
    expect(correct).toMatchObject({ verdict: "passed", result: { assessment: { passed: true, score: 3 } } });
    const incorrectPrediction = evaluateCircuitBulbActivity([{ ...checkpoints[0], prediction: "OFF" }, checkpoints[1]], "C");
    expect(incorrectPrediction).toMatchObject({ verdict: "needs_practice", result: { assessment: { passed: false, score: 1 } } });
  });

  it("rejects checkpoint state that does not match the requested activity step", () => {
    expect(() => evaluateCircuitBulbActivity([{ ...checkpoints[0], state: circuitState(false) }, checkpoints[1]], "A")).toThrow(/checkpoint CLOSED/);
  });

  it("pins the bulb rubric to its exact activity and model version", () => {
    expect(rubricRefForActivity("circuit-bulb-checkpoints", 1, "circuit-bulb@1.0.0")).toBe(CIRCUIT_BULB_RUBRIC);
    expect(() => rubricRefForActivity("circuit-bulb-checkpoints", 1, "circuit@1.0.0")).toThrow();
    const tuple = { modelRef: "circuit-bulb@1.0.0", engineVersion: "1.0.0", packVersionId: "p", configVersionId: "c", activityVersionId: "a", activityDigest: "d", activityKey: "circuit-bulb-checkpoints", activityVersion: 1, rubricRef: CIRCUIT_BULB_RUBRIC, params: null, stateSchemaVersion: 1, evidenceSchemaVersion: 1, template: {} };
    expect(executionSchema.safeParse(tuple).success).toBe(true);
    expect(executionSchema.safeParse({ ...tuple, rubricRef: "legacy-challenge@1.0.0" }).success).toBe(false);
  });

  it("accepts checkpoint evidence while preserving the legacy labState envelope", () => {
    const base = { contract: "lab-contract/1" as const, runId: "run", idempotencyKey: "ba8ccedf-ae67-460e-8b58-056146ef5a8a", stateSchemaVersion: 1 as const, evidenceSchemaVersion: 1 as const, durationMs: 10 };
    expect(runSubmissionSchema.safeParse({ ...base, checkpoints, explanation: "A" }).success).toBe(true);
    expect(runSubmissionSchema.safeParse({ ...base, labState: { input: 2 } }).success).toBe(true);
    expect(runSubmissionSchema.safeParse({ ...base, checkpoints: [checkpoints[0], checkpoints[0]], explanation: "A" }).success).toBe(false);
    expect(runSubmissionSchema.safeParse({ ...base, checkpoints: [...checkpoints].reverse(), explanation: "A" }).success).toBe(false);
  });
});
