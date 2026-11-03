import { VERSION as ENGINE_VERSION } from "../../../../packages/sim";
import {
  CORNEA_POWER_D, DISTANCE_RANGE_M, DISTANCE_TOLERANCE_M, EYE_OPTICS_ANSWER_ALIASES, EYE_OPTICS_SCENARIOS, FOCUS_TOLERANCE_D,
  GLASSES_POWER_RANGE_D, LENS_POWER_RANGE_D, POWER_STEP_D, RELAXED_LENS_MAX_D, VITREOUS_INDEX,
} from "../../../../packages/sim/eye-optics";
import { digest } from "../application/lab-run";
import { EYE_OPTICS_ACTIVITY_KEY, EYE_OPTICS_MODEL, EYE_OPTICS_RUBRIC } from "../application/evaluators/eye-anatomy-optics.evaluator";

/**
 * Creation-only FL-16 execution tuple: Lab, challenge, activity, config v1 and pack v1.
 *
 * Same contract as the FL-03 shared seed: every write is an `upsert` with an empty
 * `update`, so existing rows are never modified, and nothing is deleted. FL-16 has its
 * own Lab id (`eye-optics`); the legacy `eye` Lab, its eye@1.0.0 config/pack and
 * lessons are not read or written. No curriculum row, LabRelease, OWNER_SIGNOFF or
 * lesson binding is created, and releaseCleared stays false (CLASS_PRIVATE).
 */
export const EYE_OPTICS_TUPLE = {
  labId: "eye-optics",
  challengeId: "eye_optics_001",
  packKey: "eye-optics-ex-a",
  kitId: "EX-A",
  subjectId: "khtn",
  proposedOutcomes: ["KHTN8-B37-O04"],
} as const;

const NOTICE = "FL-16 Showcase Pilot (Kit EX-A). Proposed mapping and constants await SME review (fl-16-sme-review-checklist.md); not a release.";

const correctLabels = {
  cornea: "Giác mạc", aqueous: "Thủy dịch", pupil: "Đồng tử", lens: "Thể thủy tinh",
  vitreous: "Dịch kính", retina: "Màng lưới", nerve: "Dây thần kinh thị giác", sclera: "Củng mạc",
};
const correctPhase2 = [
  { scenarioId: "normal-near", objectDistanceM: 0.25, lensPowerD: 20, glassesPowerD: 0 },
  { scenarioId: "myopia-far", objectDistanceM: null, lensPowerD: 16, glassesPowerD: -2 },
  { scenarioId: "hyperopia-near", objectDistanceM: 0.4, lensPowerD: 18.75, glassesPowerD: 3 },
];
const emptyPhase2 = correctPhase2.map((attempt) => ({ ...attempt, objectDistanceM: 1, lensPowerD: 16, glassesPowerD: 0 }));

/**
 * Rubric golden cases (verdict of eye-anatomy-optics@1.0.0), kept in the pack template
 * and checked by eye-optics-tuple.seed.test.ts.
 */
export const EYE_OPTICS_RUBRIC_GOLDEN_CASES = [
  { label: "All 8 names and 3 scenarios in focus", evidence: { phase1: { labels: correctLabels }, phase2: correctPhase2 }, rubricVerdict: "passed" },
  { label: "Names only, optics untouched", evidence: { phase1: { labels: correctLabels }, phase2: emptyPhase2 }, rubricVerdict: "partial" },
  { label: "Empty draft", evidence: { phase1: { labels: {} }, phase2: emptyPhase2 }, rubricVerdict: "needs_practice" },
];

/**
 * Configuration golden cases. eye-optics@1.0.0 is observation-only, so "passed"
 * means the evidence is a valid model state; the rubric verdicts are above.
 */
export const EYE_OPTICS_GOLDEN_CASES = EYE_OPTICS_RUBRIC_GOLDEN_CASES.map(({ label, evidence }) => ({
  challengeId: EYE_OPTICS_TUPLE.challengeId, label, labState: evidence, expectedVerdict: "passed" as const,
}));

/**
 * Kit, constants, scenarios and rubric facts live on Lab.config: the pack template
 * and activity spec are validated strictly at release and accept only their own keys.
 */
