import { beforeEach, describe, expect, it, vi } from "vitest";
import { parseAiAssessmentConfig } from "../../../config/ai-assessment";
import { parseAiCreditsConfig } from "../../../config/ai-credits";
import { AiAssessmentsService } from "./ai-assessments.service";
import { parseAiConfig } from "./ai-config";
import { AiJobRunner } from "./ai-job-runner";
import { AiCreditsAdminService } from "./credits-admin.service";
import { AiCreditsService } from "./credits.service";
import { makeCreditsStore, type CreditsStore, type Row } from "./credits-test-kit";

// The snapshot builder and identity loader are covered by their own suites; here they only feed the credit path.
vi.mock("./assessment-snapshot", () => ({
  loadKnownIdentities: async () => ({ names: [], usernames: [] }),
  buildAssessSnapshot: (input: { topic: string }) => ({ ok: true, snapshot: { version: "assess-snapshot@1", payload: { topic: input.topic } }, digest: "digest-" + input.topic }),
}));

/**
 * TAI5-T3 for the second job purpose: ASSESS_SUBMISSION creates one job per eligible submission, each with its own
 * RESERVE; the teacher confirms the ceiling (unit price x requested submissions); skipped submissions cost nothing; a
 * short balance (402) creates nothing; a suppressed suggestion (no provider call) settles at 0.
 */
const OWNER = { sub: "teacher-owner", role: "TEACHER" };
const ADMIN = { sub: "admin-1", role: "ADMIN" };
let keySeq = 0;
const req = (user: Row = OWNER, key: string | null = `assess-key-${++keySeq}-abcdef`) => ({ user, headers: key === null ? {} : { "idempotency-key": key } });

let store: CreditsStore;
let credits: AiCreditsService;
let admin: AiCreditsAdminService;
let service: AiAssessmentsService;
const aiConfig = parseAiConfig({ AI_PROVIDER: "fake", AI_PROVIDER_MIN_INTERVAL_MS: "0" } as any);
const provider = { name: "fake" as const, generate: async () => { throw new Error("unused"); } };

function addSubmission(id: string, patch: Row = {}) {
  store.assignmentSubmissions.push({ id, assignmentId: "asg-1", studentId: `s-${id}`, timing: "ON_TIME", submittedAt: new Date(), resourceVersion: 1, answers: {}, decision: null, ...patch });
}

beforeEach(async () => {
  store = makeCreditsStore();
  store.classroom.rows.push({ id: "class-a", teacherId: OWNER.sub, status: "ACTIVE" });
  store.user.rows.push({ id: OWNER.sub, role: "TEACHER" }, { id: ADMIN.sub, role: "ADMIN" });
  store.assignmentSubmissions = [];
  (store as any).assignment = { async findFirst() { return { id: "asg-1", contentId: "res-1" }; } };
  (store as any).assignmentSubmission = {
    async findMany({ where }: Row) {
      if (where.id?.in) return store.assignmentSubmissions.filter((s: Row) => where.id.in.includes(s.id) && s.assignmentId === where.assignmentId);
      return store.assignmentSubmissions.filter((s: Row) => s.assignmentId === where.assignmentId && s.studentId === where.studentId).map((s: Row) => ({ id: s.id, submittedAt: s.submittedAt }));
    },
    async findUnique({ where }: Row) {
      return store.assignmentSubmissions.find((s: Row) => s.id === where.id) ?? null;
    },
  };
  (store as any).classResource = {
    ...store.classResource,
    async findFirst() { return { id: "res-1", title: "Tự luận", lessonId: "lesson-1", content: { prompts: [] } }; },
  };
  (store as any).lesson = { async findUnique() { return { id: "lesson-1", title: "Mạch điện" }; } };
  (store as any).parentLink = { async findMany() { return []; } };
  for (const id of ["a", "b", "c"]) addSubmission(id);
  const assessment = parseAiAssessmentConfig({ AI_ASSESSMENT_ENABLED: "true", AI_ASSESSMENT_POLICY: "g2-pii-scrub@1", AI_PROVIDER: "fake", AI_ASSESSMENT_MODE: "shadow" });
  credits = new AiCreditsService(store as any, parseAiCreditsConfig({ AI_CREDITS_ENABLED: "true" }));
  admin = new AiCreditsAdminService(store as any);
  service = new AiAssessmentsService(store as any, aiConfig, provider as any, assessment, credits);
  await credits.ensureBaselinePricing();
  await admin.grant(OWNER.sub, req(ADMIN), { credits: 40, reason: "Cấp thử nghiệm đợt 1" });
});

const request = (ids: string[], confirmedCredits: number | null, r = req()) =>
  service.request("class-a", "asg-1", r, { submissionIds: ids, ...(confirmedCredits === null ? {} : { confirmedCredits }) });
const txs = (kind: string) => store.creditTransaction.rows.filter((t: Row) => t.kind === kind);
const balance = (kind: string) => store.creditAccount.rows.find((a: Row) => a.kind === kind && a.ownerId === OWNER.sub)!.balance;

