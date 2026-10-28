import { describe, expect, it } from "vitest";
import { digest, evaluateRunV1 } from "./lab-run";
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