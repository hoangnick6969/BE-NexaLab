/** Mechanics bench (K5) Explore config: the lever bar of FL-06 with weights and one spring gauge. */
import { z } from "zod";
import { exploreLabEnvelopeSchema, observationPromptSchema } from "../explore/envelope";

export const LEVER_KIT = "k5-lever-bench@1" as const;
export const LEVER_ENGINE = "lever-bench@1.0.0" as const;
export const LEVER_FIXTURE_ID = "lever-bench-reference-v1" as const;
export const APPARATUS_KINDS = ["lever_bar", "weight_set", "spring_gauge"] as const;
export const MEASUREMENTS = ["ruler", "force_labels", "moment_table"] as const;
/** Weights the model accepts: 0.5 N to 5 N in 0.5 N steps (lever-bench.ts). */
export const WEIGHT_STEP_MILLINEWTONS = 500;
export const WEIGHT_MAX_MILLINEWTONS = 5000;

const int = z.number().int();
export const leverAttachmentSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("WEIGHT"), positionMillimetres: int, forceMilliNewtons: int }).strict(),
  z.object({ kind: z.literal("GAUGE"), positionMillimetres: int, forceMilliNewtons: int }).strict(),
]);

export const leverLabConfigSchema = exploreLabEnvelopeSchema.extend({
  schema: z.literal("k5-lever-config/1"),
  catalogId: z.literal("FL-06"),
  kit: z.literal(LEVER_KIT),
  engine: z.literal(LEVER_ENGINE),
  fixtureId: z.literal(LEVER_FIXTURE_ID),
  enabledApparatus: z.array(exploreLabEnvelopeSchema.shape.enabledApparatus.element.extend({ kind: z.enum(APPARATUS_KINDS) })).min(2).max(3),
  weights: z.object({ availableMilliNewtons: z.array(int).min(1).max(10), maxCount: int.min(1).max(11) }).strict(),
  initialAttachments: z.array(leverAttachmentSchema).max(11),
  measurements: z.array(z.enum(MEASUREMENTS)),
  pedagogy: exploreLabEnvelopeSchema.shape.pedagogy.extend({ observationPrompts: z.array(observationPromptSchema).max(6).optional() }),
});
export type LeverLabConfig = z.infer<typeof leverLabConfigSchema>;
export type LeverAttachment = z.infer<typeof leverAttachmentSchema>;
export type LeverApparatusKind = typeof APPARATUS_KINDS[number];
export type LeverMeasurement = typeof MEASUREMENTS[number];
