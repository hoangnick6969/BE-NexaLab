import { afterEach, describe, expect, it, vi } from "vitest";
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import { z } from "zod";
import { Errors, toErrorBody } from "./errors";

function capture(error: unknown) {
  const output: { status?: number; body?: any } = {};
  const response = {
    status(code: number) { output.status = code; return this; },
    json(body: unknown) { output.body = body; return this; },
  };
  new Errors().catch(error, { switchToHttp: () => ({ getResponse: () => response }) } as any);
  return output;
}

describe("HTTP error privacy", () => {
  afterEach(() => vi.restoreAllMocks());

  it("keeps internal secrets out of the client error and application log", () => {
    const secret = "password=secret token=jwt dbUrl=postgres://private answerOptionId=option-1";
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const output = capture(new Error(secret));

    expect(output.status).toBe(500);
    expect(output.body).toEqual({ statusCode: 500, code: "INTERNAL_ERROR", message: "Lỗi hệ thống" });
    expect(JSON.stringify([output.body, log.mock.calls])).not.toContain(secret);
    expect(JSON.stringify([output.body, log.mock.calls])).not.toMatch(/password|token|postgres:|answerOptionId/i);
  });

  it("never forwards a 5xx HttpException message", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(capture(new HttpException("stack at db.ts:12", 500)).body).toEqual({
      statusCode: 500, code: "INTERNAL_ERROR", message: "Lỗi hệ thống",
    });
  });
});

describe("stable error envelope", () => {
  afterEach(() => vi.restoreAllMocks());

  it("keeps route-specific codes from object responses", () => {
    expect(toErrorBody(new NotFoundException({ code: "EVIDENCE_NOT_FOUND", message: "Không tìm thấy bản ghi" }))).toEqual({
      statusCode: 404, code: "EVIDENCE_NOT_FOUND", message: "Không tìm thấy bản ghi",
    });
    expect(toErrorBody(new ConflictException({ code: "IDEMPOTENCY_KEY_REUSED", message: "x", details: { field: "key" } }))).toEqual({
      statusCode: 409, code: "IDEMPOTENCY_KEY_REUSED", message: "x", details: { field: "key" },
    });
  });

  it("maps string HttpExceptions to the fallback code of their status", () => {
    expect(toErrorBody(new BadRequestException("Sai"))).toMatchObject({ statusCode: 400, code: "VALIDATION_FAILED", message: "Sai" });
    expect(toErrorBody(new UnauthorizedException())).toMatchObject({ statusCode: 401, code: "UNAUTHENTICATED" });
    expect(toErrorBody(new ForbiddenException("Không"))).toMatchObject({ statusCode: 403, code: "FORBIDDEN", message: "Không" });
    expect(toErrorBody(new HttpException("Chậm lại", 429))).toMatchObject({ statusCode: 429, code: "RATE_LIMITED", message: "Chậm lại" });
  });

  it("rejects malformed codes rather than echoing them", () => {
    expect(toErrorBody(new BadRequestException({ code: "drop table", message: "m" })).code).toBe("VALIDATION_FAILED");
  });

  it("maps Zod issues to a validation code with safe details", () => {
    const parsed = z.object({ name: z.string() }).safeParse({});
    const body = toErrorBody(parsed.error);
    expect(body).toMatchObject({ statusCode: 400, code: "VALIDATION_FAILED" });
    expect(body.message).toContain("name");
    expect(body.details).toEqual([{ path: "name", message: expect.any(String) }]);
  });

  it("maps Prisma conflict, missing and connectivity errors without internals", () => {
    expect(toErrorBody({ code: "P2002", meta: { target: ["email"] } })).toEqual({ statusCode: 409, code: "CONFLICT", message: "Dữ liệu đã tồn tại" });
    expect(toErrorBody({ code: "P2025" })).toEqual({ statusCode: 404, code: "NOT_FOUND", message: "Không tìm thấy dữ liệu" });
    const unreachable = toErrorBody({ code: "P1001", message: "Can't reach database server at db.internal:5432" });
    expect(unreachable).toMatchObject({ statusCode: 503, code: "DEPENDENCY_FAILURE" });
    expect(JSON.stringify(unreachable)).not.toContain("db.internal");
  });
});
