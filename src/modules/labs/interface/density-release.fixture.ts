import { digest } from "../application/lab-run";
import { LabReleaseService } from "../application/lab-release.service";
import { DENSITY_ACTIVITY_KEY, DENSITY_MODEL } from "../application/evaluators/density-stations.evaluator";
import { ISOLATED_NOTICE } from "./density-fixture-notice";

/**
 * FL-03 release chain for an ISOLATED database only (plan §10 and §15).
 *
 * It drives the real LabReleaseService: createDraft → review (OWNER_SIGNOFF) →
 * activate. Every curriculum row, lesson, content pack and sign-off here is a
 * labelled TEST FIXTURE. The sign-off is a mechanics receipt, not a real owner
 * review, and no shared database is touched. Idempotent: rerunning reuses rows.
 */
export const FIXTURE = {
  labId: "density",
  outcome: "KHTN8-B14-O01",
  chapter: "FIXTURE-KHTN8-CH03",
  topic: "FIXTURE-KHTN8-B13-B14",
  lesson: "fixture-density-lesson",
  contentPackKey: "fixture-density-content-pack",
  activityKey: DENSITY_ACTIVITY_KEY,
  challengeId: "density_001",
};

const evidence = {
  curriculumMapping: "TEST FIXTURE ONLY — isolated KHTN8 B13–14 mapping mechanics",
  sourceReferences: ["TEST FIXTURE ONLY — synthetic source reference"],
  scientificGoldenCases: "TEST FIXTURE ONLY — golden states match the density model",
  rubric: "TEST FIXTURE ONLY — density-stations@1 criteria",
  safetyAssessment: "TEST FIXTURE ONLY — virtual instruments only",
  rightsAssessment: "TEST FIXTURE ONLY — no external assets",
};

const goldenCase = {
  challengeId: FIXTURE.challengeId,
  label: "TEST FIXTURE ONLY — observation state is valid",
  labState: { blockId: "wood-block-a", pebbleId: "pebble-a", pouredMl: 50, pebbleInitialMl: 50 },
  expectedVerdict: "passed" as const,
};

