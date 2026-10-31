import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { afterAll, describe, expect, it } from "vitest";
import { RequestRateLimiter } from "../../../common/request-rate-limiter";
import { StudentAccessService } from "../../progress/application/student-access.service";
import { FL10_ACTIVITY_KEY, FL10_RUBRIC } from "../application/lab-run";
import { AdminLabsController } from "./admin-labs.controller";
import { LabsController } from "./labs.controller";

const testUrl = process.env.NEXALAB_FL10_TEST_URL;
if (testUrl) {
  const url = new URL(testUrl);
  if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) || url.pathname !== "/fl10_utf8_isolated" ||
      testUrl !== process.env.NEXALAB_ISOLATED_DATABASE_URL)
    throw new Error("FL-10 integration only accepts the isolated local fl10_utf8_isolated database");
}
const db = testUrl ? new PrismaClient({ datasourceUrl: testUrl }) : null;
afterAll(async () => { await db?.$disconnect(); });

describe.skipIf(!db)("isolated FL-10 K2 LabRun", () => {
  it("pins server mass parameters, records events, submits and reproduces without client masses", async () => {
    const p = db!;
    const suffix = randomUUID().slice(0, 8);
    const labId = "mass-conservation", challengeId = `fl10-${suffix}`;
    const modelRef = "mass-conservation@1.0.0";
    const params = { fixtureId: "barium-precipitation-reference-v1", cup1Milligrams: 100000,
      cup2Milligrams: 100000, solvent1Milligrams: 100000, solvent2Milligrams: 100000 };
    const teacher = await p.user.create({ data: { email: `fl10-teacher-${suffix}@example.test`, fullName: "Fixture teacher", passwordHash: "fixture", role: "TEACHER" } });
    const admin = await p.user.create({ data: { email: `fl10-admin-${suffix}@example.test`, fullName: "Fixture admin", passwordHash: "fixture", role: "ADMIN" } });
    const student = await p.user.create({ data: { username: `fl10-student-${suffix}`, fullName: "Fixture student", passwordHash: "fixture", role: "STUDENT" } });
    const outsider = await p.user.create({ data: { username: `fl10-outsider-${suffix}`, fullName: "Fixture outsider", passwordHash: "fixture", role: "STUDENT" } });
    await p.subject.upsert({ where: { id: "fl10-isolated-subject" }, update: {}, create: { id: "fl10-isolated-subject", name: "FL10 isolated fixture" } });
    await p.lab.upsert({ where: { id: labId }, update: {}, create: { id: labId, subjectId: "fl10-isolated-subject",
      title: "FL10 isolated fixture", topic: "fixture", learningObjective: "fixture", status: "published",
      scope: "CLASS_PRIVATE", releaseCleared: false, synthetic: true, simulationModelRef: modelRef } });
    await p.challenge.create({ data: { id: challengeId, labId, objective: "fixture", constraints: {} } });
    const classroom = await p.classroom.create({ data: { teacherId: teacher.id, name: "FL10 fixture class" } });
    await p.enrollment.create({ data: { classId: classroom.id, studentId: student.id, status: "approved", approved: true } });
    const assignment = await p.assignment.create({ data: { classId: classroom.id, contentId: labId, contentType: "lab",
      title: "FL10 private fixture", targets: { create: { studentId: student.id } } } });
    const activity = await p.practicalActivityVersion.findUnique({ where: { key_version: { key: FL10_ACTIVITY_KEY, version: 1 } } })
      ?? await p.practicalActivityVersion.create({ data: { key: FL10_ACTIVITY_KEY, version: 1,
        digest: "fl10-isolated-fixture", spec: { fixtureOnly: true }, reviews: { fixtureOnly: true }, createdById: admin.id } });
    const nextConfig = (await p.simulationConfigVersion.findFirst({ where: { labId }, orderBy: { version: "desc" } }))?.version ?? 0;
    await p.simulationConfigVersion.updateMany({ where: { labId, status: "active" }, data: { status: "draft" } });
    const config = await p.simulationConfigVersion.create({ data: { labId, version: nextConfig + 1, modelRef,
      challengeParams: { [challengeId]: params }, goldenCases: [], status: "active", reason: "isolated fixture", createdById: admin.id } });
    const nextPack = (await p.simulationPackVersion.findFirst({ where: { key: "fl10-isolated-pack" }, orderBy: { version: "desc" } }))?.version ?? 0;
    await p.simulationPackVersion.updateMany({ where: { labId, status: "active" }, data: { status: "draft" } });
    const pack = await p.simulationPackVersion.create({ data: { key: "fl10-isolated-pack", version: nextPack + 1,
      labId, modelRef, engineVersion: "1.0.0", activityVersionId: activity.id,
      template: { ranges: {}, initialState: null }, semanticMap: {}, bindings: [], challengeTemplates: [],
      reviews: { fixtureOnly: true }, status: "active", reason: "isolated fixture", createdById: admin.id } });
    const labs = new LabsController(p as any, new StudentAccessService(p as any), new RequestRateLimiter());
    const adminLabs = new AdminLabsController(p as any);
    const req = { user: { sub: student.id, role: "STUDENT" } };
    const launch = await labs.launchRun(labId, req, { challengeId, assignmentId: assignment.id });
    expect(launch).toMatchObject({ modelRef, rendererKey: "mass-conservation", rubricVersion: FL10_RUBRIC,
      initialState: null, constraints: {} });
    const post = (key: string, event: unknown) => labs.recordFl10Event(req, launch.runId, { idempotencyKey: key, event });
    await expect(post(randomUUID(), { type: "READ_BEFORE" })).rejects.toMatchObject({ response: { code: "INVALID_ORDER" } });
    await expect(labs.fl10Events({ user: { sub: outsider.id } }, launch.runId)).rejects.toMatchObject({ status: 404 });
    const prediction = { type: "PREDICTED", prediction: "predict.decrease", reason: "Tôi nghĩ giảm" };
    const firstKey = randomUUID();
    expect((await post(firstKey, prediction)).readings.afterScaleMilligrams).toBeNull();
    expect((await post(firstKey, prediction)).events).toHaveLength(1);
    await expect(post(firstKey, { ...prediction, prediction: "predict.same" })).rejects.toMatchObject({ response: { code: "IDEMPOTENCY_KEY_REUSED" } });
    expect((await post(randomUUID(), { type: "READ_BEFORE" })).readings).toEqual({ beforeScaleMilligrams: 435000, afterScaleMilligrams: null });
    await post(randomUUID(), { type: "MIXED" });
    expect((await post(randomUUID(), { type: "READ_AFTER" })).readings.afterScaleMilligrams).toBe(435000);
    const final = { comparison: "compare.same", explanationAttempts: ["explain.solid_not_weighed", "explain.rearrange"],
      calculation: "35-and-35", applicationV1: "decrease", applicationV2: "same" };
    const body = { contract: "lab-contract/1", runId: launch.runId, idempotencyKey: randomUUID(),
      stateSchemaVersion: 1, evidenceSchemaVersion: 1, labState: final, durationMs: 100 };
    const saved = await labs.attempt(req, body);
    expect(saved).toMatchObject({ verdict: "passed", configVersionId: config.id, packVersionId: pack.id,
      simulationResult: { scientificObservation: { beforeScaleMilligrams: 435000, afterScaleMilligrams: 435000 },
        assessment: { explanationAttempts: 2, passed: true } } });
    expect((await labs.attempt(req, body)).id).toBe(saved.id);
    expect(await adminLabs.reproduce(saved.id)).toMatchObject({ matches: true, resultMatches: true });
    await expect(p.labRunEvent.update({ where: { runId_sequence: { runId: launch.runId, sequence: 1 } },
      data: { event: { type: "PREDICTED", prediction: "predict.same" } } })).rejects.toThrow();
  }, 30000);
});
