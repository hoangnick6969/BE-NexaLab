import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { afterAll, describe, expect, it } from "vitest";
import { RequestRateLimiter } from "../../../common/request-rate-limiter";
import { StudentAccessService } from "../../progress/application/student-access.service";
import { FOOD_WEB_ACTIVITY_KEY, FOOD_WEB_RUBRIC } from "../application/checkpoint-activities";
import { MODEL_REGISTRY } from "../application/sim-packs";
import { AdminLabsController } from "./admin-labs.controller";
import { LabsController } from "./labs.controller";

// FL-21 food-web: synthetic records in the isolated database only.
const testUrl = process.env.NEXALAB_PINNING_TEST_URL;
if (process.env.CI && !testUrl) throw new Error("CI requires NEXALAB_PINNING_TEST_URL for food-web integration");
if (testUrl) {
  const url = new URL(testUrl);
  if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) || url.pathname !== "/nexalab_pinning_test")
    throw new Error("food-web integration only accepts the isolated local nexalab_pinning_test database");
}
const db = testUrl ? new PrismaClient({ datasourceUrl: testUrl }) : null;
afterAll(async () => { await db?.$disconnect(); });

const W = { webId: "W1" } as const;

describe.skipIf(!db)("isolated food-web LabRun (FL-21)", () => {
  it("persists and replays the pinned food-web activity after a version change", async () => {
    const p = db!;
    const suffix = randomUUID().slice(0, 8);
    const labId = `food-web-fixture-${suffix}`, challengeId = `challenge-${suffix}`;
    const modelRef = "food-web@1.0.0";
    const original = MODEL_REGISTRY[modelRef];
    // The fixture has its own private Lab identity; the model implementation stays unchanged.
    MODEL_REGISTRY[modelRef] = { ...original, labId };
    try {
      const teacher = await p.user.create({ data: { email: `teacher-${suffix}@example.test`, fullName: "Fixture teacher", passwordHash: "fixture", role: "TEACHER" } });
      const admin = await p.user.create({ data: { email: `admin-${suffix}@example.test`, fullName: "Fixture admin", passwordHash: "fixture", role: "ADMIN" } });
      const student = await p.user.create({ data: { username: `student-${suffix}`, fullName: "Fixture student", passwordHash: "fixture", role: "STUDENT" } });
      const outsider = await p.user.create({ data: { username: `outsider-${suffix}`, fullName: "Fixture outsider", passwordHash: "fixture", role: "STUDENT" } });
      await p.subject.create({ data: { id: `subject-${suffix}`, name: "Isolated fixture" } });
      await p.lab.create({ data: { id: labId, subjectId: `subject-${suffix}`, title: "Private food-web fixture", topic: "fixture", learningObjective: "fixture", status: "published", scope: "CLASS_PRIVATE", releaseCleared: false, synthetic: true, simulationModelRef: modelRef } });
      await p.challenge.create({ data: { id: challengeId, labId, objective: "fixture", constraints: {} } });
      const classroom = await p.classroom.create({ data: { teacherId: teacher.id, name: "Fixture class" } });
      await p.enrollment.create({ data: { classId: classroom.id, studentId: student.id, status: "approved", approved: true } });
      const assignment = await p.assignment.create({ data: { classId: classroom.id, contentId: labId, contentType: "lab", title: "Private fixture", targets: { create: { studentId: student.id } } } });
      const activity = await p.$transaction(async (tx: any) => {
        await tx.$executeRawUnsafe("SELECT pg_advisory_xact_lock(hashtext($1))", "nexalab:test:activity:" + FOOD_WEB_ACTIVITY_KEY + "@1");
        return (await tx.practicalActivityVersion.findUnique({ where: { key_version: { key: FOOD_WEB_ACTIVITY_KEY, version: 1 } } })) ??
          tx.practicalActivityVersion.create({ data: {
            key: FOOD_WEB_ACTIVITY_KEY, version: 1, digest: `fixture-${suffix}`, createdById: admin.id,
            reviews: { testFixtureOnly: true, notice: "FL-21 isolated fixture. Not a curriculum or scientific approval." },
            spec: {
              key: FOOD_WEB_ACTIVITY_KEY, outcomeCodes: ["KHTN8-FL21-TEST-ONLY"],
              objective: "TEST FIXTURE ONLY: persist and replay the food-web execution tuple",
              materials: ["TEST FIXTURE ONLY: food web, energy pyramid, causes board"], setup: "Test database only.",
              procedure: ["TEST FIXTURE ONLY: roles, chain, energy, removals, causes"],
              variables: [{ name: "removed species", unit: "state", role: "independent" }, { name: "effect", unit: "state", role: "dependent" }],
              observations: ["TEST FIXTURE ONLY: direct effects of removing a species"],
              expectedResult: "TEST FIXTURE ONLY: losing a link affects its food and its eaters",
              explanation: "Synthetic data for a prototype mechanics test; not a curriculum or scientific approval.",
              safety: "Synthetic integration fixture only.", limitations: "Illustrative web; first-order effects only; no curriculum evidence.",
              modality: "deterministic-simulation", sources: [{ title: "Synthetic test fixture", license: "TEST_ONLY" }],
            },
          } });
      });
      const configData = { labId, modelRef, challengeParams: { [challengeId]: {} }, goldenCases: [], reason: "isolated fixture", createdById: admin.id };
      const configA = await p.simulationConfigVersion.create({ data: { ...configData, version: 1, status: "active" } });
      const configB = await p.simulationConfigVersion.create({ data: { ...configData, version: 2, status: "draft" } });
      const packData = { labId, modelRef, engineVersion: original.engineVersion, activityVersionId: activity.id, template: { ranges: {}, initialState: { setup: "roles", ...W } }, semanticMap: {}, bindings: [], challengeTemplates: [], reviews: {}, reason: "isolated fixture", createdById: admin.id };
      const packA = await p.simulationPackVersion.create({ data: { ...packData, key: `fw-a-${suffix}`, version: 1, status: "active" } });
      const packB = await p.simulationPackVersion.create({ data: { ...packData, key: `fw-b-${suffix}`, version: 1, status: "draft" } });
      const labs = new LabsController(p as any, new StudentAccessService(p as any), new RequestRateLimiter());
      const adminController = new AdminLabsController(p as any);
      const req = { user: { sub: student.id, role: "STUDENT" } };
      const launch = await labs.launchRun(labId, req, { challengeId, assignmentId: assignment.id });
      expect(launch).toMatchObject({ modelRef, rubricVersion: FOOD_WEB_RUBRIC, rendererKey: "food-web" });
      await p.$transaction([
        p.simulationConfigVersion.update({ where: { id: configA.id }, data: { status: "draft" } }),
        p.simulationConfigVersion.update({ where: { id: configB.id }, data: { status: "active" } }),
        p.simulationPackVersion.update({ where: { id: packA.id }, data: { status: "draft" } }),
        p.simulationPackVersion.update({ where: { id: packB.id }, data: { status: "active" } }),
      ]);
      const body = {
        contract: "lab-contract/1", runId: launch.runId, idempotencyKey: randomUUID(), stateSchemaVersion: 1, evidenceSchemaVersion: 1,
        checkpoints: [
          { id: "ROLES", state: { setup: "roles", ...W }, prediction: { co: "PRODUCER", ech: "CONSUMER", "nam-vi-khuan": "DECOMPOSER" } },
          { id: "CHAIN", state: { setup: "chain", ...W, nodes: ["co", "chau-chau", "ech", "ran"] }, prediction: "CHAIN" },
          { id: "ENERGY", state: { setup: "energy", ...W, chain: ["co", "chau-chau", "ech", "ran"] }, prediction: { value: "10" } },
          { id: "HUNT", state: { setup: "remove", ...W, speciesId: "ran" }, prediction: "INCREASE" },
          { id: "DEFOREST", state: { setup: "remove", ...W, speciesId: "cay-xanh" }, prediction: "DECREASE" },
          { id: "CAUSES", state: { setup: "causes", ...W }, prediction: ["khai-thac", "o-nhiem", "pha-rung", "san-bat"] },
        ], explanation: "A", durationMs: 100,
      };
      await expect(labs.attempt({ user: { sub: outsider.id, role: "STUDENT" } }, body)).rejects.toMatchObject({ status: 404 });
      const first = await labs.attempt(req, body);
      expect((await labs.attempt(req, { ...body, durationMs: 300 })).id).toBe(first.id);
      await expect(labs.attempt(req, { ...body, explanation: "B" })).rejects.toMatchObject({ response: { code: "IDEMPOTENCY_KEY_REUSED" } });
      const saved = await p.attempt.findUniqueOrThrow({ where: { id: first.id } });
      expect(saved).toMatchObject({ labRunId: launch.runId, packVersionId: packA.id, configVersionId: configA.id, verdict: "passed", simulationResult: { assessment: { score: 7, maximumScore: 7 }, _execution: { rubricRef: FOOD_WEB_RUBRIC } } });
      expect(await adminController.reproduce(saved.id)).toMatchObject({ matches: true, resultMatches: true, reproductionBasis: "pinned_execution" });
      const wrong = await labs.attempt(req, { ...body, idempotencyKey: randomUUID(), explanation: "B" });
      expect(wrong.verdict).toBe("needs_practice");
      const count = await p.attempt.count({ where: { labRunId: launch.runId } });
      await expect(labs.attempt(req, { ...body, idempotencyKey: randomUUID(), checkpoints: [...body.checkpoints.slice(0, 3), { ...body.checkpoints[3], state: { setup: "remove", ...W, speciesId: "dai-bang" } }, ...body.checkpoints.slice(4)] })).rejects.toMatchObject({ status: 400 });
      expect(await p.attempt.count({ where: { labRunId: launch.runId } })).toBe(count);
      console.log("Persisted food-web fixture:", JSON.stringify({ runId: launch.runId, attemptId: saved.id, packVersionId: saved.packVersionId, configVersionId: saved.configVersionId, verdict: saved.verdict }));
    } finally {
      MODEL_REGISTRY[modelRef] = original;
    }
  }, 30000);
});
