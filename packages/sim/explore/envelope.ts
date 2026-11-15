import { z } from "zod";

export const exploreIdSchema = z.string().regex(/^[A-Za-z0-9_.-]{1,64}$/);
const text = z.string().trim().min(1).max(600);

export const observationPromptSchema = z.object({
  id: exploreIdSchema,
  kind: z.enum(["note", "choice", "free_text"]),
  textVi: text,
  challenge: z.boolean().optional(),
  choices: z.array(z.object({ id: exploreIdSchema, labelVi: text }).strict()).min(2).max(6).optional(),
}).strict();

const apparatusSchema = z.object({
  id: exploreIdSchema,
  kind: z.string().min(1),
  slot: exploreIdSchema,
  labelVi: z.string().max(60).optional(),
  initial: z.unknown().optional(),
}).strict();

export const exploreLabEnvelopeSchema = z.object({
  schema: z.string().min(1),
  labId: exploreIdSchema,
  catalogId: z.string().regex(/^FL-\d{2}[a-z]?$/),
  configVersion: z.number().int().positive(),
  kit: z.string().min(1),
  engine: z.string().min(1),
  title: text,
  contextLabel: z.string().max(120).optional(),
  outcomeSummary: z.array(text).min(1).max(4),
  safetyBriefing: z.object({ simulation: z.array(text).min(1), realLab: z.array(text).min(1), acknowledgeRequired: z.boolean() }).strict(),
  limitations: z.array(text),
  modes: z.object({ explore: z.literal(true), guided: z.object({ rendererKey: exploreIdSchema }).strict().optional() }).strict(),
  enabledApparatus: z.array(apparatusSchema),
  measurements: z.array(z.string().min(1)),
  pedagogy: z.object({ observationPrompts: z.array(observationPromptSchema).optional() }).strict(),
  review: z.object({ status: z.enum(["draft", "reviewed"]), notes: z.string().max(600).optional() }).strict(),
}).strict();

export type ExploreLabEnvelope = z.infer<typeof exploreLabEnvelopeSchema>;
export type ObservationPrompt = z.infer<typeof observationPromptSchema>;
