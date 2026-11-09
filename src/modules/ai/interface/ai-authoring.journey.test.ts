import { Reflector } from "@nestjs/core";
import { beforeEach, describe, expect, it } from "vitest";
import { access, AuthGuard } from "../../auth/interface/auth";
import { AssignmentsService } from "../../classes/application/assignments.service";
import { ClassResourcesService } from "../../classes/application/class-resources.service";
import { AssignmentsController } from "../../classes/interface/assignments.controller";
import { ClassResourcesController } from "../../classes/interface/class-resources.controller";
import { LearningController } from "../../learning/interface/learning.controller";
import { parseAiConfig } from "../application/ai-config";
import { AiJobRunner } from "../application/ai-job-runner";
import { AiJobsService } from "../application/ai-jobs.service";
import { FakeAiProvider } from "../infrastructure/fake-provider";
import { AiJobsController } from "./ai-jobs.controller";

/**
 * TAI-T6 end-to-end proof without a database: the SPEC success-signal journey (generate a 10-question TEST from
 * lesson-circuit on class-pilot-a, see flags, edit one, reject one, materialize, then the existing publish, revise,
 * assign and student submit flow with server scoring) plus the outsider, student, parent and replay negatives.
 *
 * Every step goes through the real controllers, services and the real AuthGuard role check, with the existing
 * deterministic FakeAiProvider (no network). Prisma is replaced by the in-memory store below; it models relation
 * filters, nested selects, unique keys and transaction rollback, but not PostgreSQL itself (advisory locks are
 * modelled by serializing transactions). The real-database run of the same journey is scripts/tai01-integration.mjs.
 */
type Row = Record<string, any>;
let seq = 0;
let tick = 0;
const nextId = (prefix: string) => `${prefix}-${String(++seq).padStart(6, "0")}`;
/** Strictly increasing timestamps, so "newest first" orderings are deterministic. */
const now = () => new Date(Date.now() + ++tick);

const isPlain = (value: unknown): value is Row => !!value && typeof value === "object" && !(value instanceof Date) && !Array.isArray(value);
const time = (value: any) => (value instanceof Date ? value.getTime() : value);
const same = (a: any, b: any) => time(a) === time(b);

type Relation = { table: string; many: boolean; of: (row: Row) => (child: Row) => boolean };
const RELATIONS: Record<string, Record<string, Relation>> = {
  aiJob: { items: { table: "aiJobItem", many: true, of: (r) => (c) => c.jobId === r.id } },
  aiJobItem: { decisions: { table: "aiItemDecision", many: true, of: (r) => (c) => c.itemId === r.id } },
  lesson: { steps: { table: "lessonStep", many: true, of: (r) => (c) => c.lessonId === r.id } },
  classroom: { enrollments: { table: "enrollment", many: true, of: (r) => (c) => c.classId === r.id } },
  assignment: {
    classroom: { table: "classroom", many: false, of: (r) => (c) => c.id === r.classId },
    targets: { table: "assignmentTarget", many: true, of: (r) => (c) => c.assignmentId === r.id },
  },
  assignmentSubmission: {
    deadlineRevision: { table: "assignmentDeadlineRevision", many: false, of: (r) => (c) => c.id === r.deadlineRevisionId },
    decision: { table: "lateDecision", many: false, of: (r) => (c) => c.submissionId === r.id },
    gradeDecisions: { table: "writtenGradeDecision", many: true, of: (r) => (c) => c.submissionId === r.id },
  },
  session: { user: { table: "user", many: false, of: (r) => (c) => c.id === r.userId } },
};

const UNIQUE: Record<string, string[][]> = {
  idempotencyRecord: [["actorId", "key"]],
  notification: [["recipientId", "dedupKey"]],
};

