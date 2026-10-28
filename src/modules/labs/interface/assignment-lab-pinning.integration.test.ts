import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { afterAll, describe, expect, it } from "vitest";
import { RequestRateLimiter } from "../../../common/request-rate-limiter";
import { AssignmentsService } from "../../classes/application/assignments.service";
import { StudentAccessService } from "../../progress/application/student-access.service";
import { MODEL_REGISTRY } from "../application/sim-packs";
import { AdminLabsController } from "./admin-labs.controller";
import { LabsController } from "./labs.controller";

const testUrl = process.env.NEXALAB_PINNING_TEST_URL;
if (process.env.CI && !testUrl) throw new Error("CI requires NEXALAB_PINNING_TEST_URL for assignment pin integration");
if (testUrl) {
  const url = new URL(testUrl);
  if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) || url.pathname !== "/nexalab_pinning_test")
    throw new Error("Use only isolated local nexalab_pinning_test");
}
const db = testUrl ? new PrismaClient({ datasourceUrl: testUrl }) : null;
afterAll(async () => { await db?.$disconnect(); });

describe.skipIf(!db)("assignment publication pinning in isolated PostgreSQL", () => {
  it("pins A at publication across students and runs, without fabricating legacy assignment history", async () => {
    const p = db!;
    const suffix = randomUUID().slice(0, 8);
    const labId = "assign-pin-" + suffix, challengeId = "challenge-" + suffix, challengeId2 = "other-challenge-" + suffix;
    const refA = "fixture-assignment-a@" + suffix, refB = "fixture-assignment-b@" + suffix;
    MODEL_REGISTRY[refA] = { labId, engineVersion: "fixture-a", outputs: { value: "number" }, requiredSemanticIds: [], simulate: (s: any) => {
      if (!Number.isFinite(s?.input)) throw new Error("invalid fixture input");
      return { version: "fixture-a", value: s.input * 2, verdict: "passed" };
    } };
    MODEL_REGISTRY[refB] = { ...MODEL_REGISTRY[refA], engineVersion: "fixture-b", simulate: (s: any) => ({ version: "fixture-b", value: s.input * 3, verdict: "passed" }) };
    try {
      const teacher = await p.user.create({ data: { email: "ap-teacher-" + suffix + "@example.test", fullName: "Fixture teacher", passwordHash: "fixture", role: "TEACHER" } });
      const admin = await p.user.create({ data: { email: "ap-admin-" + suffix + "@example.test", fullName: "Fixture admin", passwordHash: "fixture", role: "ADMIN" } });
      const students = await Promise.all([1, 2, 3].map((n) => p.user.create({ data: { username: "ap-" + n + "-" + suffix, fullName: "Fixture student", passwordHash: "fixture", role: "STUDENT" } })));
      await p.subject.create({ data: { id: "subject-" + suffix, name: "Private isolated fixture" } });
      await p.lab.create({ data: { id: labId, subjectId: "subject-" + suffix, title: "Private fixture", topic: "fixture", learningObjective: "fixture", status: "published", scope: "CLASS_PRIVATE", releaseCleared: false, synthetic: true, simulationModelRef: refA } });
      await p.challenge.create({ data: { id: challengeId, labId, objective: "fixture", constraints: {} } });
      await p.challenge.create({ data: { id: challengeId2, labId, objective: "unconfigured base challenge", constraints: {} } });
      const classroom = await p.classroom.create({ data: { teacherId: teacher.id, name: "Fixture class" } });
      for (const student of students.slice(0, 2))
        await p.enrollment.create({ data: { classId: classroom.id, studentId: student.id, status: "approved", approved: true } });
      const assignments = new AssignmentsService(p as any);
      const teacherReq = { user: { sub: teacher.id, role: "TEACHER" }, headers: {} };
      // Publication fails closed when no tuple exists; a pre-existing assignment stays usable without a fabricated pin.
      await expect(assignments.assign(classroom.id, teacherReq, { contentType: "lab", contentId: labId, title: "No versions fixture" }))
        .rejects.toMatchObject({ response: { code: "LAB_TUPLE_INCOMPLETE" } });
      expect(await p.assignment.count({ where: { classId: classroom.id } })).toBe(0);
      const legacy = await p.assignment.create({ data: {
        classId: classroom.id, contentId: labId, contentType: "lab", title: "Historical fixture",
        dueDate: new Date(Date.now() + 3600000), targets: { create: students.slice(0, 2).map((student) => ({ studentId: student.id })) },
      } });
      const legacyId = legacy.id;
      expect((await p.assignment.findUniqueOrThrow({ where: { id: legacyId } })).labExecution).toBeNull();
      const legacyOnlyLabs = new LabsController(p as any, new StudentAccessService(p as any), new RequestRateLimiter());
      const legacyOnlyAttempt = await legacyOnlyLabs.attempt({ user: { sub: students[0].id, role: "STUDENT" } },
        { challengeId, labState: { input: 2 }, durationMs: 500, idempotencyKey: randomUUID() });
      expect(legacyOnlyAttempt.labRunId).toBeNull();
      expect((legacyOnlyAttempt.simulationResult as any).value).toBe(4);
      const activityA = await p.practicalActivityVersion.create({ data: { key: "ap-a-" + suffix, version: 1, digest: "a-" + suffix, spec: {}, reviews: {}, createdById: admin.id } });
      const activityB = await p.practicalActivityVersion.create({ data: { key: "ap-b-" + suffix, version: 1, digest: "b-" + suffix, spec: {}, reviews: {}, createdById: admin.id } });
      const configA = await p.simulationConfigVersion.create({ data: { labId, version: 1, modelRef: refA, challengeParams: { [challengeId]: {} }, goldenCases: [], status: "active", reason: "fixture", createdById: admin.id } });
      const configB = await p.simulationConfigVersion.create({ data: { labId, version: 2, modelRef: refB, challengeParams: { [challengeId]: {} }, goldenCases: [], status: "draft", reason: "fixture", createdById: admin.id } });
      const common = { labId, template: { ranges: {}, initialState: { input: 3 } }, semanticMap: {}, bindings: [], challengeTemplates: [], reviews: {}, reason: "fixture", createdById: admin.id };
      const packA = await p.simulationPackVersion.create({ data: { ...common, key: "ap-a-" + suffix, version: 1, modelRef: refA, engineVersion: "fixture-a", activityVersionId: activityA.id, status: "active" } });
      const packB = await p.simulationPackVersion.create({ data: { ...common, key: "ap-b-" + suffix, version: 1, modelRef: refB, engineVersion: "fixture-b", activityVersionId: activityB.id, status: "draft" } });
      await p.simulationConfigVersion.update({ where: { id: configA.id }, data: { modelRef: refB } });
      await expect(assignments.assign(classroom.id, teacherReq, { contentType: "lab", contentId: labId, title: "Incompatible fixture" }))
        .rejects.toMatchObject({ response: { code: "SIM_PACK_CONFIG_INCOMPATIBLE" } });
      await p.simulationConfigVersion.update({ where: { id: configA.id }, data: { modelRef: refA } });
      const pinReq = { ...teacherReq, headers: { "idempotency-key": randomUUID() } };
      const pinBody = { contentType: "lab", contentId: labId, title: "Pinned fixture" };
      const result = await assignments.assign(classroom.id, pinReq, pinBody);
      const assignmentId = result.assignment.id;
      const pinned = await p.assignment.findUniqueOrThrow({ where: { id: assignmentId } });
      expect(pinned.labExecution).toMatchObject({ labId, modelRef: refA, configVersionId: configA.id, packVersionId: packA.id, activityVersionId: activityA.id, challengeParams: { [challengeId]: {} }, effectiveParams: { [challengeId]: null, [challengeId2]: null } });
      expect(pinned.labExecutionDigest).toBeTruthy();
      await expect(p.assignment.update({ where: { id: assignmentId }, data: { labExecutionDigest: "tampered" } })).rejects.toThrow();
      const labs = new LabsController(p as any, new StudentAccessService(p as any), new RequestRateLimiter());
      const adminController = new AdminLabsController(p as any);
      const adminReq = { user: { sub: admin.id, role: "ADMIN" } };
      await adminController.activateVersion(labId, "2", adminReq, { reason: "Fixture activation" });
      await adminController.activateSimPack(packB.id, adminReq, { reason: "Fixture activation" });
      await p.lab.update({ where: { id: labId }, data: { simulationModelRef: refB } });
      // Later challenge edits must not change the published assignment's fallback parameters.
      await p.challenge.update({ where: { id: challengeId2 }, data: { constraints: { params: { later: 99 } } } });
      expect((await assignments.assign(classroom.id, pinReq, pinBody)).assignment.id).toBe(assignmentId);

      const req = (studentId: string) => ({ user: { sub: studentId, role: "STUDENT" } });
      const studentA = req(students[0].id), studentB = req(students[1].id), outsider = req(students[2].id);
      const newChallengeId = "post-publication-" + suffix;
      await p.challenge.create({ data: { id: newChallengeId, labId, objective: "created later", constraints: {} } });
      await expect(labs.launchRun(labId, studentA, { challengeId: newChallengeId, assignmentId }))
        .rejects.toMatchObject({ response: { code: "ASSIGNMENT_CHALLENGE_NOT_PINNED" } });
      await expect(labs.launchRun(labId, outsider, { challengeId, assignmentId })).rejects.toMatchObject({ status: 404 });
      const runs = await Promise.all([
        labs.launchRun(labId, studentA, { challengeId, assignmentId }),
        labs.launchRun(labId, studentA, { challengeId, assignmentId }),
        labs.launchRun(labId, studentB, { challengeId, assignmentId }),
        labs.launchRun(labId, studentB, { challengeId: challengeId2, assignmentId }),
      ]);
      expect(runs.map((r) => r.versionBinding)).toEqual(["ASSIGNMENT_PINNED", "ASSIGNMENT_PINNED", "ASSIGNMENT_PINNED", "ASSIGNMENT_PINNED"]);
      const storedRuns = await p.labRun.findMany({ where: { id: { in: runs.map((r) => r.runId) } } });
      expect(storedRuns).toHaveLength(4);
      expect(storedRuns.find((r) => r.challengeId === challengeId2)?.execution).toMatchObject({ params: null, binding: "ASSIGNMENT_PINNED" });
      for (const run of storedRuns) expect(run.execution).toMatchObject({ modelRef: refA, configVersionId: configA.id, packVersionId: packA.id, activityVersionId: activityA.id, binding: "ASSIGNMENT_PINNED" });
      const body = (runId: string) => ({ contract: "lab-contract/1", runId, idempotencyKey: randomUUID(), stateSchemaVersion: 1, evidenceSchemaVersion: 1, labState: { input: 7 }, durationMs: 500 });
      const bodyA = body(runs[0].runId);
      const submitted = await labs.attempt(studentA, bodyA);
      expect((submitted.simulationResult as any).value).toBe(14);
      const secondStudentAttempt = await labs.attempt(studentB, body(runs[2].runId));
      expect((secondStudentAttempt.simulationResult as any).value).toBe(14);
      expect(secondStudentAttempt.packVersionId).toBe(packA.id);
      expect(await adminController.reproduce(submitted.id)).toMatchObject({ matches: true, resultMatches: true, assignmentVersionBinding: "ASSIGNMENT_PINNED" });
      // Existing overdue semantics remain unchanged: due date alone does not close the Lab.
      await p.assignment.update({ where: { id: assignmentId }, data: { dueDate: new Date(Date.now() - 1000) } });
      expect((await labs.launchRun(labId, studentB, { challengeId, assignmentId })).versionBinding).toBe("ASSIGNMENT_PINNED");
      await p.assignment.update({ where: { id: assignmentId }, data: { status: "ARCHIVED" } });
      await expect(labs.launchRun(labId, studentA, { challengeId, assignmentId })).rejects.toMatchObject({ status: 404 });
      await expect(labs.attempt(studentB, body(runs[2].runId))).rejects.toMatchObject({ status: 404 });
      await p.assignment.update({ where: { id: assignmentId }, data: { status: "ACTIVE", dueDate: null } });

      const legacyRun = await labs.launchRun(labId, studentA, { challengeId, assignmentId: legacyId });
      expect(legacyRun.versionBinding).toBe("LEGACY_UNPINNED_LAUNCH");
      expect((await p.labRun.findUniqueOrThrow({ where: { id: legacyRun.runId } })).execution).toMatchObject({ modelRef: refB, packVersionId: packB.id });
      const legacyRunAttempt = await labs.attempt(studentA, body(legacyRun.runId));
      expect((legacyRunAttempt.simulationResult as any).value).toBe(21);
      expect(await adminController.reproduce(legacyRunAttempt.id)).toMatchObject({ matches: true, assignmentVersionBinding: "LEGACY_UNPINNED_LAUNCH" });
      expect((await p.assignment.findUniqueOrThrow({ where: { id: legacyId } })).labExecution).toBeNull();

      await expect(p.assignment.update({ where: { id: legacyId }, data: { labExecutionDigest: "made-up-history" } })).rejects.toThrow();
      const legacyAttempt = await labs.attempt(studentA, { challengeId, labState: { input: 7 }, durationMs: 500, idempotencyKey: randomUUID() });
      expect(legacyAttempt.labRunId).toBeNull();
      expect((legacyAttempt.simulationResult as any).value).toBe(21);
      expect(await adminController.reproduce(legacyAttempt.id)).toMatchObject({ matches: true, assignmentVersionBinding: "LEGACY_UNPINNED" });
      // Old clients keep their route, but a new pinned assignment still evaluates A.
      await p.assignment.update({ where: { id: legacyId }, data: { status: "ARCHIVED" } });
      const pinnedLegacyAttempt = await labs.attempt(studentA, { challengeId, labState: { input: 7 }, durationMs: 500, idempotencyKey: randomUUID() });
      expect(pinnedLegacyAttempt).toMatchObject({ assignmentId, labRunId: null, packVersionId: packA.id, configVersionId: configA.id, simulationResult: { value: 14 } });
      expect(await adminController.reproduce(pinnedLegacyAttempt.id)).toMatchObject({ matches: true, resultMatches: true, reproductionBasis: "pinned_execution", assignmentVersionBinding: "ASSIGNMENT_PINNED" });

      await adminController.revokePackRuns(labId, packA.id, adminReq, { reason: "Fixture revocation" });
      expect(await adminController.reproduce(submitted.id)).toMatchObject({ matches: true, resultMatches: true, assignmentVersionBinding: "ASSIGNMENT_PINNED" });
      await expect(labs.attempt(studentA, { challengeId, labState: { input: 7 }, durationMs: 500, idempotencyKey: randomUUID() }))
        .rejects.toMatchObject({ response: { code: "RUN_REVOKED" } });
      await expect(labs.launchRun(labId, studentA, { challengeId, assignmentId })).rejects.toMatchObject({ response: { code: "RUN_REVOKED" } });
      await expect(labs.attempt(studentB, body(runs[2].runId))).rejects.toMatchObject({ response: { code: "RUN_REVOKED" } });
      expect((await labs.attempt(studentA, bodyA)).id).toBe(submitted.id);
      console.log("persisted assignment pin:", JSON.stringify({ assignmentId, packA: packA.id, configA: configA.id, activityA: activityA.id, packB: packB.id, runIds: runs.map((r) => r.runId), legacyId }));
    } finally {
      delete MODEL_REGISTRY[refA];
      delete MODEL_REGISTRY[refB];
    }
  }, 30000);
});