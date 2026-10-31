import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { afterAll, describe, expect, it } from "vitest";
import { RequestRateLimiter } from "../../../common/request-rate-limiter";
import { StudentAccessService } from "../../progress/application/student-access.service";
import { DENSITY_SPECIMENS } from "../../../../packages/sim";
import { LabsController } from "./labs.controller";
import { seedDensityReleaseFixture } from "./density-release.fixture";

/**
 * End-to-end FL-03 run through the real launch and submit endpoints, on the
 * isolated loopback database only. The student works through a class assignment,
 * the standard runtime path that needs no LabRelease. Test rows are labelled.
 */
const url = process.env.NEXALAB_ISOLATED_DATABASE_URL;
if (url) {
  const parsed = new URL(url);
  if (!["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname) || parsed.pathname !== "/nexalab_fl03_isolated")
    throw new Error("FL-03 E2E only runs against the isolated nexalab_fl03_isolated database on loopback");
}
const db = url ? new PrismaClient({ datasourceUrl: url }) : null;
afterAll(async () => { await db?.$disconnect(); });

const round = (value: number, places: number) => Number(value.toFixed(places));

/** The evidence a correct learner would send for the server-pinned specimens (all readings exact). */
function correctEvidence(pins: { blockId: string; pebbleId: string }) {
  const block = (DENSITY_SPECIMENS as any)[pins.blockId];
  const pebble = (DENSITY_SPECIMENS as any)[pins.pebbleId];
  const [a, b, c] = block.sizeMm;
  const blockVolume = (a * b * c) / 1000;
  const pebbleVolume = pebble.volumeMl;
  return {
    explore: {
      masses: ["iron-1v", "iron-2v", "iron-3v", "aluminium-1v", "copper-1v"].map((specimenId) => ({ specimenId, massG: (DENSITY_SPECIMENS as any)[specimenId].massG })),
      conclusion: "A",
    },
    block: { specimenId: pins.blockId, trials: [{ aMm: a, bMm: b, cMm: c, massG: block.massG }], density: { value: round(block.massG / blockVolume, 4), unit: "g/cm3" } },
    water: { pouredMl: 50, volumeMl: 50, m1G: 48.6, m2G: 98.6, density: { value: 1, unit: "g/ml" } },
    pebble: { specimenId: pins.pebbleId, initialMl: 50, massG: pebble.massG, v1Ml: 50, v2Ml: 50 + pebbleVolume, density: { value: round(pebble.massG / pebbleVolume, 4), unit: "g/cm3" } },
    units: { woodKgm3: round((block.massG / blockVolume) * 1000, 2), irregularReason: "A" },
  };
}

describe.skipIf(!db)("FL-03 density end-to-end on the isolated database", () => {
  it("launches a pinned run through an assignment, submits evidence and gets the server verdict", async () => {
    const p = db!;
    const suffix = randomUUID().slice(0, 8);
    const teacher = await p.user.create({ data: { email: `e2e-teacher-${suffix}@example.test`, fullName: "E2E teacher", passwordHash: "fixture", role: "TEACHER" } });
    const student = await p.user.create({ data: { username: `e2e-student-${suffix}`, fullName: "E2E student", passwordHash: "fixture", role: "STUDENT" } });
    const classroom = await p.classroom.create({ data: { teacherId: teacher.id, name: `E2E class ${suffix}` } });
    await p.enrollment.create({ data: { classId: classroom.id, studentId: student.id, status: "approved", approved: true } });
    const assignment = await p.assignment.create({ data: {
      classId: classroom.id, contentId: "density", contentType: "lab", title: `E2E FL-03 ${suffix}`,
      dueDate: new Date(Date.now() + 86400000), targets: { create: [{ studentId: student.id }] },
    } });
    const controller = new LabsController(p as any, new StudentAccessService(p as any), new RequestRateLimiter());
    const req = { user: { sub: student.id, role: "STUDENT" } };

    // 1. Launch: the server chooses and pins the specimen pair.
    const launch = await controller.launchRun("density", req, { challengeId: "density_001", assignmentId: assignment.id });
    expect(launch.rendererKey).toBe("density-bench");
    expect(launch.rubricVersion).toBe("density-stations@1.0.0");
    const pins = launch.runtimeParams as { blockId: string; pebbleId: string };
    expect(["wood-block-a", "wood-block-b"]).toContain(pins.blockId);
    expect(["pebble-a", "pebble-b"]).toContain(pins.pebbleId);

    // 2. Submit the evidence for the pinned pair: the server recomputes and scores it.
    const submission = { contract: "lab-contract/1", runId: launch.runId, idempotencyKey: randomUUID(), stateSchemaVersion: 1, evidenceSchemaVersion: 1, durationMs: 1000, evidence: correctEvidence(pins) };
    const first: any = await controller.attempt(req, submission);
    const attempt = first.attempt ?? first;
    expect(attempt.verdict).toBe("passed");
    expect(attempt.simulationResult.assessment).toMatchObject({ score: 6, maximumScore: 6, passed: true });

    // 3. Replaying the same key returns the same attempt, not a new one.
    const replay: any = await controller.attempt(req, submission);
    expect((replay.attempt ?? replay).id).toBe(attempt.id);

    // 4. Evidence for the other block is refused and creates no attempt.
    const other = pins.blockId === "wood-block-a" ? "wood-block-b" : "wood-block-a";
    const wrong = { ...submission, idempotencyKey: randomUUID(), evidence: { ...correctEvidence(pins), block: { ...correctEvidence(pins).block, specimenId: other } } };
    await expect(controller.attempt(req, wrong)).rejects.toBeDefined();
    expect(await p.attempt.count({ where: { labRunId: launch.runId, idempotencyKey: wrong.idempotencyKey } })).toBe(0);
  }, 60000);
});

describe.skipIf(!db)("FL-03 density through an ACTIVE LabRelease on the isolated database", () => {
  it("launches without an assignment from the active release, pins specimens and scores 6/6", async () => {
    const p = db!;
    const admin = await p.user.findFirstOrThrow({ where: { role: "ADMIN" }, orderBy: { createdAt: "asc" } });
    const release = await seedDensityReleaseFixture(p, admin.id);
    expect(release).toMatchObject({ status: "ACTIVE", labId: "density" });
    const suffix = randomUUID().slice(0, 8);
    const student = await p.user.create({ data: { username: `e2e-release-${suffix}`, fullName: "E2E release student", passwordHash: "fixture", role: "STUDENT" } });
    const controller = new LabsController(p as any, new StudentAccessService(p as any), new RequestRateLimiter());
    const req = { user: { sub: student.id, role: "STUDENT" } };

    const launch = await controller.launchRun("density", req, { challengeId: "density_001" });
    expect(launch.versionBinding).toBe("FOUNDATIONAL_RELEASE");
    expect(launch.rendererKey).toBe("density-bench");
    const pins = launch.runtimeParams as { blockId: string; pebbleId: string };
    expect(["wood-block-a", "wood-block-b"]).toContain(pins.blockId);
    expect(["pebble-a", "pebble-b"]).toContain(pins.pebbleId);

    const submission = { contract: "lab-contract/1", runId: launch.runId, idempotencyKey: randomUUID(), stateSchemaVersion: 1, evidenceSchemaVersion: 1, durationMs: 1000, evidence: correctEvidence(pins) };
    const result: any = await controller.attempt(req, submission);
    const attempt = result.attempt ?? result;
    expect(attempt.verdict).toBe("passed");
    expect(attempt.simulationResult.assessment).toMatchObject({ score: 6, maximumScore: 6, passed: true });
    expect(attempt.simulationResult._execution.rubricRef).toBe("density-stations@1.0.0");
  }, 60000);
});
