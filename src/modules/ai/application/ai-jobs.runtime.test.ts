import { beforeEach, describe, expect, it } from "vitest";
import { ZodError } from "zod";
import { parseAiConfig } from "./ai-config";
import { AiJobRunner, MAX_ATTEMPTS, nextStatusAfterFailure, RUNNER_TIMINGS } from "./ai-job-runner";
import { AiJobsService } from "./ai-jobs.service";
import { AiProviderError, type AiGenerateInput, type AiProvider } from "./ai-provider";
import { syncClassResourceFingerprints } from "./question-fingerprints";

/**
 * In-memory stand-in for the Prisma calls the AI module makes, so the job state machine, quota and denial rules are
 * proven without a database. Transactions are serialized (one at a time), which models the advisory lock; the real
 * lock and SQL behaviour are covered by the isolated-database integration run, not here.
 */
type Row = Record<string, any>;
let seq = 0;
const id = (prefix: string) => `${prefix}-${String(++seq).padStart(8, "0")}`;

function matches(row: Row, where: Row = {}): boolean {
  return Object.entries(where).every(([key, cond]) => {
    if (key === "NOT") return !matches(row, cond);
    if (key === "OR") return (cond as Row[]).some((c) => matches(row, c));
    const value = row[key];
    if (cond && typeof cond === "object" && !(cond instanceof Date) && !Array.isArray(cond)) {
      if ("in" in cond) return cond.in.includes(value);
      if ("lt" in cond) return value !== null && value !== undefined && value < cond.lt;
      if ("gt" in cond) return value !== null && value !== undefined && value > cond.gt;
      return matches(value ?? {}, cond);
    }
    return value === cond;
  });
}

function sortBy(rows: Row[], orderBy: Row | Row[] | undefined) {
  const orders = orderBy ? (Array.isArray(orderBy) ? orderBy : [orderBy]) : [];
  return [...rows].sort((a, b) => {
    for (const order of orders) {
      const [key, dir] = Object.entries(order)[0] as [string, string];
      if (a[key] < b[key]) return dir === "asc" ? -1 : 1;
      if (a[key] > b[key]) return dir === "asc" ? 1 : -1;
    }
    return 0;
  });
}

function applyData(row: Row, data: Row) {
  for (const [key, value] of Object.entries(data))
    row[key] = value && typeof value === "object" && "increment" in value ? (row[key] ?? 0) + value.increment : value;
}

function table(rows: Row[], defaults: () => Row = () => ({})) {
  return {
    rows,
    async findFirst({ where, orderBy, select, include }: Row = {}) {
      const row = sortBy(rows.filter((r) => matches(r, where)), orderBy)[0];
      return row ? (select ? pick(row, select) : include ? withIncludes(row, include) : { ...row }) : null;
    },
    async findUnique({ where, select, include }: Row) {
      const row = rows.find((r) => matches(r, where));
      return row ? (select ? pick(row, select) : include ? withIncludes(row, include) : { ...row }) : null;
    },
    async findMany({ where, orderBy, take, select, include, cursor, skip }: Row = {}) {
      let list = sortBy(rows.filter((r) => matches(r, where)), orderBy);
      if (cursor) list = list.slice(list.findIndex((r) => r.id === cursor.id) + (skip ?? 0));
      if (take) list = list.slice(0, take);
      return list.map((r) => (select ? pick(r, select) : include ? withIncludes(r, include) : { ...r }));
    },
    async count({ where }: Row = {}) {
      return rows.filter((r) => matches(r, where)).length;
    },
    async create({ data }: Row) {
      const row = { id: id("row"), createdAt: new Date(), ...defaults(), ...data };
      rows.push(row);
      return { ...row };
    },
    async createMany({ data }: Row) {
      for (const d of data) rows.push({ id: id("item"), createdAt: new Date(), flags: [], ...d });
      return { count: data.length };
    },
    async update({ where, data }: Row) {
      const row = rows.find((r) => matches(r, where));
      if (!row) throw new Error("not found");
      applyData(row, data);
      return { ...row };
    },
    async updateMany({ where, data }: Row) {
      const hit = rows.filter((r) => matches(r, where));
      for (const row of hit) applyData(row, data);
      return { count: hit.length };
    },
    async deleteMany({ where }: Row) {
      const keep = rows.filter((r) => !matches(r, where));
      const count = rows.length - keep.length;
      rows.splice(0, rows.length, ...keep);
      return { count };
    },
  };
}

function pick(row: Row, select: Row) {
  return Object.fromEntries(Object.keys(select).map((key) => [key, row[key]]));
}

let store: ReturnType<typeof makeDb>;
function withIncludes(row: Row, include: Row) {
  const out: Row = { ...row };
  if (include.items) {
    out.items = sortBy(store.aiJobItem.rows.filter((i) => i.jobId === row.id), { position: "asc" }).map((item) => ({
      ...item,
      decisions: sortBy(store.aiItemDecision.rows.filter((d) => d.itemId === item.id), [{ createdAt: "desc" }, { id: "desc" }]).slice(0, 1),
    }));
  }
  if (include._count) out._count = { items: store.aiJobItem.rows.filter((i) => i.jobId === row.id).length };
  return out;
}

