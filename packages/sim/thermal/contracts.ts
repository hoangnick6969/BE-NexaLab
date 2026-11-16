/** Thermal bench (K4) Explore config: FL-08 heat transfer (spec fl-08-heat-transfer-explore-spec.md). */
import { z } from "zod";
import { exploreLabEnvelopeSchema, observationPromptSchema } from "../explore/envelope";

export const THERMAL_KIT = "k4-thermal-bench@1" as const;
export const THERMAL_ENGINE = "heat-transfer@1.0.0" as const;
export const THERMAL_MODEL_VERSION = "1.0.0" as const;
export const STATIONS = ["conduction", "convection", "radiation"] as const;
export const APPARATUS_KINDS = ["rod_rack", "spirit_lamp", "test_tubes", "dye_flask", "heat_lamp", "coated_flask", "wood_screen", "thermometer", "stopwatch"] as const;
export const MEASUREMENTS = ["stopwatch", "thermometer", "conductivity_table"] as const;

/** SGK KHTN 8 (Kết nối tri thức) Bài 28, Bảng 28.1: thermal conductivity relative to air. */
export const CONDUCTIVITY_TABLE = {
  wool: { labelVi: "Len", relative: 2 },
  wood: { labelVi: "Gỗ", relative: 7 },
  water: { labelVi: "Nước", relative: 25 },
  glass: { labelVi: "Thuỷ tinh", relative: 44 },
  soil: { labelVi: "Đất", relative: 65 },
  steel: { labelVi: "Thép", relative: 2860 },
  aluminium: { labelVi: "Nhôm", relative: 8770 },
  copper: { labelVi: "Đồng", relative: 17370 },
} as const;
export type TableMaterial = keyof typeof CONDUCTIVITY_TABLE;
/** Materials that can be a rod on the rack (Q-3). */
export const ROD_MATERIALS = ["copper", "aluminium", "steel", "glass", "wood"] as const;
export type RodMaterial = typeof ROD_MATERIALS[number];
export const CONDUCTIVITY_SOURCE = "sgk-khtn8-kntt-b28-t28.1" as const;
export const MODEL_LIMITATIONS = ["illustrative_time_scale", "no_heat_loss", "rule_based_convection", "radiation_constants_assumed"] as const;

const int = z.number().int();
const positive = int.positive();

export const conductionSettingsSchema = z.object({
  rodLengthMm: positive.max(600),
  pinPositionsMm: z.array(positive).min(1).max(8),
  materials: z.array(z.enum(ROD_MATERIALS)).min(1).max(5),
  maxRods: positive.max(3),
  /** t = timeConstant × x² / K seconds (x in mm, K from Bảng 28.1). */
  timeConstant: positive.max(1000),
}).strict();

export const convectionSettingsSchema = z.object({
  tubes: z.array(z.object({ id: z.enum(["1", "2"]), wax: z.enum(["bottom", "top"]) }).strict()).min(1).max(2),
  meltSeconds: positive.max(600),
  dye: z.boolean(),
}).strict();

export const radiationSettingsSchema = z.object({
  startTenthsC: int.min(0).max(500),
  riseTenthsC: positive.max(300),
  tauSeconds: positive.max(600),
  /** Percent of the lamp's heating each surface takes in. */
  absorptance: z.object({ black: int.min(0).max(100), silver: int.min(0).max(100) }).strict(),
}).strict();

export const thermalLabConfigSchema = exploreLabEnvelopeSchema.extend({
  schema: z.literal("k4-thermal-config/1"),
  catalogId: z.literal("FL-08"),
  kit: z.literal(THERMAL_KIT),
  engine: z.literal(THERMAL_ENGINE),
  stations: z.array(z.enum(STATIONS)).min(1).max(3),
  clock: z.object({ maxSeconds: positive.max(3600), speeds: z.array(positive.max(120)).min(1).max(4) }).strict(),
  conduction: conductionSettingsSchema.optional(),
  convection: convectionSettingsSchema.optional(),
  radiation: radiationSettingsSchema.optional(),
  enabledApparatus: z.array(exploreLabEnvelopeSchema.shape.enabledApparatus.element.extend({ kind: z.enum(APPARATUS_KINDS) })).min(2).max(9),
  measurements: z.array(z.enum(MEASUREMENTS)),
  pedagogy: exploreLabEnvelopeSchema.shape.pedagogy.extend({ observationPrompts: z.array(observationPromptSchema).max(4).optional() }),
});

export type ThermalLabConfig = z.infer<typeof thermalLabConfigSchema>;
export type ThermalStation = typeof STATIONS[number];
export type ThermalApparatusKind = typeof APPARATUS_KINDS[number];
export type ConductionSettings = z.infer<typeof conductionSettingsSchema>;
export type ConvectionSettings = z.infer<typeof convectionSettingsSchema>;
export type RadiationSettings = z.infer<typeof radiationSettingsSchema>;