const DEFAULTS: Record<string, () => Row> = {
  aiJob: () => ({ status: "PENDING", attemptCount: 0, failureCode: null, leaseUntil: null, inputTokens: null, outputTokens: null, droppedItems: [], materializedResourceId: null, startedAt: null, completedAt: null, cancelledAt: null }),
  aiJobItem: () => ({ flags: [] }),
  classResource: () => ({ status: "DRAFT", version: 1, publishedAt: null, archivedAt: null }),
  assignment: () => ({ status: "ACTIVE", archivedAt: null, updatedAt: new Date() }),
  assignmentSubmission: () => ({ gradingMode: "AUTO" }),
};

function makeStore() {
  const tables: Record<string, Row[]> = {};
  const rows = (name: string) => (tables[name] ??= []);

  function matches(table: string, row: Row, where: Row = {}): boolean {
    return Object.entries(where).every(([key, cond]) => {
      if (cond === undefined) return true;
      if (key === "AND") return (cond as Row[]).every((c) => matches(table, row, c));
      if (key === "OR") return (cond as Row[]).some((c) => matches(table, row, c));
      if (key === "NOT") return !matches(table, row, cond);
      const relation = RELATIONS[table]?.[key];
      if (relation) {
        const related = rows(relation.table).filter(relation.of(row));
        if (isPlain(cond) && "some" in cond) return related.some((child) => matches(relation.table, child, cond.some));
        return related.length > 0 && matches(relation.table, related[0], cond);
      }
      const value = row[key];
      // Compound unique selectors such as actorId_key or classId_studentId.
      if (value === undefined && key.includes("_") && isPlain(cond)) return matches(table, row, cond);
      if (isPlain(cond)) {
        if ("in" in cond) return cond.in.some((v: any) => same(v, value));
        if ("not" in cond) return isPlain(cond.not) ? !matches(table, { v: value }, { v: cond.not }) : !same(value, cond.not);
        if ("lt" in cond || "lte" in cond || "gt" in cond || "gte" in cond) {
          if (value === null || value === undefined) return false;
          const v = time(value);
          return (!("lt" in cond) || v < time(cond.lt)) && (!("lte" in cond) || v <= time(cond.lte)) && (!("gt" in cond) || v > time(cond.gt)) && (!("gte" in cond) || v >= time(cond.gte));
        }
        return isPlain(value) && matches(table, value, cond);
      }
      return same(value, cond);
    });
  }

  function sortRows(list: Row[], orderBy: any) {
    const keys = (Array.isArray(orderBy) ? orderBy : orderBy ? [orderBy] : []).flatMap((o: Row) => Object.entries(o));
    return [...list].sort((a, b) => {
      for (const [key, dir] of keys) {
        const direction = typeof dir === "string" ? dir : dir.sort;
        const x = time(a[key]), y = time(b[key]);
        if (x === y) continue;
        if (x === null || x === undefined) return 1;
        if (y === null || y === undefined) return -1;
        return (x > y ? 1 : -1) * (direction === "desc" ? -1 : 1);
      }
      return 0;
    });
  }

  /** Applies select/include (with nested relation where/orderBy/take/select and _count) to one row. */
  function shape(table: string, row: Row, args: Row = {}): Row {
    const spec = args.select ?? args.include;
    const out: Row = args.select ? {} : { ...row };
    if (!spec) return out;
    for (const [key, value] of Object.entries(spec)) {
      if (!value) continue;
      if (key === "_count") {
        out._count = Object.fromEntries(Object.keys((value as Row).select ?? {}).map((name) => {
          const relation = RELATIONS[table][name];
          return [name, rows(relation.table).filter(relation.of(row)).length];
        }));
        continue;
      }
      const relation = RELATIONS[table]?.[key];
      if (!relation) {
        out[key] = row[key];
        continue;
      }
      const nested: Row = value === true ? {} : (value as Row);
      let related = rows(relation.table).filter(relation.of(row)).filter((child) => matches(relation.table, child, nested.where));
      related = sortRows(related, nested.orderBy);
      if (nested.take) related = related.slice(0, nested.take);
      const shaped = related.map((child) => shape(relation.table, child, nested));
      out[key] = relation.many ? shaped : (shaped[0] ?? null);
    }
    return out;
  }

  function assertUnique(table: string, candidate: Row) {
    for (const fields of UNIQUE[table] ?? [])
      if (fields.every((f) => candidate[f] !== null && candidate[f] !== undefined) && rows(table).some((r) => fields.every((f) => same(r[f], candidate[f]))))
        throw Object.assign(new Error(`unique ${table}(${fields})`), { code: "P2002" });
  }

  function insert(table: string, data: Row): Row {
    const row: Row = { id: nextId(table), createdAt: now(), ...(DEFAULTS[table]?.() ?? {}) };
    const children: Array<[Relation, Row[]]> = [];
    for (const [key, value] of Object.entries(data)) {
      const relation = RELATIONS[table]?.[key];
      if (relation && isPlain(value) && "create" in value) children.push([relation, value.create as Row[]]);
      else row[key] = value;
    }
    assertUnique(table, row);
    rows(table).push(row);
    for (const [relation, list] of children)
      for (const child of list) insert(relation.table, { ...child, ...(table === "assignment" ? { assignmentId: row.id } : {}) });
    return row;
  }

  const apply = (row: Row, data: Row) => {
    for (const [key, value] of Object.entries(data)) row[key] = isPlain(value) && "increment" in value ? (row[key] ?? 0) + value.increment : value;
    if ("updatedAt" in row) row.updatedAt = now();
  };

  const delegate = (table: string) => ({
    async findFirst(args: Row = {}) {
      const row = sortRows(rows(table).filter((r) => matches(table, r, args.where)), args.orderBy)[0];
      return row ? shape(table, row, args) : null;
    },
    async findUnique(args: Row) {
      const row = rows(table).find((r) => matches(table, r, args.where));
      return row ? shape(table, row, args) : null;
    },
    async findUniqueOrThrow(args: Row) {
      const row = rows(table).find((r) => matches(table, r, args.where));
      if (!row) throw new Error(`${table} not found`);
      return shape(table, row, args);
    },
    async findMany(args: Row = {}) {
      let list = sortRows(rows(table).filter((r) => matches(table, r, args.where)), args.orderBy);
      if (args.cursor) list = list.slice(list.findIndex((r) => r.id === args.cursor.id) + (args.skip ?? 0));
      if (args.take) list = list.slice(0, args.take);
      return list.map((r) => shape(table, r, args));
    },
    async count(args: Row = {}) {
      return rows(table).filter((r) => matches(table, r, args.where)).length;
    },
    async aggregate(args: Row) {
      const hit = rows(table).filter((r) => matches(table, r, args.where));
      return { _max: Object.fromEntries(Object.keys(args._max ?? {}).map((k) => [k, hit.length ? Math.max(...hit.map((r) => r[k])) : null])) };
    },
    async create(args: Row) {
      return shape(table, insert(table, args.data), args);
    },
    async createMany(args: Row) {
      let count = 0;
      for (const data of args.data) {
        try {
          insert(table, data);
          count++;
        } catch (error) {
          if (!args.skipDuplicates || (error as any).code !== "P2002") throw error;
        }
      }
      return { count };
    },
    async update(args: Row) {
      const row = rows(table).find((r) => matches(table, r, args.where));
      if (!row) throw Object.assign(new Error(`${table} not found`), { code: "P2025" });
      apply(row, args.data);
      return shape(table, row, args);
    },
    async updateMany(args: Row) {
      const hit = rows(table).filter((r) => matches(table, r, args.where));
      for (const row of hit) apply(row, args.data);
      return { count: hit.length };
    },
    async upsert(args: Row) {
      const row = rows(table).find((r) => matches(table, r, args.where));
      if (row) {
        apply(row, args.update);
        return { ...row };
      }
      return { ...insert(table, args.create) };
    },
    async deleteMany(args: Row = {}) {
      const keep = rows(table).filter((r) => !matches(table, r, args.where));
      const count = rows(table).length - keep.length;
      tables[table] = keep;
      return { count };
    },
  });

  let chain: Promise<unknown> = Promise.resolve();
  const db: Row = new Proxy({} as Row, {
    get(target, prop: string) {
      if (prop in target) return target[prop];
      if (prop === "then") return undefined;
      return (target[prop] = delegate(prop));
    },
  });
  db.$executeRaw = async () => 0;
  /** Serialized like the advisory locks; a throwing transaction rolls every table back to its state before it ran. */
  db.$transaction = (fn: (tx: any) => Promise<any>) => {
    const run = chain.then(async () => {
      const before = structuredClone(tables);
      try {
        return await fn(db);
      } catch (error) {
        for (const key of Object.keys(tables)) delete tables[key];
        Object.assign(tables, before);
        throw error;
      }
    });
    chain = run.then(() => undefined, () => undefined);
    return run;
  };
  return { db: db as any, rows };
}

