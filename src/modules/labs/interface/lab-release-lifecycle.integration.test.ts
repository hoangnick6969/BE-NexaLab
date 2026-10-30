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
import { NestFactory, Reflector } from "@nestjs/core";
import type { INestApplication } from "@nestjs/common";
import { Db } from "../../../db/db";
import { Errors } from "../../../common/errors";
import { AuthGuard, access } from "../../auth/interface/auth";
import { LearningController } from "../../learning/interface/learning.controller";

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
    const snapshot = {
      requiredReviewKinds: ["CURRICULUM", "SUBJECT", "MODEL", "SAFETY", "RIGHTS"],
      execution: { configVersionId: `missing-config-${suffix}`, packVersionId: `missing-pack-${suffix}`, activityVersionId: `missing-activity-${suffix}` },
    };
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
    // A release frozen under the former delegated policy retains that policy.
    const legacyReviewer = await p.user.create({ data: {
      email: `p36-legacy-reviewer-${suffix}@example.test`, fullName: "TEST ONLY legacy reviewer", passwordHash: "test-only", role: "TEACHER",
    } });
    await p.labReviewerAuthorization.create({ data: {
      userId: legacyReviewer.id, subjectId, kind: "CURRICULUM", active: true, authorizedById: "test-only-admin",
    } });
    const legacyDecision = await service.review(release.id, { user: { sub: legacyReviewer.id, role: "TEACHER" } }, {
      kind: "CURRICULUM", decision: "APPROVE", releaseDigest: release.digest, note: "TEST ONLY legacy policy remains valid",
    });
    expect(legacyDecision.status).toBe("DRAFT");
    expect(legacyDecision.missingReviewKinds).toContain("DISTINCT_REVIEWERS");
    expect(legacyDecision.missingReviewKinds).toContain("RIGHTS");
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
    const reviewerKinds = ["OWNER_SIGNOFF"] as const;
    let httpApp: INestApplication | undefined;
    const previousJwtSecret = process.env.JWT_SECRET;
    try {
      const admin = await p.user.create({ data: { email: `p36-admin-${suffix}@example.test`, fullName: "P3.6 test operator", passwordHash: "test-only", role: "ADMIN" } });
      const student = await p.user.create({ data: { username: `p36-browser-${suffix}`, fullName: "P3.6 isolated browser test student", passwordHash: await argon.hash("p36-browser-local-test-only"), role: "STUDENT" } });
      const unauthorized = await p.user.create({ data: { email: `p36-unauthorized-${suffix}@example.test`, fullName: "Unauthorized reviewer test fixture", passwordHash: "test-only", role: "TEACHER" } });
      await p.subject.create({ data: { id: subjectId, name: "TEST FIXTURE ONLY — KHTN8 Circuit" } });
      await p.lab.create({ data: {
        id: labId, subjectId, title: "TEST FIXTURE ONLY — Circuit bulb release workflow", grade: 8, topic: "P3.6 isolated release test",
        learningObjective: "Synthetic fixture for release mechanics only; not curriculum evidence.", status: "published",
        scope: "CLASS_PRIVATE", releaseCleared: false, topicCode: null, synthetic: false, simulationModelRef: "circuit@1.0.0",
      } });
      await p.challenge.create({ data: { id: challengeId, labId, objective: "TEST FIXTURE ONLY — observe bulb state", constraints: {} } });
      const historicalAttempt = await p.attempt.create({ data: {
        studentId: student.id, challengeId, labState: state(true), simulationResult: { legacy: true },
        verdict: "passed", durationMs: 100, simulationModelVersion: "1.0.0",
      } });
      await p.attempt.createMany({ data: Array.from({ length: 24 }, () => ({
        studentId: student.id, challengeId, labState: state(true), simulationResult: { legacy: true },
        verdict: "passed", durationMs: 100, simulationModelVersion: "1.0.0",
      })) });
      const classroom = await p.classroom.create({ data: { teacherId: unauthorized.id, name: "TEST ONLY legacy Circuit class" } });
      await p.assignment.createMany({ data: [1, 2].map((n) => ({
        id: `p36-legacy-led-${suffix}-${n}`, classId: classroom.id, contentId: labId, contentType: "lab", title: "TEST ONLY legacy LED assignment",
      })) });
      const historicalRows = await p.attempt.findMany({ where: { challengeId }, orderBy: { id: "asc" } });
      const legacyAssignments = await p.assignment.findMany({ where: { classId: classroom.id }, orderBy: { id: "asc" } });
      await p.curriculumChapter.create({ data: { code: chapterCode, subjectId, grade: 8, domain: "ENERGY", title: "TEST FIXTURE ONLY", status: "active", synthetic: false } });
      await p.curriculumTopic.create({ data: { code: topicCode, chapterCode, title: "TEST FIXTURE ONLY", outcomeCodes: [outcomeCode], status: "active" } });
      await p.curriculumOutcome.upsert({
        where: { code: outcomeCode },
        create: { code: outcomeCode, grade: 8, domain: "ENERGY", chapter: "TEST FIXTURE ONLY", statement: "Synthetic outcome solely for isolated release-gate mechanics.", sourceEvidence: { originType: "test_fixture_only" }, synthetic: false, status: "active" },
        update: { status: "active", synthetic: false, sourceEvidence: { originType: "test_fixture_only" } },
      });
      const contentPackKey = `p36-content-pack-${suffix}`;
      // The historical migration has a required subjectId column that the current
      // Prisma model does not expose. Keep this focused fixture truthful without
      // broadening P3.6 into an unrelated schema reconciliation.
      await p.$executeRaw`INSERT INTO "ContentPack" ("key", "subjectId", "grade", "domain", "title", "namespace") VALUES (${contentPackKey}, ${subjectId}, 8, 'ENERGY', 'TEST FIXTURE ONLY — B22 source', 'baseline')`;
      const contentPackVersion = await p.contentPackVersion.create({ data: {
        packKey: contentPackKey, version: 1, digest: digest({ fixture: suffix, lesson: "B22" }),
        manifest: { fixture: suffix, lesson: "B22" }, status: "released", synthetic: false,
        outcomeCodes: [outcomeCode], releaseId: `p36-content-release-${suffix}`,
      } });
      const lesson = await p.lesson.create({ data: {
        id: `p36-lesson-${suffix}`, subjectId, authorId: admin.id, title: "TEST FIXTURE ONLY — Circuit lesson binding",
        chapter: "TEST FIXTURE ONLY", grade: 8, topic: "TEST FIXTURE ONLY", learningObjective: "No curriculum claim.",
        prerequisites: "", curriculum: "TEST FIXTURE ONLY", content: "Synthetic release test binding only.", status: "published",
        scope: "SHARED_LIBRARY", synthetic: false, curriculumChapterCode: chapterCode, curriculumTopicCode: topicCode,
        outcomeCodes: [outcomeCode], packVersionId: contentPackVersion.id,
      } });
      expect(await p.foundationalCourseVersion.count({ where: { subjectId } })).toBe(0);

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
        reviews: { ownerSignoffPending: true }, createdById: admin.id,
      });
      expect((activity.spec as any).outcomeCodes).toContain(outcomeCode);
      const adminReq = { user: { sub: admin.id, role: "ADMIN" } };
      const authoring = new AdminLabsController(p as any, new LabReleaseService(p as any));
      const authoredActivity = await authoring.createPractical(adminReq, { ...activitySpec, key: `p36-owner-activity-${suffix}` });
      expect(authoredActivity.reviews).toEqual({ ownerSignoffPending: true });

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
        reviews: { ownerSignoffPending: true }, reason: "TEST FIXTURE ONLY — release mechanics",
      });
      const packInputCheck = packInputSchema.safeParse(packBody(`p36-pack-check-${suffix}`));
      expect(packInputCheck.success, JSON.stringify(packInputCheck.success ? [] : packInputCheck.error.issues)).toBe(true);
      const authoredPack = await authoring.createSimPack(adminReq, packBody(`p36-owner-authoring-${suffix}`));
      expect(authoredPack).toMatchObject({ status: "draft", reviews: { ownerSignoffPending: true } });
      const previousAppEnv = process.env.APP_ENV;
      process.env.APP_ENV = "production";
      try {
        const activatedPack = await authoring.activateSimPack(authoredPack.id, adminReq, { reason: "TEST ONLY — zero ranges need no separate range reviewer" });
        expect(activatedPack.status).toBe("active");
      } finally {
        if (previousAppEnv === undefined) delete process.env.APP_ENV;
        else process.env.APP_ENV = previousAppEnv;
      }
      const authoredConfig = await authoring.createVersion(labId, adminReq, {
        challengeParams: {},
        goldenCases: [{ challengeId, label: "TEST closed bulb", labState: state(true), expectedVerdict: "passed" as const }],
        reason: "TEST FIXTURE ONLY — author first-release bulb config without changing legacy Lab pointer",
      });
      const configA = await authoring.activateVersion(labId, String(authoredConfig.version), adminReq, { reason: "TEST FIXTURE ONLY — activate candidate config" });
      const packA = await p.simulationPackVersion.findUniqueOrThrow({ where: { id: authoredPack.id } });
      expect(configA.modelRef).toBe(modelRef);
      expect(packA).toMatchObject({ status: "active", modelRef });
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
      const service = new LabReleaseService(p as any);
      const studentReq = { user: { sub: student.id, role: "STUDENT" } };
      const draftA = await service.createDraft(labId, adminReq, { reason: "TEST FIXTURE ONLY — create Circuit release draft A", lessonId: lesson.id });
      expect(draftA).toMatchObject({ status: "DRAFT", missingReviewKinds: reviewerKinds });
      expect((draftA.snapshot as any).lessonBindings).toEqual([
        expect.objectContaining({ bindingType: "DIRECT_LESSON", lessonId: lesson.id, contentPackVersionId: contentPackVersion.id }),
      ]);

      const releaseService = service;
      const releaseController = new AdminLabsController(p as any, releaseService);
      const releaseDigest = draftA.digest;
      expect(releaseDigest).toMatch(/^[a-f0-9]{64}$/);
      expect(draftA.snapshot && digest(draftA.snapshot)).toBe(releaseDigest);
      const reviewBody = (kind: typeof reviewerKinds[number]) => ({
        kind, decision: "APPROVE" as const, releaseDigest, note: `TEST FIXTURE ONLY — synthetic ${kind} approval mechanics, not a real review`,
        evidence: {
          curriculumMapping: "TEST FIXTURE ONLY — isolated B22 mapping mechanics",
          sourceReferences: ["TEST FIXTURE ONLY — synthetic source"],
          scientificGoldenCases: "TEST FIXTURE ONLY — CLOSED ON and OPEN OFF",
          rubric: "TEST FIXTURE ONLY — predictions plus explanation",
          safetyAssessment: "TEST FIXTURE ONLY — no physical electricity",
          rightsAssessment: "TEST FIXTURE ONLY — no external assets",
        },
      });
      await expect(service.review(draftA.id, { user: { sub: unauthorized.id } }, reviewBody("OWNER_SIGNOFF")))
        .rejects.toMatchObject({ response: { code: "LAB_OWNER_SIGNOFF_NOT_AUTHORIZED" } });
      let activationError: unknown;
      try { await service.activate(labId, draftA.id, adminReq, { reason: "TEST FIXTURE ONLY — incomplete review must not activate" }); }
      catch (error) { activationError = error; }
      expect(activationError).toBeInstanceOf(ConflictException);
      expect((activationError as ConflictException).getResponse()).toMatchObject({ code: "LAB_RELEASE_NOT_APPROVED" });

      await expect(service.review(draftA.id, adminReq, {
        ...reviewBody("OWNER_SIGNOFF"), releaseDigest: "0".repeat(64),
      })).rejects.toMatchObject({ response: { code: "LAB_RELEASE_DIGEST_MISMATCH" } });
      expect(await p.labReleaseReview.count({ where: { releaseId: draftA.id } })).toBe(0);
      await expect(service.review(draftA.id, adminReq, { ...reviewBody("OWNER_SIGNOFF"), evidence: undefined }))
        .rejects.toMatchObject({ response: { code: "LAB_OWNER_SIGNOFF_EVIDENCE_REQUIRED" } });
      const publishBody = { reason: "TEST ONLY explicit ADMIN publish", releaseDigest, evidence: reviewBody("OWNER_SIGNOFF").evidence };
      process.env.JWT_SECRET = "isolated-p36-http-only-secret-at-least-32-characters";
      httpApp = await NestFactory.create({
        module: class IsolatedPublishTestModule {},
        controllers: [AdminLabsController, CatalogController, LabsController, LearningController],
        providers: [
          { provide: Db, useValue: p }, { provide: LabReleaseService, useValue: service },
          { provide: StudentAccessService, useValue: new StudentAccessService(p as any) },
          { provide: RequestRateLimiter, useValue: new RequestRateLimiter() },
        ],
      }, { logger: false });
      httpApp.setGlobalPrefix("api");
      httpApp.useGlobalGuards(new AuthGuard(new Reflector(), p as any));
      httpApp.useGlobalFilters(new Errors());
      await httpApp.listen(0, "127.0.0.1");
      const baseUrl = await httpApp.getUrl();
      const authenticated = async (user: typeof admin) => {
        const session = await p.session.create({ data: { userId: user.id, tokenHash: randomUUID(), expiresAt: new Date(Date.now() + 60000) } });
        return access(user, session.id);
      };
      const adminToken = await authenticated(admin);
      const studentToken = await authenticated(student);
      const teacherToken = await authenticated(unauthorized);
      const http = async (path: string, token?: string, body?: unknown) => {
        const response = await fetch(baseUrl + "/api" + path, {
          method: body === undefined ? "GET" : "POST",
          headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
          ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        });
        return { status: response.status, body: await response.json() };
      };
      const publishPath = `/admin/labs/${labId}/releases/${draftA.id}/publish`;
      expect((await http(publishPath, undefined, publishBody)).status).toBe(401);
      expect((await http(publishPath, studentToken, publishBody)).status).toBe(403);
      await expect(service.publish(labId, draftA.id, { user: { sub: unauthorized.id, role: "TEACHER" } }, publishBody))
        .rejects.toMatchObject({ response: { code: "LAB_OWNER_SIGNOFF_NOT_AUTHORIZED" } });
      await expect(service.publish(labId, draftA.id, adminReq, { ...publishBody, releaseDigest: "0".repeat(64) }))
        .rejects.toMatchObject({ response: { code: "LAB_RELEASE_DIGEST_MISMATCH" } });
      await expect(service.publish(labId, draftA.id, adminReq, { ...publishBody, evidence: undefined })).rejects.toThrow();
      await expect(service.publish(labId, draftA.id, adminReq, { ...publishBody, evidence: { ...publishBody.evidence, rightsAssessment: "" } })).rejects.toThrow();
      const originalGolden = configA.goldenCases;
      await p.simulationConfigVersion.update({ where: { id: configA.id }, data: { goldenCases: [{ challengeId, label: "Wrong scientific case", labState: state(true), expectedVerdict: "not_passed" }] } });
      await expect(service.publish(labId, draftA.id, adminReq, publishBody)).rejects.toMatchObject({ response: { code: "LAB_CONFIG_VALIDATION_FAILED" } });
      await p.simulationConfigVersion.update({ where: { id: configA.id }, data: { goldenCases: originalGolden as any } });
      await p.lesson.update({ where: { id: lesson.id }, data: { outcomeCodes: [] } });
      await expect(service.publish(labId, draftA.id, adminReq, publishBody))
        .rejects.toMatchObject({ response: { code: "LAB_RELEASE_BINDING_MISMATCH" } });
      // Receipt insertion happens before activation validation; both roll back together.
      expect(await p.labReleaseReview.count({ where: { releaseId: draftA.id } })).toBe(0);
      expect((await p.labRelease.findUniqueOrThrow({ where: { id: draftA.id } })).status).toBe("DRAFT");
      expect((await p.lab.findUniqueOrThrow({ where: { id: labId } })).releaseCleared).toBe(false);
      await p.lesson.update({ where: { id: lesson.id }, data: { outcomeCodes: [outcomeCode] } });
      const [activeA, retriedA] = await Promise.all([
        http(publishPath, adminToken, publishBody).then((r) => { expect(r.status).toBe(201); return r.body; }),
        http(publishPath, adminToken, publishBody).then((r) => { expect(r.status).toBe(201); return r.body; }),
      ]);
      expect(activeA.status).toBe("ACTIVE");
      expect(retriedA.id).toBe(activeA.id);
      expect(await p.labReleaseReview.count({ where: { releaseId: draftA.id } })).toBe(1);
      const receipt = await p.labReleaseReview.findFirstOrThrow({ where: { releaseId: draftA.id } });
      expect(receipt).toMatchObject({ reviewerId: admin.id, kind: "OWNER_SIGNOFF", releaseDigest, evidence: publishBody.evidence });
      expect(receipt.createdAt).toBeInstanceOf(Date);
      expect((await p.labRelease.findUniqueOrThrow({ where: { id: draftA.id } })).snapshot).toEqual(draftA.snapshot);
      expect(await p.attempt.findMany({ where: { challengeId }, orderBy: { id: "asc" } })).toEqual(historicalRows);
      expect(historicalRows).toHaveLength(25);
      expect(await p.assignment.findMany({ where: { classId: classroom.id }, orderBy: { id: "asc" } })).toEqual(legacyAssignments);
      expect(await p.lab.findUniqueOrThrow({ where: { id: labId } })).toMatchObject({ topicCode, simulationModelRef: modelRef });
      expect(await p.attempt.findUniqueOrThrow({ where: { id: historicalAttempt.id } })).toMatchObject({
        id: historicalAttempt.id, simulationResult: { legacy: true }, packVersionId: null, configVersionId: null,
      });

      const catalog = new CatalogController(p as any);
      const httpCatalog = await http("/labs", studentToken);
      expect(httpCatalog.status).toBe(200);
      expect(httpCatalog.body.some((item: any) => item.id === labId)).toBe(true);
      expect(httpCatalog.body.find((item: any) => item.id === labId).lessonLinks).toEqual([
        { lessonId: lesson.id, title: lesson.title, topicCode },
      ]);
      for (const token of [adminToken, teacherToken]) {
        const linked = await http(`/lessons/${lesson.id}/foundational-labs`, token);
        expect(linked.status).toBe(200);
        expect(linked.body).toEqual(expect.arrayContaining([expect.objectContaining({ labId, releaseId: activeA.id })]));
        const publicReading = await http(`/open-curriculum/lessons/${lesson.id}`, token);
        expect(publicReading.status).toBe(200);
        expect(publicReading.body.id).toBe(lesson.id);
      }
      expect((await catalog.labs(studentReq)).some((item: any) => item.id === labId)).toBe(true);
      const labs = new LabsController(p as any, new StudentAccessService(p as any), new RequestRateLimiter());
      await p.lesson.update({ where: { id: lesson.id }, data: { outcomeCodes: [] } });
      expect((await catalog.labs(studentReq)).some((item: any) => item.id === labId)).toBe(false);
      await expect(labs.launchRun(labId, studentReq, { challengeId }))
        .rejects.toMatchObject({ response: { code: "LAB_RELEASE_BINDING_MISMATCH" } });
      await p.lesson.update({ where: { id: lesson.id }, data: { outcomeCodes: [outcomeCode] } });
      expect(await catalog.lessonLabs(lesson.id, studentReq)).toEqual(expect.arrayContaining([expect.objectContaining({ labId, releaseId: activeA.id })]));
      const b22Link = await http(`/lessons/${lesson.id}/foundational-labs`, studentToken);
      expect(b22Link.status).toBe(200);
      expect(b22Link.body).toEqual(expect.arrayContaining([expect.objectContaining({ labId, releaseId: activeA.id })]));
      await expect(labs.launchRun(labId, studentReq, { challengeId, releaseId: "not-the-reviewed-release" }))
        .rejects.toMatchObject({ response: { code: "LAB_RELEASE_CHANGED" } });
      const httpLaunch = await http(`/labs/${labId}/runs`, studentToken, { challengeId });
      expect(httpLaunch.status).toBe(201);
      const launchA = httpLaunch.body;
      expect(launchA).toMatchObject({ versionBinding: "FOUNDATIONAL_RELEASE", modelRef, rubricVersion: CIRCUIT_BULB_RUBRIC });
      const launchRecordA = await p.labRun.findUniqueOrThrow({ where: { id: launchA.runId } });
      expect(launchRecordA.execution).toMatchObject({ binding: "FOUNDATIONAL_RELEASE", releaseId: activeA.id, packVersionId: packA.id });
      const evidence = {
        contract: "lab-contract/1", runId: launchA.runId, idempotencyKey: randomUUID(), stateSchemaVersion: 1, evidenceSchemaVersion: 1,
        checkpoints: [{ id: "CLOSED", state: state(true), prediction: "ON" }, { id: "OPEN", state: state(false), prediction: "OFF" }], explanation: "A", durationMs: 100,
      };
      const httpAttempt = await http("/attempts", studentToken, evidence);
      expect(httpAttempt.status).toBe(201);
      const attemptA = httpAttempt.body;
      const persistedA = await p.attempt.findUniqueOrThrow({ where: { id: attemptA.id } });
      expect(persistedA).toMatchObject({ labRunId: launchA.runId, packVersionId: packA.id, configVersionId: configA.id, verdict: "passed" });
      expect(await new AdminLabsController(p as any, service).reproduce(persistedA.id)).toMatchObject({ matches: true, resultMatches: true, reproductionBasis: "pinned_execution" });

      await p.simulationConfigVersion.update({ where: { id: configA.id }, data: { status: "draft" } });
      await p.simulationPackVersion.update({ where: { id: packA.id }, data: { status: "draft" } });
      const configB = await p.simulationConfigVersion.create({ data: configBody(2) });
      const packB = await p.simulationPackVersion.create({ data: packData(2, `p36-pack-b-${suffix}`, "active") });
      const draftB = await service.createDraft(labId, adminReq, { reason: "TEST FIXTURE ONLY — create Circuit release draft B", lessonId: lesson.id });
      const digestB = draftB.digest;
      const activeB = await service.publish(labId, draftB.id, adminReq, { ...publishBody, releaseDigest: digestB });
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
      await httpApp?.close();
      if (previousJwtSecret === undefined) delete process.env.JWT_SECRET;
      else process.env.JWT_SECRET = previousJwtSecret;
      MODEL_REGISTRY[modelRef] = originalModel;
      if (originalParams) CHALLENGE_PARAMETERS[labId] = originalParams;
      else delete CHALLENGE_PARAMETERS[labId];
    }
  }, 60000);
});
