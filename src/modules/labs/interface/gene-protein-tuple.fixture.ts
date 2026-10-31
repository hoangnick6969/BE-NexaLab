import { VERSION as ENGINE_VERSION, GENE_STRUCTURE } from "../../../../packages/sim";
import { GENE_ACTIVITY_KEY, GENE_MODEL } from "../application/evaluators/gene-protein-stations.evaluator";
import { digest } from "../application/lab-run";

/** Shared label for every FL-27 isolated-test record. Never a curriculum, scientific or rights approval. */
export const GENE_FIXTURE_NOTICE = "TEST FIXTURE ONLY: isolated development data for FL-27. Not curriculum, scientific or rights approval; not a release or owner review.";

/** Proposed KHTN 9 outcomes, in the `KHTN-L9/<topic>/<n>` format the BE uses for grade 9 (FL-25). */
export const GENE_OUTCOME_CODES = [2, 4, 5, 6, 7].map((n) => `KHTN-L9/tu-gene-den-protein/${n}`);

export const GENE_TUPLE = {
  labId: "gene-protein",
  challengeId: "gene_protein_001",
  packKey: "gene-expression-fixture",
} as const;

/**
 * FL-27 launch tuple for an ISOLATED loopback database only: Lab, challenge,
 * activity, configuration and an active pack. It creates no LabRelease and
 * never sets releaseCleared, so the Lab is reachable only through a class
 * assignment. Idempotent: rerunning reuses the same identities.
 */
export async function seedGeneProteinTuple(db: any, adminId: string) {
  const subject = await db.subject.findUnique({ where: { id: "khtn" } });
  if (!subject) throw new Error("Run the isolated db:seed first: subject khtn is required");

  const lab = await db.lab.upsert({
    where: { id: GENE_TUPLE.labId },
    create: {
      id: GENE_TUPLE.labId, subjectId: subject.id, title: "Từ gene đến protein (FL-27, dữ liệu thử)", grade: 9,
      topic: "Từ gene đến protein", learningObjective: "Mô tả tái bản, phiên mã, dịch mã và đột biến điểm theo SGK KHTN 9 Bài 38–41.",
      status: "published", scope: "CLASS_PRIVATE", releaseCleared: false, topicCode: null, synthetic: true,
      simulationModelRef: GENE_MODEL, config: { notice: GENE_FIXTURE_NOTICE }, assets: [],
    },
    update: { simulationModelRef: GENE_MODEL },
  });

  await db.challenge.upsert({
    where: { id: GENE_TUPLE.challengeId },
    create: { id: GENE_TUPLE.challengeId, labId: lab.id, objective: lab.learningObjective, constraints: { params: {} } },
    update: { objective: lab.learningObjective },
  });

  const activitySpec = {
    key: GENE_ACTIVITY_KEY,
    outcomeCodes: GENE_OUTCOME_CODES.map((code) => `${code} (proposed, unapproved)`),
    objective: "TEST FIXTURE ONLY: six textbook stations from DNA structure to point mutation",
    materials: ["TEST FIXTURE ONLY: procedural DNA, RNA polymerase, ribosome, tRNA and the standard genetic code"],
    setup: "Simplified molecular scene; sizes of enzymes and ribosome are not to scale.",
    procedure: ["DNA structure readings", "Replication", "Transcription", "Translation", "Point mutation", "Gene to trait"],
    variables: [{ name: "gene variant", unit: "pinned per run", role: "independent" }, { name: "polypeptide", unit: "amino acids", role: "dependent" }],
    observations: ["Complementary pairing", "Reading frame from AUG to the stop codon", "Effect of one substitution"],
    expectedResult: "TEST FIXTURE ONLY: sequences consistent with the pinned gene",
    explanation: "Synthetic data for a mechanics test; not a curriculum or scientific approval.",
    safety: "Virtual molecules only.", limitations: `Textbook helix model (${GENE_STRUCTURE.bpPerTurn} bp per ${GENE_STRUCTURE.turnLengthA} Å turn); substitutions only.`,
    modality: "deterministic-simulation", sources: [{ title: "Synthetic test fixture", license: "TEST_ONLY" }],
  };
  const activity = await db.practicalActivityVersion.upsert({
    where: { key_version: { key: GENE_ACTIVITY_KEY, version: 1 } },
    create: { key: GENE_ACTIVITY_KEY, version: 1, digest: digest(activitySpec), spec: activitySpec as any, reviews: { testFixtureOnly: true, notice: GENE_FIXTURE_NOTICE }, createdById: adminId },
    update: {},
  });

  const goldenCases = [{ challengeId: GENE_TUPLE.challengeId, label: "TEST FIXTURE ONLY — gene A is a valid observation", labState: { variantId: "gene-a-missense" }, expectedVerdict: "passed" }];
  const config = await db.simulationConfigVersion.upsert({
    where: { labId_version: { labId: lab.id, version: 1 } },
    create: { labId: lab.id, version: 1, status: "active", modelRef: GENE_MODEL, challengeParams: { [GENE_TUPLE.challengeId]: {} }, goldenCases, reason: GENE_FIXTURE_NOTICE, createdById: adminId },
    update: {},
  });

  const pack = await db.simulationPackVersion.upsert({
    where: { key_version: { key: GENE_TUPLE.packKey, version: 1 } },
    create: {
      key: GENE_TUPLE.packKey, version: 1, labId: lab.id, modelRef: GENE_MODEL, engineVersion: ENGINE_VERSION,
      activityVersionId: activity.id,
      template: { ranges: {}, initialState: null, limitations: GENE_FIXTURE_NOTICE, structure: GENE_STRUCTURE } as any,
      semanticMap: { dna: "dna", mrna: "mrna", ribosome: "ribosome" } as any, bindings: [] as any, challengeTemplates: [] as any,
      reviews: { testFixtureOnly: true, notice: GENE_FIXTURE_NOTICE } as any, status: "active", reason: GENE_FIXTURE_NOTICE, createdById: adminId,
    },
    update: {},
  });

  return { lab, challengeId: GENE_TUPLE.challengeId, activityVersionId: activity.id, configVersionId: config.id, packVersionId: pack.id };
}
