import { afterEach, describe, expect, it, vi } from "vitest";
import { Errors } from "./errors";

describe("HTTP error privacy", () => {
  afterEach(() => vi.restoreAllMocks());

  it("keeps internal secrets out of the client error and application log", () => {
    const secret = "password=secret token=jwt dbUrl=postgres://private answerOptionId=option-1";
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const output: { status?: number; body?: unknown } = {};
    const response = {
      status(code: number) { output.status = code; return this; },
      json(body: unknown) { output.body = body; return this; },
    };

    new Errors().catch(new Error(secret), {
      switchToHttp: () => ({ getResponse: () => response }),
    } as any);

    expect(output.status).toBe(500);
    expect(output.body).toEqual({ message: "Lỗi hệ thống" });
    expect(JSON.stringify([output.body, log.mock.calls])).not.toContain(secret);
    expect(JSON.stringify([output.body, log.mock.calls])).not.toMatch(/password|token|postgres:|answerOptionId/i);
  });
});
