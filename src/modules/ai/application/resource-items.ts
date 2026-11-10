import { z } from "zod";

/**
 * `resource-items@1` (implementation-contract.md). The strict schema fixes structure and types only; a parse failure
 * fails the attempt as OUTPUT_SCHEMA_INVALID. Lengths, option counts, answer keys, grounding, outcomes and safety are
 * per-item drop rules (VR-01..VR-10 in validation-rules.md), so one bad item never discards the whole batch.
 */
const questionItem = z
  .object({
    type: z.literal("SINGLE_CHOICE"),
    prompt: z.string(),
    options: z.array(z.string()),
    correctOption: z.number(),
    explanation: z.string(),
    difficulty: z.enum(["FOUNDATION", "STANDARD", "ADVANCED"]),
    outcomeCodes: z.array(z.string()),
    sourceRefs: z.array(z.string()),
  })
  .strict();

const cardItem = z
  .object({
    type: z.literal("CARD"),
    front: z.string(),
    back: z.string(),
    sourceRefs: z.array(z.string()),
  })
  .strict();

export const resourceItemSchema = z.discriminatedUnion("type", [questionItem, cardItem]);
export const resourceItemsV1 = z.object({ items: z.array(resourceItemSchema) }).strict();

export type QuestionItem = z.infer<typeof questionItem>;
export type CardItem = z.infer<typeof cardItem>;
export type ResourceItem = z.infer<typeof resourceItemSchema>;

const FULL_WIDTH_DIGIT = /[０-９]/g;

/**
 * normalize(s) from validation-rules.md: NFC, vi-VN lowercase, ×→x, −→-, full-width digits→ASCII, collapse whitespace,
 * trim, strip trailing `.?!:;`. Vietnamese diacritics are kept, because removing them merges distinct words.
 */
export function normalizeText(value: string): string {
  return value
    .normalize("NFC")
    .toLocaleLowerCase("vi-VN")
    .replace(/×/g, "x")
    .replace(/−/g, "-")
    .replace(FULL_WIDTH_DIGIT, (digit) => String.fromCharCode(digit.charCodeAt(0) - 0xff10 + 0x30))
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[.?!:;]+$/u, "")
    .trim();
}

/** Character trigrams of an already normalized string; strings shorter than 3 characters are their own gram. */
export function trigrams(normalized: string): Set<string> {
  const grams = new Set<string>();
  const chars = Array.from(normalized);
  if (chars.length < 3) {
    if (chars.length > 0) grams.add(normalized);
    return grams;
  }
  for (let i = 0; i + 3 <= chars.length; i++) grams.add(chars.slice(i, i + 3).join(""));
  return grams;
}

export function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  let shared = 0;
  for (const gram of a) if (b.has(gram)) shared++;
  return shared / (a.size + b.size - shared);
}

export const NEAR_DUPLICATE_THRESHOLD = 0.85;
