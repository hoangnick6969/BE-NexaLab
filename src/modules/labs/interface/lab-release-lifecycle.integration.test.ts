import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { ConflictException, ForbiddenException } from "@nestjs/common";
import * as argon from "argon2";
import { afterAll, describe, expect, it } from "vitest";
import { digest, CIRCUIT_BULB_ACTIVITY_KEY, CIRCUIT_BULB_RUBRIC } from "../application/lab-run";
import { LabReleaseService } from "../application/lab-release.service";
import { CatalogController } from "../../curriculum/interface/catalog.controller";
import { LabsController } from "./labs.controller";
import { RequestRateLimiter } from "../../../common/request-rate-limiter";
import { StudentAccessService } from "../../progress/application/student-access.service";
import { CHALLENGE_PARAMETERS } from "../../lessons/application/lesson-content";
import { MODEL_REGISTRY } from "../application/sim-packs";
import { packInputSchema } from "../application/sim-packs";
import { AdminLabsController } from "./admin-labs.controller";
import { ensureCircuitBulbActivity } from "./lab-test-fixtures";

const testUrl = process.env.NEXALAB_PINNING_TEST_URL;
if (process.env.CI && !testUrl) throw new Error("CI requires NEXALAB_PINNING_TEST_URL for Lab release lifecycle integration");
if (testUrl) {
  const url = new URL(testUrl);
  if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) || url.pathname !== "/nexalab_pinning_test")
    throw new Error("Lab release lifecycle integration only accepts isolated local nexalab_pinning_test");
}

const db = testUrl ? new PrismaClient({ datasourceUrl: testUrl }) : null;
afterAll(async () => { await db?.$disconnect(); });

