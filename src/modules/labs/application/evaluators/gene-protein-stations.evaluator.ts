import { z } from "zod";
import {
  CODON_MEANINGS, GENE_CODONS, GENE_DNA_BASES, GENE_LENGTH, GENE_REPLICATION, GENE_RNA_BASES, GENE_VARIANT_IDS, MUTATION_EFFECTS,
  REPLICATION_STAGES, translate, type CodonMeaning, type GeneRnaBase,
} from "../../../../../packages/sim";
import { resolveModel } from "../sim-packs";
import { normalizeVerdict } from "../simulation-versions";
import type { LabEvaluator } from "./lab-evaluator";
import { genePinsFrom, type GenePins } from "./gene-variants";

export const GENE_ACTIVITY_KEY = "gene-protein-stations";
export const GENE_RUBRIC = "gene-protein-stations@1.0.0";
export const GENE_MODEL = "gene-expression@1.0.0";

const EPSILON = 1e-9;
const reading = z.number().finite().nonnegative().max(1000);
const count = z.number().int().nonnegative().max(1_000_000);
const choice = z.enum(["A", "B", "C"]);
const meaning = z.enum(CODON_MEANINGS);

/**
 * Evidence v1 (plan §4.5): what the learner read, built and chose at the six
 * stations (KHTN 9 Bài 38–41). Shapes match the frontend draft exactly once
 * every answer is filled; the server recomputes every expected sequence.
 */
export const geneEvidenceSchema = z.object({
  variantId: z.enum(GENE_VARIANT_IDS),
  structure: z.object({ bpPerTurn: count, turnLengthA: reading, riseA: reading, diameterA: reading, pairing: choice }).strict(),
  replication: z.object({
    stageOrder: z.array(z.enum(REPLICATION_STAGES)).length(REPLICATION_STAGES.length),
    newStrand: z.array(z.enum(GENE_DNA_BASES)).length(GENE_REPLICATION.fillCount),
    semiConservative: choice,
  }).strict(),
  // RNA has no T: a T in the transcript is malformed evidence, not a scored mistake.
  transcription: z.object({ mrna: z.array(z.enum(GENE_RNA_BASES)).length(GENE_LENGTH) }).strict(),
  translation: z.object({
    // Codons read in order; reading stops at the first Stop, later slots stay empty.
    aminoAcids: z.array(meaning.nullable()).length(GENE_CODONS),
    codonCombos: z.object({ n1: count, n2: count, n3: count }).strict(),
  }).strict(),
  mutation: z.object({ mutatedCodon: z.string().regex(/^[AUGC]{3}$/), mutatedAminoAcid: meaning, effect: z.enum(MUTATION_EFFECTS) }).strict(),
  conclusion: z.object({ flow: choice, geneRole: choice }).strict(),
}).strict()
  .refine((e) => e.translation.aminoAcids[0] !== null, "Chưa dịch mã codon nào")
  .refine((e) => {
    // Read slots form one prefix: no gap, nothing after a Stop.
    const values = e.translation.aminoAcids;
    const end = values.indexOf(null) === -1 ? values.length : values.indexOf(null);
    const stop = values.indexOf("Stop");
    return values.slice(end).every((value) => value === null) && (stop === -1 || stop === end - 1);
  }, "Chuỗi amino acid phải liên tục và dừng ở codon kết thúc")
  .refine((e) => JSON.stringify(e).length <= 20000, "Evidence is too large");

export type GeneEvidence = z.infer<typeof geneEvidenceSchema>;

export const GENE_CRITERIA = ["structure", "replication", "transcription", "translation", "mutation", "concept"] as const;
export type GeneCriterion = (typeof GENE_CRITERIA)[number];

const within = (value: number, expected: number, tolerance: number) => Math.abs(value - expected) <= tolerance + EPSILON;
const mismatches = (given: readonly string[], expected: string) => given.reduce((sum, base, index) => sum + (base === expected[index] ? 0 : 1), 0);

