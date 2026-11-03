import { describe, expect, it } from "vitest";
import { evaluateThermalBench, evaluateThermalBenchWithRegistry, quantizeReading } from "./thermal-bench";

const fixtureId = "water-calorimeter-v1";
const run = (elapsedMilliseconds: unknown, id = fixtureId) => evaluateThermalBench({ fixtureId: id, elapsedMilliseconds });
const value = (result: any) => { expect(result.ok).toBe(true); return result.value; };
const error = (result: unknown, code: string) => expect(result).toEqual({ ok: false, code });
const baseFixture = {
  id: fixtureId, provenance: "technical_assumption", massGrams: 100,
  specificHeatMilliJoulesPerGramKelvin: 4200, initialTemperatureMilliCelsius: 25000,
  powerMilliWatts: 42000, stepMilliseconds: 1000, maxElapsedMilliseconds: 100000,
  maxTemperatureMilliCelsius: 35000, thermometerResolutionMilliCelsius: 100,
  joulemeterResolutionMilliJoules: 1000,
};

describe("thermal-bench model slice", () => {
  it("M-01: G-01..G-05 exact integer energy, temperature and stop", () => {
    expect(value(run(0))).toMatchObject({ inputEnergyMilliJoules: 0, temperatureMilliCelsius: 25000, riseMilliCelsius: 0, heaterState: "OFF" });
    expect(value(run(1000))).toMatchObject({ inputEnergyMilliJoules: 42000, temperatureMilliCelsius: 25100, riseMilliCelsius: 100 });
    expect(value(run(50000))).toMatchObject({ inputEnergyMilliJoules: 2100000, temperatureMilliCelsius: 30000, riseMilliCelsius: 5000 });
    expect(value(run(100000))).toMatchObject({ inputEnergyMilliJoules: 4200000, temperatureMilliCelsius: 35000, riseMilliCelsius: 10000, heaterState: "AUTO_STOP" });
    expect(value(run(99000))).toMatchObject({ inputEnergyMilliJoules: 4158000, sampleHeatMilliJoules: 4158000, riseMilliCelsius: 9900, temperatureMilliCelsius: 34900, meterReadingMilliJoules: 4158000, thermometerReadingMilliCelsius: 34900, heaterState: "ON" });
  });
  it("M-02: distinguishes electrical input and ideal sample heat assumption", () => {
    expect(value(run(50000))).toMatchObject({ inputEnergyMilliJoules: 2100000, sampleHeatMilliJoules: 2100000, assumptions: ["ideal_calorimeter", "no_heat_loss", "no_container_heat_capacity", "constant_specific_heat"] });
  });
  it("M-03: rejects altered pinned fixture", () => {
    const altered = { ...baseFixture, specificHeatMilliJoulesPerGramKelvin: 4000 };
    error(evaluateThermalBenchWithRegistry({ fixtureId, elapsedMilliseconds: 1000 }, { [fixtureId]: altered }), "INVALID_FIXTURE");
    const nonDivisible = { ...baseFixture, powerMilliWatts: 42001 };
    error(evaluateThermalBenchWithRegistry({ fixtureId, elapsedMilliseconds: 1000 }, { [fixtureId]: nonDivisible }), "INVALID_FIXTURE");
    for (const key of ["provenance", "maxElapsedMilliseconds", "maxTemperatureMilliCelsius"] as const) {
      error(evaluateThermalBenchWithRegistry({ fixtureId, elapsedMilliseconds: 1000 }, { [fixtureId]: { ...baseFixture, [key]: "altered" } }), "INVALID_FIXTURE");
    }
    expect(value(evaluateThermalBenchWithRegistry({ fixtureId, elapsedMilliseconds: 1000 }, { [fixtureId]: Object.fromEntries(Object.entries(baseFixture).reverse()) }))).toEqual(value(run(1000)));
  });
  it("M-04: schema, range, lookup and precedence", () => {
    error(evaluateThermalBench({ fixtureId, elapsedMilliseconds: "1000" }), "INVALID_SCHEMA");
    error(evaluateThermalBench({ fixtureId, elapsedMilliseconds: 1.5 }), "INVALID_SCHEMA");
    error(evaluateThermalBench({ fixtureId, elapsedMilliseconds: NaN }), "INVALID_SCHEMA");
    error(evaluateThermalBench({ fixtureId, elapsedMilliseconds: 1000, temperature: 25000 }), "INVALID_SCHEMA");
    for (const elapsed of [-1000, 100001, 2 ** 53, 500]) error(run(elapsed), "OUT_OF_RANGE");
    error(run(1000, "unknown"), "UNKNOWN_FIXTURE");
    error(evaluateThermalBench({ fixtureId: "unknown", elapsedMilliseconds: "1000" }), "INVALID_SCHEMA");
  });
  it("M-05: accepts deeply frozen input without mutation and returns a detached result", () => {
    const input = Object.freeze({ elapsedMilliseconds: 1000, fixtureId });
    const result = value(evaluateThermalBench(input));
    expect(result).toEqual(value(evaluateThermalBench(input)));
    expect(result).not.toBe(value(evaluateThermalBench(input)));
    expect(input).toEqual({ fixtureId, elapsedMilliseconds: 1000 });
    const reversedKeys = value(evaluateThermalBench({ elapsedMilliseconds: 1000, fixtureId }));
    expect(reversedKeys).toEqual(result);
  });
  it("M-06: deterministic strict output contract", () => {
    const result = value(run(50000));
    expect(Object.keys(result)).toEqual(["modelVersion", "fixtureId", "elapsedMilliseconds", "inputEnergyMilliJoules", "sampleHeatMilliJoules", "temperatureMilliCelsius", "riseMilliCelsius", "meterReadingMilliJoules", "thermometerReadingMilliCelsius", "heaterState", "assumptions"]);
  });
  it("M-07: half-up quantization including exact ties", () => {
    expect(quantizeReading(30050, 100)).toBe(30100);
    expect(quantizeReading(30049, 100)).toBe(30000);
    expect(quantizeReading(0, 100)).toBe(0);
    expect(quantizeReading(2100500, 1000)).toBe(2101000);
    expect(quantizeReading(2100499, 1000)).toBe(2100000);
    expect(() => quantizeReading(100, 0)).toThrow();
    expect(() => quantizeReading(-1, 100)).toThrow();
    expect(() => quantizeReading(Number.MAX_SAFE_INTEGER + 1, 100)).toThrow();
    expect(() => quantizeReading(100, 1.5)).toThrow();
  });
  it("M-08: public entrypoint exports only evaluator for this slice", async () => {
    const publicApi = await import("./index");
    expect(publicApi.evaluateThermalBench).toBe(evaluateThermalBench);
    expect("quantizeReading" in publicApi).toBe(false);
    expect("evaluateThermalBenchWithRegistry" in publicApi).toBe(false);
  });
});
