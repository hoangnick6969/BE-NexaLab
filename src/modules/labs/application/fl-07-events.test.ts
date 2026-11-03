import { describe, expect, it } from "vitest";
import { evaluateFl07Activity } from "./fl-07-activity";
import { nextFl07Event, fl07Snapshot } from "./fl-07-events";
import { resolveModel } from "./sim-packs";
import { labEvaluators } from "./evaluators/registry";

const complete = [
  { type: "PREDICTED_TEMPERATURE_CHANGE", choice: "decrease" },
  { type: "STARTED_HEATING" },
  { type: "RECORDED_FIRST_MEASUREMENT", elapsedMilliseconds: 50000, energyMilliJoules: 2100000, temperatureMilliCelsius: 30000, riseMilliCelsius: 5000 },
  { type: "PREDICTED_SECOND_MEASUREMENT", choice: "less_than_double" },
  { type: "RECORDED_SECOND_MEASUREMENT", elapsedMilliseconds: 100000, energyMilliJoules: 4200000, temperatureMilliCelsius: 35000, riseMilliCelsius: 10000 },
  { type: "EXPLAINED_ENERGY_BOUNDARY", ratioChoice: "double", boundaryChoice: "equal_ideal_only" },
] as const;

describe("FL-07 server activity", () => {
  it("reveals only observations preceded by a persisted prediction", () => {
    expect(fl07Snapshot([]).observations.map(item => item.elapsedMilliseconds)).toEqual([0]);
    expect(fl07Snapshot(complete.slice(0, 1)).observations.map(item => item.elapsedMilliseconds)).toEqual([0]);
    expect(fl07Snapshot(complete.slice(0, 2)).observations.map(item => item.elapsedMilliseconds)).toEqual([0, 50000]);
    expect(fl07Snapshot(complete.slice(0, 4)).observations.map(item => item.elapsedMilliseconds)).toEqual([0, 50000, 100000]);
    expect(() => fl07Snapshot([complete[1]])).toThrow("INVALID_HISTORY");
  });
  it("pins the model and rubric and scores evidence from model observations", () => {
    expect(resolveModel("thermal-bench@1.0.0").labId).toBe("thermal-energy");
    expect(labEvaluators.rubricRefForActivity("thermal-energy-investigation", 1, "thermal-bench@1.0.0")).toBe("thermal-energy-investigation@1.0.0");
    const result = evaluateFl07Activity({}, complete);
    expect(result).toMatchObject({ verdict: "passed", result: { score: 6, maximumScore: 6 } });
    expect(evaluateFl07Activity({}, complete.map((item, index) => index === 2 ? { ...item, energyMilliJoules: 2000000 } : item))).toMatchObject({ verdict: "passed", result: { score: 5, criteria: { R2: false } } });
    expect(evaluateFl07Activity({}, complete.map((item, index) => index === 5 ? { ...item, ratioChoice: "more_than_double", boundaryChoice: "always_equal" } : item))).toMatchObject({ verdict: "needs_practice", result: { score: 4 } });
  });
  it("rejects malformed, out of order and forged measurements", () => {
    expect(nextFl07Event([], complete[2])).toMatchObject({ ok: false, code: "INVALID_ORDER" });
    expect(nextFl07Event(complete.slice(0, 2), { ...complete[2], elapsedMilliseconds: 51000 })).toMatchObject({ ok: false, code: "INVALID_EVENT" });
    expect(nextFl07Event(complete.slice(0, 2), { ...complete[2], extra: 1 })).toMatchObject({ ok: false, code: "INVALID_EVENT" });
    expect(nextFl07Event(complete.slice(0, 2), { ...complete[2], energyMilliJoules: -1 })).toMatchObject({ ok: false, code: "INVALID_EVENT" });
    expect(() => evaluateFl07Activity({}, complete.slice(0, 5))).toThrow("INVALID_SERVER_EVENTS");
    expect(() => evaluateFl07Activity({ score: 6 }, complete)).toThrow("INVALID_EVIDENCE");
  });
});