export const EYE_OPTICS_LAB_CONFIG = {
  notice: NOTICE,
  kitId: EYE_OPTICS_TUPLE.kitId,
  portfolio: "showcase-pilot",
  smeReviewPending: true,
  rubricRef: EYE_OPTICS_RUBRIC,
  constants: {
    vitreousIndex: VITREOUS_INDEX, corneaPowerD: CORNEA_POWER_D, lensPowerRangeD: LENS_POWER_RANGE_D, relaxedLensMaxD: RELAXED_LENS_MAX_D,
    glassesPowerRangeD: GLASSES_POWER_RANGE_D, powerStepD: POWER_STEP_D, focusToleranceD: FOCUS_TOLERANCE_D,
    distanceRangeM: DISTANCE_RANGE_M, distanceToleranceM: DISTANCE_TOLERANCE_M,
  },
  scenarios: EYE_OPTICS_SCENARIOS,
  answerAliases: EYE_OPTICS_ANSWER_ALIASES,
  rubric: { phase1: "8 criteria, one per part", phase2: "3 criteria, one per scenario", passed: "11/11", partialFrom: 6 },
  rubricGoldenCases: EYE_OPTICS_RUBRIC_GOLDEN_CASES,
};

export const EYE_OPTICS_PACK_TEMPLATE = {
  units: { power: "D", distance: "m", axialLength: "m" },
  ranges: {}, initialState: null,
  limitations: "Reduced-eye thin-element model; vertex distance ignored; illustrative anatomy, not medical grade.",
  goldenCases: EYE_OPTICS_GOLDEN_CASES.map(({ label, labState }) => ({ label, state: labState, expectedVerdict: "passed" as const, expectedOutputs: {} })),
};

export const EYE_OPTICS_ACTIVITY_SPEC = {
  key: EYE_OPTICS_ACTIVITY_KEY,
  outcomeCodes: [...EYE_OPTICS_TUPLE.proposedOutcomes],
  objective: "Phase 1: name the 8 parts of the eye on a 3D model. Phase 2: focus the image on the retina by accommodation and corrective lenses for a normal, a mildly myopic and a hyperopic eye.",
  materials: ["3D eye model (Kit EX-A)", "Object at a chosen distance", "Diverging and converging spectacle lenses"],
  setup: "Sagittal section of the eye with a ray fan; distances 0.1–6 m or infinity.",
  procedure: ["Name each numbered part", "Normal eye: object at 25 cm, adjust the lens", "Mild myopia: distant object, relaxed lens, choose glasses", "Hyperopia: object at 40 cm, choose glasses and adjust the lens"],
  variables: [
    { name: "object distance", unit: "m", role: "independent" },
    { name: "lens power", unit: "D", role: "independent" },
    { name: "glasses power", unit: "D", role: "independent" },
    { name: "defocus", unit: "D", role: "dependent" },
  ],
  observations: ["Image position relative to the retina", "Blur on the retina"],
  expectedResult: "All names accepted; the image is within ±0.5 D of the retina in all three scenarios.",
  explanation: "Proposed mapping to KHTN8-B37-O04; awaiting SME review.",
  safety: "Virtual model only; not an eye examination.",
  limitations: "Reduced-eye thin-element model; vertex distance ignored.",
  modality: "deterministic-simulation",
  sources: [{ title: "Internal FL-16 activity specification", license: "INTERNAL" }],
};

