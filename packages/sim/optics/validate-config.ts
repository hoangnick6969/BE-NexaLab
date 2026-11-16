/** Validates an optics bench config: schema, then the stations against the media, the prism and the apparatus. */
import { REFRACTION_ENGINE, refractionLabConfigSchema, type RefractionLabConfig } from "./contracts";
import { minExitIncidenceDeg } from "./refraction";

export type RefractionConfigValidation =
  | { ok: true; config: RefractionLabConfig; warnings: string[] }
  | { ok: false; errors: string[]; warnings: string[] };

const duplicates = <T>(values: readonly T[]) => [...new Set(values.filter((value, index) => values.indexOf(value) !== index))];
const STATION_APPARATUS = {
  "into-block": ["light_source", "protractor_disk", "half_cylinder", "measurement_table"],
  "out-of-block": ["light_source", "protractor_disk", "half_cylinder"],
  prism: ["light_source", "protractor_disk", "prism"],
} as const;
/** Optional items and the station they belong to (the screen is required when white light is on). */
const OPTIONAL_APPARATUS = { speed_card: "into-block", screen: "prism" } as const;

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

  const prism = config.prism;
  if (config.stations.includes("prism")) {
    if (config.engine !== REFRACTION_ENGINE) errors.push(`engine: the prism station needs ${REFRACTION_ENGINE}`);
    if (!prism) errors.push("prism: required by the prism station");
    else {
      const medium = config.media.find((item) => item.id === prism.mediumId);
      if (!medium) errors.push(`prism.mediumId: ${prism.mediumId} is not one of the media`);
      if (prism.minIncidenceDeg >= prism.maxIncidenceDeg) errors.push("prism: minIncidenceDeg must be below maxIncidenceDeg");
      for (const id of duplicates(prism.spectrum.map((colour) => colour.id))) errors.push(`prism.spectrum: duplicate id ${id}`);
      prism.spectrum.forEach((colour, index) => {
        if (index > 0 && colour.indexMilli <= prism.spectrum[index - 1].indexMilli) errors.push(`prism.spectrum: ${colour.id} must bend more than ${prism.spectrum[index - 1].id} (order from red to violet)`);
      });
      // Every ray the student can make, laser or any colour, must leave through the second face (spec §13.2).
      const indices = [...(medium ? [{ id: medium.id, indexMilli: medium.indexMilli }] : []), ...(prism.whiteLight ? prism.spectrum : [])];
      for (const item of indices) {
        const least = minExitIncidenceDeg(item.indexMilli, prism.apexDeg);
        if (prism.minIncidenceDeg < least) errors.push(`prism.minIncidenceDeg: ${item.id} reflects totally inside the prism below ${Math.ceil(least)}°`);
      }
      if (prism.whiteLight && !kinds.includes("screen")) errors.push("enabledApparatus: white light needs a screen");
    }
  } else if (prism) errors.push("prism: set without the prism station");

  if (config.media.length < 2 && (config.stations.includes("into-block") || config.stations.includes("out-of-block"))) warnings.push("media: one medium only, students cannot compare how much each one bends light");
  if (config.modes.guided) errors.push("modes.guided: the optics bench config is Explore-only");
  if (config.review.status === "draft") warnings.push("review.status: draft (refractive indices and the disk setup wait for owner review)");

  return errors.length ? { ok: false, errors, warnings } : { ok: true, config, warnings };
}
