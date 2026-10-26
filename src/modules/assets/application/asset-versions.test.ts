import { describe, expect, it, vi } from "vitest";
import { canReadVersion } from "./asset-versions";

const sourcePdf = {
  id: "version-1",
  status: "READY",
  sha256: "6dcda104a5b09d1395417afef9ac48630843e57dc53938412eada13a6fdfdbf1",
  asset: { status: "ACTIVE", ownerId: "admin-1", scope: "SHARED_LIBRARY", kind: "pdf" },
};

describe("canReadVersion source PDFs", () => {
  it("allows a student only when a released public lesson declares the exact source digest", async () => {
    const db = {
      assetVersion: { count: vi.fn().mockResolvedValue(1) },
      $queryRaw: vi.fn().mockResolvedValueOnce([{ "?column?": 1 }]),
    };
    await expect(canReadVersion(db, { sub: "student-1", role: "STUDENT" }, sourcePdf)).resolves.toBe(true);
    expect(db.$queryRaw).toHaveBeenCalledTimes(1);
    expect(db.$queryRaw.mock.calls[0][0].join("?")).toContain("p.manifest #>> '{kind}' = 'structured-lesson-candidate'");
  });

  it("fails closed when no released lesson declares the digest", async () => {
    const db = {
      assetVersion: { count: vi.fn().mockResolvedValue(1) },
      $queryRaw: vi.fn().mockResolvedValueOnce([]).mockResolvedValueOnce([]).mockResolvedValueOnce([]),
    };
    await expect(canReadVersion(db, { sub: "student-1", role: "STUDENT" }, sourcePdf)).resolves.toBe(false);
  });

  it("denies duplicate digest assets and does not run the lesson authorization query", async () => {
    const db = { assetVersion: { count: vi.fn().mockResolvedValue(2) }, $queryRaw: vi.fn() };
    await expect(canReadVersion(db, { sub: "student-1", role: "STUDENT" }, sourcePdf)).resolves.toBe(false);
    expect(db.$queryRaw).not.toHaveBeenCalled();
  });
});
