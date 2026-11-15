/** Mechanics bench (K5) Explore config: the lever bar of FL-06 with weights and one spring gauge. */
import { z } from "zod";
import { exploreIdSchema, exploreLabEnvelopeSchema, observationPromptSchema } from "../explore/envelope";

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

/** Class Explore template of the mechanics bench (P0 C3.1, spec fl-06-class-explore-spec.md §4.1). */
const toggle = z.enum(["teacher_choice", "on", "off"]);

export const leverClassTemplateSchema = z.object({
  id: exploreIdSchema,
  titleVi: z.string().trim().min(1).max(120),
  /** Starting loads the teacher picks one of; they are fixed on the bar for the student. */
  loadPresets: z.array(z.object({
    id: exploreIdSchema, labelVi: z.string().trim().min(1).max(120),
    attachments: z.array(leverAttachmentSchema).min(1).max(4),
  }).strict()).min(1).max(6),
  /** Weight sets the teacher may hand out; each is a subset of `weights.availableMilliNewtons`. */
  weightOptions: z.array(z.array(z.number().int()).min(1).max(10)).min(1).max(4),
  gauge: toggle,
  momentTable: toggle,
  /** Prompts the teacher may attach (ids of `pedagogy.observationPrompts`). */
  promptChoices: z.array(z.object({ promptId: exploreIdSchema }).strict()).min(1).max(4),
  /** `balance_moments`: the moment on each side once the bar is level; `explain`: one free-text explanation. */
  requirements: z.object({ measure: z.literal("balance_moments").nullable(), explain: z.boolean() }).strict(),
}).strict();
export type LeverClassTemplate = z.infer<typeof leverClassTemplateSchema>;


export const leverLabConfigSchema = exploreLabEnvelopeSchema.extend({
  schema: z.literal("k5-lever-config/1"),
  catalogId: z.literal("FL-06"),
  kit: z.literal(LEVER_KIT),
  engine: z.literal(LEVER_ENGINE),
  fixtureId: z.literal(LEVER_FIXTURE_ID),
  enabledApparatus: z.array(exploreLabEnvelopeSchema.shape.enabledApparatus.element.extend({ kind: z.enum(APPARATUS_KINDS) })).min(2).max(3),
  weights: z.object({ availableMilliNewtons: z.array(int).min(1).max(10), maxCount: int.min(1).max(11) }).strict(),
  initialAttachments: z.array(leverAttachmentSchema).max(11),
  /** Class Explore: the starting attachments stay on the bar (the student cannot move or take them off). */
  lockInitialAttachments: z.boolean().optional(),
  measurements: z.array(z.enum(MEASUREMENTS)),
  classTemplates: z.array(leverClassTemplateSchema).max(4).optional(),
  pedagogy: exploreLabEnvelopeSchema.shape.pedagogy.extend({ observationPrompts: z.array(observationPromptSchema).max(6).optional() }),
});
export type LeverLabConfig = z.infer<typeof leverLabConfigSchema>;
export type LeverAttachment = z.infer<typeof leverAttachmentSchema>;
export type LeverApparatusKind = typeof APPARATUS_KINDS[number];
export type LeverMeasurement = typeof MEASUREMENTS[number];
