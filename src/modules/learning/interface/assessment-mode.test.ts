import { beforeEach, describe, expect, it } from "vitest";
import { LearningController } from "./learning.controller";
import { AssignmentsService } from "../../classes/application/assignments.service";
import { resolveAssessmentConfig, SESSION_GRACE_MS, sessionExpiry, toScale10 } from "../../classes/application/assessment-policy";
import { scoreGradedTest } from "../../classes/application/assessment-session";
import { AssessmentSessionSweeper } from "../../classes/application/assessment-sweeper";
import { GradebookService } from "../../classes/application/gradebook.service";
import { classListOrder, csvFileName, gradebookCsv } from "../../classes/application/gradebook";

/**
 * TAI-07 (TAI7-T1): graded assessment mode on the in-memory Prisma stand-in of written-assignment.test.ts (no database):
 * policy, timed sessions, one attempt, auto-submission (lazy and sweeper), retake grants, hidden results until publication.
 */
// In-memory Prisma stand-in with the relations these routes use.
type Row = Record<string, any>;
type Rel = { kind: "one" | "many" | "back"; table: string; fk: string };
const REL: Record<string, Record<string, Rel>> = {
  assignment: {
    classroom: { kind: "one", table: "classroom", fk: "classId" },
    targets: { kind: "many", table: "assignmentTarget", fk: "assignmentId" },
  },
  assignmentTarget: {
    student: { kind: "one", table: "user", fk: "studentId" },
    assignment: { kind: "one", table: "assignment", fk: "assignmentId" },
  },
  classroom: { enrollments: { kind: "many", table: "enrollment", fk: "classId" } },
  user: { enrollments: { kind: "many", table: "enrollment", fk: "studentId" } },
  assignmentSubmission: {
    assignment: { kind: "one", table: "assignment", fk: "assignmentId" },
    decision: { kind: "back", table: "lateDecision", fk: "submissionId" },
    deadlineRevision: { kind: "one", table: "assignmentDeadlineRevision", fk: "deadlineRevisionId" },
    gradeDecisions: { kind: "many", table: "writtenGradeDecision", fk: "submissionId" },
    session: { kind: "one", table: "assessmentSession", fk: "sessionId" },
  },
  assessmentSession: { submission: { kind: "back", table: "assignmentSubmission", fk: "sessionId" } },
  // TAI7-T3: AI suggestion and similarity reads of the gradebook.
  aiJob: { suggestion: { kind: "back", table: "aiAssessmentSuggestion", fk: "jobId" } },
  submissionSimilarityMatch: { reviews: { kind: "many", table: "similarityMatchReview", fk: "matchId" } },
};
let seq = 0;
let db: any;

