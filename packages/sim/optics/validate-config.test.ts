import { describe, expect, it } from "vitest";
import { FL23_REFRACTION_EXPLORE_CONFIG } from "./fl23-refraction.data";
import { validateRefractionLabConfig } from "./validate-config";

const base = structuredClone(FL23_REFRACTION_EXPLORE_CONFIG);
const errorsOf = (patch: object) => {
  const result = validateRefractionLabConfig({ ...structuredClone(base), ...patch });
  return result.ok ? [] : result.errors;
};
const apparatus = (kinds: string[]) => base.enabledApparatus.filter((item) => kinds.includes(item.kind));

describe("validateRefractionLabConfig", () => {
  it("accepts the packaged FL-23 config, owner-reviewed, without warnings", () => {
    const result = validateRefractionLabConfig(base);
    expect(result.ok).toBe(true);
    expect(result.warnings).toEqual([]);
  });

  it("warns for a draft and for a single medium", () => {
    const result = validateRefractionLabConfig({ ...base, review: { status: "draft" }, media: [base.media[0]] });
    expect(result.ok).toBe(true);
    expect(result.warnings).toEqual([expect.stringContaining("one medium only"), expect.stringContaining("review.status: draft")]);
  });

  it("E-03 rejects Guided, duplicate stations and a station without its settings", () => {
    expect(errorsOf({ modes: { explore: true, guided: { rendererKey: "fl23" } } })).toEqual([expect.stringContaining("Explore-only")]);
    expect(errorsOf({ stations: ["into-block", "into-block"] })).toContain("stations: duplicate into-block");
    expect(errorsOf({ outOfBlock: undefined })).toContain("outOfBlock: required by the out-of-block station");
    expect(errorsOf({ stations: ["out-of-block"], enabledApparatus: apparatus(["light_source", "protractor_disk", "half_cylinder"]) })).toContain("intoBlock: set without the into-block station");
  });

  it("E-02 rejects a block not denser than air and two media with the same id or index", () => {
    expect(errorsOf({ media: [{ id: "air", labelVi: "Không khí", indexMilli: 1000 }] })[0]).toMatch(/^media\.0\.indexMilli/);
    expect(errorsOf({ media: [base.media[0], { ...base.media[1], id: "glass" }] })).toContain("media: duplicate id glass");
    expect(errorsOf({ media: [base.media[0], { ...base.media[1], indexMilli: 1500 }] })).toContain("media: two media share the index 1500");
  });

  it("keeps apparatus and stations consistent", () => {
    expect(errorsOf({ enabledApparatus: apparatus(["light_source", "protractor_disk", "half_cylinder", "speed_card"]) })).toContain("enabledApparatus: the stations need measurement_table");
    // A station-2-only bench cannot carry the table or the speed card.
    expect(errorsOf({ stations: ["out-of-block"], intoBlock: undefined })).toEqual([
      "enabledApparatus: measurement_table belongs to a station that is not enabled",
      "enabledApparatus: speed_card belongs to a station that is not enabled",
    ]);
    expect(errorsOf({ enabledApparatus: [...base.enabledApparatus.slice(0, 4), { ...base.enabledApparatus[0], id: "laser2" }] })).toContain("enabledApparatus: at most one light_source");
  });

  it("station 2 must reach total internal reflection for every medium", () => {
    expect(errorsOf({ outOfBlock: { maxIncidenceDeg: 45, criticalToleranceDeg: 1 } })).toEqual(["outOfBlock.maxIncidenceDeg: water needs more than 48° to show total internal reflection"]);
  });
});
