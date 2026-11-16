/** Fluid bench (K3) Explore config: FL-04 liquid pressure (spec fl-04-liquid-pressure-explore-spec.md). */
import { z } from "zod";
import { exploreLabEnvelopeSchema, observationPromptSchema } from "../explore/envelope";

export const FLUID_KIT = "k3-fluid-bench@1" as const;
export const FLUID_ENGINE = "fluid-pressure@1.0.0" as const;
export const FLUID_MODEL_VERSION = "1.0.0" as const;
export const APPARATUS_KINDS = ["tall_tank", "membrane_probe", "piston_pair", "weight_set"] as const;
export const MEASUREMENTS = ["depth_ruler"] as const;
export const STATIONS = ["depth-probe", "pistons"] as const;
/** Water weight density d = 10 000 N/m³ (the textbook's P = 10m), so pressure grows 10 Pa per mm of depth. */
export const WATER_WEIGHT_DENSITY_N_PER_M3 = 10000;
export const WATER_PASCALS_PER_MM = WATER_WEIGHT_DENSITY_N_PER_M3 / 1000;
export const MODEL_LIMITATIONS = ["gauge_pressure_only", "ideal_membrane", "pistons_massless_frictionless", "direction_only"] as const;

const int = z.number().int();
const positive = int.positive();

export const depthProbeSettingsSchema = z.object({
  tankHeightMm: positive.max(600),
  waterLevelMm: positive,
  maxDepthMm: positive,
  depthStepMm: positive,
  /** Height of the side holes A and B above the bottom membrane C. */
  sideHoleOffsetMm: positive,
  positionsMm: z.array(int.min(-200).max(200)).min(1).max(7),
}).strict();

export const pistonSettingsSchema = z.object({
  /** Piston (1) and piston (2) cross-sections. */
  areasMm2: z.tuple([positive.max(100000), positive.max(100000)]),
  weightMilliNewtons: positive.max(10000),
  weightCount: positive.max(24),
  maxPerPan: positive.max(12),
}).strict();

export const fluidLabConfigSchema = exploreLabEnvelopeSchema.extend({
  schema: z.literal("k3-fluid-config/1"),
  catalogId: z.literal("FL-04"),
  kit: z.literal(FLUID_KIT),
  engine: z.literal(FLUID_ENGINE),
  liquid: z.object({ id: z.literal("water"), weightDensityNPerM3: z.literal(WATER_WEIGHT_DENSITY_N_PER_M3) }).strict(),
  stations: z.array(z.enum(STATIONS)).min(1).max(2),
  depthProbe: depthProbeSettingsSchema.optional(),
  pistons: pistonSettingsSchema.optional(),
  display: z.object({ pressureReading: z.boolean(), deformationLevels: int.min(3).max(8) }).strict(),
  enabledApparatus: z.array(exploreLabEnvelopeSchema.shape.enabledApparatus.element.extend({ kind: z.enum(APPARATUS_KINDS) })).min(2).max(4),
  measurements: z.array(z.enum(MEASUREMENTS)),
  pedagogy: exploreLabEnvelopeSchema.shape.pedagogy.extend({ observationPrompts: z.array(observationPromptSchema).max(3).optional() }),
});

export type FluidLabConfig = z.infer<typeof fluidLabConfigSchema>;
export type FluidStation = typeof STATIONS[number];
export type FluidApparatusKind = typeof APPARATUS_KINDS[number];
export type DepthProbeSettings = z.infer<typeof depthProbeSettingsSchema>;
export type PistonSettings = z.infer<typeof pistonSettingsSchema>;
