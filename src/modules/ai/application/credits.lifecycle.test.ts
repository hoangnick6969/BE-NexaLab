import { beforeEach, describe, expect, it } from "vitest";
import { ZodError } from "zod";
import { BASELINE_PRICES, parseAiCreditsConfig } from "../../../config/ai-credits";
import { parseAiConfig } from "./ai-config";
import { AiJobRunner, RUNNER_TIMINGS } from "./ai-job-runner";
import { AiJobsService } from "./ai-jobs.service";
import { AiProviderError, type AiGenerateInput, type AiProvider } from "./ai-provider";
import { AiCreditsAdminService } from "./credits-admin.service";
import { reconcileCredits, type ReconcileInput } from "./credits-reconcile";
import { AiCreditsService } from "./credits.service";
import { makeCreditsStore, type CreditsStore, type Row } from "./credits-test-kit";

/**
 * TAI5-T2, T3 and T4 over an in-memory store: pricing versions and estimate, reserve / settle / refund inside the AI
 * job lifecycle (runner success and failure, cancel before and during a run, lease reclaim, sweeper), admin grants and
 * adjustments, and the switch-off behaviour. Every scenario ends by running the reconciliation over the ledger rows.
 * The store models serialized transactions with rollback; PostgreSQL locks and constraints are proven by tai05-integration.mjs.
 */
class ScriptedProvider implements AiProvider {
  readonly name = "fake" as const;
  calls: AiGenerateInput[] = [];
  queue: Array<() => Promise<{ text: string; inputTokens: number; outputTokens: number }>> = [];
  async generate(input: AiGenerateInput) {
    this.calls.push(input);
    const next = this.queue.shift();
    if (!next) throw new Error("no scripted response");
    return next();
  }
}

const OWNER = { sub: "teacher-owner", role: "TEACHER" };
const OUTSIDER = { sub: "teacher-outsider", role: "TEACHER" };
const ADMIN = { sub: "admin-1", role: "ADMIN" };
let keySeq = 0;
const req = (user: Row = OWNER, key: string | null = `key-${++keySeq}-abcdefgh`) => ({ user, headers: key === null ? {} : { "idempotency-key": key } });
const okText = (n: number) =>
  JSON.stringify({
    items: Array.from({ length: n }, (_, i) => ({
      type: "SINGLE_CHOICE", prompt: `Cường độ dòng điện câu số ${"ABCDEFGHIJ"[i] ?? i} được đo bằng gì`, options: ["Ampe kế", "Vôn kế", "Nhiệt kế"], correctOption: 0,
      explanation: "Ampe kế đo cường độ dòng điện.", difficulty: "STANDARD", outcomeCodes: [], sourceRefs: ["P1"],
    })),
  });
const body = (patch: Row = {}) => ({ purpose: "GENERATE_RESOURCE", targetKind: "TEST", lessonId: "lesson-circuit", itemCount: 10, ...patch });

let store: CreditsStore;
let provider: ScriptedProvider;
let credits: AiCreditsService;
let admin: AiCreditsAdminService;
let service: AiJobsService;
let runner: AiJobRunner;
const aiConfig = parseAiConfig({ AI_PROVIDER: "fake", AI_PROVIDER_MIN_INTERVAL_MS: "0", AI_CONCURRENT_JOB_LIMIT: "10", AI_DAILY_JOB_LIMIT: "50" } as any);

async function build(env: Record<string, string> = { AI_CREDITS_ENABLED: "true" }) {
  store = makeCreditsStore();
  store.classroom.rows.push({ id: "class-a", teacherId: OWNER.sub, status: "ACTIVE" });
  store.user.rows.push({ id: OWNER.sub, role: "TEACHER" }, { id: OUTSIDER.sub, role: "TEACHER" }, { id: ADMIN.sub, role: "ADMIN" });
  store.lessonRows.push({ id: "lesson-circuit", title: "Mạch điện", grade: 8, domain: "ENERGY", topic: "Dòng điện", learningObjective: "Hiểu dòng điện", content: "<p>Dòng điện là...</p>", outcomeCodes: [], scope: "SHARED_LIBRARY", status: "published", authorId: "admin" });
  store.lessonStepRows.push({ lessonId: "lesson-circuit", type: "READING", position: 1, config: { html: "<p>Đọc thêm</p>" } });
  provider = new ScriptedProvider();
  credits = new AiCreditsService(store as any, parseAiCreditsConfig(env as any));
  admin = new AiCreditsAdminService(store as any);
  service = new AiJobsService(store as any, aiConfig, provider, undefined, credits);
  runner = new AiJobRunner(store as any, aiConfig, provider, credits);
  await credits.ensureBaselinePricing();
}
beforeEach(() => build());

const grant = (credits: number, teacherId = OWNER.sub, key?: string) => admin.grant(teacherId, req(ADMIN, key), { credits, reason: "Cấp thử nghiệm đợt 1" });
/** `confirmedCredits` defaults to the 12-credit estimate of 10 items; pass null to omit the field. */
const create = (patch: Row = {}, confirmedCredits: number | null = 12, r = req()) =>
  service.create("class-a", r, body({ ...(confirmedCredits === null ? {} : { confirmedCredits }), ...patch }));
