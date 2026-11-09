import { Reflector } from "@nestjs/core";
import { beforeEach, describe, expect, it } from "vitest";
import { parseAiCreditsConfig } from "../../../config/ai-credits";
import { access, AuthGuard } from "../../auth/interface/auth";
import { parseAiConfig } from "../application/ai-config";
import { AiJobRunner } from "../application/ai-job-runner";
import { AiJobsService } from "../application/ai-jobs.service";
import { AiProviderError, type AiGenerateInput, type AiProvider } from "../application/ai-provider";
import { AiCreditsAdminService } from "../application/credits-admin.service";
import { reconcileCredits, type ReconcileInput } from "../application/credits-reconcile";
import { AiCreditsService } from "../application/credits.service";
import { makeCreditsStore, type CreditsStore, type Row } from "../application/credits-test-kit";
import { AiJobsController } from "./ai-jobs.controller";
import { AdminCreditsController, CreditsController } from "./credits.controller";

/**
 * TAI5-T5/T6 proof without a database: the SPEC success-signal journey (100 credits, a confirmed 12-credit estimate, 8
 * of 10 items valid, a provider failure that refunds, a double click that reserves once, reconciliation passes, an
 * injected unbalanced entry makes it fail, the teacher never sees tokens), role denials through the real AuthGuard, a
 * concurrency stress at the balance boundary, and one injected fault per reconciliation class. Controllers, services and
 * the runner are the real ones; Prisma is the in-memory kit (serialized transactions with rollback, no PostgreSQL).
 * The real-database run is scripts/tai05-integration.mjs (written, not run: no isolated database on this machine).
 */
class ScriptedProvider implements AiProvider {
  readonly name = "fake" as const;
  queue: Array<() => Promise<{ text: string; inputTokens: number; outputTokens: number }>> = [];
  async generate(_input: AiGenerateInput) {
    const next = this.queue.shift();
    if (!next) throw new Error("no scripted response");
    return next();
  }
}

const TEACHER = { sub: "teacher-owner", role: "TEACHER" };
const OUTSIDER = { sub: "teacher-outsider", role: "TEACHER" };
const ADMIN = { sub: "admin-1", role: "ADMIN" };
const STUDENT = { sub: "student-1", role: "STUDENT" };
const PARENT = { sub: "parent-1", role: "PARENT" };
const ALL = [TEACHER, OUTSIDER, ADMIN, STUDENT, PARENT];
let seq = 0;
const key = () => `credits-journey-${++seq}-key`;
const req = (user: Row, idempotencyKey: string | null = null) => ({ user, headers: idempotencyKey ? { "idempotency-key": idempotencyKey } : {}, path: "/api" });
const okText = (n: number) =>
  JSON.stringify({
    items: Array.from({ length: n }, (_, i) => ({
      type: "SINGLE_CHOICE", prompt: `Cường độ dòng điện câu số ${"ABCDEFGHIJ"[i] ?? i} được đo bằng gì`, options: ["Ampe kế", "Vôn kế", "Nhiệt kế"], correctOption: 0,
      explanation: "Ampe kế đo cường độ dòng điện.", difficulty: "STANDARD", outcomeCodes: [], sourceRefs: ["P1"],
    })),
  });
const body = (patch: Row = {}) => ({ purpose: "GENERATE_RESOURCE", targetKind: "TEST", lessonId: "lesson-circuit", itemCount: 10, ...patch });
const codeOf = (p: Promise<unknown>) => p.then(() => null, (e: any) => e.response?.code ?? e.status ?? String(e));

let store: CreditsStore;
let provider: ScriptedProvider;
let credits: AiCreditsService;
let runner: AiJobRunner;
let jobs: AiJobsController;
let teacherCredits: CreditsController;
let adminCredits: AdminCreditsController;
const aiConfig = parseAiConfig({ AI_PROVIDER: "fake", AI_PROVIDER_MIN_INTERVAL_MS: "0", AI_CONCURRENT_JOB_LIMIT: "20", AI_DAILY_JOB_LIMIT: "50" } as any);

