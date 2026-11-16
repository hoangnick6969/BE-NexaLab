/** Lens bench (K6) Explore config: FL-23 thin lens Lab (spec fl-23-thin-lens-explore-spec.md). Separate from the refraction bench. */
import { z } from "zod";
import { exploreLabEnvelopeSchema, observationPromptSchema } from "../../explore/envelope";

export const LENS_KIT = "k6-lens-bench@1" as const;
export const LENS_ENGINE = "thin-lens@1.0.0" as const;
export const LENS_MODEL_VERSION = "1.0.0" as const;
export const APPARATUS_KINDS = ["optical_bench", "lens", "object_lamp", "screen", "magnifier", "grid"] as const;
export const MEASUREMENTS = ["ruler", "scale_grid", "focal_length"] as const;
/** Station 1 special rays, 2 image construction on a scale grid, 3 focal length by symmetric object and screen, 4 magnifier. */
export const STATIONS = ["rays", "image", "focal", "magnifier"] as const;
/** Magnifying power G = 25/f with f in cm, i.e. 250/f with f in mm (Q-7). */
export const MAGNIFIER_NEAR_POINT_MM = 250;
/** Half-height of the lens used for the blur of an out-of-focus image (drawing only). */
export const LENS_RADIUS_MM = 20;

const int = z.number().int();
const label = z.string().trim().min(1).max(40);
const id = z.string().regex(/^[a-z][a-z0-9-]{0,23}$/);

export const lensSchema = z.object({
  id,
  labelVi: label,
  /** Focal length in mm; negative for a diverging lens. */
  focalMm: int.refine((value) => Math.abs(value) >= 30 && Math.abs(value) <= 500, { message: "|focalMm| must be 30–500 mm" }),
}).strict();

const range = { minDistanceMm: int.min(10).max(1000), maxDistanceMm: int.min(10).max(1000), stepMm: int.min(1).max(50) };

export const raysSettingsSchema = z.object({ lensIds: z.array(id).min(1).max(4) }).strict();
export const imageSettingsSchema = z.object({
  lensIds: z.array(id).min(1).max(4),
  ...range,
  objectHeightMm: int.min(5).max(50),
  /** "Kiểm tra" accepts d′ and h′ read on the grid within this many mm (Q-5: half a 10 mm square). */
  toleranceMm: int.min(1).max(20),
}).strict();
export const focalSettingsSchema = z.object({
  /** Converging lenses only; the bench hides their focal length (Q-6). */
  lensIds: z.array(id).min(1).max(4),
  ...range,
  toleranceMm: int.min(1).max(20),
}).strict();
export const magnifierSettingsSchema = z.object({
  lensIds: z.array(id).min(1).max(3),
  ...range,
}).strict();

export const lensLabConfigSchema = exploreLabEnvelopeSchema.extend({
  schema: z.literal("k6-lens-config/1"),
  catalogId: z.literal("FL-23"),
  kit: z.literal(LENS_KIT),
  engine: z.literal(LENS_ENGINE),
  lenses: z.array(lensSchema).min(1).max(6),
  stations: z.array(z.enum(STATIONS)).min(1).max(4),
  rays: raysSettingsSchema.optional(),
  image: imageSettingsSchema.optional(),
  focal: focalSettingsSchema.optional(),
  magnifier: magnifierSettingsSchema.optional(),
  /** CAT-5 (Q-3): construction only by default; `lensFormula` shows 1/f = 1/d + 1/d′. */
  display: z.object({ lensFormula: z.boolean() }).strict(),
  enabledApparatus: z.array(exploreLabEnvelopeSchema.shape.enabledApparatus.element.extend({ kind: z.enum(APPARATUS_KINDS) })).min(2).max(6),
  measurements: z.array(z.enum(MEASUREMENTS)),
  pedagogy: exploreLabEnvelopeSchema.shape.pedagogy.extend({ observationPrompts: z.array(observationPromptSchema).max(6).optional() }),
});

export type LensLabConfig = z.infer<typeof lensLabConfigSchema>;
export type LensStation = typeof STATIONS[number];
export type LensApparatusKind = typeof APPARATUS_KINDS[number];
export type Lens = z.infer<typeof lensSchema>;
