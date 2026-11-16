import { describe, expect, it } from "vitest";
import { blurRadiusMm, checkReading, evaluateFocal, evaluateImage, evaluateMagnifier, evaluateRays, FL23_LENS_EXPLORE_CONFIG as config, imageOf, magnifierPower, type Image } from "./index";

const image = (lensId: string, distanceMm: number): Image => {
  const result = evaluateImage(config, { lensId, distanceMm });
  if (!result.ok) throw new Error(result.code);
  return result.image;
};
const real = (value: Image) => { if (value.kind !== "image") throw new Error("no image"); return value; };

describe("thin-lens@1.0.0 golden (spec §3.2)", () => {
  it("L-01 f 100, d 300: d′ 150, k −0.5, real, inverted, smaller", () => {
    expect(real(image("converging-100", 300))).toMatchObject({ distanceMm: 150, magnification: -0.5, heightMm: -10, real: true, upright: false, size: "smaller" });
  });
  it("L-02 f 100, d 200 (2f): d′ 200, equal size", () => {
    expect(real(image("converging-100", 200))).toMatchObject({ distanceMm: 200, magnification: -1, real: true, size: "equal" });
  });
  it("L-03 f 100, d 150: d′ 300, k −2, larger", () => {
    expect(real(image("converging-100", 150))).toMatchObject({ distanceMm: 300, magnification: -2, heightMm: -40, size: "larger" });
  });
  it("L-04 f 100, d = f: no image", () => {
    expect(image("converging-100", 100)).toEqual({ kind: "none" });
  });
  it("L-05 f 100, d 50: d′ −100, k 2, virtual, upright, larger", () => {
    expect(real(image("converging-100", 50))).toMatchObject({ distanceMm: -100, magnification: 2, heightMm: 40, real: false, upright: true, size: "larger" });
  });
  it("L-06 diverging f −100, d 200: d′ ≈ −66.7, k ≈ 0.33; every position gives a smaller virtual upright image", () => {
    const value = real(image("diverging-100", 200));
    expect(value.distanceMm).toBeCloseTo(-66.667, 2);
    expect(value.magnification).toBeCloseTo(1 / 3, 6);
    for (let d = 20; d <= 400; d += 10) expect(real(image("diverging-100", d))).toMatchObject({ real: false, upright: true, size: "smaller" });
  });
  it("L-07 focal length: object and screen symmetric are sharp and equal only at d = 2f, where L = 4f is the smallest", () => {
    const at = (d: number) => { const result = evaluateFocal(config, { lensId: "converging-100", objectDistanceMm: d }); if (!result.ok) throw new Error(result.code); return result; };
    expect(at(200)).toMatchObject({ separationMm: 400, blurMm: 0, sharpAndEqual: true });
    expect(at(180).sharpAndEqual).toBe(false);
    expect(at(180).blurMm).toBeGreaterThan(0);
    expect(at(220).blurMm).toBeGreaterThan(0);
    expect(at(80).blurMm).toBe(Number.POSITIVE_INFINITY);
    // For a fixed lens, object-to-image distance d + d′ is smallest (4f) at d = 2f.
    for (const d of [150, 180, 220, 300]) { const value = real(imageOf(100, d, 1)); expect(d + value.distanceMm).toBeGreaterThan(400); }
    expect(evaluateFocal(config, { lensId: "converging-150", objectDistanceMm: 300 })).toMatchObject({ ok: true, separationMm: 600, sharpAndEqual: true });
  });
  it("L-08 magnifier: G 5× for f 50 mm, 2.5× for f 100 mm; inside f the image is virtual and larger", () => {
    expect(magnifierPower(50)).toBe(5);
    expect(magnifierPower(100)).toBe(2.5);
    expect(evaluateMagnifier(config, { lensId: "loupe-50", distanceMm: 40 })).toMatchObject({ ok: true, power: 5, usable: true, image: { real: false, upright: true, size: "larger" } });
    expect(evaluateMagnifier(config, { lensId: "loupe-50", distanceMm: 80 })).toMatchObject({ ok: true, usable: false, image: { real: true } });
    expect(evaluateMagnifier(config, { lensId: "loupe-50", distanceMm: 50 })).toMatchObject({ ok: true, usable: false, image: { kind: "none" } });
  });
  it("checks a reading within the tolerance", () => {
    expect(checkReading(152, 150, 5)).toBe(true);
    expect(checkReading(156, 150, 5)).toBe(false);
    expect(checkReading(Number.NaN, 150, 5)).toBe(false);
    expect(blurRadiusMm(-100, 200, 200)).toBe(Number.POSITIVE_INFINITY);
  });
});

describe("thin-lens@1.0.0 errors (spec §3.2)", () => {
  it("E-01 refuses a distance outside the range, off the step or not whole", () => {
    expect(evaluateImage(config, { lensId: "converging-100", distanceMm: 410 })).toEqual({ ok: false, code: "DISTANCE_OUT_OF_RANGE" });
    expect(evaluateImage(config, { lensId: "converging-100", distanceMm: 25 })).toEqual({ ok: false, code: "DISTANCE_OFF_STEP" });
    expect(evaluateImage(config, { lensId: "converging-100", distanceMm: 30.5 })).toEqual({ ok: false, code: "DISTANCE_NOT_INTEGER" });
  });
  it("E-02 refuses a lens not offered at the station", () => {
    expect(evaluateFocal(config, { lensId: "diverging-100", objectDistanceMm: 200 })).toEqual({ ok: false, code: "LENS_NOT_ALLOWED" });
    expect(evaluateRays(config, "loupe-50")).toEqual({ ok: false, code: "LENS_NOT_ALLOWED" });
    expect(evaluateRays({ ...config, stations: ["image"], rays: undefined }, "converging-100")).toEqual({ ok: false, code: "STATION_NOT_ENABLED" });
  });
});
