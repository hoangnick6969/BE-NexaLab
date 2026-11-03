import { z } from "zod";
import { evaluateThermalBench } from "../../../../packages/sim";
import { validateFl07History, type Fl07Event } from "./fl-07-events";

export function evaluateFl07Activity(raw: unknown, history: unknown) {
  if (!z.object({}).strict().safeParse(raw).success) throw new Error("INVALID_EVIDENCE");
  const checked = validateFl07History(history);
  if (!checked.ok || checked.events.length !== 6) throw new Error("INVALID_SERVER_EVENTS");
  const first = checked.events[2] as Extract<Fl07Event, { type: "RECORDED_FIRST_MEASUREMENT" }>;
  const second = checked.events[4] as Extract<Fl07Event, { type: "RECORDED_SECOND_MEASUREMENT" }>;
  const conclusion = checked.events[5] as Extract<Fl07Event, { type: "EXPLAINED_ENERGY_BOUNDARY" }>;
  const a = evaluateThermalBench({ fixtureId: "water-calorimeter-v1", elapsedMilliseconds: 50000 });
  const b = evaluateThermalBench({ fixtureId: "water-calorimeter-v1", elapsedMilliseconds: 100000 });
  if (!a.ok || !b.ok) throw new Error("INVALID_THERMAL_FIXTURE");
  const criteria = {
    R1: true,
    R2: first.energyMilliJoules === a.value.meterReadingMilliJoules && first.temperatureMilliCelsius === a.value.thermometerReadingMilliCelsius,
    R3: first.riseMilliCelsius === a.value.riseMilliCelsius,
    R4: second.energyMilliJoules === b.value.meterReadingMilliJoules && second.temperatureMilliCelsius === b.value.thermometerReadingMilliCelsius && second.riseMilliCelsius === b.value.riseMilliCelsius,
    R5: conclusion.ratioChoice === (b.value.riseMilliCelsius === 2 * a.value.riseMilliCelsius ? "double" : b.value.riseMilliCelsius > 2 * a.value.riseMilliCelsius ? "more_than_double" : "less_than_double"),
    R6: conclusion.boundaryChoice === "equal_ideal_only",
  };
  const score = Object.values(criteria).filter(Boolean).length;
  const verdict = score >= 5 ? "passed" : "needs_practice";
  return { result: { version: "1.0.0", criteria, score, maximumScore: 6, observations: [a.value, b.value], verdict }, verdict };
}
