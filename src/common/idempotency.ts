import { jwtSecret } from "./jwt-secret";
import { BadRequestException, ConflictException } from "@nestjs/common";
import { createHmac } from "node:crypto";

/**
 * `Idempotency-Key` support for retryable mutations. The same key and payload
 * replays the stored result; the same key with a different payload or route
 * is a 409 `IDEMPOTENCY_KEY_REUSED`. The key is claimed inside the mutation
 * transaction, so a concurrent duplicate waits on the unique index and then
 * replays instead of applying the side effect twice.
 */
const KEY_PATTERN = /^[A-Za-z0-9_-]{8,128}$/;
const TTL_MS = 24 * 3600_000;

export function readIdempotencyKey(req: any): string | null {
  const raw = req.headers?.["idempotency-key"];
  if (raw === undefined) return null;
  const key = Array.isArray(raw) ? raw[0] : raw;
  if (typeof key !== "string" || !KEY_PATTERN.test(key))
    throw new BadRequestException({
      code: "IDEMPOTENCY_KEY_INVALID",
      message: "Idempotency-Key phải gồm 8–128 ký tự chữ, số, gạch ngang hoặc gạch dưới",
    });
  return key;
}

export function stableStringify(value: unknown): string {
  if (value === undefined) return "null";
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return "[" + value.map(stableStringify).join(",") + "]";
  return (
    "{" +
    Object.keys(value as Record<string, unknown>)
      .filter((key) => (value as any)[key] !== undefined)
      .sort()
      .map((key) => JSON.stringify(key) + ":" + stableStringify((value as any)[key]))
      .join(",") +
    "}"
  );
}

/** Keyed so a stored request hash cannot be used to guess a submitted secret. */
export function requestHash(scope: string, payload: unknown) {
  const secret = jwtSecret();
  return createHmac("sha256", secret).update(scope + "\n" + stableStringify(payload)).digest("hex");
}

const reused = () =>
  new ConflictException({
    code: "IDEMPOTENCY_KEY_REUSED",
    message: "Khóa gửi lại đã được dùng cho nội dung khác",
  });

export type IdempotencyContext = {
  actorId: string;
  key: string | null;
  scope: string;
  payload: unknown;
};

/** Returns the stored result for a completed identical request, or null. */
export async function replay(db: any, ctx: IdempotencyContext) {
  if (!ctx.key) return null;
  const record = await db.idempotencyRecord.findUnique({
    where: { actorId_key: { actorId: ctx.actorId, key: ctx.key } },
  });
  if (!record) return null;
  if (record.scope !== ctx.scope || record.requestHash !== requestHash(ctx.scope, ctx.payload)) throw reused();
  return record.response;
}

/**
 * Interactive transaction limits. Prisma's defaults (2 s to start, 5 s to run) fail with P2028 on a
 * remote pooled database, where a write with its audit row and notifications (acc-3) takes ~10 round trips.
 */
export const TX_LIMITS = { maxWait: 10_000, timeout: 15_000 };

/**
 * Runs `work` in one transaction with the idempotency claim. `stored` lets a
 * caller keep one-time secrets (for example a temporary password) out of the
 * persisted replay body.
 */
export async function idempotent<T>(
  db: any,
  ctx: IdempotencyContext,
  work: (tx: any) => Promise<T>,
  options: { stored?: (result: T) => unknown; isolationLevel?: "Serializable" } = {},
): Promise<T> {
  const normalize = (value: unknown) => JSON.parse(JSON.stringify(value ?? null));
  const txOptions = { ...TX_LIMITS, ...(options.isolationLevel ? { isolationLevel: options.isolationLevel } : {}) };
  if (!ctx.key) return normalize(await db.$transaction(work, txOptions));
  const hash = requestHash(ctx.scope, ctx.payload);
  try {
    return await db.$transaction(
      async (tx: any) => {
        const previous = await replay(tx, ctx);
        if (previous !== null) return previous;
        await tx.idempotencyRecord.create({
          data: {
            actorId: ctx.actorId,
            key: ctx.key,
            scope: ctx.scope,
            requestHash: hash,
            expiresAt: new Date(Date.now() + TTL_MS),
          },
        });
        const result = normalize(await work(tx));
        await tx.idempotencyRecord.update({
          where: { actorId_key: { actorId: ctx.actorId, key: ctx.key } },
          data: { response: normalize(options.stored ? options.stored(result) : result) },
        });
        return result;
      },
      txOptions,
    );
  } catch (error) {
    if ((error as any)?.code !== "P2002" && (error as any)?.code !== "P2034") throw error;
    // A concurrent request with the same key committed first.
    const previous = await replay(db, ctx);
    if (previous === null) throw error;
    return previous;
  }
}
