import { describe, expect, it } from "vitest";
import { FL04_PRESSURE_EXPLORE_CONFIG as base, validateFluidLabConfig } from "./index";

const clone = () => structuredClone(base) as Record<string, any>;
const errorsOf = (raw: unknown) => {
  const result = validateFluidLabConfig(raw);
  return result.ok ? [] : result.errors;
};

describe("validateFluidLabConfig", () => {
  it("accepts the packaged FL-04 config with the draft warning only", () => {
    const result = validateFluidLabConfig(base);
    expect(result.ok).toBe(true);
    expect(result.warnings).toEqual([expect.stringContaining("review.status: draft")]);
  });

  it("accepts a pistons-only config without the tank and probe", () => {
    const raw = clone();
    raw.stations = ["pistons"];
    delete raw.depthProbe;
    raw.enabledApparatus = raw.enabledApparatus.filter((item: { kind: string }) => item.kind === "piston_pair" || item.kind === "weight_set");
    expect(validateFluidLabConfig(raw).ok).toBe(true);
  });

  it("E-02 rejects a probe that would reach the tank floor", () => {
    const raw = clone();
    raw.depthProbe.maxDepthMm = 280;
    expect(errorsOf(raw)).toContain("depthProbe: maxDepthMm must stay above the tank floor (below waterLevelMm)");
  });

  it("E-04 rejects another liquid, a guided mode and a duplicate station", () => {
    const liquid = clone();
    liquid.liquid = { id: "oil", weightDensityNPerM3: 8000 };
    expect(errorsOf(liquid).some((error) => error.startsWith("liquid."))).toBe(true);

    const guided = clone();
    guided.modes = { explore: true, guided: { rendererKey: "fl04" } };
    expect(errorsOf(guided)).toContain("modes.guided: the fluid bench config is Explore-only");

    const duplicate = clone();
    duplicate.stations = ["pistons", "pistons"];
    expect(errorsOf(duplicate)).toContain("stations: duplicate pistons");
  });

  it("rejects station settings and apparatus that do not match the stations", () => {
    const missing = clone();
    delete missing.pistons;
    expect(errorsOf(missing)).toContain("pistons: required by the pistons station");

    const extra = clone();
    extra.stations = ["depth-probe"];
    expect(errorsOf(extra)).toEqual(expect.arrayContaining([
      "pistons: set without the pistons station",
      "enabledApparatus: piston_pair belongs to a station that is not enabled",
    ]));

    const noProbe = clone();
    noProbe.enabledApparatus = noProbe.enabledApparatus.filter((item: { kind: string }) => item.kind !== "membrane_probe");
    expect(errorsOf(noProbe)).toContain("enabledApparatus: the stations need membrane_probe");
  });

  it("rejects off-step depth limits and side holes below the deepest point", () => {
    const raw = clone();
    raw.depthProbe.maxDepthMm = 245;
    raw.depthProbe.sideHoleOffsetMm = 250;
    expect(errorsOf(raw)).toEqual(expect.arrayContaining([
      "depthProbe: maxDepthMm is not a multiple of depthStepMm",
      "depthProbe: sideHoleOffsetMm must be below maxDepthMm",
    ]));
  });

  it("rejects unknown fields and a wrong kit", () => {
    expect(errorsOf({ ...clone(), extra: 1 }).length).toBeGreaterThan(0);
    expect(errorsOf({ ...clone(), kit: "k5-lever-bench@1" }).length).toBeGreaterThan(0);
  });
});
