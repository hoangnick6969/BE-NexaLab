/**
 * refraction@1.0.0: ray model of the two FL-23 stations (spec fl-23-refraction-explore-spec.md §3.1).
 * Snell law n₁ sin i = n₂ sin r with indices in thousandths; total internal reflection when n₁ sin i / n₂ > 1;
 * critical angle sin i_gh = n₂ / n₁; speed v = c / n. Angles in are whole degrees, angles out are reals
 * (rounded to 0.1° for display and the notebook). Brightness (Fresnel, unpolarised) is for drawing only.
 */
import { AIR_INDEX_MILLI, LIGHT_SPEED_KM_S, REFRACTION_ENGINE, type Medium, type OpticsStation, type RefractionLabConfig, type SpectrumColour } from "./contracts";

const RAD = Math.PI / 180;
const sinDeg = (deg: number) => Math.sin(deg * RAD);

export type Refraction =
  | { kind: "refracted"; refractionDeg: number; reflectance: number }
  | { kind: "total"; reflectance: 1 };

/** Fraction of light reflected at the surface (unpolarised Fresnel); 1 under total internal reflection. */
export function fresnelReflectance(n1Milli: number, n2Milli: number, incidenceDeg: number, refractionDeg: number) {
  const ci = Math.cos(incidenceDeg * RAD);
  const ct = Math.cos(refractionDeg * RAD);
  const rs = (n1Milli * ci - n2Milli * ct) / (n1Milli * ci + n2Milli * ct);
  const rp = (n1Milli * ct - n2Milli * ci) / (n1Milli * ct + n2Milli * ci);
  return (rs * rs + rp * rp) / 2;
}

/** Refraction at a flat surface from index n₁ to n₂ (thousandths) for an angle of incidence in degrees. */
export function refract(n1Milli: number, n2Milli: number, incidenceDeg: number): Refraction {
  const s = (n1Milli * sinDeg(incidenceDeg)) / n2Milli;
  if (s > 1) return { kind: "total", reflectance: 1 };
  const refractionDeg = Math.asin(s) / RAD;
  return { kind: "refracted", refractionDeg, reflectance: fresnelReflectance(n1Milli, n2Milli, incidenceDeg, refractionDeg) };
}

/** Critical angle in degrees from the denser index n₁ to n₂; null when n₁ ≤ n₂ (no total internal reflection possible). */
export function criticalAngleDeg(n1Milli: number, n2Milli: number): number | null {
  return n1Milli > n2Milli ? Math.asin(n2Milli / n1Milli) / RAD : null;
}

/** Speed of light in a medium, km/s (v = c / n). */
export const lightSpeedInMedium = (indexMilli: number) => (LIGHT_SPEED_KM_S * AIR_INDEX_MILLI) / indexMilli;

/** sin i / sin r of one reading; null at normal incidence (0/0). */
export function sineRatio(incidenceDeg: number, refractionDeg: number): number | null {
  return incidenceDeg === 0 ? null : sinDeg(incidenceDeg) / sinDeg(refractionDeg);
}

/** Rounds to 0.1° (display, notebook, comparisons with what a student reads on the disk). */
export const roundTenth = (value: number) => Math.round(value * 10) / 10;

export type RayState = { station: OpticsStation; mediumId: string; incidenceDeg: number };
export type RayReading = {
  station: OpticsStation;
  medium: Medium;
  incidenceDeg: number;
  /** Indices on the incident and the refracted side, thousandths. */
  fromIndexMilli: number;
  toIndexMilli: number;
  refraction: Refraction;
  /** Critical angle of the block towards air (station 2 reads it; station 1 shows that it never applies). */
  criticalDeg: number | null;
};
export type RayError = "STATION_NOT_ENABLED" | "MEDIUM_NOT_ALLOWED" | "INCIDENCE_NOT_INTEGER" | "INCIDENCE_OUT_OF_RANGE";
export type RayResult = ({ ok: true } & RayReading) | { ok: false; code: RayError };

type RayConfig = Pick<RefractionLabConfig, "stations" | "media" | "intoBlock" | "outOfBlock">;

export function evaluateRay(config: RayConfig, state: RayState): RayResult {
  const settings = state.station === "into-block" ? config.intoBlock : state.station === "out-of-block" ? config.outOfBlock : undefined;
  if (!config.stations.includes(state.station) || !settings) return { ok: false, code: "STATION_NOT_ENABLED" };
  const medium = config.media.find((item) => item.id === state.mediumId);
  if (!medium) return { ok: false, code: "MEDIUM_NOT_ALLOWED" };
  if (!Number.isInteger(state.incidenceDeg)) return { ok: false, code: "INCIDENCE_NOT_INTEGER" };
  if (state.incidenceDeg < 0 || state.incidenceDeg > settings.maxIncidenceDeg) return { ok: false, code: "INCIDENCE_OUT_OF_RANGE" };
  const [fromIndexMilli, toIndexMilli] = state.station === "into-block" ? [AIR_INDEX_MILLI, medium.indexMilli] : [medium.indexMilli, AIR_INDEX_MILLI];
  return {
    ok: true, station: state.station, medium, incidenceDeg: state.incidenceDeg, fromIndexMilli, toIndexMilli,
    refraction: refract(fromIndexMilli, toIndexMilli, state.incidenceDeg),
    criticalDeg: criticalAngleDeg(medium.indexMilli, AIR_INDEX_MILLI),
  };
}