describe("TAI5-T3 ASSESS_SUBMISSION credits", () => {
  it("estimates N unit prices for N submissions and reserves each job separately", async () => {
    expect(await credits.estimate("class-a", req(), { purpose: "ASSESS_SUBMISSION", submissionCount: 3 })).toMatchObject({ credits: 15, pricingVersion: 1, available: 40 });
    const result = await request(["a", "b", "c"], 15);
    expect(result.created).toHaveLength(3);
    expect(result.created[0]).toMatchObject({ credits: { estimated: 5, state: "reserved" } });
    expect(txs("RESERVE")).toHaveLength(3);
    expect(store.aiJob.rows.map((j: Row) => j.estimatedCredits)).toEqual([5, 5, 5]);
    expect(balance("TEACHER_AVAILABLE")).toBe(25);
    expect(balance("TEACHER_RESERVED")).toBe(15);
  });

  it("requires confirmedCredits (400) and compares it with the ceiling (409 AI_ESTIMATE_CHANGED), creating nothing", async () => {
    await expect(request(["a"], null)).rejects.toMatchObject({ status: 400, response: { code: "VALIDATION_FAILED" } });
    await expect(request(["a", "b"], 5)).rejects.toMatchObject({ status: 409, response: { code: "AI_ESTIMATE_CHANGED", details: { credits: 10, pricingVersion: 1 } } });
    expect(store.aiJob.rows).toHaveLength(0);
    expect(txs("RESERVE")).toHaveLength(0);
    expect(balance("TEACHER_AVAILABLE")).toBe(40);
  });

  it("a skipped submission is not charged: only the created jobs reserve", async () => {
    addSubmission("late", { timing: "LATE", decision: null });
    const result = await request(["a", "late"], 10);
    expect(result.created).toHaveLength(1);
    expect(result.skipped).toEqual([{ submissionId: "late", reason: "NOT_GRADEABLE" }]);
    expect(txs("RESERVE")).toHaveLength(1);
    expect(balance("TEACHER_RESERVED")).toBe(5);
  });

  it("a short balance is 402 and rolls the whole request back (no job, no reserve, no idempotency record)", async () => {
    store.creditAccount.rows.find((a: Row) => a.kind === "TEACHER_AVAILABLE")!.balance = 7;
    const error = await request(["a", "b"], 10).then(() => null, (e) => e);
    expect(error).toMatchObject({ status: 402, response: { code: "AI_CREDITS_INSUFFICIENT", details: { required: 5 } } });
    expect(store.aiJob.rows).toHaveLength(0);
    expect(txs("RESERVE")).toHaveLength(0);
    expect(balance("TEACHER_AVAILABLE")).toBe(7);
    expect(store.idempotencyRecord.rows.filter((r: Row) => r.scope.includes("ai-assessments"))).toHaveLength(0);
  });

  it("a replayed request posts one reserve per job", async () => {
    const r = req();
    const a = await request(["a", "b"], 10, r);
    const b = await request(["a", "b"], 10, r);
    expect(b).toEqual(a);
    expect(txs("RESERVE")).toHaveLength(2);
  });

  it("a suppressed suggestion made no provider call, so it settles at 0 and returns the whole reservation", async () => {
    await request(["a"], 5);
    const job = store.aiJob.rows[0];
    const runner = new AiJobRunner(store as any, aiConfig, provider as any, credits);
    const claimed = (await runner.claim(new Date()))!;
    (store as any).aiAssessmentSuggestion = { async create() { return {}; } };
    await runner.succeedAssessment(claimed, job, "SUPPRESSED", [], ["INJECTION_SUSPECTED"], null, new Date());
    expect(job).toMatchObject({ status: "SUCCEEDED", chargedCredits: 0 });
    expect(txs("SETTLE")).toHaveLength(1);
    expect(balance("TEACHER_AVAILABLE")).toBe(40);
    expect(balance("TEACHER_RESERVED")).toBe(0);
  });

  it("a verified suggestion settles at the token cost within the unit estimate", async () => {
    await request(["a"], 5);
    const job = store.aiJob.rows[0];
    const runner = new AiJobRunner(store as any, aiConfig, provider as any, credits);
    const claimed = (await runner.claim(new Date()))!;
    (store as any).aiAssessmentSuggestion = { async create() { return {}; } };
    await runner.succeedAssessment(claimed, job, "VALID", [{ valid: true } as any], [], { inputTokens: 1500, outputTokens: 600 }, new Date()); // 3 + 1.8 -> 5
    expect(job.chargedCredits).toBe(5);
    expect(balance("TEACHER_AVAILABLE")).toBe(35);
    const audit = store.auditLog.rows.find((a: Row) => a.action === "ai_job.complete")!;
    expect(audit.after).toMatchObject({ chargedCredits: 5 });
  });

  it("credits off: the request needs no confirmedCredits and posts nothing", async () => {
    const off = new AiCreditsService(store as any, parseAiCreditsConfig({}));
    const plain = new AiAssessmentsService(store as any, aiConfig, provider as any, parseAiAssessmentConfig({ AI_ASSESSMENT_ENABLED: "true", AI_ASSESSMENT_POLICY: "g2-pii-scrub@1", AI_PROVIDER: "fake", AI_ASSESSMENT_MODE: "shadow" }), off);
    const result = await plain.request("class-a", "asg-1", req(), { submissionIds: ["a"] });
    expect(result.created).toHaveLength(1);
    expect(result.created[0]).not.toHaveProperty("credits");
    expect(txs("RESERVE")).toHaveLength(0);
    expect(store.aiJob.rows[0].estimatedCredits).toBeNull();
  });
});
