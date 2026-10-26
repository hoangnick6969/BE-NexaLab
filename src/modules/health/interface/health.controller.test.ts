import { afterEach, describe, expect, it, vi } from "vitest";
import { Errors } from "../../../common/errors";
import { DATABASE_PROBE_TIMEOUT_MS, HealthController } from "./health.controller";

const controller = (query: () => Promise<unknown>) => new HealthController({ $queryRaw: query } as any);

function toResponse(error: unknown) {
  const output: { status?: number; body?: any } = {};
  const response = {
    status(code: number) { output.status = code; return this; },
    json(body: unknown) { output.body = body; return this; },
  };
  new Errors().catch(error, { switchToHttp: () => ({ getResponse: () => response }) } as any);
  return output;
}

describe("GET /health", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("reports ok only after the database answers", async () => {
    const result = await controller(async () => [{ "?column?": 1 }]).health();
    expect(result).toMatchObject({ status: "ok", database: "up" });
  });

  it("returns 503 DATABASE_UNAVAILABLE without leaking the connection error", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const failure = Object.assign(new Error("Can't reach database server at postgres://user:secret@db:5432"), { code: "P1001" });
    const error = await controller(() => Promise.reject(failure)).health().catch((caught) => caught);
    const output = toResponse(error);
    expect(output.status).toBe(503);
    expect(output.body).toEqual({ statusCode: 503, code: "DATABASE_UNAVAILABLE", message: "Cơ sở dữ liệu không phản hồi", details: { database: "down" } });
    expect(JSON.stringify(output.body)).not.toContain("secret");
  });

  it("gives up on a hanging database after the probe timeout", async () => {
    vi.useFakeTimers();
    vi.spyOn(console, "error").mockImplementation(() => {});
    const pending = controller(() => new Promise(() => {})).health().catch((caught) => caught);
    await vi.advanceTimersByTimeAsync(DATABASE_PROBE_TIMEOUT_MS);
    expect(toResponse(await pending).status).toBe(503);
  });
});
