import { describe, expect, it, vi } from "vitest";
import { LabsController } from "../../labs/interface/labs.controller";
import { requestHint } from "../../labs/application/hint";

describe("class practice revocation at event and hint boundaries", () => {
  it("denies event reads/writes and cached hints after the class/member/resource is withdrawn", async () => {
    const run = { id: "run", labId: "lever-equilibrium", studentId: "student", challengeId: "challenge", context: "CLASS_PRACTICE", resourceId: "resource", assignmentId: null, expiresAt: new Date(Date.now() + 60000) };
    const db: any = {
      labRun: { findFirst: vi.fn().mockResolvedValue(run), findUnique: vi.fn().mockResolvedValue(run) },
      classResource: { findFirst: vi.fn().mockResolvedValue(null) },
      attempt: { findFirst: vi.fn().mockResolvedValue({ id: "attempt", labRunId: "run", assignmentId: null, hints: [{ id: "cached-hint" }] }) },
      $executeRawUnsafe: vi.fn(),
    };
    db.$transaction = (work: any) => work(db);
    const controller = new LabsController(db, {} as any, { rate: vi.fn() } as any);
    await expect(controller.fl10Events({ user: { sub: "student" } }, "run")).rejects.toMatchObject({ response: { code: "CLASS_RESOURCE_ACCESS_DENIED" } });
    await expect(controller.recordFl10Event({ user: { sub: "student" } }, "run", { idempotencyKey: "00000000-0000-4000-8000-000000000001", event: { type: "PREDICTED_ROTATION", predictions: [{ positionMillimetres: -100, prediction: "TILT_LEFT" }, { positionMillimetres: 0, prediction: "LEVEL" }, { positionMillimetres: 100, prediction: "TILT_RIGHT" }] } })).rejects.toMatchObject({ response: { code: "CLASS_RESOURCE_ACCESS_DENIED" } });
    const provider = vi.fn();
    await expect(requestHint(db, { sub: "student", sid: "session" }, "attempt", provider)).rejects.toMatchObject({ response: { code: "CLASS_RESOURCE_ACCESS_DENIED" } });
    expect(provider).not.toHaveBeenCalled();
  });
});
