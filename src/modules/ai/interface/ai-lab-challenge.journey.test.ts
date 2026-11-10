import { Reflector } from "@nestjs/core";
import { ZodError } from "zod";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { parseAiCreditsConfig } from "../../../config/ai-credits";
import { access, AuthGuard } from "../../auth/interface/auth";
import { evaluate } from "../../labs/application/simulation-versions";
import { writeLessonSteps } from "../../lessons/application/lesson-challenge";
import { CHALLENGE_PARAMETERS, challengeObjective } from "../../lessons/application/lesson-content";
import { parseAiConfig } from "../application/ai-config";
import { AiJobRunner } from "../application/ai-job-runner";
import { AiJobsService } from "../application/ai-jobs.service";
import { AiLabChallengesService } from "../application/ai-lab-challenges.service";
import { AiCreditsAdminService } from "../application/credits-admin.service";
import { AiCreditsService } from "../application/credits.service";
import { makeCreditsStore, type CreditsStore, type Row } from "../application/credits-test-kit";
import { builtinReferenceStates } from "../application/lab-reference-states";
import { FakeAiProvider } from "../infrastructure/fake-provider";
import { AiJobsController } from "./ai-jobs.controller";

/**
 * TAI6-T5 end-to-end proof without a database: the SPEC success-signal journey (request proposals for a draft private
 * lesson, review engine results, reject one, apply one, publish through the lesson write path, a student attempt
 * evaluated by the server engine with the applied parameters) plus the negatives: out-of-range values, an unknown lab,
 * code injection, student/parent/outsider access, provider failure, replay, cancel, a range change before apply and
 * credits reserve/settle/refund. Controllers, services, the runner and the real AuthGuard are the real ones; the
 * provider is the deterministic FakeAiProvider (no network); Prisma is the in-memory kit (serialized transactions with
 * rollback, no PostgreSQL). The real-database run of the same journey is scripts/tai06-integration.mjs (written, not run).
 */
const OWNER = { sub: "teacher-owner", role: "TEACHER" };
const OUTSIDER = { sub: "teacher-outsider", role: "TEACHER" };
const ADMIN = { sub: "admin-1", role: "ADMIN" };
const STUDENT = { sub: "student-active", role: "STUDENT" };
const PARENT = { sub: "parent-1", role: "PARENT" };
const ALL = [OWNER, OUTSIDER, ADMIN, STUDENT, PARENT];
const CLASS = "class-pilot-a";
let seq = 0;
const key = () => `lab-journey-${++seq}-key`;
const req = (user: Row, idempotencyKey: string | null = null) => ({ user, headers: idempotencyKey ? { "idempotency-key": idempotencyKey } : {}, path: "/api" });
const body = (patch: Row = {}) => ({ purpose: "DRAFT_LAB_CHALLENGE", lessonId: "lesson-draft", proposalCount: 3, ...patch });
const codeOf = (promise: Promise<unknown>) => promise.then(() => null, (error: any) => error.response?.code ?? error.status ?? String(error));
/** 400 for a Nest BadRequest; a Zod body error is mapped to 400 by the global filter. */
const statusOf = (promise: Promise<unknown>) => promise.then(() => null, (error: any) => (error instanceof ZodError ? 400 : (error.status ?? String(error))));

let store: CreditsStore;
let provider: FakeAiProvider;
let ai: AiJobsController;
let runner: AiJobRunner;
let credits: AiCreditsService;
let admin: AiCreditsAdminService;
const aiConfig = parseAiConfig({ AI_PROVIDER: "fake", AI_PROVIDER_MIN_INTERVAL_MS: "0", AI_CONCURRENT_JOB_LIMIT: "20", AI_DAILY_JOB_LIMIT: "50" } as any);
const lessons = () => (store as any).lessonRows as Row[];
const lessonRow = (id: string) => lessons().find((l) => l.id === id)!;
const jobs = () => store.aiJob.rows as Row[];
const challengeRows: Row[] = [];
const stepRows: Row[] = [];

