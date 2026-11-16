import { describe, expect, it } from "vitest";
import { FL23_LENS_EXPLORE_CONFIG } from "./fl23-lens.data";
import { validateLensLabConfig } from "./validate-config";

const base = structuredClone(FL23_LENS_EXPLORE_CONFIG);
const errorsOf = (patch: object) => {
  const result = validateLensLabConfig({ ...structuredClone(base), ...patch });
  return result.ok ? [] : result.errors;
};

describe("validateLensLabConfig", () => {
  it("accepts the packaged FL-23 lens config, owner-reviewed, without warnings", () => {
    expect(validateLensLabConfig(base)).toMatchObject({ ok: true, warnings: [] });
  });
  it("E-03 rejects Guided, duplicate stations and a station without its settings", () => {
    expect(errorsOf({ modes: { explore: true, guided: { rendererKey: "fl23" } } })).toEqual(["modes.guided: the lens bench config is Explore-only"]);
    expect(errorsOf({ stations: ["rays", "rays", "image", "focal"] })).toContain("stations: duplicate rays");
    expect(errorsOf({ focal: undefined })).toContain("focal: required by the focal station");
  });
  it("E-02 rejects a zero or out-of-range focal length and unknown lenses", () => {
    expect(errorsOf({ lenses: [...base.lenses, { id: "flat", labelVi: "Kính phẳng", focalMm: 0 }] })[0]).toMatch(/focalMm/);
    expect(errorsOf({ rays: { lensIds: ["converging-100", "glass"] } })).toContain("rays.lensIds: glass is not one of the lenses");
  });
  it("needs converging lenses with a reachable 2f for the focal length station", () => {
    expect(errorsOf({ focal: { ...base.focal!, lensIds: ["diverging-100"] } })).toContain("focal.lensIds: diverging-100 is diverging; the focal length station needs a converging lens");
    expect(errorsOf({ focal: { ...base.focal!, maxDistanceMm: 250 } })).toEqual(["focal: converging-150 needs the object at 300 mm (2f) on a reachable step"]);
  });
  it("needs converging magnifiers that can be placed inside their focal length", () => {
    expect(errorsOf({ magnifier: { ...base.magnifier!, lensIds: ["diverging-100"] } })).toContain("magnifier.lensIds: diverging-100 is diverging; a magnifier is a converging lens");
    expect(errorsOf({ magnifier: { ...base.magnifier!, minDistanceMm: 60 } })).toContain("magnifier: loupe-50 can never be placed inside its focal length (50 mm)");
  });
  it("keeps apparatus and stations consistent", () => {
    const raysOnly = { stations: ["rays"], image: undefined, focal: undefined, magnifier: undefined };
    expect(errorsOf(raysOnly)).toEqual([
      "enabledApparatus: object_lamp belongs to a station that is not enabled",
      "enabledApparatus: screen belongs to a station that is not enabled",
      "enabledApparatus: magnifier belongs to a station that is not enabled",
      "enabledApparatus: grid belongs to a station that is not enabled",
    ]);
    expect(errorsOf({ ...raysOnly, enabledApparatus: base.enabledApparatus.slice(0, 2) })).toEqual([]);
    expect(errorsOf({ enabledApparatus: base.enabledApparatus.filter((item) => item.kind !== "grid") })).toEqual(["enabledApparatus: the stations need grid"]);
  });
});
