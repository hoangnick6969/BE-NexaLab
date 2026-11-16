/** Validates an optics bench config: schema, then the stations against the media and the apparatus. */
import { refractionLabConfigSchema, type RefractionLabConfig } from "./contracts";

export type RefractionConfigValidation =
  | { ok: true; config: RefractionLabConfig; warnings: string[] }
  | { ok: false; errors: string[]; warnings: string[] };

const duplicates = <T>(values: readonly T[]) => [...new Set(values.filter((value, index) => values.indexOf(value) !== index))];
const STATION_APPARATUS = {
  "into-block": ["light_source", "protractor_disk", "half_cylinder", "measurement_table"],
  "out-of-block": ["light_source", "protractor_disk", "half_cylinder"],
} as const;
/** Optional items and the station they belong to. */
const OPTIONAL_APPARATUS = { speed_card: "into-block" } as const;

export function validateRefractionLabConfig(raw: unknown): RefractionConfigValidation {
  const parsed = refractionLabConfigSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, errors: parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`), warnings: [] };
  const config = parsed.data;
  const errors: string[] = [];
  const warnings: string[] = [];

  for (const station of duplicates(config.stations)) errors.push(`stations: duplicate ${station}`);
  for (const id of duplicates(config.media.map((medium) => medium.id))) errors.push(`media: duplicate id ${id}`);
  for (const index of duplicates(config.media.map((medium) => medium.indexMilli))) errors.push(`media: two media share the index ${index}`);
  for (const id of duplicates(config.enabledApparatus.map((item) => item.id))) errors.push(`enabledApparatus: duplicate id ${id}`);
  const kinds = config.enabledApparatus.map((item) => item.kind);
  for (const kind of duplicates(kinds)) errors.push(`enabledApparatus: at most one ${kind}`);
  const needed = new Set<string>(config.stations.flatMap((station) => [...STATION_APPARATUS[station]]));
  for (const kind of needed) if (!kinds.includes(kind as never)) errors.push(`enabledApparatus: the stations need ${kind}`);
  for (const kind of kinds) {
    const owner = OPTIONAL_APPARATUS[kind as keyof typeof OPTIONAL_APPARATUS];
    if (owner ? !config.stations.includes(owner) : !needed.has(kind)) errors.push(`enabledApparatus: ${kind} belongs to a station that is not enabled`);
  }

  if (config.stations.includes("into-block")) {
    if (!config.intoBlock) errors.push("intoBlock: required by the into-block station");
  } else if (config.intoBlock) errors.push("intoBlock: set without the into-block station");
  if (config.stations.includes("out-of-block")) {
    if (!config.outOfBlock) errors.push("outOfBlock: required by the out-of-block station");
    // Station 2 must be able to reach total internal reflection for every medium.
    else for (const medium of config.media) {
      const critical = (Math.asin(1000 / medium.indexMilli) * 180) / Math.PI;
      if (critical >= config.outOfBlock.maxIncidenceDeg) errors.push(`outOfBlock.maxIncidenceDeg: ${medium.id} needs more than ${Math.floor(critical)}° to show total internal reflection`);
    }
  } else if (config.outOfBlock) errors.push("outOfBlock: set without the out-of-block station");

  if (config.media.length < 2) warnings.push("media: one medium only, students cannot compare how much each one bends light");
  if (config.modes.guided) errors.push("modes.guided: the optics bench config is Explore-only");
  if (config.review.status === "draft") warnings.push("review.status: draft (refractive indices and the disk setup wait for owner review)");

  return errors.length ? { ok: false, errors, warnings } : { ok: true, config, warnings };
}