beforeEach(async () => {
  process.env.JWT_SECRET ??= "credits-journey-only";
  store = makeCreditsStore();
  store.classroom.rows.push({ id: "class-pilot-a", teacherId: TEACHER.sub, status: "ACTIVE" }, { id: "class-pilot-b", teacherId: OUTSIDER.sub, status: "ACTIVE" });
  for (const u of ALL) store.user.rows.push({ id: u.sub, role: u.role });
  store.lessonRows.push({ id: "lesson-circuit", title: "Mạch điện", grade: 8, domain: "ENERGY", topic: "Dòng điện", learningObjective: "Hiểu dòng điện", content: "<p>Dòng điện là...</p>", outcomeCodes: [], scope: "SHARED_LIBRARY", status: "published", authorId: "admin" });
  store.lessonStepRows.push({ lessonId: "lesson-circuit", type: "READING", position: 1, config: { html: "<p>Đọc thêm</p>" } });
  provider = new ScriptedProvider();
  credits = new AiCreditsService(store as any, parseAiCreditsConfig({ AI_CREDITS_ENABLED: "true" }));
  jobs = new AiJobsController(new AiJobsService(store as any, aiConfig, provider, undefined, credits));
  runner = new AiJobRunner(store as any, aiConfig, provider, credits);
  teacherCredits = new CreditsController(credits);
  adminCredits = new AdminCreditsController(new AiCreditsAdminService(store as any));
  await credits.ensureBaselinePricing();
});

const job = (id: string) => store.aiJob.rows.find((r: Row) => r.id === id)!;
const available = () => store.creditAccount.rows.find((a: Row) => a.kind === "TEACHER_AVAILABLE" && a.ownerId === TEACHER.sub)!.balance as number;
const reserved = () => store.creditAccount.rows.find((a: Row) => a.kind === "TEACHER_RESERVED" && a.ownerId === TEACHER.sub)!.balance as number;

function ledgerRows(): ReconcileInput {
  return {
    accounts: store.creditAccount.rows.map((a: Row) => ({ id: a.id, kind: a.kind, ownerId: a.ownerId ?? null, balance: a.balance })),
    transactions: store.creditTransaction.rows.map((t: Row) => ({ id: t.id, kind: t.kind, aiJobId: t.aiJobId ?? null })),
    entries: store.creditEntry.rows.map((e: Row) => ({ id: e.id, transactionId: e.transactionId, accountId: e.accountId, amount: e.amount })),
    jobs: store.aiJob.rows.map((j: Row) => ({ id: j.id, status: j.status, estimatedCredits: j.estimatedCredits ?? null, chargedCredits: j.chargedCredits ?? null, pricingVersionId: j.pricingVersionId ?? null })),
    pricingVersionIds: store.pricingVersion.rows.map((p: Row) => p.id),
  };
}
const clone = <T,>(value: T): T => structuredClone(value);

async function guard(user: Row, controller: any, handler: string) {
  const sessions = new Map(ALL.map((u) => [`sid-${u.sub}`, u]));
  const db: any = {
    session: {
      async findFirst({ where }: Row) {
        const u = sessions.get(where.id);
        return u && u.sub === where.userId ? { user: { role: u.role, status: "active", mustChangePassword: false, grade: null } } : null;
      },
    },
  };
  const token = access({ id: user.sub, role: user.role }, `sid-${user.sub}`);
  const request: Row = { headers: { authorization: `Bearer ${token}` }, path: "/api/x" };
  const ctx: any = { getHandler: () => controller.prototype[handler], getClass: () => controller, switchToHttp: () => ({ getRequest: () => request }) };
  return new AuthGuard(new Reflector(), db).canActivate(ctx).then(() => "allowed", (error) => error.status);
}