/** Lessons, steps, evidence tables and simulation versions the TAI-06 code reads, on top of the credits kit. */
function extendStore(db: any, options: { packs?: Row[] } = {}) {
  const pick = (row: Row, select?: Row) => (select ? Object.fromEntries(Object.keys(select).filter((k) => k !== "steps").map((k) => [k, row[k]])) : { ...row });
  const matchLesson = (row: Row, where: Row): boolean =>
    Object.entries(where).every(([k, v]) => (k === "OR" ? (v as Row[]).some((c) => matchLesson(row, c)) : row[k] === v));
  db.lesson = {
    async findFirst({ where, select }: Row) {
      const row = lessons().find((l) => matchLesson(l, where));
      return row ? pick(row, select) : null;
    },
    async findUnique({ where, select }: Row) {
      const row = lessons().find((l) => l.id === where.id);
      if (!row) return null;
      const out = pick(row, select);
      if (select?.steps) out.steps = (db.stepRows as Row[]).filter((s) => s.lessonId === row.id && s.type === "READING").map((s) => ({ position: s.position, config: s.config }));
      return out;
    },
    async update({ where, data }: Row) {
      const row = lessons().find((l) => l.id === where.id)!;
      Object.assign(row, data, { updatedAt: new Date() });
      return { ...row };
    },
  };
  db.stepRows = stepRows;
  db.lessonStep = {
    async findMany({ where }: Row) {
      return stepRows.filter((s) => s.lessonId === where.lessonId).map((s) => ({ id: s.id, lessonId: s.lessonId }));
    },
    async deleteMany({ where }: Row) {
      const keep = stepRows.filter((s) => !(s.lessonId === where.lessonId && !where.id.notIn.includes(s.id)));
      stepRows.splice(0, stepRows.length, ...keep);
    },
    async upsert({ where, create, update }: Row) {
      const row = stepRows.find((s) => s.id === where.id);
      if (row) Object.assign(row, update);
      else stepRows.push({ ...create });
    },
  };
  const evidence = (rows: Row[], field: string) => ({
    async count({ where }: Row) {
      return rows.filter((r) => (where[field]?.in ? where[field].in.includes(r[field]) : r[field] === where[field] || where[field] === undefined) && (where.status === undefined || r.status === where.status)).length;
    },
  });
  db.evidence = { assignment: [] as Row[], stepProgress: [] as Row[], quizAttempt: [] as Row[], attempt: [] as Row[] };
  db.assignment = { async count({ where }: Row) { return db.evidence.assignment.filter((r: Row) => r.contentId === where.contentId && r.status === where.status).length; } };
  db.stepProgress = evidence(db.evidence.stepProgress, "stepId");
  db.quizAttempt = evidence(db.evidence.quizAttempt, "lessonId");
  db.attempt = evidence(db.evidence.attempt, "lessonStepId");
  db.challenge = {
    async upsert({ where, create, update }: Row) {
      const row = challengeRows.find((c) => c.id === where.id);
      if (row) Object.assign(row, update);
      else challengeRows.push({ ...create });
    },
  };
  db.simulationPackVersion = {
    async findMany({ where }: Row) {
      return (options.packs ?? db.packRows ?? []).filter((p: Row) => where.labId.in.includes(p.labId) && p.status === where.status);
    },
  };
  db.simulationConfigVersion = { async findMany() { return []; } };
  db.lab = { create: async () => { throw new Error("the AI module must never write a Lab"); } };
  db.packRows = [] as Row[];
  // aiJob rows start with the TAI-06 columns null, as in PostgreSQL.
  const create = db.aiJob.create.bind(db.aiJob);
  db.aiJob.create = (args: Row) => create({ ...args, data: { appliedLessonId: null, appliedItemId: null, ...args.data } });
  // Lesson and step rows roll back with the transaction, like the kit's tables.
  const transaction = db.$transaction.bind(db);
  db.$transaction = async (fn: any) => {
    const snapshot = structuredClone({ lessons: lessons(), steps: stepRows, challenges: challengeRows });
    try {
      return await transaction(fn);
    } catch (error) {
      lessons().splice(0, lessons().length, ...snapshot.lessons);
      stepRows.splice(0, stepRows.length, ...snapshot.steps);
      challengeRows.splice(0, challengeRows.length, ...snapshot.challenges);
      throw error;
    }
  };
}

function build(options: { credits?: boolean; lab?: { dailyLimit: number; concurrentLimit: number } } = {}) {
  process.env.JWT_SECRET ??= "tai06-journey-only";
  store = makeCreditsStore();
  challengeRows.length = 0;
  stepRows.length = 0;
  const db: any = store;
  db.lessonRows = [];
  extendStore(db);
  store.classroom.rows.push(
    { id: CLASS, teacherId: OWNER.sub, status: "ACTIVE" },
    { id: "class-pilot-b", teacherId: OUTSIDER.sub, status: "ACTIVE" },
    { id: "class-archived", teacherId: OWNER.sub, status: "ARCHIVED" },
  );
  for (const u of ALL) store.user.rows.push({ id: u.sub, role: u.role });
  store.curriculumOutcome.rows.push({ id: "KHTN8.E1", code: "KHTN8.E1", statement: "Mô tả được mạch điện đơn giản" });
  const base = { title: "Mạch điện đơn giản", grade: 8, domain: "ENERGY", topic: "Dòng điện", learningObjective: "Mô tả mạch điện đơn giản và đo cường độ dòng điện", content: "<p>Dòng điện là dòng các hạt mang điện dịch chuyển có hướng.</p>", outcomeCodes: ["KHTN8.E1"], labId: null, challengeParams: null, updatedAt: new Date() };
  lessons().push(
    { ...base, id: "lesson-draft", authorId: OWNER.sub, scope: "TEACHER_PRIVATE", status: "draft" },
    { ...base, id: "lesson-shared", authorId: "admin-1", scope: "SHARED_LIBRARY", status: "published" },
    { ...base, id: "lesson-published", authorId: OWNER.sub, scope: "TEACHER_PRIVATE", status: "published" },
    { ...base, id: "lesson-locked", authorId: OWNER.sub, scope: "TEACHER_PRIVATE", status: "draft" },
    { ...base, id: "lesson-other", authorId: OUTSIDER.sub, scope: "TEACHER_PRIVATE", status: "draft" },
    { ...base, id: "lesson-quarantined", authorId: OWNER.sub, scope: "TEACHER_PRIVATE", status: "quarantined" },
  );
  stepRows.push({ id: "step-draft-read", lessonId: "lesson-draft", type: "READING", position: 1, config: { html: "<p>Ampe kế được mắc nối tiếp với dụng cụ cần đo.</p>" } });
  db.evidence.assignment.push({ contentId: "lesson-locked", status: "ACTIVE" });
  provider = new FakeAiProvider();
  credits = new AiCreditsService(db, parseAiCreditsConfig(options.credits ? { AI_CREDITS_ENABLED: "true" } : {}));
  const lab = new AiLabChallengesService(db, aiConfig, provider, options.lab ?? { dailyLimit: 50, concurrentLimit: 20 }, options.credits ? credits : undefined);
  ai = new AiJobsController(new AiJobsService(db, aiConfig, provider, undefined, options.credits ? credits : undefined, lab));
  runner = new AiJobRunner(db, aiConfig, provider, options.credits ? credits : undefined);
  admin = new AiCreditsAdminService(db);
}

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

