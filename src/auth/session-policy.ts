import { z } from "zod";

/**
 * Refresh-session lifetime (D-ACC-01). "Remember me" keeps a persistent cookie and a
 * 30-day server session; otherwise the cookie lives only for the browser session and
 * the server session expires 12 hours after the last refresh. Rotation keeps the choice.
 */
export const REMEMBER_MS = 30 * 86400000;
export const SESSION_MS = 12 * 3600000;

export const sessionExpiry = (remember: boolean, now = Date.now()) => new Date(now + (remember ? REMEMBER_MS : SESSION_MS));

export function refreshCookieOptions(remember: boolean, secure = process.env.NODE_ENV === "production") {
  return {
    httpOnly: true,
    secure,
    sameSite: "strict" as const,
    path: "/api/auth",
    // No maxAge makes it a browser-session cookie.
    ...(remember ? { maxAge: REMEMBER_MS } : {}),
  };
}

/** Login bodies may carry `remember`; anything else (or nothing) means a short session. */
export const readRemember = (body: unknown) => z.object({ remember: z.boolean().optional() }).safeParse(body).data?.remember ?? false;