describe("TAI-05 SPEC success-signal journey", () => {
  it("100 credits, a confirmed 12-credit estimate, 8 of 10 valid settles <= 10, a provider failure refunds 12, a double click reserves once", async () => {
    const grant: any = await adminCredits.grant(TEACHER.sub, req(ADMIN, key()), { credits: 100, reason: "Cấp cho giáo viên thí điểm" });
    expect(grant).toMatchObject({ available: 100, reserved: 0 });

    const estimate: any = await teacherCredits.estimate("class-pilot-a", req(TEACHER), body());
    expect(estimate).toEqual({ enabled: true, credits: 12, pricingVersion: 1, available: 100 });

    // Job 1: confirm 12, the double click replays the same key.
    const k = key();
    const first: any = await jobs.create("class-pilot-a", req(TEACHER, k), body({ confirmedCredits: estimate.credits }));
    const again: any = await jobs.create("class-pilot-a", req(TEACHER, k), body({ confirmedCredits: estimate.credits }));
    expect(again.id).toBe(first.id);
    expect(store.aiJob.rows).toHaveLength(1);
    expect(store.creditTransaction.rows.filter((t: Row) => t.kind === "RESERVE")).toHaveLength(1);
    expect(available()).toBe(88);
    expect(reserved()).toBe(12);

    provider.queue.push(async () => ({ text: okText(8), inputTokens: 40_000, outputTokens: 20_000 })); // token cost far above the estimate
    await runner.runOnce();
    const done: any = await jobs.get("class-pilot-a", first.id, req(TEACHER));
    expect(done).toMatchObject({ status: "SUCCEEDED", validCount: 8 });
    expect(done.credits.charged).toBeLessThanOrEqual(10);
    expect(done.credits).toMatchObject({ estimated: 12, state: "settled", charged: 10, refunded: 2 }); // ceil(12 x 8 / 10) = 10
    expect(available()).toBe(90);
    expect(reserved()).toBe(0);

    // Job 2: the provider fails twice, the whole 12 comes back.
    const second: any = await jobs.create("class-pilot-a", req(TEACHER, key()), body({ confirmedCredits: 12 }));
    expect(available()).toBe(78);
    provider.queue.push(async () => { throw new AiProviderError("PROVIDER_UNAVAILABLE", 503); }, async () => { throw new AiProviderError("PROVIDER_UNAVAILABLE", 503); });
    await runner.runOnce();
    await runner.runOnce();
    expect(job(second.id)).toMatchObject({ status: "FAILED", failureCode: "PROVIDER_UNAVAILABLE" });
    expect(available()).toBe(90);
    expect(reserved()).toBe(0);
    expect((await jobs.get("class-pilot-a", second.id, req(TEACHER)) as any).credits).toMatchObject({ state: "refunded", refunded: 12 });

    // The teacher's view: credits only.
    const mine: any = await teacherCredits.mine(req(TEACHER), {});
    expect(mine).toMatchObject({ enabled: true, available: 90, reserved: 0 });
    expect(mine.transactions.map((t: Row) => t.kind)).toEqual(["REFUND", "RESERVE", "SETTLE", "RESERVE", "GRANT"]);
    for (const view of [mine, done, await jobs.list("class-pilot-a", req(TEACHER), {}), estimate]) {
      const text = JSON.stringify(view);
      // PROVIDER_UNAVAILABLE is a failure code with its own neutral copy, not a provider name, price or token count.
      expect(text).not.toMatch(/token|40000|20000|gemini|fake-model/i);
    }

    // Reconciliation passes; an injected unbalanced entry makes it fail and names the transaction.
    expect(reconcileCredits(ledgerRows())).toMatchObject({ ok: true, violations: [] });
    const broken = ledgerRows();
    const victim = broken.entries[0];
    victim.amount += 1;
    const report = reconcileCredits(broken);
    expect(report.ok).toBe(false);
    expect(report.violations.find((v) => v.check === 1)!.ids).toContain(victim.transactionId);
  });

  it("a short balance is 402, a stale estimate is 409, neither creates a job", async () => {
    await adminCredits.grant(TEACHER.sub, req(ADMIN, key()), { credits: 11, reason: "Cấp cho giáo viên thí điểm" });
    expect(await codeOf(jobs.create("class-pilot-a", req(TEACHER, key()), body({ confirmedCredits: 12 })))).toBe("AI_CREDITS_INSUFFICIENT");
    expect(await codeOf(jobs.create("class-pilot-a", req(TEACHER, key()), body({ confirmedCredits: 9 })))).toBe("AI_ESTIMATE_CHANGED");
    expect(await codeOf(jobs.create("class-pilot-a", req(TEACHER, key()), body()))).toBe("VALIDATION_FAILED");
    expect(store.aiJob.rows).toHaveLength(0);
    expect(available()).toBe(11);
  });

  it("concurrent creates at the boundary never overdraw: 36 credits fund exactly three 12-credit jobs out of eight", async () => {
    await adminCredits.grant(TEACHER.sub, req(ADMIN, key()), { credits: 36, reason: "Cấp cho giáo viên thí điểm" });
    const results = await Promise.allSettled(Array.from({ length: 8 }, () => jobs.create("class-pilot-a", req(TEACHER, key()), body({ confirmedCredits: 12 }))));
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(3);
    expect(results.filter((r) => r.status === "rejected").every((r: any) => r.reason.response.code === "AI_CREDITS_INSUFFICIENT")).toBe(true);
    expect(available()).toBe(0);
    expect(reserved()).toBe(36);
    expect(store.aiJob.rows).toHaveLength(3);
    expect(reconcileCredits(ledgerRows()).ok).toBe(true);
  });

  it("cancelling every pending job returns the whole balance and the ledger still reconciles", async () => {
    await adminCredits.grant(TEACHER.sub, req(ADMIN, key()), { credits: 36, reason: "Cấp cho giáo viên thí điểm" });
    const created = await Promise.all([1, 2, 3].map(() => jobs.create("class-pilot-a", req(TEACHER, key()), body({ confirmedCredits: 12 })))) as any[];
    for (const j of created) await jobs.cancel("class-pilot-a", j.id, req(TEACHER));
    expect(available()).toBe(36);
    expect(reserved()).toBe(0);
    expect(reconcileCredits(ledgerRows()).ok).toBe(true);
  });
});

