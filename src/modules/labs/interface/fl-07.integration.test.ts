import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { afterAll, describe, expect, it } from "vitest";
import { LabsController } from "./labs.controller";
import { AdminLabsController } from "./admin-labs.controller";
import { RequestRateLimiter } from "../../../common/request-rate-limiter";
import { StudentAccessService } from "../../progress/application/student-access.service";
import { LabReleaseService } from "../application/lab-release.service";
import { assertFl07IsolatedTarget, seedFl07Fixture } from "./fl-07.fixture";

const target = process.env.NEXALAB_FL07_TEST_URL;
if (target) assertFl07IsolatedTarget();
if (process.env.CI && !target) throw new Error("CI requires NEXALAB_FL07_TEST_URL for FL-07 integration");
const db = target ? new PrismaClient({ datasourceUrl: target }) : null;
afterAll(async () => { await db?.$disconnect(); });

describe.skipIf(!db)("FL-07 persisted release and event activity", () => {
  it("launches the release, protects evidence and deduplicates concurrent submission with replay", async () => {
    const p = db!, fixture = await seedFl07Fixture(p);
    const labs = new LabsController(p as any, new StudentAccessService(p as any), new RequestRateLimiter());
    const adminLabs = new AdminLabsController(p as any, new LabReleaseService(p as any));
    const req = { user: { sub: fixture.student.id, role: "STUDENT" } };
    const launch = await labs.launchRun("thermal-energy", req, { challengeId: fixture.candidate.lab.challengeId, releaseId: fixture.release.id });
    expect(launch).toMatchObject({ rendererKey: "thermal-bench", rubricVersion: "thermal-energy-investigation@1.0.0", versionBinding: "FOUNDATIONAL_RELEASE" });
    const post = (event: unknown, key = randomUUID()) => labs.recordFl10Event(req, launch.runId, { event, idempotencyKey: key });
    const sourceRun = await p.labRun.findUniqueOrThrow({ where: { id: launch.runId } });
    // Expiry is part of the immutable launch tuple, so construct an already-expired test run.
    const expired = await p.labRun.create({ data: { studentId: sourceRun.studentId, labId: sourceRun.labId, challengeId: sourceRun.challengeId,
      context: sourceRun.context, execution: sourceRun.execution!, executionDigest: sourceRun.executionDigest, expiresAt: new Date(Date.now() - 1000) } });
    await expect(labs.fl10Events(req, expired.id)).rejects.toMatchObject({ response: { code: "RUN_EXPIRED" } });
    const revoked = await labs.launchRun("thermal-energy", req, { challengeId: fixture.candidate.lab.challengeId, releaseId: fixture.release.id });
    await p.labRun.update({ where: { id: revoked.runId }, data: { revokedAt: new Date() } });
    await expect(labs.recordFl10Event(req, revoked.runId, { event: { type: "PREDICTED_TEMPERATURE_CHANGE", choice: "increase" }, idempotencyKey: randomUUID() })).rejects.toMatchObject({ response: { code: "RUN_REVOKED" } });
    await expect(labs.fl10Events({ user: { sub: fixture.outsider.id } }, launch.runId)).rejects.toMatchObject({ status: 404 });
    await expect(labs.recordFl10Event({ user: { sub: fixture.outsider.id } }, launch.runId, { event: { type: "STARTED_HEATING" }, idempotencyKey: randomUUID() })).rejects.toMatchObject({ status: 404 });
    await expect(post({ type: "STARTED_HEATING" })).rejects.toMatchObject({ response: { code: "INVALID_ORDER" } });
    const firstKey = randomUUID(), prediction = { type: "PREDICTED_TEMPERATURE_CHANGE", choice: "decrease" };
    expect((await post(prediction, firstKey)).observations).toHaveLength(1);
    expect((await post(prediction, firstKey)).events).toHaveLength(1);
    await expect(post({ ...prediction, choice: "increase" }, firstKey)).rejects.toMatchObject({ response: { code: "IDEMPOTENCY_KEY_REUSED" } });
    expect((await post({ type: "STARTED_HEATING" })).observation.value).toMatchObject({ elapsedMilliseconds: 50000, meterReadingMilliJoules: 2100000 });
    await post({ type: "RECORDED_FIRST_MEASUREMENT", elapsedMilliseconds: 50000, energyMilliJoules: 2100000, temperatureMilliCelsius: 30000, riseMilliCelsius: 5000 });
    expect((await post({ type: "PREDICTED_SECOND_MEASUREMENT", choice: "less_than_double" })).observations).toHaveLength(3);
    await post({ type: "RECORDED_SECOND_MEASUREMENT", elapsedMilliseconds: 100000, energyMilliJoules: 4200000, temperatureMilliCelsius: 35000, riseMilliCelsius: 10000 });
    await post({ type: "EXPLAINED_ENERGY_BOUNDARY", ratioChoice: "double", boundaryChoice: "equal_ideal_only" });
    const body = { contract: "lab-contract/1", runId: launch.runId, idempotencyKey: randomUUID(), stateSchemaVersion: 1, evidenceSchemaVersion: 1, durationMs: 1000, labState: {} };
    const [first, second] = await Promise.all([labs.attempt(req, body), labs.attempt(req, { ...body, idempotencyKey: randomUUID() })]);
    expect(first.id).toBe(second.id);
    expect(first).toMatchObject({ verdict: "passed", simulationResult: { score: 6, maximumScore: 6 } });
    expect(await p.attempt.count({ where: { labRunId: launch.runId } })).toBe(1);
    await expect(labs.attempt(req, { ...body, idempotencyKey: randomUUID(), labState: { score: 6 } })).rejects.toMatchObject({ response: { code: "LAB_RUN_ALREADY_SUBMITTED" } });
    const { labState: _labState, ...withoutState } = body;
    await expect(labs.attempt(req, { ...withoutState, idempotencyKey: randomUUID(), evidence: {} })).rejects.toThrow("FL-07 requires labState evidence");
    expect(await adminLabs.reproduce(first.id)).toMatchObject({ matches: true, resultMatches: true });
    const releaseService = new LabReleaseService(p as any), adminReq = { user: { sub: fixture.admin.id, role: "ADMIN" } };
    const newer = await adminLabs.createVersion("thermal-energy", adminReq, { challengeParams: { [fixture.candidate.lab.challengeId]: {} }, reason: "TEST FIXTURE ONLY successor configuration", goldenCases: fixture.candidate.pack.template.goldenCases.map((g: any) => ({ challengeId: fixture.candidate.lab.challengeId, label: g.label, labState: g.state, expectedVerdict: g.expectedVerdict })) });
    await adminLabs.activateVersion("thermal-energy", String(newer.version), adminReq, { reason: "TEST FIXTURE ONLY successor configuration" });
    const successor = await releaseService.createDraft("thermal-energy", adminReq, { reason: "TEST FIXTURE ONLY successor release", lessonIds: fixture.candidate.lessonIds });
    await releaseService.publish("thermal-energy", successor.id, adminReq, { reason: "TEST FIXTURE ONLY successor activation", releaseDigest: successor.digest, evidence: { curriculumMapping: "TEST FIXTURE ONLY mapping", sourceReferences: ["TEST FIXTURE ONLY source"], scientificGoldenCases: "TEST FIXTURE ONLY golden", rubric: "TEST FIXTURE ONLY rubric", safetyAssessment: "TEST FIXTURE ONLY safety", rightsAssessment: "TEST FIXTURE ONLY rights" } });
    expect(await adminLabs.reproduce(first.id)).toMatchObject({ matches: true, resultMatches: true });
    const stored = await p.attempt.findUniqueOrThrow({ where: { id: first.id } });
    expect(stored.configVersionId).not.toBe(newer.id);
    await expect(p.labRunEvent.update({ where: { runId_sequence: { runId: launch.runId, sequence: 1 } }, data: { event: { type: "PREDICTED_TEMPERATURE_CHANGE", choice: "increase" } } })).rejects.toThrow();
  }, 60000);
});
