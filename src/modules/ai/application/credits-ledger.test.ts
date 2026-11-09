import { describe, expect, it } from "vitest";
import { assertBalanced, ensureSystemAccounts, getAccount, LedgerError, post, teacherAccounts } from "./credits-ledger";
import { makeCreditsStore, type Row } from "./credits-test-kit";

/** TAI5-T1: posting primitives. Postgres-level proofs (CHECK, partial unique, triggers) are in scripts/tai05-integration.mjs. */
const rejects = async (promise: Promise<unknown>, code: string) => {
  const error = await promise.then(() => null, (e) => e);
  expect(error).toBeInstanceOf(LedgerError);
  expect(error.code).toBe(code);
};

async function seeded(serialize = true) {
  const db = makeCreditsStore({ serialize });
  const { issuance } = await ensureSystemAccounts(db);
  const { available, reserved } = await teacherAccounts(db, "t1");
  return { db, issuance, available, reserved };
}
const balance = (db: any, id: string) => db.creditAccount.rows.find((r: Row) => r.id === id).balance;

describe("assertBalanced", () => {
  it("accepts a zero sum and rejects anything else, non-integers and 32-bit overflow", () => {
    expect(() => assertBalanced([{ amount: -5 }, { amount: 5 }])).not.toThrow();
    expect(() => assertBalanced([])).not.toThrow();
    expect(() => assertBalanced([{ amount: -5 }, { amount: 4 }])).toThrow(/sum to -1/);
    expect(() => assertBalanced([{ amount: 1.5 }, { amount: -1.5 }])).toThrow(LedgerError);
    expect(() => assertBalanced([{ amount: 2 ** 31 }, { amount: -(2 ** 31) }])).toThrow(LedgerError);
  });
});

describe("post", () => {
  it("rejects a non-zero-sum posting before any write", async () => {
    const { db, issuance, available } = await seeded();
    await rejects(post(db, { kind: "GRANT", reason: "pilot grant", entries: [{ account: issuance, amount: -10 }, { account: available, amount: 9 }] }), "UNBALANCED");
    expect(db.creditTransaction.rows).toHaveLength(0);
    expect(balance(db, available.id)).toBe(0);
    expect(balance(db, issuance.id)).toBe(0);
  });

  it("posts a grant: header, entries and cached balances move together", async () => {
    const { db, issuance, available } = await seeded();
    await post(db, { kind: "GRANT", actorId: "admin", reason: "pilot grant", entries: [{ account: issuance, amount: -100 }, { account: available, amount: 100 }] });
    expect(balance(db, available.id)).toBe(100);
    expect(balance(db, issuance.id)).toBe(-100);
    expect(db.creditEntry.rows.map((e: Row) => e.amount).sort((a: number, b: number) => a - b)).toEqual([-100, 100]);
  });

  it("requires a reason for GRANT and ADJUST", async () => {
    const { db, issuance, available } = await seeded();
    await rejects(post(db, { kind: "GRANT", reason: "  ", entries: [{ account: issuance, amount: -1 }, { account: available, amount: 1 }] }), "REASON_REQUIRED");
    await rejects(post(db, { kind: "ADJUST", entries: [{ account: issuance, amount: -1 }, { account: available, amount: 1 }] }), "REASON_REQUIRED");
  });

  it("rejects a debit that would make a teacher balance negative and leaves everything untouched", async () => {
    const { db, issuance, available, reserved } = await seeded();
    await post(db, { kind: "GRANT", reason: "pilot grant", entries: [{ account: issuance, amount: -5 }, { account: available, amount: 5 }] });
    const before = db.creditTransaction.rows.length;
    await rejects(post(db, { kind: "RESERVE", aiJobId: "job-1", entries: [{ account: available, amount: -6 }, { account: reserved, amount: 6 }] }), "INSUFFICIENT_BALANCE");
    expect(balance(db, available.id)).toBe(5);
    expect(balance(db, reserved.id)).toBe(0);
    expect(db.creditTransaction.rows).toHaveLength(before);
  });

  it("lets the system accounts go negative (issuance means credits issued)", async () => {
    const { db, issuance, available } = await seeded();
    await post(db, { kind: "GRANT", reason: "pilot grant", entries: [{ account: issuance, amount: -50 }, { account: available, amount: 50 }] });
    expect(balance(db, issuance.id)).toBe(-50);
  });

  it("rejects a duplicate (aiJobId, kind): a second posting of the same kind for one job", async () => {
    const { db, issuance, available, reserved } = await seeded();
    await post(db, { kind: "GRANT", reason: "pilot grant", entries: [{ account: issuance, amount: -20 }, { account: available, amount: 20 }] });
    const reserve = { kind: "RESERVE" as const, aiJobId: "job-1", entries: [{ account: available, amount: -4 }, { account: reserved, amount: 4 }] };
    await post(db, reserve);
    await rejects(post(db, reserve), "DUPLICATE_POSTING");
    expect(balance(db, available.id)).toBe(16);
    expect(db.creditTransaction.rows.filter((t: Row) => t.kind === "RESERVE")).toHaveLength(1);
  });

  it("the unique index catches a duplicate that slips past the existence check (race)", async () => {
    const { db, available, reserved } = await seeded();
    db.creditTransaction.rows.push({ id: "pre", kind: "RESERVE", aiJobId: "job-9", createdAt: new Date() });
    const real = db.creditTransaction.findFirst;
    db.creditTransaction.findFirst = async () => null; // the check misses; the insert then hits P2002
    await rejects(post(db, { kind: "RESERVE", aiJobId: "job-9", entries: [{ account: available, amount: 0 }, { account: reserved, amount: 0 }] }), "DUPLICATE_POSTING");
    db.creditTransaction.findFirst = real;
  });

  it("seeds the system accounts idempotently and creates a teacher account once", async () => {
    const db = makeCreditsStore();
    const a = await ensureSystemAccounts(db);
    const b = await ensureSystemAccounts(db);
    expect(b.issuance.id).toBe(a.issuance.id);
    expect(b.consumed.id).toBe(a.consumed.id);
    expect(db.creditAccount.rows).toHaveLength(2);
    expect(await getAccount(db, "TEACHER_AVAILABLE", "t9")).toMatchObject({ kind: "TEACHER_AVAILABLE", balance: 0 });
    expect(await getAccount(db, "TEACHER_AVAILABLE", "t9")).toMatchObject({ kind: "TEACHER_AVAILABLE" });
    expect(db.creditAccount.rows.filter((r: Row) => r.ownerId === "t9")).toHaveLength(1);
  });

  it("two interleaved debits at the boundary cannot both succeed, even without any lock", async () => {
    const { db, issuance, available, reserved } = await seeded(false);
    await post(db, { kind: "GRANT", reason: "pilot grant", entries: [{ account: issuance, amount: -10 }, { account: available, amount: 10 }] });
    const reserve = (jobId: string) => post(db, { kind: "RESERVE", aiJobId: jobId, entries: [{ account: available, amount: -7 }, { account: reserved, amount: 7 }] });
    const results = await Promise.allSettled([reserve("a"), reserve("b"), reserve("c")]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(balance(db, available.id)).toBe(3);
    expect(balance(db, reserved.id)).toBe(7);
  });
});