function related(table: string, row: Row, key: string) {
  const rel = REL[table]?.[key];
  if (!rel) return undefined;
  const rows: Row[] = db[rel.table].rows;
  if (rel.kind === "one") return rows.find((r) => r.id === row[rel.fk]) ?? null;
  if (rel.kind === "back") return rows.find((r) => r[rel.fk] === row.id) ?? null;
  return rows.filter((r) => r[rel.fk] === row.id);
}
const same = (a: any, b: any) => (a instanceof Date && b instanceof Date ? a.getTime() === b.getTime() : a === b);
function matches(table: string, row: Row, where: Row = {}): boolean {
  return Object.entries(where).every(([key, cond]) => {
    if (cond === undefined) return true;
    if (key === "OR") return (cond as Row[]).some((c) => matches(table, row, c));
    const rel = REL[table]?.[key];
    if (rel) {
      const value = related(table, row, key);
      if (rel.kind === "many") return (value as Row[]).some((r) => matches(rel.table, r, cond.some));
      if (cond === null) return value === null;
      return !!value && matches(rel.table, value as Row, cond);
    }
    const value = row[key];
    if (cond === null) return value === null || value === undefined;
    if (typeof cond === "object" && !(cond instanceof Date)) {
      if ("in" in cond) return cond.in.includes(value);
      if ("not" in cond) return cond.not === null ? value != null : !same(value, cond.not);
      if ("contains" in cond) return String(value).includes(cond.contains);
      const num = (x: any) => (x instanceof Date ? x.getTime() : x);
      if ("lt" in cond) return value != null && num(value) < num(cond.lt);
      if ("lte" in cond) return value != null && num(value) <= num(cond.lte);
      if ("gt" in cond) return value != null && num(value) > num(cond.gt);
      if ("gte" in cond) return value != null && num(value) >= num(cond.gte);
      return false;
    }
    return same(value, cond);
  });
}
function hydrate(table: string, row: Row, spec: Row = {}): Row {
  const out: Row = spec.select ? {} : { ...row };
  const fields = spec.select ?? spec.include ?? {};
  for (const [key, value] of Object.entries(fields)) {
    if (!value) continue;
    if (key === "_count") {
      out._count = Object.fromEntries(Object.keys((value as Row).select).map((k) => [k, (related(table, row, k) as Row[]).length]));
      continue;
    }
    const rel = REL[table]?.[key];
    if (!rel) {
      out[key] = row[key];
      continue;
    }
    const nested = value === true ? {} : (value as Row);
    const target = related(table, row, key);
    if (rel.kind === "many")
      out[key] = sortRows((target as Row[]).filter((r) => matches(rel.table, r, nested.where)), nested.orderBy).map((r) => hydrate(rel.table, r, nested));
    else out[key] = target ? hydrate(rel.table, target as Row, nested) : null;
  }
  return out;
}
function sortRows(rows: Row[], orderBy: any) {
  const keys = (Array.isArray(orderBy) ? orderBy : orderBy ? [orderBy] : []).flatMap((o: Row) => Object.entries(o));
  return [...rows].sort((a, b) => {
    for (const [k, dir] of keys) {
      if (typeof dir !== "string") continue;
      const x = a[k] instanceof Date ? a[k].getTime() : a[k];
      const y = b[k] instanceof Date ? b[k].getTime() : b[k];
      if (x === y) continue;
      return (x > y ? 1 : -1) * (dir === "desc" ? -1 : 1);
    }
    return 0;
  });
}
const DEFAULTS: Record<string, () => Row> = {
  assignment: () => ({ status: "ACTIVE", archivedAt: null, updatedAt: new Date() }),
  assignmentSubmission: () => ({ gradingMode: "AUTO", autoSubmitted: false, sessionId: null }),
  assessmentSession: () => ({ status: "OPEN", draftAnswers: [], draftSavedAt: null, retakeGrantId: null }),
  assessmentRetakeGrant: () => ({ consumedAt: null }),
};
function table(name: string) {
  const t = {
    rows: [] as Row[],
    async findUnique({ where, select, include }: Row) {
      const k = where.actorId_key ?? where.parentId_studentId ?? where;
      const r = t.rows.find((x) => matches(name, x, k));
      return r ? hydrate(name, r, { select, include }) : null;
    },
    async findFirst({ where, select, include, orderBy }: Row = {}) {
      const r = sortRows(t.rows.filter((x) => matches(name, x, where)), orderBy)[0];
      return r ? hydrate(name, r, { select, include }) : null;
    },
    async findMany({ where, select, include, orderBy, distinct, take }: Row = {}) {
      let rows = sortRows(t.rows.filter((x) => matches(name, x, where)), orderBy);
      if (distinct) {
        const seen = new Set<string>();
        rows = rows.filter((r) => {
          const k = (distinct as string[]).map((d) => r[d]).join("|");
          return seen.has(k) ? false : (seen.add(k), true);
        });
      }
      if (take) rows = rows.slice(0, take);
      return rows.map((r) => hydrate(name, r, { select, include }));
    },
    async count({ where }: Row = {}) { return t.rows.filter((x) => matches(name, x, where)).length; },
    async create({ data, select, include }: Row) {
      const { targets, ...scalar } = data;
      const r: Row = { id: `${name}-${++seq}`, createdAt: new Date(Date.now() + seq), ...(DEFAULTS[name]?.() ?? {}), ...scalar };
      t.rows.push(r);
      if (targets?.create) for (const target of targets.create) db.assignmentTarget.rows.push({ id: `target-${++seq}`, assignmentId: r.id, ...target });
      return hydrate(name, r, { select, include });
    },
    async createMany({ data }: Row) {
      for (const d of data) t.rows.push({ id: `${name}-${++seq}`, createdAt: new Date(), ...d });
      return { count: data.length };
    },
    async update({ where, data, include, select }: Row) {
      const r = t.rows.find((x) => matches(name, x, where.actorId_key ?? where))!;
      Object.assign(r, data);
      return hydrate(name, r, { include, select });
    },
    async deleteMany({ where }: Row) {
      const before = t.rows.length;
      t.rows = t.rows.filter((x) => !matches(name, x, where));
      return { count: before - t.rows.length };
    },
  };
  return t;
}


const OWNER = { sub: "teacher-owner", role: "TEACHER" };
const OUTSIDER = { sub: "teacher-outsider", role: "TEACHER" };
const S1 = { sub: "s1", role: "STUDENT" };
const S2 = { sub: "s2", role: "STUDENT" };
const req = (user: Row) => ({ user, headers: { "idempotency-key": `key-${++seq}-abcdefgh` } });
const DAY = 24 * 3600_000;
const RESULT_KEYS = ["score", "correctCount", "grade", "criterionPoints", "feedback"];

/** Every result-bearing key that holds a non-null value (a hidden result keeps the keys but nulls them). */
function nonNullResultKeys(value: unknown): string[] {
  const found = new Set<string>();
  const walk = (node: unknown) => {
    if (Array.isArray(node)) return node.forEach(walk);
    if (node && typeof node === "object" && !(node instanceof Date))
      for (const [key, child] of Object.entries(node)) {
        // `classroom.grade` is the school year (a number), not a result; a submission grade is an object.
        const isResult = key === "grade" ? !!child && typeof child === "object" : child !== null && child !== undefined;
        if (RESULT_KEYS.includes(key) && isResult) found.add(key);
        walk(child);
      }
  };
  walk(JSON.parse(JSON.stringify(value ?? null)));
  return [...found];
}

