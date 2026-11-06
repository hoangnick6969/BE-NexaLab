import { beforeEach, describe, expect, it } from "vitest";
import { LearningController } from "./learning.controller";
import { AssignmentsService } from "../../classes/application/assignments.service";
import { autoScore, submissionView } from "../../classes/application/assignment-test-contract";
import { normalizeWrittenResponses, responseLength } from "../../classes/application/assignment-written-contract";
import { ClassProgressController } from "../../reports/interface/class-progress.controller";
import { ClassEvidenceController } from "../../reports/interface/class-evidence.controller";
import { ParentsController } from "../../parents/interface/parents.controller";
import { PrismaNotificationRepository } from "../../notifications/infrastructure/prisma-notification.repository";

/**
 * TAI2-T2: written-task assignment and submission lifecycle on an in-memory stand-in for Prisma
 * (no database). Student-facing responses are key-scanned for teacher-only rubric fields.
 */
const TEACHER_ONLY = ["referenceAnswer", "anchors", "commonPhrases", "gradingNotes"];
function keysAnywhere(value: unknown, keys: string[] = TEACHER_ONLY): string[] {
  const found = new Set<string>();
  const walk = (node: unknown) => {
    if (Array.isArray(node)) return node.forEach(walk);
    if (node && typeof node === "object" && !(node instanceof Date))
      for (const [key, child] of Object.entries(node)) {
        if (keys.includes(key)) found.add(key);
        walk(child);
      }
  };
  walk(JSON.parse(JSON.stringify(value ?? null)));
  return [...found];
}

