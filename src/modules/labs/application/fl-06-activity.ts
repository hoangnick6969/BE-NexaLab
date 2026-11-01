import { z } from "zod";
import { classifyLeverCase, evaluateLeverBench } from "../../../../packages/sim";
import { validateFl06History, type Fl06Event } from "./fl-06-events";

const presets = { C1: { load: -100, force: 1000, gauge: 200 }, C2: { load: 150, force: 2000, gauge: -100 }, C3: { load: -250, force: 500, gauge: 50 } } as const;
export function evaluateFl06Activity(raw: unknown, history: unknown) {
  if (!z.object({}).strict().safeParse(raw).success) throw new Error("INVALID_EVIDENCE");
  const checked = validateFl06History(history);
  if (!checked.ok || checked.events.length !== 6) throw new Error("INVALID_SERVER_EVENTS");
  const [prediction, observed, measured, predictedBalance, verified, applied] = checked.events as [
    Extract<Fl06Event,{type:"PREDICTED_ROTATION"}>, Extract<Fl06Event,{type:"OBSERVED_ROTATION"}>, Extract<Fl06Event,{type:"MEASURED_MOMENT"}>,
    Extract<Fl06Event,{type:"PREDICTED_EQUILIBRIUM"}>, Extract<Fl06Event,{type:"VERIFIED_EQUILIBRIUM"}>, Extract<Fl06Event,{type:"APPLIED_LEVER_CASE"}>];
  const observations = observed.trials.map(trial => evaluateLeverBench({ fixtureId: "lever-bench-reference-v1", attachments: trial.attachments }));
  const measurement = evaluateLeverBench({ fixtureId: "lever-bench-reference-v1", attachments: measured.attachments });
  const preset = presets[verified.presetId];
  const expectedGauge = preset.force * Math.abs(preset.load) / Math.abs(preset.gauge);
  const balance = evaluateLeverBench({ fixtureId: "lever-bench-reference-v1", attachments: [
    { kind: "WEIGHT", positionMillimetres: preset.load, forceMilliNewtons: preset.force },
    { kind: "GAUGE", positionMillimetres: preset.gauge, forceMilliNewtons: verified.gaugeForceMilliNewtons },
  ] });
  const application = classifyLeverCase({ fulcrumMillimetres: applied.fulcrumMillimetres, loadMillimetres: applied.loadMillimetres, effortMillimetres: applied.effortMillimetres });
  if (observations.some(item => !item.ok) || !measurement.ok || !balance.ok || !application.ok || predictedBalance.presetId !== verified.presetId) throw new Error("INVALID_SERVER_EVENTS");
  const selected = measurement.value.attachments.find(item => item.positionMillimetres === measured.selectedPositionMillimetres);
  if (!selected) throw new Error("INVALID_SERVER_EVENTS");
  const actualObservations = observations.map(item => item.ok ? item.value : null);
  const criteria = {
    rotation: observed.trials.every((trial, index) => prediction.predictions[index].positionMillimetres === trial.attachments[0].positionMillimetres &&
      prediction.predictions[index].prediction === actualObservations[index]!.displayState && trial.observedState === actualObservations[index]!.displayState),
    moment: measured.recordedForceMilliNewtons === selected.forceMilliNewtons && measured.recordedArmMillimetres === selected.armMillimetres &&
      measured.recordedMomentMilliNewtonMillimetres === selected.unsignedMomentMilliNewtonMillimetres,
    prediction: predictedBalance.predictedGaugeForceMilliNewtons === expectedGauge,
    equilibrium: verified.gaugeForceMilliNewtons === expectedGauge && balance.value.balance === "BALANCED",
    application: applied.forceAdvantage === application.value.forceAdvantage && applied.changesForceDirection === application.value.changesForceDirection,
  };
  const verdict = Object.values(criteria).every(Boolean) ? "passed" : "needs_practice";
  return { result: { version: "1.0.0", criteria, observations: actualObservations, measurement: measurement.value, equilibrium: balance.value, application: application.value, verdict }, verdict };
}