function makeDb() {
  let chain = Promise.resolve();
  const db: Row = {
    aiJob: table([], () => ({ status: "PENDING", attemptCount: 0, failureCode: null, leaseUntil: null, inputTokens: null, outputTokens: null, droppedItems: [], materializedResourceId: null, startedAt: null, completedAt: null, cancelledAt: null })),
    aiJobItem: table([]),
    aiItemDecision: table([]),
    auditLog: table([]),
    idempotencyRecord: {
      rows: [] as Row[],
      async findUnique({ where }: Row) {
        const k = where.actorId_key;
        return this.rows.find((r: Row) => r.actorId === k.actorId && r.key === k.key) ?? null;
      },
      async create({ data }: Row) {
        if (this.rows.some((r: Row) => r.actorId === data.actorId && r.key === data.key)) throw Object.assign(new Error("dup"), { code: "P2002" });
        this.rows.push({ ...data });
      },
      async update({ where, data }: Row) {
        const k = where.actorId_key;
        Object.assign(this.rows.find((r: Row) => r.actorId === k.actorId && r.key === k.key), data);
      },
    },
    classroom: table([]),
    classResource: table([], () => ({ status: "DRAFT", version: 1, publishedAt: null, archivedAt: null })),
    questionFingerprint: table([]),
    curriculumOutcome: table([]),
    lessonRows: [] as Row[],
    lessonStepRows: [] as Row[],
    lesson: {
      async findFirst({ where }: Row) {
        const row = db.lessonRows.find((l: Row) => l.id === where.id && ((l.scope === "SHARED_LIBRARY" && l.status === "published") || l.authorId === where.OR[1].authorId));
        return row ? { id: row.id } : null;
      },
      async findUnique({ where, select }: Row) {
        const row = db.lessonRows.find((l: Row) => l.id === where.id);
        if (!row) return null;
        if (!select?.steps) return { id: row.id };
        return { ...row, steps: db.lessonStepRows.filter((s: Row) => s.lessonId === row.id && s.type === "READING") };
      },
    },
    async $executeRaw() { return 0; },
    async $transaction(fn: (tx: any) => Promise<any>) {
      const run = chain.then(() => fn(db));
      chain = run.then(() => undefined, () => undefined);
      return run;
    },
  };
  return db as any;
}

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
const okText = (n = 2) => JSON.stringify({ items: Array.from({ length: n }, (_, i) => ({
  type: "SINGLE_CHOICE", prompt: `Cường độ dòng điện câu số ${"ABCDEFGHIJ"[i]} được đo bằng gì`, options: ["Ampe kế", "Vôn kế", "Nhiệt kế"], correctOption: 0,
  explanation: "Ampe kế đo cường độ dòng điện.", difficulty: "STANDARD", outcomeCodes: [], sourceRefs: ["P1"],
})) });
const body = (patch: Row = {}) => ({ purpose: "GENERATE_RESOURCE", targetKind: "TEST", lessonId: "lesson-circuit", itemCount: 2, ...patch });
const req = (user = OWNER, key: string | null = `key-${++seq}-abcdef`) => ({ user, headers: key === null ? {} : { "idempotency-key": key } });
const config = (env: Row = {}) => parseAiConfig({ AI_PROVIDER: "fake", AI_PROVIDER_MIN_INTERVAL_MS: "0", ...env } as any);

let provider: ScriptedProvider;
let service: AiJobsService;
let runner: AiJobRunner;

beforeEach(() => {
  store = makeDb();
  store.classroom.rows.push({ id: "class-a", teacherId: OWNER.sub, status: "ACTIVE" }, { id: "class-archived", teacherId: OWNER.sub, status: "ARCHIVED" });
  store.lessonRows.push({ id: "lesson-circuit", title: "Mạch điện", grade: 8, domain: "ENERGY", topic: "Dòng điện", learningObjective: "Hiểu dòng điện", content: "<p>Dòng điện là...</p>", outcomeCodes: ["KHTN8.E1"], scope: "SHARED_LIBRARY", status: "published", authorId: "admin" });
  store.lessonRows.push({ id: "lesson-private-other", title: "x", grade: 8, domain: null, topic: "x", learningObjective: "x", content: "x", outcomeCodes: [], scope: "TEACHER_PRIVATE", status: "draft", authorId: "someone-else" });
  store.lessonStepRows.push({ lessonId: "lesson-circuit", type: "READING", position: 1, config: { html: "<p>Đọc thêm</p>" } }, { lessonId: "lesson-circuit", type: "QUIZ", position: 2, config: { questions: [{ correctOption: 1 }] } });
  store.curriculumOutcome.rows.push({ id: "KHTN8.E1", code: "KHTN8.E1", statement: "Mô tả dòng điện" });
  provider = new ScriptedProvider();
  const cfg = config();
  service = new AiJobsService(store, cfg, provider);
  runner = new AiJobRunner(store, cfg, provider);
});

