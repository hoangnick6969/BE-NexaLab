import { describe, expect, it, vi } from "vitest";
import { ClassResourcesService } from "./class-resources.service";

describe("class resource attachment list metadata", () => {
  for (const role of ["TEACHER", "STUDENT"]) it(`batches attachment versions after ${role} authorization`, async () => {
    const rows = ["a", "b", "a"].map((assetVersionId, index) => ({ id: String(index), kind: "DOCUMENT", content: { source: { type: "upload", assetVersionId } } }));
    const db: any = {
      classroom: { findUnique: vi.fn().mockResolvedValue({ status: "ACTIVE", teacherId: "user" }) },
      enrollment: { findUnique: vi.fn().mockResolvedValue({ status: "approved" }) },
      classResource: { findMany: vi.fn().mockResolvedValue(rows) },
      assetVersion: { findMany: vi.fn().mockResolvedValue([{ id: "a", fileName: "a.pdf" }, { id: "b", fileName: "b.pdf" }]), findUnique: vi.fn() },
    };
    const result = await new ClassResourcesService(db).list("class", { user: { role, sub: "user" } });
    expect(db.assetVersion.findMany).toHaveBeenCalledTimes(1);
    expect(db.assetVersion.findMany.mock.calls[0][0].where).toEqual({ id: { in: ["a", "b"] } });
    expect(db.assetVersion.findUnique).not.toHaveBeenCalled();
    expect(result.map((row: any) => row.attachment.fileName)).toEqual(["a.pdf", "b.pdf", "a.pdf"]);
  });
  it("does not load attachment metadata for a removed member", async () => {
    const db: any = { classroom: { findUnique: vi.fn().mockResolvedValue({ status: "ACTIVE" }) }, enrollment: { findUnique: vi.fn().mockResolvedValue({ status: "removed" }) }, assetVersion: { findMany: vi.fn() } };
    await expect(new ClassResourcesService(db).list("class", { user: { role: "STUDENT", sub: "user" } })).rejects.toThrow();
    expect(db.assetVersion.findMany).not.toHaveBeenCalled();
  });
});