const job = (id: string) => store.aiJob.rows.find((row: Row) => row.id === id)!;
const account = (kind: string, ownerId: string | null = OWNER.sub) => store.creditAccount.rows.find((a: Row) => a.kind === kind && (a.ownerId ?? null) === ownerId)!;
const available = () => account("TEACHER_AVAILABLE").balance as number;
const reserved = () => account("TEACHER_RESERVED").balance as number;
const consumed = () => (account("SYSTEM_CONSUMED", null)?.balance ?? 0) as number;
const txs = (kind?: string) => store.creditTransaction.rows.filter((t: Row) => !kind || t.kind === kind);

function expectReconciled() {
  const input: ReconcileInput = {
    accounts: store.creditAccount.rows.map((a: Row) => ({ id: a.id, kind: a.kind, ownerId: a.ownerId ?? null, balance: a.balance })),
    transactions: store.creditTransaction.rows.map((t: Row) => ({ id: t.id, kind: t.kind, aiJobId: t.aiJobId ?? null })),
    entries: store.creditEntry.rows.map((e: Row) => ({ id: e.id, transactionId: e.transactionId, accountId: e.accountId, amount: e.amount })),
    jobs: store.aiJob.rows.map((j: Row) => ({ id: j.id, status: j.status, estimatedCredits: j.estimatedCredits ?? null, chargedCredits: j.chargedCredits ?? null, pricingVersionId: j.pricingVersionId ?? null })),
    pricingVersionIds: store.pricingVersion.rows.map((p: Row) => p.id),
  };
  expect(reconcileCredits(input)).toMatchObject({ ok: true, violations: [] });
}

