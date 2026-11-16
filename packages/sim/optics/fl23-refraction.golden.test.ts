import { describe, expect, it } from "vitest";
import {
  evaluatePrism, minExitIncidenceDeg, tracePrism, type PrismTrace,
  appendReading, checkCriticalGuess, criticalAngleDeg, evaluateRay, FL23_REFRACTION_EXPLORE_CONFIG as config, lightSpeedInMedium, refract, roundTenth, sineRatio,
  type RayReading, type RayState,
} from "./index";

const ray = (station: RayState["station"], mediumId: string, incidenceDeg: number) => {
  const result = evaluateRay(config, { station, mediumId, incidenceDeg });
  if (!result.ok) throw new Error(result.code);
  return result;
};
const r = (reading: RayReading) => reading.refraction.kind === "refracted" ? reading.refraction.refractionDeg : null;
const near = (value: number | null, expected: number) => {
  expect(value).not.toBeNull();
  expect(Math.abs(value! - expected)).toBeLessThanOrEqual(0.05);
};

describe("refraction@1.0.0 golden (spec §3.2)", () => {
  it("G-01 air to glass at normal incidence: the ray goes straight on", () => {
    expect(r(ray("into-block", "glass", 0))).toBe(0);
    expect(sineRatio(0, 0)).toBeNull();
  });
  it("G-02 air to glass at 30°, 45°, 60°: r = 19.5°, 28.1°, 35.3°", () => {
    expect(roundTenth(r(ray("into-block", "glass", 30))!)).toBe(19.5);
    expect(roundTenth(r(ray("into-block", "glass", 45))!)).toBe(28.1);
    expect(roundTenth(r(ray("into-block", "glass", 60))!)).toBe(35.3);
  });
  it("G-03 sin i / sin r is 1.50 for every reading (Snell law)", () => {
    for (const i of [10, 30, 45, 60, 80]) expect(Math.abs(sineRatio(i, r(ray("into-block", "glass", i))!)! - 1.5)).toBeLessThan(1e-9);
    // Rounded to what a student reads on the disk, the ratio still lands within 0.01 of n.
    for (const i of [30, 45, 60]) expect(Math.abs(sineRatio(i, roundTenth(r(ray("into-block", "glass", i))!))! - 1.5)).toBeLessThanOrEqual(0.01);
  });
  it("G-04 air to water at 30° and 45°: r = 22.0° and 32.0°, water bends less than glass", () => {
    near(r(ray("into-block", "water", 30)), 22.03);
    near(r(ray("into-block", "water", 45)), 32.04);
    for (let i = 1; i <= 80; i++) expect(r(ray("into-block", "water", i))!).toBeGreaterThan(r(ray("into-block", "glass", i))!);
  });
  it("G-05 air to glass never reflects totally, even at 80° (r = 41.0°); r < i for every i > 0", () => {
    near(r(ray("into-block", "glass", 80)), 41.04);
    for (let i = 1; i <= 80; i++) {
      const reading = ray("into-block", "glass", i);
      expect(reading.refraction.kind).toBe("refracted");
      expect(r(reading)!).toBeLessThan(i);
    }
  });
  it("G-06 glass to air at 30°: r = 48.6°, bent away from the normal", () => {
    near(r(ray("out-of-block", "glass", 30)), 48.59);
  });
  it("G-07 glass to air: critical angle 41.8°, refracted at 41° (r = 79.8°), total reflection at 42°", () => {
    near(ray("out-of-block", "glass", 41).criticalDeg, 41.81);
    near(r(ray("out-of-block", "glass", 41)), 79.77);
    expect(ray("out-of-block", "glass", 42).refraction).toEqual({ kind: "total", reflectance: 1 });
  });
  it("G-08 water to air: critical angle 48.6°, refracted at 45° (r = 70.5°), total reflection at 49°", () => {
    near(criticalAngleDeg(1333, 1000), 48.61);
    near(r(ray("out-of-block", "water", 45)), 70.49);
    expect(ray("out-of-block", "water", 49).refraction.kind).toBe("total");
  });
  it("G-09 speed of light: glass 200 000 km/s, water about 225 000 km/s", () => {
    expect(lightSpeedInMedium(1500)).toBe(200_000);
    expect(Math.round(lightSpeedInMedium(1333))).toBe(225_056);
  });
  it("the reflected ray brightens towards the critical angle and is total beyond it", () => {
    const below = refract(1500, 1000, 30);
    const close = refract(1500, 1000, 41);
    expect(below.kind === "refracted" && close.kind === "refracted" && close.reflectance > below.reflectance).toBe(true);
    expect(refract(1000, 1500, 0)).toMatchObject({ kind: "refracted", refractionDeg: 0, reflectance: expect.closeTo(0.04, 3) });
  });
  it("there is no critical angle from air into a block", () => {
    expect(criticalAngleDeg(1000, 1500)).toBeNull();
  });
});