/** A job through create + one runner pass, returning the teacher's detail view. */
async function proposals(patch: Row = {}, user: Row = OWNER) {
  const created: any = await ai.create(CLASS, req(user, key()), body(patch));
  await runner.runOnce();
  return (await ai.get(CLASS, created.id, req(user))) as any;
}
const circuitParams = { maxCurrentMa: 15 };
const validProposal = (patch: Row = {}) => ({ labId: "circuit", challengeParams: circuitParams, rationale: "Dòng 15 mA vẫn an toàn cho LED và cho học sinh chọn điện trở.", outcomeCodes: ["KHTN8.E1"], sourceRefs: ["P1"], ...patch });
const scripted = (list: Row[]) => (provider.labChallenge = () => ({ proposals: list }));

beforeEach(() => build());

describe("TAI6-T5 SPEC success-signal journey (in-memory, fake provider)", () => {
  it("request, engine-verified proposals, reject one, apply one, publish, and a student attempt evaluated with the applied parameters", async () => {
    // 1. The owner of class-pilot-a asks for 3 proposals for a draft private lesson; the same key replays the job.
    const k = key();
    const created: any = await ai.create(CLASS, req(OWNER, k), body());
    expect(created).toMatchObject({ purpose: "DRAFT_LAB_CHALLENGE", status: "PENDING", requestedCount: 3, promptVersion: "draft-lab-challenge@1", outputSchemaVersion: "lab-challenge-proposals@1", targetKind: null });
    expect((await ai.create(CLASS, req(OWNER, k), body())).id).toBe(created.id);
    await expect(codeOf(ai.create(CLASS, req(OWNER, k), body({ proposalCount: 2 })))).resolves.toBe("IDEMPOTENCY_KEY_REUSED");
    expect(jobs()).toHaveLength(1);
    expect(jobs()[0].inputSnapshot.models.map((m: Row) => m.labId)).toEqual(["circuit", "chemistry", "eye"]);

    // 2. The runner calls the provider once, from the stored snapshot only; it asks for parameters, never code.
    expect(await runner.runOnce()).toBe(created.id);
    expect(provider.calls).toHaveLength(1);
    expect(provider.calls[0].user).toContain("Ampe kế được mắc nối tiếp");
    expect(provider.calls[0].system).toMatch(/KHÔNG VIẾT MÃ/);
    const view: any = await ai.get(CLASS, created.id, req(OWNER));
    expect(view).toMatchObject({ status: "SUCCEEDED", validCount: 3, droppedCount: 0, lessonChangedSinceGeneration: false, appliedItemId: null });
    expect(view.proposals).toHaveLength(3);
    for (const p of view.proposals) {
      const { labId, challengeParams } = p.proposal;
      expect(CHALLENGE_PARAMETERS[labId].rangeReview).toBe("team-lead-default");
      // Every proposal is in range, has at least one passing and one failing reference state, and a deterministic objective.
      expect(p.engineResults.some((r: Row) => r.verdict === "passed")).toBe(true);
      expect(p.engineResults.some((r: Row) => r.verdict !== "passed")).toBe(true);
      expect(p.objectivePreview).toBe(challengeObjective(labId, challengeParams));
      // The engine results equal a direct evaluate() on the same reference states.
      const states = builtinReferenceStates(labId);
      expect(p.engineResults).toEqual(states.map((s) => ({ label: s.label, verdict: evaluate(labId, s.state, challengeParams, CHALLENGE_PARAMETERS[labId].modelRef).verdict })));
      expect(p.modelRef).toBe(CHALLENGE_PARAMETERS[labId].modelRef);
      expect(p.decision).toBeNull();
    }
    expect(view.proposals.map((p: Row) => p.proposal.labId)).toEqual(["circuit", "chemistry", "eye"]);
    expect(jobs()[0].inputTokens).toBeGreaterThan(0);

    // 3. Reject the eye proposal; EDITED and ACCEPTED are not decisions on this route.
    const [circuit, , eye] = view.proposals;
    const afterReject: any = await ai.decide(CLASS, created.id, eye.id, req(OWNER), { decision: "REJECTED", reasonCode: "NOT_RELEVANT" });
    expect(afterReject.proposals[2].decision).toMatchObject({ decision: "REJECTED", reasonCode: "NOT_RELEVANT" });
    for (const bad of [{ decision: "ACCEPTED" }, { decision: "EDITED", editedPayload: {} }, { decision: "REJECTED" }]) await expect(statusOf(ai.decide(CLASS, created.id, circuit.id, req(OWNER), bad))).resolves.toBe(400);

    // 4. Apply the circuit proposal: it needs a key, then the draft lesson carries labId and parameters.
    await expect(codeOf(ai.apply(CLASS, created.id, circuit.id, req(OWNER)))).resolves.toBe("IDEMPOTENCY_KEY_REQUIRED");
    expect(lessonRow("lesson-draft").labId).toBeNull();
    const applyKey = key();
    const applied: any = await ai.apply(CLASS, created.id, circuit.id, req(OWNER, applyKey));
    expect(applied).toMatchObject({ jobId: created.id, itemId: circuit.id, lesson: { id: "lesson-draft", labId: "circuit", challengeParams: circuit.proposal.challengeParams, status: "draft" }, objectivePreview: circuit.objectivePreview });
    expect(lessonRow("lesson-draft")).toMatchObject({ labId: "circuit", challengeParams: circuit.proposal.challengeParams, status: "draft" });
    // Replay returns the same body; a second apply with another key or another item is 409.
    expect(await ai.apply(CLASS, created.id, circuit.id, req(OWNER, applyKey))).toEqual(applied);
    await expect(codeOf(ai.apply(CLASS, created.id, circuit.id, req(OWNER, key())))).resolves.toBe("AI_JOB_ALREADY_APPLIED");
    await expect(codeOf(ai.apply(CLASS, created.id, view.proposals[1].id, req(OWNER, key())))).resolves.toBe("AI_JOB_ALREADY_APPLIED");
    await expect(codeOf(ai.decide(CLASS, created.id, view.proposals[1].id, req(OWNER), { decision: "REJECTED", reasonCode: "LATE" }))).resolves.toBe("AI_JOB_ALREADY_APPLIED");
    const after: any = await ai.get(CLASS, created.id, req(OWNER));
    expect(after).toMatchObject({ appliedItemId: circuit.id, appliedLessonId: "lesson-draft" });
    expect(after.proposals[0].decision.decision).toBe("ACCEPTED");

    // 5. The AI module wrote no Lab, Challenge or step row; audit covers every human step; no raw rationale in audit.
    expect(challengeRows).toEqual([]);
    expect(stepRows.map((s) => s.id)).toEqual(["step-draft-read"]);
    const audits = store.auditLog.rows as Row[];
    expect(audits.map((a) => a.action)).toEqual(["ai_job.create", "ai_job.complete", "ai_item.decide", "lesson.update", "ai_proposal.apply"]);
    expect(audits.find((a) => a.action === "ai_proposal.apply")!.after).toMatchObject({ jobId: created.id, lessonId: "lesson-draft", labId: "circuit", modelRef: "circuit@1.0.0", challengeParams: ["maxCurrentMa=20"] });
    expect(JSON.stringify(audits)).not.toContain("Phù hợp với mục tiêu");

    // 6. Normal publish writes the variant Challenge with the deterministic objective; a student attempt is then
    //    evaluated by the server engine with those parameters, never with AI text.
    await store.$transaction((tx: any) =>
      writeLessonSteps(tx, "lesson-draft", [{ type: "READING", position: 10, required: true, config: {} }], { labId: "circuit", challengeParams: lessonRow("lesson-draft").challengeParams }),
    );
    expect(challengeRows).toHaveLength(1);
    expect(challengeRows[0]).toMatchObject({ labId: "circuit", objective: challengeObjective("circuit", lessonRow("lesson-draft").challengeParams), constraints: { params: lessonRow("lesson-draft").challengeParams, modelRef: "circuit@1.0.0" } });
    const params = challengeRows[0].constraints.params;
    const states = builtinReferenceStates("circuit");
    const good = states.find((s) => s.label.includes("470"))!.state;
    const bad = states.find((s) => s.label.includes("100"))!.state;
    expect(evaluate("circuit", good, params, "circuit@1.0.0").verdict).toBe("passed");
    expect(evaluate("circuit", bad, params, "circuit@1.0.0").verdict).not.toBe("passed");

    // 7. Nothing a student reads carries the AI rationale: the lesson row, the Challenge row and the steps.
    const studentFacing = JSON.stringify({ lesson: lessonRow("lesson-draft"), challenge: challengeRows, steps: stepRows });
    for (const p of view.proposals) expect(studentFacing).not.toContain(p.proposal.rationale);
    expect(studentFacing).not.toContain("rationale");
  });

  it("the teacher-only rationale is in no student, parent or outsider response and the routes are teacher-only", async () => {
    for (const handler of ["create", "list", "get", "cancel", "decide", "apply", "quota"] as const)
      for (const user of [STUDENT, PARENT, ADMIN]) expect(await guard(user, AiJobsController, handler), `${user.role} ${handler}`).toBe(403);
    for (const handler of ["create", "list", "get", "cancel", "decide", "apply", "quota"] as const) expect(await guard(OWNER, AiJobsController, handler), handler).toBe("allowed");
  });
});