const rubricPrompt = (id: string, maxChars: number) => ({
  id,
  prompt: `Giải thích ${id}`,
  maxChars,
  referenceAnswer: "Mẫu",
  criteria: [{ code: "GIAI_THICH", description: "Giải thích đúng", maxPoints: 2, anchors: [{ points: 0, description: "Sai" }, { points: 2, description: "Đúng" }] }],
});
const q = (id: string) => ({ id, prompt: `${id}?`, options: [{ id: `${id}a`, text: "Đúng" }, { id: `${id}b`, text: "Sai" }], correctOption: 0, explanation: "vì" });

beforeEach(() => {
  seq = 0;
  db = {};
  for (const name of [
    "classroom", "enrollment", "user", "classResource", "assignment", "assignmentTarget", "assignmentDeadlineRevision",
    "assignmentSubmission", "lateDecision", "writtenGradeDecision", "auditLog", "notification", "idempotencyRecord", "lesson", "lab",
    "labPackRevocation", "parentLink", "assessmentSession", "assessmentRetakeGrant",
    "aiJob", "aiAssessmentSuggestion", "submissionSimilarityRun", "submissionSimilarityMatch", "similarityMatchReview", "gradebookEntry",
  ])
    db[name] = table(name);
  db.$executeRaw = async () => 0;
  // The assignment list reads TEST resources (with their thumbnail) through one raw query: answer it from the store.
  db.$queryRaw = async (sql: any) => db.classResource.rows
    .filter((row: any) => row.kind === "TEST" && row.status !== "DRAFT" && (sql?.values ?? []).includes(row.id))
    .map((row: any) => ({ id: row.id, classId: row.classId, lessonId: row.lessonId ?? null, thumbnailUrl: row.content?.thumbnailUrl ?? null }));
  db.$transaction = async (fn: (tx: any) => Promise<any>) => fn(db);
  db.classroom.rows.push({ id: "class-a", teacherId: OWNER.sub, status: "ACTIVE", name: "8A", grade: 8 }, { id: "class-b", teacherId: OUTSIDER.sub, status: "ACTIVE", name: "8B", grade: 8 });
  for (const id of ["s1", "s2"]) {
    db.user.rows.push({ id, fullName: `Học sinh ${id}`, username: id });
    db.enrollment.rows.push({ id: `e-${id}`, classId: "class-a", studentId: id, status: "approved" });
  }
  db.classResource.rows.push(
    { id: "test-1", classId: "class-a", kind: "TEST", status: "PUBLISHED", version: 1, title: "Kiểm tra 15 phút", lessonId: null, publishedAt: new Date(), content: { questions: [q("q1"), q("q2"), q("q3"), q("q4"), q("q5"), q("q6"), q("q7"), q("q8")] } },
    { id: "wt-1", classId: "class-a", kind: "WRITTEN_TASK", status: "PUBLISHED", version: 1, title: "Tự luận giữa kỳ", lessonId: null, publishedAt: new Date(), content: { prompts: [rubricPrompt("p1", 200), rubricPrompt("p2", 200)] } },
  );
});

const service = () => new AssignmentsService(db);
const learning = () => new LearningController(db, {} as any);
const due = (ms = 3 * DAY) => new Date(Date.now() + ms).toISOString();
const codeOf = async (p: Promise<unknown>) => p.then(() => null, (e: any) => e.response?.code ?? e.status ?? String(e));
async function assign(patch: Row = {}) {
  const result: any = await service().assign("class-a", req(OWNER), { contentType: "test", contentId: "test-1", dueDate: due(), studentIds: [], assessmentType: "REGULAR_15M", ...patch });
  return result.assignment.id as string;
}
const start = (id: string, user = S1) => learning().startAssessmentSession(id, req(user)) as Promise<any>;
const detail = (id: string, user = S1) => learning().assignment(id, req(user)) as Promise<any>;
const submit = (id: string, body: unknown, user = S1) => learning().submitTest(id, req(user), body) as Promise<any>;
const expire = (sessionId: string, msAgo = SESSION_GRACE_MS + 1_000) => {
  const s = db.assessmentSession.rows.find((r: Row) => r.id === sessionId);
  s.startedAt = new Date(Date.now() - 20 * 60_000);
  s.expiresAt = new Date(Date.now() - msAgo);
};