describe("measurement table and critical angle check", () => {
  it("keeps one row per angle and at most maxReadings rows per medium", () => {
    let rows: Array<{ mediumId: string; incidenceDeg: number; refractionDeg: number }> = [];
    for (const i of [10, 20, 30, 40, 50, 60]) {
      const added = appendReading(rows, ray("into-block", "glass", i), 6);
      expect(added.ok).toBe(true);
      if (added.ok) rows = added.rows;
    }
    expect(appendReading(rows, ray("into-block", "glass", 70), 6)).toEqual({ ok: false, code: "TABLE_FULL" });
    expect(appendReading(rows, ray("into-block", "glass", 30), 6)).toEqual({ ok: false, code: "ALREADY_MEASURED" });
    expect(appendReading(rows, ray("into-block", "water", 30), 6).ok).toBe(true);
    expect(appendReading([], ray("out-of-block", "glass", 60), 6)).toEqual({ ok: false, code: "NO_REFRACTED_RAY" });
  });
  it("accepts a critical angle within the tolerance", () => {
    expect(checkCriticalGuess(42, 41.81, 1)).toBe(true);
    expect(checkCriticalGuess(41, 41.81, 1)).toBe(true);
    expect(checkCriticalGuess(43, 41.81, 1)).toBe(false);
    expect(checkCriticalGuess(Number.NaN, 41.81, 1)).toBe(false);
  });
});

describe("refraction@1.0.0 errors (spec §3.2)", () => {
  it("E-01 refuses an angle outside the station range or not a whole degree", () => {
    expect(evaluateRay(config, { station: "into-block", mediumId: "glass", incidenceDeg: 81 })).toEqual({ ok: false, code: "INCIDENCE_OUT_OF_RANGE" });
    expect(evaluateRay(config, { station: "out-of-block", mediumId: "glass", incidenceDeg: 90 })).toEqual({ ok: false, code: "INCIDENCE_OUT_OF_RANGE" });
    expect(evaluateRay(config, { station: "into-block", mediumId: "glass", incidenceDeg: -1 })).toEqual({ ok: false, code: "INCIDENCE_OUT_OF_RANGE" });
    expect(evaluateRay(config, { station: "into-block", mediumId: "glass", incidenceDeg: 30.5 })).toEqual({ ok: false, code: "INCIDENCE_NOT_INTEGER" });
  });
  it("E-02 refuses a medium outside the config and a station that is not enabled", () => {
    expect(evaluateRay(config, { station: "into-block", mediumId: "diamond", incidenceDeg: 30 })).toEqual({ ok: false, code: "MEDIUM_NOT_ALLOWED" });
    expect(evaluateRay({ ...config, stations: ["into-block"], outOfBlock: undefined }, { station: "out-of-block", mediumId: "glass", incidenceDeg: 30 })).toEqual({ ok: false, code: "STATION_NOT_ENABLED" });
  });
});