describe("TAI-05 role and ownership denials", () => {
  it("credit routes allow only their role through the real guard", async () => {
    for (const handler of ["estimate", "mine"]) {
      expect(await guard(TEACHER, CreditsController, handler)).toBe("allowed");
      for (const other of [STUDENT, PARENT, ADMIN]) expect(await guard(other, CreditsController, handler)).toBe(403);
    }
    for (const handler of ["account", "grant", "adjust", "listPricing", "createPricing", "activatePricing", "retirePricing"]) {
      expect(await guard(ADMIN, AdminCreditsController, handler)).toBe("allowed");
      for (const other of [TEACHER, STUDENT, PARENT]) expect(await guard(other, AdminCreditsController, handler)).toBe(403);
    }
  });

  it("the outsider teacher and an unknown class get 403 CLASS_ACCESS_DENIED on estimate and create, and nothing is written", async () => {
    await adminCredits.grant(TEACHER.sub, req(ADMIN, key()), { credits: 50, reason: "Cấp cho giáo viên thí điểm" });
    expect(await codeOf(teacherCredits.estimate("class-pilot-a", req(OUTSIDER), body()))).toBe("CLASS_ACCESS_DENIED");
    expect(await codeOf(teacherCredits.estimate("class-missing", req(TEACHER), body()))).toBe("CLASS_ACCESS_DENIED");
    expect(await codeOf(jobs.create("class-pilot-a", req(OUTSIDER, key()), body({ confirmedCredits: 12 })))).toBe("CLASS_ACCESS_DENIED");
    expect(store.aiJob.rows).toHaveLength(0);
    expect(available()).toBe(50);
  });

  it("an admin cannot grant to a non-teacher, and a teacher cannot read another teacher's account through /me/credits", async () => {
    expect(await codeOf(adminCredits.grant(STUDENT.sub, req(ADMIN, key()), { credits: 5, reason: "Cấp thử nghiệm" }))).toBe("NOT_FOUND");
    await adminCredits.grant(OUTSIDER.sub, req(ADMIN, key()), { credits: 7, reason: "Cấp cho giáo viên thí điểm" });
    expect(await teacherCredits.mine(req(TEACHER), {})).toMatchObject({ available: 0, transactions: [] });
  });
});