describe("TAI6-T3 create denials and validation", () => {
  it("denies an outsider, an unknown class, a not-owned lesson, shared, published, quarantined and structure-locked lessons, an archived class and a missing key, creating no job", async () => {
    await expect(codeOf(ai.create(CLASS, req(OUTSIDER, key()), body()))).resolves.toBe("CLASS_ACCESS_DENIED");
    await expect(codeOf(ai.create("class-pilot-b", req(OWNER, key()), body()))).resolves.toBe("CLASS_ACCESS_DENIED");
    await expect(codeOf(ai.create("class-nope", req(OWNER, key()), body()))).resolves.toBe("CLASS_ACCESS_DENIED");
    await expect(codeOf(ai.create(CLASS, req(OWNER, key()), body({ lessonId: "lesson-other" })))).resolves.toBe("LESSON_NOT_AVAILABLE");
    await expect(codeOf(ai.create(CLASS, req(OWNER, key()), body({ lessonId: "lesson-missing" })))).resolves.toBe("LESSON_NOT_AVAILABLE");
    for (const lessonId of ["lesson-shared", "lesson-published", "lesson-locked"]) await expect(codeOf(ai.create(CLASS, req(OWNER, key()), body({ lessonId })))).resolves.toBe("LESSON_NOT_EDITABLE");
    await expect(codeOf(ai.create("class-archived", req(OWNER, key()), body()))).resolves.toBe("CLASS_ARCHIVED");
    await expect(codeOf(ai.create(CLASS, req(OWNER), body()))).resolves.toBe("IDEMPOTENCY_KEY_REQUIRED");
    expect(jobs()).toHaveLength(0);
    // The quarantined lesson is a private draft of the owner in name only: its status is not draft.
    await expect(codeOf(ai.create(CLASS, req(OWNER, key()), body({ lessonId: "lesson-quarantined" })))).resolves.toBe("LESSON_NOT_EDITABLE");
  });

  it("rejects a malformed body (count, unknown purpose, extra field, long instruction) and a missing provider", async () => {
    for (const bad of [body({ proposalCount: 0 }), body({ proposalCount: 4 }), body({ proposalCount: 1.5 }), body({ purpose: "EXECUTE_CODE" }), { ...body(), simulationCode: "x" }, body({ instruction: "a".repeat(1001) }), { purpose: "DRAFT_LAB_CHALLENGE" }, body({ targetKind: "TEST" })])
      await expect(statusOf(ai.create(CLASS, req(OWNER, key()), bad))).resolves.toBe(400);
    const noProvider = new AiJobsController(new AiJobsService(store as any, parseAiConfig({}), null));
    await expect(codeOf(noProvider.create(CLASS, req(OWNER, key()), body()))).resolves.toBe("AI_PROVIDER_NOT_CONFIGURED");
    expect(jobs()).toHaveLength(0);
  });

  it("returns 409 AI_NO_APPROVED_MODELS and no job when no model has a reviewed range", async () => {
    const saved = ["circuit", "chemistry", "eye"].map((id) => [id, CHALLENGE_PARAMETERS[id].rangeReview] as const);
    try {
      for (const [id] of saved) CHALLENGE_PARAMETERS[id].rangeReview = "pending";
      await expect(codeOf(ai.create(CLASS, req(OWNER, key()), body()))).resolves.toBe("AI_NO_APPROVED_MODELS");
      expect(jobs()).toHaveLength(0);
    } finally {
      for (const [id, review] of saved) CHALLENGE_PARAMETERS[id].rangeReview = review;
    }
  });

  it("counts quota for this purpose only: its own daily and concurrent limits, never the GENERATE_RESOURCE quota", async () => {
    build({ lab: { dailyLimit: 2, concurrentLimit: 1 } });
    await ai.create(CLASS, req(OWNER, key()), body());
    await expect(codeOf(ai.create(CLASS, req(OWNER, key()), body()))).resolves.toBe("AI_QUOTA_EXCEEDED"); // concurrent 1
    await runner.runOnce();
    await ai.create(CLASS, req(OWNER, key()), body());
    await runner.runOnce();
    await expect(codeOf(ai.create(CLASS, req(OWNER, key()), body()))).resolves.toBe("AI_QUOTA_EXCEEDED"); // daily 2
    expect(await ai.quota(req(OWNER), { purpose: "DRAFT_LAB_CHALLENGE" })).toMatchObject({ purpose: "DRAFT_LAB_CHALLENGE", dailyLimit: 2, usedLast24h: 2, concurrencyLimit: 1 });
    expect(await ai.quota(req(OWNER), { purpose: "GENERATE_RESOURCE" })).toMatchObject({ usedLast24h: 0, dailyLimit: 50 });
  });

  it("lists lab jobs only with purpose=DRAFT_LAB_CHALLENGE and keeps the default TAI-01 list free of them", async () => {
    const view: any = await proposals();
    const labList: any = await ai.list(CLASS, req(OWNER), { purpose: "DRAFT_LAB_CHALLENGE" });
    expect(labList.items.map((j: Row) => j.id)).toEqual([view.id]);
    expect(labList.items[0]).toMatchObject({ purpose: "DRAFT_LAB_CHALLENGE", validCount: 3 });
    expect(((await ai.list(CLASS, req(OWNER), {})) as any).items).toEqual([]);
    await expect(codeOf(ai.list(CLASS, req(OUTSIDER), { purpose: "DRAFT_LAB_CHALLENGE" }))).resolves.toBe("CLASS_ACCESS_DENIED");
  });
});