describe("refraction@1.1.0 prism golden (spec §13.3)", () => {
  const exits = (trace: PrismTrace) => {
    if (trace.kind !== "exits") throw new Error("total");
    return trace;
  };
  const prism = (incidenceDeg: number, light: "laser" | "white" = "laser") => {
    const result = evaluatePrism(config, { incidenceDeg, light });
    if (!result.ok) throw new Error(result.code);
    return result;
  };

  it("P-01 i₁ = 40°: r₁ 25.4°, r₂ 34.6°, i₂ 58.5°, D 38.5°", () => {
    const t = exits(prism(40).laser);
    near(t.firstRefractionDeg, 25.37);
    near(t.secondIncidenceDeg, 34.63);
    near(t.exitDeg, 58.47);
    near(t.deviationDeg, 38.47);
  });
  it("P-02 symmetric path at i₁ = 48.6°: r₁ = r₂ = 30°, D = 37.2° is the smallest deviation", () => {
    const t = exits(tracePrism(1500, 60, 48.59));
    near(t.firstRefractionDeg, 30);
    near(t.secondIncidenceDeg, 30);
    near(t.deviationDeg, 37.18);
    for (let i = 35; i <= 80; i++) expect(exits(prism(i).laser).deviationDeg).toBeGreaterThanOrEqual(37.18 - 0.01);
  });
  it("P-03 i₁ = 60°: r₁ 35.3°, r₂ 24.7°, i₂ 38.9°, D 38.9°", () => {
    const t = exits(prism(60).laser);
    near(t.firstRefractionDeg, 35.26);
    near(t.secondIncidenceDeg, 24.74);
    near(t.exitDeg, 38.88);
    near(t.deviationDeg, 38.88);
  });
  it("P-04 i₁ = 80°: i₂ 29.2°, D 49.2°; the ray always bends towards the base (D > 0)", () => {
    near(exits(prism(80).laser).deviationDeg, 49.17);
    for (let i = 35; i <= 80; i++) expect(exits(prism(i).laser).deviationDeg).toBeGreaterThan(0);
  });
  it("P-05 i₁ = 25° reflects totally at the second face; the threshold for glass is 27.9°", () => {
    expect(tracePrism(1500, 60, 25).kind).toBe("total");
    near(minExitIncidenceDeg(1500, 60), 27.92);
    expect(minExitIncidenceDeg(1500, 20)).toBe(0);
  });
  it("P-06 white light at 50°: red 38.3°, violet 40.5°, deviation grows from red to violet", () => {
    const spectrum = prism(50, "white").spectrum;
    expect(spectrum.map((item) => item.colour.id)).toEqual(["red", "orange", "yellow", "green", "blue", "indigo", "violet"]);
    const deviations = spectrum.map((item) => exits(item.trace).deviationDeg);
    near(deviations[0], 38.32);
    near(deviations[6], 40.53);
    for (let k = 1; k < deviations.length; k++) expect(deviations[k]).toBeGreaterThan(deviations[k - 1]);
    expect(prism(50).spectrum).toEqual([]);
  });
  it("refuses angles outside the prism range, white light when off, and the prism on engine 1.0.0", () => {
    expect(evaluatePrism(config, { incidenceDeg: 34, light: "laser" })).toEqual({ ok: false, code: "INCIDENCE_OUT_OF_RANGE" });
    expect(evaluatePrism(config, { incidenceDeg: 50.5, light: "laser" })).toEqual({ ok: false, code: "INCIDENCE_NOT_INTEGER" });
    expect(evaluatePrism({ ...config, prism: { ...config.prism!, whiteLight: false } }, { incidenceDeg: 50, light: "white" })).toEqual({ ok: false, code: "WHITE_LIGHT_OFF" });
    expect(evaluatePrism({ ...config, engine: "refraction@1.0.0" }, { incidenceDeg: 50, light: "laser" })).toEqual({ ok: false, code: "ENGINE_TOO_OLD" });
    expect(evaluateRay(config, { station: "prism", mediumId: "glass", incidenceDeg: 30 })).toEqual({ ok: false, code: "STATION_NOT_ENABLED" });
  });
});
