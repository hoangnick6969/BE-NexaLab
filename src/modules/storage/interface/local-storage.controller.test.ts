import { beforeEach, describe, expect, it, vi } from "vitest";

const storageMocks = vi.hoisted(() => ({ localStorage: vi.fn(), verifyLocalGrant: vi.fn() }));
vi.mock("../infrastructure/storage", () => storageMocks);

import { LocalStorageController, parseByteRange } from "./local-storage.controller";

describe("parseByteRange", () => {
  it("accepts one bounded byte range", () => {
    expect(parseByteRange("bytes=0-262143", 1_000_000)).toEqual({ start: 0, end: 262143 });
    expect(parseByteRange("bytes=900-", 1000)).toEqual({ start: 900, end: 999 });
    expect(parseByteRange("bytes=900-1200", 1000)).toEqual({ start: 900, end: 999 });
    expect(parseByteRange("bytes=-64", 1000)).toEqual({ start: 936, end: 999 });
  });

  it("rejects unsupported or unsatisfiable ranges", () => {
    expect(parseByteRange("bytes=1000-", 1000)).toBe("invalid");
    expect(parseByteRange("bytes=9-3", 1000)).toBe("invalid");
    expect(parseByteRange("bytes=0-1,4-5", 1000)).toBe("invalid");
    expect(parseByteRange("bytes=-0", 1000)).toBe("invalid");
    expect(parseByteRange("bytes=0-0", 0)).toBe("invalid");
  });
});

describe("LocalStorageController signed GET", () => {
  const local = {
    head: vi.fn(),
    readRange: vi.fn(),
    stream: vi.fn(),
  };
  const controller = new LocalStorageController();
  const response = () => ({
    setHeader: vi.fn(),
    status: vi.fn().mockReturnThis(),
    end: vi.fn(),
    json: vi.fn(),
  });

  beforeEach(() => {
    vi.clearAllMocks();
    storageMocks.localStorage.mockReturnValue(local);
    storageMocks.verifyLocalGrant.mockReturnValue({ op: "get", key: "shared/book.pdf", ct: "application/pdf" });
    local.head.mockResolvedValue({ bytes: 1000 });
    local.readRange.mockResolvedValue(Buffer.from("0123456789"));
    local.stream.mockResolvedValue({ pipe: vi.fn() });
  });

  it("returns signed HEAD metadata without opening the body", async () => {
    const res = response();
    await controller.get("grant", { method: "HEAD", headers: {} }, res);
    expect(res.setHeader).toHaveBeenCalledWith("Accept-Ranges", "bytes");
    expect(res.setHeader).toHaveBeenCalledWith("Content-Length", "1000");
    expect(res.end).toHaveBeenCalledOnce();
    expect(local.stream).not.toHaveBeenCalled();
  });

  it("returns only the requested bytes with 206 headers", async () => {
    const res = response();
    await controller.get("grant", { method: "GET", headers: { range: "bytes=100-109" } }, res);
    expect(local.readRange).toHaveBeenCalledWith("shared/book.pdf", 100, 109);
    expect(res.status).toHaveBeenCalledWith(206);
    expect(res.setHeader).toHaveBeenCalledWith("Content-Range", "bytes 100-109/1000");
    expect(res.setHeader).toHaveBeenCalledWith("Content-Length", "10");
    expect(res.end).toHaveBeenCalledWith(expect.any(Buffer));
    expect(local.stream).not.toHaveBeenCalled();
  });

  it("returns 416 for an unsatisfiable range", async () => {
    const res = response();
    await controller.get("grant", { method: "GET", headers: { range: "bytes=1000-" } }, res);
    expect(res.setHeader).toHaveBeenCalledWith("Content-Range", "bytes */1000");
    expect(res.status).toHaveBeenCalledWith(416);
    expect(res.end).toHaveBeenCalledOnce();
    expect(local.readRange).not.toHaveBeenCalled();
  });

  it("keeps ordinary GET streaming the complete object", async () => {
    const res = response();
    const stream = { pipe: vi.fn() };
    local.stream.mockResolvedValue(stream);
    await controller.get("grant", { method: "GET", headers: {} }, res);
    expect(local.stream).toHaveBeenCalledWith("shared/book.pdf");
    expect(stream.pipe).toHaveBeenCalledWith(res);
    expect(local.readRange).not.toHaveBeenCalled();
  });
});
