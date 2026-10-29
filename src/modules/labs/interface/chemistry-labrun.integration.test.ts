import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { afterAll, describe, expect, it } from "vitest";
import { AssignmentsService } from "../../classes/application/assignments.service";
import { RequestRateLimiter } from "../../../common/request-rate-limiter";
import { CHALLENGE_PARAMETERS } from "../../lessons/application/lesson-content";
import { StudentAccessService } from "../../progress/application/student-access.service";
import { MODEL_REGISTRY } from "../application/sim-packs";
import { AdminLabsController } from "./admin-labs.controller";
import { LabsController } from "./labs.controller";
import { CatalogController } from "../../curriculum/interface/catalog.controller";
import { LabReleaseService } from "../application/lab-release.service";

const testUrl = process.env.NEXALAB_PINNING_TEST_URL;
if (process.env.CI && !testUrl) throw new Error("CI requires NEXALAB_PINNING_TEST_URL for chemistry model integration");
if (testUrl) {
  const url = new URL(testUrl);
  if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) || url.pathname !== "/nexalab_pinning_test")
    throw new Error("Chemistry model integration only accepts isolated local nexalab_pinning_test");
}
const db = testUrl ? new PrismaClient({ datasourceUrl: testUrl }) : null;
afterAll(async () => { await db?.$disconnect(); });

