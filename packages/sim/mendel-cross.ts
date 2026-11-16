import { z } from "zod";

/**
 * FL-26 mendel-cross@1.0.0 (KHTN 9, lai Mendel): one-trait (monohybrid) cross
 * with complete dominance. Deterministic: gametes, the 2×2 Punnett square and
 * exact integer ratios. Dihybrid, sex-linked and linkage cases are out of scope
 * for this version. Values are PROPOSED_UNAPPROVED until a reviewer signs the
 * release digest; the K9 provenance is still open (decision D2-0.1).
 */

export const MENDEL_VERSION = "1.0.0";
export const MENDEL_REVIEW_STATUS = "PROPOSED_UNAPPROVED" as const;

/**
 * A genotype is two alleles of the same letter: uppercase = dominant, lowercase = recessive.
 * "aA" is accepted and normalised to "Aa" (dominant allele first).
 */
export function normaliseGenotype(raw: string): string {
  if (!/^[A-Za-z]{2}$/.test(raw)) throw new Error("Kiểu gen phải gồm đúng hai chữ cái");
  const [a, b] = raw.split("");
  if (a.toLowerCase() !== b.toLowerCase()) throw new Error("Hai alen phải cùng một chữ cái");
  const dominant = a === a.toUpperCase() ? a : b;
  const recessive = dominant === a ? b : a;
  return dominant + recessive;
}

const genotypeSchema = z.string().transform((value, ctx) => {
  try {
    return normaliseGenotype(value);
  } catch (error) {
    ctx.addIssue({ code: "custom", message: (error as Error).message });
    return z.NEVER;
  }
});

export const mendelCrossSchema = z.object({
  setup: z.literal("monohybrid"),
  parents: z.tuple([genotypeSchema, genotypeSchema]),
}).strict();

export type MendelCrossState = z.input<typeof mendelCrossSchema>;

/** Gametes of a genotype: one gamete per allele, each with weight 1 out of 2 (homozygotes give two identical gametes). */
export function gametesOf(genotype: string): string[] {
  const [a, b] = genotype.split("");
  return [a, b];
}

const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));

/** Divide integers by their greatest common divisor, keeping order. */
export function reduceRatio(values: number[]): number[] {
  const divisor = values.reduce((acc, value) => gcd(acc, value), 0) || 1;
  return values.map((value) => value / divisor);
}

export function mendelCross(raw: unknown) {
  const state = mendelCrossSchema.parse(raw);
  const [p1, p2] = state.parents;
  const gametes1 = gametesOf(p1);
  const gametes2 = gametesOf(p2);

  // Punnett square: rows are gametes of parent 1, columns are gametes of parent 2.
  const punnett = gametes1.map((g1) => gametes2.map((g2) => normaliseGenotype(g1 + g2)));
  const cells = punnett.flat();

  // Each cell is one equally likely combination, so counts out of cells.length are exact.
  const genotypeCounts: Record<string, number> = {};
  for (const cell of cells) genotypeCounts[cell] = (genotypeCounts[cell] ?? 0) + 1;

  const dominantCount = cells.filter((cell) => cell[0] === cell[0].toUpperCase()).length;
  const recessiveCount = cells.length - dominantCount;

  // Fixed order for the ratio: dominant homozygote, heterozygote, recessive homozygote.
  const letter = (p1 + p2).match(/[A-Za-z]/)![0].toUpperCase();
  const order = [letter + letter, letter + letter.toLowerCase(), letter.toLowerCase() + letter.toLowerCase()];
  const genotypeOrder = order.filter((g) => genotypeCounts[g] !== undefined);

  return {
    version: MENDEL_VERSION,
    reviewStatus: MENDEL_REVIEW_STATUS,
    setup: "monohybrid" as const,
    parents: [p1, p2] as [string, string],
    gametes: [gametes1, gametes2] as [string[], string[]],
    punnett,
    total: cells.length,
    genotypeCounts,
    phenotypeCounts: { dominant: dominantCount, recessive: recessiveCount },
    genotypeRatio: reduceRatio(genotypeOrder.map((g) => genotypeCounts[g])),
    phenotypeRatio: reduceRatio([dominantCount, recessiveCount].filter((n) => n > 0)),
  };
}
