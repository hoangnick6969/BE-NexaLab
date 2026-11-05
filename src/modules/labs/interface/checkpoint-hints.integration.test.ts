import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { afterAll, describe, expect, it } from "vitest";
import { RequestRateLimiter } from "../../../common/request-rate-limiter";
import { StudentAccessService } from "../../progress/application/student-access.service";
import { FOOD_WEB_ACTIVITY_KEY, FOOD_WEB_RUBRIC } from "../application/checkpoint-activities";
import { MODEL_REGISTRY } from "../application/sim-packs";
import { LabsController } from "./labs.controller";

// SAI-01A checkpoint hints on the FL-21 food-web activity: synthetic records in the isolated database only.
const testUrl = process.env.NEXALAB_PINNING_TEST_URL;
if (process.env.CI && !testUrl) throw new Error("CI requires NEXALAB_PINNING_TEST_URL for checkpoint hint integration");
if (testUrl) {
  const url = new URL(testUrl);
  if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) || url.pathname !== "/nexalab_pinning_test")
    throw new Error("checkpoint hint integration only accepts the isolated local nexalab_pinning_test database");
}
const db = testUrl ? new PrismaClient({ datasourceUrl: testUrl }) : null;
afterAll(async () => { await db?.$disconnect(); });

const W = { webId: "W1" } as const;

