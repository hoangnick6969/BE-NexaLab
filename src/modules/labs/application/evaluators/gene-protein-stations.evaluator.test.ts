import { describe, expect, it } from "vitest";
import { CODON_TABLE, GENE_VARIANTS, GENE_VARIANT_IDS, classifySubstitution, geneExpression, translate, type GeneRnaBase } from "../../../../../packages/sim";
import { GENE_MODEL, GENE_RUBRIC, evaluateGeneProteinStations, geneEvidenceSchema, type GeneEvidence } from "./gene-protein-stations.evaluator";
import { genePinsFrom, pickGeneVariant } from "./gene-variants";
import { labEvaluators } from "./registry";
import { observationOnlyModel, resolveModel } from "../sim-packs";
import { runSubmissionSchema, submittedEvidence } from "../lab-run";

const rna = (sequence: string) => [...sequence.replace(/\s/g, "")] as GeneRnaBase[];
const PINS = { variantId: "gene-a-missense" } as const;

/** A learner who reads, pairs and translates everything correctly for gene A (missense pin). */
const perfect = (): GeneEvidence => ({
  variantId: "gene-a-missense",
  structure: { bpPerTurn: 10, turnLengthA: 34, riseA: 3.4, diameterA: 20, pairing: "A" },
  replication: { stageOrder: ["UNWIND", "SYNTHESIZE", "COMPLETE"], newStrand: ["T", "C", "G", "G", "A", "T"], semiConservative: "A" },
  transcription: { mrna: rna("AUG UUC GGA UGG CAU UAA") },
  translation: { aminoAcids: ["Met", "Phe", "Gly", "Trp", "His", "Stop"], codonCombos: { n1: 4, n2: 16, n3: 64 } },
  mutation: { mutatedCodon: "UUA", mutatedAminoAcid: "Leu", effect: "MISSENSE" },
  conclusion: { flow: "A", geneRole: "A" },
});
const evaluate = (change: (e: GeneEvidence) => void = () => {}, pins: { variantId: string } = PINS) => {
  const evidence = perfect();
  change(evidence);
  return evaluateGeneProteinStations(geneEvidenceSchema.parse(evidence), genePinsFrom(pins));
};
const unmet = (change: (e: GeneEvidence) => void) => evaluate(change).result.assessment.unmetCriteria;
const invalid = (change: (e: any) => void) => {
  const evidence: any = perfect();
  change(evidence);
  return !geneEvidenceSchema.safeParse(evidence).success;
};

describe("FL-27 gene-expression model (observation only)", () => {
  it("G1 transcribes and translates gene A: Met–Phe–Gly–Trp–His–Stop", () => {
    const truth = geneExpression({ variantId: "gene-a-missense" });
    expect(truth.mrna).toBe("AUGUUCGGAUGGCAUUAA");
    expect(truth.codons).toEqual(["AUG", "UUC", "GGA", "UGG", "CAU", "UAA"]);
    expect(truth.aminoAcids).toEqual(["Met", "Phe", "Gly", "Trp", "His", "Stop"]);
  });

  it("G2 template strand is the base-by-base complement (A–T, G–C), read 3'→5'", () => {
    expect(geneExpression({ variantId: "gene-a-missense" }).gene.template).toBe("TACAAGCCTACCGTAATT");
  });

  it("G3–G5 and gene B classify each point substitution", () => {
    const cases = {
      "gene-a-missense": { position: 5, codon: "UUA", aminoAcid: "Leu", originalAminoAcid: "Phe", effect: "MISSENSE" },
      "gene-a-nonsense": { position: 11, codon: "UGA", aminoAcid: "Stop", originalAminoAcid: "Trp", effect: "NONSENSE" },
      "gene-a-silent": { position: 8, codon: "GGG", aminoAcid: "Gly", originalAminoAcid: "Gly", effect: "SILENT" },
      "gene-b-missense": { position: 4, codon: "GUA", aminoAcid: "Val", originalAminoAcid: "Glu", effect: "MISSENSE" },
    } as const;
    for (const [variantId, expected] of Object.entries(cases)) expect(geneExpression({ variantId }).mutation, variantId).toMatchObject(expected);
  });

  it("G6 code-word combinations from 4 nucleotides: 4, 16, 64", () => {
    expect(geneExpression({ variantId: "gene-b-missense" }).codeCombinations).toEqual({ n1: 4 ** 1, n2: 4 ** 2, n3: 4 ** 3 });
  });

  it("uses the standard genetic code: 64 codons, 3 stops, AUG = Met, CCC = Pro (Nirenberg–Matthaei)", () => {
    expect(CODON_TABLE.size).toBe(64);
    expect([...CODON_TABLE.entries()].filter(([, meaning]) => meaning === "Stop").map(([codon]) => codon).sort()).toEqual(["UAA", "UAG", "UGA"]);
    expect(CODON_TABLE.get("AUG")).toBe("Met");
    expect(CODON_TABLE.get("CCC")).toBe("Pro");
  });

  it("reads in frame from the first base and stops after the first stop codon", () => {
    expect(translate(rna("AUG UAG GGA"))).toEqual(["Met", "Stop"]);
    expect(translate(rna("AUG UUC GG"))).toEqual(["Met", "Phe"]);
    expect(translate(rna("UGU UCG GAU"))).toEqual(["Cys", "Ser", "Asp"]);
    expect(classifySubstitution("Gly", "Gly")).toBe("SILENT");
  });

  it("replication segment pairs with the template and repeats the coding strand", () => {
    const truth = geneExpression({ variantId: "gene-a-silent" });
    expect(truth.replication).toMatchObject({ templateSegment: "AGCCTA", newStrand: "TCGGAT" });
  });

  it("every pinned variant is a valid teaching gene; anything else fails closed", () => {
    for (const variantId of GENE_VARIANT_IDS) expect(() => geneExpression({ variantId })).not.toThrow();
    expect(() => geneExpression({ variantId: "gene-z" })).toThrow();
    expect(() => geneExpression({ variantId: "gene-a-missense", extra: 1 })).toThrow();
    expect(Object.values(GENE_VARIANTS).every((variant) => variant.coding.length === 18)).toBe(true);
  });

  it("is an allowlisted observation-only model for the gene-protein Lab", () => {
    const model = resolveModel(GENE_MODEL);
    expect(model.labId).toBe("gene-protein");
    expect(observationOnlyModel(GENE_MODEL)).not.toBeNull();
    expect(model.simulate({ variantId: "gene-a-missense" })).toMatchObject({ version: "1.0.0", mrna: "AUGUUCGGAUGGCAUUAA" });
  });
});