export function evaluateGeneProteinStations(evidence: GeneEvidence, pins: GenePins) {
  // The learner works on the gene the run was launched with, and nothing else.
  if (evidence.variantId !== pins.variantId) throw new Error("Biến thể gene trong bài làm không khớp phiên làm bài đã ghim");
  const truth = resolveModel(GENE_MODEL).simulate({ variantId: pins.variantId });
  const { structure, tolerances } = truth;
  const unmet: string[] = [];
  const check = (criterion: GeneCriterion, station: string, ok: boolean) => { if (!ok) unmet.push(`${criterion}:${station}`); };

  // R1 structure readings (Hình 38.1) and the pairing rule A–T, G–C
  const s = evidence.structure;
  check("structure", "readings", s.bpPerTurn === structure.bpPerTurn && within(s.turnLengthA, structure.turnLengthA, tolerances.lengthA)
    && within(s.riseA, structure.riseA, tolerances.riseA) && within(s.diameterA, structure.diameterA, tolerances.lengthA));
  check("structure", "pairing", s.pairing === "A");

  // R2 replication: stage order, complementary new strand (one slip allowed), semi-conservative result
  const replicationErrors = mismatches(evidence.replication.newStrand, truth.replication.newStrand);
  check("replication", "stages", evidence.replication.stageOrder.join() === "UNWIND,SYNTHESIZE,COMPLETE");
  check("replication", "pairing", replicationErrors <= tolerances.replicationErrors);
  check("replication", "semiConservative", evidence.replication.semiConservative === "A");

  // R3 transcription against the template strand (one slip allowed)
  const transcriptionErrors = mismatches(evidence.transcription.mrna, truth.mrna);
  check("transcription", "mrna", transcriptionErrors <= tolerances.transcriptionErrors);

  // R4 translation of the learner's OWN mRNA (no second penalty for an R3 slip): the
  // same residues in the same reading frame, ending exactly at the first stop codon.
  const ownChain = translate(evidence.transcription.mrna as GeneRnaBase[]);
  const chosen = evidence.translation.aminoAcids.filter((value): value is CodonMeaning => value !== null);
  check("translation", "codons", chosen.length === ownChain.length && chosen.every((value, index) => value === ownChain[index]));
  const combos = evidence.translation.codonCombos;
  check("translation", "combinations", combos.n1 === truth.codeCombinations.n1 && combos.n2 === truth.codeCombinations.n2 && combos.n3 === truth.codeCombinations.n3);

  // R5 point mutation: new codon, its amino acid and the effect on the protein
  check("mutation", "codon", evidence.mutation.mutatedCodon === truth.mutation.codon);
  check("mutation", "aminoAcid", evidence.mutation.mutatedAminoAcid === truth.mutation.aminoAcid);
  check("mutation", "effect", evidence.mutation.effect === truth.mutation.effect);

  // R6 concepts (answer A is the reviewed correct statement for both questions)
  check("concept", "flow", evidence.conclusion.flow === "A");
  check("concept", "geneRole", evidence.conclusion.geneRole === "A");

  const criteria = Object.fromEntries(GENE_CRITERIA.map((criterion) => [criterion, !unmet.some((item) => item.startsWith(`${criterion}:`))])) as Record<GeneCriterion, boolean>;
  const score = GENE_CRITERIA.filter((criterion) => criteria[criterion]).length;
  const passed = score === GENE_CRITERIA.length;
  const rawVerdict = passed ? "passed" : "not_passed";
  return {
    result: {
      version: "1.0.0",
      // Feedback only: counts, never the expected sequences, so a retry cannot copy them.
      observations: {
        replication: { correctBases: GENE_REPLICATION.fillCount - replicationErrors, totalBases: GENE_REPLICATION.fillCount },
        transcription: { correctBases: GENE_LENGTH - transcriptionErrors, totalBases: GENE_LENGTH },
        translation: { residuesRead: chosen.filter((value) => value !== "Stop").length, reachedStop: chosen[chosen.length - 1] === "Stop" },
      },
      assessment: { score, maximumScore: GENE_CRITERIA.length, criteria, unmetCriteria: unmet, passed },
      verdict: rawVerdict,
    },
    verdict: normalizeVerdict(rawVerdict),
  };
}

export const geneProteinStationsEvaluator: LabEvaluator<GeneEvidence> = {
  rubricRef: GENE_RUBRIC,
  activity: { key: GENE_ACTIVITY_KEY, version: 1 },
  modelRefs: [GENE_MODEL],
  rendererKey: "gene-expression",
  envelope: "evidence",
  evidenceSchema: geneEvidenceSchema,
  evaluate: (_labRunId, evidence, config) => evaluateGeneProteinStations(evidence, genePinsFrom(config.params)),
};
