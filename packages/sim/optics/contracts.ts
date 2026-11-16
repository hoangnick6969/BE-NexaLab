/** Optics bench (K6) Explore config: FL-23 refraction slice (spec fl-23-refraction-explore-spec.md). Independent from eye-optics (FL-25). */
import { z } from "zod";
import { exploreLabEnvelopeSchema, observationPromptSchema } from "../explore/envelope";

export const OPTICS_KIT = "k6-optics-bench@1" as const;
/** Current engine. 1.1.0 adds the prism station (spec §13); results of 1.0.0 are unchanged, so configs pinned to 1.0.0 stay valid (Q-10). */
export const REFRACTION_ENGINE = "refraction@1.1.0" as const;
export const REFRACTION_ENGINE_V1 = "refraction@1.0.0" as const;
export const REFRACTION_ENGINES = [REFRACTION_ENGINE_V1, REFRACTION_ENGINE] as const;
export const REFRACTION_MODEL_VERSION = "1.1.0" as const;
export const APPARATUS_KINDS = ["light_source", "protractor_disk", "half_cylinder", "measurement_table", "speed_card", "prism", "screen"] as const;
export const MEASUREMENTS = ["protractor", "critical_angle", "deviation"] as const;
/** Station 1: air into the block (Snell law). Station 2: block out to air (total internal reflection). Station 3: prism (engine 1.1.0). */
export const STATIONS = ["into-block", "out-of-block", "prism"] as const;
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

export const spectrumColourSchema = z.object({
  id: z.string().regex(/^[a-z][a-z0-9-]{0,15}$/),
  labelVi: label,
  /** Illustrative index of the prism glass for this colour (Q-11); used to draw the spectrum, never shown as a number. */
  indexMilli: int.min(1001).max(2500),
}).strict();

export const prismSettingsSchema = z.object({
  /** Apex (refracting) angle of the prism, whole degrees (Q-8: equilateral, 60°). */
  apexDeg: int.min(30).max(70),
  /** The medium of `media` the prism is made of (laser light uses its index). */
  mediumId: z.string().min(1),
  minIncidenceDeg: int.min(0).max(89),
  maxIncidenceDeg: int.min(1).max(89),
  /** White light splits into `spectrum`, ordered from the least to the most deviated colour. */
  whiteLight: z.boolean(),
  spectrum: z.array(spectrumColourSchema).min(3).max(7),
}).strict();

export const refractionLabConfigSchema = exploreLabEnvelopeSchema.extend({
  schema: z.literal("k6-optics-config/1"),
  catalogId: z.literal("FL-23"),
  kit: z.literal(OPTICS_KIT),
  engine: z.enum(REFRACTION_ENGINES),
  lightSpeedKmS: z.literal(LIGHT_SPEED_KM_S),
  media: z.array(mediumSchema).min(1).max(3),
  stations: z.array(z.enum(STATIONS)).min(1).max(3),
  intoBlock: intoBlockSettingsSchema.optional(),
  outOfBlock: outOfBlockSettingsSchema.optional(),
  prism: prismSettingsSchema.optional(),
  /** The angle read on the disk is always visible; `sineColumns` shows sin i, sin r and their ratio (hidden by default so students compute them). */
  display: z.object({ sineColumns: z.boolean() }).strict(),
  enabledApparatus: z.array(exploreLabEnvelopeSchema.shape.enabledApparatus.element.extend({ kind: z.enum(APPARATUS_KINDS) })).min(3).max(7),
  measurements: z.array(z.enum(MEASUREMENTS)),
  pedagogy: exploreLabEnvelopeSchema.shape.pedagogy.extend({ observationPrompts: z.array(observationPromptSchema).max(6).optional() }),
});

export type RefractionLabConfig = z.infer<typeof refractionLabConfigSchema>;
export type OpticsStation = typeof STATIONS[number];
export type OpticsApparatusKind = typeof APPARATUS_KINDS[number];
export type Medium = z.infer<typeof mediumSchema>;
export type IntoBlockSettings = z.infer<typeof intoBlockSettingsSchema>;
export type OutOfBlockSettings = z.infer<typeof outOfBlockSettingsSchema>;
export type PrismSettings = z.infer<typeof prismSettingsSchema>;
export type SpectrumColour = z.infer<typeof spectrumColourSchema>;
