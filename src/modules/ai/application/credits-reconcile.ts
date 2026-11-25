/**
 * TAI-05 reconciliation (ledger-rules.md "Reconciliation"). A pure, read-only function over rows loaded by
 * `scripts/credits-reconcile.ts` (or by a test): it lists every violation with the offending IDs and never repairs
 * anything. A repair is a new ADJUST with a reason, never an edit of a posting.
 *
 * Checks 1-7 are the contract; 8-10 are added integrity checks that the same data answers:
 *   1 a transaction whose entries do not sum to zero
 *   2 an account whose cached balance differs from the sum of its entries
 *   3 a teacher account with a negative balance
 *   4 a job that carries an estimate and is terminal but lacks its RESERVE or its SETTLE/REFUND, has both, or ended
 *     with the wrong kind (SETTLE on a failed/cancelled job, REFUND on a succeeded one)
 *   5 a non-terminal job that already has SETTLE or REFUND
 *   6 a SETTLE that charged more than its reservation
 *   7 a job pinned to a price that does not exist
 *   8 a RESERVE/SETTLE/REFUND whose job does not exist (credits stranded)
 *   9 an entry that points to a missing transaction or account
 *  10 an amount mismatch between a job (estimatedCredits, chargedCredits) and its RESERVE/SETTLE entries
 */
export type ReconcileAccount = { id: string; kind: string; ownerId: string | null; balance: number };
export type ReconcileTransaction = { id: string; kind: string; aiJobId: string | null; actorId?: string | null; systemKey?: string | null };
export type ReconcileEntry = { id: string; transactionId: string; accountId: string; amount: number };
export type ReconcileJob = { id: string; status: string; estimatedCredits: number | null; chargedCredits: number | null; pricingVersionId: string | null };
export type ReconcileInput = {
  accounts: ReconcileAccount[];
  transactions: ReconcileTransaction[];
  entries: ReconcileEntry[];
  jobs: ReconcileJob[];
  pricingVersionIds: ReadonlyArray<string>;
  userIds?: ReadonlyArray<string>;
};
export type Violation = { check: number; code: string; ids: string[]; detail: string };
export type ReconcileReport = { ok: boolean; violations: Violation[]; counts: { accounts: number; transactions: number; entries: number; jobsWithCredits: number } };

const TERMINAL = new Set(["SUCCEEDED", "FAILED", "CANCELLED"]);
const TEACHER_KINDS = new Set(["TEACHER_AVAILABLE", "TEACHER_RESERVED"]);

