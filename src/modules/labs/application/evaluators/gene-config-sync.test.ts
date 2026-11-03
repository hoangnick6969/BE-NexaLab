import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { GENE_REPLICATION, GENE_STRUCTURE, GENE_VARIANTS, STANDARD_GENETIC_CODE, geneExpression } from "../../../../../packages/sim";
import { evaluateGeneProteinStations, geneEvidenceSchema } from "./gene-protein-stations.evaluator";

/**
 * Single source of truth check (plan §4): the BE model is authoritative, and
 * the FE sample config and evidence draft must agree with it. The FE files are
 * read from the sibling repository (or its feat/fl27 worktree); without them
 * the check is skipped, not faked.
 */
const feRoot = ["FE-NexaLab", "FE-NexaLab-fl27"]
  .map((name) => resolve(__dirname, `../../../../../../${name}/src/features/labs/biology/molecular/gene-protein`))
  .find((dir) => existsSync(resolve(dir, "fl27-gene.config.ts")));

describe.skipIf(!feRoot)("FL-27 BE model and FE config/evidence stay in sync", () => {
  it("agrees on the helix numbers, genetic code, replication window and every gene variant", async () => {
    const { fl27GeneConfig } = await import(resolve(feRoot!, "fl27-gene.config.ts"));
    expect(fl27GeneConfig.reviewStatus).toBe("PROPOSED_UNAPPROVED");
    expect(fl27GeneConfig.structure).toEqual(GENE_STRUCTURE);
    expect(fl27GeneConfig.codeTable).toBe(STANDARD_GENETIC_CODE);
    expect(fl27GeneConfig.replication).toEqual(GENE_REPLICATION);
    expect(Object.fromEntries(fl27GeneConfig.variants.map((variant: { id: string }) => [variant.id, variant]))).toEqual(GENE_VARIANTS);
  });

  it("a completed FE draft is accepted by the BE schema unchanged and marked on the pinned gene", async () => {
    const fe = await import(resolve(feRoot!, "gene-evidence.ts"));
    for (const variantId of Object.keys(GENE_VARIANTS)) {
      const truth = geneExpression({ variantId });
      // Fill the FE default draft the way the activity's controls do.
      const draft = fe.defaultGeneEvidence();
      draft.variantId = variantId;
      draft.structure = { bpPerTurn: 10, turnLengthA: 34, riseA: 3.4, diameterA: 20, pairing: "A" };
      draft.replication = { stageOrder: ["UNWIND", "SYNTHESIZE", "COMPLETE"], newStrand: [...truth.replication.newStrand], semiConservative: "A" };
      draft.transcription = { mrna: [...truth.mrna] };
      draft.translation = { aminoAcids: [...truth.aminoAcids], codonCombos: { n1: 4, n2: 16, n3: 64 } };
      draft.mutation = { mutatedCodon: truth.mutation.codon, mutatedAminoAcid: truth.mutation.aminoAcid, effect: truth.mutation.effect };
      draft.conclusion = { flow: "A", geneRole: "A" };
      expect(fe.geneEvidenceReady(draft), variantId).toBe(true);
      const parsed = geneEvidenceSchema.parse(draft);
      expect(parsed).toEqual(draft);
      expect(evaluateGeneProteinStations(parsed, { variantId: variantId as keyof typeof GENE_VARIANTS }).verdict, variantId).toBe("passed");
    }
  });

  it("an incomplete FE draft is not ready and is rejected by the BE schema", async () => {
    const fe = await import(resolve(feRoot!, "gene-evidence.ts"));
    const draft = fe.defaultGeneEvidence();
    expect(fe.geneEvidenceReady(draft)).toBe(false);
    expect(geneEvidenceSchema.safeParse(draft).success).toBe(false);
  });
});
