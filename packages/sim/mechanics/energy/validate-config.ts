/** Validates a mechanical energy bench config: schema, then the station settings against each other and the apparatus. */
import { energyLabConfigSchema, type EnergyLabConfig } from "./contracts";

export type EnergyConfigValidation =
  | { ok: true; config: EnergyLabConfig; warnings: string[] }
  | { ok: false; errors: string[]; warnings: string[] };

const duplicates = <T>(values: readonly T[]) => [...new Set(values.filter((value, index) => values.indexOf(value) !== index))];
const STATION_APPARATUS = { pendulum: ["pendulum", "energy_bars"], hoist: ["hoist", "spring_gauge", "ruler", "stopwatch"] } as const;

export function validateEnergyLabConfig(raw: unknown): EnergyConfigValidation {
  const parsed = energyLabConfigSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, errors: parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`), warnings: [] };
  const config = parsed.data;
  const errors: string[] = [];
  const warnings: string[] = [];

  for (const station of duplicates(config.stations)) errors.push(`stations: duplicate ${station}`);
  for (const id of duplicates(config.enabledApparatus.map((item) => item.id))) errors.push(`enabledApparatus: duplicate id ${id}`);
  const kinds = config.enabledApparatus.map((item) => item.kind);
  for (const kind of duplicates(kinds)) errors.push(`enabledApparatus: at most one ${kind}`);
  const needed = new Set<string>(config.stations.flatMap((station) => [...STATION_APPARATUS[station]]));
  for (const kind of needed) if (!kinds.includes(kind as never)) errors.push(`enabledApparatus: the stations need ${kind}`);
  for (const kind of kinds) if (!needed.has(kind)) errors.push(`enabledApparatus: ${kind} belongs to a station that is not enabled`);

  const pendulum = config.pendulum;
  if (config.stations.includes("pendulum")) {
    if (!pendulum) errors.push("pendulum: required by the pendulum station");
    else {
      for (const mass of duplicates(pendulum.massesG)) errors.push(`pendulum.massesG: duplicate ${mass}`);
      if (pendulum.maxDropHeightMm >= pendulum.lengthMm) errors.push("pendulum: maxDropHeightMm must stay below lengthMm");
      if (pendulum.maxDropHeightMm % pendulum.heightStepMm !== 0) errors.push("pendulum: maxDropHeightMm is not a multiple of heightStepMm");
      if (pendulum.heightStepMm % 2 !== 0) errors.push("pendulum: heightStepMm must be even so the halfway checkpoint stays on whole millimetres");
    }
  } else if (pendulum) errors.push("pendulum: set without the pendulum station");

  const hoist = config.hoist;
  if (config.stations.includes("hoist")) {
    if (!hoist) errors.push("hoist: required by the hoist station");
    else {
      for (const mass of duplicates(hoist.massesG)) errors.push(`hoist.massesG: duplicate ${mass}`);
      if (hoist.minDistanceMm > hoist.maxDistanceMm) errors.push("hoist: minDistanceMm is above maxDistanceMm");
      else if ((hoist.maxDistanceMm - hoist.minDistanceMm) % hoist.distanceStepMm !== 0) errors.push("hoist: the distance range is not a multiple of distanceStepMm");
      for (const id of duplicates(hoist.motors.map((motor) => motor.id))) errors.push(`hoist.motors: duplicate ${id}`);
      if (hoist.motors.length === 2 && hoist.motors[0].speedMmPerS === hoist.motors[1].speedMmPerS) errors.push("hoist.motors: the two motors need different speeds");
      if (hoist.motors.length < 2) warnings.push("hoist.motors: one motor only, students cannot compare power");
    }
  } else if (hoist) errors.push("hoist: set without the hoist station");

  if (config.modes.guided) errors.push("modes.guided: the energy bench config is Explore-only");
  if (config.review.status === "draft") warnings.push("review.status: draft (the P = 10·m convention and the motor speeds wait for owner review)");

  return errors.length ? { ok: false, errors, warnings } : { ok: true, config, warnings };
}
