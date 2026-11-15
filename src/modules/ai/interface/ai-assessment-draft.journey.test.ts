import { ZodError } from "zod";
import { beforeEach, describe, expect, it } from "vitest";
import { parseAiCreditsConfig } from "../../../config/ai-credits";
import { digest as labDigest } from "../../labs/application/lab-run";
import { normalizeExam } from "../../classes/application/exam-contract";
import { parseAiConfig } from "../application/ai-config";
import { AiJobRunner } from "../application/ai-job-runner";
import { AiJobsService } from "../application/ai-jobs.service";
import { AiCreditsAdminService } from "../application/credits-admin.service";
import { AiCreditsService } from "../application/credits.service";
import { makeCreditsStore, type CreditsStore, type Row } from "../application/credits-test-kit";
import { FakeAiProvider } from "../infrastructure/fake-provider";
import { AiJobsController } from "./ai-jobs.controller";

/**
 * TAI7-T5 job lifecycle without a database: create (owner, lesson, Lab eligibility, quota, credits) -> runner (fake provider,
 * stored snapshot only) -> detail with one draft item the teacher loads into the exam editor. Item decisions and
 * materialization are refused for this purpose. Real controllers, services and runner; Prisma is the in-memory kit.
 */
const OWNER = { sub: "teacher-owner", role: "TEACHER" };
const OUTSIDER = { sub: "teacher-outsider", role: "TEACHER" };
const ADMIN = { sub: "admin-1", role: "ADMIN" };
const CLASS = "class-a";
let seq = 0;
const key = () => `draft-${++seq}-key-abcdef`;
const req = (user: Row, k: string | null = null) => ({ user, headers: k ? { "idempotency-key": k } : {}, path: "/api" });
const codeOf = (p: Promise<unknown>) => p.then(() => null, (e: any) => (e instanceof ZodError ? "ZOD" : e.response?.code ?? e.status ?? String(e)));
const MATRIX = { RECALL: 40, UNDERSTAND: 40, APPLY: 20 };
const body = (patch: Row = {}) => ({
  purpose: "GENERATE_ASSESSMENT", lessonId: "lesson-shared", assessmentType: "REGULAR_15M", matrix: MATRIX,
  sections: { mcqCount: 6, writtenCount: 1, lab: null }, ...patch,
});
const withLab = (patch: Row = {}) => body({ sections: { mcqCount: 4, writtenCount: 1, lab: { labId: "lab-circuit", releaseId: "rel-1", challengeId: "ch-1" } }, ...patch });

let store: CreditsStore;
let provider: FakeAiProvider;
let ai: AiJobsController;
let runner: AiJobRunner;
let credits: AiCreditsService;
let admin: AiCreditsAdminService;
const aiConfig = parseAiConfig({ AI_PROVIDER: "fake", AI_PROVIDER_MIN_INTERVAL_MS: "0", AI_CONCURRENT_JOB_LIMIT: "5", AI_DAILY_JOB_LIMIT: "20" } as any);
const jobs = () => store.aiJob.rows as Row[];

function labRow() {
  const snapshot = { lab: { id: "lab-circuit" }, execution: { packVersionId: "pv-1", effectiveParams: { "ch-1": { maxCurrentMa: 15 } }, template: { ranges: {} } } };
  return {
    id: "lab-circuit", title: "Mạch điện và bóng đèn", grade: 8, topic: "Dòng điện", subject: { id: "s1", name: "KHTN" },
    challenges: [{ id: "ch-1", objective: "Mắc mạch để đèn sáng với cường độ 15 mA" }],
    releases: [{ id: "rel-1", version: 1, digest: labDigest(snapshot), snapshot }],
  };
}