describe("TAI7-T1 policy", () => {
  it("converts raw points to the 10-point scale, half-up to one decimal", () => {
    expect(toScale10(7, 8)).toBe(8.8);
    expect(toScale10(1, 3)).toBe(3.3);
    expect(toScale10(2, 3)).toBe(6.7);
    expect(toScale10(17, 40)).toBe(4.3);
    expect(toScale10(0.25, 1)).toBe(2.5);
    expect(toScale10(0.85, 1)).toBe(8.5);
    expect(toScale10(10, 10)).toBe(10);
    expect(toScale10(0, 4)).toBe(0);
    expect(toScale10(3, 0)).toBeNull();
  });

  it("derives defaults and rejects unsupported content or durations", () => {
    expect(resolveAssessmentConfig("test", undefined, undefined)).toEqual({ assessmentType: "PRACTICE", durationMinutes: null });
    expect(resolveAssessmentConfig("test", "REGULAR_15M", undefined)).toEqual({ assessmentType: "REGULAR_15M", durationMinutes: 15 });
    expect(resolveAssessmentConfig("written", "MIDTERM_45M", null)).toEqual({ assessmentType: "MIDTERM_45M", durationMinutes: 45 });
    expect(() => resolveAssessmentConfig("lesson", "REGULAR_15M", undefined)).toThrow();
    expect(() => resolveAssessmentConfig("test", "REGULAR_15M", 4)).toThrow();
    expect(() => resolveAssessmentConfig("test", "MIDTERM_45M", 121)).toThrow();
    expect(() => resolveAssessmentConfig("test", "PRACTICE", 15)).toThrow();
    expect(sessionExpiry(new Date(0), 15, new Date(60 * 60_000)).getTime()).toBe(15 * 60_000);
    expect(sessionExpiry(new Date(0), 15, new Date(5 * 60_000)).getTime()).toBe(5 * 60_000);
  });

  it("scores a partial graded test and rejects unknown or repeated answers", () => {
    const content = { questions: [q("q1"), q("q2"), q("q3")] };
    expect(scoreGradedTest(content, [{ questionId: "q1", optionId: "q1a" }])).toEqual({ correctCount: 1, questionCount: 3, score: 33 });
    expect(scoreGradedTest(content, [])).toEqual({ correctCount: 0, questionCount: 3, score: 0 });
    expect(() => scoreGradedTest(content, [{ questionId: "qx", optionId: "a" }])).toThrow();
    expect(() => scoreGradedTest(content, [{ questionId: "q1", optionId: "q1a" }, { questionId: "q1", optionId: "q1b" }])).toThrow();
  });
});

describe("TAI7-T1 assigning a graded assessment", () => {
  it("stores the type and default duration, and PRACTICE stays the default", async () => {
    const id = await assign();
    expect(db.assignment.rows.find((r: Row) => r.id === id)).toMatchObject({ assessmentType: "REGULAR_15M", durationMinutes: 15 });
    const practice: any = await service().assign("class-a", req(OWNER), { contentType: "written", contentId: "wt-1", dueDate: due(), studentIds: [] });
    expect(practice.assignment.assessment).toMatchObject({ type: "PRACTICE", graded: false, durationMinutes: null });
  });

  it("rejects graded lessons and out-of-policy durations", async () => {
    expect(await codeOf(service().assign("class-a", req(OWNER), { contentType: "lesson", contentId: "l1", studentIds: [], assessmentType: "REGULAR_15M" }))).toBe("ASSESSMENT_TYPE_UNSUPPORTED");
    expect(await codeOf(assign({ durationMinutes: 200 }))).toBe("ASSESSMENT_DURATION_INVALID");
    expect(await codeOf(assign({ assessmentType: "PRACTICE", durationMinutes: 15 }))).toBe("ASSESSMENT_DURATION_INVALID");
  });
});

