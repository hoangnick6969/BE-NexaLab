import { z } from "zod";

/**
 * FL-27 gene expression (KHTN 9 Bài 38–41): the pinned teaching gene, its
 * template strand, transcript, translation with the standard genetic code and
 * one point substitution. Observation only: it has no learner verdict; the
 * activity rubric compares the learner's work with it. Values are
 * PROPOSED_UNAPPROVED until a reviewer signs the release digest, and must
 * agree with the frontend K7 sample config (`fl27-gene.config.ts`).
 */
export const GENE_DNA_BASES = ["A", "T", "G", "C"] as const;
export const GENE_RNA_BASES = ["A", "U", "G", "C"] as const;
export type GeneDnaBase = (typeof GENE_DNA_BASES)[number];
export type GeneRnaBase = (typeof GENE_RNA_BASES)[number];

export const AMINO_ACIDS = [
  "Ala", "Arg", "Asn", "Asp", "Cys", "Gln", "Glu", "Gly", "His", "Ile",
  "Leu", "Lys", "Met", "Phe", "Pro", "Ser", "Thr", "Trp", "Tyr", "Val",
] as const;
export const CODON_MEANINGS = [...AMINO_ACIDS, "Stop"] as const;
export type CodonMeaning = (typeof CODON_MEANINGS)[number];

/** Standard genetic code, 64 entries in UCAG × UCAG × UCAG order (NCBI translation table 1). */
export const STANDARD_GENETIC_CODE = "FFLLSSSSYY**CC*WLLLLPPPPHHQQRRRRIIIMTTTTNNKKSSRRVVVVAAAADDEEGGGG";
const ONE_LETTER: Record<string, CodonMeaning> = {
  A: "Ala", R: "Arg", N: "Asn", D: "Asp", C: "Cys", Q: "Gln", E: "Glu", G: "Gly", H: "His", I: "Ile",
  L: "Leu", K: "Lys", M: "Met", F: "Phe", P: "Pro", S: "Ser", T: "Thr", W: "Trp", Y: "Tyr", V: "Val", "*": "Stop",
};
const AXIS = ["U", "C", "A", "G"] as const;
export const CODON_TABLE: ReadonlyMap<string, CodonMeaning> = new Map(
  [...STANDARD_GENETIC_CODE].map((letter, index) => [AXIS[index >> 4] + AXIS[(index >> 2) & 3] + AXIS[index & 3], ONE_LETTER[letter]]),
);

/** SGK KHTN 9 Hình 38.1 (textbook model; real B-DNA has ~10.5 base pairs per turn). */
export const GENE_STRUCTURE = { bpPerTurn: 10, turnLengthA: 34, riseA: 3.4, diameterA: 20 } as const;
/** Ruler readings in Å are accepted within one 1 Å division; the rise per pair is a quotient. */
export const GENE_TOLERANCES = { lengthA: 1, riseA: 0.1, replicationErrors: 1, transcriptionErrors: 1 } as const;
/** Replication station: the fork opens after `forkAt`; the learner pairs `fillCount` bases from `fillFrom`. */
export const GENE_REPLICATION = { length: 12, forkAt: 3, fillFrom: 4, fillCount: 6 } as const;
export const GENE_LENGTH = 18;
export const GENE_CODONS = GENE_LENGTH / 3;
export const REPLICATION_STAGES = ["UNWIND", "SYNTHESIZE", "COMPLETE"] as const;
export const MUTATION_EFFECTS = ["SILENT", "MISSENSE", "NONSENSE"] as const;
export type MutationEffect = (typeof MUTATION_EFFECTS)[number];

type GeneVariant = { id: string; coding: string; mutation: { position: number; to: GeneDnaBase } };
/** Teaching genes (not real genes). Each run is pinned to one variant by the server. */
export const GENE_VARIANTS = {
  // Met–Phe–Gly–Trp–His–Stop; plan §4.7 G1–G5.
  "gene-a-missense": { id: "gene-a-missense", coding: "ATGTTCGGATGGCATTAA", mutation: { position: 5, to: "A" } },
  "gene-a-nonsense": { id: "gene-a-nonsense", coding: "ATGTTCGGATGGCATTAA", mutation: { position: 11, to: "A" } },
  "gene-a-silent": { id: "gene-a-silent", coding: "ATGTTCGGATGGCATTAA", mutation: { position: 8, to: "G" } },
  // Met–Glu–Pro–Tyr–Gly–Stop; GAA → GTA (Glu → Val), the textbook sickle-cell context.
  "gene-b-missense": { id: "gene-b-missense", coding: "ATGGAACCCTACGGTTGA", mutation: { position: 4, to: "T" } },
} as const satisfies Record<string, GeneVariant>;
export const GENE_VARIANT_IDS = Object.keys(GENE_VARIANTS) as [keyof typeof GENE_VARIANTS, ...(keyof typeof GENE_VARIANTS)[]];
export type GeneVariantId = keyof typeof GENE_VARIANTS;