describe.skipIf(!db)("isolated checkpoint hints (SAI-01A, FL-21)", () => {
  it("targets the unmet checkpoint, escalates only on a changed answer and never touches the verdict", async () => {
    const p = db!;
    const suffix = randomUUID().slice(0, 8);
    const labId = `food-web-hint-${suffix}`, challengeId = `challenge-${suffix}`;
    const modelRef = "food-web@1.0.0";
    const original = MODEL_REGISTRY[modelRef];
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
      const packA = await p.simulationPackVersion.create({ data: { ...packData, key: `fwh-a-${suffix}`, version: 1, status: "active" } });
      const packB = await p.simulationPackVersion.create({ data: { ...packData, key: `fwh-b-${suffix}`, version: 1, status: "draft" } });
      const labs = new LabsController(p as any, new StudentAccessService(p as any), new RequestRateLimiter());
      const session = await p.session.create({ data: { userId: student.id, tokenHash: `fixture-${suffix}`, kind: "refresh", expiresAt: new Date(Date.now() + 3600_000) } });
      const req = { user: { sub: student.id, sid: session.id, role: "STUDENT" } };
      const launch = await labs.launchRun(labId, req, { challengeId, assignmentId: assignment.id });
      const checkpoints = (hunt: string) => [
        { id: "ROLES", state: { setup: "roles", ...W }, prediction: { co: "PRODUCER", ech: "CONSUMER", "nam-vi-khuan": "DECOMPOSER" } },
        { id: "CHAIN", state: { setup: "chain", ...W, nodes: ["co", "chau-chau", "ech", "ran"] }, prediction: "CHAIN" },
        { id: "ENERGY", state: { setup: "energy", ...W, chain: ["co", "chau-chau", "ech", "ran"] }, prediction: { value: "10" } },
        { id: "HUNT", state: { setup: "remove", ...W, speciesId: "ran" }, prediction: hunt },
        { id: "DEFOREST", state: { setup: "remove", ...W, speciesId: "cay-xanh" }, prediction: "DECREASE" },
        { id: "CAUSES", state: { setup: "causes", ...W }, prediction: ["khai-thac", "o-nhiem", "pha-rung", "san-bat"] },
      ];
      const submit = (hunt: string, explanation = "B") => labs.attempt(req, {
        contract: "lab-contract/1", runId: launch.runId, idempotencyKey: randomUUID(), stateSchemaVersion: 1, evidenceSchemaVersion: 1,
        checkpoints: checkpoints(hunt), explanation, durationMs: 100,
      });

      const w1 = await submit("DECREASE");
      expect(w1.verdict).toBe("needs_practice");
      const before = await p.attempt.findUniqueOrThrow({ where: { id: w1.id } });
      const h1: any = await labs.hint(w1.id, req);
      expect(h1).toMatchObject({ level: 1, criterion: "prediction:HUNT", checkpointId: "HUNT", label: "Khi mất rắn", escalated: false, repeatReason: null, provider: "rules", ruleVersion: "checkpoint-hints@3" });
      expect(h1.contextSnapshot).toBeUndefined();
      expect(JSON.stringify(h1)).not.toContain("FW_");
      const stored = await p.hintLog.findUniqueOrThrow({ where: { id: h1.id } });
      expect(Object.keys(stored.contextSnapshot as object).sort()).toEqual(
        ["answerDigest", "checkpointId", "criterion", "escalated", "kind", "label", "level", "misconception", "misconceptionRules", "provider", "repeatReason", "rubricRef", "ruleVersion", "variant"]);
      expect(stored.contextSnapshot).toMatchObject({ kind: "checkpoint-hint", misconception: "FW_ALL_DECREASE", rubricRef: FOOD_WEB_RUBRIC });
      expect(JSON.stringify(stored.contextSnapshot)).not.toContain(student.id);

      // Idempotent per attempt; other students cannot ask.
      expect((await labs.hint(w1.id, req) as any).id).toBe(h1.id);
      expect(await p.hintLog.count({ where: { attemptId: w1.id } })).toBe(1);
      await expect(labs.hint(w1.id, { user: { sub: outsider.id, sid: session.id, role: "STUDENT" } })).rejects.toMatchObject({ status: 404 });

      // FR-22: the attempt row is byte-identical after the hint.
      expect(await p.attempt.findUniqueOrThrow({ where: { id: w1.id } })).toEqual(before);

      // Same wrong answer: same level, other wording.
      const w2 = await submit("DECREASE");
      expect(await labs.hint(w2.id, req)).toMatchObject({ level: 1, escalated: false, repeatReason: "SAME_ANSWER" });

      // Only the latest attempt can ask.
      const w3 = await submit("NO_DIRECT_EFFECT");
      await submit("NO_DIRECT_EFFECT");
      await expect(labs.hint(w3.id, req)).rejects.toMatchObject({ response: { code: "HINT_NOT_LATEST_ATTEMPT" } });

      // A changed (still wrong) answer escalates.
      const w5 = await submit("NO_DIRECT_EFFECT");
      expect(await labs.hint(w5.id, req)).toMatchObject({ level: 2, escalated: true, criterion: "prediction:HUNT" });

      // HUNT fixed: the next hint is about the explanation, from level 1.
      const w6 = await submit("INCREASE");
      expect(await labs.hint(w6.id, req)).toMatchObject({ level: 1, criterion: "explanation", checkpointId: null });

      // Passed: no hint.
      const passed = await submit("INCREASE", "A");
      expect(passed.verdict).toBe("passed");
      await expect(labs.hint(passed.id, req)).rejects.toMatchObject({ response: { code: "HINT_NOT_NEEDED" } });
      const progress = await p.progress.findFirst({ where: { studentId: student.id, contentId: labId } });
      expect(progress?.lastHintLevel).toBe(2);

      // ---- In-run hints (moments A and B) on a fresh run ----
      const run2 = await labs.launchRun(labId, req, { challengeId, assignmentId: assignment.id });
      const ask = (body: Record<string, unknown>, who = req) => labs.runHint(run2.runId, who, body);
      const hunt = { setup: "remove", ...W, speciesId: "ran" };
      const a1: any = await ask({ criterion: "prediction:DEFOREST", moment: "BEFORE_PREDICTION" });
      const a2: any = await ask({ criterion: "prediction:DEFOREST", moment: "BEFORE_PREDICTION", prediction: "INCREASE" });
      const a3: any = await ask({ criterion: "prediction:DEFOREST", moment: "BEFORE_PREDICTION" });
      expect([a1, a2, a3].map((hint) => [hint.level, hint.moment, hint.repeatReason])).toEqual([
        [1, "BEFORE_PREDICTION", null], [2, "BEFORE_PREDICTION", null], [2, "BEFORE_PREDICTION", "TOP_LEVEL"]]);
      expect(await p.hintLog.findUniqueOrThrow({ where: { id: a1.id } })).toMatchObject({ attemptId: null, labRunId: run2.runId });
      // A never reads the draft: a wrong draft gets the same generic wording as no draft.
      expect(a2.content).toBe((await p.hintLog.findUniqueOrThrow({ where: { id: a2.id } })).content);
      expect(JSON.stringify((await p.hintLog.findUniqueOrThrow({ where: { id: a2.id } })).contextSnapshot)).not.toContain("INCREASE");

      // The check endpoint tells the UI whether to offer "Vì sao…", without writing anything.
      const rowsBefore = await p.hintLog.count({ where: { labRunId: run2.runId } });
      expect(await labs.runHintCheck(run2.runId, req, { criterion: "prediction:HUNT", state: hunt, prediction: "INCREASE" })).toEqual({ criterion: "prediction:HUNT", mismatch: false });
      expect(await labs.runHintCheck(run2.runId, req, { criterion: "prediction:HUNT", state: hunt, prediction: "DECREASE" })).toEqual({ criterion: "prediction:HUNT", mismatch: true });
      expect(await p.hintLog.count({ where: { labRunId: run2.runId } })).toBe(rowsBefore);
      await expect(labs.runHintCheck(run2.runId, { user: { sub: outsider.id, sid: session.id, role: "STUDENT" } }, { criterion: "prediction:HUNT", state: hunt, prediction: "DECREASE" }))
        .rejects.toMatchObject({ status: 404 });

      // B: only after a mismatch, worded for the misconception.
      await expect(ask({ criterion: "prediction:HUNT", moment: "AFTER_OBSERVATION", state: hunt, prediction: "INCREASE" }))
        .rejects.toMatchObject({ response: { code: "HINT_NOT_NEEDED" } });
      const b1: any = await ask({ criterion: "prediction:HUNT", moment: "AFTER_OBSERVATION", state: hunt, prediction: "DECREASE" });
      expect(b1).toMatchObject({ level: 0, moment: "AFTER_OBSERVATION", criterion: "prediction:HUNT" });
      expect((await p.hintLog.findUniqueOrThrow({ where: { id: b1.id } })).contextSnapshot).toMatchObject({ kind: "checkpoint-run-hint", misconception: "FW_ALL_DECREASE" });
      await expect(ask({ criterion: "prediction:HUNT", moment: "AFTER_OBSERVATION", state: { ...hunt, speciesId: "dai-bang" }, prediction: "DECREASE" }))
        .rejects.toMatchObject({ response: { code: "INVALID_CHECKPOINT" } });
      await expect(ask({ criterion: "explanation", moment: "AFTER_OBSERVATION" })).rejects.toMatchObject({ response: { code: "INVALID_CHECKPOINT" } });
      await expect(ask({ criterion: "prediction:HUNT", moment: "BEFORE_PREDICTION" }, { user: { sub: outsider.id, sid: session.id, role: "STUDENT" } }))
        .rejects.toMatchObject({ status: 404 });
      await expect(labs.runHint(run2.runId, req, { criterion: "prediction:HUNT", moment: "BEFORE_PREDICTION", extra: 1 })).rejects.toBeTruthy();

      // After submitting, DEFOREST continues from the in-run level 2: the first after-submit hint is level 3.
      const deforestWrong = await labs.attempt(req, {
        contract: "lab-contract/1", runId: run2.runId, idempotencyKey: randomUUID(), stateSchemaVersion: 1, evidenceSchemaVersion: 1,
        checkpoints: checkpoints("INCREASE").map((c: any) => c.id === "DEFOREST" ? { ...c, prediction: "INCREASE" } : c), explanation: "A", durationMs: 100,
      });
      expect(await labs.hint(deforestWrong.id, req)).toMatchObject({ criterion: "prediction:DEFOREST", level: 3, escalated: true });
      // Lesson/progress projections still ignore in-run rows (no attempt).
      expect((await p.progress.findFirst({ where: { studentId: student.id, contentId: labId } }))?.lastHintLevel).toBe(3);
    } finally {
      MODEL_REGISTRY[modelRef] = original;
    }
  }, 60000);
});