const create = (patch: Row = {}, r = req()) => service.create("class-a", r, body(patch));
const job = (jobId: string) => store.aiJob.rows.find((row: Row) => row.id === jobId);

describe("POST classes/:id/ai-jobs", () => {
  it("creates one PENDING job with a pinned snapshot, and replays the same key", async () => {
    const r = req();
    const first = await create({}, r);
    expect(first).toMatchObject({ status: "PENDING", requestedCount: 2, promptVersion: "generate-resource@2", outputSchemaVersion: "resource-items@1", model: "fake-model" });
    const replay = await create({}, r);
    expect(replay.id).toBe(first.id);
    expect(store.aiJob.rows).toHaveLength(1);
    const snapshot = job(first.id).inputSnapshot;
    expect(snapshot.passages.map((p: Row) => p.text)).toEqual(["Hiểu dòng điện", "Dòng điện là...", "Đọc thêm"]);
    expect(JSON.stringify(snapshot)).not.toContain("correctOption");
    expect(snapshot.outcomes).toEqual([{ code: "KHTN8.E1", statement: "Mô tả dòng điện" }]);
    expect(store.auditLog.rows.map((a: Row) => a.action)).toEqual(["ai_job.create"]);
    expect(JSON.stringify(store.auditLog.rows[0].after)).not.toContain("instruction");
  });

  it("rejects a reused key with a different body (409) and creates nothing", async () => {
    const r = req();
    await create({}, r);
    await expect(create({ itemCount: 3 }, r)).rejects.toMatchObject({ response: { code: "IDEMPOTENCY_KEY_REUSED" } });
    expect(store.aiJob.rows).toHaveLength(1);
  });

  it("maps every denial to its documented code and creates no job", async () => {
    await expect(create({}, req(OWNER, null))).rejects.toMatchObject({ status: 400, response: { code: "IDEMPOTENCY_KEY_REQUIRED" } });
    await expect(create({}, req(OUTSIDER))).rejects.toMatchObject({ status: 403, response: { code: "CLASS_ACCESS_DENIED" } });
    await expect(service.create("class-missing", req(), body())).rejects.toMatchObject({ status: 403, response: { code: "CLASS_ACCESS_DENIED" } });
    await expect(service.create("class-archived", req(), body())).rejects.toMatchObject({ status: 409, response: { code: "CLASS_ARCHIVED" } });
    await expect(create({ lessonId: "lesson-private-other" })).rejects.toMatchObject({ status: 400, response: { code: "LESSON_NOT_AVAILABLE" } });
    await expect(create({ lessonId: "lesson-missing" })).rejects.toMatchObject({ status: 400, response: { code: "LESSON_NOT_AVAILABLE" } });
    await expect(create({ outcomeCodes: ["KHTN9.X"] })).rejects.toMatchObject({ status: 400, response: { code: "VALIDATION_FAILED" } });
    await expect(create({ purpose: "UNKNOWN" })).rejects.toBeInstanceOf(ZodError);
    const unconfigured = new AiJobsService(store, parseAiConfig({} as any), null);
    await expect(unconfigured.create("class-a", req(), body())).rejects.toMatchObject({ status: 503, response: { code: "AI_PROVIDER_NOT_CONFIGURED" } });
    expect(store.aiJob.rows).toHaveLength(0);
  });

  it("enforces the 2-job concurrency limit (2 pass, 3rd is 429)", async () => {
    await create();
    await create();
    await expect(create()).rejects.toMatchObject({ status: 429, response: { code: "AI_QUOTA_EXCEEDED", purpose: "GENERATE_RESOURCE" } });
    expect(store.aiJob.rows).toHaveLength(2);
  });

  it("enforces the daily limit at 20/21 and lets provider-side failures not count", async () => {
    for (let i = 0; i < 19; i++) store.aiJob.rows.push({ id: `old-${i}`, actorId: OWNER.sub, purpose: "GENERATE_RESOURCE", status: "SUCCEEDED", createdAt: new Date(Date.now() - 3600_000) });
    store.aiJob.rows.push({ id: "provider-failed", actorId: OWNER.sub, purpose: "GENERATE_RESOURCE", status: "FAILED", failureCode: "PROVIDER_UNAVAILABLE", createdAt: new Date() });
    store.aiJob.rows.push({ id: "other-purpose", actorId: OWNER.sub, purpose: "ASSESS_SUBMISSION", status: "SUCCEEDED", createdAt: new Date() });
    store.aiJob.rows.push({ id: "yesterday", actorId: OWNER.sub, purpose: "GENERATE_RESOURCE", status: "SUCCEEDED", createdAt: new Date(Date.now() - 25 * 3600_000) });
    await create(); // 20th counted job passes
    const error = await create().then(() => null, (e) => e); // 21st
    expect(error?.response).toMatchObject({ code: "AI_QUOTA_EXCEEDED" });
    expect(error.response.resetsAt).toBe(new Date(store.aiJob.rows.find((r: Row) => r.id === "old-0").createdAt.getTime() + 24 * 3600_000).toISOString());
    expect(await service.quota({ user: OWNER }, {})).toMatchObject({ purpose: "GENERATE_RESOURCE", dailyLimit: 20, usedLast24h: 20, activeJobs: 1, concurrencyLimit: 2 });
    expect(await service.quota({ user: OWNER }, { purpose: "GENERATE_RESOURCE" })).toMatchObject({ usedLast24h: 20 });
  });

  it("serializes concurrent creates at the concurrency limit so only one passes", async () => {
    await create();
    const results = await Promise.allSettled([create(), create()]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((r) => r.status === "rejected").map((r: any) => r.reason.response.code)).toEqual(["AI_QUOTA_EXCEEDED"]);
  });
});