describe("TAI7-T1 timed session, one attempt and hidden results", () => {
  it("hides the paper until the session starts, then accepts one partial submission", async () => {
    const id = await assign();
    const before = await detail(id);
    expect(before.content.questions).toEqual([]);
    expect(before.assessment).toMatchObject({ type: "REGULAR_15M", graded: true, coefficient: 1, durationMinutes: 15, attemptsAllowed: 1, attemptsUsed: 0, openSession: null, resultPublished: false });

    expect(await codeOf(submit(id, { answers: [{ questionId: "q1", optionId: "q1a" }] }))).toBe("ASSESSMENT_SESSION_REQUIRED");
    const started = await start(id);
    expect(started).toMatchObject({ resumed: false, session: { attemptNo: 1, status: "OPEN" } });
    expect(new Date(started.session.expiresAt).getTime() - new Date(started.session.startedAt).getTime()).toBe(15 * 60_000);
    expect((await start(id)).resumed).toBe(true);
    const during = await detail(id);
    expect(during.content.questions).toHaveLength(8);
    expect(during.assessment.openSession).toMatchObject({ id: started.session.id });

    const answers = ["q1", "q2", "q3", "q4", "q5", "q6", "q7"].map((x) => ({ questionId: x, optionId: `${x}a` }));
    const result = await submit(id, { sessionId: started.session.id, answers });
    expect(db.assignmentSubmission.rows[0]).toMatchObject({ correctCount: 7, questionCount: 8, score: 88, timing: "ON_TIME", sessionId: started.session.id, autoSubmitted: false });
    expect(nonNullResultKeys(result)).toEqual([]);
    expect(result.state.resultHidden).toBe(true);

    expect(await codeOf(start(id))).toBe("ASSESSMENT_ATTEMPT_USED");
    expect(nonNullResultKeys(await detail(id))).toEqual([]);
    expect(nonNullResultKeys(await learning().assignments(req(S1)))).toEqual([]);

    const board: any = await service().testStatus("class-a", id, req(OWNER));
    const row = board.students.find((s: Row) => s.student.id === "s1");
    expect(row.current).toMatchObject({ score: 88, correctCount: 7, score10: 8.8, resultHidden: false });
    expect(row.attempts).toMatchObject({ used: 1, allowed: 1, retakePending: false });

    await service().publishScores("class-a", id, req(OWNER));
    const after = await detail(id);
    expect(after.state.current).toMatchObject({ score: 88, score10: 8.8, resultHidden: false });
    expect(after.content.questions).toHaveLength(8);
    expect(db.notification.rows.some((n: Row) => n.type === "SCORES_PUBLISHED" && n.recipientId === "s1")).toBe(true);
    expect((await service().publishScores("class-a", id, req(OWNER))).alreadyPublished).toBe(true);
  });

  it("auto-submits an expired session once from its draft, through reads and the sweeper", async () => {
    const id = await assign();
    const { session } = await start(id);
    await learning().saveAssessmentDraft(id, session.id, req(S1), { answers: [{ questionId: "q1", optionId: "q1a" }, { questionId: "q2", optionId: "q2b" }] });
    expire(session.id);
    expect(await codeOf(learning().saveAssessmentDraft(id, session.id, req(S1), { answers: [] }))).toBe("ASSESSMENT_SESSION_CLOSED");
    expect(await codeOf(submit(id, { sessionId: session.id, answers: [] }))).toBe("ASSESSMENT_SESSION_CLOSED");

    const view = await detail(id);
    expect(view.state.status).toBe("SUBMITTED");
    const rows = db.assignmentSubmission.rows;
    expect(rows).toHaveLength(1);
    const expiresAt = db.assessmentSession.rows[0].expiresAt;
    expect(rows[0]).toMatchObject({ autoSubmitted: true, correctCount: 1, sessionId: session.id });
    expect(rows[0].submittedAt.getTime()).toBe(expiresAt.getTime());
    await detail(id);
    expect(await new AssessmentSessionSweeper(db).sweep()).toBe(0);
    expect(db.assignmentSubmission.rows).toHaveLength(1);
    expect(db.assessmentSession.rows[0].status).toBe("SUBMITTED");
  });

  it("the sweeper alone submits a session whose student never came back", async () => {
    const id = await assign();
    const { session } = await start(id, S2);
    expire(session.id);
    expect(await new AssessmentSessionSweeper(db).sweep()).toBe(1);
    expect(db.assignmentSubmission.rows[0]).toMatchObject({ studentId: "s2", autoSubmitted: true, correctCount: 0 });
  });

  it("accepts a submission within the 30 s grace and clamps its time to the expiry", async () => {
    const id = await assign();
    const { session } = await start(id);
    expire(session.id, 10_000);
    await submit(id, { sessionId: session.id, answers: [] });
    const s = db.assessmentSession.rows[0];
    expect(db.assignmentSubmission.rows[0].submittedAt.getTime()).toBe(s.expiresAt.getTime());
  });

  it("refuses to start after the due time and keeps PRACTICE free of sessions", async () => {
    const id = await assign();
    for (const r of db.assignmentDeadlineRevision.rows) r.dueAt = new Date(Date.now() - 1000);
    expect(await codeOf(start(id))).toBe("ASSESSMENT_CLOSED");
    const practice = await assign({ assessmentType: "PRACTICE", contentType: "written", contentId: "wt-1" });
    expect(await codeOf(start(practice))).toBe("ASSESSMENT_NOT_GRADED");
    expect(await codeOf(submit(practice, { sessionId: "x", responses: [] }))).toBe("ASSESSMENT_SESSION_NOT_ALLOWED");
  });
});

describe("TAI7-T1 retake grants", () => {
  it("allows exactly one more attempt per grant", async () => {
    const id = await assign();
    const first = await start(id);
    await submit(id, { sessionId: first.session.id, answers: [] });
    expect(await codeOf(start(id))).toBe("ASSESSMENT_ATTEMPT_USED");

    expect(await codeOf(service().grantRetake("class-a", id, req(OUTSIDER), { studentId: "s1", reason: "Mất mạng" }))).toBe("CLASS_ACCESS_DENIED");
    await service().grantRetake("class-a", id, req(OWNER), { studentId: "s1", reason: "Mất mạng" });
    expect(await codeOf(service().grantRetake("class-a", id, req(OWNER), { studentId: "s1", reason: "Lần nữa" }))).toBe("ASSESSMENT_RETAKE_PENDING");
    expect(db.notification.rows.some((n: Row) => n.type === "ASSESSMENT_RETAKE_GRANTED")).toBe(true);

    const second = await start(id);
    expect(second.session.attemptNo).toBe(2);
    expect(db.assessmentRetakeGrant.rows[0].consumedAt).toBeInstanceOf(Date);
    await submit(id, { sessionId: second.session.id, answers: [{ questionId: "q1", optionId: "q1a" }] });
    expect(await codeOf(start(id))).toBe("ASSESSMENT_ATTEMPT_USED");
    const board: any = await service().testStatus("class-a", id, req(OWNER));
    expect(board.students.find((s: Row) => s.student.id === "s1").attempts).toMatchObject({ used: 2, allowed: 2 });
  });

  it("rejects retake on practice work and for non-target students", async () => {
    const practice = await assign({ assessmentType: "PRACTICE" });
    expect(await codeOf(service().grantRetake("class-a", practice, req(OWNER), { studentId: "s1", reason: "x" }))).toBe("ASSESSMENT_NOT_GRADED");
    const id = await assign({ studentIds: ["s1"], audience: "SUBSET", dueDate: due(4 * DAY) });
    expect(await codeOf(service().grantRetake("class-a", id, req(OWNER), { studentId: "s2", reason: "x" }))).toBe("STUDENT_NOT_TARGETED");
  });
});

