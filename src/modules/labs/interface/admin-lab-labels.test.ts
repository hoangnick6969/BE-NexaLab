import { describe, expect, it, vi } from "vitest";
import { AdminLabsController } from "./admin-labs.controller";

vi.mock("../../../common/audit", () => ({ audit: vi.fn(), changedFields: vi.fn(() => ({})) }));

describe("Circuit draft metadata correction", () => {
  for (const [status, activeRelease, allowed] of [["published", null, true], ["draft", null, false], ["published", { id: "active" }, false]] as const) {
    it(`allows=${allowed} for current status=${status}, active release=${Boolean(activeRelease)}`, async () => {
      const tx: any = {
        lab: { findUnique: vi.fn().mockResolvedValue({ id: "circuit", status }), update: vi.fn().mockResolvedValue({ id: "circuit", status: "published" }) },
        labRelease: { findFirst: vi.fn().mockResolvedValueOnce(activeRelease).mockResolvedValueOnce({ id: "draft" }) },
      };
      const db: any = { $transaction: (work: any) => work(tx) };
      const call = new AdminLabsController(db).updateLab("circuit", { user: { sub: "admin", role: "ADMIN" } }, {
        title: "Circuit Bulb", topic: "Mạch kín và mạch hở", learningObjective: "Dự đoán, quan sát và giải thích CLOSED/OPEN.", status: "published", reason: "Correct pilot metadata",
      });
      if (allowed) await expect(call).resolves.toMatchObject({ id: "circuit" });
      else {
        await expect(call).rejects.toMatchObject({ response: { code: "LAB_RELEASE_REQUIRED" } });
        expect(tx.lab.update).not.toHaveBeenCalled();
      }
    });
  }
});
