import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { Module } from "@nestjs/common";
import { APP_GUARD, NestFactory } from "@nestjs/core";
import { Db } from "../../../db/db";
import { access, AuthGuard } from "../../auth/interface/auth";
import { afterAll, describe, expect, it } from "vitest";
import { RequestRateLimiter } from "../../../common/request-rate-limiter";
import { StudentAccessService } from "../../progress/application/student-access.service";
import { MODEL_REGISTRY } from "../application/sim-packs";
import { AdminLabsController } from "./admin-labs.controller";
import { LabsController } from "./labs.controller";

const testUrl = process.env.NEXALAB_PINNING_TEST_URL;
if (process.env.CI && !testUrl) throw new Error("CI requires NEXALAB_PINNING_TEST_URL for LabRun integration");
if (testUrl) {
  const url = new URL(testUrl);
  if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) || url.pathname !== "/nexalab_pinning_test")
    throw new Error("LabRun integration only accepts the isolated local nexalab_pinning_test database");
}
const db = testUrl ? new PrismaClient({ datasourceUrl: testUrl }) : null;
afterAll(async () => { await db?.$disconnect(); });

describe.skipIf(!db)("isolated LabRun integration", () => {
  it("persists launch A through B activation, authorization, idempotency, expiry, revocation and legacy replay", async () => {
    const p = db!;
    const suffix = randomUUID().slice(0, 8);
    const labId = "labrun-" + suffix, challengeId = "challenge-" + suffix;
    const refA = "fixture-a@" + suffix, refB = "fixture-b@" + suffix;
    MODEL_REGISTRY[refA] = { labId, engineVersion: "fixture-a", outputs: { value: "number" }, requiredSemanticIds: [], simulate: (state: any) => {
      if (!Number.isFinite(state?.input)) throw new Error("invalid fixture input");
      return { version: "fixture-a", value: state.input * 2, verdict: "passed" };
    } };
    MODEL_REGISTRY[refB] = { ...MODEL_REGISTRY[refA], engineVersion: "fixture-b", simulate: (state: any) => {
      if (!Number.isFinite(state?.input)) throw new Error("invalid fixture input");
      return { version: "fixture-b", value: state.input * 3, verdict: "passed" };
    } };
    try {
      const teacher = await p.user.create({ data: { email: "teacher-" + suffix + "@example.test", fullName: "Fixture teacher", passwordHash: "fixture", role: "TEACHER" } });
      const admin = await p.user.create({ data: { email: "admin-" + suffix + "@example.test", fullName: "Fixture admin", passwordHash: "fixture", role: "ADMIN" } });
      const student = await p.user.create({ data: { username: "student-" + suffix, fullName: "Fixture student", passwordHash: "fixture", role: "STUDENT" } });
      const outsider = await p.user.create({ data: { username: "outsider-" + suffix, fullName: "Fixture outsider", passwordHash: "fixture", role: "STUDENT" } });
      await p.subject.create({ data: { id: "subject-" + suffix, name: "Isolated fixture" } });
      await p.lab.create({ data: { id: labId, subjectId: "subject-" + suffix, title: "Private fixture", topic: "fixture", learningObjective: "fixture", status: "published", scope: "CLASS_PRIVATE", releaseCleared: false, synthetic: true, simulationModelRef: refA } });
      await p.challenge.create({ data: { id: challengeId, labId, objective: "fixture", constraints: {} } });
      const classroom = await p.classroom.create({ data: { teacherId: teacher.id, name: "Fixture class" } });
      await p.enrollment.create({ data: { classId: classroom.id, studentId: student.id, status: "approved", approved: true } });
      const assignment = await p.assignment.create({ data: { classId: classroom.id, contentId: labId, contentType: "lab", title: "Private fixture assignment", targets: { create: { studentId: student.id } } } });
      const activityA = await p.practicalActivityVersion.create({ data: { key: "fixture-a-" + suffix, version: 1, digest: "a-" + suffix, spec: {}, reviews: {}, createdById: admin.id } });
      const activityB = await p.practicalActivityVersion.create({ data: { key: "fixture-b-" + suffix, version: 1, digest: "b-" + suffix, spec: {}, reviews: {}, createdById: admin.id } });
      const configA = await p.simulationConfigVersion.create({ data: { labId, version: 1, modelRef: refA, challengeParams: { [challengeId]: {} }, goldenCases: [], status: "active", reason: "fixture", createdById: admin.id } });
      const configB = await p.simulationConfigVersion.create({ data: { labId, version: 2, modelRef: refB, challengeParams: { [challengeId]: {} }, goldenCases: [], status: "draft", reason: "fixture", createdById: admin.id } });
      const packData = { labId, template: { ranges: {}, initialState: { input: 2 } }, semanticMap: {}, bindings: [], challengeTemplates: [], reviews: {}, reason: "fixture", createdById: admin.id };
      const packA = await p.simulationPackVersion.create({ data: { ...packData, key: "fixture-a-" + suffix, version: 1, modelRef: refA, engineVersion: "fixture-a", activityVersionId: activityA.id, status: "active" } });
      const packB = await p.simulationPackVersion.create({ data: { ...packData, key: "fixture-b-" + suffix, version: 1, modelRef: refB, engineVersion: "fixture-b", activityVersionId: activityB.id, status: "draft" } });
      const labs = new LabsController(p as any, new StudentAccessService(p as any), new RequestRateLimiter());
      const adminController = new AdminLabsController(p as any);
      const req = { user: { sub: student.id, role: "STUDENT" } };
      const otherReq = { user: { sub: outsider.id, role: "STUDENT" } };
      const adminReq = { user: { sub: admin.id, role: "ADMIN" } };
      await expect(labs.launchRun(labId, otherReq, { challengeId })).rejects.toMatchObject({ status: 404 });
      await p.simulationPackVersion.update({ where: { id: packA.id }, data: { status: "draft" } });
      await expect(labs.launchRun(labId, req, { challengeId })).rejects.toMatchObject({ response: { code: "LAB_TUPLE_INCOMPLETE" } });
      await p.simulationPackVersion.update({ where: { id: packA.id }, data: { status: "active" } });
      await p.simulationConfigVersion.update({ where: { id: configA.id }, data: { modelRef: refB } });
      await expect(labs.launchRun(labId, req, { challengeId })).rejects.toMatchObject({ response: { code: "SIM_PACK_CONFIG_INCOMPATIBLE" } });
      await p.simulationConfigVersion.update({ where: { id: configA.id }, data: { modelRef: refA } });
      // Exercise the actual Nest HTTP guard and session-backed JWT authorization.
      const priorSecret = process.env.JWT_SECRET;
      process.env.JWT_SECRET = "isolated-lab-run-http-test-secret";
      const makeToken = async (user: any) => {
        const session = await p.session.create({ data: { userId: user.id, tokenHash: randomUUID(), kind: "refresh", expiresAt: new Date(Date.now() + 60000) } });
        return access(user, session.id);
      };
      const studentToken = await makeToken(student);
      const teacherToken = await makeToken(teacher);
      const outsiderToken = await makeToken(outsider);
      @Module({
        controllers: [LabsController, AdminLabsController],
        providers: [
          { provide: Db, useValue: p },
          { provide: StudentAccessService, useValue: new StudentAccessService(p as any) },
          { provide: RequestRateLimiter, useValue: new RequestRateLimiter() },
          { provide: APP_GUARD, useClass: AuthGuard },
        ],
      })
      class HttpFixtureModule {}
      const app = await NestFactory.create(HttpFixtureModule, { logger: false });
      try {
        await app.listen(0, "127.0.0.1");
        const address = app.getHttpServer().address();
        const base = "http://127.0.0.1:" + address.port;
        const launchUrl = base + "/labs/" + labId + "/runs";
        const post = (url: string, data: unknown, token?: string) => fetch(url, {
          method: "POST", headers: { "content-type": "application/json", ...(token ? { authorization: "Bearer " + token } : {}) }, body: JSON.stringify(data),
        });
        expect((await post(launchUrl, { challengeId })).status).toBe(401);
        expect((await post(launchUrl, { challengeId }, teacherToken)).status).toBe(403);
        expect((await post(base + "/admin/labs/" + labId + "/packs/" + packA.id + "/revoke-runs", { reason: "Fixture revoke" }, studentToken)).status).toBe(403);
        expect((await post(launchUrl, { challengeId }, outsiderToken)).status).toBe(404);
        const response = await post(launchUrl, { challengeId, assignmentId: assignment.id }, studentToken);
        expect(response.status).toBe(201);
        const httpRun = await response.json() as { runId: string };
        const foreign = await post(base + "/attempts", {
          contract: "lab-contract/1", runId: httpRun.runId, idempotencyKey: randomUUID(),
          stateSchemaVersion: 1, evidenceSchemaVersion: 1, labState: { input: 2 }, durationMs: 0,
        }, outsiderToken);
        expect(foreign.status).toBe(404);
      } finally {
        await app.close();
        if (priorSecret === undefined) delete process.env.JWT_SECRET;
        else process.env.JWT_SECRET = priorSecret;
      }      const launched = await labs.launchRun(labId, req, { challengeId, assignmentId: assignment.id });
      expect(await p.attempt.count({ where: { studentId: student.id } })).toBe(0);
      const run = await p.labRun.findUniqueOrThrow({ where: { id: launched.runId } });
      expect(run.execution).toMatchObject({ modelRef: refA, configVersionId: configA.id, packVersionId: packA.id, activityVersionId: activityA.id });
      await expect(p.labRun.update({ where: { id: run.id }, data: { executionDigest: "tampered" } })).rejects.toThrow();
      await adminController.activateVersion(labId, "2", adminReq, { reason: "Synthetic fixture activation" });
      await adminController.activateSimPack(packB.id, adminReq, { reason: "Synthetic fixture activation" });
      await p.lab.update({ where: { id: labId }, data: { simulationModelRef: refB } });
      const key = randomUUID();
      const body = { contract: "lab-contract/1", runId: run.id, idempotencyKey: key, stateSchemaVersion: 1, evidenceSchemaVersion: 1, labState: { input: 7 }, durationMs: 500 };
      await expect(labs.attempt(otherReq, { ...body, idempotencyKey: randomUUID() })).rejects.toMatchObject({ status: 404 });
      await p.enrollment.update({ where: { classId_studentId: { classId: classroom.id, studentId: student.id } }, data: { status: "removed" } });
      await expect(labs.attempt(req, body)).rejects.toMatchObject({ status: 404 });
      await p.enrollment.update({ where: { classId_studentId: { classId: classroom.id, studentId: student.id } }, data: { status: "approved" } });
      const [first, duplicate] = await Promise.all([labs.attempt(req, body), labs.attempt(req, { ...body, durationMs: 800 })]);
      expect(first.id).toBe(duplicate.id);
      expect(await p.attempt.count({ where: { studentId: student.id } })).toBe(1);
      const saved = await p.attempt.findUniqueOrThrow({ where: { id: first.id } });
      expect(saved).toMatchObject({ labRunId: run.id, configVersionId: configA.id, packVersionId: packA.id, simulationModelVersion: "fixture-a", simulationResult: { value: 14 } });
      expect(await adminController.reproduce(first.id)).toMatchObject({ matches: true, resultMatches: true, reproductionBasis: "pinned_execution" });
      await expect(labs.attempt(req, { ...body, labState: { input: 8 } })).rejects.toMatchObject({ response: { code: "IDEMPOTENCY_KEY_REUSED" } });
      await expect(labs.attempt(req, { challengeId, labState: { input: 7 }, durationMs: 500, idempotencyKey: key }))
        .rejects.toMatchObject({ response: { code: "IDEMPOTENCY_KEY_REUSED" } });
      const expired = await p.labRun.create({ data: {
        studentId: student.id, labId, challengeId, assignmentId: assignment.id, context: "ASSIGNMENT",
        execution: run.execution as any, executionDigest: run.executionDigest, expiresAt: new Date(0),
      } });
      await expect(labs.attempt(req, { ...body, runId: expired.id, idempotencyKey: randomUUID() })).rejects.toMatchObject({ response: { code: "RUN_EXPIRED" } });
      // Queue revoke and submit behind the same real PostgreSQL advisory lock.
      let unlock!: () => void;
      let ready!: () => void;
      const gate = new Promise<void>((resolve) => { unlock = resolve; });
      const locked = new Promise<void>((resolve) => { ready = resolve; });
      const holder = p.$transaction(async (tx) => {
        await tx.$executeRawUnsafe("SELECT pg_advisory_xact_lock(hashtext($1))", "nexalab:sim-pack-lab:" + labId);
        ready();
        await gate;
      }, { timeout: 10000 });
      await locked;
      const revoking = adminController.revokePackRuns(labId, packA.id, adminReq, { reason: "Synthetic fixture revocation" });
      // Avoid unhandled rejections while both operations are waiting.
      const waitingSubmit = labs.attempt(req, { ...body, idempotencyKey: randomUUID() }).then(
        () => "submitted", (error: any) => error?.response?.code,
      );
      unlock();
      await holder;
      await revoking;
      const concurrentOutcome = await waitingSubmit;
      expect(["submitted", "RUN_REVOKED"]).toContain(concurrentOutcome);
      await expect(labs.attempt(req, { ...body, idempotencyKey: randomUUID() })).rejects.toMatchObject({ response: { code: "RUN_REVOKED" } });
      expect((await labs.attempt(req, body)).id).toBe(first.id);
      // Existing standalone assignments do not yet pin the pack at publication: a new launch resolves B.
      const next = await labs.launchRun(labId, req, { challengeId });
      expect((await p.labRun.findUniqueOrThrow({ where: { id: next.runId } })).execution).toMatchObject({ modelRef: refB, packVersionId: packB.id, activityVersionId: activityB.id });
      const legacy = await labs.attempt(req, { challengeId, labState: { input: 7 }, durationMs: 500, idempotencyKey: randomUUID() });
      expect(legacy.labRunId).toBeNull();
      expect((legacy.simulationResult as any).value).toBe(21);
      expect(await adminController.reproduce(legacy.id)).toMatchObject({ matches: true, resultMatches: true });
      await adminController.revokePackRuns(labId, packB.id, adminReq, { reason: "Synthetic fixture emergency block" });
      await expect(labs.launchRun(labId, req, { challengeId })).rejects.toMatchObject({ response: { code: "RUN_REVOKED" } });
      await expect(labs.attempt(req, { challengeId, labState: { input: 7 }, durationMs: 500, idempotencyKey: randomUUID() }))
        .rejects.toMatchObject({ response: { code: "RUN_REVOKED" } });
      console.log("persisted LabRun tuple A and attempt:", JSON.stringify({ runId: run.id, attemptId: saved.id, packA: saved.packVersionId, configA: saved.configVersionId, result: (saved.simulationResult as any).value, packB: packB.id }));
    } finally {
      delete MODEL_REGISTRY[refA];
      delete MODEL_REGISTRY[refB];
    }
  }, 30000);
});