import { describe, expect, it } from "vitest";
import { evaluateDepthProbe, evaluatePistons, FL04_PRESSURE_EXPLORE_CONFIG as config } from "./index";

const probe = config.depthProbe!;
const pistons = config.pistons!;
const levels = config.display.deformationLevels;
const at = (depthMm: number, positionMm = 0) => evaluateDepthProbe(probe, levels, { depthMm, positionMm });

describe("fluid-pressure@1.0.0 golden (spec §3.3)", () => {
  it("G-01 at the surface every membrane is flat", () => {
    expect(at(0)).toEqual({ ok: true, membranes: { A: { depthMm: 0, pascals: 0, level: 0 }, B: { depthMm: 0, pascals: 0, level: 0 }, C: { depthMm: 0, pascals: 0, level: 0 } } });
  });
  it("G-02 at 100 mm: C 1000 Pa level 2, A and B 700 Pa level 2", () => {
    expect(at(100)).toEqual({ ok: true, membranes: { A: { depthMm: 70, pascals: 700, level: 2 }, B: { depthMm: 70, pascals: 700, level: 2 }, C: { depthMm: 100, pascals: 1000, level: 2 } } });
  });
  it("G-03 the same depth gives the same result at every position", () => {
    for (const position of probe.positionsMm) expect(at(100, position)).toEqual(at(100));
  });
  it("G-04 at 250 mm every membrane is at the top level", () => {
    const result = at(250);
    expect(result.ok && result.membranes.C).toEqual({ depthMm: 250, pascals: 2500, level: 5 });
    expect(result.ok && result.membranes.A).toEqual({ depthMm: 220, pascals: 2200, level: 5 });
  });
  it("G-05 at 20 mm only the bottom membrane is under water", () => {
    const result = at(20);
    expect(result.ok && result.membranes.C).toEqual({ depthMm: 20, pascals: 200, level: 1 });
    expect(result.ok && result.membranes.A.level).toBe(0);
  });
  it("deeper always deforms at least as much (P to Q)", () => {
    let previous = -1;
    for (let depth = 0; depth <= probe.maxDepthMm; depth += probe.depthStepMm) {
      const result = at(depth);
      if (!result.ok) throw new Error(result.code);
      expect(result.membranes.C.level).toBeGreaterThanOrEqual(previous);
      expect(result.membranes.A).toEqual(result.membranes.B);
      previous = result.membranes.C.level;
    }
  });

  it.each([
    ["G-06", 4, 2, "balanced"],
    ["G-07", 2, 1, "balanced"],
    ["G-08", 4, 1, "piston1_down"],
    ["G-09", 1, 1, "piston2_down"],
    ["G-10", 0, 0, "balanced"],
  ] as const)("%s pan (1) %i, pan (2) %i: %s", (_id, pan1, pan2, outcome) => {
    const result = evaluatePistons(pistons, { pan1, pan2 });
    expect(result.ok && result.outcome).toBe(outcome);
  });
  it("piston pressures are equal when balanced (500 Pa per weight on (1), 1000 Pa on (2))", () => {
    expect(evaluatePistons(pistons, { pan1: 4, pan2: 2 })).toEqual({ ok: true, outcome: "balanced", pascals: [2000, 2000] });
  });

  it("E-01 rejects a depth off the 10 mm step or beyond the deepest point", () => {
    expect(at(105)).toEqual({ ok: false, code: "DEPTH_OFF_STEP" });
    expect(at(255)).toEqual({ ok: false, code: "DEPTH_OUT_OF_RANGE" });
    expect(at(260)).toEqual({ ok: false, code: "DEPTH_OUT_OF_RANGE" });
    expect(at(-10)).toEqual({ ok: false, code: "DEPTH_OUT_OF_RANGE" });
    expect(at(100, 25)).toEqual({ ok: false, code: "POSITION_NOT_ALLOWED" });
  });
  it("E-03 rejects a full pan or more weights than the set holds", () => {
    expect(evaluatePistons(pistons, { pan1: 7, pan2: 0 })).toEqual({ ok: false, code: "PAN_FULL" });
    expect(evaluatePistons({ ...pistons, weightCount: 8 }, { pan1: 6, pan2: 3 })).toEqual({ ok: false, code: "WEIGHTS_EXHAUSTED" });
    expect(evaluatePistons(pistons, { pan1: -1, pan2: 0 })).toEqual({ ok: false, code: "NEGATIVE_COUNT" });
  });
});