describe("TAI7-T1 graded written task", () => {
  it("accepts empty responses, hides the grade until publication and reports score10", async () => {
    const id = await assign({ contentType: "written", contentId: "wt-1", assessmentType: "MIDTERM_45M" });
    const { session } = await start(id);
    expect(new Date(session.expiresAt).getTime() - new Date(session.startedAt).getTime()).toBe(45 * 60_000);
    await submit(id, { sessionId: session.id, responses: [{ promptId: "p1", text: "Dòng điện có tác dụng nhiệt." }] });
    const sub = db.assignmentSubmission.rows[0];
    expect(sub.answers).toEqual([{ promptId: "p1", text: "Dòng điện có tác dụng nhiệt." }, { promptId: "p2", text: "" }]);
    await service().gradeWritten("class-a", id, sub.id, req(OWNER), { kind: "MANUAL", criterionPoints: [{ promptId: "p1", criterionCode: "GIAI_THICH", points: 1.5 }, { promptId: "p2", criterionCode: "GIAI_THICH", points: 0 }] });
    expect(nonNullResultKeys(await detail(id))).toEqual([]);
    const board: any = await service().writtenStatus("class-a", id, req(OWNER));
    expect(board.students.find((s: Row) => s.student.id === "s1").current).toMatchObject({ status: "GRADED", score10: 3.8 });
    await service().publishScores("class-a", id, req(OWNER));
    expect((await detail(id)).state.current).toMatchObject({ status: "GRADED", score10: 3.8, grade: expect.objectContaining({ totalPoints: 1.5, maxPoints: 4 }) });
  });
});

// ---------------------------------------------------------------------------------------------------------------
// TAI7-T3: class gradebook, quick-approve, similarity flags, lock and CSV.
const ASSIST = { enabled: true, mode: "assist" as const, policy: null, promptVersion: "assess-submission@1", dailyLimit: 50 };
const gradebook = (assist = true) => new GradebookService(db, assist ? ASSIST : undefined);
const pastDue = (assignmentId: string) => {
  for (const r of db.assignmentDeadlineRevision.rows.filter((x: Row) => x.assignmentId === assignmentId)) r.dueAt = new Date(Date.now() - 60_000);
  db.assignment.rows.find((a: Row) => a.id === assignmentId).dueDate = new Date(Date.now() - 60_000);
};

describe("TAI7-T3 pure gradebook helpers", () => {
  it("orders the class list by given name, then full name (Vietnamese convention)", () => {
    const order = classListOrder([
      { id: "1", fullName: "Trần Văn Bình", username: "b" },
      { id: "2", fullName: "Nguyễn Thị An", username: "a2" },
      { id: "3", fullName: "Lê An", username: "a1" },
      { id: "4", fullName: "Phạm Đức", username: "d" },
    ]);
    expect(order.map((s) => s.fullName)).toEqual(["Lê An", "Nguyễn Thị An", "Trần Văn Bình", "Phạm Đức"]);
  });

  it("writes an Excel-ready CSV: BOM, CRLF, decimal comma with ';' for vn, absent as Vắng, formulas neutralized", () => {
    const entries = [
      { index: 1, username: "an", fullName: "Lê An", status: "GRADED", score10: 8.8 },
      { index: 2, username: "binh", fullName: "=HYPERLINK(\"x\")", status: "ABSENT", score10: null },
      { index: 3, username: "chi", fullName: "Chi; Nguyễn", status: "ZERO_REJECTED", score10: 0 },
    ];
    const vn = gradebookCsv(entries, "vn");
    expect(vn.startsWith("\uFEFFSTT;Tên đăng nhập;Họ và tên;Điểm;Ghi chú\r\n")).toBe(true);
    expect(vn).toContain("1;an;Lê An;8,8;\r\n");
    expect(vn).toContain(`2;binh;"'=HYPERLINK(""x"")";;Vắng\r\n`);
    expect(vn).toContain('3;chi;"Chi; Nguyễn";0,0;Bài nộp trễ bị từ chối (0 điểm)\r\n');
    const standard = gradebookCsv(entries, "standard");
    expect(standard).toContain("1,an,Lê An,8.8,\r\n");
    expect(csvFileName("Kiểm tra 15 phút – Điện", 2)).toEqual({ ascii: "So-diem-Kiem-tra-15-phut-Dien-v2.csv", utf8: "Sổ điểm - Kiểm tra 15 phút – Điện (lần chốt 2).csv" });
  });
});

