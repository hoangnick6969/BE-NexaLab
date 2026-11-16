/** Mechanical energy bench (K5) Explore config: FL-24 (spec fl-24-mechanical-energy-explore-spec.md). Independent from the lever bench. */
import { z } from "zod";
import { exploreLabEnvelopeSchema, observationPromptSchema } from "../../explore/envelope";

export const ENERGY_KIT = "k5-energy-bench@1" as const;
export const ENERGY_ENGINE = "mechanical-energy@1.0.0" as const;
export const ENERGY_MODEL_VERSION = "1.0.0" as const;
export const APPARATUS_KINDS = ["pendulum", "energy_bars", "hoist", "spring_gauge", "ruler", "stopwatch"] as const;
export const MEASUREMENTS = ["height_ruler", "force_gauge", "stopwatch"] as const;
export const STATIONS = ["pendulum", "hoist"] as const;
/** Five checkpoints of one swing: release point, halfway down, lowest point, halfway up, highest point on the other side. */
export const PENDULUM_POSITIONS = ["release", "mid-down", "lowest", "mid-up", "far-high"] as const;
/** Weight P = 10·m (the textbook convention), so a mass of m grams weighs 10·m mN. */
export const WEIGHT_MILLINEWTONS_PER_GRAM = 10;
export const MASS_STEP_G = 100;
export const MODEL_LIMITATIONS = ["no_friction", "no_air_resistance", "force_along_motion", "uniform_hoist"] as const;

const int = z.number().int();
const positive = int.positive();
const mass = positive.max(5000).refine((value) => value % MASS_STEP_G === 0, { message: `mass must be a multiple of ${MASS_STEP_G} g` });

export const pendulumSettingsSchema = z.object({
  /** Bob masses a student may pick, in grams (multiples of 100 g). */
  massesG: z.array(mass).min(1).max(8),
  /** String length; the highest release must stay below it. */
  lengthMm: positive.max(2000),
  maxDropHeightMm: positive.max(1000),
  heightStepMm: positive,
}).strict();

export const motorSchema = z.object({
  id: z.enum(["slow", "fast"]),
  labelVi: z.string().trim().min(1).max(40),
  /** Uniform lifting speed; the pull time is s / v. */
  speedMmPerS: positive.max(5000),
}).strict();

export const hoistSettingsSchema = z.object({
  massesG: z.array(mass).min(1).max(8),
  minDistanceMm: positive,
  maxDistanceMm: positive.max(2000),
  distanceStepMm: positive,
  motors: z.array(motorSchema).min(1).max(2),
}).strict();

export const energyLabConfigSchema = exploreLabEnvelopeSchema.extend({
  schema: z.literal("k5-energy-config/1"),
  catalogId: z.literal("FL-24"),
  kit: z.literal(ENERGY_KIT),
  engine: z.literal(ENERGY_ENGINE),
  weight: z.object({ milliNewtonsPerGram: z.literal(WEIGHT_MILLINEWTONS_PER_GRAM) }).strict(),
  stations: z.array(z.enum(STATIONS)).min(1).max(2),
  pendulum: pendulumSettingsSchema.optional(),
  hoist: hoistSettingsSchema.optional(),
  /** Energy bars are always drawn; `energyReadings` shows the mJ and mW numbers (hidden by default so students compute them). */
  display: z.object({ energyReadings: z.boolean() }).strict(),
  enabledApparatus: z.array(exploreLabEnvelopeSchema.shape.enabledApparatus.element.extend({ kind: z.enum(APPARATUS_KINDS) })).min(2).max(6),
  measurements: z.array(z.enum(MEASUREMENTS)),
  pedagogy: exploreLabEnvelopeSchema.shape.pedagogy.extend({ observationPrompts: z.array(observationPromptSchema).max(4).optional() }),
});

export type EnergyLabConfig = z.infer<typeof energyLabConfigSchema>;
export type EnergyStation = typeof STATIONS[number];
export type EnergyApparatusKind = typeof APPARATUS_KINDS[number];
export type PendulumPosition = typeof PENDULUM_POSITIONS[number];
export type PendulumSettings = z.infer<typeof pendulumSettingsSchema>;
export type HoistSettings = z.infer<typeof hoistSettingsSchema>;
export type HoistMotor = z.infer<typeof motorSchema>;
