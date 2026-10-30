import { ConflictException } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { digest } from "./lab-run";
import { assertLegacyCircuitAssignmentCompatible } from "./assignment-lab-execution";
import { LabsController } from "../interface/labs.controller";

vi.mock("../../progress/application/progress-projection", () => ({
  projectLab: vi.fn(),
  projectLesson: vi.fn(),
}));

describe("legacy Circuit assignment model compatibility", () => {
  it("does not attach open Circuit library practice to an implicit legacy LED assignment", async () => {
    const tx: any = {
      challenge: { findUnique: vi.fn().mockResolvedValue({ id: "circuit_001", labId: "circuit", lab: { status: "published", scope: "SHARED_LIBRARY", releaseCleared: true, synthetic: false, topicCode: "KHTN8-L22" } }) },
      assignment: { findFirst: vi.fn().mockResolvedValue({ id: "pilot-a-circuit-assignment", labExecution: null }) },
      labRelease: { findFirst: vi.fn().mockResolvedValue(null) },
      simulationConfigVersion: { findFirst: vi.fn().mockResolvedValue({ id: "config", labId: "circuit", modelRef: "circuit-bulb@1.0.0", challengeParams: { circuit_001: {} } }) },
      simulationPackVersion: { findFirst: vi.fn().mockResolvedValue({ id: "pack", labId: "circuit", modelRef: "circuit-bulb@1.0.0", engineVersion: "1.0.0", activityVersionId: "activity", template: { ranges: {}, initialState: {} } }) },
      practicalActivityVersion: { findUnique: vi.fn().mockResolvedValue({ id: "activity", key: "circuit-bulb-checkpoints", version: 1, digest: "digest" }) },
      labPackRevocation: { findUnique: vi.fn().mockResolvedValue(null) },
      labRun: { create: vi.fn().mockImplementation(({ data }: any) => ({ id: "open-run", ...data })) },
      $executeRawUnsafe: vi.fn(),
    };
    const db: any = { $transaction: (work: any) => work(tx) };
    const controller = new LabsController(db, {} as any, {} as any);
    await expect(controller.launchRun("circuit", { user: { sub: "student" } }, { challengeId: "circuit_001" })).resolves.toMatchObject({ context: "FOUNDATIONAL", assignmentId: null });
    expect(tx.assignment.findFirst).not.toHaveBeenCalled();
  });

  it("blocks the bulb model for an unpinned Circuit assignment", () => {
    try {
      assertLegacyCircuitAssignmentCompatible("circuit", { labExecution: null }, "circuit-bulb@1.0.0");
      throw new Error("Expected the incompatible legacy assignment to be rejected");
    } catch (error) {
      expect(error).toBeInstanceOf(ConflictException);
      expect((error as ConflictException).getResponse()).toMatchObject({
        code: "LEGACY_ASSIGNMENT_MODEL_INCOMPATIBLE",
      });
    }
  });

  it("keeps pinned Circuit assignments and the legacy LED model compatible", () => {
    expect(() => assertLegacyCircuitAssignmentCompatible("circuit", { labExecution: { modelRef: "circuit-bulb@1.0.0" } }, "circuit-bulb@1.0.0")).not.toThrow();
    expect(() => assertLegacyCircuitAssignmentCompatible("circuit", { labExecution: null }, "circuit@1.0.0")).not.toThrow();
    expect(() => assertLegacyCircuitAssignmentCompatible("circuit", null, "circuit-bulb@1.0.0")).not.toThrow();
  });

  it("blocks both existing unpinned assignments on LabRun and legacy submit without writing evidence", async () => {
    const ids = ["pilot-a-circuit-assignment", "cmv68v7zz00fllwdcdbhdz0hj"];
    for (const id of ids) {
      const assignment = { id, contentId: "circuit", contentType: "lab", labExecution: null };
      const lab = { id: "circuit", status: "published", scope: "CLASS_PRIVATE", releaseCleared: false, synthetic: false, topicCode: null, simulationModelRef: "circuit@1.0.0" };
      const challenge = { id: "circuit_001", labId: "circuit", lab, constraints: {} };
      const config = { id: "bulb-config", labId: "circuit", modelRef: "circuit-bulb@1.0.0", challengeParams: { circuit_001: {} } };
      const activity = { id: "bulb-activity", key: "circuit-bulb-checkpoints", version: 1, digest: "activity-digest" };
      const pack = { id: "bulb-pack", labId: "circuit", modelRef: "circuit-bulb@1.0.0", engineVersion: "1.0.0", activityVersionId: activity.id, template: { ranges: {}, initialState: {} } };
      const tx: any = {
        challenge: { findUnique: vi.fn().mockResolvedValue(challenge) },
        assignment: { findFirst: vi.fn().mockResolvedValue(assignment) },
        attempt: { findUnique: vi.fn().mockResolvedValue(null), create: vi.fn(), count: vi.fn().mockResolvedValue(0) },
        labRun: { create: vi.fn() },
        labRelease: { findFirst: vi.fn().mockResolvedValue(null) },
        simulationConfigVersion: { findFirst: vi.fn().mockResolvedValue(config) },
        simulationPackVersion: { findFirst: vi.fn().mockResolvedValue(pack) },
        practicalActivityVersion: { findUnique: vi.fn().mockResolvedValue(activity) },
        labPackRevocation: { findUnique: vi.fn().mockResolvedValue(null) },
        $executeRaw: vi.fn(),
        $executeRawUnsafe: vi.fn(),
      };
      const db: any = { ...tx, $transaction: vi.fn((work: (tx: any) => unknown) => work(tx)) };
      const controller = new LabsController(db, { retryGuidance: vi.fn() } as any, { rate: vi.fn() } as any);
      const req = { user: { sub: `student-${id}`, role: "STUDENT" } };

      await expect(controller.launchRun("circuit", req, { challengeId: challenge.id, assignmentId: id }))
        .rejects.toMatchObject({ response: { code: "LEGACY_ASSIGNMENT_MODEL_INCOMPATIBLE" } });
      await expect(controller.attempt(req, {
        challengeId: challenge.id, labState: {}, durationMs: 100, idempotencyKey: randomUUID(),
      })).rejects.toMatchObject({ response: { code: "LEGACY_ASSIGNMENT_MODEL_INCOMPATIBLE" } });
      expect(tx.labRun.create).not.toHaveBeenCalled();
      expect(tx.attempt.create).not.toHaveBeenCalled();
    }
  });

  it("replays a historical legacy attempt before checking the new model", async () => {
    const assignment = { id: "pilot-a-circuit-assignment", contentId: "circuit", contentType: "lab", labExecution: null };
    const lab = { id: "circuit", status: "published", scope: "CLASS_PRIVATE", releaseCleared: false, synthetic: false, topicCode: null };
    const challenge = { id: "circuit_001", labId: "circuit", lab, constraints: {} };
    const body = { challengeId: challenge.id, labState: { switch: "open" }, durationMs: 100, idempotencyKey: "11111111-1111-4111-8111-111111111111" };
    const existing = { id: "historical-attempt", studentId: "student", challengeId: challenge.id, assignmentId: assignment.id, lessonStepId: null, labRunId: null, labState: body.labState, simulationResult: { legacy: true }, verdict: "partial", createdAt: new Date() };
    const db: any = {
      challenge: { findUnique: vi.fn().mockResolvedValue(challenge) },
      assignment: { findFirst: vi.fn().mockResolvedValue(assignment) },
      attempt: { findUnique: vi.fn().mockResolvedValue(existing), count: vi.fn().mockResolvedValue(1), create: vi.fn() },
      $transaction: vi.fn(),
    };
    const guidance = { retry: "same attempt" };
    const controller = new LabsController(db, { retryGuidance: vi.fn().mockReturnValue(guidance) } as any, { rate: vi.fn() } as any);

    const result = await controller.attempt({ user: { sub: "student", role: "STUDENT" } }, body);

    expect(result.id).toBe(existing.id);
    expect(result.simulationResult).toEqual(existing.simulationResult);
    expect(result.retryGuidance).toBe(guidance);
    expect(db.attempt.create).not.toHaveBeenCalled();
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it("keeps an open Foundational submission without an applicable assignment available", async () => {
    const lab = {
      id: "circuit", status: "published", scope: "SHARED_LIBRARY", releaseCleared: true,
      synthetic: false, topicCode: "KHTN8-L22", simulationModelRef: "circuit@1.0.0",
    };
    const challenge = { id: "circuit_001", labId: lab.id, lab, constraints: {} };
    const tx: any = {
      challenge: { findUnique: vi.fn().mockResolvedValue(challenge) },
      assignment: { findFirst: vi.fn().mockResolvedValue(null) },
      simulationConfigVersion: { findFirst: vi.fn().mockResolvedValue(null) },
      simulationPackVersion: { findFirst: vi.fn().mockResolvedValue(null) },
      attempt: { create: vi.fn().mockResolvedValue({ id: "foundational-attempt" }), count: vi.fn().mockResolvedValue(1) },
      $executeRaw: vi.fn(),
    };
    const db: any = { ...tx, $transaction: vi.fn((work: (tx: any) => unknown) => work(tx)) };
    const controller = new LabsController(db, { retryGuidance: vi.fn().mockReturnValue(null) } as any, { rate: vi.fn() } as any);

    await expect(controller.attempt({ user: { sub: "student", role: "STUDENT" } }, {
      challengeId: challenge.id,
      labState: {
        nodes: [{ id: "battery", type: "battery", value: 9 }, { id: "resistor", type: "resistor", value: 470 }, { id: "led", type: "led" }],
        edges: [{ source: "battery", target: "resistor" }, { source: "resistor", target: "led" }, { source: "led", target: "battery" }],
      },
      durationMs: 100,
    })).resolves.toMatchObject({ id: "foundational-attempt" });
    expect(tx.attempt.create).toHaveBeenCalledOnce();
  });

  it("rejects a pre-existing bulb LabRun for an unpinned legacy assignment before creating an Attempt", async () => {
    const assignment = { id: "pilot-a-circuit-assignment", contentId: "circuit", contentType: "lab", labExecution: null };
    const execution = {
      modelRef: "circuit-bulb@1.0.0",
      engineVersion: "1.0.0",
      packVersionId: "bulb-pack",
      configVersionId: "bulb-config",
      activityVersionId: "bulb-activity",
      activityDigest: "activity-digest",
      activityKey: "circuit-bulb-checkpoints",
      activityVersion: 1,
      rubricRef: "circuit-bulb-checkpoints@1.0.0",
      params: null,
      stateSchemaVersion: 1,
      evidenceSchemaVersion: 1,
      template: { ranges: {}, initialState: {} },
      binding: "LEGACY_UNPINNED_LAUNCH",
    };
    const run = {
      id: "pre-guard-bulb-run", studentId: "student", labId: "circuit", challengeId: "circuit_001",
      assignmentId: assignment.id, execution, executionDigest: digest(execution), revokedAt: null, expiresAt: null,
    };
    const tx: any = {
      attempt: { findUnique: vi.fn().mockResolvedValue(null), create: vi.fn() },
      labRun: {
        findFirst: vi.fn().mockResolvedValue(run),
        findUniqueOrThrow: vi.fn().mockResolvedValue(run),
      },
      assignment: { findFirst: vi.fn().mockResolvedValue(assignment) },
      labPackRevocation: { findUnique: vi.fn().mockResolvedValue(null) },
      $executeRawUnsafe: vi.fn(),
    };
    const db: any = { ...tx, $transaction: vi.fn((work: (tx: any) => unknown) => work(tx)) };
    const controller = new LabsController(db, { retryGuidance: vi.fn() } as any, { rate: vi.fn() } as any);

    await expect(controller.attempt({ user: { sub: "student", role: "STUDENT" } }, {
      contract: "lab-contract/1", runId: run.id, idempotencyKey: randomUUID(),
      stateSchemaVersion: 1, evidenceSchemaVersion: 1, durationMs: 100, labState: {},
    })).rejects.toMatchObject({ response: { code: "LEGACY_ASSIGNMENT_MODEL_INCOMPATIBLE" } });
    expect(tx.attempt.create).not.toHaveBeenCalled();
  });
});
