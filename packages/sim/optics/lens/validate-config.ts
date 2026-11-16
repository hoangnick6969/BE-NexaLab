/** Validates a lens bench config: schema, then stations against their settings, the lenses and the apparatus. */
import { lensLabConfigSchema, type LensLabConfig } from "./contracts";

export type LensConfigValidation =
  | { ok: true; config: LensLabConfig; warnings: string[] }
  | { ok: false; errors: string[]; warnings: string[] };

const duplicates = <T>(values: readonly T[]) => [...new Set(values.filter((value, index) => values.indexOf(value) !== index))];
const STATION_APPARATUS = {
  rays: ["optical_bench", "lens"],
  image: ["optical_bench", "lens", "object_lamp", "grid"],
  focal: ["optical_bench", "lens", "object_lamp", "screen"],
  magnifier: ["object_lamp", "magnifier"],
} as const;

export function validateLensLabConfig(raw: unknown): LensConfigValidation {
  const parsed = lensLabConfigSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, errors: parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`), warnings: [] };
  const config = parsed.data;
  const errors: string[] = [];
  const warnings: string[] = [];
  const lens = (lensId: string) => config.lenses.find((item) => item.id === lensId);

  for (const station of duplicates(config.stations)) errors.push(`stations: duplicate ${station}`);
  for (const lensId of duplicates(config.lenses.map((item) => item.id))) errors.push(`lenses: duplicate id ${lensId}`);
  for (const id of duplicates(config.enabledApparatus.map((item) => item.id))) errors.push(`enabledApparatus: duplicate id ${id}`);
  const kinds = config.enabledApparatus.map((item) => item.kind);
  for (const kind of duplicates(kinds)) errors.push(`enabledApparatus: at most one ${kind}`);
  const needed = new Set<string>(config.stations.flatMap((station) => [...STATION_APPARATUS[station]]));
  for (const kind of needed) if (!kinds.includes(kind as never)) errors.push(`enabledApparatus: the stations need ${kind}`);
  for (const kind of kinds) if (!needed.has(kind)) errors.push(`enabledApparatus: ${kind} belongs to a station that is not enabled`);

  for (const station of ["rays", "image", "focal", "magnifier"] as const) {
    const settings = config[station];
    if (config.stations.includes(station) && !settings) errors.push(`${station}: required by the ${station} station`);
    if (!config.stations.includes(station) && settings) errors.push(`${station}: set without the ${station} station`);
    if (!settings) continue;
    for (const lensId of duplicates(settings.lensIds)) errors.push(`${station}.lensIds: duplicate ${lensId}`);
    for (const lensId of settings.lensIds) if (!lens(lensId)) errors.push(`${station}.lensIds: ${lensId} is not one of the lenses`);
    if ("minDistanceMm" in settings) {
      if (settings.minDistanceMm >= settings.maxDistanceMm) errors.push(`${station}: minDistanceMm must be below maxDistanceMm`);
      else if ((settings.maxDistanceMm - settings.minDistanceMm) % settings.stepMm !== 0) errors.push(`${station}: the distance range is not a multiple of stepMm`);
    }
  }
  // Focal length station: converging lenses whose 2f lies on a reachable step (spec §2.3).
  if (config.focal) for (const lensId of config.focal.lensIds) {
    const item = lens(lensId);
    if (!item) continue;
    if (item.focalMm <= 0) errors.push(`focal.lensIds: ${lensId} is diverging; the focal length station needs a converging lens`);
    else {
      const twoF = 2 * item.focalMm;
      if (twoF < config.focal.minDistanceMm || twoF > config.focal.maxDistanceMm || (twoF - config.focal.minDistanceMm) % config.focal.stepMm !== 0) errors.push(`focal: ${lensId} needs the object at ${twoF} mm (2f) on a reachable step`);
    }
  }
  // Magnifier: converging, and the student must be able to put it inside its focal length.
  if (config.magnifier) for (const lensId of config.magnifier.lensIds) {
    const item = lens(lensId);
    if (!item) continue;
    if (item.focalMm <= 0) errors.push(`magnifier.lensIds: ${lensId} is diverging; a magnifier is a converging lens`);
    else if (config.magnifier.minDistanceMm >= item.focalMm) errors.push(`magnifier: ${lensId} can never be placed inside its focal length (${item.focalMm} mm)`);
  }
  if (config.image && config.image.lensIds.every((lensId) => (lens(lensId)?.focalMm ?? 0) < 0)) warnings.push("image: diverging lenses only, students never see a real image");

  if (config.modes.guided) errors.push("modes.guided: the lens bench config is Explore-only");
  if (config.review.status === "draft") warnings.push("review.status: draft (lens set, focal length method and sign convention wait for owner review)");
  return errors.length ? { ok: false, errors, warnings } : { ok: true, config, warnings };
}