function build(options: { credits?: boolean; revokeLab?: boolean } = {}) {
  store = makeCreditsStore();
  const db: any = store;
  const lessons: Row[] = [
    { id: "lesson-shared", authorId: "admin-1", scope: "SHARED_LIBRARY", status: "published", title: "Mạch điện đơn giản", grade: 8, domain: "ENERGY", topic: "Dòng điện", learningObjective: "Mô tả mạch điện đơn giản.", content: "<p>Dòng điện là dòng các hạt mang điện dịch chuyển có hướng.</p><p>Ampe kế đo cường độ dòng điện và mắc nối tiếp.</p>", outcomeCodes: ["OUT1"] },
    { id: "lesson-other", authorId: OUTSIDER.sub, scope: "TEACHER_PRIVATE", status: "draft", title: "Của người khác", grade: 8, domain: null, topic: "x", learningObjective: "y", content: "<p>z</p>", outcomeCodes: [] },
  ];
  const matchLesson = (row: Row, where: Row): boolean => Object.entries(where).every(([k, v]) => (k === "OR" ? (v as Row[]).some((c) => matchLesson(row, c)) : row[k] === v));
  db.lesson = {
    async findFirst({ where }: Row) { const row = lessons.find((l) => matchLesson(l, where)); return row ? { id: row.id } : null; },
    async findUnique({ where, select }: Row) {
      const row = lessons.find((l) => l.id === where.id);
      if (!row) return null;
      return { ...(select ? Object.fromEntries(Object.keys(select).filter((k) => k !== "steps").map((k) => [k, row[k]])) : row), ...(select?.steps ? { steps: [{ position: 1, config: { html: "<p>Công tắc đóng thì mạch kín và đèn sáng.</p>" } }] } : {}) };
    },
  };
  db.lab = { async findMany() { return [labRow()]; }, create: async () => { throw new Error("the AI module must never write a Lab"); } };
  db.labPackRevocation = { async findMany() { return options.revokeLab ? [{ packVersionId: "pv-1" }] : []; } };
  store.classroom.rows.push({ id: CLASS, teacherId: OWNER.sub, status: "ACTIVE" }, { id: "class-b", teacherId: OUTSIDER.sub, status: "ACTIVE" }, { id: "class-archived", teacherId: OWNER.sub, status: "ARCHIVED" });
  for (const u of [OWNER, OUTSIDER, ADMIN]) store.user.rows.push({ id: u.sub, role: u.role });
  store.curriculumOutcome.rows.push({ id: "OUT1", code: "OUT1", statement: "Mô tả được mạch điện đơn giản" });
  provider = new FakeAiProvider();
  credits = new AiCreditsService(db, parseAiCreditsConfig(options.credits ? { AI_CREDITS_ENABLED: "true" } : {}));
  ai = new AiJobsController(new AiJobsService(db, aiConfig, provider, undefined, options.credits ? credits : undefined));
  runner = new AiJobRunner(db, aiConfig, provider, options.credits ? credits : undefined);
  admin = new AiCreditsAdminService(db);
}

/** create + one runner pass, then the teacher's detail view. */
async function draft(patch: Row = {}, user: Row = OWNER) {
  const created: any = await ai.create(CLASS, req(user, key()), body(patch));
  await runner.runOnce();
  return (await ai.get(CLASS, created.id, req(user))) as any;
}

beforeEach(() => build());