describe("TAI5-T2 pricing versions and estimate", () => {
  it("seeds the team-lead baseline as active version 1 per purpose, idempotently and audited", async () => {
    await credits.ensureBaselinePricing();
    expect(store.pricingVersion.rows).toHaveLength(4); // GENERATE_RESOURCE, ASSESS_SUBMISSION, (TAI-06) DRAFT_LAB_CHALLENGE and (TAI7-T5) GENERATE_ASSESSMENT
    const generate = store.pricingVersion.rows.find((p: Row) => p.purpose === "GENERATE_RESOURCE")!;
    expect(generate).toMatchObject({ version: 1, status: "active", createdById: "system", ...BASELINE_PRICES.GENERATE_RESOURCE });
    expect(generate.evidenceRef).toContain("spec-teacher-ai-credits/tai-05-pricing-evidence.md");
    expect(store.auditLog.rows.filter((a: Row) => a.action === "credits.pricing.create")).toHaveLength(4);
  });

  it("estimates deterministically for the same request and price, writes nothing and reports an unknown balance as 0", async () => {
    const first = await credits.estimate("class-a", req(), body());
    const second = await credits.estimate("class-a", req(), body());
    expect(first).toEqual({ enabled: true, credits: 12, pricingVersion: 1, available: 0 });
    expect(second).toEqual(first);
    expect((await credits.estimate("class-a", req(), body({ itemCount: 20 }))).credits).toBe(22);
    expect(await credits.estimate("class-a", req(), { purpose: "ASSESS_SUBMISSION", submissionCount: 3 })).toMatchObject({ credits: 15 });
    expect(store.creditAccount.rows.filter((a: Row) => a.ownerId === OWNER.sub)).toHaveLength(0);
    expect(store.creditTransaction.rows).toHaveLength(0);
    expect(store.auditLog.rows.filter((a: Row) => a.action !== "credits.pricing.create")).toHaveLength(0);
    await grant(40);
    expect((await credits.estimate("class-a", req(), body())).available).toBe(40);
  });

  it("is owner only and validates the body like create", async () => {
    await expect(credits.estimate("class-a", req(OUTSIDER), body())).rejects.toMatchObject({ status: 403, response: { code: "CLASS_ACCESS_DENIED" } });
    await expect(credits.estimate("class-missing", req(), body())).rejects.toMatchObject({ status: 403 });
    await expect(credits.estimate("class-a", req(), body({ itemCount: 99 }))).rejects.toBeInstanceOf(ZodError);
    await expect(credits.estimate("class-a", req(), { purpose: "ASSESS_SUBMISSION", submissionCount: 0 })).rejects.toBeInstanceOf(ZodError);
  });

  it("answers enabled=false without a price lookup when credits are off", async () => {
    await build({});
    expect(await credits.estimate("class-a", req(), body())).toEqual({ enabled: false, credits: 0, pricingVersion: null, available: 0 });
    expect(store.pricingVersion.rows).toHaveLength(4); // baseline was seeded by the explicit call in build()
  });

  it("creates a draft with the next version (evidence required), activates atomically and retires the previous price", async () => {
    await expect(admin.createPricing(req(ADMIN), { purpose: "GENERATE_RESOURCE", baseCredits: 1, perItemCredits: 2, creditsPer1kInputTokens: 1, creditsPer1kOutputTokens: 1 })).rejects.toBeInstanceOf(ZodError);
    await expect(admin.createPricing(req(ADMIN), { purpose: "GENERATE_RESOURCE", baseCredits: 1, perItemCredits: 2, creditsPer1kInputTokens: 1, creditsPer1kOutputTokens: 1, evidenceRef: "  " })).rejects.toBeInstanceOf(ZodError);
    const draft = await admin.createPricing(req(ADMIN), { purpose: "GENERATE_RESOURCE", baseCredits: 1, perItemCredits: 2, creditsPer1kInputTokens: 1, creditsPer1kOutputTokens: 1, evidenceRef: "_bmad-output/implementation-artifacts/tai-05-pricing-evidence.md" });
    expect(draft).toMatchObject({ version: 2, status: "draft", createdById: ADMIN.sub });
    expect((await credits.quote(store, "GENERATE_RESOURCE", 10)).price.version).toBe(1); // a draft is not active

    const activated = await admin.activatePricing(draft.id, req(ADMIN));
    expect(activated).toMatchObject({ version: 2, status: "active" });
    const rows = store.pricingVersion.rows.filter((p: Row) => p.purpose === "GENERATE_RESOURCE");
    expect(rows.filter((p: Row) => p.status === "active")).toHaveLength(1);
    expect(rows.find((p: Row) => p.version === 1)).toMatchObject({ status: "retired" });
    expect(rows.find((p: Row) => p.version === 1)!.retiredAt).toBeInstanceOf(Date);
    expect((await credits.quote(store, "GENERATE_RESOURCE", 10))).toMatchObject({ credits: 21, price: { version: 2 } });
    await expect(admin.activatePricing(draft.id, req(ADMIN))).rejects.toMatchObject({ status: 409, response: { code: "PRICING_NOT_DRAFT" } });
    await expect(admin.activatePricing("missing", req(ADMIN))).rejects.toMatchObject({ status: 404 });
    const audit = store.auditLog.rows.filter((a: Row) => a.action.startsWith("credits.pricing"));
    expect(audit.map((a: Row) => a.action)).toEqual(["credits.pricing.create", "credits.pricing.create", "credits.pricing.create", "credits.pricing.create", "credits.pricing.create", "credits.pricing.activate"]);
    expect(Object.keys(audit.at(-1).after).sort()).toEqual(["baseCredits", "evidenceRef", "perItemCredits", "purpose", "version"]);
  });

  it("a job created before an activation keeps its pinned price when it settles", async () => {
    await grant(100);
    const created = await create({}, 12);
    const v1 = store.pricingVersion.rows.find((p: Row) => p.purpose === "GENERATE_RESOURCE" && p.version === 1)!;
    expect(job(created.id).pricingVersionId).toBe(v1.id);
    const draft = await admin.createPricing(req(ADMIN), { purpose: "GENERATE_RESOURCE", baseCredits: 50, perItemCredits: 50, creditsPer1kInputTokens: 50, creditsPer1kOutputTokens: 50, evidenceRef: "note" });
    await admin.activatePricing(draft.id, req(ADMIN));
    provider.queue.push(async () => ({ text: okText(10), inputTokens: 2000, outputTokens: 2500 }));
    await runner.runOnce();
    expect(job(created.id)).toMatchObject({ status: "SUCCEEDED", estimatedCredits: 12, chargedCredits: 12, pricingVersionId: v1.id }); // v1 rates: 4 + 7.5 -> 12
    expect(txs("SETTLE")[0].pricingVersionId).toBe(v1.id);
    expectReconciled();
  });

  it("retires the active price: create is refused with 409 PRICING_NOT_ACTIVE and creates nothing", async () => {
    await grant(100);
    const active = store.pricingVersion.rows.find((p: Row) => p.purpose === "GENERATE_RESOURCE" && p.status === "active")!;
    expect(await admin.retirePricing(active.id, req(ADMIN))).toMatchObject({ status: "retired" });
    await expect(create()).rejects.toMatchObject({ status: 409, response: { code: "PRICING_NOT_ACTIVE" } });
    await expect(credits.estimate("class-a", req(), body())).rejects.toMatchObject({ status: 409, response: { code: "PRICING_NOT_ACTIVE" } });
    expect(store.aiJob.rows).toHaveLength(0);
    await expect(admin.retirePricing(active.id, req(ADMIN))).rejects.toMatchObject({ status: 409 });
  });
});

