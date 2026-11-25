/**
 * TAI-05 ledger primitives (ledger-rules.md). Append-only, double-entry style: every `CreditTransaction` has entries
 * whose signed integer amounts sum to zero, and the cached `CreditAccount.balance` is a projection updated in the same
 * transaction. Nothing here updates or deletes a transaction or an entry.
 */
export type CreditTxKind = "GRANT" | "ADJUST" | "RESERVE" | "SETTLE" | "REFUND";
export type CreditAccountKind = "TEACHER_AVAILABLE" | "TEACHER_RESERVED" | "SYSTEM_ISSUANCE" | "SYSTEM_CONSUMED";
export type AccountRef = { id: string; kind: CreditAccountKind };
export type LedgerEntry = { account: AccountRef; amount: number };

export const SYSTEM_KINDS: readonly CreditAccountKind[] = ["SYSTEM_ISSUANCE", "SYSTEM_CONSUMED"];
const INT32_MAX = 2_147_483_647;
export const isTeacherKind = (kind: CreditAccountKind) => !SYSTEM_KINDS.includes(kind);

export type LedgerErrorCode = "UNBALANCED" | "INVALID_AMOUNT" | "DUPLICATE_POSTING" | "INSUFFICIENT_BALANCE" | "REASON_REQUIRED";

/** Internal ledger failure; routes map it to an HTTP error (402/409) where it is a teacher-facing condition. */
export class LedgerError extends Error {
  constructor(
    readonly code: LedgerErrorCode,
    message: string,
    readonly detail?: { accountId?: string; kind?: CreditAccountKind },
  ) {
    super(message);
    this.name = "LedgerError";
  }
}

/** Throws UNBALANCED unless the signed integer amounts sum to zero; INVALID_AMOUNT for a non-integer or out-of-range amount. */
export function assertBalanced(entries: ReadonlyArray<{ amount: number }>) {
  let sum = 0;
  for (const entry of entries) {
    if (!Number.isInteger(entry.amount) || Math.abs(entry.amount) > INT32_MAX) throw new LedgerError("INVALID_AMOUNT", "A ledger amount must be a 32-bit integer");
    sum += entry.amount;
  }
  if (sum !== 0) throw new LedgerError("UNBALANCED", `Ledger entries sum to ${sum}, not zero`);
}

const uniqueViolation = (error: unknown) => (error as { code?: string } | null)?.code === "P2002";

/**
 * Finds or lazily creates one account. Teacher accounts are unique on (kind, ownerId); the two system accounts are
 * singletons guarded by a partial unique index (migration). The insert is `createMany({ skipDuplicates })`, which is
 * INSERT ... ON CONFLICT DO NOTHING, so a concurrent creator never aborts the surrounding transaction.
 */
export async function getAccount(tx: any, kind: CreditAccountKind, ownerId: string | null): Promise<AccountRef & { balance: number }> {
  const select = { id: true, kind: true, balance: true };
  const existing = await tx.creditAccount.findFirst({ where: { kind, ownerId }, select });
  if (existing) return existing;
  await tx.creditAccount.createMany({ data: [{ kind, ownerId }], skipDuplicates: true });
  return tx.creditAccount.findFirst({ where: { kind, ownerId }, select });
}

/** Seeds both system accounts idempotently (safe to call on every boot and inside any posting transaction). */
export async function ensureSystemAccounts(db: any) {
  const [issuance, consumed] = [await getAccount(db, "SYSTEM_ISSUANCE", null), await getAccount(db, "SYSTEM_CONSUMED", null)];
  return { issuance, consumed };
}

export async function teacherAccounts(tx: any, teacherId: string) {
  const available = await getAccount(tx, "TEACHER_AVAILABLE", teacherId);
  const reserved = await getAccount(tx, "TEACHER_RESERVED", teacherId);
  return { available, reserved };
}

export type PostInput = {
  kind: CreditTxKind;
  entries: LedgerEntry[];
  aiJobId?: string | null;
  pricingVersionId?: string | null;
  actorId?: string | null;
  reason?: string | null;
  idempotencyKey?: string | null;
  systemKey?: string | null;
};

/**
 * Posts one transaction atomically with its balance projections:
 * 1. asserts the zero sum before any write (a non-zero posting never touches the database);
 * 2. refuses a second posting of the same kind for one job (`aiJobId`, `kind`), backed by a unique index;
 * 3. applies each entry to its account in account-id order (a fixed order, so concurrent postings cannot deadlock);
 *    a negative amount on a teacher account is a conditional decrement (`balance >= amount`), so a teacher balance
 *    can never go negative even without a lock, and the DB CHECK is the last defence;
 * 4. inserts the immutable header and entries. GRANT and ADJUST require a reason.
 * Zero amounts are not stored as entries.
 */
export async function post(tx: any, input: PostInput): Promise<{ id: string }> {
  assertBalanced(input.entries);
  if ((input.kind === "GRANT" || input.kind === "ADJUST") && !input.reason?.trim()) throw new LedgerError("REASON_REQUIRED", "GRANT and ADJUST need a reason");
  if (input.aiJobId) {
    const duplicate = await tx.creditTransaction.findFirst({ where: { aiJobId: input.aiJobId, kind: input.kind }, select: { id: true } });
    if (duplicate) throw new LedgerError("DUPLICATE_POSTING", `Job ${input.aiJobId} already has a ${input.kind}`);
  }
  const entries = input.entries.filter((entry) => entry.amount !== 0).sort((a, b) => (a.account.id < b.account.id ? -1 : a.account.id > b.account.id ? 1 : 0));
  for (const entry of entries) {
    if (entry.amount < 0 && isTeacherKind(entry.account.kind)) {
      const result = await tx.creditAccount.updateMany({
        where: { id: entry.account.id, balance: { gte: -entry.amount } },
        data: { balance: { increment: entry.amount } },
      });
      if (result.count !== 1) throw new LedgerError("INSUFFICIENT_BALANCE", "The account balance is lower than the debit", { accountId: entry.account.id, kind: entry.account.kind });
    } else {
      await tx.creditAccount.update({ where: { id: entry.account.id }, data: { balance: { increment: entry.amount } } });
    }
  }
  let header: { id: string };
  try {
    header = await tx.creditTransaction.create({
      data: {
        kind: input.kind,
        aiJobId: input.aiJobId ?? null,
        pricingVersionId: input.pricingVersionId ?? null,
        actorId: input.actorId ?? null,
        reason: input.reason ?? null,
        idempotencyKey: input.idempotencyKey ?? null,
        systemKey: input.systemKey ?? null,
      },
      select: { id: true },
    });
  } catch (error) {
    if (uniqueViolation(error) && (input.aiJobId || input.systemKey)) throw new LedgerError("DUPLICATE_POSTING", `Duplicate ${input.kind} posting`);
    throw error;
  }
  if (entries.length > 0)
    await tx.creditEntry.createMany({ data: entries.map((entry) => ({ transactionId: header.id, accountId: entry.account.id, amount: entry.amount })) });
  return header;
}