describe("TAI7-T5 create", () => {
  it("queues one PENDING job priced by its slots, with the blueprint in the stored snapshot and replay by key", async () => {
    const k = key();
    const created: any = await ai.create(CLASS, req(OWNER, k), body());
    expect(created).toMatchObject({ purpose: "GENERATE_ASSESSMENT", status: "PENDING", requestedCount: 7, assessmentType: "REGULAR_15M", promptVersion: "generate-assessment@1", outputSchemaVersion: "assessment-items@1", targetKind: null });
    expect((await ai.create(CLASS, req(OWNER, k), body())).id).toBe(created.id);
    expect(await codeOf(ai.create(CLASS, req(OWNER, k), body({ assessmentType: "MIDTERM_45M" })))).toBe("IDEMPOTENCY_KEY_REUSED");
    expect(jobs()).toHaveLength(1);
    const snapshot = jobs()[0]!.inputSnapshot;
    expect(snapshot.blueprint.mcq).toHaveLength(6);
    expect(snapshot.blueprint.written).toEqual([{ slot: 0, cognitiveLevel: "APPLY", budgetPoints: 4, maxCriteria: 3 }]);
    expect(snapshot.passages.length).toBeGreaterThan(0);
    expect(snapshot.lab).toBeNull();
    expect(Object.keys(jobs()[0]!.request).sort()).toEqual(["assessmentType", "instruction", "itemCount", "lessonId", "matrix", "purpose", "sections"]);
  });

  it("lists these jobs under their own purpose and keeps them out of the TAI-01 list", async () => {
    const created: any = await ai.create(CLASS, req(OWNER, key()), body());
    const mine: any = await ai.list(CLASS, req(OWNER), { purpose: "GENERATE_ASSESSMENT" });
    expect(mine.items.map((job: Row) => job.id)).toEqual([created.id]);
    expect(((await ai.list(CLASS, req(OWNER), {})) as any).items).toEqual([]);
    expect(await ai.quota(req(OWNER), { purpose: "GENERATE_ASSESSMENT" })).toMatchObject({ purpose: "GENERATE_ASSESSMENT", usedLast24h: 1, activeJobs: 1 });
  });

  it("denies and rejects like the other purposes: owner, archived class, lesson, key and body", async () => {
    expect(await codeOf(ai.create(CLASS, req(OUTSIDER, key()), body()))).toBe("CLASS_ACCESS_DENIED");
    expect(await codeOf(ai.create("class-archived", req(OWNER, key()), body()))).toBe("CLASS_ARCHIVED");
    expect(await codeOf(ai.create(CLASS, req(OWNER, key()), body({ lessonId: "lesson-other" })))).toBe("LESSON_NOT_AVAILABLE");
    expect(await codeOf(ai.create(CLASS, req(OWNER), body()))).toBe("IDEMPOTENCY_KEY_REQUIRED");
    expect(await codeOf(ai.create(CLASS, req(OWNER, key()), body({ matrix: { RECALL: 50, UNDERSTAND: 50, APPLY: 50 } })))).toBe("ZOD");
    expect(await codeOf(ai.create(CLASS, req(OWNER, key()), body({ sections: { mcqCount: 5, writtenCount: 0, lab: null } })))).toBe("ZOD");
    expect(jobs()).toHaveLength(0);
  });

  it("accepts only a Lab from the eligible list, with a challenge of that release", async () => {
    const created: any = await ai.create(CLASS, req(OWNER, key()), withLab());
    expect(created.requestedCount).toBe(6);
    expect(jobs()[0]!.inputSnapshot.lab).toEqual({ labId: "lab-circuit", releaseId: "rel-1", challengeId: "ch-1", labTitle: "Mạch điện và bóng đèn", objective: "Mắc mạch để đèn sáng với cường độ 15 mA" });
    expect(jobs()[0]!.inputSnapshot.blueprint.lab).toMatchObject({ cognitiveLevel: "APPLY" });
    const lab = (patch: Row) => withLab({ sections: { mcqCount: 4, writtenCount: 1, lab: { labId: "lab-circuit", releaseId: "rel-1", challengeId: "ch-1", ...patch } } });
    expect(await codeOf(ai.create(CLASS, req(OWNER, key()), lab({ labId: "lab-unknown" })))).toBe("EXAM_LAB_UNAVAILABLE");
    expect(await codeOf(ai.create(CLASS, req(OWNER, key()), lab({ releaseId: "rel-old" })))).toBe("EXAM_LAB_UNAVAILABLE");
    expect(await codeOf(ai.create(CLASS, req(OWNER, key()), lab({ challengeId: "ch-9" })))).toBe("EXAM_LAB_UNAVAILABLE");
    build({ revokeLab: true });
    expect(await codeOf(ai.create(CLASS, req(OWNER, key()), withLab()))).toBe("EXAM_LAB_UNAVAILABLE");
  });

  it("enforces the per-purpose quota", async () => {
    for (let i = 0; i < 5; i++) await ai.create(CLASS, req(OWNER, key()), body());
    expect(await codeOf(ai.create(CLASS, req(OWNER, key()), body()))).toBe("AI_QUOTA_EXCEEDED");
  });
});

