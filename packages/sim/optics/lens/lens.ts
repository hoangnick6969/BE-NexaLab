/**
 * thin-lens@1.0.0 (spec fl-23-thin-lens-explore-spec.md §3.1): d′ = d·f / (d − f), k = −d′/d, h′ = k·h (mm).
 * d′ > 0 real image behind the lens, d′ < 0 virtual image on the object's side; f < 0 diverging; d = f gives no image.
 * Blur on the screen and the magnifier view are for drawing; G = 250/f (mm), the SGK's 25/f in cm.
 */
import { LENS_RADIUS_MM, MAGNIFIER_NEAR_POINT_MM, type Lens, type LensLabConfig } from "./contracts";

export type Image =
  | { kind: "none" }
  | { kind: "image"; distanceMm: number; magnification: number; heightMm: number; real: boolean; upright: boolean; size: "larger" | "equal" | "smaller" };

const EPS = 1e-9;

export function imageOf(focalMm: number, distanceMm: number, heightMm: number): Image {
  if (Math.abs(distanceMm - focalMm) < EPS) return { kind: "none" };
  const image = (distanceMm * focalMm) / (distanceMm - focalMm);
  const magnification = -image / distanceMm;
  const size = Math.abs(Math.abs(magnification) - 1) < 1e-6 ? "equal" : Math.abs(magnification) > 1 ? "larger" : "smaller";
  return { kind: "image", distanceMm: image, magnification, heightMm: magnification * heightMm, real: image > 0, upright: magnification > 0, size };
}

/** Radius of the blur spot on a screen at `screenMm` behind the lens (0 when sharp); Infinity when no real image forms. */
export function blurRadiusMm(focalMm: number, distanceMm: number, screenMm: number) {
  const image = imageOf(focalMm, distanceMm, 1);
  if (image.kind === "none" || !image.real) return Number.POSITIVE_INFINITY;
  return (LENS_RADIUS_MM * Math.abs(screenMm - image.distanceMm)) / image.distanceMm;
}

/** Magnifying power written on a magnifier, G = 250/f (f in mm). */
export const magnifierPower = (focalMm: number) => MAGNIFIER_NEAR_POINT_MM / focalMm;

/** Whether a value a student read (mm) is within the tolerance of the model. */
export const checkReading = (typedMm: number, actualMm: number, toleranceMm: number) => Number.isFinite(typedMm) && Math.abs(typedMm - actualMm) <= toleranceMm;

type Range = { minDistanceMm: number; maxDistanceMm: number; stepMm: number };
type RangeError = "DISTANCE_NOT_INTEGER" | "DISTANCE_OUT_OF_RANGE" | "DISTANCE_OFF_STEP";
function checkDistance(range: Range, distanceMm: number): RangeError | null {
  if (!Number.isInteger(distanceMm)) return "DISTANCE_NOT_INTEGER";
  if (distanceMm < range.minDistanceMm || distanceMm > range.maxDistanceMm) return "DISTANCE_OUT_OF_RANGE";
  if ((distanceMm - range.minDistanceMm) % range.stepMm !== 0) return "DISTANCE_OFF_STEP";
  return null;
}

export type LensError = "STATION_NOT_ENABLED" | "LENS_NOT_ALLOWED" | RangeError;
type LensConfig = Pick<LensLabConfig, "stations" | "lenses" | "rays" | "image" | "focal" | "magnifier">;
const lensFor = (config: LensConfig, ids: readonly string[] | undefined, lensId: string): Lens | null =>
  ids?.includes(lensId) ? config.lenses.find((lens) => lens.id === lensId) ?? null : null;

/** Station 1: which lens is on the bench (the special rays are drawn from its focal length). */
export function evaluateRays(config: LensConfig, lensId: string): ({ ok: true; lens: Lens }) | { ok: false; code: LensError } {
  if (!config.stations.includes("rays") || !config.rays) return { ok: false, code: "STATION_NOT_ENABLED" };
  const lens = lensFor(config, config.rays.lensIds, lensId);
  return lens ? { ok: true, lens } : { ok: false, code: "LENS_NOT_ALLOWED" };
}

export type ImageReading = { lens: Lens; distanceMm: number; objectHeightMm: number; image: Image };
/** Station 2: the image of an object at `distanceMm`. */
export function evaluateImage(config: LensConfig, state: { lensId: string; distanceMm: number }): ({ ok: true } & ImageReading) | { ok: false; code: LensError } {
  const settings = config.image;
  if (!config.stations.includes("image") || !settings) return { ok: false, code: "STATION_NOT_ENABLED" };
  const lens = lensFor(config, settings.lensIds, state.lensId);
  if (!lens) return { ok: false, code: "LENS_NOT_ALLOWED" };
  const error = checkDistance(settings, state.distanceMm);
  if (error) return { ok: false, code: error };
  return { ok: true, lens, distanceMm: state.distanceMm, objectHeightMm: settings.objectHeightMm, image: imageOf(lens.focalMm, state.distanceMm, settings.objectHeightMm) };
}

export type FocalReading = { lens: Lens; objectDistanceMm: number; screenDistanceMm: number; separationMm: number; blurMm: number; image: Image; sharpAndEqual: boolean };
/** Station 3: object and screen symmetric about the lens at `objectDistanceMm` each; sharp and equal-sized only at d = d′ = 2f. */
export function evaluateFocal(config: LensConfig, state: { lensId: string; objectDistanceMm: number }): ({ ok: true } & FocalReading) | { ok: false; code: LensError } {
  const settings = config.focal;
  if (!config.stations.includes("focal") || !settings) return { ok: false, code: "STATION_NOT_ENABLED" };
  const lens = lensFor(config, settings.lensIds, state.lensId);
  if (!lens) return { ok: false, code: "LENS_NOT_ALLOWED" };
  const error = checkDistance(settings, state.objectDistanceMm);
  if (error) return { ok: false, code: error };
  const d = state.objectDistanceMm;
  const blurMm = blurRadiusMm(lens.focalMm, d, d);
  return { ok: true, lens, objectDistanceMm: d, screenDistanceMm: d, separationMm: 2 * d, blurMm, image: imageOf(lens.focalMm, d, 1), sharpAndEqual: d === 2 * lens.focalMm };
}

export type MagnifierReading = { lens: Lens; distanceMm: number; power: number; image: Image; usable: boolean };
/** Station 4: a magnifier at `distanceMm` from the object; usable as a magnifier only inside the focal length. */
export function evaluateMagnifier(config: LensConfig, state: { lensId: string; distanceMm: number }): ({ ok: true } & MagnifierReading) | { ok: false; code: LensError } {
  const settings = config.magnifier;
  if (!config.stations.includes("magnifier") || !settings) return { ok: false, code: "STATION_NOT_ENABLED" };
  const lens = lensFor(config, settings.lensIds, state.lensId);
  if (!lens) return { ok: false, code: "LENS_NOT_ALLOWED" };
  const error = checkDistance(settings, state.distanceMm);
  if (error) return { ok: false, code: error };
  const image = imageOf(lens.focalMm, state.distanceMm, 1);
  return { ok: true, lens, distanceMm: state.distanceMm, power: magnifierPower(lens.focalMm), image, usable: image.kind === "image" && !image.real };
}
