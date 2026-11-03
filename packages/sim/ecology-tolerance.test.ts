import { describe, expect, it } from "vitest";
import { ecologyTolerance, ECOLOGY_SITES, pyramidFor } from "./index";

// FL-20 golden cases EC-01…EC-11, EC-X1…X3 (spec-fl-20-ecological-tolerance/lab-definition.md §6).
const at = (valueDeciC: unknown) => ({ setup: "tolerance", speciesId: "ca-ro-phi", factor: "TEMPERATURE", valueDeciC });
const limits = { minDeciC: 56, maxDeciC: 420 };

describe("ecology-tolerance@1.0.0 (FL-20 golden cases)", () => {
  it.each([
    ["EC-01", 300, "WITHIN", true],
    ["EC-02", 440, "ABOVE_MAX", false],
    ["EC-03", 40, "BELOW_MIN", false],
    ["EC-04 lower limit inclusive", 56, "WITHIN", true],
    ["EC-05 upper limit inclusive", 420, "WITHIN", true],
    ["EC-06 below", 55, "BELOW_MIN", false],
    ["EC-06 above", 421, "ABOVE_MAX", false],
  ] as const)("%s: %i deci°C", (_, value, zone, canPersist) => {
    expect(ecologyTolerance(at(value))).toEqual({ version: "1.0.0", setup: "tolerance", zone, canPersist, limits });
  });

  it("EC-07: sweep reports the SGK limits of cá rô phi", () => {
    expect(ecologyTolerance({ setup: "tolerance-sweep", speciesId: "ca-ro-phi", factor: "TEMPERATURE" }))
      .toEqual({ version: "1.0.0", setup: "tolerance-sweep", limits, widthDeciC: 364 });
  });

  it("EC-08: exactly one hypothetical fish suits the site", () => {
    const result = ecologyTolerance({ setup: "import-comparison", siteId: "site-demo", factor: "TEMPERATURE" });
    expect(result).toEqual({
      version: "1.0.0",
      setup: "import-comparison",
      site: ECOLOGY_SITES["site-demo"].range,
      candidates: [
        { speciesId: "fish-a", limits: { minDeciC: 100, maxDeciC: 400 }, suitable: false, failsOn: "COLD" },
        { speciesId: "fish-b", limits: { minDeciC: 20, maxDeciC: 380 }, suitable: true, failsOn: null },
        { speciesId: "fish-c", limits: { minDeciC: 50, maxDeciC: 300 }, suitable: false, failsOn: "HEAT" },
      ],
    });
  });

  it.each([
    ["lim-xanh", 11250, 15, "ha", { num: 750, den: 1 }],
    ["bap-cai", 3000, 750, "m2", { num: 4, den: 1 }],
    ["ca-chep", 120000, 60000, "m3", { num: 2, den: 1 }],
  ] as const)("EC-09: density of %s (SGK Bảng 42.1)", (populationId, count, amount, unit, density) => {
    expect(ecologyTolerance({ setup: "density", populationId })).toEqual({ version: "1.0.0", setup: "density", count, amount, unit, density });
  });

  it.each([
    ["P1", { num: 10, den: 7 }, "GROWING"],
    ["P2", { num: 19, den: 20 }, "STABLE"],
    ["P3", { num: 4, den: 9 }, "DECLINING"],
  ] as const)("EC-10: age sample %s", (sampleId, ratio, pyramid) => {
    expect(ecologyTolerance({ setup: "age-structure", sampleId })).toMatchObject({ setup: "age-structure", ratio, pyramid });
  });

  it("EC-11: threshold ratios are inclusive", () => {
    expect(pyramidFor({ num: 6, den: 5 })).toBe("GROWING");
    expect(pyramidFor({ num: 4, den: 5 })).toBe("DECLINING");
    expect(pyramidFor({ num: 1, den: 1 })).toBe("STABLE");
  });

  it.each([30.5, "300", -1, 501, null])("EC-X1: rejects temperature %s", (value) => {
    expect(() => ecologyTolerance(at(value))).toThrow();
  });

  it.each([
    { setup: "tolerance", speciesId: "fish-a", factor: "TEMPERATURE", valueDeciC: 300 },
    { setup: "density", populationId: "lua" },
    { setup: "age-structure", sampleId: "P4" },
    { setup: "food-web" },
  ])("EC-X2: rejects unknown ids or setups %#", (state) => {
    expect(() => ecologyTolerance(state)).toThrow();
  });

  it("EC-X3: rejects client-supplied limits or extra keys", () => {
    expect(() => ecologyTolerance({ ...at(300), limits: { minDeciC: 0, maxDeciC: 500 } })).toThrow();
    expect(() => ecologyTolerance({ setup: "density", populationId: "bap-cai", count: 1 })).toThrow();
  });
});