export async function seedDensityReleaseFixture(db: any, adminId: string) {
  const subjectId = "khtn";
  await db.curriculumChapter.upsert({
    where: { code: FIXTURE.chapter },
    create: { code: FIXTURE.chapter, subjectId, grade: 8, domain: "MATTER", title: "TEST FIXTURE ONLY — chương III", status: "active", synthetic: false },
    update: { status: "active", synthetic: false },
  });
  await db.curriculumTopic.upsert({
    where: { code: FIXTURE.topic },
    create: { code: FIXTURE.topic, chapterCode: FIXTURE.chapter, title: "TEST FIXTURE ONLY — khối lượng riêng", outcomeCodes: [FIXTURE.outcome], status: "active" },
    update: { outcomeCodes: [FIXTURE.outcome], status: "active" },
  });
  await db.curriculumOutcome.upsert({
    where: { code: FIXTURE.outcome },
    create: { code: FIXTURE.outcome, grade: 8, domain: "MATTER", chapter: "TEST FIXTURE ONLY", statement: "TEST FIXTURE ONLY — mapping mechanics for the isolated density release", sourceEvidence: { originType: "test_fixture_only" }, synthetic: false, status: "active" },
    update: { status: "active", synthetic: false, sourceEvidence: { originType: "test_fixture_only" } },
  });

  const existingContentPack = await db.contentPack.findUnique({ where: { key: FIXTURE.contentPackKey } }).catch(() => null);
  if (!existingContentPack) {
    await db.$executeRaw`INSERT INTO "ContentPack" ("key", "subjectId", "grade", "domain", "title", "namespace") VALUES (${FIXTURE.contentPackKey}, ${subjectId}, 8, 'MATTER', 'TEST FIXTURE ONLY — density source', 'baseline')`;
  }
  const contentPackVersion = (await db.contentPackVersion.findFirst({ where: { packKey: FIXTURE.contentPackKey, version: 1 } })) ?? await db.contentPackVersion.create({ data: {
    packKey: FIXTURE.contentPackKey, version: 1, digest: digest({ fixture: "density", lesson: FIXTURE.lesson }),
    manifest: { fixture: "density", notice: ISOLATED_NOTICE }, status: "released", synthetic: false,
    outcomeCodes: [FIXTURE.outcome], releaseId: "fixture-density-content-release",
  } });
  await db.lesson.upsert({
    where: { id: FIXTURE.lesson },
    create: {
      id: FIXTURE.lesson, subjectId, authorId: adminId, title: "TEST FIXTURE ONLY — khối lượng riêng", chapter: "TEST FIXTURE ONLY", grade: 8,
      topic: "TEST FIXTURE ONLY", learningObjective: "No curriculum claim; isolated fixture.", prerequisites: "", curriculum: "TEST FIXTURE ONLY",
      content: "Synthetic release binding only.", status: "published", scope: "SHARED_LIBRARY", synthetic: false,
      curriculumChapterCode: FIXTURE.chapter, curriculumTopicCode: FIXTURE.topic, outcomeCodes: [FIXTURE.outcome], packVersionId: contentPackVersion.id,
    },
    update: { status: "published", scope: "SHARED_LIBRARY", synthetic: false, outcomeCodes: [FIXTURE.outcome], packVersionId: contentPackVersion.id, curriculumTopicCode: FIXTURE.topic, curriculumChapterCode: FIXTURE.chapter },
  });

  // The density activity must name the mapped outcome. Only this isolated database is changed.
  const activitySpec = {
    key: FIXTURE.activityKey, outcomeCodes: [FIXTURE.outcome],
    objective: "TEST FIXTURE ONLY: four textbook stations, readings and calculation of density",
    materials: ["TEST FIXTURE ONLY: wood block, pebble, water, cylinder, balance, ruler"], setup: "Virtual instruments with declared resolutions.",
    procedure: ["Explore m/V", "Wood block", "Water", "Pebble"],
    variables: [{ name: "specimen", unit: "pinned per run", role: "independent" }, { name: "density", unit: "g/cm3", role: "dependent" }],
    observations: ["Readings within one division", "Density from the learner's own readings"],
    expectedResult: "TEST FIXTURE ONLY", explanation: "Synthetic data for a mechanics test; not a curriculum or scientific approval.",
    safety: "Virtual instruments only.", limitations: "Idealised instruments.", modality: "deterministic-simulation",
    sources: [{ title: "Synthetic test fixture", license: "TEST_ONLY" }],
  };
  await db.practicalActivityVersion.update({
    where: { key_version: { key: FIXTURE.activityKey, version: 1 } },
    data: { spec: activitySpec as any, digest: digest(activitySpec) },
  });

  const config = await db.simulationConfigVersion.findFirstOrThrow({ where: { labId: FIXTURE.labId, version: 1 } });
  await db.simulationConfigVersion.update({
    where: { id: config.id },
    data: { challengeParams: { [FIXTURE.challengeId]: {} } as any, goldenCases: [goldenCase] as any, modelRef: DENSITY_MODEL },
  });

  const pack = await db.simulationPackVersion.findFirstOrThrow({ where: { labId: FIXTURE.labId, status: "active" } });
  const packGolden = [
    { label: goldenCase.label, state: goldenCase.labState, expectedVerdict: "passed", expectedOutputs: {} },
    { label: "TEST FIXTURE ONLY — second specimen pair is valid", state: { blockId: "wood-block-b", pebbleId: "pebble-b", pouredMl: 50, pebbleInitialMl: 50 }, expectedVerdict: "passed", expectedOutputs: {} },
  ];
  const { instruments: _instruments, ...templateRest } = pack.template as Record<string, unknown>;
  const packTemplate = { ...templateRest, goldenCases: packGolden };
  await db.simulationPackVersion.update({
    where: { id: pack.id },
    data: {
      template: packTemplate as any,
      semanticMap: { balance: "balance", cylinder: "cylinder", ruler: "ruler" } as any,
      reviews: { ownerSignoffPending: true } as any,
      activityVersionId: (await db.practicalActivityVersion.findUniqueOrThrow({ where: { key_version: { key: FIXTURE.activityKey, version: 1 } } })).id,
    },
  });

  // releaseCleared is owned by activation; never reset it here, or a rerun would unpublish an active release.
  await db.lab.update({ where: { id: FIXTURE.labId }, data: { synthetic: false, topicCode: FIXTURE.topic } });

  // Release chain through the real service. Each step is checked; nothing is forced.
  const service = new LabReleaseService(db);
  const admin = { user: { sub: adminId, role: "ADMIN" } };
  const draft = await service.createDraft(FIXTURE.labId, admin, { reason: ISOLATED_NOTICE, lessonId: FIXTURE.lesson });
  let release = await db.labRelease.findUniqueOrThrow({ where: { id: draft.id } });
  if (release.status === "DRAFT") {
    await service.review(release.id, admin, { kind: "OWNER_SIGNOFF", decision: "APPROVE", releaseDigest: release.digest, note: ISOLATED_NOTICE, evidence });
    release = await db.labRelease.findUniqueOrThrow({ where: { id: release.id } });
  }
  if (release.status === "APPROVED") await service.activate(FIXTURE.labId, release.id, admin, { reason: ISOLATED_NOTICE });
  return db.labRelease.findUniqueOrThrow({ where: { id: release.id } });
}