describe("GET, list and cancel", () => {
  it("returns 404 for a missing job or a job of another class, 403 for a foreign class", async () => {
    store.classroom.rows.push({ id: "class-b", teacherId: OWNER.sub, status: "ACTIVE" });
    const created = await create();
    await expect(service.get("class-b", created.id, req())).rejects.toMatchObject({ status: 404, response: { code: "NOT_FOUND" } });
    await expect(service.get("class-a", "missing", req())).rejects.toMatchObject({ status: 404 });
    await expect(service.get("class-a", created.id, req(OUTSIDER))).rejects.toMatchObject({ status: 403, response: { code: "CLASS_ACCESS_DENIED" } });
    await expect(service.list("class-a", req(OUTSIDER), {})).rejects.toMatchObject({ status: 403 });
  });

  it("flags a lesson edited after generation without blocking", async () => {
    const created = await create();
    expect((await service.get("class-a", created.id, req())).lessonChangedSinceGeneration).toBe(false);
    store.lessonRows[0].content = "<p>Nội dung mới</p>";
    expect((await service.get("class-a", created.id, req())).lessonChangedSinceGeneration).toBe(true);
    expect((await service.list("class-a", req(), {})).items[0].lessonChangedSinceGeneration).toBe(true);
  });

  it("lists newest first with a cursor", async () => {
    const a = await create();
    job(a.id).createdAt = new Date(Date.now() - 1000);
    const b = await create();
    const page1 = await service.list("class-a", req(), { limit: "1" });
    expect(page1.items.map((j: Row) => j.id)).toEqual([b.id]);
    const page2 = await service.list("class-a", req(), { limit: "1", cursor: page1.nextCursor });
    expect(page2).toMatchObject({ items: [{ id: a.id }], nextCursor: null });
  });

  it("cancels PENDING, is idempotent on CANCELLED and 409 on other terminal states", async () => {
    const created = await create();
    expect((await service.cancel("class-a", created.id, req())).status).toBe("CANCELLED");
    expect((await service.cancel("class-a", created.id, req())).status).toBe("CANCELLED");
    expect(store.auditLog.rows.filter((a: Row) => a.action === "ai_job.cancel")).toHaveLength(1);
    job(created.id).status = "SUCCEEDED";
    await expect(service.cancel("class-a", created.id, req())).rejects.toMatchObject({ status: 409, response: { code: "AI_JOB_NOT_CANCELLABLE" } });
  });
});

