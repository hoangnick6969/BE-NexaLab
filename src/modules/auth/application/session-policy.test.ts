import { describe, expect, it } from "vitest";
import { readRemember, refreshCookieOptions, REMEMBER_MS, SESSION_MS, sessionExpiry } from "./session-policy";

describe("remember-me session policy (D-ACC-01)", () => {
  it("keeps a 30-day session only when asked", () => {
    expect(sessionExpiry(true, 0).getTime()).toBe(30 * 86400000);
    expect(sessionExpiry(false, 0).getTime()).toBe(12 * 3600000);
    expect(REMEMBER_MS).toBeGreaterThan(SESSION_MS);
  });

  it("makes the refresh cookie persistent only for remember-me", () => {
    expect(refreshCookieOptions(true, true)).toEqual({ httpOnly: true, secure: true, sameSite: "strict", path: "/api/auth", maxAge: REMEMBER_MS });
    expect(refreshCookieOptions(false, false)).not.toHaveProperty("maxAge");
    expect(refreshCookieOptions(false, false)).toMatchObject({ httpOnly: true, sameSite: "strict", path: "/api/auth" });
  });

  it("treats a missing or malformed flag as a short session", () => {
    expect(readRemember({ email: "a@b.c", remember: true })).toBe(true);
    expect(readRemember({ remember: false })).toBe(false);
    expect(readRemember({ remember: "on" })).toBe(false);
    expect(readRemember({})).toBe(false);
    expect(readRemember(undefined)).toBe(false);
  });
});
