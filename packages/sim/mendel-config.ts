import { z } from "zod";
import { exploreLabEnvelopeSchema } from "./explore/envelope";
import { normaliseGenotype, MENDEL_VERSION } from "./mendel-cross";

/**
 * FL-26 config (D2-1.3): the Explore envelope plus the Mendel cross spec.
 * `allowedParents` is the allow-list of parent pairs a student may cross on
 * this bench; the validator rejects a pair the model cannot read.
 */
const parentPair = z.tuple([z.string(), z.string()]).superRefine((pair, ctx) => {
  for (const genotype of pair) {
    try {
      normaliseGenotype(genotype);
    } catch (error) {
      ctx.addIssue({ code: "custom", message: (error as Error).message });
    }
  }
});

export const fl26MendelConfigSchema = exploreLabEnvelopeSchema.extend({
  catalogId: z.literal("FL-26"),
  kit: z.literal("k8-garden"),
  spec: z.object({
    model: z.literal(`mendel-cross@${MENDEL_VERSION}`),
    cross: z.literal("monohybrid"),
    allowedParents: z.array(parentPair).min(1).max(12),
  }).strict(),
}).strict();

export type Fl26MendelConfig = z.infer<typeof fl26MendelConfigSchema>;

/** Parse an FL-26 config. Throws on a malformed envelope, an unknown kit, or an unreadable genotype. */
export function parseFl26MendelConfig(raw: unknown): Fl26MendelConfig {
  return fl26MendelConfigSchema.parse(raw);
}
