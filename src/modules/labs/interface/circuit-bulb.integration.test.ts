import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { afterAll, describe, expect, it } from "vitest";
import { RequestRateLimiter } from "../../../common/request-rate-limiter";
import { StudentAccessService } from "../../progress/application/student-access.service";
import { CIRCUIT_BULB_ACTIVITY_KEY, CIRCUIT_BULB_RUBRIC } from "../application/lab-run";
import { MODEL_REGISTRY } from "../application/sim-packs";
import { AdminLabsController } from "./admin-labs.controller";
import { LabsController } from "./labs.controller";

const testUrl = process.env.NEXALAB_PINNING_TEST_URL;
if (process.env.CI && !testUrl) throw new Error("CI requires NEXALAB_PINNING_TEST_URL for Circuit bulb integration");
if (testUrl) {
  const url = new URL(testUrl);
  if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) || url.pathname !== "/nexalab_pinning_test")
    throw new Error("Circuit integration only accepts the isolated local nexalab_pinning_test database");
}
const db = testUrl ? new PrismaClient({ datasourceUrl: testUrl }) : null;
afterAll(async () => { await db?.$disconnect(); });

const state = (closed: boolean) => ({
  nodes: [{ id: "battery", type: "battery" }, { id: "bulb", type: "bulb" }, { id: "switch", type: "switch", closed }],
  edges: [{ source: "battery", target: "bulb" }, { source: "bulb", target: "switch" }, { source: "switch", target: "battery" }],
});

