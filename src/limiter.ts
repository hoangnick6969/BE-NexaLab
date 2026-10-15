import { createHash } from "node:crypto";

/**
 * Shared expiring limiter backed by PostgreSQL (`RateLimitBucket`), so every
 * API instance sees the same counters. Keys are sha256 digests; raw IPs and
 * account IDs are never stored.
 */
export type LimitRule = { limit: number; windowMs: number; lockMs: number };
export type Bucket = { count: number; windowStart: Date; lockedUntil: Date | null };

const MINUTE = 60_000;
/** B1-T3 join limits (SPEC "Join throttling"). */
export const JOIN_LIMITS = {
  pair: { limit: 10, windowMs: 10 * MINUTE, lockMs: 15 * MINUTE },
  account: { limit: 20, windowMs: 10 * MINUTE, lockMs: 30 * MINUTE },
  locatorIp: { limit: 30, windowMs: 10 * MINUTE, lockMs: 15 * MINUTE },
  endpointIp: { limit: 60, windowMs: 10 * MINUTE, lockMs: 15 * MINUTE },
} satisfies Record<string, LimitRule>;

export const limiterKey = (...parts: string[]) =>
  createHash("sha256").update(parts.join("\u0000")).digest("hex");

export function isLocked(bucket: Bucket | null | undefined, now: Date) {
  return Boolean(bucket?.lockedUntil && bucket.lockedUntil > now);
}

/** Pure transition for one counted event; the lock starts on the `limit`-th event. */
export function nextBucket(previous: Bucket | null | undefined, now: Date, rule: LimitRule): Bucket {
  const expiredWindow = !previous || previous.windowStart.getTime() + rule.windowMs <= now.getTime();
  const expiredLock = Boolean(previous?.lockedUntil && previous.lockedUntil <= now);
  if (isLocked(previous, now)) return previous!;
  const fresh = expiredWindow || expiredLock;
  const count = fresh ? 1 : previous!.count + 1;
  return {
    count,
    windowStart: fresh ? now : previous!.windowStart,
    lockedUntil: count >= rule.limit ? new Date(now.getTime() + rule.lockMs) : null,
  };
}

export async function lockedAny(db: any, keys: string[], now = new Date()) {
  const rows = await db.rateLimitBucket.findMany({
    where: { key: { in: keys }, lockedUntil: { gt: now } },
    select: { key: true },
  });
  return rows.length > 0;
}

/** Counts one event against each key atomically (row lock per key). */
export async function hit(db: any, entries: Array<{ key: string; rule: LimitRule }>, now = new Date()) {
  await db.$transaction(async (tx: any) => {
    for (const { key, rule } of [...entries].sort((a, b) => a.key.localeCompare(b.key))) {
      await tx.$executeRaw`INSERT INTO "RateLimitBucket" ("key", "count", "windowStart", "expiresAt") VALUES (${key}, 0, ${now}, ${now}) ON CONFLICT ("key") DO NOTHING`;
      const [row] = await tx.$queryRaw<Bucket[]>`SELECT "count", "windowStart", "lockedUntil" FROM "RateLimitBucket" WHERE "key" = ${key} FOR UPDATE`;
      const next = nextBucket(row.count === 0 ? null : row, now, rule);
      const expiresAt = new Date(
        Math.max(next.windowStart.getTime() + rule.windowMs, next.lockedUntil?.getTime() ?? 0),
      );
      await tx.rateLimitBucket.update({
        where: { key },
        data: { count: next.count, windowStart: next.windowStart, lockedUntil: next.lockedUntil, expiresAt },
      });
    }
  });
}

export async function clear(db: any, keys: string[]) {
  await db.rateLimitBucket.deleteMany({ where: { key: { in: keys } } });
}

/** Opportunistic cleanup; expired rows carry no state. */
export async function sweep(db: any, now = new Date()) {
  await db.rateLimitBucket.deleteMany({ where: { expiresAt: { lt: now } } });
}
