import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthGuard } from "./auth";
import { sign } from "jsonwebtoken";

describe("AuthGuard", () => {
  beforeEach(() => {
    process.env.JWT_SECRET = "auth-test-secret-with-at-least-32-characters";
  });

  it("validates the session and user in one database query", async () => {
    const findFirst = vi.fn().mockResolvedValue({
      user: { role: "STUDENT", status: "active", mustChangePassword: false, grade: 9 },
    });
    const reflector = {
      getAllAndOverride: vi.fn((key: string) => (key === "public" ? false : ["STUDENT"])),
    };
    const jwt = sign({ sub: "student-1", role: "STUDENT", sid: "session-1" }, process.env.JWT_SECRET!, {
      issuer: "nexalab",
      expiresIn: "15m",
    });
    const request: any = {
      headers: { authorization: `Bearer ${jwt}` },
      path: "/api/me/progress",
    };
    const context = {
      getHandler: () => "handler",
      getClass: () => "controller",
      switchToHttp: () => ({ getRequest: () => request }),
    };

    const allowed = await new AuthGuard(reflector as any, { session: { findFirst } } as any).canActivate(context as any);

    expect(allowed).toBe(true);
    expect(findFirst).toHaveBeenCalledOnce();
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: "session-1", userId: "student-1", kind: "refresh" }),
        select: { expiresAt: true, user: { select: { role: true, status: true, mustChangePassword: true, grade: true } } },
      }),
    );
    expect(request.user.role).toBe("STUDENT");
    expect(request.user.grade).toBe(9);
  });
});

// Mandatory password changes are enforced against current database state, even
// for a token issued before a teacher reset the account.
describe("AuthGuard temporary password", () => {
  it.each(["/api/me/progress", "/api/classes", "/api/assignments"])('blocks protected content at %s', async (path) => {
    process.env.JWT_SECRET = "auth-test-secret-with-at-least-32-characters";
    const guard = temporaryGuard(path);
    await expect(guard.activate()).rejects.toMatchObject({ response: { code: "PASSWORD_CHANGE_REQUIRED" } });
  });

  it.each(["/api/auth/me", "/api/auth/password", "/api/auth/logout"])('allows recovery endpoint %s', async (path) => {
    process.env.JWT_SECRET = "auth-test-secret-with-at-least-32-characters";
    expect(await temporaryGuard(path).activate()).toBe(true);
  });
});

function temporaryGuard(path: string) {
  const reflector = { getAllAndOverride: vi.fn(() => false) };
  const db = { session: { findFirst: vi.fn().mockResolvedValue({ user: { role: "STUDENT", status: "active", mustChangePassword: true, grade: 8 } }) } };
  const jwt = sign({ sub: "student-1", sid: "session-1" }, process.env.JWT_SECRET!, { issuer: "nexalab", expiresIn: "15m" });
  const request = { headers: { authorization: `Bearer ${jwt}` }, path };
  const context = { getHandler: () => "handler", getClass: () => "controller", switchToHttp: () => ({ getRequest: () => request }) };
  return { activate: () => new AuthGuard(reflector as any, db as any).canActivate(context as any) };
}
