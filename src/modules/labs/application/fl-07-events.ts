import { z } from "zod";
import { evaluateThermalBench } from "../../../../packages/sim";

const reading = z.number().int().finite().nonnegative().max(10_000_000);
const temperature = z.number().int().finite().nonnegative().max(100_000);
const measurement = <T extends "RECORDED_FIRST_MEASUREMENT" | "RECORDED_SECOND_MEASUREMENT", E extends 50000 | 100000>(type: T, elapsedMilliseconds: E) =>
  z.object({ type: z.literal(type), elapsedMilliseconds: z.literal(elapsedMilliseconds), energyMilliJoules: reading,
    temperatureMilliCelsius: temperature, riseMilliCelsius: temperature }).strict();
export const fl07EventSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("PREDICTED_TEMPERATURE_CHANGE"), choice: z.enum(["increase", "same", "decrease"]) }).strict(),
  z.object({ type: z.literal("STARTED_HEATING") }).strict(),
  measurement("RECORDED_FIRST_MEASUREMENT", 50000),
  z.object({ type: z.literal("PREDICTED_SECOND_MEASUREMENT"), choice: z.enum(["more_than_double", "double", "less_than_double"]) }).strict(),
  measurement("RECORDED_SECOND_MEASUREMENT", 100000),
  z.object({ type: z.literal("EXPLAINED_ENERGY_BOUNDARY"), ratioChoice: z.enum(["more_than_double", "double", "less_than_double"]),
    boundaryChoice: z.enum(["equal_ideal_only", "always_equal", "unrelated"]) }).strict(),
]);
export type Fl07Event = z.infer<typeof fl07EventSchema>;
const order: Fl07Event["type"][] = ["PREDICTED_TEMPERATURE_CHANGE", "STARTED_HEATING", "RECORDED_FIRST_MEASUREMENT",
  "PREDICTED_SECOND_MEASUREMENT", "RECORDED_SECOND_MEASUREMENT", "EXPLAINED_ENERGY_BOUNDARY"];
export function validateFl07History(history: unknown) {
  if (!Array.isArray(history) || history.length > order.length) return { ok: false as const, code: "INVALID_HISTORY" as const };
  const parsed = history.map((item) => fl07EventSchema.safeParse(item));
  if (parsed.some((item, index) => !item.success || item.data.type !== order[index])) return { ok: false as const, code: "INVALID_HISTORY" as const };
  return { ok: true as const, events: parsed.map((item) => item.data!) };
}
export function nextFl07Event(history: unknown, raw: unknown) {
  const parsed = fl07EventSchema.safeParse(raw);
  if (!parsed.success) return { ok: false as const, code: "INVALID_EVENT" as const };
  const prior = validateFl07History(history);
  if (!prior.ok) return prior;
  if (parsed.data.type !== order[prior.events.length]) return { ok: false as const, code: "INVALID_ORDER" as const };
  return { ok: true as const, sequence: prior.events.length + 1, event: parsed.data };
}

/** Only reveal the observation reached after its preceding prediction was stored. */
export function fl07Snapshot(history: unknown) {
  const checked = validateFl07History(history);
  if (!checked.ok) throw new Error("INVALID_HISTORY");
  const times = [0, ...(checked.events.length >= 2 ? [50000] : []), ...(checked.events.length >= 4 ? [100000] : [])];
  const observations = times.map((elapsedMilliseconds) => {
    const result = evaluateThermalBench({ fixtureId: "water-calorimeter-v1", elapsedMilliseconds });
    if (!result.ok) throw new Error("INVALID_THERMAL_FIXTURE");
    return result.value;
  });
  return { events: checked.events, observations, observation: { ok: true as const, value: observations[observations.length - 1] } };
}
