import { describe, expect, it } from "vitest";
import { FL24_ENERGY_EXPLORE_CONFIG as base, validateEnergyLabConfig } from "./index";

const clone = () => structuredClone(base) as Record<string, any>;
const errorsOf = (raw: unknown) => {
  const result = validateEnergyLabConfig(raw);
  return result.ok ? [] : result.errors;
};

describe("validateEnergyLabConfig", () => {
  it("accepts the packaged FL-24 config with the draft warning only", () => {
    const result = validateEnergyLabConfig(base);
    expect(result.ok).toBe(true);
    expect(result.warnings).toEqual([expect.stringContaining("review.status: draft")]);
  });

  it("accepts a pendulum-only config without the hoist apparatus", () => {
    const raw = clone();
    raw.stations = ["pendulum"];
    delete raw.hoist;
    raw.enabledApparatus = raw.enabledApparatus.filter((item: { kind: string }) => item.kind === "pendulum" || item.kind === "energy_bars");
    expect(validateEnergyLabConfig(raw).ok).toBe(true);
  });

  it("E-01 rejects a mass that is not a multiple of 100 g in the config", () => {
    const raw = clone();
    raw.pendulum.massesG = [100, 250];
    expect(errorsOf(raw)).toEqual([expect.stringContaining("multiple of 100 g")]);
  });

  it("E-01 rejects a release height that reaches the string length", () => {
    const raw = clone();
    raw.pendulum.maxDropHeightMm = 600;
    expect(errorsOf(raw)).toContain("pendulum: maxDropHeightMm must stay below lengthMm");
  });

  it("E-02 rejects a zero-speed motor, two motors with the same speed and a distance range off the step", () => {
    const zero = clone();
    zero.hoist.motors[0].speedMmPerS = 0;
    expect(errorsOf(zero).length).toBeGreaterThan(0);
    const same = clone();
    same.hoist.motors[1].speedMmPerS = 125;
    expect(errorsOf(same)).toContain("hoist.motors: the two motors need different speeds");
    const range = clone();
    range.hoist.maxDistanceMm = 950;
    expect(errorsOf(range)).toContain("hoist: the distance range is not a multiple of distanceStepMm");
  });

  it("E-03 rejects modes.guided, a duplicate station and a station without its settings", () => {
    expect(errorsOf({ ...clone(), modes: { explore: true, guided: { rendererKey: "fl24" } } })).toContain("modes.guided: the energy bench config is Explore-only");
    expect(errorsOf({ ...clone(), stations: ["pendulum", "pendulum"] })).toEqual(expect.arrayContaining(["stations: duplicate pendulum"]));
    const missing = clone();
    delete missing.hoist;
    expect(errorsOf(missing)).toContain("hoist: required by the hoist station");
  });

  it("rejects apparatus that does not match the stations and a weight convention other than P = 10·m", () => {
    const extra = clone();
    extra.stations = ["pendulum"];
    delete extra.hoist;
    expect(errorsOf(extra)).toContain("enabledApparatus: hoist belongs to a station that is not enabled");
    const noBars = clone();
    noBars.enabledApparatus = noBars.enabledApparatus.filter((item: { kind: string }) => item.kind !== "energy_bars");
    expect(errorsOf(noBars)).toContain("enabledApparatus: the stations need energy_bars");
    expect(errorsOf({ ...clone(), weight: { milliNewtonsPerGram: 9.8 } }).length).toBeGreaterThan(0);
  });
});
