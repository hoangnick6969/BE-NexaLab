import { z } from "zod";
import { classifyLeverCase, evaluateLeverBench } from "../../../../packages/sim";

const position = z.number().int().finite();
const force = z.number().int().finite();
const attachment = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("WEIGHT"), positionMillimetres: position, forceMilliNewtons: force }).strict(),
  z.object({ kind: z.literal("GAUGE"), positionMillimetres: position, forceMilliNewtons: force }).strict(),
]);
export const fl06EventSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("PREDICTED_ROTATION"), predictions: z.tuple([
    z.object({ positionMillimetres: position, prediction: z.enum(["TILT_LEFT", "LEVEL", "TILT_RIGHT"]) }).strict(),
    z.object({ positionMillimetres: position, prediction: z.enum(["TILT_LEFT", "LEVEL", "TILT_RIGHT"]) }).strict(),
    z.object({ positionMillimetres: position, prediction: z.enum(["TILT_LEFT", "LEVEL", "TILT_RIGHT"]) }).strict(),
  ]) }).strict(),
  z.object({ type: z.literal("OBSERVED_ROTATION"), trials: z.tuple([
    z.object({ attachments: z.array(attachment), observedState: z.enum(["TILT_LEFT", "LEVEL", "TILT_RIGHT"]) }).strict(),
    z.object({ attachments: z.array(attachment), observedState: z.enum(["TILT_LEFT", "LEVEL", "TILT_RIGHT"]) }).strict(),
    z.object({ attachments: z.array(attachment), observedState: z.enum(["TILT_LEFT", "LEVEL", "TILT_RIGHT"]) }).strict(),
  ]) }).strict(),
  z.object({ type: z.literal("MEASURED_MOMENT"), attachments: z.array(attachment), selectedPositionMillimetres: position,
    recordedForceMilliNewtons: force, recordedArmMillimetres: position, recordedMomentMilliNewtonMillimetres: force }).strict(),
  z.object({ type: z.literal("PREDICTED_EQUILIBRIUM"), presetId: z.enum(["C1", "C2", "C3"]), predictedGaugeForceMilliNewtons: force }).strict(),
  z.object({ type: z.literal("VERIFIED_EQUILIBRIUM"), presetId: z.enum(["C1", "C2", "C3"]), gaugeForceMilliNewtons: force }).strict(),
  z.object({ type: z.literal("APPLIED_LEVER_CASE"), fulcrumMillimetres: position, loadMillimetres: position, effortMillimetres: position,
    forceAdvantage: z.enum(["GAIN", "EQUAL", "NO_GAIN"]), changesForceDirection: z.boolean() }).strict(),
]);
export type Fl06Event = z.infer<typeof fl06EventSchema>;
const order: Fl06Event["type"][] = ["PREDICTED_ROTATION", "OBSERVED_ROTATION", "MEASURED_MOMENT", "PREDICTED_EQUILIBRIUM", "VERIFIED_EQUILIBRIUM", "APPLIED_LEVER_CASE"];
export function validateFl06History(history: unknown) {
  if (!Array.isArray(history) || history.length > order.length) return { ok: false as const, code: "INVALID_HISTORY" as const };
  const parsed = history.map(item => fl06EventSchema.safeParse(item));
  if (parsed.some((item, index) => !item.success || item.data.type !== order[index])) return { ok: false as const, code: "INVALID_HISTORY" as const };
  return { ok: true as const, events: parsed.map(item => item.data!) };
}
export function nextFl06Event(history: unknown, raw: unknown) {
  const parsed = fl06EventSchema.safeParse(raw);
  if (!parsed.success) return { ok: false as const, code: "INVALID_EVENT" as const };
  const prior = validateFl06History(history);
  if (!prior.ok) return prior;
  if (prior.events.length >= order.length || parsed.data.type !== order[prior.events.length]) return { ok: false as const, code: "INVALID_ORDER" as const };
  const event = parsed.data;
  if (event.type === "PREDICTED_ROTATION" && event.predictions.some((item, index) =>
    !Number.isSafeInteger(item.positionMillimetres) || Math.sign(item.positionMillimetres) !== [-1, 0, 1][index] ||
    item.positionMillimetres < -250 || item.positionMillimetres > 250 || item.positionMillimetres % 50 !== 0))
    return { ok: false as const, code: "INVALID_EVENT" as const };
  if (event.type === "OBSERVED_ROTATION") {
    const expectedSides = [-1, 0, 1];
    for (const [index, trial] of event.trials.entries()) {
      if (trial.attachments.length !== 1 || trial.attachments[0].kind !== "WEIGHT" ||
        Math.sign(trial.attachments[0].positionMillimetres) !== expectedSides[index] ||
        trial.attachments[0].positionMillimetres !== (prior.events[0] as Extract<Fl06Event,{type:"PREDICTED_ROTATION"}>).predictions[index].positionMillimetres)
        return { ok: false as const, code: "INVALID_EVENT" as const };
      const result = evaluateLeverBench({ fixtureId: "lever-bench-reference-v1", attachments: trial.attachments });
      if (!result.ok) return { ok: false as const, code: "INVALID_EVENT" as const };
    }
  }
  if (event.type === "MEASURED_MOMENT") {
    const result = evaluateLeverBench({ fixtureId: "lever-bench-reference-v1", attachments: event.attachments });
    if (!result.ok || !result.value.attachments.some(item => item.positionMillimetres === event.selectedPositionMillimetres))
      return { ok: false as const, code: "INVALID_EVENT" as const };
  }
  if (event.type === "PREDICTED_EQUILIBRIUM" || event.type === "VERIFIED_EQUILIBRIUM") {
    const gauge = event.type === "PREDICTED_EQUILIBRIUM" ? event.predictedGaugeForceMilliNewtons : event.gaugeForceMilliNewtons;
    if (!Number.isSafeInteger(gauge) || gauge < 0 || gauge > 5000 || gauge % 100 !== 0)
      return { ok: false as const, code: "INVALID_EVENT" as const };
  }
  if (event.type === "VERIFIED_EQUILIBRIUM" && event.presetId !== (prior.events[3] as Extract<Fl06Event,{type:"PREDICTED_EQUILIBRIUM"}>).presetId)
    return { ok: false as const, code: "INVALID_EVENT" as const };
  if (event.type === "APPLIED_LEVER_CASE" && !classifyLeverCase({ fulcrumMillimetres: event.fulcrumMillimetres, loadMillimetres: event.loadMillimetres, effortMillimetres: event.effortMillimetres }).ok)
    return { ok: false as const, code: "INVALID_EVENT" as const };
  return { ok: true as const, sequence: prior.events.length + 1, event };
}
