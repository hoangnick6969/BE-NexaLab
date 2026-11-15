import { describe, expect, it } from "vitest";
import { FL06_LEVER_EXPLORE_CONFIG as base, validateLeverLabConfig } from "./index";

const errorsOf = (raw: unknown) => {
  const result = validateLeverLabConfig(raw);
  expect(result.ok).toBe(false);
  return result.ok ? [] : result.errors;
};
const apparatus = base.enabledApparatus;

describe("validateLeverLabConfig", () => {
  it("I-01 needs one weight set and at most one spring gauge", () => {
    expect(errorsOf({ ...base, enabledApparatus: [apparatus[0], apparatus[2]] })).toContain("enabledApparatus: needs exactly one weight_set");
    expect(errorsOf({ ...base, enabledApparatus: [apparatus[0], { ...apparatus[2] }, { ...apparatus[2], id: "gauge-2" }] })).toEqual(expect.arrayContaining(["enabledApparatus: needs exactly one weight_set", "enabledApparatus: at most one spring_gauge"]));
  });

  it("I-02 weights must be 0.5 N steps without duplicates", () => {
    expect(errorsOf({ ...base, weights: { ...base.weights, availableMilliNewtons: [750, 1000] } })).toEqual([expect.stringMatching(/^weights\.availableMilliNewtons: 750 mN/)]);
    expect(errorsOf({ ...base, weights: { ...base.weights, availableMilliNewtons: [1000, 1000] } })).toContain("weights.availableMilliNewtons: duplicate 1000");
  });

  it("I-03 starting attachments go through the lever model", () => {
    const twoInOneHole = [{ kind: "WEIGHT", positionMillimetres: -100, forceMilliNewtons: 1000 }, { kind: "WEIGHT", positionMillimetres: -100, forceMilliNewtons: 500 }];
    expect(errorsOf({ ...base, initialAttachments: twoInOneHole })).toContain("initialAttachments: INVALID_CONFIGURATION");
    expect(errorsOf({ ...base, initialAttachments: [{ kind: "WEIGHT", positionMillimetres: 75, forceMilliNewtons: 1000 }] })).toContain("initialAttachments: OUT_OF_RANGE");
    expect(errorsOf({ ...base, initialAttachments: [{ kind: "WEIGHT", positionMillimetres: 50, forceMilliNewtons: 1500 }] })).toContain("initialAttachments: weight 1500 mN is not in weights.availableMilliNewtons");
  });

  it("I-04 a starting gauge needs the spring gauge enabled", () => {
    const start = [{ kind: "GAUGE", positionMillimetres: 200, forceMilliNewtons: 500 }];
    expect(errorsOf({ ...base, enabledApparatus: apparatus.slice(0, 2), initialAttachments: start })).toContain("initialAttachments: a GAUGE needs an enabled spring_gauge");
  });

  it("I-05 rejects a guided mode", () => {
    expect(errorsOf({ ...base, modes: { explore: true, guided: { rendererKey: "lever" } } })).toEqual([expect.stringMatching(/^modes\.guided/)]);
  });

  it("I-06 fixes fixture, kit and engine", () => {
    for (const patch of [{ fixtureId: "other" }, { kit: "k2-wet-bench@1" }, { engine: "lever-bench@1.1.0" }]) {
      expect(errorsOf({ ...base, ...patch })[0]).toMatch(/^(fixtureId|kit|engine):/);
    }
  });

  it("warns when the ruler is hidden", () => {
    const result = validateLeverLabConfig({ ...base, measurements: ["force_labels"] });
    expect(result.ok && result.warnings).toContain("measurements: without the ruler learners cannot read lever arms");
  });
});