describe("TAI5-T3 reserve on create", () => {
  it("posts one RESERVE in the create transaction: AVAILABLE -E, RESERVED +E, job pinned to the price", async () => {
    await grant(100);
    const created = await create();
    expect(available()).toBe(88);
    expect(reserved()).toBe(12);
    expect(txs("RESERVE")).toHaveLength(1);
    expect(txs("RESERVE")[0]).toMatchObject({ aiJobId: created.id, actorId: OWNER.sub });
    expect(job(created.id)).toMatchObject({ estimatedCredits: 12, chargedCredits: null });
    expect(job(created.id).pricingVersionId).toBeTruthy();
    expect(created.credits).toEqual({ estimated: 12, state: "reserved", charged: null, refunded: null });
    expectReconciled();
  });

  it("a replayed create (double click) posts one reserve", async () => {
    await grant(100);
    const r = req();
    const a = await create({}, 12, r);
    const b = await create({}, 12, r);
    expect(b.id).toBe(a.id);
    expect(store.aiJob.rows).toHaveLength(1);
    expect(txs("RESERVE")).toHaveLength(1);
    expect(available()).toBe(88);
  });

  it("409 AI_ESTIMATE_CHANGED carries the new estimate and creates nothing; a missing value is 400", async () => {
    await grant(100);
    const error = await create({}, 11).then(() => null, (e) => e);
    expect(error).toMatchObject({ status: 409, response: { code: "AI_ESTIMATE_CHANGED", details: { credits: 12, pricingVersion: 1 } } });
    await expect(create({}, null)).rejects.toMatchObject({ status: 400, response: { code: "VALIDATION_FAILED" } });
    expect(store.aiJob.rows).toHaveLength(0);
    expect(txs("RESERVE")).toHaveLength(0);
    expect(available()).toBe(100);
  });

  it("402 AI_CREDITS_INSUFFICIENT includes available and required and creates nothing (job, idempotency record, ledger)", async () => {
    await grant(11);
    const error = await create().then(() => null, (e) => e);
    expect(error).toMatchObject({ status: 402, response: { code: "AI_CREDITS_INSUFFICIENT", details: { available: 11, required: 12 } } });
    expect(store.aiJob.rows).toHaveLength(0);
    expect(txs("RESERVE")).toHaveLength(0);
    expect(store.idempotencyRecord.rows).toHaveLength(1); // only the admin grant's record
    expect(available()).toBe(11);
    expect(reserved()).toBe(0);
  });

  it("402 for a teacher who has no account at all (nothing was ever granted)", async () => {
    const error = await create().then(() => null, (e) => e);
    expect(error).toMatchObject({ status: 402, response: { details: { available: 0, required: 12 } } });
    expect(store.aiJob.rows).toHaveLength(0);
  });

  it("two concurrent creates at the balance boundary let exactly one through", async () => {
    await grant(12);
    const results = await Promise.allSettled([create(), create()]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((r) => r.status === "rejected").map((r: any) => r.reason.response.code)).toEqual(["AI_CREDITS_INSUFFICIENT"]);
    expect(store.aiJob.rows).toHaveLength(1);
    expect(available()).toBe(0);
    expect(reserved()).toBe(12);
    expectReconciled();
  });

  it("still checks the TAI-01 quota first and keeps it independent of credits", async () => {
    await grant(1000);
    const tight = new AiJobsService(store as any, parseAiConfig({ AI_PROVIDER: "fake", AI_CONCURRENT_JOB_LIMIT: "1" } as any), provider, undefined, credits);
    await tight.create("class-a", req(), body({ confirmedCredits: 12 }));
    await expect(tight.create("class-a", req(), body({ confirmedCredits: 12 }))).rejects.toMatchObject({ status: 429, response: { code: "AI_QUOTA_EXCEEDED" } });
    expect(txs("RESERVE")).toHaveLength(1);
    expect(available()).toBe(988);
  });
});

