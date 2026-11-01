import { describe, expect, it } from "vitest";
import { nextFl06Event, validateFl06History } from "./fl-06-events";
import { evaluateFl06Activity } from "./fl-06-activity";
import { labEvaluators } from "./evaluators/registry";
import { resolveModel } from "./sim-packs";

const events = [
  { type: "PREDICTED_ROTATION", predictions: [
    { positionMillimetres: -100, prediction: "TILT_LEFT" }, { positionMillimetres: 0, prediction: "LEVEL" }, { positionMillimetres: 100, prediction: "TILT_RIGHT" },
  ] },
  { type: "OBSERVED_ROTATION", trials: [
    { attachments: [{ kind: "WEIGHT", positionMillimetres: -100, forceMilliNewtons: 1000 }], observedState: "TILT_LEFT" },
    { attachments: [{ kind: "WEIGHT", positionMillimetres: 0, forceMilliNewtons: 1000 }], observedState: "LEVEL" },
    { attachments: [{ kind: "WEIGHT", positionMillimetres: 100, forceMilliNewtons: 1000 }], observedState: "TILT_RIGHT" },
  ] },
  { type: "MEASURED_MOMENT", attachments: [{ kind: "WEIGHT", positionMillimetres: -100, forceMilliNewtons: 1000 }], selectedPositionMillimetres: -100,
    recordedForceMilliNewtons: 1000, recordedArmMillimetres: 100, recordedMomentMilliNewtonMillimetres: 100000 },
  { type: "PREDICTED_EQUILIBRIUM", presetId: "C1", predictedGaugeForceMilliNewtons: 500 },
  { type: "VERIFIED_EQUILIBRIUM", presetId: "C1", gaugeForceMilliNewtons: 500 },
  { type: "APPLIED_LEVER_CASE", fulcrumMillimetres: 0, loadMillimetres: -50, effortMillimetres: 150, forceAdvantage: "GAIN", changesForceDirection: true },
] as const;

describe("FL-06 event and rubric", () => {
  it("pins model and activity tuple", () => {
    expect(resolveModel("lever-bench@1.0.0").labId).toBe("lever-equilibrium");
    expect(labEvaluators.rubricRefForActivity("lever-investigation", 1, "lever-bench@1.0.0")).toBe("lever-investigation@1.0.0");
    expect(() => labEvaluators.rubricRefForActivity("lever-investigation", 2, "lever-bench@1.0.0")).toThrow();
  });
  it("accepts six ordered events and scores on server", () => {
    let history: unknown[] = [];
    for (const event of events) {
      const next = nextFl06Event(history, event);
      expect(next.ok).toBe(true);
      if (next.ok) history = [...history, next.event];
    }
    expect(evaluateFl06Activity({}, history).verdict).toBe("passed");
    expect(nextFl06Event(history, events[5])).toMatchObject({ ok: false, code: "INVALID_ORDER" });
  });
  it("rejects malformed, premature and mismatched events", () => {
    expect(nextFl06Event([], events[1])).toMatchObject({ ok: false, code: "INVALID_ORDER" });
    expect(nextFl06Event([], { ...events[0], extra: true })).toMatchObject({ ok: false, code: "INVALID_EVENT" });
    expect(nextFl06Event([], { ...events[0], predictions: [{ positionMillimetres: 100, prediction: "TILT_LEFT" }, ...events[0].predictions.slice(1)] })).toMatchObject({ ok: false, code: "INVALID_EVENT" });
    expect(nextFl06Event([events[0]], { ...events[1], trials: [{ attachments: [{ kind: "WEIGHT", positionMillimetres: 25, forceMilliNewtons: 1000 }], observedState: "TILT_LEFT" }, ...events[1].trials.slice(1)] })).toMatchObject({ ok: false, code: "INVALID_EVENT" });
    expect(validateFl06History([events[1], events[0]])).toMatchObject({ ok: false, code: "INVALID_HISTORY" });
    expect(nextFl06Event(events.slice(0,4), { ...events[4], presetId: "C2" })).toMatchObject({ ok: false, code: "INVALID_EVENT" });
  });
  it("wrong scientific answers persist as needs_practice, not forged verdict", () => {
    const wrong = [...events];
    wrong[2] = { ...events[2], recordedMomentMilliNewtonMillimetres: 1 };
    wrong[4] = { ...events[4], gaugeForceMilliNewtons: 600 };
    const score = evaluateFl06Activity({}, wrong);
    expect(score.verdict).toBe("needs_practice");
    expect(score.result.criteria.moment).toBe(false);
    expect(score.result.criteria.equilibrium).toBe(false);
    const wrongObservation = [...events];
    wrongObservation[1] = { ...events[1], trials: [events[1].trials[0], { ...events[1].trials[1], observedState: "TILT_LEFT" }, events[1].trials[2]] };
    expect(evaluateFl06Activity({}, wrongObservation).result.criteria.rotation).toBe(false);
    const wrongPrediction = [...events];
    wrongPrediction[0] = { ...events[0], predictions: [events[0].predictions[0], { ...events[0].predictions[1], prediction: "TILT_LEFT" }, events[0].predictions[2]] };
    expect(evaluateFl06Activity({}, wrongPrediction).result.criteria.rotation).toBe(false);
    const wrongMeasurement = [...events];
    wrongMeasurement[2] = { ...events[2], recordedForceMilliNewtons: 500, recordedArmMillimetres: 50 };
    expect(evaluateFl06Activity({}, wrongMeasurement).result.criteria.moment).toBe(false);
    expect(nextFl06Event(events.slice(0,3), { ...events[3], predictedGaugeForceMilliNewtons: 550 })).toMatchObject({ ok: false, code: "INVALID_EVENT" });
    expect(() => evaluateFl06Activity({ verdict: "passed" }, events)).toThrow("INVALID_EVIDENCE");
    expect(() => evaluateFl06Activity({}, events.slice(0,5))).toThrow("INVALID_SERVER_EVENTS");
  });
});