describe("TAI7-T3 gradebook of a graded test", () => {
  it("shows statuses, time used, 10-point scores and a summary; absent students show Vắng after the due time", async () => {
    const id = await assign();
    const { session } = await start(id);
    const answers = ["q1", "q2", "q3", "q4", "q5", "q6", "q7"].map((x) => ({ questionId: x, optionId: `${x}a` }));
    await submit(id, { sessionId: session.id, answers });
    let book: any = await gradebook().gradebook("class-a", id, req(OWNER));
    expect(book.rows.map((r: Row) => [r.student.id, r.status])).toEqual([["s1", "GRADED"], ["s2", "NOT_STARTED"]]);
    expect(book.rows[0]).toMatchObject({ mcq10: 8.8, total10: 8.8, rawPoints: 7, maxPoints: 8, attempts: { used: 1, open: false } });
    expect(typeof book.rows[0].timeUsedSeconds).toBe("number");
    expect(book.summary).toMatchObject({ students: 2, submitted: 1, absent: 0, notStarted: 1, average10: 8.8, awaitingGrade: 0 });
    expect(book.blockers).toEqual([{ studentId: "s2", fullName: "Học sinh s2", status: "NOT_STARTED" }]);
    expect(await codeOf(gradebook().lock("class-a", id, req(OWNER)))).toBe("GRADEBOOK_NOT_READY");

    pastDue(id);
    book = await gradebook().gradebook("class-a", id, req(OWNER));
    expect(book.rows.map((r: Row) => r.status)).toEqual(["GRADED", "ABSENT"]);
    expect(book.summary).toMatchObject({ absent: 1, average10: 8.8 });
    expect(await codeOf(gradebook().gradebook("class-a", id, req(OUTSIDER)))).toBe("CLASS_ACCESS_DENIED");
  });

  it("locks an immutable snapshot, blocks retakes while locked, exports the CSV and unlocks only with a reason", async () => {
    const id = await assign();
    const { session } = await start(id);
    await submit(id, { sessionId: session.id, answers: [{ questionId: "q1", optionId: "q1a" }] });
    pastDue(id);
    expect(await codeOf(gradebook().exportCsv("class-a", id, req(OWNER), {}))).toBe("GRADEBOOK_NOT_LOCKED");
    const locked: any = await gradebook().lock("class-a", id, req(OWNER));
    expect(locked.assignment.gradebook).toMatchObject({ lockVersion: 1 });
    expect(db.gradebookEntry.rows.map((e: Row) => [e.studentId, e.status, e.score10, e.lockVersion])).toEqual([["s1", "GRADED", 1.3, 1], ["s2", "ABSENT", null, 1]]);
    expect(await codeOf(gradebook().lock("class-a", id, req(OWNER)))).toBe("GRADEBOOK_LOCKED");
    expect(await codeOf(service().grantRetake("class-a", id, req(OWNER), { studentId: "s2", reason: "ốm" }))).toBe("GRADEBOOK_LOCKED");

    const { csv, fileName } = await gradebook().exportCsv("class-a", id, req(OWNER), {});
    expect(csv.split("\r\n").slice(0, 3)).toEqual(["\uFEFFSTT;Tên đăng nhập;Họ và tên;Điểm;Ghi chú", "1;s1;Học sinh s1;1,3;", "2;s2;Học sinh s2;;Vắng"]);
    expect(fileName.ascii).toMatch(/\.csv$/);
    expect(db.auditLog.rows.some((r: Row) => r.action === "gradebook.export")).toBe(true);

    expect(await codeOf(gradebook().unlock("class-a", id, req(OWNER), { reason: "  " }))).not.toBeNull();
    await gradebook().unlock("class-a", id, req(OWNER), { reason: "Sửa điểm phúc khảo" });
    expect(db.auditLog.rows.find((r: Row) => r.action === "gradebook.unlock")).toMatchObject({ reason: "Sửa điểm phúc khảo" });
    await service().grantRetake("class-a", id, req(OWNER), { studentId: "s2", reason: "ốm" });
    expect(await codeOf(gradebook().lock("class-a", id, req(OWNER)))).toBe(null); // s2 has a grant but the window is closed: still ABSENT
    expect(db.gradebookEntry.rows.filter((e: Row) => e.lockVersion === 2)).toHaveLength(2);
    expect(db.gradebookEntry.rows.filter((e: Row) => e.lockVersion === 1)).toHaveLength(2);
  });
});

