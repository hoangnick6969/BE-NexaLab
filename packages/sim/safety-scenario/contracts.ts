import { z } from "zod";
import { exploreIdSchema as id, exploreLabEnvelopeSchema } from "../explore/envelope";

export const SAFETY_SCENARIO_KIT = "k2-safety-scenario@1";
export const SAFETY_SCENARIO_ENGINE = "safety-scenario@1.0.0";

const text = z.string().trim().min(1).max(600);
const localized = z.object({ vi: text, en: text }).strict();
const itemRef = z.object({ kind: z.enum(["reagent", "apparatus"]), id }).strict();
const choice = z.object({ id, label: localized, consequenceId: id }).strict();
const step = z.object({ id, prompt: localized, choices: z.array(choice).min(1).max(8) }).strict();
const consequence = z.object({
  id,
  explanation: localized,
  hazardRefs: z.array(itemRef).max(16),
  nextStepId: id.nullable(),
}).strict();
const scene = z.object({
  id,
  title: localized,
  description: localized,
  startStepId: id,
  itemRefs: z.array(itemRef).max(32),
  steps: z.array(step).min(1).max(32),
  consequences: z.array(consequence).min(1).max(256),
}).strict();

export const safetyScenarioConfigSchema = exploreLabEnvelopeSchema.extend({
  schema: z.literal("k2-safety-scenario-config/1"),
  catalogId: z.literal("FL-15"),
  kit: z.literal(SAFETY_SCENARIO_KIT),
  engine: z.literal(SAFETY_SCENARIO_ENGINE),
  modes: z.object({ explore: z.literal(true) }).strict(),
  titleEn: text,
  curriculumOutcomeCode: z.literal("KHTN8-B01-O01"),
  scenes: z.array(scene).min(1).max(12),
});

export type SafetyScenarioConfig = z.infer<typeof safetyScenarioConfigSchema>;
export type SafetyScenarioScene = z.infer<typeof scene>;
export type SafetyScenarioItemRef = z.infer<typeof itemRef>;
