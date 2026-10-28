import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { afterAll, afterEach, describe, expect, it } from "vitest";
import { RequestRateLimiter } from "../../../common/request-rate-limiter";
import { StudentAccessService } from "../../progress/application/student-access.service";
import { MODEL_REGISTRY } from "../application/sim-packs";
import { evaluate } from "../application/simulation-versions";
import { AdminLabsController } from "./admin-labs.controller";
import { LabsController } from "./labs.controller";

// Only an explicitly provisioned throwaway database is eligible; no app .env fallback.
const testUrl = process.env.NEXALAB_PINNING_TEST_URL;
if (testUrl) {
  const url = new URL(testUrl);
  if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) || url.pathname !== "/nexalab_pinning_test") {
    throw new Error("NEXALAB_PINNING_TEST_URL must name the isolated local nexalab_pinning_test database");
  }
}
const db = testUrl ? new PrismaClient({ datasourceUrl: testUrl }) : null;
afterAll(async () => { await db?.$disconnect(); });
const fixtureModelRef = "circuit@fixture-2.0.0";
afterEach(() => { delete MODEL_REGISTRY[fixtureModelRef]; });

const circuitState = (closed = true) => ({
  nodes: [
    { id: "b", type: "battery", value: 9 },
    { id: "r", type: "resistor", value: 470 },
    { id: "l", type: "led" },
  ],
  edges: [
    { source: "b", target: "r" },
    { source: "r", target: "l" },
    ...(closed ? [{ source: "l", target: "b" }] : []),
  ],
});

