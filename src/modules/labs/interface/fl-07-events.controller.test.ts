import { describe, expect, it, vi } from "vitest";
import { LabsController } from "./labs.controller";
import { digest, FL07_RUBRIC } from "../application/lab-run";

const execution = { modelRef: "thermal-bench@1.0.0", engineVersion: "1.0.0", packVersionId: "pack", configVersionId: "config",
  activityVersionId: "activity", activityDigest: "digest", activityKey: "thermal-energy-investigation", activityVersion: 1, rubricRef: FL07_RUBRIC,
  params: null, stateSchemaVersion: 1, evidenceSchemaVersion: 1, template: {} };

describe("FL-07 run event route", () => {
  it("keeps readings behind prediction and heating and rejects legacy attempts", async () => {
    const rows: Array<{ sequence: number; idempotencyKey: string; event: any }> = [];
    const db: any = {
      challenge: { findUnique: vi.fn().mockResolvedValue({ labId: "thermal-energy", lab: { status: "published", simulationModelRef: "thermal-bench@1.0.0" } }) },
      labRun: { findFirst: vi.fn().mockResolvedValue({ id: "run", studentId: "student", labId: "thermal-energy", assignmentId: null,
        revokedAt: null, expiresAt: null, execution, executionDigest: digest(execution) }) },
      lab: { findUnique: vi.fn().mockResolvedValue({ status: "published", scope: "SHARED_LIBRARY", releaseCleared: true, synthetic: false, topicCode: "topic" }) },
      labPackRevocation: { findUnique: vi.fn().mockResolvedValue(null) },
      labRunEvent: { findMany: vi.fn(async () => [...rows]), create: vi.fn(async ({ data }: any) => { rows.push(data); return data; }) },
      $executeRawUnsafe: vi.fn(), $transaction: async (fn: any) => fn(db),
    };
    const controller = new LabsController(db, {} as any, { rate: vi.fn() } as any);
    const req = { user: { sub: "student" } };
    const post = (n: number, event: unknown) => controller.recordFl10Event(req, "run", { idempotencyKey: `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`, event });
    await expect(controller.attempt(req, { challengeId: "thermal", labState: {}, durationMs: 0 })).rejects.toMatchObject({ response: { code: "FL07_REQUIRES_LAB_RUN" } });
    await expect(post(1, { type: "STARTED_HEATING" })).rejects.toMatchObject({ response: { code: "INVALID_ORDER" } });
    expect((await post(1, { type: "PREDICTED_TEMPERATURE_CHANGE", choice: "decrease" })).observation).toMatchObject({ ok: true, value: { elapsedMilliseconds: 0, meterReadingMilliJoules: 0 } });
    expect((await post(2, { type: "STARTED_HEATING" })).observation).toMatchObject({ ok: true, value: { elapsedMilliseconds: 50000, meterReadingMilliJoules: 2100000 } });
    await post(3, { type: "RECORDED_FIRST_MEASUREMENT", elapsedMilliseconds: 50000, energyMilliJoules: 0, temperatureMilliCelsius: 0, riseMilliCelsius: 0 });
    expect((await post(4, { type: "PREDICTED_SECOND_MEASUREMENT", choice: "double" })).observation).toMatchObject({ ok: true, value: { elapsedMilliseconds: 100000, meterReadingMilliJoules: 4200000 } });
    expect((await controller.fl10Events(req, "run")).events).toHaveLength(4);
    expect(rows.map((row) => row.sequence)).toEqual([1, 2, 3, 4]);
  });
});