describe("TAI6-T3 review and apply authorization", () => {
  it("denies an outsider teacher on every job route and a not-matching class with 404, never leaking the job", async () => {
    const view = await proposals();
    const item = view.proposals[0].id;
    await expect(codeOf(ai.get(CLASS, view.id, req(OUTSIDER)))).resolves.toBe("CLASS_ACCESS_DENIED");
    await expect(codeOf(ai.cancel(CLASS, view.id, req(OUTSIDER)))).resolves.toBe("CLASS_ACCESS_DENIED");
    await expect(codeOf(ai.decide(CLASS, view.id, item, req(OUTSIDER), { decision: "REJECTED", reasonCode: "X1" }))).resolves.toBe("CLASS_ACCESS_DENIED");
    await expect(codeOf(ai.apply(CLASS, view.id, item, req(OUTSIDER, key())))).resolves.toBe("CLASS_ACCESS_DENIED");
    // The outsider's own class cannot reach the owner's job: 404 inside an owned class.
    await expect(codeOf(ai.get("class-pilot-b", view.id, req(OUTSIDER)))).resolves.toBe("NOT_FOUND");
    await expect(codeOf(ai.apply("class-pilot-b", view.id, item, req(OUTSIDER, key())))).resolves.toBe("NOT_FOUND");
    expect(lessonRow("lesson-draft").labId).toBeNull();
  });

  it("is not reviewable before the job succeeds, 404s a missing job or item, and is blocked in an archived class", async () => {
    const created: any = await ai.create(CLASS, req(OWNER, key()), body());
    await expect(codeOf(ai.apply(CLASS, created.id, "item-x", req(OWNER, key())))).resolves.toBe("AI_JOB_NOT_REVIEWABLE");
    await expect(codeOf(ai.decide(CLASS, created.id, "item-x", req(OWNER), { decision: "REJECTED", reasonCode: "X1" }))).resolves.toBe("AI_JOB_NOT_REVIEWABLE");
    await runner.runOnce();
    await expect(codeOf(ai.apply(CLASS, created.id, "item-missing", req(OWNER, key())))).resolves.toBe("NOT_FOUND");
    await expect(codeOf(ai.apply(CLASS, "job-missing", "item-x", req(OWNER, key())))).resolves.toBe("NOT_FOUND");
    store.classroom.rows.find((c: Row) => c.id === CLASS)!.status = "ARCHIVED";
    const view: any = await ai.get(CLASS, created.id, req(OWNER));
    await expect(codeOf(ai.apply(CLASS, created.id, view.proposals[0].id, req(OWNER, key())))).resolves.toBe("CLASS_ARCHIVED");
  });

  it("re-checks the lesson at apply: published, structure-locked or quarantined after generation returns 409 LESSON_NOT_EDITABLE and writes nothing", async () => {
    for (const change of [(l: Row) => (l.status = "published"), (l: Row) => (l.status = "quarantined"), (l: Row) => (l.scope = "SHARED_LIBRARY"), () => (store as any).evidence.assignment.push({ contentId: "lesson-draft", status: "ACTIVE" })]) {
      build();
      const view = await proposals();
      change(lessonRow("lesson-draft"));
      await expect(codeOf(ai.apply(CLASS, view.id, view.proposals[0].id, req(OWNER, key())))).resolves.toBe("LESSON_NOT_EDITABLE");
      expect(lessonRow("lesson-draft").labId).toBeNull();
      expect((jobs()[0] as Row).appliedItemId).toBeNull();
    }
  });

  it("returns AI_PROPOSAL_NO_LONGER_VALID when the validated range, the pack range or the allowlist changed, and leaves the lesson and job untouched", async () => {
    const original = { ...CHALLENGE_PARAMETERS.circuit.params.maxCurrentMa } as any;
    try {
      // Range narrowed after generation (proposal was maxCurrentMa 20).
      let view = await proposals();
      const circuitItem = view.proposals.find((p: Row) => p.proposal.labId === "circuit");
      expect(circuitItem.proposal.challengeParams.maxCurrentMa).toBe(20);
      (CHALLENGE_PARAMETERS.circuit.params.maxCurrentMa as any).max = 18;
      await expect(codeOf(ai.apply(CLASS, view.id, circuitItem.id, req(OWNER, key())))).resolves.toBe("AI_PROPOSAL_NO_LONGER_VALID");
      Object.assign(CHALLENGE_PARAMETERS.circuit.params.maxCurrentMa, original);

      // An active pack with a narrower range now exists.
      (store as any).packRows.push({ labId: "circuit", modelRef: "circuit@1.0.0", status: "active", version: 1, template: { ranges: { maxCurrentMa: { min: 6, max: 18 } }, goldenCases: [] } });
      await expect(codeOf(ai.apply(CLASS, view.id, circuitItem.id, req(OWNER, key())))).resolves.toBe("AI_PROPOSAL_NO_LONGER_VALID");
      (store as any).packRows.length = 0;

      // The model left the allowlist.
      CHALLENGE_PARAMETERS.circuit.rangeReview = "pending";
      await expect(codeOf(ai.apply(CLASS, view.id, circuitItem.id, req(OWNER, key())))).resolves.toBe("AI_PROPOSAL_NO_LONGER_VALID");
      CHALLENGE_PARAMETERS.circuit.rangeReview = "team-lead-default";

      expect(lessonRow("lesson-draft")).toMatchObject({ labId: null, challengeParams: null });
      expect(jobs()[0]).toMatchObject({ appliedItemId: null, appliedLessonId: null });
      expect(store.aiItemDecision.rows).toEqual([]);
      // Once the ranges are back, the same proposal applies.
      view = (await ai.get(CLASS, view.id, req(OWNER))) as any;
      await expect(ai.apply(CLASS, view.id, circuitItem.id, req(OWNER, key()))).resolves.toMatchObject({ lesson: { labId: "circuit" } });
    } finally {
      Object.assign(CHALLENGE_PARAMETERS.circuit.params.maxCurrentMa, original);
      CHALLENGE_PARAMETERS.circuit.rangeReview = "team-lead-default";
    }
  });
});