describe("TAI5-T6 failure injection: every reconciliation class is detected with its offending ID", () => {
  /** A healthy ledger: one grant, one settled job, one refunded job, one cancelled job, one reserved job. */
  async function healthy() {
    await adminCredits.grant(TEACHER.sub, req(ADMIN, key()), { credits: 100, reason: "Cấp cho giáo viên thí điểm" });
    const make = async () => (await jobs.create("class-pilot-a", req(TEACHER, key()), body({ confirmedCredits: 12 })) as any).id as string;
    const settled = await make();
    provider.queue.push(async () => ({ text: okText(10), inputTokens: 1000, outputTokens: 1000 }));
    await runner.runOnce();
    const refunded = await make();
    provider.queue.push(async () => { throw new AiProviderError("INTERNAL_ERROR", 400); });
    await runner.runOnce();
    const cancelled = await make();
    await jobs.cancel("class-pilot-a", cancelled, req(TEACHER));
    const reservedJob = await make();
    const rows = ledgerRows();
    expect(reconcileCredits(rows)).toMatchObject({ ok: true, violations: [], counts: { jobsWithCredits: 4 } });
    return { rows, settled, refunded, cancelled, reservedJob };
  }
  const find = (report: ReturnType<typeof reconcileCredits>, check: number, code?: string) =>
    report.violations.filter((v) => v.check === check && (!code || v.code === code));
  const txOf = (rows: ReconcileInput, jobId: string, kind: string) => rows.transactions.find((t) => t.aiJobId === jobId && t.kind === kind)!;

  it("check 1: an entry that no longer balances its transaction", async () => {
    const { rows, settled } = await healthy();
    const settle = txOf(rows, settled, "SETTLE");
    rows.entries.find((e) => e.transactionId === settle.id)!.amount += 3;
    expect(find(reconcileCredits(rows), 1)[0].ids).toEqual([settle.id]);
  });

  it("check 2: a cached balance that drifted from its entries", async () => {
    const { rows } = await healthy();
    const target = rows.accounts.find((a) => a.kind === "TEACHER_AVAILABLE")!;
    target.balance += 1;
    const report = reconcileCredits(rows);
    expect(find(report, 2)[0].ids).toEqual([target.id]);
    expect(report.ok).toBe(false);
  });

  it("check 3: a negative teacher balance", async () => {
    const { rows } = await healthy();
    const target = rows.accounts.find((a) => a.kind === "TEACHER_RESERVED")!;
    target.balance = -2;
    expect(find(reconcileCredits(rows), 3)[0].ids).toEqual([target.id]);
  });

  it("check 4: a terminal job whose SETTLE is missing, a job with both SETTLE and REFUND, and a wrong closing kind", async () => {
    const { rows, settled, refunded, cancelled } = await healthy();
    const settle = txOf(rows, settled, "SETTLE");
    const missing = clone(rows);
    missing.transactions = missing.transactions.filter((t) => t.id !== settle.id);
    missing.entries = missing.entries.filter((e) => e.transactionId !== settle.id);
    expect(find(reconcileCredits(missing), 4, "TERMINAL_JOB_WITHOUT_SETTLEMENT")[0].ids).toEqual([settled]);

    const both = clone(rows);
    both.transactions.push({ id: "fake-refund", kind: "REFUND", aiJobId: settled });
    expect(find(reconcileCredits(both), 4, "JOB_SETTLED_AND_REFUNDED")[0].ids).toEqual([settled]);
    expect(find(reconcileCredits(both), 4, "JOB_WRONG_CLOSING_KIND")[0].ids).toEqual([settled]);

    const wrong = clone(rows);
    wrong.transactions.find((t) => t.id === txOf(rows, cancelled, "REFUND").id)!.kind = "SETTLE";
    expect(find(reconcileCredits(wrong), 4, "JOB_WRONG_CLOSING_KIND")[0].ids).toContain(cancelled);
    void refunded;
  });

  it("check 5: a non-terminal job that already has a SETTLE or REFUND", async () => {
    const { rows, reservedJob } = await healthy();
    rows.transactions.push({ id: "early-refund", kind: "REFUND", aiJobId: reservedJob });
    expect(find(reconcileCredits(rows), 5)[0].ids).toEqual([reservedJob]);
  });

  it("check 6: a SETTLE that charged more than the reservation", async () => {
    const { rows, settled } = await healthy();
    const settle = txOf(rows, settled, "SETTLE");
    const consumed = rows.accounts.find((a) => a.kind === "SYSTEM_CONSUMED")!;
    const entry = rows.entries.find((e) => e.transactionId === settle.id && e.accountId === consumed.id)!;
    entry.amount = 99;
    expect(find(reconcileCredits(rows), 6)[0].ids).toEqual([settled]);
  });

  it("check 7: a job pinned to a price that does not exist", async () => {
    const { rows, refunded } = await healthy();
    rows.jobs.find((j) => j.id === refunded)!.pricingVersionId = "price-that-never-existed";
    expect(find(reconcileCredits(rows), 7)[0].ids).toEqual([refunded]);
    const unpinned = clone(rows);
    unpinned.pricingVersionIds = [];
    expect(find(reconcileCredits(unpinned), 7)[0].ids.length).toBe(4);
  });

  it("check 8: ledger postings whose job disappeared (credits stranded)", async () => {
    const { rows, reservedJob } = await healthy();
    rows.jobs = rows.jobs.filter((j) => j.id !== reservedJob);
    expect(find(reconcileCredits(rows), 8)[0].ids).toEqual([reservedJob]);
  });

  it("check 9 and 10: a dangling entry, and an estimate that no longer matches the reserve entries", async () => {
    const { rows, settled } = await healthy();
    const dangling = clone(rows);
    dangling.entries.push({ id: "orphan-entry", transactionId: "no-such-tx", accountId: dangling.accounts[0].id, amount: 0 });
    expect(find(reconcileCredits(dangling), 9)[0].ids).toEqual(["orphan-entry"]);
    const mismatch = clone(rows);
    mismatch.jobs.find((j) => j.id === settled)!.estimatedCredits = 13;
    expect(find(reconcileCredits(mismatch), 10)[0].ids).toEqual([settled]);
  });

  it("a double settle is refused by the ledger, so the reconciler never has to see one from the code path", async () => {
    const { settled } = await healthy();
    const before = store.creditTransaction.rows.length;
    await store.$transaction((tx: any) => credits.finalize(tx, settled, { kind: "SETTLE", validCount: 10 }));
    await store.$transaction((tx: any) => credits.finalize(tx, settled, { kind: "REFUND" }));
    expect(store.creditTransaction.rows).toHaveLength(before);
    expect(reconcileCredits(ledgerRows()).ok).toBe(true);
  });
});