const DNA_PAIR: Record<GeneDnaBase, GeneDnaBase> = { A: "T", T: "A", G: "C", C: "G" };
/** Template strand read 3'→5' under the coding strand: base-by-base complement. */
export const complementDna = (bases: readonly GeneDnaBase[]) => bases.map((base) => DNA_PAIR[base]);
/** mRNA is complementary to the template, i.e. the coding strand with U for T. */
const RNA_OF_TEMPLATE: Record<GeneDnaBase, GeneRnaBase> = { A: "U", T: "A", G: "C", C: "G" };
export const transcribe = (template: readonly GeneDnaBase[]) => template.map((base) => RNA_OF_TEMPLATE[base]);

const parseDna = (sequence: string): GeneDnaBase[] => [...sequence].map((base) => {
  if (!(GENE_DNA_BASES as readonly string[]).includes(base)) throw new Error(`Không phải base DNA: ${base}`);
  return base as GeneDnaBase;
});

/**
 * Reads whole codons from the start of an mRNA with the standard code and
 * stops after the first stop codon (inclusive). An incomplete codon is not read.
 */
export function translate(mrna: readonly GeneRnaBase[]): CodonMeaning[] {
  const chain: CodonMeaning[] = [];
  for (let index = 0; index + 3 <= mrna.length; index += 3) {
    const meaning = CODON_TABLE.get(mrna.slice(index, index + 3).join(""))!;
    chain.push(meaning);
    if (meaning === "Stop") break;
  }
  return chain;
}

export function classifySubstitution(before: CodonMeaning, after: CodonMeaning): MutationEffect {
  if (before === after) return "SILENT";
  return after === "Stop" ? "NONSENSE" : "MISSENSE";
}

/** Fails closed on any gene the activity cannot use (plan §4.4). */
function checkVariant(variant: GeneVariant) {
  const coding = parseDna(variant.coding);
  if (coding.length !== GENE_LENGTH) throw new Error(`${variant.id}: gene must have ${GENE_LENGTH} nucleotides`);
  const mrna = transcribe(complementDna(coding));
  const chain = translate(mrna);
  if (mrna.slice(0, 3).join("") !== "AUG") throw new Error(`${variant.id}: gene must start with ATG`);
  if (chain.length !== GENE_CODONS || chain.indexOf("Stop") !== GENE_CODONS - 1) throw new Error(`${variant.id}: needs exactly one stop codon, at the end`);
  const { position, to } = variant.mutation;
  if (position < 3 || position >= GENE_LENGTH - 3 || coding[position] === to) throw new Error(`${variant.id}: mutation must change a base between the start and stop codons`);
  return { coding, mrna, chain };
}

export const geneExpressionSchema = z.object({ variantId: z.enum(GENE_VARIANT_IDS) }).strict();

export function geneExpression(raw: unknown) {
  const { variantId } = geneExpressionSchema.parse(raw);
  const variant: GeneVariant = GENE_VARIANTS[variantId];
  const { coding, mrna, chain } = checkVariant(variant);
  const template = complementDna(coding);
  const { position, to } = variant.mutation;
  const mutatedCoding = coding.map((base, index) => (index === position ? to : base));
  const mutatedMrna = transcribe(complementDna(mutatedCoding));
  const codonIndex = Math.floor(position / 3);
  const codon = mutatedMrna.slice(codonIndex * 3, codonIndex * 3 + 3).join("");
  const aminoAcid = CODON_TABLE.get(codon)!;
  const { fillFrom, fillCount } = GENE_REPLICATION;
  return {
    version: "1.0.0",
    variantId,
    structure: GENE_STRUCTURE,
    tolerances: GENE_TOLERANCES,
    gene: { coding: coding.join(""), template: template.join("") },
    // The new strand made on the lower (template) parent strand repeats the coding strand.
    replication: { ...GENE_REPLICATION, templateSegment: template.slice(fillFrom, fillFrom + fillCount).join(""), newStrand: coding.slice(fillFrom, fillFrom + fillCount).join("") },
    mrna: mrna.join(""),
    codons: Array.from({ length: GENE_CODONS }, (_, index) => mrna.slice(index * 3, index * 3 + 3).join("")),
    aminoAcids: chain,
    mutation: {
      position, from: coding[position], to, codonIndex, codon, aminoAcid,
      originalAminoAcid: chain[codonIndex], effect: classifySubstitution(chain[codonIndex], aminoAcid),
    },
    codeCombinations: { n1: 4, n2: 16, n3: 64 },
  };
}
