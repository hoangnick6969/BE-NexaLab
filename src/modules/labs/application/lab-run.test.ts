import { describe, expect, it } from "vitest";
import { CIRCUIT_BULB_RUBRIC, digest, evaluateCircuitBulbActivity, evaluateRunV1, executionSchema, rubricRefForActivity, runSubmissionSchema } from "./lab-run";
import { evaluate } from "./simulation-versions";
import { EM_INDUCTION_RUBRIC, evaluateEmInductionActivity } from "./checkpoint-activities";

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

describe("FL-25 em-induction checkpoint activity (private prototype)", () => {
  const coil = (magnetPosition: "OUTSIDE" | "INSIDE", motion: "STILL" | "TOWARD" | "AWAY") =>
    ({ setup: "magnet-coil", circuit: "CLOSED", poleFacingCoil: "N", magnetPosition, motion });
  const checkpoints = () => [
    { id: "STILL" as const, state: coil("OUTSIDE", "STILL") as Record<string, unknown>, prediction: "NO_CURRENT" },
    { id: "PUSH" as const, state: coil("INSIDE", "TOWARD") as Record<string, unknown>, prediction: "CURRENT" },
    { id: "PULL" as const, state: coil("OUTSIDE", "AWAY") as Record<string, unknown>, prediction: "OPPOSITE" },
    { id: "ROTATE" as const, state: { setup: "generator", circuit: "CLOSED", rotation: "CW", turns: 1 } as Record<string, unknown>, prediction: "ALTERNATING" },
  ];
  const base = { contract: "lab-contract/1" as const, runId: "run", idempotencyKey: "ba8ccedf-ae67-460e-8b58-056146ef5a8a", stateSchemaVersion: 1 as const, evidenceSchemaVersion: 1 as const, durationMs: 10 };

  it("passes 5/5 and keeps NO_CURRENT as a valid observation", () => {
    const correct = evaluateEmInductionActivity(checkpoints(), "A");
    expect(correct).toMatchObject({ verdict: "passed", result: { assessment: { score: 5, maximumScore: 5, passed: true, unmetCriteria: [] } } });
    expect(correct.result.observations[0].scientificObservation).toMatchObject({ inducedCurrent: "ABSENT", direction: "NONE" });
    expect(correct.result.observations[3].scientificObservation).toMatchObject({ currentKind: "ALTERNATING", reversalsPerTurn: 2 });
  });

  it.each([
    { index: 0, prediction: "CURRENT", criterion: "prediction:STILL" },
    { index: 1, prediction: "NO_CURRENT", criterion: "prediction:PUSH" },
    { index: 2, prediction: "SAME", criterion: "prediction:PULL" },
    { index: 3, prediction: "ONE_DIRECTION", criterion: "prediction:ROTATE" },
  ])("records $criterion as the single unmet criterion", ({ index, prediction, criterion }) => {
    const evidence = checkpoints();
    evidence[index] = { ...evidence[index], prediction };
    expect(evaluateEmInductionActivity(evidence, "A")).toMatchObject({
      verdict: "needs_practice", result: { assessment: { score: 4, passed: false, unmetCriteria: [criterion] } },
    });
  });

  it("fails explanation B or C without invalidating the attempt", () => {
    expect(evaluateEmInductionActivity(checkpoints(), "B").result.assessment.unmetCriteria).toEqual(["explanation"]);
    expect(evaluateEmInductionActivity(checkpoints(), "C").verdict).toBe("needs_practice");
  });

  it("rejects a checkpoint whose state differs from the fixed apparatus step", () => {
    const southPush = checkpoints();
    southPush[1] = { ...southPush[1], state: { ...southPush[1].state, poleFacingCoil: "S" } };
    expect(() => evaluateEmInductionActivity(southPush, "A")).toThrow(/checkpoint PUSH/);
    const openCircuit = checkpoints();
    openCircuit[3] = { ...openCircuit[3], state: { ...openCircuit[3].state, circuit: "OPEN" } };
    expect(() => evaluateEmInductionActivity(openCircuit, "A")).toThrow(/checkpoint ROTATE/);
    expect(() => evaluateEmInductionActivity(checkpoints().slice(0, 3), "A")).toThrow();
  });

  it("pins the induction rubric to its model and validates the run envelope", () => {
    expect(rubricRefForActivity("em-induction-checkpoints", 1, "em-induction@1.0.0")).toBe(EM_INDUCTION_RUBRIC);
    expect(() => rubricRefForActivity("em-induction-checkpoints", 1, "circuit-bulb@1.0.0")).toThrow();
    expect(() => rubricRefForActivity("em-induction-checkpoints", 2, "em-induction@1.0.0")).toThrow();
    expect(runSubmissionSchema.safeParse({ ...base, checkpoints: checkpoints(), explanation: "A" }).success).toBe(true);
    expect(runSubmissionSchema.safeParse({ ...base, checkpoints: [...checkpoints()].reverse(), explanation: "A" }).success).toBe(false);
    const wrongChoice = checkpoints();
    wrongChoice[0] = { ...wrongChoice[0], prediction: "ALTERNATING" };
    expect(runSubmissionSchema.safeParse({ ...base, checkpoints: wrongChoice, explanation: "A" }).success).toBe(false);
  });
});