describe("runner state machine", () => {
  it("claims, calls the provider with the stored snapshot and persists items once", async () => {
    const created = await create();
    provider.queue.push(async () => ({ text: okText(2), inputTokens: 10, outputTokens: 20 }));
    expect(await runner.runOnce()).toBe(created.id);
    expect(job(created.id)).toMatchObject({ status: "SUCCEEDED", attemptCount: 1, inputTokens: 10, outputTokens: 20, leaseUntil: null });
    expect(store.aiJobItem.rows.map((i: Row) => i.position)).toEqual([0, 1]);
    expect(provider.calls[0].user).toContain("Đọc thêm");
    expect(provider.calls[0].timeoutMs).toBe(RUNNER_TIMINGS.providerTimeoutMs);
    expect(await runner.runOnce()).toBeNull();
    const view = await service.get("class-a", created.id, req());
    expect(view).toMatchObject({ status: "SUCCEEDED", validCount: 2, droppedCount: 0 });
    expect(store.auditLog.rows.map((a: Row) => a.action)).toEqual(["ai_job.create", "ai_job.complete"]);
  });

  it("flags duplicates of the class corpus, keeps them, and stores dropped reasons", async () => {
    store.classResource.rows.push(
      { id: "res-pub", title: "Đề cũ", classId: "class-a", kind: "TEST", status: "PUBLISHED", version: 1, content: { questions: [{ id: "q", prompt: "cường độ dòng điện câu số A được đo bằng gì?" }] } },
      { id: "res-arch", title: "Đề lưu trữ", classId: "class-a", kind: "TEST", status: "ARCHIVED", version: 1, content: { questions: [{ id: "q", prompt: "Cường độ dòng điện câu số B được đo bằng gì" }] } },
    );
    for (const id of ["res-pub", "res-arch"]) await syncClassResourceFingerprints(store, id);
    const created = await create({ itemCount: 2 });
    const items = JSON.parse(okText(3)).items;
    items[1].prompt = "Cường độ dòng điện câu số B được đo bằng gì";
    items[2].sourceRefs = ["P99"];
    provider.queue.push(async () => ({ text: JSON.stringify({ items }), inputTokens: 1, outputTokens: 1 }));
    await runner.runOnce();
    const view = await service.get("class-a", created.id, req());
    expect(view).toMatchObject({ status: "SUCCEEDED", validCount: 2, droppedCount: 1 });
    expect(view.items![0].flags).toContain("EXACT_DUPLICATE");
    expect(view.items![1].flags).not.toContain("EXACT_DUPLICATE");
    expect(job(created.id).droppedItems).toEqual([{ position: 2, reasonCodes: ["GROUNDING_REF_INVALID"] }]);
  });

  it("retries a schema failure once, then fails OUTPUT_SCHEMA_INVALID with tokens summed", async () => {
    const created = await create();
    provider.queue.push(async () => ({ text: "not json", inputTokens: 5, outputTokens: 1 }), async () => ({ text: "{}", inputTokens: 5, outputTokens: 1 }));
    await runner.runOnce();
    expect(job(created.id)).toMatchObject({ status: "PENDING", attemptCount: 1, inputTokens: 5 });
    await runner.runOnce();
    expect(job(created.id)).toMatchObject({ status: "FAILED", failureCode: "OUTPUT_SCHEMA_INVALID", attemptCount: MAX_ATTEMPTS, inputTokens: 10, outputTokens: 2 });
    expect(store.aiJobItem.rows).toHaveLength(0);
  });

  it("fails provider errors after two attempts without consuming quota", async () => {
    const created = await create();
    provider.queue.push(async () => { throw new AiProviderError("PROVIDER_UNAVAILABLE", 503); }, async () => { throw new AiProviderError("PROVIDER_UNAVAILABLE", 429); });
    await runner.runOnce();
    await runner.runOnce();
    expect(job(created.id)).toMatchObject({ status: "FAILED", failureCode: "PROVIDER_UNAVAILABLE" });
    expect((await service.quota({ user: OWNER }, {})).usedLast24h).toBe(0);
  });

  it("fails non-retryable codes immediately (INTERNAL_ERROR, OUTPUT_VALIDATION_FAILED, LESSON_UNAVAILABLE)", async () => {
    const a = await create();
    provider.queue.push(async () => { throw new AiProviderError("INTERNAL_ERROR", 400); });
    await runner.runOnce();
    expect(job(a.id)).toMatchObject({ status: "FAILED", failureCode: "INTERNAL_ERROR", attemptCount: 1 });
    const b = await create();
    provider.queue.push(async () => ({ text: '{"items":[]}', inputTokens: 1, outputTokens: 1 }));
    await runner.runOnce();
    expect(job(b.id)).toMatchObject({ status: "FAILED", failureCode: "OUTPUT_VALIDATION_FAILED" });
    const c = await create();
    store.lessonRows.splice(0, 1);
    await runner.runOnce();
    expect(job(c.id)).toMatchObject({ status: "FAILED", failureCode: "LESSON_UNAVAILABLE" });
    expect(provider.calls).toHaveLength(2);
  });

  it("discards a result that arrives after the teacher cancelled, but records its tokens", async () => {
    const created = await create();
    provider.queue.push(async () => {
      await service.cancel("class-a", created.id, req());
      return { text: okText(2), inputTokens: 7, outputTokens: 9 };
    });
    await runner.runOnce();
    expect(job(created.id)).toMatchObject({ status: "CANCELLED", inputTokens: 7, outputTokens: 9 });
    expect(store.aiJobItem.rows).toHaveLength(0);
  });

  it("requeues an expired lease once, then fails it", async () => {
    const created = await create();
    expect(await runner.claim(new Date())).toMatchObject({ id: created.id, attempt: 1 });
    const later = new Date(Date.now() + RUNNER_TIMINGS.leaseMs + 1000);
    expect(await runner.sweep(later)).toBe(1);
    expect(job(created.id)).toMatchObject({ status: "PENDING", attemptCount: 1 });
    expect(await runner.claim(new Date())).toMatchObject({ attempt: 2 });
    await runner.sweep(new Date(Date.now() + 2 * RUNNER_TIMINGS.leaseMs));
    expect(job(created.id)).toMatchObject({ status: "FAILED", failureCode: "INTERNAL_ERROR" });
  });

  it("writes items once when a reclaimed attempt persists late", async () => {
    const created = await create();
    const first = (await runner.claim(new Date()))!;
    await runner.sweep(new Date(Date.now() + RUNNER_TIMINGS.leaseMs + 1000));
    const second = (await runner.claim(new Date()))!;
    expect(second.attempt).toBe(2);
    await runner.succeed(second, [{ payload: { a: 1 }, flags: [] }], [], { inputTokens: 1, outputTokens: 1 }, new Date());
    await runner.succeed(first, [{ payload: { late: true }, flags: [] }, { payload: { late: true }, flags: [] }], [], { inputTokens: 1, outputTokens: 1 }, new Date());
    expect(job(created.id)).toMatchObject({ status: "SUCCEEDED", attemptCount: 2 });
    expect(store.aiJobItem.rows).toHaveLength(1);
    expect(store.auditLog.rows.filter((a: Row) => a.action === "ai_job.complete")).toHaveLength(1);
  });

  it("only one of two instances wins a claim", async () => {
    await create();
    const other = new AiJobRunner(store, config(), provider);
    const [a, b] = await Promise.all([runner.claim(new Date()), other.claim(new Date())]);
    expect([a, b].filter(Boolean)).toHaveLength(1);
  });

  it("does not start without a provider or when AI_RUNNER_ENABLED=false", () => {
    for (const r of [new AiJobRunner(store, parseAiConfig({} as any), null), new AiJobRunner(store, config({ AI_RUNNER_ENABLED: "false" }), provider)]) {
      r.onModuleInit();
      expect((r as any).timers).toHaveLength(0);
    }
  });

  it("retry decision follows the state machine", () => {
    expect(nextStatusAfterFailure("PROVIDER_TIMEOUT", 1)).toBe("PENDING");
    expect(nextStatusAfterFailure("PROVIDER_TIMEOUT", 2)).toBe("FAILED");
    expect(nextStatusAfterFailure("OUTPUT_VALIDATION_FAILED", 1)).toBe("FAILED");
    expect(nextStatusAfterFailure("LESSON_UNAVAILABLE", 1)).toBe("FAILED");
  });
});

