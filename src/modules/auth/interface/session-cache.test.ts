import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sign } from "jsonwebtoken";
import { AuthGuard } from "./auth";
import { clearSessionCache, forgetSession, forgetUser, readSession, rememberSession } from "./session-cache";

const user = { role: "STUDENT", status: "active", mustChangePassword: false, grade: 8 };

describe("session cache (perf review item 10)", () => {
  beforeEach(() => {
    process.env.SESSION_CACHE_TTL_MS = "15000";
    process.env.JWT_SECRET = "auth-test-secret-with-at-least-32-characters";
    clearSessionCache();
  });
  afterEach(() => {
    delete process.env.SESSION_CACHE_TTL_MS;
    clearSessionCache();
  });

  it("expires after the TTL and never outlives the session", () => {
    const now = 1_000_000;
    rememberSession("s1", "u1", user, new Date(now + 60_000), now);
    expect(readSession("s1", "u1", now + 14_999)).toEqual(user);
    expect(readSession("s1", "u1", now + 15_000)).toBeUndefined();
    rememberSession("s2", "u1", user, new Date(now + 5_000), now);
    expect(readSession("s2", "u1", now + 5_000)).toBeUndefined();
  });

  it("is keyed to the token owner and cleared by forgetSession/forgetUser", () => {
    const later = new Date(Date.now() + 60_000);
    rememberSession("s1", "u1", user, later);
    rememberSession("s2", "u1", user, later);
    rememberSession("s3", "u2", user, later);
    expect(readSession("s1", "someone-else")).toBeUndefined();
    rememberSession("s1", "u1", user, later);
    forgetSession("s1");
    expect(readSession("s1", "u1")).toBeUndefined();
    forgetUser("u1");
    expect(readSession("s2", "u1")).toBeUndefined();
    expect(readSession("s3", "u2")).toEqual(user);
  });

  it("is off when SESSION_CACHE_TTL_MS=0", () => {
    process.env.SESSION_CACHE_TTL_MS = "0";
    rememberSession("s1", "u1", user, new Date(Date.now() + 60_000));
    expect(readSession("s1", "u1")).toBeUndefined();
  });

  it("AuthGuard reuses the cached lookup and asks the database again after forgetUser", async () => {
    const findFirst = vi.fn().mockResolvedValue({ expiresAt: new Date(Date.now() + 3_600_000), user });
    const reflector = { getAllAndOverride: vi.fn((key: string) => (key === "public" ? false : undefined)) };
    const jwt = sign({ sub: "u1", role: "STUDENT", sid: "s1" }, process.env.JWT_SECRET!, { issuer: "nexalab", expiresIn: "15m" });
    const run = () => {
      const request: any = { headers: { authorization: `Bearer ${jwt}` }, path: "/api/me/progress" };
      const context = { getHandler: () => "h", getClass: () => "c", switchToHttp: () => ({ getRequest: () => request }) };
      return new AuthGuard(reflector as any, { session: { findFirst } } as any).canActivate(context as any).then(() => request.user);
    };
    expect((await run()).grade).toBe(8);
    expect((await run()).grade).toBe(8);
    expect(findFirst).toHaveBeenCalledTimes(1);
    forgetUser("u1");
    findFirst.mockResolvedValueOnce({ expiresAt: new Date(Date.now() + 3_600_000), user: { ...user, status: "disabled" } });
    await expect(run()).rejects.toThrow("Tài khoản đã bị khóa");
    expect(findFirst).toHaveBeenCalledTimes(2);
  });
});