// ---------- Seeded fixtures (names follow AGENTS.md: class-pilot-a, lesson-circuit, teacher.outsider, student.active) ----------
const OWNER = { sub: "teacher-owner", role: "TEACHER" };
const OUTSIDER = { sub: "teacher-outsider", role: "TEACHER" };
const STUDENT = { sub: "student-active", role: "STUDENT" };
const STUDENT_OUT = { sub: "student-outsider", role: "STUDENT" };
const PARENT = { sub: "parent-1", role: "PARENT" };
const CLASS = "class-pilot-a";

let store: ReturnType<typeof makeStore>;
let provider: FakeAiProvider;
let ai: AiJobsController;
let runner: AiJobRunner;
let resources: ClassResourcesController;
let assignments: AssignmentsController;
let learning: LearningController;

const key = () => `journey-${++seq}-key`;
const req = (user: Row, idempotencyKey: string | null = null) => ({ user, headers: idempotencyKey ? { "idempotency-key": idempotencyKey } : {}, path: "/api" });
const createBody = { purpose: "GENERATE_RESOURCE", targetKind: "TEST", lessonId: "lesson-circuit", itemCount: 10 };
const tableRows = (name: string) => store.rows(name);

beforeEach(() => {
  process.env.JWT_SECRET ??= "tai-t6-journey-only";
  store = makeStore();
  const t = store.rows;
  t("user").push(
    { id: OWNER.sub, role: "TEACHER", status: "active", fullName: "Teacher Owner", mustChangePassword: false, grade: null },
    { id: OUTSIDER.sub, role: "TEACHER", status: "active", fullName: "Teacher Outsider", mustChangePassword: false, grade: null },
    { id: STUDENT.sub, role: "STUDENT", status: "active", fullName: "Student Active", mustChangePassword: false, grade: 8 },
    { id: STUDENT_OUT.sub, role: "STUDENT", status: "active", fullName: "Student Outsider", mustChangePassword: false, grade: 8 },
    { id: PARENT.sub, role: "PARENT", status: "active", fullName: "Parent", mustChangePassword: false, grade: null },
  );
  t("classroom").push(
    { id: CLASS, teacherId: OWNER.sub, status: "ACTIVE", name: "Pilot A", grade: 8 },
    { id: "class-pilot-b", teacherId: OUTSIDER.sub, status: "ACTIVE", name: "Pilot B", grade: 8 },
  );
  t("enrollment").push(
    { id: "enr-a", classId: CLASS, studentId: STUDENT.sub, status: "approved" },
    { id: "enr-b", classId: "class-pilot-b", studentId: STUDENT_OUT.sub, status: "approved" },
  );
  t("lesson").push({
    id: "lesson-circuit", title: "Mạch điện đơn giản", grade: 8, domain: "ENERGY", topic: "Dòng điện", scope: "SHARED_LIBRARY", status: "published", authorId: "admin", synthetic: false,
    learningObjective: "Mô tả mạch điện đơn giản và cách đo cường độ dòng điện",
    content: "<p>Dòng điện là dòng các hạt mang điện dịch chuyển có hướng.</p><p>Ampe kế được mắc nối tiếp với dụng cụ cần đo.</p>",
    outcomeCodes: ["KHTN8.E1"],
  });
  t("lessonStep").push(
    { id: "step-read", lessonId: "lesson-circuit", type: "READING", position: 1, config: { html: "<p>Vôn kế được mắc song song với dụng cụ cần đo hiệu điện thế.</p>" } },
    { id: "step-quiz", lessonId: "lesson-circuit", type: "QUIZ", position: 2, config: { questions: [{ prompt: "Câu hỏi có sẵn", correctOption: 1 }] } },
  );
  t("curriculumOutcome").push({ id: "KHTN8.E1", code: "KHTN8.E1", statement: "Mô tả được mạch điện đơn giản" });
  for (const user of [OWNER, OUTSIDER, STUDENT, STUDENT_OUT, PARENT])
    t("session").push({ id: `sid-${user.sub}`, userId: user.sub, kind: "refresh", expiresAt: new Date(Date.now() + 3600_000) });

  const config = parseAiConfig({ AI_PROVIDER: "fake", AI_PROVIDER_MIN_INTERVAL_MS: "0" } as any);
  provider = new FakeAiProvider();
  ai = new AiJobsController(new AiJobsService(store.db, config, provider));
  runner = new AiJobRunner(store.db, config, provider);
  resources = new ClassResourcesController(new ClassResourcesService(store.db));
  assignments = new AssignmentsController(new AssignmentsService(store.db));
  learning = new LearningController(store.db, null as any);
});