describe("item decisions and materialization (TAI-T4)", () => {
  const question = (i: number, patch: Row = {}) => ({
    type: "SINGLE_CHOICE", prompt: `Câu hỏi số ${"ABCDEFGHIJ"[i]} về dòng điện trong mạch`, options: ["Ampe kế", "Vôn kế", "Nhiệt kế"], correctOption: 0,
    explanation: "Ampe kế đo cường độ dòng điện.", difficulty: "STANDARD", outcomeCodes: [], sourceRefs: ["P1"], ...patch,
  });
  async function succeeded(items: Row[], patch: Row = {}) {
    const created = await create({ itemCount: items.length, ...patch });
    provider.queue.push(async () => ({ text: JSON.stringify({ items }), inputTokens: 1, outputTokens: 1 }));
    await runner.runOnce();
    const view = await service.get("class-a", created.id, req());
    expect(view.status).toBe("SUCCEEDED");
    return view;
  }
  const decide = (jobId: string, itemId: string, body: Row, user = OWNER) => service.decide("class-a", jobId, itemId, req(user), body);
  const materialize = (jobId: string, r = req(), body: Row = { title: "Bài kiểm tra AI" }) => service.materialize("class-a", jobId, r, body);

  it("appends decisions, latest wins, and recomputes flags for an edit", async () => {
    const view = await succeeded([question(0), question(1)]);
    const [a, b] = view.items!;
    await decide(view.id, a.id, { decision: "REJECTED", reasonCode: "WRONG_KEY" });
    const after = await decide(view.id, a.id, { decision: "ACCEPTED" });
    expect(after.items![0].decision).toMatchObject({ decision: "ACCEPTED", reasonCode: null, flags: [] });
    const edited = await decide(view.id, b.id, { decision: "EDITED", editedPayload: question(1, { prompt: "Phát biểu nào sau đây KHÔNG đúng" }) });
    expect(edited.items![1].decision).toMatchObject({ decision: "EDITED", flags: ["NEGATIVE_STEM"] });
    expect(store.aiItemDecision.rows).toHaveLength(3);
    expect(store.auditLog.rows.filter((r: Row) => r.action === "ai_item.decide")).toHaveLength(3);
  });

  it("rejects invalid decisions with the documented codes", async () => {
    const view = await succeeded([question(0)]);
    const itemId = view.items![0].id;
    await expect(decide(view.id, itemId, { decision: "EDITED", editedPayload: question(0, { correctOption: 5 }) })).rejects.toMatchObject({ status: 400, response: { code: "AI_EDIT_INVALID", details: [{ rule: "VR-03" }] } });
    await expect(decide(view.id, itemId, { decision: "EDITED", editedPayload: question(0, { options: ["Ampe kế", "ampe kế"] }) })).rejects.toMatchObject({ response: { details: [{ rule: "VR-04" }] } });
    await expect(decide(view.id, itemId, { decision: "EDITED", editedPayload: { type: "CARD", front: "a", back: "b", sourceRefs: ["P1"] } })).rejects.toMatchObject({ response: { details: [{ rule: "VR-01" }] } });
    await expect(decide(view.id, itemId, { decision: "EDITED", editedPayload: { prompt: "x" } })).rejects.toMatchObject({ response: { code: "AI_EDIT_INVALID", details: [{ rule: "resource-items@1" }] } });
    await expect(decide(view.id, itemId, { decision: "EDITED" })).rejects.toBeInstanceOf(ZodError);
    await expect(decide(view.id, itemId, { decision: "REJECTED" })).rejects.toBeInstanceOf(ZodError);
    await expect(decide(view.id, itemId, { decision: "ACCEPTED", reasonCode: "X_Y" })).rejects.toBeInstanceOf(ZodError);
    await expect(decide(view.id, itemId, { decision: "ACCEPTED" }, OUTSIDER)).rejects.toMatchObject({ status: 403, response: { code: "CLASS_ACCESS_DENIED" } });
    await expect(decide(view.id, "missing-item", { decision: "ACCEPTED" })).rejects.toMatchObject({ status: 404 });
    const pending = await create();
    await expect(decide(pending.id, itemId, { decision: "ACCEPTED" })).rejects.toMatchObject({ status: 409, response: { code: "AI_JOB_NOT_REVIEWABLE" } });
    store.classroom.rows[0].status = "ARCHIVED";
    await expect(decide(view.id, itemId, { decision: "ACCEPTED" })).rejects.toMatchObject({ status: 409, response: { code: "CLASS_ARCHIVED" } });
    expect(store.aiItemDecision.rows).toHaveLength(0);
  });

  it("shows duplicateOf for flagged items and still allows ACCEPTED", async () => {
    store.classResource.rows.push({ id: "res-old", classId: "class-a", title: "Đề cũ chương 1", kind: "TEST", status: "PUBLISHED", version: 1, content: { questions: [{ id: "q", prompt: question(0).prompt }] } });
    store.classResource.rows.push({ id: "res-archived", classId: "class-a", title: "Đề đã lưu trữ", kind: "TEST", status: "ARCHIVED", version: 1, content: { questions: [{ id: "q", prompt: question(0).prompt }] } });
    store.classroom.rows.push({ id: "class-other", teacherId: OWNER.sub, status: "ACTIVE", name: "Lớp 8B" });
    store.classResource.rows.push({ id: "res-other", classId: "class-other", title: "Đề lớp 8B", kind: "TEST", status: "PUBLISHED", version: 1, content: { questions: [{ id: "q", prompt: question(0).prompt }] } });
    store.classroom.rows.push({ id: "class-outsider", teacherId: OUTSIDER.sub, status: "ACTIVE", name: "Lớp ngoài" });
    store.classResource.rows.push({ id: "res-outsider", classId: "class-outsider", title: "Đề người khác", kind: "TEST", status: "PUBLISHED", version: 1, content: { questions: [{ id: "q", prompt: question(0).prompt }] } });
    for (const id of ["res-old", "res-archived", "res-other", "res-outsider"]) await syncClassResourceFingerprints(store, id);
    const view = await succeeded([question(0), question(1, { prompt: "Một câu hoàn toàn khác về nhiệt độ" })]);
    expect(view.items![0].flags).toEqual(expect.arrayContaining(["EXACT_DUPLICATE", "EXACT_DUPLICATE_ELSEWHERE"]));
    expect(view.items![0].duplicateOf).toEqual([
      { sourceKind: "CLASS_RESOURCE", resourceId: "res-old", resourceTitle: "Đề cũ chương 1", match: "EXACT", similarity: 1, flag: "EXACT_DUPLICATE" },
      { sourceKind: "CLASS_RESOURCE", resourceId: "res-other", resourceTitle: "Đề lớp 8B", className: "Lớp 8B", match: "EXACT", similarity: 1, flag: "EXACT_DUPLICATE_ELSEWHERE" },
    ]);
    // Another teacher's identical question never appears.
    expect(JSON.stringify(view)).not.toContain("Đề người khác");
    expect(view.items![1].duplicateOf).toEqual([]);
    expect((await decide(view.id, view.items![0].id, { decision: "ACCEPTED" })).items![0].decision?.decision).toBe("ACCEPTED");
  });

  it("requires every item decided and at least one kept", async () => {
    const view = await succeeded([question(0), question(1)]);
    await expect(materialize(view.id)).rejects.toMatchObject({ status: 409, response: { code: "AI_REVIEW_INCOMPLETE" } });
    await decide(view.id, view.items![0].id, { decision: "REJECTED", reasonCode: "OFF_TOPIC" });
    await expect(materialize(view.id)).rejects.toMatchObject({ response: { code: "AI_REVIEW_INCOMPLETE" } });
    await decide(view.id, view.items![1].id, { decision: "REJECTED", reasonCode: "OFF_TOPIC" });
    await expect(materialize(view.id)).rejects.toMatchObject({ response: { code: "AI_REVIEW_INCOMPLETE" } });
    await expect(materialize(view.id, req(OWNER, null))).rejects.toMatchObject({ status: 400, response: { code: "IDEMPOTENCY_KEY_REQUIRED" } });
    await expect(materialize(view.id, req(), { title: "" })).rejects.toBeInstanceOf(ZodError);
    expect(store.classResource.rows).toHaveLength(0);
  });

  it("creates one TEST DRAFT with the answer key, edits applied and rejections left out; replays and blocks a second materialization", async () => {
    const view = await succeeded([question(0), question(1), question(2)]);
    const [a, b, c] = view.items!;
    await decide(view.id, a.id, { decision: "ACCEPTED" });
    await decide(view.id, b.id, { decision: "EDITED", editedPayload: question(1, { prompt: "Câu đã sửa", correctOption: 2 }) });
    await decide(view.id, c.id, { decision: "REJECTED", reasonCode: "DUPLICATE" });
    const r = req();
    const resource = await materialize(view.id, r);
    expect(resource).toMatchObject({ kind: "TEST", status: "DRAFT", title: "Bài kiểm tra AI", lessonId: "lesson-circuit", classId: "class-a", lessonChangedSinceGeneration: false });
    expect(resource.content.questions.map((q: Row) => [q.prompt, q.correctOption])).toEqual([[question(0).prompt, 0], ["Câu đã sửa", 2]]);
    expect(resource.content.questions[0].options[0]).toMatchObject({ text: "Ampe kế" });
    expect(job(view.id).materializedResourceId).toBe(resource.id);
    expect(store.auditLog.rows.find((row: Row) => row.action === "ai_job.materialize").after).toMatchObject({ resourceId: resource.id, resourceKind: "TEST", acceptedCount: 1, editedCount: 1, rejectedCount: 1 });
    expect((await materialize(view.id, r)).id).toBe(resource.id);
    await expect(materialize(view.id)).rejects.toMatchObject({ status: 409, response: { code: "AI_JOB_ALREADY_MATERIALIZED" } });
    await expect(decide(view.id, a.id, { decision: "REJECTED", reasonCode: "LATE" })).rejects.toMatchObject({ status: 409, response: { code: "AI_JOB_ALREADY_MATERIALIZED" } });
    expect(store.classResource.rows).toHaveLength(1);
    expect((await service.get("class-a", view.id, req())).materializedResourceId).toBe(resource.id);
    // TAI3-T1: the materialized DRAFT gets qdup@1 fingerprints in the same transaction.
    expect(store.questionFingerprint.rows.map((f: Row) => [f.sourceKind, f.sourceId, f.classId, f.ownerTeacherId])).toEqual([
      ["CLASS_RESOURCE", resource.id, "class-a", OWNER.sub], ["CLASS_RESOURCE", resource.id, "class-a", OWNER.sub],
    ]);
  });

  it("keeps the answer key and explanation for STUDY_QUIZ and maps cards for DECK", async () => {
    const quiz = await succeeded([question(0)], { targetKind: "STUDY_QUIZ" });
    await decide(quiz.id, quiz.items![0].id, { decision: "ACCEPTED" });
    const quizResource = await materialize(quiz.id);
    expect(quizResource.kind).toBe("STUDY_QUIZ");
    expect(quizResource.content.questions[0]).toMatchObject({ correctOption: question(0).correctOption, explanation: question(0).explanation });
    const deck = await succeeded([{ type: "CARD", front: "Ampe kế", back: "Đo cường độ dòng điện", sourceRefs: ["P1"] }], { targetKind: "DECK" });
    await decide(deck.id, deck.items![0].id, { decision: "ACCEPTED" });
    const deckResource = await materialize(deck.id);
    expect(deckResource.content.cards).toEqual([expect.objectContaining({ front: "Ampe kế", back: "Đo cường độ dòng điện" })]);
  });

  it("keeps the draft invisible to students until the existing publish step", async () => {
    const { ClassResourcesService } = await import("../../classes/application/class-resources.service");
    store.enrollment = { findUnique: async () => ({ status: "approved" }) };
    const view = await succeeded([question(0)]);
    await decide(view.id, view.items![0].id, { decision: "ACCEPTED" });
    await materialize(view.id);
    const resources = new ClassResourcesService(store);
    expect(await resources.list("class-a", { user: { sub: "student-1", role: "STUDENT" } })).toEqual([]);
    expect(await resources.list("class-a", { user: OWNER })).toHaveLength(1);
  });
});