describe.skipIf(!db)("isolated Foundational Lab release lifecycle", () => {
  it("keeps a draft private and refuses activation without recorded human review receipts", async () => {
    const p = db!;
    const suffix = randomUUID().slice(0, 8);
    const labId = `p36-release-gate-${suffix}`;
    const subjectId = `p36-subject-${suffix}`;
    await p.subject.create({ data: { id: subjectId, name: "Private P3.6 release-gate fixture" } });
    const lab = await p.lab.create({ data: {
      id: labId, subjectId, title: "Private Circuit release-gate fixture", topic: "fixture", topicCode: "KHTN8-B22",
      learningObjective: "Verify that unreviewed Circuit releases stay private", status: "published",
      scope: "SHARED_LIBRARY", releaseCleared: false, synthetic: true,
      simulationModelRef: "circuit-bulb@1.0.0",
    } });
    const challengeId = `p36-challenge-${suffix}`;
    await p.challenge.create({ data: { id: challengeId, labId, objective: "Private release gate", constraints: {} } });
    const snapshot = { requiredReviewKinds: ["CURRICULUM", "SUBJECT", "MODEL", "SAFETY", "RIGHTS"] };
    const release = await p.labRelease.create({ data: {
      labId, version: 1, digest: digest(snapshot), snapshot, status: "DRAFT",
      reason: "Private lifecycle gate test", createdById: `fixture-admin-${suffix}`,
    } });

    const service = new LabReleaseService(p as any);
    let thrown: unknown;
    try {
      await service.activate(labId, release.id, { user: { sub: `fixture-admin-${suffix}` } }, { reason: "Must remain blocked without human review" });
    } catch (error) { thrown = error; }

    expect(thrown).toBeInstanceOf(ConflictException);
    expect((thrown as ConflictException).getResponse()).toMatchObject({ code: "LAB_RELEASE_NOT_APPROVED" });
    const [unchangedLab, unchangedRelease, activeRelease, reviews] = await Promise.all([
      p.lab.findUniqueOrThrow({ where: { id: labId } }),
      p.labRelease.findUniqueOrThrow({ where: { id: release.id } }),
      p.labRelease.findFirst({ where: { labId, status: "ACTIVE" } }),
      p.labReleaseReview.count({ where: { releaseId: release.id } }),
    ]);
    expect(unchangedLab).toMatchObject({ status: lab.status, scope: lab.scope, releaseCleared: false });
    expect(unchangedRelease.status).toBe("DRAFT");
    expect(activeRelease).toBeNull();
    expect(reviews).toBe(0);
    const studentReq = { user: { sub: `p36-student-${suffix}`, role: "STUDENT" } };
    const catalog = await new CatalogController(p as any).labs(studentReq);
    expect(catalog.some((item: any) => item.id === labId)).toBe(false);
    const labs = new LabsController(p as any, {} as any, {} as any);
    await expect(labs.launchRun(labId, studentReq, { challengeId }))
      .rejects.toMatchObject({ response: { code: "LAB_NOT_FOUND" } });
  });

  it("runs the TEST_FIXTURE_ONLY Circuit release lifecycle through standalone student replay, quarantine and rollback", async () => {
    const p = db!;
    const suffix = randomUUID().slice(0, 8);
    const labId = `p36-circuit-${suffix}`;
    const challengeId = `p36-challenge-${suffix}`;
    const subjectId = `p36-subject-${suffix}`;
    const topicCode = `P36-TEST-TOPIC-${suffix}`;
    const chapterCode = `P36-TEST-CHAPTER-${suffix}`;
    const outcomeCode = "KHTN8-P36-TEST-ONLY";
    const modelRef = "circuit-bulb@1.0.0";
    const originalModel = MODEL_REGISTRY[modelRef];
    const originalParams = CHALLENGE_PARAMETERS[labId];
    MODEL_REGISTRY[modelRef] = { ...originalModel, labId };
    CHALLENGE_PARAMETERS[labId] = CHALLENGE_PARAMETERS.circuit;
    const state = (closed: boolean) => ({
      nodes: [{ id: "battery", type: "battery" }, { id: "bulb", type: "bulb" }, { id: "switch", type: "switch", closed }],
      edges: [{ source: "battery", target: "bulb" }, { source: "bulb", target: "switch" }, { source: "switch", target: "battery" }],
    });
    const now = new Date().toISOString();
    const testOnlyReviewer = (kind: string) => ({ name: `Synthetic ${kind} reviewer fixture`, email: `synthetic-${kind}-${suffix}@example.test`, at: now });
    const reviewerKinds = ["CURRICULUM", "SUBJECT", "MODEL", "SAFETY", "RIGHTS"] as const;
    try {
      const admin = await p.user.create({ data: { email: `p36-admin-${suffix}@example.test`, fullName: "P3.6 test operator", passwordHash: "test-only", role: "ADMIN" } });
      const student = await p.user.create({ data: { username: `p36-browser-${suffix}`, fullName: "P3.6 isolated browser test student", passwordHash: await argon.hash("p36-browser-local-test-only"), role: "STUDENT" } });
      const unauthorized = await p.user.create({ data: { email: `p36-unauthorized-${suffix}@example.test`, fullName: "Unauthorized reviewer test fixture", passwordHash: "test-only", role: "TEACHER" } });
      const reviewers = await Promise.all(reviewerKinds.map((kind) => p.user.create({
        data: { email: `p36-${kind.toLowerCase()}-${suffix}@example.test`, fullName: `Synthetic ${kind} reviewer fixture`, passwordHash: "test-only", role: "TEACHER" },
      })));
      await p.subject.create({ data: { id: subjectId, name: "TEST FIXTURE ONLY — KHTN8 Circuit" } });
      await p.lab.create({ data: {
        id: labId, subjectId, title: "TEST FIXTURE ONLY — Circuit bulb release workflow", grade: 8, topic: "P3.6 isolated release test",
        learningObjective: "Synthetic fixture for release mechanics only; not curriculum evidence.", status: "published",
        scope: "CLASS_PRIVATE", releaseCleared: false, topicCode, synthetic: false, simulationModelRef: modelRef,
      } });
      await p.challenge.create({ data: { id: challengeId, labId, objective: "TEST FIXTURE ONLY — observe bulb state", constraints: {} } });
      await p.curriculumChapter.create({ data: { code: chapterCode, subjectId, grade: 8, domain: "ENERGY", title: "TEST FIXTURE ONLY", status: "active", synthetic: false } });
      await p.curriculumTopic.create({ data: { code: topicCode, chapterCode, title: "TEST FIXTURE ONLY", outcomeCodes: [outcomeCode], status: "active" } });
      await p.curriculumOutcome.upsert({
        where: { code: outcomeCode },
        create: { code: outcomeCode, grade: 8, domain: "ENERGY", chapter: "TEST FIXTURE ONLY", statement: "Synthetic outcome solely for isolated release-gate mechanics.", sourceEvidence: { originType: "test_fixture_only" }, synthetic: false, status: "active" },
        update: { status: "active", synthetic: false, sourceEvidence: { originType: "test_fixture_only" } },
      });
      const lesson = await p.lesson.create({ data: {
        id: `p36-lesson-${suffix}`, subjectId, authorId: admin.id, title: "TEST FIXTURE ONLY — Circuit lesson binding",
        chapter: "TEST FIXTURE ONLY", grade: 8, topic: "TEST FIXTURE ONLY", learningObjective: "No curriculum claim.",
        prerequisites: "", curriculum: "TEST FIXTURE ONLY", content: "Synthetic release test binding only.", status: "published",
        scope: "SHARED_LIBRARY", synthetic: false, curriculumChapterCode: chapterCode, curriculumTopicCode: topicCode,
        outcomeCodes: [outcomeCode],
      } });
      const course = await p.foundationalCourseVersion.create({ data: {
        id: `p36-course-${suffix}`, subjectId, grade: 8, version: `test-${suffix}`, status: "active", sourceVersion: "TEST_FIXTURE_ONLY",
      } });
      await p.foundationalCourseLesson.create({ data: { courseVersionId: course.id, lessonId: lesson.id, officialOrder: 1, foundationalLabId: labId } });

      const activitySpec = {
        key: CIRCUIT_BULB_ACTIVITY_KEY, outcomeCodes: [outcomeCode], objective: "TEST FIXTURE ONLY: distinguish open and closed bulb states",
        materials: ["Synthetic battery", "Synthetic bulb", "Synthetic switch"], setup: "Isolated test data only.",
        procedure: ["Close switch", "Open switch"],
        variables: [{ name: "switch", unit: "state", role: "independent" as const }, { name: "bulb", unit: "state", role: "dependent" as const }],
        observations: ["Circuit path", "Bulb state"], expectedResult: "Synthetic test expectation only.",
        explanation: "TEST FIXTURE ONLY — not curriculum or scientific approval.", safety: "No real experiment is conducted.",
        limitations: "Test record is isolated and is not release evidence.", modality: "deterministic-simulation" as const,
        sources: [{ title: "Synthetic test fixture", license: "TEST_ONLY" }],
      };
      const activity = await ensureCircuitBulbActivity(p, {
        key: CIRCUIT_BULB_ACTIVITY_KEY, version: 1, digest: digest(activitySpec), spec: activitySpec,
        reviews: { testFixtureOnly: true }, createdById: admin.id,
      });
      expect((activity.spec as any).outcomeCodes).toContain(outcomeCode);

      const packBody = (key: string) => ({
        key, labId, modelRef, activityVersionId: activity.id,
        template: {
          units: {}, ranges: {}, initialState: state(true), limitations: "TEST FIXTURE ONLY; no reviewed scientific claim.",
          goldenCases: [
            { label: "TEST closed", state: state(true), expectedVerdict: "passed" as const, expectedOutputs: { circuitPath: "CLOSED", bulbState: "ON" } },
            { label: "TEST open", state: state(false), expectedVerdict: "passed" as const, expectedOutputs: { circuitPath: "OPEN", bulbState: "OFF" } },
          ],
        },
        visualAssetVersionId: null, semanticMap: { battery: "battery", bulb: "bulb", switch: "switch" }, bindings: [], challengeTemplates: [],
        reviews: { subject: testOnlyReviewer("subject"), model: testOnlyReviewer("model") }, reason: "TEST FIXTURE ONLY — release mechanics",
      });
      const packInputCheck = packInputSchema.safeParse(packBody(`p36-pack-check-${suffix}`));
      expect(packInputCheck.success, JSON.stringify(packInputCheck.success ? [] : packInputCheck.error.issues)).toBe(true);
      const configBody = (version: number) => ({
        labId, version, modelRef, challengeParams: {},
        goldenCases: [{ challengeId, label: "TEST closed bulb", labState: state(true), expectedVerdict: "passed" as const }],
        status: "active", reason: "TEST FIXTURE ONLY — release mechanics", createdById: admin.id,
      });
      const packData = (version: number, key: string, status: string) => ({
        key, version, labId, modelRef, engineVersion: originalModel.engineVersion, activityVersionId: activity.id,
        template: packBody(key).template, semanticMap: packBody(key).semanticMap, bindings: [], challengeTemplates: [], reviews: packBody(key).reviews,
        reason: "TEST FIXTURE ONLY — release mechanics", status, createdById: admin.id,
      });
      const configA = await p.simulationConfigVersion.create({ data: configBody(1) });
      const packA = await p.simulationPackVersion.create({ data: packData(1, `p36-pack-a-${suffix}`, "active") });
      const service = new LabReleaseService(p as any);
      const adminReq = { user: { sub: admin.id, role: "ADMIN" } };
      const studentReq = { user: { sub: student.id, role: "STUDENT" } };
      const draftA = await service.createDraft(labId, adminReq, { reason: "TEST FIXTURE ONLY — create Circuit release draft A" });
      expect(draftA).toMatchObject({ status: "DRAFT", missingReviewKinds: reviewerKinds });

      const releaseService = service;
      const releaseController = new AdminLabsController(p as any, releaseService);
      const releaseDigest = draftA.digest;
      const reviewBody = (kind: typeof reviewerKinds[number]) => ({
        kind, decision: "APPROVE" as const, releaseDigest, note: `TEST FIXTURE ONLY — synthetic ${kind} approval mechanics, not a real review`,
      });
      await expect(service.review(draftA.id, { user: { sub: unauthorized.id } }, reviewBody("CURRICULUM")))
        .rejects.toMatchObject({ response: { code: "LAB_REVIEW_NOT_AUTHORIZED" } });
      let activationError: unknown;
      try { await service.activate(labId, draftA.id, adminReq, { reason: "TEST FIXTURE ONLY — incomplete review must not activate" }); }
      catch (error) { activationError = error; }
      expect(activationError).toBeInstanceOf(ConflictException);
      expect((activationError as ConflictException).getResponse()).toMatchObject({ code: "LAB_RELEASE_NOT_APPROVED" });

      for (const [index, kind] of reviewerKinds.entries()) {
        await service.authorizeReviewer(reviewers[index].id, adminReq, { subjectId, kind, active: true, reason: "TEST FIXTURE ONLY — isolated reviewer authorization" });
      }
      for (const kind of reviewerKinds.slice(0, 4)) {
        const index = reviewerKinds.indexOf(kind);
        await service.review(draftA.id, { user: { sub: reviewers[index].id } }, reviewBody(kind));
      }
      await expect(service.activate(labId, draftA.id, adminReq, { reason: "TEST FIXTURE ONLY — missing RIGHTS receipt must not activate" }))
        .rejects.toMatchObject({ response: { code: "LAB_RELEASE_NOT_APPROVED" } });
      const finalAReview = await service.review(draftA.id, { user: { sub: reviewers[4].id } }, reviewBody("RIGHTS"));
      expect(finalAReview.status).toBe("APPROVED");
      const activeA = await releaseController.activateLabRelease(labId, draftA.id, adminReq, { reason: "TEST FIXTURE ONLY — exercise activation mechanics" });
      expect(activeA.status).toBe("ACTIVE");

      const catalog = new CatalogController(p as any);
      expect((await catalog.labs(studentReq)).some((item: any) => item.id === labId)).toBe(true);
      const labs = new LabsController(p as any, new StudentAccessService(p as any), new RequestRateLimiter());
      const launchA = await labs.launchRun(labId, studentReq, { challengeId });
      expect(launchA).toMatchObject({ versionBinding: "FOUNDATIONAL_RELEASE", modelRef, rubricVersion: CIRCUIT_BULB_RUBRIC });
      const launchRecordA = await p.labRun.findUniqueOrThrow({ where: { id: launchA.runId } });
      expect(launchRecordA.execution).toMatchObject({ binding: "FOUNDATIONAL_RELEASE", releaseId: activeA.id, packVersionId: packA.id });
      const evidence = {
        contract: "lab-contract/1", runId: launchA.runId, idempotencyKey: randomUUID(), stateSchemaVersion: 1, evidenceSchemaVersion: 1,
        checkpoints: [{ id: "CLOSED", state: state(true), prediction: "ON" }, { id: "OPEN", state: state(false), prediction: "OFF" }], explanation: "A", durationMs: 100,
      };
      const attemptA = await labs.attempt(studentReq, evidence);
      const persistedA = await p.attempt.findUniqueOrThrow({ where: { id: attemptA.id } });
      expect(persistedA).toMatchObject({ labRunId: launchA.runId, packVersionId: packA.id, configVersionId: configA.id, verdict: "passed" });
      expect(await new AdminLabsController(p as any, service).reproduce(persistedA.id)).toMatchObject({ matches: true, resultMatches: true, reproductionBasis: "pinned_execution" });

      await p.simulationConfigVersion.update({ where: { id: configA.id }, data: { status: "draft" } });
      await p.simulationPackVersion.update({ where: { id: packA.id }, data: { status: "draft" } });
      const configB = await p.simulationConfigVersion.create({ data: configBody(2) });
      const packB = await p.simulationPackVersion.create({ data: packData(2, `p36-pack-b-${suffix}`, "active") });
      const draftB = await service.createDraft(labId, adminReq, { reason: "TEST FIXTURE ONLY — create Circuit release draft B" });
      const digestB = draftB.digest;
      for (const [index, kind] of reviewerKinds.entries()) {
        await service.review(draftB.id, { user: { sub: reviewers[index].id } }, {
          ...reviewBody(kind), releaseDigest: digestB,
        });
      }
      const activeB = await service.activate(labId, draftB.id, adminReq, { reason: "TEST FIXTURE ONLY — exercise successor activation" });
      expect(activeB.status).toBe("ACTIVE");
      expect((await p.labRelease.findUniqueOrThrow({ where: { id: activeA.id } })).status).toBe("SUPERSEDED");
      expect(configB.status).toBe("active");

      const quarantinedB = await service.quarantine(labId, activeB.id, adminReq, { reason: "TEST FIXTURE ONLY — quarantine successor pack" });
      expect(quarantinedB.status).toBe("QUARANTINED");
      expect(await p.labPackRevocation.findUnique({ where: { packVersionId: packB.id } })).not.toBeNull();
      expect((await p.lab.findUniqueOrThrow({ where: { id: labId } })).releaseCleared).toBe(false);
      expect((await catalog.labs(studentReq)).some((item: any) => item.id === labId)).toBe(false);
      await expect(labs.launchRun(labId, studentReq, { challengeId })).rejects.toMatchObject({ status: 404 });

      const rollbackA = await service.activate(labId, activeA.id, adminReq, { reason: "TEST FIXTURE ONLY — rollback to prior non-revoked release" });
      expect(rollbackA).toMatchObject({ id: activeA.id, status: "ACTIVE" });
      expect((await p.lab.findUniqueOrThrow({ where: { id: labId } })).releaseCleared).toBe(true);
      expect((await catalog.labs(studentReq)).some((item: any) => item.id === labId)).toBe(true);
      const launchAfterRollback = await labs.launchRun(labId, studentReq, { challengeId });
      expect(launchAfterRollback).toMatchObject({ versionBinding: "FOUNDATIONAL_RELEASE", modelRef, rubricVersion: CIRCUIT_BULB_RUBRIC });
      const rollbackRun = await p.labRun.findUniqueOrThrow({ where: { id: launchAfterRollback.runId } });
      expect(rollbackRun.execution).toMatchObject({ binding: "FOUNDATIONAL_RELEASE", releaseId: activeA.id, packVersionId: packA.id });
      const attemptAfterRollback = await labs.attempt(studentReq, {
        ...evidence, runId: launchAfterRollback.runId, idempotencyKey: randomUUID(),
      });
      expect(attemptAfterRollback.verdict).toBe("passed");
      expect((await new AdminLabsController(p as any, service).reproduce(attemptAfterRollback.id)).matches).toBe(true);
      expect((await p.attempt.findUniqueOrThrow({ where: { id: persistedA.id } })).packVersionId).toBe(packA.id);
    } finally {
      MODEL_REGISTRY[modelRef] = originalModel;
      if (originalParams) CHALLENGE_PARAMETERS[labId] = originalParams;
      else delete CHALLENGE_PARAMETERS[labId];
    }
  }, 60000);
});
