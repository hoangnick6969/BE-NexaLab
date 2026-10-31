import { describe, expect, it, vi } from "vitest";
import { LabsController } from "./labs.controller";
import { digest, FL10_RUBRIC } from "../application/lab-run";

const execution = {
  modelRef: "mass-conservation@1.0.0", engineVersion: "1.0.0", packVersionId: "pack",
  configVersionId: "config", activityVersionId: "activity", activityDigest: "digest",
  activityKey: "mass-conservation-poea", activityVersion: 1, rubricRef: FL10_RUBRIC,
  params: { fixtureId: "barium-precipitation-reference-v1", cup1Milligrams: 100000, cup2Milligrams: 100000,
    solvent1Milligrams: 100000, solvent2Milligrams: 100000 },
  stateSchemaVersion: 1, evidenceSchemaVersion: 1, template: {},
};

describe("FL-10 server event API", () => {
  it("rejects the legacy attempt route before writing evidence", async () => {
    const db: any = { challenge: { findUnique: vi.fn().mockResolvedValue({ labId: "mass-conservation",
      lab: { status: "published", simulationModelRef: "mass-conservation@1.0.0" } }) },
      attempt: { create: vi.fn() } };
    const controller = new LabsController(db, {} as any, { rate: vi.fn() } as any);
    await expect(controller.attempt({ user: { sub: "student" } }, {
      challengeId: "fl10_001", labState: {}, durationMs: 0,
    })).rejects.toThrow();
    expect(db.attempt.create).not.toHaveBeenCalled();
  });

  it("persists ordered evidence and reveals readings only after each recorded step", async () => {
    const rows: Array<{ sequence: number; idempotencyKey: string; event: any }> = [];
    const db: any = {
      labRun: { findFirst: vi.fn().mockResolvedValue({ id: "run", studentId: "student", labId: "mass-conservation",
        assignmentId: null, revokedAt: null, expiresAt: null, execution, executionDigest: digest(execution) }) },
      lab: { findUnique: vi.fn().mockResolvedValue({ status: "published", scope: "SHARED_LIBRARY", releaseCleared: true, synthetic: false, topicCode: "topic" }) },
      labPackRevocation: { findUnique: vi.fn().mockResolvedValue(null) },
      labRunEvent: {
        findMany: vi.fn(async () => [...rows]),
        create: vi.fn(async ({ data }: any) => { rows.push(data); return data; }),
      },
      $executeRawUnsafe: vi.fn(),
      $transaction: async (fn: any) => fn(db),
    };
    const controller = new LabsController(db, {} as any, { rate: vi.fn() } as any);
    const req = { user: { sub: "student" } };
    const post = (key: string, event: unknown) => controller.recordFl10Event(req, "run", { idempotencyKey: key, event });
    const keys = [1, 2, 3, 4].map((n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`);
    await expect(post(keys[0], { type: "READ_BEFORE" })).rejects.toThrow();
    expect(rows).toHaveLength(0);
    const predicted = await post(keys[0], { type: "PREDICTED", prediction: "predict.decrease" });
    expect(predicted.readings).toEqual({ beforeScaleMilligrams: null, afterScaleMilligrams: null });
    expect(await post(keys[0], { type: "PREDICTED", prediction: "predict.decrease" })).toEqual(predicted);
    await expect(post(keys[0], { type: "PREDICTED", prediction: "predict.same" })).rejects.toThrow();
    expect((await post(keys[1], { type: "READ_BEFORE" })).readings)
      .toEqual({ beforeScaleMilligrams: 435000, afterScaleMilligrams: null });
    await post(keys[2], { type: "MIXED" });
    expect((await post(keys[3], { type: "READ_AFTER" })).readings)
      .toEqual({ beforeScaleMilligrams: 435000, afterScaleMilligrams: 435000 });
    expect((await controller.fl10Events(req, "run")).events).toHaveLength(4);
    expect(rows.map((row) => row.sequence)).toEqual([1, 2, 3, 4]);
  });
});