describe("TAI6-T2 negatives through the runner: out-of-range, unknown lab, code injection", () => {
  it("fails the job OUTPUT_VALIDATION_FAILED with reasons when every proposal is out of range, unknown or unsolvable, creating no item and refunding nothing to keep", async () => {
    scripted([
      validProposal({ challengeParams: { maxCurrentMa: 99 } }),
      validProposal({ labId: "root-access", challengeParams: { maxCurrentMa: 10 } }),
      validProposal({ labId: "mass-conservation", challengeParams: { cup1Milligrams: 1 } }),
    ]);
    const view = await proposals();
    expect(view).toMatchObject({ status: "FAILED", failureCode: "OUTPUT_VALIDATION_FAILED", validCount: 0, droppedCount: 3 });
    expect(view.dropped).toEqual([
      { position: 0, reasonCodes: ["PARAMS_OUT_OF_RANGE"] },
      { position: 1, reasonCodes: ["MODEL_NOT_ALLOWED"] },
      { position: 2, reasonCodes: ["MODEL_NOT_ALLOWED"] },
    ]);
    expect(store.aiJobItem.rows).toEqual([]);
    expect(lessonRow("lesson-draft").labId).toBeNull();
  });

  it("keeps the valid proposal and lists the dropped reasons when only some are bad", async () => {
    scripted([validProposal({ challengeParams: { maxCurrentMa: 21 } }), validProposal({ challengeParams: { maxCurrentMa: 12 } }), validProposal({ labId: "eye", challengeParams: { minScore: 55 } })]);
    const view = await proposals();
    expect(view).toMatchObject({ status: "SUCCEEDED", validCount: 1, droppedCount: 2 });
    expect(view.proposals[0].proposal.challengeParams).toEqual({ maxCurrentMa: 12 });
    expect(view.dropped.map((d: Row) => d.reasonCodes[0])).toEqual(["PARAMS_OUT_OF_RANGE", "PARAMS_OUT_OF_RANGE"]);
  });

  it("never lets code reach the lesson: extra code fields fail the schema (retried once, then OUTPUT_SCHEMA_INVALID), code-like params and rationale are dropped", async () => {
    provider.labChallenge = () => ({ proposals: [{ ...validProposal(), simulationCode: "while(true){}", formula: "x=1" }] });
    const created: any = await ai.create(CLASS, req(OWNER, key()), body());
    await runner.runOnce();
    expect(jobs()[0]).toMatchObject({ status: "PENDING", attemptCount: 1 }); // retryable schema failure
    await runner.runOnce();
    expect(await ai.get(CLASS, created.id, req(OWNER))).toMatchObject({ status: "FAILED", failureCode: "OUTPUT_SCHEMA_INVALID" });

    build();
    scripted([
      validProposal({ challengeParams: { maxCurrentMa: "20; process.exit(1)" } }),
      validProposal({ labId: "circuit\"); DROP TABLE \"Lab\"; --" }),
      validProposal({ rationale: "<script>fetch('/api/admin')</script>" }),
      ...[],
    ]);
    const view = await proposals();
    expect(view).toMatchObject({ status: "FAILED", failureCode: "OUTPUT_VALIDATION_FAILED" });
    expect(view.dropped.map((d: Row) => d.reasonCodes)).toEqual([["PARAMS_OUT_OF_RANGE"], ["MODEL_NOT_ALLOWED"], ["SAFETY_REJECTED"]]);
    expect(store.aiJobItem.rows).toEqual([]);
    expect(lessonRow("lesson-draft")).toMatchObject({ labId: null, challengeParams: null });
  });

  it("drops a proposal that no reference state can pass (unsolvable) and one that fails nothing (not discriminating)", async () => {
    scripted([validProposal({ challengeParams: { maxCurrentMa: 5 } }), validProposal({ challengeParams: { minLitLeds: 3 } }), validProposal({ challengeParams: { maxCurrentMa: 14 } })]);
    const view = await proposals();
    expect(view.dropped.map((d: Row) => d.reasonCodes)).toEqual([["CHALLENGE_UNSOLVABLE"], ["CHALLENGE_UNSOLVABLE"]]);
    expect(view.proposals).toHaveLength(1);
    // The current lesson parameters are not offered again.
    build();
    lessonRow("lesson-draft").labId = "circuit";
    lessonRow("lesson-draft").challengeParams = { maxCurrentMa: 14 };
    scripted([validProposal({ challengeParams: { maxCurrentMa: 14 } })]);
    expect((await proposals()).dropped).toEqual([{ position: 0, reasonCodes: ["DUPLICATE_PROPOSAL"] }]);
  });
});

