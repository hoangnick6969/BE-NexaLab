import { describe, expect, it } from "vitest";
import { CONDUCTIVITY_TABLE, FL08_HEAT_TRANSFER_EXPLORE_CONFIG as base, validateThermalLabConfig } from "./index";

const clone = () => structuredClone(base) as Record<string, any>;
const errorsOf = (raw: unknown) => {
  const result = validateThermalLabConfig(raw);
  return result.ok ? [] : result.errors;
};

describe("validateThermalLabConfig", () => {
  it("accepts the packaged FL-08 config with the draft warning only", () => {
    const result = validateThermalLabConfig(base);
    expect(result.ok).toBe(true);
    expect(result.warnings).toEqual([expect.stringContaining("review.status: draft")]);
  });

  it("keeps Bảng 28.1 exactly as printed in the textbook", () => {
    expect(Object.fromEntries(Object.entries(CONDUCTIVITY_TABLE).map(([id, row]) => [id, row.relative]))).toEqual({
      wool: 2, wood: 7, water: 25, glass: 44, soil: 65, steel: 2860, aluminium: 8770, copper: 17370,
    });
  });

  it("accepts a conduction-only config with its own apparatus", () => {
    const raw = clone();
    raw.stations = ["conduction"];
    delete raw.convection;
    delete raw.radiation;
    raw.enabledApparatus = raw.enabledApparatus.filter((item: { kind: string }) => ["rod_rack", "spirit_lamp", "stopwatch"].includes(item.kind));
    expect(validateThermalLabConfig(raw).ok).toBe(true);
  });

  it("E-01 rejects a material outside the rod list and more than three rods", () => {
    const material = clone();
    material.conduction.materials = ["copper", "wool"];
    expect(errorsOf(material).some((error) => error.startsWith("conduction.materials"))).toBe(true);
    const rods = clone();
    rods.conduction.maxRods = 4;
    expect(errorsOf(rods).some((error) => error.startsWith("conduction.maxRods"))).toBe(true);
  });

  it("E-02 rejects pins beyond the rod or not increasing from end A", () => {
    const raw = clone();
    raw.conduction.pinPositionsMm = [50, 40, 320];
    expect(errorsOf(raw)).toEqual(expect.arrayContaining([
      "conduction.pinPositionsMm: positions must increase from end A",
      "conduction.pinPositionsMm: a pin is beyond the rod",
    ]));
  });

  it("E-03 rejects absorptance out of range, τ = 0 and a silver surface hotter than black", () => {
    const range = clone();
    range.radiation.absorptance.black = 120;
    expect(errorsOf(range).length).toBeGreaterThan(0);
    const tau = clone();
    tau.radiation.tauSeconds = 0;
    expect(errorsOf(tau).length).toBeGreaterThan(0);
    const order = clone();
    order.radiation.absorptance = { black: 20, silver: 60 };
    expect(errorsOf(order)).toContain("radiation.absorptance: a silvered surface cannot take in more than a black one");
  });

  it("E-04 rejects a guided mode, a duplicate station and missing station settings", () => {
    const guided = clone();
    guided.modes = { explore: true, guided: { rendererKey: "fl08" } };
    expect(errorsOf(guided)).toContain("modes.guided: the thermal bench config is Explore-only");
    const duplicate = clone();
    duplicate.stations = ["conduction", "conduction", "radiation"];
    expect(errorsOf(duplicate)).toContain("stations: duplicate conduction");
    const missing = clone();
    delete missing.radiation;
    expect(errorsOf(missing)).toContain("radiation: required by the radiation station");
    const noDye = clone();
    noDye.enabledApparatus = noDye.enabledApparatus.filter((item: { kind: string }) => item.kind !== "dye_flask");
    expect(errorsOf(noDye)).toContain("convection.dye: needs a dye_flask");
  });

  it("rejects apparatus of a station that is not enabled", () => {
    const raw = clone();
    raw.stations = ["conduction"];
    delete raw.convection;
    delete raw.radiation;
    expect(errorsOf(raw)).toContain("enabledApparatus: heat_lamp belongs to a station that is not enabled");
  });
});