describe("FL-27 rubric gene-protein-stations@1.0.0", () => {
  it("passes a learner who completes all six stations correctly", () => {
    const { result, verdict } = evaluate();
    expect(result.assessment).toMatchObject({ score: 6, maximumScore: 6, passed: true, unmetCriteria: [] });
    expect(verdict).toBe("passed");
    expect(result.observations).toEqual({
      replication: { correctBases: 6, totalBases: 6 },
      transcription: { correctBases: 18, totalBases: 18 },
      translation: { residuesRead: 5, reachedStop: true },
    });
  });

  it("never returns the expected sequences in the result", () => {
    const text = JSON.stringify(evaluate((e) => { e.transcription.mrna[3] = "A"; }).result);
    expect(text).not.toContain("AUGUUCGGAUGGCAUUAA");
    expect(text).not.toContain("UUA\"");
  });

  describe("R1 structure", () => {
    it("accepts ruler readings within one 1 Å division and the 3.4 Å rise within 0.1 Å", () => {
      expect(unmet((e) => { e.structure.turnLengthA = 35; e.structure.diameterA = 19; e.structure.riseA = 3.35; })).toEqual([]);
      expect(unmet((e) => { e.structure.turnLengthA = 36; })).toEqual(["structure:readings"]);
      expect(unmet((e) => { e.structure.riseA = 3.6; })).toEqual(["structure:readings"]);
    });
    it("counts base pairs per turn exactly (textbook 10, not B-DNA 10.5)", () => {
      expect(unmet((e) => { e.structure.bpPerTurn = 11; })).toEqual(["structure:readings"]);
      expect(invalid((e) => { e.structure.bpPerTurn = 10.5; })).toBe(true);
    });
    it("fails a wrong pairing rule", () => {
      expect(unmet((e) => { e.structure.pairing = "B"; })).toEqual(["structure:pairing"]);
    });
  });

  describe("R2 replication (complementary base pairing)", () => {
    it("allows one slip but not two", () => {
      expect(unmet((e) => { e.replication.newStrand[0] = "A"; })).toEqual([]);
      expect(unmet((e) => { e.replication.newStrand[0] = "A"; e.replication.newStrand[5] = "G"; })).toEqual(["replication:pairing"]);
    });
    it("fails a strand copied from the template instead of paired with it", () => {
      expect(unmet((e) => { e.replication.newStrand = ["A", "G", "C", "C", "T", "A"]; })).toEqual(["replication:pairing"]);
    });
    it("fails the wrong stage order and a conservative model", () => {
      expect(unmet((e) => { e.replication.stageOrder = ["SYNTHESIZE", "UNWIND", "COMPLETE"]; })).toEqual(["replication:stages"]);
      expect(unmet((e) => { e.replication.semiConservative = "B"; })).toEqual(["replication:semiConservative"]);
    });
    it("rejects U in a DNA strand and repeated or missing stages", () => {
      expect(invalid((e) => { e.replication.newStrand[0] = "U"; })).toBe(true);
      expect(invalid((e) => { e.replication.stageOrder = ["UNWIND", "UNWIND"]; })).toBe(true);
    });
  });

  describe("R3 transcription", () => {
    it("allows one slip but not two", () => {
      expect(unmet((e) => { e.transcription.mrna[17] = "G"; e.translation.aminoAcids = ["Met", "Phe", "Gly", "Trp", "His", "Stop"]; })).toEqual([]);
      expect(unmet((e) => { e.transcription.mrna[16] = "U"; e.transcription.mrna[17] = "U"; e.translation.aminoAcids = ["Met", "Phe", "Gly", "Trp", "His", "Phe"]; })).toEqual(["transcription:mrna"]);
    });
    it("fails a transcript paired with the coding strand instead of the template", () => {
      // Complement of the coding strand = template letters with U for T: UAC AAG CCU ACC GUA AUU.
      const mrna = rna("UAC AAG CCU ACC GUA AUU");
      expect(unmet((e) => { e.transcription.mrna = mrna; e.translation.aminoAcids = translate(mrna); }))
        .toEqual(["transcription:mrna"]);
    });
    it("rejects T in RNA as malformed evidence", () => {
      expect(invalid((e) => { e.transcription.mrna[0] = "T"; })).toBe(true);
      expect(invalid((e) => { e.transcription.mrna = e.transcription.mrna.slice(0, 17); })).toBe(true);
    });
  });

  describe("R4 translation (reading frame and stop codon)", () => {
    it("B1 marks translation against the learner's own transcript, not twice for one slip", () => {
      // mRNA slip in codon 2: UUC → UUA (Leu). R3 still met; Leu is correct for this learner.
      expect(unmet((e) => { e.transcription.mrna[5] = "A"; e.translation.aminoAcids[1] = "Leu"; })).toEqual([]);
      expect(unmet((e) => { e.transcription.mrna[5] = "A"; })).toEqual(["translation:codons"]);
    });
    it("fails a shifted reading frame", () => {
      // Reading from the second base: UGU UCG GAU GGC AUU → Cys Ser Asp Gly Ile.
      expect(unmet((e) => { e.translation.aminoAcids = ["Cys", "Ser", "Asp", "Gly", "Ile", null]; })).toEqual(["translation:codons"]);
    });
    it("fails stopping early or ignoring the stop codon", () => {
      expect(unmet((e) => { e.translation.aminoAcids = ["Met", "Phe", "Gly", "Stop", null, null]; })).toEqual(["translation:codons"]);
      expect(unmet((e) => { e.translation.aminoAcids = ["Met", "Phe", "Gly", "Trp", "His", "Leu"]; })).toEqual(["translation:codons"]);
      expect(unmet((e) => { e.translation.aminoAcids = ["Met", "Phe", "Gly", "Trp", "His", null]; })).toEqual(["translation:codons"]);
    });
    it("expects a stop where the learner's own transcript has one", () => {
      // Slip at base 11 makes codon 4 UGA (stop): this learner's chain ends after Gly.
      expect(unmet((e) => { e.transcription.mrna[11] = "A"; e.translation.aminoAcids = ["Met", "Phe", "Gly", "Stop", null, null]; })).toEqual([]);
    });
    it("fails wrong code-word counts", () => {
      expect(unmet((e) => { e.translation.codonCombos.n3 = 12; })).toEqual(["translation:combinations"]);
    });
    it("rejects gaps and residues after a stop", () => {
      expect(invalid((e) => { e.translation.aminoAcids = ["Met", null, "Gly", null, null, null]; })).toBe(true);
      expect(invalid((e) => { e.translation.aminoAcids = ["Met", "Stop", "Gly", null, null, null]; })).toBe(true);
      expect(invalid((e) => { e.translation.aminoAcids = [null, null, null, null, null, null]; })).toBe(true);
      expect(invalid((e) => { e.translation.aminoAcids[0] = "Xaa"; })).toBe(true);
    });
  });

  describe("R5 point mutation", () => {
    const answers = {
      "gene-a-missense": { mutatedCodon: "UUA", mutatedAminoAcid: "Leu", effect: "MISSENSE" },
      "gene-a-nonsense": { mutatedCodon: "UGA", mutatedAminoAcid: "Stop", effect: "NONSENSE" },
      "gene-a-silent": { mutatedCodon: "GGG", mutatedAminoAcid: "Gly", effect: "SILENT" },
    } as const;
    for (const [variantId, mutation] of Object.entries(answers)) {
      it(`${variantId}: passes the correct reading and classification`, () => {
        expect(evaluate((e) => { e.variantId = variantId as GeneEvidence["variantId"]; e.mutation = { ...mutation }; }, { variantId }).result.assessment.passed).toBe(true);
      });
    }
    it("gene B: GAA → GUA is Glu → Val", () => {
      const result = evaluate((e) => {
        e.variantId = "gene-b-missense";
        e.replication.newStrand = ["A", "A", "C", "C", "C", "T"];
        e.transcription.mrna = rna("AUG GAA CCC UAC GGU UGA");
        e.translation.aminoAcids = ["Met", "Glu", "Pro", "Tyr", "Gly", "Stop"];
        e.mutation = { mutatedCodon: "GUA", mutatedAminoAcid: "Val", effect: "MISSENSE" };
      }, { variantId: "gene-b-missense" });
      expect(result.result.assessment.passed).toBe(true);
    });
    it("fails each wrong part separately", () => {
      expect(unmet((e) => { e.mutation.mutatedCodon = "UUC"; })).toEqual(["mutation:codon"]);
      expect(unmet((e) => { e.mutation.mutatedAminoAcid = "Phe"; })).toEqual(["mutation:aminoAcid"]);
      expect(unmet((e) => { e.mutation.effect = "SILENT"; })).toEqual(["mutation:effect"]);
    });
    it("rejects a codon written with T or the wrong length", () => {
      expect(invalid((e) => { e.mutation.mutatedCodon = "TTA"; })).toBe(true);
      expect(invalid((e) => { e.mutation.mutatedCodon = "UU"; })).toBe(true);
    });
  });

  describe("R6 concepts and the overall verdict", () => {
    it("fails wrong conclusions and reports needs_practice", () => {
      const { result, verdict } = evaluate((e) => { e.conclusion.flow = "B"; e.conclusion.geneRole = "C"; });
      expect(result.assessment).toMatchObject({ score: 5, passed: false, unmetCriteria: ["concept:flow", "concept:geneRole"] });
      expect(verdict).not.toBe("passed");
    });
  });

  describe("runtime pinning", () => {
    it("rejects evidence for a gene other than the pinned one", () => {
      expect(() => evaluate((e) => { e.variantId = "gene-a-silent"; })).toThrow(/không khớp/);
    });
    it("picks a valid variant per run and reads it back; a missing pin fails closed", () => {
      expect(pickGeneVariant(() => 3)).toEqual({ variantId: GENE_VARIANT_IDS[3] });
      expect(genePinsFrom({ variantId: "gene-b-missense" })).toEqual({ variantId: "gene-b-missense" });
      expect(() => genePinsFrom(null)).toThrow();
      expect(() => genePinsFrom({ variantId: "gene-z" })).toThrow();
    });
  });

  describe("registry and submission envelope", () => {
    const config = { labId: "gene-protein", modelRef: GENE_MODEL, engineVersion: "1.0.0", params: { variantId: "gene-a-missense" }, template: null };
    it("resolves the activity/model pair to this rubric and renderer; mismatches fail", () => {
      expect(labEvaluators.rubricRefForActivity("gene-protein-stations", 1, GENE_MODEL)).toBe(GENE_RUBRIC);
      expect(labEvaluators.resolve(GENE_RUBRIC)).toMatchObject({ rendererKey: "gene-expression", envelope: "evidence" });
      expect(() => labEvaluators.rubricRefForActivity("gene-protein-stations", 1, "density-bench@1.0.0")).toThrow();
      expect(() => labEvaluators.rubricRefForActivity("gene-protein-stations", 2, GENE_MODEL)).toThrow();
    });
    it("evaluates a lab-contract evidence submission and rejects malformed evidence", () => {
      const submission = runSubmissionSchema.parse({ contract: "lab-contract/1", runId: "run-fl27", idempotencyKey: "6f1d3c1e-7a51-4c55-9a0e-1c2b3d4e5f60", stateSchemaVersion: 1, evidenceSchemaVersion: 1, durationMs: 1000, evidence: perfect() });
      const submitted = submittedEvidence(submission);
      expect(submitted.envelope).toBe("evidence");
      expect(labEvaluators.evaluate(GENE_RUBRIC, null, submitted.data, config).verdict).toBe("passed");
      expect(() => labEvaluators.evaluate(GENE_RUBRIC, null, { ...perfect(), extra: true }, config)).toThrow(/định dạng/);
    });
  });
});
