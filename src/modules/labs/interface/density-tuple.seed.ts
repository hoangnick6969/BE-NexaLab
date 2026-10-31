import { VERSION as ENGINE_VERSION } from "../../../../packages/sim";
import { digest } from "../application/lab-run";
import { DENSITY_ACTIVITY_KEY, DENSITY_MODEL, DENSITY_RUBRIC } from "../application/evaluators/density-stations.evaluator";
import { ISOLATED_NOTICE } from "./density-fixture-notice";

/**
 * Creation-only FL-03 execution tuple: Lab, challenge, activity, config v1 and pack v1.
 *
 * Safe on a shared database: every write is `upsert` with an empty `update`, so an
 * existing row is never modified, and nothing is deleted. It does not touch the
 * curriculum (no outcome, chapter, topic or lesson rows), creates no LabRelease,
 * and never sets releaseCleared. The Lab stays CLASS_PRIVATE, so it is reachable
 * through an assignment only.
 */
export const TUPLE = {
  labId: "density",
  challengeId: "density_001",
  packKey: "density-bench-fixture",
  outcome: "KHTN8-B14-O01",
  subjectId: "khtn",
};

const goldenCases = [
  { challengeId: TUPLE.challengeId, label: "Valid observation state (wood A, pebble A)", labState: { blockId: "wood-block-a", pebbleId: "pebble-a", pouredMl: 50, pebbleInitialMl: 50 }, expectedVerdict: "passed" as const },
  { challengeId: TUPLE.challengeId, label: "Valid observation state (wood B, pebble B)", labState: { blockId: "wood-block-b", pebbleId: "pebble-b", pouredMl: 50, pebbleInitialMl: 50 }, expectedVerdict: "passed" as const },
];

export async function seedDensityTuple(db: any, adminId: string) {
  const subject = await db.subject.findUnique({ where: { id: TUPLE.subjectId }, select: { id: true } });
  if (!subject) throw new Error(`Subject ${TUPLE.subjectId} must already exist; this seed does not create curriculum subjects`);
  const outcome = await db.curriculumOutcome.findUnique({ where: { code: TUPLE.outcome }, select: { code: true, status: true } });
  if (!outcome || outcome.status !== "active") throw new Error(`Outcome ${TUPLE.outcome} must already exist and be active`);

  const lab = await db.lab.upsert({
    where: { id: TUPLE.labId },
    create: {
      id: TUPLE.labId, subjectId: TUPLE.subjectId, title: "Xác định khối lượng riêng (FL-03)", grade: 8, topic: "Khối lượng riêng",
      learningObjective: "Đo khối lượng và thể tích, tính khối lượng riêng theo SGK KHTN 8 Bài 13–14.",
      status: "published", scope: "CLASS_PRIVATE", releaseCleared: false, topicCode: null, synthetic: false,
      simulationModelRef: DENSITY_MODEL, config: { notice: ISOLATED_NOTICE }, assets: [],
    },
    update: {},
  });
  await db.challenge.upsert({
    where: { id: TUPLE.challengeId },
    create: { id: TUPLE.challengeId, labId: lab.id, objective: lab.learningObjective, constraints: { params: {} } },
    update: {},
  });

  const activitySpec = {
    key: DENSITY_ACTIVITY_KEY, outcomeCodes: [TUPLE.outcome],
    objective: "Four textbook stations: readings and calculation of density (wood block, water, pebble).",
    materials: ["Wood block", "Pebble", "Water", "Graduated cylinder", "Electronic balance", "Ruler"],
    setup: "Virtual instruments with the declared resolutions.",
    procedure: ["Explore m/V with iron, aluminium and copper bars", "Wood block: three edges and mass", "Water: volume and cup masses", "Pebble: levels before and after dropping"],
    variables: [{ name: "specimen", unit: "pinned per run", role: "independent" }, { name: "density", unit: "g/cm3", role: "dependent" }],
    observations: ["Readings within one division", "Density calculated from the learner's own readings"],
    expectedResult: "Density consistent with the reference values.",
    explanation: "Proposed mapping to KHTN8-B14-O01; not yet approved by a curriculum reviewer.",
    safety: "Virtual instruments only.", limitations: "Idealised instruments; no uncertainty propagation.",
    modality: "deterministic-simulation", sources: [{ title: "Internal FL-03 activity specification", license: "INTERNAL" }],
  };
  const activity = await db.practicalActivityVersion.upsert({
    where: { key_version: { key: DENSITY_ACTIVITY_KEY, version: 1 } },
    create: { key: DENSITY_ACTIVITY_KEY, version: 1, digest: digest(activitySpec), spec: activitySpec as any, reviews: { ownerSignoffPending: true }, createdById: adminId },
    update: {},
  });

  const config = await db.simulationConfigVersion.upsert({
    where: { labId_version: { labId: lab.id, version: 1 } },
    create: {
      labId: lab.id, version: 1, modelRef: DENSITY_MODEL, challengeParams: { [TUPLE.challengeId]: {} } as any,
      goldenCases: goldenCases as any, status: "active", reason: ISOLATED_NOTICE, createdById: adminId,
    },
    update: {},
  });

  const pack = await db.simulationPackVersion.upsert({
    where: { key_version: { key: TUPLE.packKey, version: 1 } },
    create: {
      key: TUPLE.packKey, version: 1, labId: lab.id, modelRef: DENSITY_MODEL, engineVersion: ENGINE_VERSION,
      activityVersionId: activity.id,
      template: {
        units: { mass: "g", volume: "cm3", density: "g/cm3" }, ranges: {}, initialState: null,
        limitations: "Idealised instruments; virtual use only.",
        goldenCases: goldenCases.map(({ label, labState, expectedVerdict }) => ({ label, state: labState, expectedVerdict, expectedOutputs: {} })),
      } as any,
      visualAssetVersionId: null, semanticMap: { balance: "balance", cylinder: "cylinder", ruler: "ruler" } as any,
      bindings: [] as any, challengeTemplates: [] as any, reviews: { ownerSignoffPending: true } as any,
      status: "active", reason: ISOLATED_NOTICE, createdById: adminId,
    },
    update: {},
  });

  return { lab, challengeId: TUPLE.challengeId, configVersionId: config.id, packVersionId: pack.id, activityVersionId: activity.id, rubricRef: DENSITY_RUBRIC };
}