// ---------------------------------------------------------------------------------------------------------------
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
  },
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
      out[key] = (target as Row[]).filter((r) => matches(rel.table, r, nested.where)).map((r) => hydrate(rel.table, r, nested));
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
  assignmentSubmission: () => ({ gradingMode: "AUTO" }),
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
    async findMany({ where, select, include, orderBy }: Row = {}) {
      return sortRows(t.rows.filter((x) => matches(name, x, where)), orderBy).map((r) => hydrate(name, r, { select, include }));
    },
    async count({ where }: Row = {}) { return t.rows.filter((x) => matches(name, x, where)).length; },
    async create({ data, select, include }: Row) {
      const { targets, ...scalar } = data;
      const r: Row = { id: `${name}-${++seq}`, createdAt: new Date(), ...(DEFAULTS[name]?.() ?? {}), ...scalar };
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
const S3 = { sub: "s3", role: "STUDENT" }; // enrolled, not a target
const S9 = { sub: "s9", role: "STUDENT" }; // not enrolled
const req = (user: Row) => ({ user, headers: { "idempotency-key": `key-${++seq}-abcdefgh` } });
const DAY = 24 * 3600_000;

const rubricPrompt = (id: string, maxChars: number) => ({
  id,
  prompt: `Giải thích hiện tượng ${id}`,
  maxChars,
  referenceAnswer: "Đáp án mẫu chỉ giáo viên thấy",
  commonPhrases: ["tác dụng nhiệt"],
  criteria: [
    { code: "GIAI_THICH", description: "Giải thích đúng", maxPoints: 2, anchors: [{ points: 0, description: "Sai" }, { points: 2, description: "Đúng" }] },
  ],
});

beforeEach(() => {
  seq = 0;
  db = {};
  for (const name of [
    "classroom", "enrollment", "user", "classResource", "assignment", "assignmentTarget", "assignmentDeadlineRevision",
    "assignmentSubmission", "lateDecision", "auditLog", "notification", "idempotencyRecord", "lesson", "lab", "labPackRevocation", "parentLink",
  ])
    db[name] = table(name);
  db.$executeRaw = async () => 0;
  db.$transaction = async (fn: (tx: any) => Promise<any>) => fn(db);
  db.classroom.rows.push(
    { id: "class-a", teacherId: OWNER.sub, status: "ACTIVE", name: "8A", grade: 8 },
    { id: "class-b", teacherId: OUTSIDER.sub, status: "ACTIVE", name: "8B", grade: 8 },
  );
  for (const [id, classId] of [["s1", "class-a"], ["s2", "class-a"], ["s3", "class-a"], ["s9", "class-b"]]) {
    db.user.rows.push({ id, fullName: `Học sinh ${id}`, username: id });
    db.enrollment.rows.push({ id: `e-${id}`, classId, studentId: id, status: "approved" });
  }
  db.classResource.rows.push(
    { id: "wt-1", classId: "class-a", kind: "WRITTEN_TASK", status: "PUBLISHED", version: 1, title: "Tự luận dòng điện", lessonId: null, publishedAt: new Date(), content: { prompts: [rubricPrompt("p1", 100), rubricPrompt("p2", 300)] } },
    { id: "wt-draft", classId: "class-a", kind: "WRITTEN_TASK", status: "DRAFT", version: 1, title: "Nháp", lessonId: null, content: { prompts: [rubricPrompt("p1", 100)] } },
    { id: "wt-b", classId: "class-b", kind: "WRITTEN_TASK", status: "PUBLISHED", version: 1, title: "Lớp khác", lessonId: null, content: { prompts: [rubricPrompt("p1", 100)] } },
    { id: "test-1", classId: "class-a", kind: "TEST", status: "PUBLISHED", version: 1, title: "Kiểm tra", lessonId: null, publishedAt: new Date(), content: { questions: [{ id: "q1", prompt: "1+1?", options: [{ id: "a", text: "2" }, { id: "b", text: "3" }], correctOption: 0, explanation: "x" }] } },
  );
});

const service = () => new AssignmentsService(db);
const learning = () => new LearningController(db, {} as any);
const due = (ms = 3 * DAY) => new Date(Date.now() + ms).toISOString();
async function assignWritten(patch: Row = {}) {
  const result: any = await service().assign("class-a", req(OWNER), { contentType: "written", contentId: "wt-1", dueDate: due(), studentIds: ["s1", "s2"], audience: "SUBSET", ...patch });
  return result.assignment.id as string;
}
const answers = (p1 = "Vì dòng điện có tác dụng nhiệt.", p2 = "Dây tóc nóng lên và phát sáng.") => ({ responses: [{ promptId: "p1", text: p1 }, { promptId: "p2", text: p2 }] });
const submit = (assignmentId: string, body: unknown, user = S1) => learning().submitTest(assignmentId, req(user), body) as Promise<any>;
/** Moves the current deadline into the past so the next submission is late. */
const expireDeadline = (assignmentId: string) => {
  for (const r of db.assignmentDeadlineRevision.rows.filter((x: Row) => x.assignmentId === assignmentId)) r.dueAt = new Date(Date.now() - DAY);
};
const codeOf = async (p: Promise<unknown>) => p.then(() => null, (e: any) => e.response?.code ?? e.status ?? String(e));

describe("TAI2-T2 assigning a written task", () => {
  it("assigns a published WRITTEN_TASK with deadline revision 1 and a pinned version", async () => {
    const id = await assignWritten();
    const a = db.assignment.rows.find((x: Row) => x.id === id);
    expect(a).toMatchObject({ contentType: "written", contentId: "wt-1", contentVersion: "1", audience: "SUBSET" });
    expect(db.assignmentDeadlineRevision.rows).toEqual([expect.objectContaining({ assignmentId: id, revision: 1 })]);
    expect(db.assignmentTarget.rows.map((t: Row) => t.studentId).sort()).toEqual(["s1", "s2"]);
  });

  it("rejects missing due date, drafts, other classes, TEST resources and outsider teachers", async () => {
    expect(await codeOf(service().assign("class-a", req(OWNER), { contentType: "written", contentId: "wt-1", studentIds: [] }))).toBe("DUE_DATE_REQUIRED");
    for (const contentId of ["wt-draft", "wt-b", "test-1"])
      expect(await codeOf(service().assign("class-a", req(OWNER), { contentType: "written", contentId, dueDate: due(), studentIds: [] }))).toBe("CONTENT_NOT_PUBLISHED");
    expect(await codeOf(service().assign("class-a", req(OUTSIDER), { contentType: "written", contentId: "wt-1", dueDate: due(), studentIds: [] }))).toBe("CLASS_ACCESS_DENIED");
  });

  it("keeps targets and due date immutable after assignment", async () => {
    const id = await assignWritten();
    expect(await codeOf(service().updateAssignment("class-a", id, req(OWNER), { studentIds: ["s1"] }))).toBe("TEST_ASSIGNMENT_IMMUTABLE");
    expect(await codeOf(service().updateAssignment("class-a", id, req(OWNER), { dueDate: due(5 * DAY) }))).toBe("TEST_ASSIGNMENT_IMMUTABLE");
    await expect(service().updateAssignment("class-a", id, req(OWNER), { title: "Đổi tên" })).resolves.toMatchObject({ assignment: { title: "Đổi tên" } });
  });

  it("lists written tasks in assignable content with a prompt count and no rubric", async () => {
    const content: any = await service().assignableContent("class-a", req(OWNER));
    expect(content.writtenTasks).toEqual([expect.objectContaining({ id: "wt-1", promptCount: 2, version: 1 })]);
    expect(keysAnywhere(content.writtenTasks)).toEqual([]);
    expect(content.writtenTasks[0]).not.toHaveProperty("content");
  });
});

describe("TAI2-T2 student written submission", () => {
  it("shows the assignment through the allowlist and denies non-targets and outsiders", async () => {
    const id = await assignWritten();
    const detail: any = await learning().assignment(id, { user: S1 });
    expect(detail.content).toEqual({
      id: "wt-1", title: "Tự luận dòng điện", version: 1, promptCount: 2,
      prompts: [
        { id: "p1", prompt: "Giải thích hiện tượng p1", maxChars: 100, criteria: [{ code: "GIAI_THICH", description: "Giải thích đúng", maxPoints: 2 }] },
        { id: "p2", prompt: "Giải thích hiện tượng p2", maxChars: 300, criteria: [{ code: "GIAI_THICH", description: "Giải thích đúng", maxPoints: 2 }] },
      ],
    });
    expect(detail.state).toMatchObject({ status: "UPCOMING", revision: 1, current: null });
    expect(keysAnywhere(detail)).toEqual([]);
    expect(await codeOf(learning().assignment(id, { user: S3 }))).toBe("ASSIGNMENT_NOT_FOUND");
    expect(await codeOf(learning().assignment(id, { user: S9 }))).toBe("ASSIGNMENT_NOT_FOUND");
    expect(await codeOf(submit(id, answers(), S3))).toBe("ASSIGNMENT_NOT_FOUND");
    expect(await codeOf(submit(id, answers(), S9))).toBe("ASSIGNMENT_NOT_FOUND");
  });

  it("stores an on-time submission as TEACHER-graded with no score and returns AWAITING_GRADE", async () => {
    const id = await assignWritten();
    const result = await submit(id, answers("  Vì dòng điện có tác dụng nhiệt.  "));
    expect(result.state).toMatchObject({ status: "AWAITING_GRADE", current: { status: "AWAITING_GRADE", gradeable: true, score: null } });
    expect(result.submission).toMatchObject({ timing: "ON_TIME", status: "AWAITING_GRADE", score: null, questionCount: 2 });
    expect(result.submission.responses).toEqual([
      { promptId: "p1", text: "Vì dòng điện có tác dụng nhiệt." },
      { promptId: "p2", text: "Dây tóc nóng lên và phát sáng." },
    ]);
    expect(keysAnywhere(result)).toEqual([]);
    const row = db.assignmentSubmission.rows[0];
    expect(row).toMatchObject({ gradingMode: "TEACHER", score: null, correctCount: null, questionCount: 2, resourceVersion: 1 });
    expect(db.auditLog.rows.find((a: Row) => a.action === "assignment.submit").after).toMatchObject({ gradingMode: "TEACHER", timing: "ON_TIME" });
    expect(db.notification.rows.filter((n: Row) => n.type === "SUBMISSION_RECEIVED")).toEqual([expect.objectContaining({ recipientId: OWNER.sub })]);
    expect(() => autoScore(row)).toThrow(/not server-scored/);
  });

  it("rejects missing, repeated, unknown, empty and over-length responses with WRITTEN_RESPONSES_INVALID", async () => {
    const id = await assignWritten();
    const bodies = [
      { responses: [{ promptId: "p1", text: "a" }] },
      { responses: [{ promptId: "p1", text: "a" }, { promptId: "p1", text: "b" }, { promptId: "p2", text: "c" }] },
      { responses: [{ promptId: "p1", text: "a" }, { promptId: "p2", text: "b" }, { promptId: "px", text: "c" }] },
      answers("   "),
      answers("x".repeat(101)),
    ];
    for (const body of bodies) expect(await codeOf(submit(id, body))).toBe("WRITTEN_RESPONSES_INVALID");
    // Unknown keys and a TEST-shaped body are rejected by the strict schemas before anything is stored.
    await expect(submit(id, { ...answers(), extra: true })).rejects.toBeTruthy();
    await expect(submit(id, { answers: [{ questionId: "p1", optionId: "a" }] })).rejects.toBeTruthy();
    expect(db.assignmentSubmission.rows).toHaveLength(0);
  });

  it("counts Unicode code points after trim and NFC, so decomposed Vietnamese text is not over-counted", () => {
    const decomposed = "ệ".normalize("NFD").repeat(100);
    expect(decomposed.length).toBeGreaterThan(100);
    expect(responseLength(`  ${decomposed} `)).toBe(100);
    expect(normalizeWrittenResponses({ prompts: [{ id: "p1", maxChars: 100 }] }, [{ promptId: "p1", text: decomposed }])[0].text).toBe("ệ".repeat(100));
    expect(responseLength("😀".repeat(3))).toBe(3);
  });

  it("requires a late reason after the deadline; with a reason the submission waits for review", async () => {
    const id = await assignWritten();
    expireDeadline(id);
    expect(await codeOf(submit(id, answers()))).toBe("LATE_REASON_REQUIRED");
    const late = await submit(id, { ...answers(), lateReason: "Em bị ốm" });
    expect(late.state).toMatchObject({ status: "LATE_REVIEW_PENDING", current: { timing: "LATE", gradeable: false, score: null, lateReason: "Em bị ốm" } });
    expect(db.notification.rows.at(-1)).toMatchObject({ type: "LATE_SUBMISSION_PENDING" });
    const queue: any[] = await service().lateQueue("class-a", { user: OWNER });
    expect(queue).toEqual([expect.objectContaining({ assignmentId: id, contentType: "written", lateReason: "Em bị ốm", student: expect.objectContaining({ id: "s1" }) })]);
    expect(keysAnywhere(queue)).toEqual([]);
  });

  it("REJECT_ZERO turns the late submission into REJECTED with score 0", async () => {
    const id = await assignWritten();
    expireDeadline(id);
    const late = await submit(id, { ...answers(), lateReason: "Mất mạng" });
    await expect(service().rejectLate("class-a", id, late.submission.id, req(OWNER), { note: "Không chấp nhận" })).resolves.toMatchObject({ decision: "REJECT_ZERO", score: 0 });
    const detail: any = await learning().assignment(id, { user: S1 });
    expect(detail.state).toMatchObject({ status: "REJECTED", current: { status: "REJECTED_ZERO", score: 0, gradeable: false } });
    expect(await codeOf(service().rejectLate("class-a", id, late.submission.id, req(OUTSIDER), {}))).toBe("CLASS_ACCESS_DENIED");
  });

  it("a deadline extension makes pending late work gradeable", async () => {
    const id = await assignWritten();
    expireDeadline(id);
    await submit(id, { ...answers(), lateReason: "Em quên" });
    const revised: any = await service().reviseDeadline("class-a", id, req(OWNER), { dueAt: due(2 * DAY), expectedRevision: 1, note: "Gia hạn" });
    expect(revised).toMatchObject({ deadline: { revision: 2 }, acceptedSubmissions: 1 });
    const detail: any = await learning().assignment(id, { user: S1 });
    expect(detail.state).toMatchObject({ status: "AWAITING_GRADE", revision: 2, extended: true, current: { gradeable: true, decision: { decision: "REVISE_DEADLINE_FOR_CLASS" } } });
  });

  it("a resubmission becomes current and earlier submissions stay in history", async () => {
    const id = await assignWritten();
    const first = await submit(id, answers("Lần một"));
    await new Promise((r) => setTimeout(r, 5));
    const second = await submit(id, answers("Lần hai"));
    expect(second.state.current.id).toBe(second.submission.id);
    expect(second.state.history.map((h: Row) => h.id)).toEqual([second.submission.id, first.submission.id]);
    expect(second.state.current.responses[0].text).toBe("Lần hai");
    expect(second.state.status).toBe("AWAITING_GRADE");
  });

  it("archiving the assignment closes submission", async () => {
    const id = await assignWritten();
    await service().archiveAssignment("class-a", id, { user: OWNER }, { reason: "Kết thúc chủ đề", confirm: true });
    expect(await codeOf(submit(id, answers()))).toBe("ASSIGNMENT_NOT_FOUND");
    expect(await codeOf(learning().assignment(id, { user: S1 }))).toBe("ASSIGNMENT_NOT_FOUND");
  });

  it("a written body on a TEST assignment is rejected and the TEST path still scores and audits AUTO", async () => {
    const test: any = await service().assign("class-a", req(OWNER), { contentType: "test", contentId: "test-1", dueDate: due(), studentIds: [] });
    expect(await codeOf(submit(test.assignment.id, { responses: [{ promptId: "q1", text: "2" }] }))).toBe("TEST_ANSWERS_INVALID");
    const scored = await submit(test.assignment.id, { answers: [{ questionId: "q1", optionId: "a" }] });
    expect(scored.submission).toMatchObject({ status: "SCORED", score: 100, correctCount: 1, questionCount: 1 });
    expect(db.assignmentSubmission.rows.at(-1)).toMatchObject({ gradingMode: "AUTO", score: 100 });
    expect(db.auditLog.rows.filter((a: Row) => a.action === "assignment.submit").at(-1).after).toMatchObject({ gradingMode: "AUTO" });
  });
});

describe("TAI2-T2 read models", () => {
  it("lists written assignments for the student with status only and for the teacher with writtenSummary", async () => {
    const id = await assignWritten();
    await submit(id, answers());
    const mine: any[] = await learning().assignments({ user: S1 });
    expect(mine).toEqual([expect.objectContaining({ id, contentType: "written", writtenStatus: expect.objectContaining({ status: "AWAITING_GRADE", score: null }) })]);
    expect(mine[0]).not.toHaveProperty("testStatus");
    expect(keysAnywhere(mine)).toEqual([]);
    const list: any[] = await service().classAssignments("class-a", { user: OWNER }, {});
    expect(list.find((a) => a.id === id)).toMatchObject({
      contentType: "written",
      writtenSummary: { revision: 1, extended: false, counts: { AWAITING_GRADE: 1, LATE_REVIEW_PENDING: 0, REJECTED: 0, OVERDUE_UNSUBMITTED: 0, NOT_SUBMITTED: 1 } },
    });
    expect(await codeOf(service().testStatus("class-a", id, { user: OWNER }))).toBe("ASSIGNMENT_NOT_FOUND");
  });

  it("reports progress with score null and counts AWAITING_GRADE as submitted for support flags", async () => {
    const id = await assignWritten();
    await submit(id, answers());
    expireDeadline(id);
    const board: any[] = await new ClassProgressController(db).assignmentProgressBoard("class-a", id, { user: OWNER });
    expect(board.find((r) => r.student.id === "s1")).toMatchObject({ testStatus: "AWAITING_GRADE", score: null, passed: false, attempts: 1 });
    expect(board.find((r) => r.student.id === "s2")).toMatchObject({ testStatus: "OVERDUE_UNSUBMITTED", score: null });
    const support: any[] = await new ClassEvidenceController(db).support("class-a", id, { user: OWNER });
    expect(support.map((r) => r.student.id)).toEqual(["s2"]);
    expect(support[0].flags.map((f: Row) => f.code)).toContain("OVERDUE_INCOMPLETE");
  });

  it("parent views and parent notices carry no written assignment; students get due-soon reminders", async () => {
    const id = await assignWritten({ dueDate: due(DAY / 2) });
    const parents = new ParentsController(db, { readableStudent: async () => undefined } as any, {} as any);
    const parentReq = { user: { sub: "parent-1", role: "PARENT" } };
    expect(await codeOf(parents.childAssignment(parentReq, "s1", id))).toBe("ASSIGNMENT_NOT_FOUND");
    expireDeadline(id);
    const notices = await parents.overdueNotices(parentReq, "s1");
    expect(notices).toEqual([]);
    expect(keysAnywhere(notices)).toEqual([]);
    for (const r of db.assignmentDeadlineRevision.rows) r.dueAt = new Date(Date.now() + DAY / 2);
    const states = await new PrismaNotificationRepository(db).assignedTestStates("s1");
    expect(states).toEqual([expect.objectContaining({ assignmentId: id, status: "DUE_SOON", contentType: "written" })]);
  });

  it("autoScore leaves TEST views unchanged and throws on TEACHER rows", () => {
    const base = { id: "x", timing: "ON_TIME", questionCount: 2, lateReason: null, submittedAt: new Date(), decision: null };
    expect(submissionView({ ...base, score: 50, correctCount: 1 })).toMatchObject({ status: "SCORED", score: 50, correctCount: 1 });
    expect(submissionView({ ...base, score: 50, correctCount: 1, gradingMode: "AUTO" })).toMatchObject({ score: 50 });
    expect(() => submissionView({ ...base, score: null, correctCount: null, gradingMode: "TEACHER" })).toThrow(/not server-scored/);
    expect(autoScore({ gradingMode: "AUTO", score: 0, correctCount: 0 })).toEqual({ score: 0, correctCount: 0 });
  });
});