export async function seedEyeOpticsTuple(db: any, adminId: string, options: { dryRun?: boolean } = {}) {
  const subject = await db.subject.findUnique({ where: { id: EYE_OPTICS_TUPLE.subjectId }, select: { id: true } });
  if (!subject) throw new Error(`Subject ${EYE_OPTICS_TUPLE.subjectId} must already exist; this seed does not create curriculum subjects`);
  const outcomes = await db.curriculumOutcome.findMany({ where: { code: { in: [...EYE_OPTICS_TUPLE.proposedOutcomes] } }, select: { code: true, status: true } });
  const existing = {
    lab: Boolean(await db.lab.findUnique({ where: { id: EYE_OPTICS_TUPLE.labId }, select: { id: true } })),
    challenge: Boolean(await db.challenge.findUnique({ where: { id: EYE_OPTICS_TUPLE.challengeId }, select: { id: true } })),
    activity: Boolean(await db.practicalActivityVersion.findUnique({ where: { key_version: { key: EYE_OPTICS_ACTIVITY_KEY, version: 1 } }, select: { id: true } })),
    config: Boolean(await db.simulationConfigVersion.findUnique({ where: { labId_version: { labId: EYE_OPTICS_TUPLE.labId, version: 1 } }, select: { id: true } })),
    pack: Boolean(await db.simulationPackVersion.findUnique({ where: { key_version: { key: EYE_OPTICS_TUPLE.packKey, version: 1 } }, select: { id: true } })),
  };
  if (options.dryRun) return { dryRun: true as const, existing, outcomes };

  const lab = await db.lab.upsert({
    where: { id: EYE_OPTICS_TUPLE.labId },
    create: {
      id: EYE_OPTICS_TUPLE.labId, subjectId: EYE_OPTICS_TUPLE.subjectId, title: "Mắt và điều tiết (FL-16)", grade: 8,
      topic: "Cấu tạo mắt, điều tiết và tật khúc xạ",
      learningObjective: "Gọi tên các bộ phận của mắt; điều tiết thể thủy tinh và chọn kính để ảnh rơi đúng màng lưới.",
      status: "published", scope: "CLASS_PRIVATE", releaseCleared: false, topicCode: null, synthetic: false,
      simulationModelRef: EYE_OPTICS_MODEL, config: EYE_OPTICS_LAB_CONFIG as any, assets: [],
    },
    update: {},
  });
  await db.challenge.upsert({
    where: { id: EYE_OPTICS_TUPLE.challengeId },
    create: { id: EYE_OPTICS_TUPLE.challengeId, labId: lab.id, objective: lab.learningObjective, constraints: { params: {} } },
    update: {},
  });
  const activity = await db.practicalActivityVersion.upsert({
    where: { key_version: { key: EYE_OPTICS_ACTIVITY_KEY, version: 1 } },
    create: { key: EYE_OPTICS_ACTIVITY_KEY, version: 1, digest: digest(EYE_OPTICS_ACTIVITY_SPEC), spec: EYE_OPTICS_ACTIVITY_SPEC as any, reviews: { ownerSignoffPending: true }, createdById: adminId },
    update: {},
  });
  const config = await db.simulationConfigVersion.upsert({
    where: { labId_version: { labId: lab.id, version: 1 } },
    create: {
      labId: lab.id, version: 1, modelRef: EYE_OPTICS_MODEL, challengeParams: { [EYE_OPTICS_TUPLE.challengeId]: {} } as any,
      goldenCases: EYE_OPTICS_GOLDEN_CASES as any, status: "active", reason: NOTICE, createdById: adminId,
    },
    update: {},
  });
  const pack = await db.simulationPackVersion.upsert({
    where: { key_version: { key: EYE_OPTICS_TUPLE.packKey, version: 1 } },
    create: {
      key: EYE_OPTICS_TUPLE.packKey, version: 1, labId: lab.id, modelRef: EYE_OPTICS_MODEL, engineVersion: ENGINE_VERSION,
      activityVersionId: activity.id, template: EYE_OPTICS_PACK_TEMPLATE as any, visualAssetVersionId: null,
      semanticMap: { cornea: "cornea", aqueous: "aqueous", pupil: "pupil", lens: "lens", vitreous: "vitreous", retina: "retina", nerve: "nerve", sclera: "sclera" } as any,
      bindings: [] as any, challengeTemplates: [] as any, reviews: { ownerSignoffPending: true } as any,
      status: "active", reason: NOTICE, createdById: adminId,
    },
    update: {},
  });
  return {
    dryRun: false as const, existing, outcomes, lab, challengeId: EYE_OPTICS_TUPLE.challengeId,
    configVersionId: config.id, packVersionId: pack.id, activityVersionId: activity.id, rubricRef: EYE_OPTICS_RUBRIC,
  };
}