describe.skipIf(!db)("isolated Circuit bulb LabRun", () => {
  it("persists and replays the pinned activity after a version change", async () => {
    const p = db!;
    const suffix = randomUUID().slice(0, 8);
    const labId = `bulb-fixture-${suffix}`, challengeId = `challenge-${suffix}`;
    const modelRef = "circuit-bulb@1.0.0";
    const original = MODEL_REGISTRY[modelRef];
    // The fixture has its own private Lab identity; the model implementation stays unchanged.
    MODEL_REGISTRY[modelRef] = { ...original, labId };
    try {
      const teacher = await p.user.create({ data: { email: `teacher-${suffix}@example.test`, fullName: "Fixture teacher", passwordHash: "fixture", role: "TEACHER" } });
      const admin = await p.user.create({ data: { email: `admin-${suffix}@example.test`, fullName: "Fixture admin", passwordHash: "fixture", role: "ADMIN" } });
      const student = await p.user.create({ data: { username: `student-${suffix}`, fullName: "Fixture student", passwordHash: "fixture", role: "STUDENT" } });
      const outsider = await p.user.create({ data: { username: `outsider-${suffix}`, fullName: "Fixture outsider", passwordHash: "fixture", role: "STUDENT" } });
      await p.subject.create({ data: { id: `subject-${suffix}`, name: "Isolated fixture" } });
      await p.lab.create({ data: { id: labId, subjectId: `subject-${suffix}`, title: "Private bulb fixture", topic: "fixture", learningObjective: "fixture", status: "published", scope: "CLASS_PRIVATE", releaseCleared: false, synthetic: true, simulationModelRef: modelRef } });
      await p.challenge.create({ data: { id: challengeId, labId, objective: "fixture", constraints: {} } });
      const classroom = await p.classroom.create({ data: { teacherId: teacher.id, name: "Fixture class" } });
      await p.enrollment.create({ data: { classId: classroom.id, studentId: student.id, status: "approved", approved: true } });
      const assignment = await p.assignment.create({ data: { classId: classroom.id, contentId: labId, contentType: "lab", title: "Private fixture", targets: { create: { studentId: student.id } } } });
      const activity = await p.practicalActivityVersion.findUnique({ where: { key_version: { key: CIRCUIT_BULB_ACTIVITY_KEY, version: 1 } } }) ??
        await p.practicalActivityVersion.create({ data: { key: CIRCUIT_BULB_ACTIVITY_KEY, version: 1, digest: `fixture-${suffix}`, spec: {}, reviews: {}, createdById: admin.id } });
      const configData = { labId, modelRef, challengeParams: { [challengeId]: {} }, goldenCases: [], reason: "isolated fixture", createdById: admin.id };
      const configA = await p.simulationConfigVersion.create({ data: { ...configData, version: 1, status: "active" } });
      const configB = await p.simulationConfigVersion.create({ data: { ...configData, version: 2, status: "draft" } });
      const packData = { labId, modelRef, engineVersion: original.engineVersion, activityVersionId: activity.id, template: { ranges: {}, initialState: state(true) }, semanticMap: {}, bindings: [], challengeTemplates: [], reviews: {}, reason: "isolated fixture", createdById: admin.id };
      const packA = await p.simulationPackVersion.create({ data: { ...packData, key: `bulb-a-${suffix}`, version: 1, status: "active" } });
      const packB = await p.simulationPackVersion.create({ data: { ...packData, key: `bulb-b-${suffix}`, version: 1, status: "draft" } });
      const labs = new LabsController(p as any, new StudentAccessService(p as any), new RequestRateLimiter());
      const adminController = new AdminLabsController(p as any);
      const req = { user: { sub: student.id, role: "STUDENT" } };
      const launch = await labs.launchRun(labId, req, { challengeId, assignmentId: assignment.id });
      expect(launch).toMatchObject({ modelRef, rubricVersion: CIRCUIT_BULB_RUBRIC, rendererKey: "circuit-bulb" });
      await p.$transaction([
        p.simulationConfigVersion.update({ where: { id: configA.id }, data: { status: "draft" } }),
        p.simulationConfigVersion.update({ where: { id: configB.id }, data: { status: "active" } }),
        p.simulationPackVersion.update({ where: { id: packA.id }, data: { status: "draft" } }),
        p.simulationPackVersion.update({ where: { id: packB.id }, data: { status: "active" } }),
      ]);
      const body = {
        contract: "lab-contract/1", runId: launch.runId, idempotencyKey: randomUUID(), stateSchemaVersion: 1, evidenceSchemaVersion: 1,
        checkpoints: [{ id: "CLOSED", state: state(true), prediction: "ON" }, { id: "OPEN", state: state(false), prediction: "OFF" }], explanation: "A", durationMs: 100,
      };
      await expect(labs.attempt({ user: { sub: outsider.id, role: "STUDENT" } }, body)).rejects.toMatchObject({ status: 404 });
      const first = await labs.attempt(req, body);
      expect((await labs.attempt(req, { ...body, durationMs: 300 })).id).toBe(first.id);
      await expect(labs.attempt(req, { ...body, explanation: "B" })).rejects.toMatchObject({ response: { code: "IDEMPOTENCY_KEY_REUSED" } });
      const saved = await p.attempt.findUniqueOrThrow({ where: { id: first.id } });
      expect(saved).toMatchObject({ labRunId: launch.runId, packVersionId: packA.id, configVersionId: configA.id, verdict: "passed", simulationResult: { assessment: { score: 3 }, _execution: { rubricRef: CIRCUIT_BULB_RUBRIC } } });
      expect(await adminController.reproduce(saved.id)).toMatchObject({ matches: true, resultMatches: true, reproductionBasis: "pinned_execution" });
      const wrong = await labs.attempt(req, { ...body, idempotencyKey: randomUUID(), explanation: "B" });
      expect(wrong.verdict).toBe("needs_practice");
      const count = await p.attempt.count({ where: { labRunId: launch.runId } });
      await expect(labs.attempt(req, { ...body, idempotencyKey: randomUUID(), checkpoints: [{ ...body.checkpoints[0], state: state(false) }, body.checkpoints[1]] })).rejects.toMatchObject({ status: 400 });
      expect(await p.attempt.count({ where: { labRunId: launch.runId } })).toBe(count);
      console.log("Persisted private bulb fixture:", JSON.stringify({ runId: launch.runId, attemptId: saved.id, packVersionId: saved.packVersionId, configVersionId: saved.configVersionId, verdict: saved.verdict }));
    } finally {
      MODEL_REGISTRY[modelRef] = original;
    }
  }, 30000);
});