describe("TAI7-T5 run and review", () => {
  it("produces one draft item: a 10,00-point paper the exam contract accepts, from the stored snapshot only", async () => {
    const view = await draft();
    expect(view).toMatchObject({ status: "SUCCEEDED", purpose: "GENERATE_ASSESSMENT", requestedCount: 7, validCount: 7, droppedCount: 0 });
    expect(provider.calls).toHaveLength(1);
    expect(provider.calls[0]!.user).toContain("Dòng điện là dòng các hạt mang điện");
    expect(provider.calls[0]!.user).not.toContain(OWNER.sub);
    expect(view.items).toHaveLength(1);
    const payload = view.items[0].payload;
    expect(payload.review.totals).toEqual({ points: 10, mcq: 6, written: 4, lab: 0 });
    expect(payload.review.matrix.actual).toEqual({ RECALL: 3, UNDERSTAND: 3, APPLY: 1 });
    expect(() => normalizeExam(payload.content)).not.toThrow();
    expect(view.items[0].flags).toEqual([]);
    expect(view.items[0].decision).toBeNull();
    expect(store.classResource.rows).toHaveLength(0); // AI never writes the resource: the teacher saves it from the editor
  });

  it("builds a three-part paper with the picked Lab", async () => {
    const created: any = await ai.create(CLASS, req(OWNER, key()), withLab({ assessmentType: "MIDTERM_45M" }));
    await runner.runOnce();
    const view: any = await ai.get(CLASS, created.id, req(OWNER));
    expect(view.items[0].payload.review.totals).toEqual({ points: 10, mcq: 4, written: 4, lab: 2 });
    expect(view.items[0].payload.content.labs).toEqual([expect.objectContaining({ labId: "lab-circuit", releaseId: "rel-1", challengeId: "ch-1", points: 2, cognitiveLevel: "APPLY" })]);
    expect(() => normalizeExam(view.items[0].payload.content)).not.toThrow();
  });

  it("keeps a partial paper at 10,00 points and tells the teacher which slots were dropped", async () => {
    provider.mode = "unsafe";
    const view = await draft();
    expect(view).toMatchObject({ status: "SUCCEEDED", validCount: 6, droppedCount: 1 });
    expect(view.items[0].flags).toContain("SLOTS_DROPPED");
    expect(view.items[0].payload.review.totals.points).toBe(10);
  });

  it("fails clearly and retries once: provider outage, bad JSON and a paper with fewer than two sections", async () => {
    provider.mode = "unavailable";
    const outage: any = await ai.create(CLASS, req(OWNER, key()), body());
    await runner.runOnce();
    await runner.runOnce();
    expect(await ai.get(CLASS, outage.id, req(OWNER))).toMatchObject({ status: "FAILED", failureCode: "PROVIDER_UNAVAILABLE", validCount: null });
    provider.mode = "invalid_json";
    const broken: any = await ai.create(CLASS, req(OWNER, key()), body());
    await runner.runOnce();
    expect(((await ai.get(CLASS, broken.id, req(OWNER))) as any).status).toBe("PENDING");
    await runner.runOnce();
    expect(await ai.get(CLASS, broken.id, req(OWNER))).toMatchObject({ status: "FAILED", failureCode: "OUTPUT_SCHEMA_INVALID" });
    provider.mode = "ok";
    provider.assessmentDraft = () => ({ mcq: [], written: [], lab: null });
    const empty: any = await ai.create(CLASS, req(OWNER, key()), body());
    await runner.runOnce();
    expect(await ai.get(CLASS, empty.id, req(OWNER))).toMatchObject({ status: "FAILED", failureCode: "OUTPUT_VALIDATION_FAILED", droppedCount: 7 });
  });

  it("refuses item decisions and materialization: the draft is edited in the exam editor", async () => {
    const view = await draft();
    expect(await codeOf(ai.decide(CLASS, view.id, view.items[0].id, req(OWNER), { decision: "ACCEPTED" }))).toBe("VALIDATION_FAILED");
    expect(await codeOf(ai.materialize(CLASS, view.id, req(OWNER, key()), { title: "Đề nháp" }))).toBe("VALIDATION_FAILED");
    expect(store.classResource.rows).toHaveLength(0);
  });

  it("is owner-only for reading and cancelling", async () => {
    const created: any = await ai.create(CLASS, req(OWNER, key()), body());
    expect(await codeOf(ai.get(CLASS, created.id, req(OUTSIDER)))).toBe("CLASS_ACCESS_DENIED");
    expect(await codeOf(ai.get("class-b", created.id, req(OUTSIDER)))).toBe("NOT_FOUND");
    expect(await ai.cancel(CLASS, created.id, req(OWNER))).toMatchObject({ status: "CANCELLED" });
  });
});