describe("TAI6-T3 provider failure, replay and cancel", () => {
  it("retries once then fails PROVIDER_UNAVAILABLE without consuming this purpose's daily quota", async () => {
    provider.mode = "unavailable";
    const created: any = await ai.create(CLASS, req(OWNER, key()), body());
    await runner.runOnce();
    expect(jobs()[0]).toMatchObject({ status: "PENDING", attemptCount: 1 });
    await runner.runOnce();
    expect(await ai.get(CLASS, created.id, req(OWNER))).toMatchObject({ status: "FAILED", failureCode: "PROVIDER_UNAVAILABLE", validCount: null });
    expect(provider.calls).toHaveLength(2);
    expect(await ai.quota(req(OWNER), { purpose: "DRAFT_LAB_CHALLENGE" })).toMatchObject({ usedLast24h: 0 });
    await expect(codeOf(ai.apply(CLASS, created.id, "any", req(OWNER, key())))).resolves.toBe("AI_JOB_NOT_REVIEWABLE");
    provider.mode = "timeout";
    const second: any = await ai.create(CLASS, req(OWNER, key()), body());
    await runner.runOnce();
    await runner.runOnce();
    expect(await ai.get(CLASS, second.id, req(OWNER))).toMatchObject({ failureCode: "PROVIDER_TIMEOUT" });
    provider.mode = "invalid_json";
    const third: any = await ai.create(CLASS, req(OWNER, key()), body());
    await runner.runOnce();
    await runner.runOnce();
    expect(await ai.get(CLASS, third.id, req(OWNER))).toMatchObject({ failureCode: "OUTPUT_SCHEMA_INVALID" });
  });

  it("drops an unsafe rationale from the review list but keeps the other proposals", async () => {
    provider.mode = "unsafe";
    const view = await proposals();
    expect(view).toMatchObject({ status: "SUCCEEDED", validCount: 2, droppedCount: 1 });
    expect(view.dropped[0].reasonCodes).toEqual(["SAFETY_REJECTED"]);
  });

  it("cancels a PENDING job, is idempotent on a cancelled job, 409s a finished job, and discards a result that arrives after cancel", async () => {
    const pending: any = await ai.create(CLASS, req(OWNER, key()), body());
    expect(await ai.cancel(CLASS, pending.id, req(OWNER))).toMatchObject({ status: "CANCELLED" });
    expect(await ai.cancel(CLASS, pending.id, req(OWNER))).toMatchObject({ status: "CANCELLED" });
    expect(await runner.runOnce()).toBeNull();
    const done = await proposals();
    await expect(codeOf(ai.cancel(CLASS, done.id, req(OWNER)))).resolves.toBe("AI_JOB_NOT_CANCELLABLE");
    // Cancel while the provider call is in flight: the late result writes no item.
    const running: any = await ai.create(CLASS, req(OWNER, key()), body({ lessonId: "lesson-draft", instruction: "late" }));
    const generate = provider.generate.bind(provider);
    provider.generate = async (input) => {
      await ai.cancel(CLASS, running.id, req(OWNER));
      return generate(input);
    };
    await runner.runOnce();
    expect(await ai.get(CLASS, running.id, req(OWNER))).toMatchObject({ status: "CANCELLED", validCount: null });
    expect((store.aiJobItem.rows as Row[]).filter((i) => i.jobId === running.id)).toEqual([]);
    expect(jobs().find((j) => j.id === running.id)!.inputTokens).toBeGreaterThan(0); // tokens are still recorded
  });

  it("flags lessonChangedSinceGeneration when the lesson text changed after the request, without touching the job", async () => {
    const view = await proposals();
    lessonRow("lesson-draft").content += "<p>Thêm một đoạn mới về điện trở.</p>";
    const changed: any = await ai.get(CLASS, view.id, req(OWNER));
    expect(changed).toMatchObject({ status: "SUCCEEDED", lessonChangedSinceGeneration: true });
    expect(changed.proposals).toHaveLength(3);
  });
});