export function reconcileCredits(input: ReconcileInput): ReconcileReport {
  const violations: Violation[] = [];
  const add = (check: number, code: string, ids: string[], detail: string) => {
    if (ids.length > 0) violations.push({ check, code, ids: [...new Set(ids)].sort(), detail });
  };
  const accountById = new Map(input.accounts.map((a) => [a.id, a]));
  const txById = new Map(input.transactions.map((t) => [t.id, t]));
  const entriesByTx = new Map<string, ReconcileEntry[]>();
  const sumByAccount = new Map<string, number>();
  for (const entry of input.entries) {
    (entriesByTx.get(entry.transactionId) ?? entriesByTx.set(entry.transactionId, []).get(entry.transactionId)!).push(entry);
    sumByAccount.set(entry.accountId, (sumByAccount.get(entry.accountId) ?? 0) + entry.amount);
  }

  // 1. every transaction balances to zero
  add(1, "UNBALANCED_TRANSACTION", input.transactions.filter((t) => (entriesByTx.get(t.id) ?? []).reduce((s, e) => s + e.amount, 0) !== 0).map((t) => t.id), "entries do not sum to zero");
  // 2. cached balance equals the sum of the entries
  add(2, "BALANCE_DRIFT", input.accounts.filter((a) => a.balance !== (sumByAccount.get(a.id) ?? 0)).map((a) => a.id), "cached balance differs from the sum of entries");
  // 3. teacher accounts never negative
  add(3, "NEGATIVE_TEACHER_BALANCE", input.accounts.filter((a) => TEACHER_KINDS.has(a.kind) && a.balance < 0).map((a) => a.id), "teacher account balance below zero");
  // 9. dangling entries
  add(9, "DANGLING_ENTRY", input.entries.filter((e) => !txById.has(e.transactionId) || !accountById.has(e.accountId)).map((e) => e.id), "entry points to a missing transaction or account");
  add(11, "INVALID_SYSTEM_POSTING", input.transactions.filter((t) => t.systemKey && (t.kind !== "GRANT" || t.actorId != null)).map((t) => t.id), "system posting must be a GRANT without an actor");
  const starters = new Map<string, string[]>();
  for (const tx of input.transactions) if (tx.systemKey?.startsWith("starter:")) {
    const owners = new Set((entriesByTx.get(tx.id) ?? []).map((entry) => accountById.get(entry.accountId)).filter((a) => a?.kind === "TEACHER_AVAILABLE").map((a) => a!.ownerId));
    for (const owner of owners) if (owner) (starters.get(owner) ?? starters.set(owner, []).get(owner)!).push(tx.id);
  }
  add(12, "DUPLICATE_STARTER", [...starters.values()].filter((ids) => ids.length > 1).flat(), "teacher has more than one starter posting");
  if (input.userIds) add(13, "MISSING_TEACHER_OWNER", input.accounts.filter((a) => TEACHER_KINDS.has(a.kind) && (!a.ownerId || !input.userIds!.includes(a.ownerId))).map((a) => a.id), "teacher account owner does not exist");

  const jobById = new Map(input.jobs.map((j) => [j.id, j]));
  const jobTx = new Map<string, Map<string, ReconcileTransaction[]>>();
  for (const t of input.transactions) {
    if (!t.aiJobId || !["RESERVE", "SETTLE", "REFUND"].includes(t.kind)) continue;
    const byKind = jobTx.get(t.aiJobId) ?? jobTx.set(t.aiJobId, new Map()).get(t.aiJobId)!;
    (byKind.get(t.kind) ?? byKind.set(t.kind, []).get(t.kind)!).push(t);
  }
  const count = (jobId: string, kind: string) => jobTx.get(jobId)?.get(kind)?.length ?? 0;
  const first = (jobId: string, kind: string) => jobTx.get(jobId)?.get(kind)?.[0];

  const missing: string[] = [];
  const noReserve: string[] = [];
  const both: string[] = [];
  const wrongKind: string[] = [];
  const earlySettle: string[] = [];
  const overCharge: string[] = [];
  const amountMismatch: string[] = [];
  const credited = input.jobs.filter((j) => j.estimatedCredits !== null);
  for (const job of credited) {
    const reserve = count(job.id, "RESERVE");
    const settle = count(job.id, "SETTLE");
    const refund = count(job.id, "REFUND");
    if (TERMINAL.has(job.status)) {
      if (reserve !== 1 || settle + refund === 0) missing.push(job.id);
      if (settle + refund > 1 || settle > 1 || refund > 1) both.push(job.id);
      if ((job.status === "SUCCEEDED" && refund > 0) || (job.status !== "SUCCEEDED" && settle > 0)) wrongKind.push(job.id);
    } else if (settle + refund > 0) earlySettle.push(job.id);
    else if (reserve !== 1) noReserve.push(job.id);

    // 6 and 10: amounts
    const reserveTx = first(job.id, "RESERVE");
    const reserved = reserveTx ? (entriesByTx.get(reserveTx.id) ?? []).filter((e) => accountById.get(e.accountId)?.kind === "TEACHER_RESERVED").reduce((s, e) => s + e.amount, 0) : null;
    if (reserved !== null && reserved !== job.estimatedCredits) amountMismatch.push(job.id);
    const settleTx = first(job.id, "SETTLE");
    if (settleTx) {
      const charged = (entriesByTx.get(settleTx.id) ?? []).filter((e) => accountById.get(e.accountId)?.kind === "SYSTEM_CONSUMED").reduce((s, e) => s + e.amount, 0);
      if (reserved !== null && charged > reserved) overCharge.push(job.id);
      if (charged > (job.estimatedCredits ?? 0)) overCharge.push(job.id);
      if (job.chargedCredits !== null && job.chargedCredits !== charged) amountMismatch.push(job.id);
    }
  }
  add(4, "TERMINAL_JOB_WITHOUT_SETTLEMENT", missing, "terminal job without exactly one RESERVE and one SETTLE or REFUND");
  add(4, "JOB_WITHOUT_RESERVE", noReserve, "job carries an estimate but has no single RESERVE")
  add(4, "JOB_SETTLED_AND_REFUNDED", both, "job has more than one closing posting");
  add(4, "JOB_WRONG_CLOSING_KIND", wrongKind, "SETTLE on a failed or cancelled job, or REFUND on a succeeded one");
  add(5, "NON_TERMINAL_JOB_SETTLED", earlySettle, "job is not terminal but has SETTLE or REFUND");
  add(6, "SETTLEMENT_ABOVE_RESERVATION", overCharge, "charge is above the reserved estimate");
  add(7, "UNKNOWN_PRICING_VERSION", credited.filter((j) => !j.pricingVersionId || !input.pricingVersionIds.includes(j.pricingVersionId)).map((j) => j.id), "job pinned to a price that does not exist");
  add(8, "POSTING_WITHOUT_JOB", [...jobTx.keys()].filter((id) => !jobById.has(id)), "ledger postings reference a job that does not exist");
  add(10, "AMOUNT_MISMATCH", amountMismatch, "job estimate or charge differs from its ledger entries");

  violations.sort((a, b) => a.check - b.check || a.code.localeCompare(b.code));
  return {
    ok: violations.length === 0,
    violations,
    counts: { accounts: input.accounts.length, transactions: input.transactions.length, entries: input.entries.length, jobsWithCredits: credited.length },
  };
}