describe("TAI7-T5 credits (AI_CREDITS_ENABLED=true)", () => {
  beforeEach(async () => {
    build({ credits: true });
    await credits.ensureBaselinePricing();
    await admin.grant(OWNER.sub, req(ADMIN, key()), { credits: 100, reason: "Cấp cho giáo viên thí điểm" });
  });
  const available = () => store.creditAccount.rows.find((a: Row) => a.kind === "TEACHER_AVAILABLE" && a.ownerId === OWNER.sub)!.balance as number;
  const reserved = () => store.creditAccount.rows.find((a: Row) => a.kind === "TEACHER_RESERVED" && a.ownerId === OWNER.sub)!.balance as number;

  it("quotes 4 + 1 x slots, needs the confirmed estimate, reserves, and settles for the surviving slots", async () => {
    expect(await credits.estimate(CLASS, req(OWNER), body())).toMatchObject({ enabled: true, credits: 11 });
    expect(await credits.estimate(CLASS, req(OWNER), withLab({ assessmentType: "MIDTERM_45M" }))).toMatchObject({ credits: 10 });
    expect(await codeOf(ai.create(CLASS, req(OWNER, key()), body()))).toBe("VALIDATION_FAILED");
    expect(await codeOf(ai.create(CLASS, req(OWNER, key()), body({ confirmedCredits: 9 })))).toBe("AI_ESTIMATE_CHANGED");
    const created: any = await ai.create(CLASS, req(OWNER, key()), body({ confirmedCredits: 11 }));
    expect(created.credits).toMatchObject({ estimated: 11, state: "reserved" });
    expect([available(), reserved()]).toEqual([89, 11]);
    await runner.runOnce();
    const view: any = await ai.get(CLASS, created.id, req(OWNER));
    expect(view).toMatchObject({ status: "SUCCEEDED", credits: { estimated: 11, state: "settled" }, validCount: 7 });
    expect(view.credits.charged).toBeGreaterThan(0);
    expect(view.credits.charged).toBeLessThanOrEqual(11);
    expect(reserved()).toBe(0);
    expect(available()).toBe(100 - view.credits.charged);
    expect(view.usage).toBeUndefined();
  });

  it("charges less for a partial paper and refunds fully on failure and on cancel", async () => {
    provider.mode = "unsafe";
    const partial: any = await ai.create(CLASS, req(OWNER, key()), body({ confirmedCredits: 11 }));
    await runner.runOnce();
    const settled: any = await ai.get(CLASS, partial.id, req(OWNER));
    expect(settled.validCount).toBe(6);
    expect(settled.credits.charged).toBeLessThanOrEqual(Math.ceil((11 * 6) / 7));
    provider.mode = "unavailable";
    const failed: any = await ai.create(CLASS, req(OWNER, key()), body({ confirmedCredits: 11 }));
    await runner.runOnce();
    await runner.runOnce();
    expect(await ai.get(CLASS, failed.id, req(OWNER))).toMatchObject({ status: "FAILED", credits: { state: "refunded", refunded: 11 } });
    const cancelled: any = await ai.create(CLASS, req(OWNER, key()), body({ confirmedCredits: 11 }));
    expect(await ai.cancel(CLASS, cancelled.id, req(OWNER))).toMatchObject({ credits: { state: "refunded", refunded: 11 } });
    expect(reserved()).toBe(0);
    expect(available()).toBe(100 - settled.credits.charged);
  });
});
