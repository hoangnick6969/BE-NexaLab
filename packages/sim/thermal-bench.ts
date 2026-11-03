import { z } from "zod";

const fixture = Object.freeze({
  id: "water-calorimeter-v1",
  provenance: "technical_assumption",
  massGrams: 100,
  specificHeatMilliJoulesPerGramKelvin: 4200,
  initialTemperatureMilliCelsius: 25000,
  powerMilliWatts: 42000,
  stepMilliseconds: 1000,
  maxElapsedMilliseconds: 100000,
  maxTemperatureMilliCelsius: 35000,
  thermometerResolutionMilliCelsius: 100,
  joulemeterResolutionMilliJoules: 1000,
});
const freezeDeep = (value: any): any => {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.values(value).forEach(freezeDeep);
    Object.freeze(value);
  }
  return value;
};
const registry = freezeDeep({ [fixture.id]: fixture }) as Readonly<Record<string, unknown>>;
const integer = z.number().finite().int();
const inputSchema = z.object({ fixtureId: z.string(), elapsedMilliseconds: integer }).strict();
const fixtureSchema = z.object({
  id: z.string(), provenance: z.literal("technical_assumption"), massGrams: integer,
  specificHeatMilliJoulesPerGramKelvin: integer, initialTemperatureMilliCelsius: integer,
  powerMilliWatts: integer, stepMilliseconds: integer, maxElapsedMilliseconds: integer,
  maxTemperatureMilliCelsius: integer, thermometerResolutionMilliCelsius: integer,
  joulemeterResolutionMilliJoules: integer,
}).strict();
type ErrorCode = "INVALID_SCHEMA" | "OUT_OF_RANGE" | "UNKNOWN_FIXTURE" | "INVALID_FIXTURE";
type ThermalOutput = {
  modelVersion: "1.0.0";
  fixtureId: "water-calorimeter-v1";
  elapsedMilliseconds: number;
  inputEnergyMilliJoules: number;
  sampleHeatMilliJoules: number;
  temperatureMilliCelsius: number;
  riseMilliCelsius: number;
  meterReadingMilliJoules: number;
  thermometerReadingMilliCelsius: number;
  heaterState: "OFF" | "ON" | "AUTO_STOP";
  assumptions: readonly ["ideal_calorimeter", "no_heat_loss", "no_container_heat_capacity", "constant_specific_heat"];
};
type Result<T> = { ok: true; value: T } | { ok: false; code: ErrorCode };
const fail = (code: ErrorCode) => ({ ok: false as const, code });
const safe = Number.isSafeInteger;

/** Internal helper; half ties round upward for nonnegative meter readings. */
export function quantizeReading(value: number, resolution: number): number {
  if (!safe(value) || value < 0 || !safe(resolution) || resolution <= 0) throw new Error("quantizeReading expects a nonnegative safe integer and a positive safe integer resolution");
  const numerator = 2 * value + resolution;
  const denominator = 2 * resolution;
  if (!safe(numerator) || !safe(denominator)) throw new Error("quantizeReading arithmetic exceeds the safe integer range");
  return Math.floor(numerator / denominator) * resolution;
}

function validateThermalFixture(raw: unknown): raw is typeof fixture {
  const p = fixtureSchema.safeParse(raw);
  if (!p.success) return false;
  const energyNumerator = p.data.powerMilliWatts * p.data.stepMilliseconds;
  const heatCapacity = p.data.massGrams * p.data.specificHeatMilliJoulesPerGramKelvin;
  if (![energyNumerator, heatCapacity].every(safe) || energyNumerator <= 0 || heatCapacity <= 0 || energyNumerator % 1000 !== 0) return false;
  const energyPerStepMilliJoules = energyNumerator / 1000;
  const riseNumerator = energyPerStepMilliJoules * 1000;
  const dividesExactly = safe(riseNumerator) && riseNumerator > 0 && riseNumerator % heatCapacity === 0;
  return dividesExactly && Object.keys(fixture).every((key) => p.data[key as keyof typeof fixture] === fixture[key as keyof typeof fixture]);
}

export function evaluateThermalBenchWithRegistry(raw: unknown, source: Readonly<Record<string, unknown>>): Result<ThermalOutput> {
  const parsed = inputSchema.safeParse(raw);
  if (!parsed.success) return fail("INVALID_SCHEMA");
  const { fixtureId, elapsedMilliseconds } = parsed.data;
  if (!safe(elapsedMilliseconds) || elapsedMilliseconds < 0 || elapsedMilliseconds > fixture.maxElapsedMilliseconds || elapsedMilliseconds % fixture.stepMilliseconds !== 0) return fail("OUT_OF_RANGE");
  if (!Object.hasOwn(source, fixtureId)) return fail("UNKNOWN_FIXTURE");
  const f = source[fixtureId];
  if (!validateThermalFixture(f)) return fail("INVALID_FIXTURE");
  const steps = elapsedMilliseconds / f.stepMilliseconds;
  const energyPerStepMilliJoules = f.powerMilliWatts * f.stepMilliseconds / 1000;
  const heatCapacity = f.massGrams * f.specificHeatMilliJoulesPerGramKelvin;
  const risePerStepMilliCelsius = energyPerStepMilliJoules * 1000 / heatCapacity;
  const inputEnergyMilliJoules = steps * energyPerStepMilliJoules;
  const riseMilliCelsius = steps * risePerStepMilliCelsius;
  if (![steps, energyPerStepMilliJoules, heatCapacity, risePerStepMilliCelsius, inputEnergyMilliJoules, riseMilliCelsius].every(safe)) return fail("OUT_OF_RANGE");
  const temperatureMilliCelsius = f.initialTemperatureMilliCelsius + riseMilliCelsius;
  if (![inputEnergyMilliJoules, riseMilliCelsius, temperatureMilliCelsius].every(safe)) return fail("OUT_OF_RANGE");
  const elapsed = elapsedMilliseconds;
  const energy = inputEnergyMilliJoules;
  const rise = riseMilliCelsius;
  const temperature = temperatureMilliCelsius;
  return { ok: true, value: {
    modelVersion: "1.0.0", fixtureId: f.id, elapsedMilliseconds: elapsed,
    inputEnergyMilliJoules: energy, sampleHeatMilliJoules: energy,
    temperatureMilliCelsius: temperature, riseMilliCelsius: rise,
    meterReadingMilliJoules: quantizeReading(energy, f.joulemeterResolutionMilliJoules),
    thermometerReadingMilliCelsius: quantizeReading(temperature, f.thermometerResolutionMilliCelsius),
    heaterState: elapsed === 0 ? "OFF" : elapsed >= f.maxElapsedMilliseconds ? "AUTO_STOP" : "ON",
    assumptions: ["ideal_calorimeter", "no_heat_loss", "no_container_heat_capacity", "constant_specific_heat"] as const,
  } };
}

export function evaluateThermalBench(raw: unknown): Result<ThermalOutput> {
  return evaluateThermalBenchWithRegistry(raw, registry);
}
