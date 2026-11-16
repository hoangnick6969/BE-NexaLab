/** Validates a thermal bench config: schema, then the station settings against each other and the apparatus. */
import { thermalLabConfigSchema, type ThermalLabConfig } from "./contracts";

export type ThermalConfigValidation =
  | { ok: true; config: ThermalLabConfig; warnings: string[] }
  | { ok: false; errors: string[]; warnings: string[] };

const duplicates = <T>(values: readonly T[]) => [...new Set(values.filter((value, index) => values.indexOf(value) !== index))];
const STATION_APPARATUS = {
  conduction: ["rod_rack", "spirit_lamp", "stopwatch"],
  convection: ["test_tubes", "spirit_lamp", "stopwatch"],
  radiation: ["heat_lamp", "coated_flask", "wood_screen", "thermometer", "stopwatch"],
} as const;
const OPTIONAL_APPARATUS = { convection: ["dye_flask"] } as const;

export function validateThermalLabConfig(raw: unknown): ThermalConfigValidation {
  const parsed = thermalLabConfigSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, errors: parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`), warnings: [] };
  const config = parsed.data;
  const errors: string[] = [];
  const warnings: string[] = [];

  for (const station of duplicates(config.stations)) errors.push(`stations: duplicate ${station}`);
  for (const id of duplicates(config.enabledApparatus.map((item) => item.id))) errors.push(`enabledApparatus: duplicate id ${id}`);
  const kinds = config.enabledApparatus.map((item) => item.kind);
  for (const kind of duplicates(kinds)) errors.push(`enabledApparatus: at most one ${kind}`);
  const needed = new Set<string>(config.stations.flatMap((station) => [...STATION_APPARATUS[station]]));
  const allowed = new Set<string>([...needed, ...(config.stations.includes("convection") ? OPTIONAL_APPARATUS.convection : [])]);
  for (const kind of needed) if (!kinds.includes(kind as never)) errors.push(`enabledApparatus: the stations need ${kind}`);
  for (const kind of kinds) if (!allowed.has(kind)) errors.push(`enabledApparatus: ${kind} belongs to a station that is not enabled`);
  for (const speed of duplicates(config.clock.speeds)) errors.push(`clock.speeds: duplicate ${speed}`);

  const conduction = config.conduction;
  if (config.stations.includes("conduction")) {
    if (!conduction) errors.push("conduction: required by the conduction station");
    else {
      const pins = conduction.pinPositionsMm;
      if (pins.some((x, index) => index > 0 && x <= pins[index - 1])) errors.push("conduction.pinPositionsMm: positions must increase from end A");
      if (pins.some((x) => x >= conduction.rodLengthMm)) errors.push("conduction.pinPositionsMm: a pin is beyond the rod");
      for (const material of duplicates(conduction.materials)) errors.push(`conduction.materials: duplicate ${material}`);
    }
  } else if (conduction) errors.push("conduction: set without the conduction station");

  const convection = config.convection;
  if (config.stations.includes("convection")) {
    if (!convection) errors.push("convection: required by the convection station");
    else {
      for (const id of duplicates(convection.tubes.map((tube) => tube.id))) errors.push(`convection.tubes: duplicate tube ${id}`);
      if (convection.meltSeconds > config.clock.maxSeconds) errors.push("convection.meltSeconds: longer than the observation window");
      if (convection.dye && !kinds.includes("dye_flask")) errors.push("convection.dye: needs a dye_flask");
    }
  } else if (convection) errors.push("convection: set without the convection station");

  const radiation = config.radiation;
  if (config.stations.includes("radiation")) {
    if (!radiation) errors.push("radiation: required by the radiation station");
    else if (radiation.absorptance.silver > radiation.absorptance.black) errors.push("radiation.absorptance: a silvered surface cannot take in more than a black one");
  } else if (radiation) errors.push("radiation: set without the radiation station");

  if (config.modes.guided) errors.push("modes.guided: the thermal bench config is Explore-only");
  if (config.review.status === "draft") warnings.push("review.status: draft (time scale and radiation constants are technical assumptions, waiting for a physics reviewer)");

  return errors.length ? { ok: false, errors, warnings } : { ok: true, config, warnings };
}