describe("TAI5-T3 settle and refund at every terminal transition", () => {
  it("success with 8 of 10 valid settles at most the estimate, returns the remainder and records the charge", async () => {
    await grant(100);
    const created = await create();
    provider.queue.push(async () => ({ text: okText(8), inputTokens: 1500, outputTokens: 1500 })); // tokenCost 3 + 4.5 -> 8
    await runner.runOnce();
    expect(job(created.id)).toMatchObject({ status: "SUCCEEDED", chargedCredits: 7 }); // ceil(8 x 8 / 10) = 7
    expect(txs("SETTLE")).toHaveLength(1);
    expect(txs("REFUND")).toHaveLength(0);
    expect(available()).toBe(93);
    expect(reserved()).toBe(0);
    expect(consumed()).toBe(7);
    const view = await service.get("class-a", created.id, req());
    expect(view).toMatchObject({ status: "SUCCEEDED", validCount: 8, credits: { estimated: 12, state: "settled", charged: 7, refunded: 5 } });
    expect(store.auditLog.rows.find((a: Row) => a.action === "ai_job.complete")!.after).toMatchObject({ chargedCredits: 7, status: "SUCCEEDED" });
    expectReconciled();
  });

  it("full valid with a token cost above the estimate charges exactly the estimate", async () => {
    await grant(100);
    const created = await create();
    provider.queue.push(async () => ({ text: okText(10), inputTokens: 10_000, outputTokens: 10_000 }));
    await runner.runOnce();
    expect(job(created.id).chargedCredits).toBe(12);
    expect(available()).toBe(88);
    expect(consumed()).toBe(12);
    expectReconciled();
  });

  it("1 of 20 valid rounds the proration up to at least 1 credit", async () => {
    await grant(100);
    const created = await create({ itemCount: 20 }, 22);
    provider.queue.push(async () => ({ text: okText(1), inputTokens: 5000, outputTokens: 3000 })); // tokenCost 10 + 9 = 19
    await runner.runOnce();
    expect(job(created.id)).toMatchObject({ status: "SUCCEEDED", chargedCredits: 1 });
    expect(available()).toBe(99);
    expectReconciled();
  });

  it("a provider failure refunds in full, only after the retry is exhausted", async () => {
    await grant(100);
    const created = await create();
    provider.queue.push(async () => { throw new AiProviderError("PROVIDER_UNAVAILABLE", 503); }, async () => { throw new AiProviderError("PROVIDER_UNAVAILABLE", 429); });
    await runner.runOnce();
    expect(job(created.id).status).toBe("PENDING"); // retry: still reserved
    expect(reserved()).toBe(12);
    expect(txs("REFUND")).toHaveLength(0);
    await runner.runOnce();
    expect(job(created.id)).toMatchObject({ status: "FAILED", failureCode: "PROVIDER_UNAVAILABLE", chargedCredits: 0 });
    expect(txs("REFUND")).toHaveLength(1);
    expect(txs("SETTLE")).toHaveLength(0);
    expect(available()).toBe(100);
    expect(reserved()).toBe(0);
    expect(consumed()).toBe(0);
    expect(store.auditLog.rows.find((a: Row) => a.action === "ai_job.complete")!.after).toMatchObject({ refundedCredits: 12 });
    const view = await service.get("class-a", created.id, req());
    expect(view.credits).toEqual({ estimated: 12, state: "refunded", charged: 0, refunded: 12 });
    expectReconciled();
  });

  it("a validation failure refunds in full even though tokens were spent", async () => {
    await grant(100);
    const created = await create();
    provider.queue.push(async () => ({ text: '{"items":[]}', inputTokens: 9000, outputTokens: 9000 }));
    await runner.runOnce();
    expect(job(created.id)).toMatchObject({ status: "FAILED", failureCode: "OUTPUT_VALIDATION_FAILED", inputTokens: 9000 });
    expect(available()).toBe(100);
    expect(consumed()).toBe(0);
    expectReconciled();
  });

  it("an internal error, an unavailable lesson and a schema failure after two attempts each refund in full", async () => {
    await grant(100);
    const a = await create();
    provider.queue.push(async () => { throw new AiProviderError("INTERNAL_ERROR", 400); });
    await runner.runOnce();
    const b = await create();
    store.lessonRows.splice(0, 1);
    await runner.runOnce();
    expect([job(a.id).status, job(b.id).status]).toEqual(["FAILED", "FAILED"]);
    expect(txs("REFUND")).toHaveLength(2);
    expect(available()).toBe(100);
    expectReconciled();
  });

  it("cancel before the run refunds in full in the cancel transaction and is idempotent", async () => {
    await grant(100);
    const created = await create();
    expect((await service.cancel("class-a", created.id, req())).status).toBe("CANCELLED");
    expect(txs("REFUND")).toHaveLength(1);
    expect(available()).toBe(100);
    await service.cancel("class-a", created.id, req());
    expect(txs("REFUND")).toHaveLength(1);
    expect(store.auditLog.rows.find((a: Row) => a.action === "ai_job.cancel")!.after).toMatchObject({ refundedCredits: 12 });
    expectReconciled();
  });

  it("cancel during the run refunds once and the late provider result neither settles nor writes items", async () => {
    await grant(100);
    const created = await create();
    provider.queue.push(async () => {
      await service.cancel("class-a", created.id, req());
      return { text: okText(10), inputTokens: 2000, outputTokens: 2000 };
    });
    await runner.runOnce();
    expect(job(created.id)).toMatchObject({ status: "CANCELLED", inputTokens: 2000 });
    expect(txs("REFUND")).toHaveLength(1);
    expect(txs("SETTLE")).toHaveLength(0);
    expect(store.aiJobItem.rows).toHaveLength(0);
    expect(available()).toBe(100);
    expect(consumed()).toBe(0);
    expectReconciled();
  });

  it("a reclaimed job settles once: the late first attempt posts nothing", async () => {
    await grant(100);
    const created = await create();
    const first = (await runner.claim(new Date()))!;
    await runner.sweep(new Date(Date.now() + RUNNER_TIMINGS.leaseMs + 1000));
    const second = (await runner.claim(new Date()))!;
    expect(second.attempt).toBe(2);
    const item = (n: number) => Array.from({ length: n }, () => ({ payload: { a: 1 }, flags: [] }));
    await runner.succeed(second, item(10), [], { inputTokens: 1500, outputTokens: 1500 }, new Date());
    await runner.succeed(first, item(10), [], { inputTokens: 1500, outputTokens: 1500 }, new Date());
    expect(job(created.id)).toMatchObject({ status: "SUCCEEDED", attemptCount: 2 });
    expect(txs("SETTLE")).toHaveLength(1);
    expect(consumed()).toBe(job(created.id).chargedCredits);
    expectReconciled();
  });

  it("the sweeper failing a job after two expired leases refunds it", async () => {
    await grant(100);
    const created = await create();
    await runner.claim(new Date());
    await runner.sweep(new Date(Date.now() + RUNNER_TIMINGS.leaseMs + 1000)); // requeue: still reserved
    expect(reserved()).toBe(12);
    await runner.claim(new Date());
    await runner.sweep(new Date(Date.now() + 2 * RUNNER_TIMINGS.leaseMs + 2000));
    expect(job(created.id)).toMatchObject({ status: "FAILED", failureCode: "INTERNAL_ERROR" });
    expect(txs("REFUND")).toHaveLength(1);
    expect(available()).toBe(100);
    expectReconciled();
  });

  it("a crash between reserve and settle leaves the reservation intact until the sweeper refunds it", async () => {
    await grant(100);
    const created = await create();
    await runner.claim(new Date()); // the instance dies right after claiming: no provider answer, no settlement
    expect(job(created.id).status).toBe("RUNNING");
    expect(reserved()).toBe(12);
    expect(available()).toBe(88);
    await runner.sweep(new Date(Date.now() + RUNNER_TIMINGS.leaseMs + 1000));
    await runner.claim(new Date());
    await runner.sweep(new Date(Date.now() + 3 * RUNNER_TIMINGS.leaseMs));
    expect(available()).toBe(100);
    expect(reserved()).toBe(0);
    expectReconciled();
  });

  it("a failing settlement rolls the whole terminal transition back (job stays RUNNING, nothing half-posted)", async () => {
    await grant(100);
    const created = await create();
    const claimed = (await runner.claim(new Date()))!;
    const realCreate = store.creditEntry.createMany;
    store.creditEntry.createMany = async () => {
      throw new Error("ledger write failed");
    };
    await expect(runner.succeed(claimed, Array.from({ length: 10 }, () => ({ payload: { a: 1 }, flags: [] })), [], { inputTokens: 1, outputTokens: 1 }, new Date())).rejects.toThrow("ledger write failed");
    store.creditEntry.createMany = realCreate;
    expect(job(created.id)).toMatchObject({ status: "RUNNING", chargedCredits: null });
    expect(store.aiJobItem.rows).toHaveLength(0);
    expect(txs("SETTLE")).toHaveLength(0);
    expect(reserved()).toBe(12);
    expect(available()).toBe(88);
    expectReconciled();
  });

  it("finalize is idempotent: a second call for a closed job posts nothing", async () => {
    await grant(100);
    const created = await create();
    provider.queue.push(async () => ({ text: okText(10), inputTokens: 100, outputTokens: 100 }));
    await runner.runOnce();
    const before = txs().length;
    expect(await store.$transaction((tx: any) => credits.finalize(tx, created.id, { kind: "SETTLE", validCount: 10 }))).toEqual({});
    expect(await store.$transaction((tx: any) => credits.finalize(tx, created.id, { kind: "REFUND" }))).toEqual({});
    expect(txs()).toHaveLength(before);
    expectReconciled();
  });

  it("a job that is not terminal is never settled", async () => {
    await grant(100);
    const created = await create();
    expect(await store.$transaction((tx: any) => credits.finalize(tx, created.id, { kind: "REFUND" }))).toEqual({});
    expect(await store.$transaction((tx: any) => credits.finalize(tx, created.id, { kind: "SETTLE", validCount: 10 }))).toEqual({});
    expect(txs("SETTLE")).toHaveLength(0);
    expect(txs("REFUND")).toHaveLength(0);
  });
});