export type TableRow = { mediumId: string; incidenceDeg: number; refractionDeg: number };
export type AppendRowResult = { ok: true; rows: TableRow[] } | { ok: false; code: "TABLE_FULL" | "ALREADY_MEASURED" | "NO_REFRACTED_RAY" };

/** Adds one station-1 reading to the table: at most `maxReadings` rows per medium, one row per angle. */
export function appendReading(rows: readonly TableRow[], reading: RayReading, maxReadings: number): AppendRowResult {
  if (reading.refraction.kind !== "refracted") return { ok: false, code: "NO_REFRACTED_RAY" };
  const same = rows.filter((row) => row.mediumId === reading.medium.id);
  if (same.some((row) => row.incidenceDeg === reading.incidenceDeg)) return { ok: false, code: "ALREADY_MEASURED" };
  if (same.length >= maxReadings) return { ok: false, code: "TABLE_FULL" };
  return { ok: true, rows: [...rows, { mediumId: reading.medium.id, incidenceDeg: reading.incidenceDeg, refractionDeg: reading.refraction.refractionDeg }] };
}

/** Whether a student's critical angle is within the tolerance of the model. */
export function checkCriticalGuess(guessDeg: number, criticalDeg: number, toleranceDeg: number) {
  return Number.isFinite(guessDeg) && Math.abs(guessDeg - criticalDeg) <= toleranceDeg;
}

/* ---------- Prism (engine 1.1.0, spec §13) ---------- */

export type PrismTrace =
  | { kind: "exits"; firstRefractionDeg: number; secondIncidenceDeg: number; exitDeg: number; deviationDeg: number }
  /** The ray reaches the second face beyond its critical angle and does not leave there. */
  | { kind: "total"; firstRefractionDeg: number; secondIncidenceDeg: number };

/** Ray through a prism of apex angle A in air: r₁ from Snell, r₂ = A − r₁, i₂ from Snell at the second face, D = i₁ + i₂ − A. */
export function tracePrism(indexMilli: number, apexDeg: number, incidenceDeg: number): PrismTrace {
  const firstRefractionDeg = Math.asin((AIR_INDEX_MILLI * sinDeg(incidenceDeg)) / indexMilli) / RAD;
  const secondIncidenceDeg = apexDeg - firstRefractionDeg;
  const s = (indexMilli * sinDeg(secondIncidenceDeg)) / AIR_INDEX_MILLI;
  if (s > 1) return { kind: "total", firstRefractionDeg, secondIncidenceDeg };
  const exitDeg = Math.asin(s) / RAD;
  return { kind: "exits", firstRefractionDeg, secondIncidenceDeg, exitDeg, deviationDeg: incidenceDeg + exitDeg - apexDeg };
}

/** Smallest angle of incidence for which the ray still leaves through the second face (0 when every angle does). */
export function minExitIncidenceDeg(indexMilli: number, apexDeg: number) {
  const critical = Math.asin(AIR_INDEX_MILLI / indexMilli) / RAD;
  const r1 = apexDeg - critical;
  if (r1 <= 0) return 0;
  return Math.asin(Math.min(1, (indexMilli * sinDeg(r1)) / AIR_INDEX_MILLI)) / RAD;
}

export type PrismLight = "laser" | "white";
export type PrismState = { incidenceDeg: number; light: PrismLight };
export type SpectrumTrace = { colour: SpectrumColour; trace: PrismTrace };
export type PrismReading = { incidenceDeg: number; apexDeg: number; medium: Medium; light: PrismLight; laser: PrismTrace; spectrum: SpectrumTrace[] };
export type PrismError = "STATION_NOT_ENABLED" | "ENGINE_TOO_OLD" | "MEDIUM_NOT_ALLOWED" | "WHITE_LIGHT_OFF" | "INCIDENCE_NOT_INTEGER" | "INCIDENCE_OUT_OF_RANGE";
export type PrismResult = ({ ok: true } & PrismReading) | { ok: false; code: PrismError };

type PrismConfig = Pick<RefractionLabConfig, "engine" | "stations" | "media" | "prism">;

/** Station 3: the laser path always; with white light, one trace per colour of the spectrum (least to most deviated). */
export function evaluatePrism(config: PrismConfig, state: PrismState): PrismResult {
  const settings = config.prism;
  if (!config.stations.includes("prism") || !settings) return { ok: false, code: "STATION_NOT_ENABLED" };
  if (config.engine !== REFRACTION_ENGINE) return { ok: false, code: "ENGINE_TOO_OLD" };
  const medium = config.media.find((item) => item.id === settings.mediumId);
  if (!medium) return { ok: false, code: "MEDIUM_NOT_ALLOWED" };
  if (state.light === "white" && !settings.whiteLight) return { ok: false, code: "WHITE_LIGHT_OFF" };
  if (!Number.isInteger(state.incidenceDeg)) return { ok: false, code: "INCIDENCE_NOT_INTEGER" };
  if (state.incidenceDeg < settings.minIncidenceDeg || state.incidenceDeg > settings.maxIncidenceDeg) return { ok: false, code: "INCIDENCE_OUT_OF_RANGE" };
  return {
    ok: true, incidenceDeg: state.incidenceDeg, apexDeg: settings.apexDeg, medium, light: state.light,
    laser: tracePrism(medium.indexMilli, settings.apexDeg, state.incidenceDeg),
    spectrum: state.light === "white" ? settings.spectrum.map((colour) => ({ colour, trace: tracePrism(colour.indexMilli, settings.apexDeg, state.incidenceDeg) })) : [],
  };
}
