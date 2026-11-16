// Perf review 2026-11-16 item 10: AuthGuard looked up the session row on every request (one round trip to the remote
// database). The result is cached per session id for a short TTL. Trade-off: on another instance a revoked session,
// a disabled account or a role/grade change takes effect after at most the TTL; on this instance the revocation paths
// call forgetUser/forgetSession and take effect at once. SESSION_CACHE_TTL_MS=0 turns the cache off (default under vitest).
export type CachedSessionUser = { role: string; status: string; mustChangePassword: boolean; grade: number | null };
type Entry = { userId: string; user: CachedSessionUser; until: number };

const MAX_ENTRIES = 10_000;
const entries = new Map<string, Entry>();

export function sessionCacheTtlMs(): number {
  const raw = process.env.SESSION_CACHE_TTL_MS;
  if (raw !== undefined && raw !== "") {
    const value = Number(raw);
    return Number.isFinite(value) && value > 0 ? value : 0;
  }
  return process.env.VITEST ? 0 : 15_000;
}

export function readSession(sid: string, userId: string, now = Date.now()): CachedSessionUser | undefined {
  const entry = entries.get(sid);
  if (!entry) return undefined;
  if (entry.until <= now || entry.userId !== userId) {
    entries.delete(sid);
    return undefined;
  }
  return entry.user;
}

/** Caches until min(now + TTL, session expiry). */
export function rememberSession(sid: string, userId: string, user: CachedSessionUser, sessionExpiresAt: Date, now = Date.now()) {
  const ttl = sessionCacheTtlMs();
  if (!ttl) return;
  if (entries.size >= MAX_ENTRIES) entries.delete(entries.keys().next().value!);
  entries.set(sid, { userId, user, until: Math.min(now + ttl, sessionExpiresAt.getTime()) });
}

export function forgetSession(sid: string) {
  entries.delete(sid);
}

export function forgetUser(userId: string) {
  for (const [sid, entry] of entries) if (entry.userId === userId) entries.delete(sid);
}

export function clearSessionCache() {
  entries.clear();
}