describe("TAI5-T3 the flag", () => {
  it("with credits off TAI-01 behaves as before: no estimate field, no ledger rows, no credits in the view", async () => {
    await build({});
    const created = await service.create("class-a", req(), body({ itemCount: 2 }));
    expect(created).not.toHaveProperty("credits");
    provider.queue.push(async () => ({ text: okText(2), inputTokens: 10, outputTokens: 20 }));
    await runner.runOnce();
    expect(job(created.id)).toMatchObject({ status: "SUCCEEDED", estimatedCredits: null, chargedCredits: null, pricingVersionId: null });
    expect(store.creditTransaction.rows).toHaveLength(0);
    expect(store.creditEntry.rows).toHaveLength(0);
    const view = await service.get("class-a", created.id, req());
    expect(view.usage).toEqual({ inputTokens: 10, outputTokens: 20 });
    expect(view.model).toBe("fake-model");
    expect(view).not.toHaveProperty("credits");
    expect(await credits.myCredits(req(), {})).toEqual({ enabled: false, available: 0, reserved: 0, transactions: [], nextCursor: null });
  });

  it("a confirmedCredits sent while credits are off is accepted and ignored", async () => {
    await build({});
    const created = await service.create("class-a", req(), body({ itemCount: 2, confirmedCredits: 999 }));
    expect(job(created.id).estimatedCredits).toBeNull();
  });

  it("switching the flag off while a job is in flight still settles its reservation", async () => {
    await grant(100);
    const created = await create();
    const off = new AiCreditsService(store as any, parseAiCreditsConfig({}));
    const lateRunner = new AiJobRunner(store as any, aiConfig, provider, off);
    provider.queue.push(async () => ({ text: okText(10), inputTokens: 1000, outputTokens: 1000 }));
    await lateRunner.runOnce();
    expect(job(created.id).status).toBe("SUCCEEDED");
    expect(txs("SETTLE")).toHaveLength(1);
    expect(reserved()).toBe(0);
    expectReconciled();
  });
});