/** Runs the real AuthGuard (JWT, session lookup, @Roles) for one controller handler. */
async function guard(user: Row, controller: any, handler: string) {
  const token = access({ id: user.sub, role: user.role }, `sid-${user.sub}`);
  const request: Row = { headers: { authorization: `Bearer ${token}` }, path: "/api/classes" };
  const ctx: any = { getHandler: () => controller.prototype[handler], getClass: () => controller, switchToHttp: () => ({ getRequest: () => request }) };
  return new AuthGuard(new Reflector(), store.db).canActivate(ctx).then(() => "allowed", (error) => error.status);
}

const AI_HANDLERS = ["create", "list", "get", "cancel", "decide", "materialize", "quota"] as const;

describe("TAI-T6 success-signal journey (in-memory, fake provider)", () => {
  it("generate, flag, edit, reject, materialize, publish, revise, assign and a server-scored student submission", async () => {
    // 1. The owner requests a 10-question TEST from lesson-circuit; the same key replays the same job.
    const createKey = key();
    const created = await ai.create(CLASS, req(OWNER, createKey), createBody);
    expect(created).toMatchObject({ status: "PENDING", requestedCount: 10, promptVersion: "generate-resource@1", outputSchemaVersion: "resource-items@1" });
    expect((await ai.create(CLASS, req(OWNER, createKey), createBody)).id).toBe(created.id);
    await expect(ai.create(CLASS, req(OWNER, createKey), { ...createBody, itemCount: 9 })).rejects.toMatchObject({ status: 409, response: { code: "IDEMPOTENCY_KEY_REUSED" } });
    expect(tableRows("aiJob")).toHaveLength(1);

    // 2. The runner calls the provider once with the stored snapshot (existing quiz answer keys are never sent).
    expect(await runner.runOnce()).toBe(created.id);
    expect(provider.calls).toHaveLength(1);
    expect(provider.calls[0].user).not.toContain("correctOption");
    expect(provider.calls[0].user).toContain("Vôn kế được mắc song song");
    const view = await ai.get(CLASS, created.id, req(OWNER));
    expect(view).toMatchObject({ status: "SUCCEEDED", validCount: 10, droppedCount: 0, lessonChangedSinceGeneration: false });
    expect(view.items).toHaveLength(10);
    // Validation flags are visible to the teacher (the fake's "Phương án A 1" options trip VW-03, see .memlog 2026-11-06).
    expect(view.items!.every((item: Row) => item.flags.includes("NUMERIC_REVIEW"))).toBe(true);
    const job = tableRows("aiJob")[0];
    expect(job.inputTokens).toBeGreaterThan(0);
    expect(job.outputTokens).toBeGreaterThan(0);

    // 3. Accept eight, edit one (new prompt and key), reject one.
    const items = view.items!;
    for (const item of items.slice(0, 8)) await ai.decide(CLASS, created.id, item.id, req(OWNER), { decision: "ACCEPTED" });
    const editedPayload = { ...(items[8].payload as Row), prompt: "Dụng cụ nào dùng để đo cường độ dòng điện trong mạch?", options: ["Vôn kế", "Nhiệt kế", "Ampe kế", "Lực kế"], correctOption: 2 };
    const afterEdit = await ai.decide(CLASS, created.id, items[8].id, req(OWNER), { decision: "EDITED", editedPayload });
    expect(afterEdit.items![8].decision).toMatchObject({ decision: "EDITED" });
    await ai.decide(CLASS, created.id, items[9].id, req(OWNER), { decision: "REJECTED", reasonCode: "OFF_TOPIC" });

    // 4. Materialize once; the same key replays, a new key is 409, the DRAFT stays invisible to students.
    const materializeKey = key();
    const draft = await ai.materialize(CLASS, created.id, req(OWNER, materializeKey), { title: "Kiểm tra mạch điện (AI)" });
    expect(draft).toMatchObject({ kind: "TEST", status: "DRAFT", version: 1, lessonId: "lesson-circuit", classId: CLASS });
    expect(draft.content.questions).toHaveLength(9);
    const expectedKeys = [...items.slice(0, 8).map((item: Row) => item.payload.correctOption), 2];
    expect(draft.content.questions.map((q: Row) => q.correctOption)).toEqual(expectedKeys);
    expect(draft.content.questions[8].prompt).toBe(editedPayload.prompt);
    expect((await ai.materialize(CLASS, created.id, req(OWNER, materializeKey), { title: "Kiểm tra mạch điện (AI)" })).id).toBe(draft.id);
    await expect(ai.materialize(CLASS, created.id, req(OWNER, key()), { title: "Lần hai" })).rejects.toMatchObject({ status: 409, response: { code: "AI_JOB_ALREADY_MATERIALIZED" } });
    expect(tableRows("classResource")).toHaveLength(1);
    expect(await resources.list(CLASS, req(STUDENT))).toEqual([]);
    await expect(resources.detail(CLASS, draft.id, req(STUDENT))).rejects.toMatchObject({ status: 403 });

    // 5. A draft cannot be assigned; publishing goes through the existing route and notifies the member.
    const due = new Date(Date.now() + 2 * 24 * 3600_000).toISOString();
    await expect(assignments.assign(CLASS, req(OWNER, key()), { contentType: "test", contentId: draft.id, dueDate: due })).rejects.toMatchObject({ status: 400, response: { code: "CONTENT_NOT_PUBLISHED" } });
    const published = (await resources.publish(CLASS, draft.id, req(OWNER))) as Row;
    expect(published).toMatchObject({ id: draft.id, status: "PUBLISHED" });
    expect(tableRows("notification").map((n) => [n.recipientId, n.type])).toEqual([[STUDENT.sub, "RESOURCE_PUBLISHED"]]);
    const studentList = await resources.list(CLASS, req(STUDENT));
    expect(studentList).toHaveLength(1);
    expect(studentList[0]).toMatchObject({ id: draft.id, kind: "TEST", content: null });

    // 6. Revise creates version 2 as a new DRAFT with the same content; students still see only version 1.
    const revised = await resources.revise(CLASS, draft.id, req(OWNER));
    expect(revised).toMatchObject({ status: "DRAFT", version: 2, title: draft.title, kind: "TEST" });
    expect(revised.content).toEqual(published.content);
    expect((await resources.list(CLASS, req(STUDENT))).map((r: Row) => r.id)).toEqual([draft.id]);

    // 7. Assign the published version through the existing route.
    const assigned = await assignments.assign(CLASS, req(OWNER, key()), { contentType: "test", contentId: draft.id, dueDate: due });
    expect(assigned).toMatchObject({ recipientCount: 1, assignment: { contentType: "test", contentId: draft.id, status: "ACTIVE" } });
    const assignmentId = assigned.assignment.id;

    // 8. The student sees questions without answer keys or AI data, then submits; the server scores it.
    const studentView = (await learning.assignment(assignmentId, req(STUDENT))) as Row;
    expect(studentView.content.questionCount).toBe(9);
    const studentJson = JSON.stringify(studentView);
    for (const hidden of ["correctOption", "explanation", "sourceRefs", "flags", "aiJob", "NUMERIC_REVIEW"]) expect(studentJson).not.toContain(hidden);
    const questions = published.content.questions as Row[];
    const answers = questions.map((q, i) => ({ questionId: q.id, optionId: q.options[i === 0 ? (q.correctOption + 1) % q.options.length : q.correctOption].id }));
    const submitKey = key();
    const submitted = (await learning.submitTest(assignmentId, req(STUDENT, submitKey), { answers })) as Row;
    expect(submitted.submission).toMatchObject({ status: "SCORED", score: Math.round((8 / 9) * 100), correctCount: 8, questionCount: 9 });
    expect(((await learning.submitTest(assignmentId, req(STUDENT, submitKey), { answers })) as Row).submission.id).toBe(submitted.submission.id);
    expect(tableRows("assignmentSubmission")).toHaveLength(1);

    // 9. The audit trail covers every human step; AI rows never touched scores or progress.
    expect(tableRows("auditLog").filter((a) => a.outcome === "success").map((a) => a.action)).toEqual([
      "ai_job.create", "ai_job.complete", ...Array(10).fill("ai_item.decide"), "ai_job.materialize",
      "class_resource.publish", "class_resource.revise", "assignment.create", "assignment.submit",
    ]);
    expect(tableRows("aiJob")[0].materializedResourceId).toBe(draft.id);
  });
});

