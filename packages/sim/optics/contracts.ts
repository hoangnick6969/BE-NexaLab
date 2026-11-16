/** Optics bench (K6) Explore config: FL-23 refraction slice (spec fl-23-refraction-explore-spec.md). Independent from eye-optics (FL-25). */
import { z } from "zod";
import { exploreLabEnvelopeSchema, observationPromptSchema } from "../explore/envelope";

export const OPTICS_KIT = "k6-optics-bench@1" as const;
export const REFRACTION_ENGINE = "refraction@1.0.0" as const;
export const REFRACTION_MODEL_VERSION = "1.0.0" as const;
export const APPARATUS_KINDS = ["light_source", "protractor_disk", "half_cylinder", "measurement_table", "speed_card"] as const;
export const MEASUREMENTS = ["protractor", "critical_angle"] as const;
/** Station 1: light goes from air into the block (Snell law). Station 2: from the block out to air (total internal reflection). */
export const STATIONS = ["into-block", "out-of-block"] as const;
/** Refractive indices are stored in thousandths: air 1000, water 1333, glass 1500. */
export const AIR_INDEX_MILLI = 1000;
/** Speed of light in air (taken equal to vacuum), km/s. */
export const LIGHT_SPEED_KM_S = 300_000;
export const MODEL_LIMITATIONS = ["air_equals_vacuum", "single_wavelength", "ray_through_centre", "no_absorption"] as const;

const int = z.number().int();
const label = z.string().trim().min(1).max(40);

export const mediumSchema = z.object({
  id: z.string().regex(/^[a-z][a-z0-9-]{0,23}$/),
  labelVi: label,
  /** Refractive index of the block in thousandths; must be denser than air. */
  indexMilli: int.min(1001).max(2500),
}).strict();

export const intoBlockSettingsSchema = z.object({
  /** Largest angle of incidence the source can reach, whole degrees. */
  maxIncidenceDeg: int.min(10).max(89),
  /** Rows of the measurement table per medium. */
  maxReadings: int.min(1).max(6),
}).strict();

export const outOfBlockSettingsSchema = z.object({
  maxIncidenceDeg: int.min(10).max(89),
  /** "Kiểm tra" accepts a critical angle within this many degrees of the model. */
  criticalToleranceDeg: int.min(1).max(3),
}).strict();

export const refractionLabConfigSchema = exploreLabEnvelopeSchema.extend({
  schema: z.literal("k6-optics-config/1"),
  catalogId: z.literal("FL-23"),
  kit: z.literal(OPTICS_KIT),
  engine: z.literal(REFRACTION_ENGINE),
  lightSpeedKmS: z.literal(LIGHT_SPEED_KM_S),
  media: z.array(mediumSchema).min(1).max(3),
  stations: z.array(z.enum(STATIONS)).min(1).max(2),
  intoBlock: intoBlockSettingsSchema.optional(),
  outOfBlock: outOfBlockSettingsSchema.optional(),
  /** The angle read on the disk is always visible; `sineColumns` shows sin i, sin r and their ratio (hidden by default so students compute them). */
  display: z.object({ sineColumns: z.boolean() }).strict(),
  enabledApparatus: z.array(exploreLabEnvelopeSchema.shape.enabledApparatus.element.extend({ kind: z.enum(APPARATUS_KINDS) })).min(3).max(5),
  measurements: z.array(z.enum(MEASUREMENTS)),
  pedagogy: exploreLabEnvelopeSchema.shape.pedagogy.extend({ observationPrompts: z.array(observationPromptSchema).max(4).optional() }),
});

export type RefractionLabConfig = z.infer<typeof refractionLabConfigSchema>;
export type OpticsStation = typeof STATIONS[number];
export type OpticsApparatusKind = typeof APPARATUS_KINDS[number];
export type Medium = z.infer<typeof mediumSchema>;
export type IntoBlockSettings = z.infer<typeof intoBlockSettingsSchema>;
export type OutOfBlockSettings = z.infer<typeof outOfBlockSettingsSchema>;