describe.skipIf(!db)("isolated PostgreSQL pack and configuration pinning", () => {
  it("rejects an active configuration outside the pinned pack's approved range and reproduces older attempts", async () => {
    const prisma = db!;
    const suffix = randomUUID().replaceAll("-", "").slice(0, 12);
    const subjectId = `pinning-${suffix}`;
    const challengeId = `pinning-${suffix}`;
    const outcomeCode = `pinning-${suffix}`;
    const existingLab = await prisma.lab.findUnique({ where: { id: "circuit" } });
    if (existingLab && (existingLab.title !== "Synthetic fixture" || !existingLab.subjectId.startsWith("pinning-"))) {
      throw new Error("Refusing to modify a non-fixture circuit Lab in the integration database");
    }
    await prisma.subject.create({ data: { id: subjectId, name: "Synthetic pinning fixture" } });
    const adminUser = await prisma.user.create({ data: { email: `admin-${suffix}@example.test`, passwordHash: "fixture", fullName: "Synthetic admin", role: "ADMIN" } });
    const student = await prisma.user.create({ data: { username: `pinning-${suffix}`, passwordHash: "fixture", fullName: "Synthetic student", role: "STUDENT" } });
    await prisma.lab.upsert({
      where: { id: "circuit" },
      create: { id: "circuit", subjectId, title: "Synthetic fixture", topic: "fixture", learningObjective: "fixture", status: "published", scope: "SHARED_LIBRARY", releaseCleared: true, synthetic: false, topicCode: "fixture-topic", simulationModelRef: "circuit@1.0.0" },
      update: { status: "published", scope: "SHARED_LIBRARY", releaseCleared: true, synthetic: false, topicCode: "fixture-topic", simulationModelRef: "circuit@1.0.0" },
    });
    await prisma.challenge.create({ data: { id: challengeId, labId: "circuit", objective: "Synthetic fixture", constraints: {} } });
    await prisma.curriculumOutcome.create({ data: { code: outcomeCode, grade: 8, domain: "ENERGY", chapter: "fixture", statement: "Synthetic fixture", synthetic: true } });

    const adminReq = { user: { sub: adminUser.id, role: "ADMIN" } };
    const studentReq = { user: { sub: student.id, role: "STUDENT" } };
    const admin = new AdminLabsController(prisma as any);
    const labs = new LabsController(prisma as any, new StudentAccessService(prisma as any), new RequestRateLimiter());
    const configInput = (maxCurrentMa: number, expectedVerdict: string) => ({
      challengeParams: { [challengeId]: { maxCurrentMa, minLitLeds: 1 } },
      goldenCases: [{ challengeId, label: "Synthetic closed circuit", labState: circuitState(), expectedVerdict }],
      reason: "Synthetic integration fixture",
    });
    const configA = await admin.createVersion("circuit", adminReq, configInput(10, "partial"));
    const configB = await admin.createVersion("circuit", adminReq, configInput(20, "passed"));
    await admin.activateVersion("circuit", String(configA.version), adminReq, { reason: "Synthetic fixture activation" });

    const reviewer = (name: string) => ({ name, email: `${name}@example.test`, at: "2026-01-01T00:00:00.000Z" });
    const activity = await admin.createPractical(adminReq, {
      key: `pinning-${suffix}`, outcomeCodes: [outcomeCode], objective: "Synthetic test activity",
      materials: ["Synthetic parts"], setup: "Synthetic setup", procedure: ["Synthetic procedure"],
      variables: [{ name: "current", unit: "mA", role: "dependent" }], observations: ["Synthetic observation"],
      expectedResult: "Synthetic result", explanation: "Synthetic explanation", safety: "Synthetic safety",
      limitations: "Synthetic fixture only", modality: "deterministic-simulation",
      sources: [{ title: "Synthetic fixture", license: "test" }],
      reviews: { subject: reviewer("synthetic-subject"), safety: reviewer("synthetic-safety") },
    });
    const pack = await admin.createSimPack(adminReq, {
      key: `pinning-${suffix}`, labId: "circuit", modelRef: "circuit@1.0.0", activityVersionId: activity.id,
      template: {
        units: { maxCurrentMa: "mA", minLitLeds: "LED" },
        ranges: { maxCurrentMa: { min: 5, max: 10 }, minLitLeds: { min: 1, max: 3 } },
        initialState: circuitState(false), limitations: "Synthetic fixture only",
        goldenCases: [
          { label: "open", state: circuitState(false), expectedVerdict: "needs_practice", expectedOutputs: {} },
          { label: "closed", state: circuitState(), expectedVerdict: "passed", expectedOutputs: {} },
        ],
      },
      visualAssetVersionId: null, semanticMap: { battery: "battery", resistor: "resistor", led: "led" },
      bindings: [], challengeTemplates: [],
      reviews: { subject: reviewer("synthetic-subject"), model: reviewer("synthetic-model") },
      reason: "Synthetic integration fixture",
    });
    await admin.activateSimPack(pack.id, adminReq, { reason: "Synthetic fixture activation" });
    const first = await labs.attempt(studentReq, { challengeId, labState: circuitState(), durationMs: 1000, idempotencyKey: randomUUID() });
    expect(first.packVersionId).toBe(pack.id);
    expect(first.configVersionId).toBe(configA.id);
    expect(first.verdict).toBe("partial");
    expect((first.simulationResult as any)._execution).toEqual({
      modelRef: "circuit@1.0.0", packVersionId: pack.id, configVersionId: configA.id,
      params: { maxCurrentMa: 10, minLitLeds: 1 },
    });
    const { _execution: _newSnapshot, ...legacyOutput } = first.simulationResult as any;
    const legacy = await prisma.attempt.create({ data: {
      studentId: student.id, challengeId, labState: circuitState(),
      simulationResult: legacyOutput, verdict: first.verdict, durationMs: 1000,
      simulationModelVersion: "1.0.0", configVersionId: configA.id, packVersionId: null,
    } });
    const legacyWithoutVersions = await prisma.attempt.create({ data: {
      studentId: student.id, challengeId, labState: circuitState(),
      simulationResult: legacyOutput, verdict: first.verdict, durationMs: 1000,
      simulationModelVersion: "1.0.0", configVersionId: null, packVersionId: null,
    } });

    await admin.activateVersion("circuit", String(configB.version), adminReq, { reason: "Synthetic fixture activation" });
    await prisma.challenge.update({ where: { id: challengeId }, data: { constraints: { params: { maxCurrentMa: 20, minLitLeds: 1 } } } });
    const persistedFirst = await prisma.attempt.findUniqueOrThrow({ where: { id: first.id } });
    expect(persistedFirst.packVersionId).toBe(pack.id);
    const { _execution: _storedSnapshot, ...storedOutput } = persistedFirst.simulationResult as any;
    const calculated = evaluate("circuit", circuitState(), { maxCurrentMa: 10, minLitLeds: 1 }, "circuit@1.0.0").result;
    expect(storedOutput.current).toBeCloseTo(calculated.current, 12);
    expect(storedOutput.branches[0].current).toBeCloseTo(calculated.branches[0].current, 12);
    expect(await admin.reproduce(first.id)).toMatchObject({ matches: true, resultMatches: true, reproductionBasis: "pinned_execution" });
    expect(await admin.reproduce(legacy.id)).toMatchObject({ matches: true, resultMatches: true, reproductionBasis: "legacy_unverified" });
    expect(await admin.reproduce(legacyWithoutVersions.id)).toMatchObject({ matches: true, resultMatches: true, reproductionBasis: "legacy_unverified" });
    const countBefore = await prisma.attempt.count({ where: { studentId: student.id } });
    // Contract: a pack must never silently accept a configuration outside its reviewed bounds.
    await expect(labs.attempt(studentReq, { challengeId, labState: circuitState(), durationMs: 1000, idempotencyKey: randomUUID() }))
      .rejects.toMatchObject({ response: { code: "SIM_PACK_CONFIG_INCOMPATIBLE" } });
    expect(await prisma.attempt.count({ where: { studentId: student.id } })).toBe(countBefore);

    // A second registered model makes a later Lab-pointer drift observable without changing the real model.
    const originalModel = MODEL_REGISTRY["circuit@1.0.0"];
    MODEL_REGISTRY[fixtureModelRef] = {
      ...originalModel, engineVersion: "fixture-2.0.0",
      simulate: (state) => {
        const result = originalModel.simulate(state);
        return { ...result, version: "fixture-2.0.0", verdict: result.verdict === "passed" ? "partial" : result.verdict };
      },
    };
    await prisma.lab.update({ where: { id: "circuit" }, data: { simulationModelRef: fixtureModelRef } });
    const configV2 = await admin.createVersion("circuit", adminReq, configInput(10, "partial"));
    expect(configV2.modelRef).toBe(fixtureModelRef);
    await admin.activateVersion("circuit", String(configV2.version), adminReq, { reason: "Synthetic fixture activation" });
    await expect(labs.attempt(studentReq, { challengeId, labState: circuitState(), durationMs: 1000, idempotencyKey: randomUUID() }))
      .rejects.toMatchObject({ response: { code: "SIM_PACK_CONFIG_INCOMPATIBLE" } });
    expect(await prisma.attempt.count({ where: { studentId: student.id } })).toBe(countBefore);
    const nextPack = await admin.createSimPack(adminReq, {
      key: `pinning-next-${suffix}`, labId: "circuit", modelRef: fixtureModelRef, activityVersionId: activity.id,
      template: {
        units: { maxCurrentMa: "mA", minLitLeds: "LED" },
        ranges: { maxCurrentMa: { min: 5, max: 10 }, minLitLeds: { min: 1, max: 3 } },
        initialState: circuitState(false), limitations: "Synthetic fixture only",
        goldenCases: [
          { label: "open", state: circuitState(false), expectedVerdict: "needs_practice", expectedOutputs: {} },
          { label: "closed", state: circuitState(), expectedVerdict: "partial", expectedOutputs: {} },
        ],
      },
      visualAssetVersionId: null, semanticMap: { battery: "battery", resistor: "resistor", led: "led" },
      bindings: [], challengeTemplates: [],
      reviews: { subject: reviewer("synthetic-subject"), model: reviewer("synthetic-model") },
      reason: "Synthetic integration fixture",
    });
    await admin.activateSimPack(nextPack.id, adminReq, { reason: "Synthetic fixture activation" });
    await prisma.lab.update({ where: { id: "circuit" }, data: { simulationModelRef: "circuit@1.0.0" } });
    // Hold each activation lock on a separate connection, and observe PostgreSQL's
    // actual lock wait before allowing the attempt to proceed.
    for (const lockKey of ["nexalab:sim-version:circuit", "nexalab:sim-pack-lab:circuit"]) {
      let release!: () => void;
      let acquired!: () => void;
      const gate = new Promise<void>((resolve) => { release = resolve; });
      const ready = new Promise<void>((resolve) => { acquired = resolve; });
      const holder = prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`;
        acquired();
        await gate;
      }, { timeout: 10000 });
      await ready;
      const count = await prisma.attempt.count({ where: { studentId: student.id } });
      const pending = labs.attempt(studentReq, { challengeId, labState: circuitState(), durationMs: 1000, idempotencyKey: randomUUID() });
      try {
        let waiting = false;
        const deadline = Date.now() + 3000;
        while (Date.now() < deadline && !waiting) {
          const rows = await prisma.$queryRaw<Array<{ waiting: boolean }>>`
            SELECT EXISTS (
              SELECT 1 FROM pg_stat_activity
              WHERE datname = current_database() AND wait_event_type = 'Lock'
                AND lower(wait_event) = 'advisory' AND query LIKE '%pg_advisory_xact_lock%'
            ) AS waiting`;
          waiting = rows[0].waiting;
          if (!waiting) await new Promise((resolve) => setTimeout(resolve, 25));
        }
        expect(waiting).toBe(true);
        expect(await prisma.attempt.count({ where: { studentId: student.id } })).toBe(count);
      } finally {
        release();
        await holder;
      }
      const resumed = await pending;
      expect(resumed.packVersionId).toBe(nextPack.id);
      expect(resumed.configVersionId).toBe(configV2.id);
    }
    const pinned = await labs.attempt(studentReq, { challengeId, labState: circuitState(), durationMs: 1000, idempotencyKey: randomUUID() });
    expect(pinned.packVersionId).toBe(nextPack.id);
    expect((pinned.simulationResult as any).version).toBe("fixture-2.0.0");
    expect(pinned.verdict).toBe("partial");
    expect((pinned.simulationResult as any)._execution).toEqual({
      modelRef: fixtureModelRef, packVersionId: nextPack.id, configVersionId: configV2.id,
      params: { maxCurrentMa: 10, minLitLeds: 1 },
    });
    expect(await admin.reproduce(pinned.id)).toMatchObject({ matches: true, resultMatches: true, reproductionBasis: "pinned_execution" });
    expect(await admin.reproduce(first.id)).toMatchObject({ matches: true, resultMatches: true, reproductionBasis: "pinned_execution" });
  }, 30000);
});