describe("TAI5-T5 teacher view never exposes tokens or providers", () => {
  it("the job view and the credit history carry credits only", async () => {
    await grant(100);
    const created = await create();
    provider.queue.push(async () => ({ text: okText(10), inputTokens: 1234, outputTokens: 4321 }));
    await runner.runOnce();
    const view = await service.get("class-a", created.id, req());
    expect(view).not.toHaveProperty("usage");
    expect(view.model).toBe("");
    const list = await service.list("class-a", req(), {});
    const mine = await credits.myCredits(req(), {});
    for (const payload of [view, list, mine, await service.get("class-a", created.id, req())]) {
      const text = JSON.stringify(payload);
      expect(text).not.toMatch(/1234|4321/);
      expect(text).not.toMatch(/token/i);
      expect(text).not.toMatch(/gemini|fake-model|provider/i);
    }
    expect(mine).toMatchObject({ enabled: true, available: expect.any(Number), reserved: 0 });
  });

  it("history is newest first, in credits, cursor-paginated, with the charge on a SETTLE", async () => {
    await grant(100);
    const created = await create();
    provider.queue.push(async () => ({ text: okText(8), inputTokens: 1500, outputTokens: 1500 }));
    await runner.runOnce();
    const page1 = await credits.myCredits(req(), { limit: "2" });
    expect(page1.transactions.map((t: Row) => t.kind)).toEqual(["SETTLE", "RESERVE"]);
    expect(page1.transactions[0]).toMatchObject({ credits: 5, charged: 7, jobId: created.id });
    expect(page1.transactions[1]).toMatchObject({ credits: -12, charged: null, jobId: created.id });
    expect(page1.nextCursor).toBeTruthy();
    const page2 = await credits.myCredits(req(), { limit: "2", cursor: page1.nextCursor });
    expect(page2.transactions.map((t: Row) => ({ kind: t.kind, credits: t.credits }))).toEqual([{ kind: "GRANT", credits: 100 }]);
    expect(page2.nextCursor).toBeNull();
    expect(page2.available).toBe(93);
    expect(Object.keys(page1.transactions[0]).sort()).toEqual(["charged", "createdAt", "credits", "id", "jobId", "kind"]);
    await expect(credits.myCredits(req(), { limit: "0" })).rejects.toBeInstanceOf(ZodError);
    await expect(credits.myCredits(req(), { extra: "x" })).rejects.toBeInstanceOf(ZodError);
  });

  it("one teacher never sees another teacher's ledger", async () => {
    await grant(100);
    await grant(50, OUTSIDER.sub);
    const other = await credits.myCredits(req(OUTSIDER), {});
    expect(other).toMatchObject({ available: 50, reserved: 0 });
    expect(other.transactions).toHaveLength(1);
  });
});