describe("TAI-T6 negatives (outsider, student, parent, replay)", () => {
  async function succeededJob() {
    const created = await ai.create(CLASS, req(OWNER, key()), { ...createBody, itemCount: 2 });
    await runner.runOnce();
    return ai.get(CLASS, created.id, req(OWNER));
  }

  it("the AuthGuard lets only teachers reach every AI route; students and parents get 403", async () => {
    for (const handler of AI_HANDLERS) {
      expect(await guard(OWNER, AiJobsController, handler)).toBe("allowed");
      expect(await guard(STUDENT, AiJobsController, handler)).toBe(403);
      expect(await guard(PARENT, AiJobsController, handler)).toBe(403);
    }
  });

  it("the outsider teacher and an unknown class get the same 403 CLASS_ACCESS_DENIED and create nothing", async () => {
    const view = await succeededJob();
    const denied = { status: 403, response: { code: "CLASS_ACCESS_DENIED" } };
    await expect(ai.create(CLASS, req(OUTSIDER, key()), createBody)).rejects.toMatchObject(denied);
    await expect(ai.create("class-unknown", req(OUTSIDER, key()), createBody)).rejects.toMatchObject(denied);
    await expect(ai.list(CLASS, req(OUTSIDER), {})).rejects.toMatchObject(denied);
    await expect(ai.get(CLASS, view.id, req(OUTSIDER))).rejects.toMatchObject(denied);
    await expect(ai.decide(CLASS, view.id, view.items![0].id, req(OUTSIDER), { decision: "ACCEPTED" })).rejects.toMatchObject(denied);
    await expect(ai.materialize(CLASS, view.id, req(OUTSIDER, key()), { title: "x" })).rejects.toMatchObject(denied);
    await expect(ai.cancel(CLASS, view.id, req(OUTSIDER))).rejects.toMatchObject(denied);
    // The outsider's own class cannot read the owner's job either (404 inside an owned class).
    await expect(ai.get("class-pilot-b", view.id, req(OUTSIDER))).rejects.toMatchObject({ status: 404 });
    expect(tableRows("aiJob")).toHaveLength(1);
    expect(tableRows("aiItemDecision")).toHaveLength(0);
    expect(tableRows("classResource")).toHaveLength(0);
  });

  it("a student calling the service directly is still denied by ownership and changes nothing", async () => {
    const view = await succeededJob();
    await expect(ai.create(CLASS, req(STUDENT, key()), createBody)).rejects.toMatchObject({ status: 403, response: { code: "CLASS_ACCESS_DENIED" } });
    await expect(ai.decide(CLASS, view.id, view.items![0].id, req(STUDENT), { decision: "ACCEPTED" })).rejects.toMatchObject({ status: 403 });
    expect(tableRows("aiJob")).toHaveLength(1);
    expect(tableRows("aiItemDecision")).toHaveLength(0);
  });

  it("replays create and materialize by key, refuses a reused key with another body, and never charges the provider twice", async () => {
    const k = key();
    const first = await ai.create(CLASS, req(OWNER, k), { ...createBody, itemCount: 2 });
    const second = await ai.create(CLASS, req(OWNER, k), { ...createBody, itemCount: 2 });
    expect(second.id).toBe(first.id);
    await runner.runOnce();
    expect(await runner.runOnce()).toBeNull();
    expect(provider.calls).toHaveLength(1);
    const view = await ai.get(CLASS, first.id, req(OWNER));
    for (const item of view.items!) await ai.decide(CLASS, first.id, item.id, req(OWNER), { decision: "ACCEPTED" });
    const mk = key();
    const draft = await ai.materialize(CLASS, first.id, req(OWNER, mk), { title: "Đề AI" });
    await expect(ai.materialize(CLASS, first.id, req(OWNER, mk), { title: "Đề khác" })).rejects.toMatchObject({ status: 409, response: { code: "IDEMPOTENCY_KEY_REUSED" } });
    expect((await ai.materialize(CLASS, first.id, req(OWNER, mk), { title: "Đề AI" })).id).toBe(draft.id);
    expect(tableRows("classResource")).toHaveLength(1);
  });

  it("an outside student cannot open or submit the assigned AI test", async () => {
    const view = await succeededJob();
    for (const item of view.items!) await ai.decide(CLASS, view.id, item.id, req(OWNER), { decision: "ACCEPTED" });
    const draft = await ai.materialize(CLASS, view.id, req(OWNER, key()), { title: "Đề AI" });
    await resources.publish(CLASS, draft.id, req(OWNER));
    const due = new Date(Date.now() + 24 * 3600_000 * 2).toISOString();
    const { assignment } = await assignments.assign(CLASS, req(OWNER, key()), { contentType: "test", contentId: draft.id, dueDate: due });
    await expect(learning.assignment(assignment.id, req(STUDENT_OUT))).rejects.toMatchObject({ status: 404, response: { code: "ASSIGNMENT_NOT_FOUND" } });
    const questions = (tableRows("classResource")[0].content as Row).questions as Row[];
    const answers = questions.map((q) => ({ questionId: q.id, optionId: q.options[0].id }));
    await expect(learning.submitTest(assignment.id, req(STUDENT_OUT, key()), { answers })).rejects.toMatchObject({ status: 404 });
    await expect(resources.list(CLASS, req(STUDENT_OUT))).rejects.toMatchObject({ status: 403 });
    expect(tableRows("assignmentSubmission")).toHaveLength(0);
  });
});
