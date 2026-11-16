// Perf review 2026-11-16 item 11: a small in-process cache for responses that are the same for every caller
// (no role, user or class in the result). Concurrent misses share one load. Trade-off: a change becomes visible after
// at most the TTL on each instance. CATALOG_CACHE_TTL_MS=0 turns it off (default under vitest).
type Entry = { until: number; value: Promise<unknown> };
const entries = new Map<string, Entry>();

export function sharedCacheTtlMs(): number {
  const raw = process.env.CATALOG_CACHE_TTL_MS;
  if (raw !== undefined && raw !== "") {
    const value = Number(raw);
    return Number.isFinite(value) && value > 0 ? value : 0;
  }
  return process.env.VITEST ? 0 : 60_000;
}

export function sharedCached<T>(key: string, load: () => Promise<T>, now = Date.now()): Promise<T> {
  const ttl = sharedCacheTtlMs();
  if (!ttl) return load();
  const hit = entries.get(key);
  if (hit && hit.until > now) return hit.value as Promise<T>;
  const value = load();
  entries.set(key, { until: now + ttl, value });
  // A failed load is not kept.
  value.catch(() => { if (entries.get(key)?.value === value) entries.delete(key); });
  return value;
}

export function clearSharedCache(key?: string) {
  if (key) entries.delete(key);
  else entries.clear();
}