describe("TAI5-T4 admin grants and adjustments", () => {
  it("a replayed key posts once and returns the same result", async () => {
    const r = req(ADMIN, "grant-key-0001");
    const a = await admin.grant(OWNER.sub, r, { credits: 30, reason: "Cấp đợt thử nghiệm" });
    const b = await admin.grant(OWNER.sub, r, { credits: 30, reason: "Cấp đợt thử nghiệm" });
    expect(b).toEqual(a);
    expect(txs("GRANT")).toHaveLength(1);
    expect(available()).toBe(30);
    expect(account("SYSTEM_ISSUANCE", null).balance).toBe(-30);
    expect(a).toMatchObject({ credits: 30, available: 30, reserved: 0 });
    await expect(admin.grant(OWNER.sub, r, { credits: 31, reason: "Cấp đợt thử nghiệm" })).rejects.toMatchObject({ status: 409, response: { code: "IDEMPOTENCY_KEY_REUSED" } });
    await expect(admin.grant(OUTSIDER.sub, r, { credits: 30, reason: "Cấp đợt thử nghiệm" })).rejects.toMatchObject({ status: 409, response: { code: "IDEMPOTENCY_KEY_REUSED" } });
    expect(txs("GRANT")).toHaveLength(1);
  });

  it("requires the key, a positive amount, a 5-500 character reason and a known teacher", async () => {
    await expect(admin.grant(OWNER.sub, req(ADMIN, null), { credits: 1, reason: "Cấp thử nghiệm" })).rejects.toMatchObject({ status: 400, response: { code: "IDEMPOTENCY_KEY_REQUIRED" } });
    await expect(grant(0)).rejects.toBeInstanceOf(ZodError);
    await expect(grant(-3)).rejects.toBeInstanceOf(ZodError);
    await expect(grant(1.5)).rejects.toBeInstanceOf(ZodError);
    await expect(admin.grant(OWNER.sub, req(ADMIN), { credits: 5, reason: "ngắn" })).rejects.toBeInstanceOf(ZodError);
    await expect(admin.grant(OWNER.sub, req(ADMIN), { credits: 5, reason: "x".repeat(501) })).rejects.toBeInstanceOf(ZodError);
    await expect(admin.grant(OWNER.sub, req(ADMIN), { credits: 5, reason: "Cấp thử nghiệm", extra: 1 })).rejects.toBeInstanceOf(ZodError);
    await expect(admin.grant("nobody", req(ADMIN), { credits: 5, reason: "Cấp thử nghiệm" })).rejects.toMatchObject({ status: 404, response: { code: "NOT_FOUND" } });
    await expect(admin.grant(ADMIN.sub, req(ADMIN), { credits: 5, reason: "Cấp thử nghiệm" })).rejects.toMatchObject({ status: 404 });
    expect(txs()).toHaveLength(0);
  });

  it("an adjustment that would overdraw is 409 CREDIT_BALANCE_NEGATIVE and posts nothing; a valid one posts a signed entry", async () => {
    await grant(10);
    await expect(admin.adjust(OWNER.sub, req(ADMIN), { credits: -11, reason: "Điều chỉnh sai sót" })).rejects.toMatchObject({ status: 409, response: { code: "CREDIT_BALANCE_NEGATIVE", details: { available: 10 } } });
    expect(txs("ADJUST")).toHaveLength(0);
    expect(available()).toBe(10);
    const down = await admin.adjust(OWNER.sub, req(ADMIN), { credits: -4, reason: "Điều chỉnh sai sót" });
    expect(down).toMatchObject({ credits: -4, available: 6 });
    expect(account("SYSTEM_ISSUANCE", null).balance).toBe(-6);
    await admin.adjust(OWNER.sub, req(ADMIN), { credits: 9, reason: "Bù lại do lỗi" });
    expect(available()).toBe(15);
    await expect(admin.adjust(OWNER.sub, req(ADMIN), { credits: 0, reason: "Không đổi" })).rejects.toBeInstanceOf(ZodError);
    expectReconciled();
  });

  it("cannot adjust below the part that is reserved: only the available balance counts", async () => {
    await grant(15);
    await create();
    expect(available()).toBe(3);
    await expect(admin.adjust(OWNER.sub, req(ADMIN), { credits: -4, reason: "Điều chỉnh sai sót" })).rejects.toMatchObject({ status: 409, response: { code: "CREDIT_BALANCE_NEGATIVE" } });
    expect(reserved()).toBe(12);
  });

  it("audit rows hold the allowlisted numbers and the reason, nothing else", async () => {
    await admin.grant(OWNER.sub, req(ADMIN), { credits: 20, reason: "Cấp đợt thử nghiệm 1" });
    await admin.adjust(OWNER.sub, req(ADMIN), { credits: -5, reason: "Điều chỉnh sai sót" });
    const rows = store.auditLog.rows.filter((a: Row) => a.action === "credits.grant" || a.action === "credits.adjust");
    expect(rows.map((r: Row) => r.action)).toEqual(["credits.grant", "credits.adjust"]);
    expect(rows[0]).toMatchObject({ reason: "Cấp đợt thử nghiệm 1", actorId: ADMIN.sub });
    expect(rows[0].after).toEqual({ teacherId: OWNER.sub, credits: 20, balanceAfter: 20 });
    expect(rows[1].after).toEqual({ teacherId: OWNER.sub, credits: -5, balanceAfter: 15 });
    for (const row of rows) expect(JSON.stringify(row.after)).not.toContain("Cấp");
  });

  it("the admin account view shows balances, reasons and job ids, newest first, with no tokens", async () => {
    await grant(100);
    const created = await create();
    const view = await admin.account({ teacherId: OWNER.sub });
    expect(view).toMatchObject({ teacherId: OWNER.sub, available: 88, reserved: 12 });
    expect(view.transactions.map((t: Row) => t.kind)).toEqual(["RESERVE", "GRANT"]);
    expect(view.transactions[1]).toMatchObject({ reason: "Cấp thử nghiệm đợt 1", actorId: ADMIN.sub, credits: 100 });
    expect(view.transactions[0]).toMatchObject({ jobId: created.id, credits: -12 });
    expect(JSON.stringify(view)).not.toMatch(/token/i);
    expect(await admin.account({ teacherId: OUTSIDER.sub })).toMatchObject({ available: 0, reserved: 0, transactions: [] });
    await expect(admin.account({})).rejects.toBeInstanceOf(ZodError);
    await expect(admin.account({ teacherId: "nobody" })).rejects.toMatchObject({ status: 404 });
  });
});