describe("TAI6-T3 credits (AI_CREDITS_ENABLED=true): reserve, settle, refund", () => {
  beforeEach(async () => {
    build({ credits: true });
    await credits.ensureBaselinePricing();
    await admin.grant(OWNER.sub, req(ADMIN, key()), { credits: 100, reason: "Cấp cho giáo viên thí điểm" });
  });
  const available = () => store.creditAccount.rows.find((a: Row) => a.kind === "TEACHER_AVAILABLE" && a.ownerId === OWNER.sub)!.balance as number;
  const reserved = () => store.creditAccount.rows.find((a: Row) => a.kind === "TEACHER_RESERVED" && a.ownerId === OWNER.sub)!.balance as number;

  it("needs a confirmed estimate (2 + 2 x proposals), reserves on create, settles on success and never shows tokens", async () => {
    await expect(codeOf(ai.create(CLASS, req(OWNER, key()), body()))).resolves.toBe("VALIDATION_FAILED");
    await expect(codeOf(ai.create(CLASS, req(OWNER, key()), body({ confirmedCredits: 7 })))).resolves.toBe("AI_ESTIMATE_CHANGED");
    expect(jobs()).toHaveLength(0);
    const created: any = await ai.create(CLASS, req(OWNER, key()), body({ confirmedCredits: 8 }));
    expect(created.credits).toMatchObject({ estimated: 8, state: "reserved" });
    expect(available()).toBe(92);
    expect(reserved()).toBe(8);
    await runner.runOnce();
    const view: any = await ai.get(CLASS, created.id, req(OWNER));
    expect(view).toMatchObject({ status: "SUCCEEDED", credits: { estimated: 8, state: "settled" } });
    expect(view.credits.charged).toBeGreaterThan(0);
    expect(view.credits.charged).toBeLessThanOrEqual(8);
    expect(available() + reserved()).toBe(100 - view.credits.charged);
    expect(reserved()).toBe(0);
    expect(view.usage).toBeUndefined();
    expect(view.model).toBe("");
  });

  it("refunds the whole reservation on provider failure, on OUTPUT_VALIDATION_FAILED and on cancel, and 402s an unaffordable request", async () => {
    provider.mode = "unavailable";
    const failed: any = await ai.create(CLASS, req(OWNER, key()), body({ confirmedCredits: 8 }));
    await runner.runOnce();
    await runner.runOnce();
    expect(await ai.get(CLASS, failed.id, req(OWNER))).toMatchObject({ status: "FAILED", credits: { state: "refunded", charged: 0, refunded: 8 } });
    expect(available()).toBe(100);
    provider.mode = "ok";
    scripted([validProposal({ challengeParams: { maxCurrentMa: 99 } })]);
    const invalid: any = await ai.create(CLASS, req(OWNER, key()), body({ confirmedCredits: 8 }));
    await runner.runOnce();
    expect(await ai.get(CLASS, invalid.id, req(OWNER))).toMatchObject({ failureCode: "OUTPUT_VALIDATION_FAILED", credits: { state: "refunded", refunded: 8 } });
    const cancelled: any = await ai.create(CLASS, req(OWNER, key()), body({ confirmedCredits: 8 }));
    expect(available()).toBe(92);
    expect(await ai.cancel(CLASS, cancelled.id, req(OWNER))).toMatchObject({ status: "CANCELLED", credits: { state: "refunded", refunded: 8 } });
    expect(available()).toBe(100);
    expect(reserved()).toBe(0);
    await admin.grant(OUTSIDER.sub, req(ADMIN, key()), { credits: 1, reason: "Cấp thử một tín dụng" });
    store.classroom.rows.push({ id: "class-outsider-2", teacherId: OUTSIDER.sub, status: "ACTIVE" });
    lessons().push({ ...lessonRow("lesson-other"), id: "lesson-other-2" });
    await expect(codeOf(ai.create("class-outsider-2", req(OUTSIDER, key()), body({ lessonId: "lesson-other", confirmedCredits: 8 })))).resolves.toBe("AI_CREDITS_INSUFFICIENT");
  });
});