describe("TAI7-T3 gradebook of a written task: AI quick-approve and similarity flags", () => {
  const criterion = (promptId: string, points: number, valid = true) => ({ promptId, criterionCode: "GIAI_THICH", valid, reasonCode: null, suggestedPoints: valid ? points : null, rationale: "r", uncertainty: "LOW", evidence: [] });
  const suggest = (submissionId: string, status: string, criteria: Row[]) => {
    const job = { id: `job-${submissionId}`, submissionId, purpose: "ASSESS_SUBMISSION", promptVersion: "assess-submission@1", request: { mode: "assist" }, status: "SUCCEEDED", createdAt: new Date() };
    db.aiJob.rows.push(job);
    db.aiAssessmentSuggestion.rows.push({ id: `sug-${submissionId}`, jobId: job.id, submissionId, resourceVersion: 1, promptVersion: "assess-submission@1", mode: "assist", status, criterionResults: criteria, flags: [], createdAt: new Date() });
  };
  async function written() {
    const id = await assign({ contentType: "written", contentId: "wt-1", assessmentType: "MIDTERM_45M" });
    const ids: string[] = [];
    for (const user of [S1, S2]) {
      const { session } = await start(id, user);
      await submit(id, { sessionId: session.id, responses: [{ promptId: "p1", text: "Dòng điện có tác dụng nhiệt nên dây tóc nóng sáng." }, { promptId: "p2", text: "Bóng đèn sáng." }] }, user);
      ids.push(db.assignmentSubmission.rows.at(-1).id);
    }
    return { id, ids };
  }

  it("lists AI state and HIGH similarity flags, and counts them in the summary", async () => {
    const { id, ids } = await written();
    suggest(ids[0]!, "VALID", [criterion("p1", 2), criterion("p2", 1)]);
    suggest(ids[1]!, "PARTIAL", [criterion("p1", 1), criterion("p2", 0, false)]);
    db.submissionSimilarityRun.rows.push({ id: "run1", assignmentId: id, createdAt: new Date() });
    db.submissionSimilarityMatch.rows.push({ id: "m1", runId: "run1", submissionAId: ids[0], submissionBId: ids[1], level: "HIGH", maxContainment: 0.9 });
    const book: any = await gradebook().gradebook("class-a", id, req(OWNER));
    expect(book.rows[0]).toMatchObject({ status: "AWAITING_GRADE", ai: { status: "VALID", suggested10: 7.5, canQuickApprove: true }, similarity: { level: "HIGH", reviewed: false, otherStudentId: "s2" } });
    expect(book.rows[1]).toMatchObject({ ai: { status: "PARTIAL", suggested10: null, canQuickApprove: false }, similarity: { level: "HIGH", otherStudentId: "s1" } });
    expect(book.summary).toMatchObject({ awaitingGrade: 2, aiReady: 1, similarityFlags: 2, similarityUnreviewed: 2, average10: null });
    expect(book.blockers.map((b: Row) => b.status)).toEqual(["AWAITING_GRADE", "AWAITING_GRADE"]);
    // Without assist mode no suggestion is shown or usable.
    expect((await gradebook(false).gradebook("class-a", id, req(OWNER)) as any).rows[0].ai).toBeNull();
    expect(await codeOf(gradebook(false).quickApprove("class-a", id, req(OWNER), {}))).toBe("AI_ASSESSMENT_DISABLED");
  });

  it("quick-approves only VALID suggestions through the append-only grade writer, then locks", async () => {
    const { id, ids } = await written();
    suggest(ids[0]!, "VALID", [criterion("p1", 2), criterion("p2", 1)]);
    suggest(ids[1]!, "PARTIAL", [criterion("p1", 1), criterion("p2", 0, false)]);
    const result: any = await gradebook().quickApprove("class-a", id, req(OWNER), { submissionIds: ids });
    expect(result.approved).toEqual([{ submissionId: ids[0], gradeId: expect.any(String), score10: 7.5 }]);
    expect(result.skipped).toEqual([{ submissionId: ids[1], reason: "SUGGESTION_NOT_VALID" }]);
    expect(db.writtenGradeDecision.rows).toEqual([expect.objectContaining({ submissionId: ids[0], kind: "ACCEPTED_AI", basedOnSuggestionId: `sug-${ids[0]}`, actorId: OWNER.sub, totalPoints: 3, maxPoints: 4 })]);
    expect(db.auditLog.rows.filter((r: Row) => r.action === "written_grade.create")).toHaveLength(1);
    const again: any = await gradebook().quickApprove("class-a", id, req(OWNER), { submissionIds: [ids[0]!] });
    expect(again).toMatchObject({ approved: [], skipped: [{ reason: "ALREADY_GRADED" }] });

    await service().gradeWritten("class-a", id, ids[1]!, req(OWNER), { kind: "MANUAL", criterionPoints: [{ promptId: "p1", criterionCode: "GIAI_THICH", points: 1 }, { promptId: "p2", criterionCode: "GIAI_THICH", points: 0.5 }] });
    pastDue(id);
    await gradebook().lock("class-a", id, req(OWNER));
    expect(db.gradebookEntry.rows.map((e: Row) => [e.studentId, e.score10])).toEqual([["s1", 7.5], ["s2", 3.8]]);
    expect(await codeOf(service().gradeWritten("class-a", id, ids[1]!, req(OWNER), { kind: "MANUAL", criterionPoints: [{ promptId: "p1", criterionCode: "GIAI_THICH", points: 2 }, { promptId: "p2", criterionCode: "GIAI_THICH", points: 2 }] }))).toBe("GRADEBOOK_LOCKED");
    expect(await codeOf(gradebook().quickApprove("class-a", id, req(OWNER), {}))).toBe("GRADEBOOK_LOCKED");
  });

  it("skips a suggestion whose points no longer fit the rubric, writing nothing for it", async () => {
    const { id, ids } = await written();
    suggest(ids[0]!, "VALID", [criterion("p1", 3), criterion("p2", 1)]);
    const result: any = await gradebook().quickApprove("class-a", id, req(OWNER), {});
    expect(result).toEqual({ approved: [], skipped: [{ submissionId: ids[0], reason: "GRADE_POINTS_INVALID" }] });
    expect(db.writtenGradeDecision.rows).toEqual([]);
  });
});
