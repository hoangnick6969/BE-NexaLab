import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearSharedCache, sharedCached } from "./shared-cache";

describe("shared cache (perf review item 11)", () => {
  beforeEach(() => { process.env.CATALOG_CACHE_TTL_MS = "60000"; clearSharedCache(); });
  afterEach(() => { delete process.env.CATALOG_CACHE_TTL_MS; clearSharedCache(); });

  it("shares one load between concurrent and later callers until the TTL ends", async () => {
    const load = vi.fn().mockResolvedValue({ subjects: [] });
    const now = 1_000_000;
    await Promise.all([sharedCached("k", load, now), sharedCached("k", load, now + 1)]);
    await sharedCached("k", load, now + 59_999);
    expect(load).toHaveBeenCalledTimes(1);
    await sharedCached("k", load, now + 60_000);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("does not keep a failed load", async () => {
    const load = vi.fn().mockRejectedValueOnce(new Error("db down")).mockResolvedValue("ok");
    await expect(sharedCached("k", load)).rejects.toThrow("db down");
    await expect(sharedCached("k", load)).resolves.toBe("ok");
  });

  it("is off when CATALOG_CACHE_TTL_MS=0", async () => {
    process.env.CATALOG_CACHE_TTL_MS = "0";
    const load = vi.fn().mockResolvedValue(1);
    await sharedCached("k", load);
    await sharedCached("k", load);
    expect(load).toHaveBeenCalledTimes(2);
  });
});
