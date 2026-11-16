/** Validates a fluid bench config: schema, then the station settings against each other and the apparatus. */
import { fluidLabConfigSchema, type FluidLabConfig } from "./contracts";

export type FluidConfigValidation =
  | { ok: true; config: FluidLabConfig; warnings: string[] }
  | { ok: false; errors: string[]; warnings: string[] };

const duplicates = <T>(values: readonly T[]) => [...new Set(values.filter((value, index) => values.indexOf(value) !== index))];
const STATION_APPARATUS = { "depth-probe": ["tall_tank", "membrane_probe"], pistons: ["piston_pair", "weight_set"] } as const;

export function validateFluidLabConfig(raw: unknown): FluidConfigValidation {
  const parsed = fluidLabConfigSchema.safeParse(raw);
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

  const probe = config.depthProbe;
  if (config.stations.includes("depth-probe")) {
    if (!probe) errors.push("depthProbe: required by the depth-probe station");
    else {
      if (probe.waterLevelMm > probe.tankHeightMm) errors.push("depthProbe: waterLevelMm is above the tank");
      if (probe.maxDepthMm >= probe.waterLevelMm) errors.push("depthProbe: maxDepthMm must stay above the tank floor (below waterLevelMm)");
      if (probe.maxDepthMm % probe.depthStepMm !== 0) errors.push("depthProbe: maxDepthMm is not a multiple of depthStepMm");
      if (probe.sideHoleOffsetMm >= probe.maxDepthMm) errors.push("depthProbe: sideHoleOffsetMm must be below maxDepthMm");
      for (const position of duplicates(probe.positionsMm)) errors.push(`depthProbe.positionsMm: duplicate ${position}`);
      if (!probe.positionsMm.includes(0)) warnings.push("depthProbe.positionsMm: no centre position");
    }
  } else if (probe) errors.push("depthProbe: set without the depth-probe station");

  const pistons = config.pistons;
  if (config.stations.includes("pistons")) {
    if (!pistons) errors.push("pistons: required by the pistons station");
    else if (pistons.maxPerPan > pistons.weightCount) errors.push("pistons: maxPerPan is larger than weightCount");
  } else if (pistons) errors.push("pistons: set without the pistons station");

  if (config.modes.guided) errors.push("modes.guided: the fluid bench config is Explore-only");
  if (config.review.status === "draft") warnings.push("review.status: draft (model constants are technical assumptions, waiting for a physics reviewer)");

  return errors.length ? { ok: false, errors, warnings } : { ok: true, config, warnings };
}