describe.skipIf(!db)("isolated TECHNICAL_FIXTURE_ONLY second-model LabRun compatibility", () => {
  it("dispatches a private synthetic Chemistry fixture through pinned versions without making it curriculum or student content", async () => {
    const p = db!;
    const suffix = randomUUID().slice(0, 8);
    const labId = "p35-chemistry-" + suffix, challengeId = "challenge-" + suffix, modelRef = "chemistry@1.0.0";
    const originalModel = MODEL_REGISTRY[modelRef];
    const isolatedModel = { ...originalModel };
    MODEL_REGISTRY[modelRef] = { ...originalModel, labId };
    CHALLENGE_PARAMETERS[labId] = CHALLENGE_PARAMETERS.chemistry;
    try {
      const teacher = await p.user.create({ data: { email: `p35-teacher-${suffix}@example.test`, fullName: "P3.5 fixture teacher", passwordHash: "fixture", role: "TEACHER" } });
      const admin = await p.user.create({ data: { email: `p35-admin-${suffix}@example.test`, fullName: "P3.5 fixture admin", passwordHash: "fixture", role: "ADMIN" } });
      const student = await p.user.create({ data: { username: `p35-student-${suffix}`, fullName: "P3.5 fixture student", passwordHash: "fixture", role: "STUDENT" } });
      const subjectId = "p35-subject-" + suffix;
      await p.subject.create({ data: { id: subjectId, name: "Private P3.5 engineering fixture" } });
      await p.lab.create({ data: {
        id: labId, subjectId, title: "Private chemistry compatibility fixture", topic: "fixture",
        learningObjective: "Verify distinct chemistry state and outputs", status: "published", scope: "CLASS_PRIVATE",
        releaseCleared: false, synthetic: true, simulationModelRef: modelRef,
      } });
      // This row exists only in the isolated integration DB. It is excluded from
      // the student catalog and release lifecycle, and is not portfolio evidence.
      const studentCatalog = await new CatalogController(p as any).labs({ user: { role: "STUDENT" } });
      expect(studentCatalog.some((lab: any) => lab.id === labId)).toBe(false);
      const releaseService = new LabReleaseService(p as any);
      await expect(releaseService.createDraft(labId, { user: { sub: admin.id } }, { reason: "Fixture must never be released" }))
        .rejects.toMatchObject({ response: { code: "LAB_NOT_RELEASE_ELIGIBLE" } });
      expect(await p.labRelease.count({ where: { labId } })).toBe(0);
      await p.challenge.create({ data: { id: challengeId, labId, objective: "Identify sample types", constraints: {} } });
      const classroom = await p.classroom.create({ data: { teacherId: teacher.id, name: "P3.5 isolated class" } });
      await p.enrollment.create({ data: { classId: classroom.id, studentId: student.id, status: "approved", approved: true } });
      const activityA = await p.practicalActivityVersion.create({ data: {
        key: "p35-chem-a-" + suffix, version: 1, digest: "a-" + suffix, spec: { fixtureOnly: true }, reviews: {}, createdById: admin.id,
      } });
      const activityB = await p.practicalActivityVersion.create({ data: {
        key: "p35-chem-b-" + suffix, version: 1, digest: "b-" + suffix, spec: { fixtureOnly: true }, reviews: {}, createdById: admin.id,
      } });
      const params = { experiment: "ph" };
      const configA = await p.simulationConfigVersion.create({ data: {
        labId, version: 1, modelRef, challengeParams: { [challengeId]: params }, goldenCases: [], status: "active",
        reason: "Private P3.5 fixture", createdById: admin.id,
      } });
      const configB = await p.simulationConfigVersion.create({ data: {
        labId, version: 2, modelRef, challengeParams: { [challengeId]: params }, goldenCases: [], status: "draft",
        reason: "Private P3.5 successor fixture", createdById: admin.id,
      } });
      const common = {
        labId, modelRef, engineVersion: isolatedModel.engineVersion, template: { ranges: {}, initialState: { samples: {} } },
        semanticMap: {}, bindings: [], challengeTemplates: [], reviews: {}, reason: "Private P3.5 fixture", createdById: admin.id,
      };
      const packA = await p.simulationPackVersion.create({ data: {
        ...common, key: "p35-chem-a-" + suffix, version: 1, activityVersionId: activityA.id, status: "active",
      } });
      const packB = await p.simulationPackVersion.create({ data: {
        ...common, key: "p35-chem-b-" + suffix, version: 1, activityVersionId: activityB.id, status: "draft",
      } });

      const assignments = new AssignmentsService(p as any);
      await expect(assignments.assign(classroom.id, {
        user: { sub: teacher.id, role: "TEACHER" }, headers: { "idempotency-key": randomUUID() },
      }, { contentType: "lab", contentId: labId, labReleaseId: "fixture-release", labChallengeId: challengeId, title: "Private chemistry compatibility fixture" }))
        .rejects.toMatchObject({ response: { code: "CONTENT_NOT_PUBLISHED" } });
      // Keep this old assignment deliberately unpinned: it represents historical
      // compatibility and must not be upgraded into a reviewed Class Lab fixture.
      const assignment = await p.assignment.create({ data: {
        classId: classroom.id, contentId: labId, contentType: "lab", title: "Historical Chemistry fixture",
        targets: { create: [{ studentId: student.id }] },
      } });
      expect(assignment.labExecution).toBeNull();

      const labs = new LabsController(p as any, new StudentAccessService(p as any), new RequestRateLimiter());
      const adminLabs = new AdminLabsController(p as any);
      const studentReq = { user: { sub: student.id, role: "STUDENT" } };
      const adminReq = { user: { sub: admin.id, role: "ADMIN" } };
      const launch = await labs.launchRun(labId, studentReq, { challengeId, assignmentId: assignment.id });
      expect(launch).toMatchObject({ modelRef, rendererKey: null, versionBinding: "LEGACY_UNPINNED_LAUNCH" });

      await adminLabs.activateVersion(labId, "2", adminReq, { reason: "P3.5 isolated compatibility test" });
      await adminLabs.activateSimPack(packB.id, adminReq, { reason: "P3.5 isolated compatibility test" });
      const invalidKey = randomUUID();
      await expect(labs.attempt(studentReq, {
        contract: "lab-contract/1", runId: launch.runId, idempotencyKey: invalidKey,
        stateSchemaVersion: 1, evidenceSchemaVersion: 1, labState: { samples: ["not", "a", "record"] }, durationMs: 100,
      })).rejects.toThrow();
      expect(await p.attempt.count({ where: { studentId: student.id, idempotencyKey: invalidKey } })).toBe(0);

      const evidence = { samples: { jar1: "acid", jar2: "neutral", jar3: "base" } };
      const attempt = await labs.attempt(studentReq, {
        contract: "lab-contract/1", runId: launch.runId, idempotencyKey: randomUUID(),
        stateSchemaVersion: 1, evidenceSchemaVersion: 1, labState: evidence, durationMs: 3000,
      });
      const saved = await p.attempt.findUniqueOrThrow({ where: { id: attempt.id } });
      expect(saved).toMatchObject({
        labRunId: launch.runId, configVersionId: configA.id, packVersionId: packA.id,
        simulationModelVersion: isolatedModel.engineVersion, verdict: "passed",
        simulationResult: {
          experiment: "ph", verdict: "passed", samples: [
            { id: "jar1", type: "acid", correct: true },
            { id: "jar2", type: "neutral", correct: true },
            { id: "jar3", type: "base", correct: true },
          ],
          _execution: { modelRef, packVersionId: packA.id, configVersionId: configA.id },
        },
      });
      expect(await adminLabs.reproduce(saved.id)).toMatchObject({ matches: true, resultMatches: true, reproductionBasis: "pinned_execution" });
      console.log("Persisted P3.5 chemistry model fixture:", JSON.stringify({ runId: launch.runId, attemptId: saved.id, packA: packA.id, packB: packB.id, configA: configA.id, configB: configB.id, result: saved.simulationResult }));
    } finally {
      // The database fixture uses the public registry entry only for this isolated test process.
      MODEL_REGISTRY[modelRef] = originalModel;
      delete CHALLENGE_PARAMETERS[labId];
    }
  }, 30000);
});
