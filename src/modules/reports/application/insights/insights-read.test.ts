import "reflect-metadata";
import { beforeEach, describe, expect, it } from "vitest";
import { InsightsController } from "../../interface/insights.controller";
import { loadClassEvidence } from "./insights-loader";
import { parseInsightsConfig } from "./insights-config";
import { InsightsService } from "./insights.service";

/**
 * TAI4-T2 on an in-memory stand-in for Prisma (no database, no shared Supabase): evidence scope and filters, outcome
 * mapping, query count independent of the number of students, denial contract, archived class, the pilot visibility
 * flag, configuration parsing and an in-memory benchmark for 40 students x 6 steps.
 */
type Row = Record<string, any>;
type Tables = Record<string, Row[]>;

const same = (a: any, b: any) => (a instanceof Date && b instanceof Date ? a.getTime() === b.getTime() : a === b);

let clockNow = new Date("2026-11-07T00:00:00.000Z");
const setClock = (d: Date) => { clockNow = d; };
const time = (v: any) => (v instanceof Date ? v.getTime() : v);

function makeDb(t: Tables) {
  const calls: string[] = [];
  const matches = (row: Row, where: Row = {}): boolean =>
    Object.entries(where).every(([key, cond]) => {
      if (cond === undefined) return true;
      if (key === "attempt") return matches(t.attempt!.find((a) => a.id === row.attemptId) ?? {}, cond);
      if (key === "actorId_key") return matches(row, cond);
      const value = row[key];
      if (cond && typeof cond === "object" && !(cond instanceof Date)) {
        if ("in" in cond) return cond.in.includes(value);
        if ("not" in cond) return !same(value, cond.not);
        if ("lte" in cond) return value !== undefined && time(value) <= time(cond.lte);
        return false;
      }
      return same(value, cond);
    });
  const sortRows = (rows: Row[], orderBy: any) => {
    const keys = (Array.isArray(orderBy) ? orderBy : orderBy ? [orderBy] : []).flatMap((o: Row) => Object.entries(o));
    return [...rows].sort((a, b) => {
      for (const [key, dir] of keys) {
        const x = time(a[key]), y = time(b[key]);
        if (x === y) continue;
        return (x > y ? 1 : -1) * (dir === "desc" ? -1 : 1);
      }
      return 0;
    });
  };
  const table = (name: string) => ({
    findMany: async ({ where, orderBy }: Row = {}) => { calls.push(`${name}.findMany`); return sortRows(t[name]!.filter((r) => matches(r, where)), orderBy).map((r) => ({ ...r })); },
    findFirst: async ({ where, orderBy }: Row = {}) => { calls.push(`${name}.findFirst`); const r = sortRows(t[name]!.filter((x) => matches(x, where)), orderBy)[0]; return r ? { ...r } : null; },
    findUnique: async ({ where }: Row) => { calls.push(`${name}.findUnique`); const r = t[name]!.find((x) => matches(x, where)); return r ? { ...r } : null; },
    update: async ({ where, data }: Row) => { const r = t[name]!.find((x) => matches(x, where))!; Object.assign(r, data); return { ...r }; },
    create: async ({ data }: Row) => { const row = { id: `${name}-${t[name]!.length + 1}`, createdAt: clockNow, ...data }; t[name]!.push(row); return { ...row }; },
    groupBy: async ({ where }: Row) => {
      calls.push(`${name}.groupBy`);
      const max = new Map<string, number>();
      for (const h of t[name]!.filter((r) => matches(r, where))) max.set(h.attemptId, Math.max(max.get(h.attemptId) ?? 0, h.level));
      return [...max].map(([attemptId, level]) => ({ attemptId, _max: { level } }));
    },
  });
  const db: any = { calls };
  for (const name of Object.keys(t)) db[name] = table(name);
  // Interactive transaction with rollback on error, like Postgres.
  db.$transaction = async (work: (tx: any) => Promise<any>) => {
    const snapshot = Object.fromEntries(Object.keys(t).map((k) => [k, t[k]!.map((r) => ({ ...r }))]));
    try { return await work(db); } catch (error) { for (const k of Object.keys(t)) t[k]!.splice(0, t[k]!.length, ...snapshot[k]!); throw error; }
  };
  return db;
}

const day = 24 * 3600_000;
const at = (n: number) => new Date(Date.UTC(2026, 9, 1) + n * day);
const teacher = { sub: "t1", role: "TEACHER" };
let seq = 0;
const id = (p: string) => `${p}${++seq}`;

function emptyTables(): Tables {
  return { classroom: [], enrollment: [], assignment: [], quizAttempt: [], attempt: [], assignmentSubmission: [], hintLog: [], lessonStep: [], classResource: [], lesson: [], auditLog: [], insightAcknowledgement: [], idempotencyRecord: [] };
}
function baseTables(students: Array<[string, string, string?]> = [["s1", "Anh"]]): Tables {
  const t = emptyTables();
  t.classroom!.push({ id: "c1", teacherId: "t1", status: "ACTIVE" }, { id: "c2", teacherId: "t1", status: "ACTIVE" });
  for (const [sid, name, status] of students) t.enrollment!.push({ classId: "c1", studentId: sid, status: status ?? "approved", student: { id: sid, fullName: name } });
  t.lesson!.push({ id: "L1", outcomeCodes: ["OUT-1"] }, { id: "L2", outcomeCodes: ["OUT-2"] });
  t.lessonStep!.push({ id: "step1", lessonId: "L1" });
  t.classResource!.push({ id: "res1", lessonId: "L2" }, { id: "res0", lessonId: null });
  t.assignment!.push(
    { id: "a-lesson", classId: "c1", contentType: "lesson", contentId: "L1", status: "ACTIVE" },
    { id: "a-test", classId: "c1", contentType: "test", contentId: "res1", status: "ARCHIVED" },
    { id: "a-other", classId: "c2", contentType: "lesson", contentId: "L1", status: "ACTIVE" },
  );
  return t;
}
const quiz = (t: Tables, studentId: string, n: number, score: number, assignmentId: string | null = "a-lesson") =>
  t.quizAttempt!.push({ id: id("q"), studentId, assignmentId, lessonId: "L1", score, passed: score >= 50, createdAt: at(n) });
const practical = (t: Tables, studentId: string, n: number, verdict: string, hint: number, assignmentId: string | null = "a-lesson") => {
  const attemptId = id("p");
  t.attempt!.push({ id: attemptId, studentId, assignmentId, lessonStepId: "step1", verdict, createdAt: at(n) });
  if (hint > 0) for (let level = 1; level <= hint; level++) t.hintLog!.push({ attemptId, level, createdAt: at(n) });
  return attemptId;
};
const submission = (t: Tables, studentId: string, n: number, extra: Row = {}) => {
  const sid = id("sub");
  t.assignmentSubmission!.push({ id: sid, assignmentId: "a-test", studentId, score: 80, gradingMode: "AUTO", timing: "ON_TIME", submittedAt: at(n), decision: null, ...extra });
  return sid;
};
const service = (t: Tables, show = false) => new InsightsService(makeDb(t), { showSuddenUnaidedPass: show });

describe("parseInsightsConfig", () => {
  it("defaults to hidden and accepts only true or false", () => {
    expect(parseInsightsConfig({})).toEqual({ showSuddenUnaidedPass: false });
    expect(parseInsightsConfig({ INSIGHTS_SHOW_SUDDEN_UNAIDED_PASS: "  " })).toEqual({ showSuddenUnaidedPass: false });
    expect(parseInsightsConfig({ INSIGHTS_SHOW_SUDDEN_UNAIDED_PASS: "TRUE" })).toEqual({ showSuddenUnaidedPass: true });
    expect(parseInsightsConfig({ INSIGHTS_SHOW_SUDDEN_UNAIDED_PASS: "false" })).toEqual({ showSuddenUnaidedPass: false });
  });
  it("stops boot on any other value without echoing it", () => {
    expect(() => parseInsightsConfig({ INSIGHTS_SHOW_SUDDEN_UNAIDED_PASS: "yes-secret" })).toThrow("INSIGHTS_SHOW_SUDDEN_UNAIDED_PASS must be true or false");
    try { parseInsightsConfig({ INSIGHTS_SHOW_SUDDEN_UNAIDED_PASS: "yes-secret" }); } catch (e: any) { expect(e.message).not.toContain("yes-secret"); }
  });
});

describe("insights evidence loader scope and mapping", () => {
  let t: Tables;
  beforeEach(() => { t = baseTables([["s1", "Anh"], ["s2", "Bình", "pending"], ["s3", "Chi", "removed"]]); });
  const load = (options = {}) => loadClassEvidence(makeDb(t), "c1", options);

  it("lists approved members only", async () => {
    const { members } = await load();
    expect(members.map((m) => m.id)).toEqual(["s1"]);
  });
  it("excludes free practice, other classes and members who are not approved, but keeps archived assignments", async () => {
    quiz(t, "s1", 1, 70);
    quiz(t, "s1", 2, 70, null);
    t.quizAttempt!.push({ id: "q-other", studentId: "s1", assignmentId: "a-other", lessonId: "L1", score: 70, passed: true, createdAt: at(3) });
    quiz(t, "s2", 4, 70);
    practical(t, "s1", 5, "passed", 0, null);
    submission(t, "s1", 6);
    const { evidenceByStudent } = await load();
    expect(evidenceByStudent.get("s1")!.map((e) => e.kind).sort()).toEqual(["QUIZ", "TEST"]);
    expect(evidenceByStudent.has("s2")).toBe(false);
  });
  it("keeps only auto-scored TEST rows that are on time or extended", async () => {
    const kept = [submission(t, "s1", 1), submission(t, "s1", 2, { timing: "LATE", decision: { decision: "REVISE_DEADLINE_FOR_CLASS" } })];
    submission(t, "s1", 3, { timing: "LATE", decision: null });
    submission(t, "s1", 4, { timing: "LATE", decision: { decision: "REJECT_ZERO" } });
    submission(t, "s1", 5, { gradingMode: "TEACHER", score: null });
    submission(t, "s1", 6, { score: null });
    const { evidenceByStudent } = await load();
    expect(evidenceByStudent.get("s1")!.map((e) => e.id)).toEqual(kept);
  });
  it("counts every resubmission as its own evidence item", async () => {
    submission(t, "s1", 1, { score: 40 });
    submission(t, "s1", 2, { score: 90 });
    const items = (await load()).evidenceByStudent.get("s1")!;
    expect(items.map((e) => e.score)).toEqual([40, 90]);
  });
  it("maps outcome codes: quiz by lesson, practical by step, test by resource lesson", async () => {
    quiz(t, "s1", 1, 70);
    practical(t, "s1", 2, "passed", 0);
    submission(t, "s1", 3);
    const byKind = Object.fromEntries((await load()).evidenceByStudent.get("s1")!.map((e) => [e.kind, e.outcomeCodes]));
    expect(byKind).toEqual({ QUIZ: ["OUT-1"], PRACTICAL: ["OUT-1"], TEST: ["OUT-2"] });
  });
  it("gives no outcome codes when the resource has no lesson or the step is unknown", async () => {
    t.assignment!.push({ id: "a-test0", classId: "c1", contentType: "test", contentId: "res0", status: "ACTIVE" });
    t.assignmentSubmission!.push({ id: "sub-x", assignmentId: "a-test0", studentId: "s1", score: 80, gradingMode: "AUTO", timing: "ON_TIME", submittedAt: at(1), decision: null });
    t.attempt!.push({ id: "p-x", studentId: "s1", assignmentId: "a-lesson", lessonStepId: null, verdict: "passed", createdAt: at(2) });
    const items = (await load()).evidenceByStudent.get("s1")!;
    expect(items.every((e) => e.outcomeCodes.length === 0)).toBe(true);
  });
  it("reads the highest hint level per attempt and 0 when none was used", async () => {
    const a = practical(t, "s1", 1, "passed", 0);
    const b = practical(t, "s1", 2, "needs_practice", 3);
    const items = (await load()).evidenceByStudent.get("s1")!;
    expect(items.find((e) => e.id === a)!.maxHintLevel).toBe(0);
    expect(items.find((e) => e.id === b)!.maxHintLevel).toBe(3);
  });
  it("narrows to one student when asked", async () => {
    t.enrollment!.push({ classId: "c1", studentId: "s4", status: "approved", student: { id: "s4", fullName: "Dũng" } });
    quiz(t, "s4", 1, 60);
    quiz(t, "s1", 1, 60);
    const { members, evidenceByStudent } = await load({ studentId: "s4" });
    expect(members.map((m) => m.id)).toEqual(["s4"]);
    expect([...evidenceByStudent.keys()]).toEqual(["s4"]);
  });
});

describe("insights loader cost", () => {
  const fill = (n: number) => {
    const t = baseTables(Array.from({ length: n }, (_, i) => [`s${i}`, `Học sinh ${String(i).padStart(2, "0")}`] as [string, string]));
    for (let i = 0; i < n; i++) { quiz(t, `s${i}`, 1, 60); practical(t, `s${i}`, 2, "passed", 2); submission(t, `s${i}`, 3); }
    return t;
  };
  it("runs the same bounded set of queries whether the class has 3 or 40 students", async () => {
    const small = makeDb(fill(3));
    const large = makeDb(fill(40));
    await loadClassEvidence(small, "c1");
    await loadClassEvidence(large, "c1");
    expect(large.calls).toEqual(small.calls);
    expect(large.calls.length).toBeLessThanOrEqual(11);
    expect(large.calls.filter((c: string) => c === "insightAcknowledgement.findMany")).toHaveLength(1);
    expect(large.calls.filter((c: string) => c.startsWith("lesson.")).length).toBe(1);
  });
  it("skips evidence queries when only the members are needed", async () => {
    const db = makeDb(fill(5));
    await loadClassEvidence(db, "c1", { withEvidence: false });
    expect(db.calls.sort()).toEqual(["assignment.findMany", "enrollment.findMany"]);
  });
});

describe("InsightsService and controller", () => {
  it("lists approved students ordered by display name, then id, with insights ordered by rule code", async () => {
    const t = baseTables([["s9", "Đào"], ["s1", "Bình"], ["s3", "Anh"]]);
    for (const s of ["s9", "s1", "s3"]) { quiz(t, s, 1, 60); quiz(t, s, 2, 60); quiz(t, s, 3, 60); quiz(t, s, 4, 95); }
    const result = await service(t).classInsights("c1", {}, teacher);
    expect(result.students.map((s) => s.displayName)).toEqual(["Anh", "Bình", "Đào"]);
    expect(result.classArchived).toBe(false);
    expect(result.students[0]!.insights.map((i) => i.ruleCode)).toEqual(["SCORE_CHANGE_UNUSUAL"]);
    expect((result as any).students.every((s: any) => !("count" in s || "total" in s))).toBe(true);
  });
  it("returns INSUFFICIENT_EVIDENCE for a student with fewer than 3 scored items and for one with none", async () => {
    const t = baseTables([["s1", "Anh"], ["s2", "Bình"]]);
    quiz(t, "s1", 1, 60);
    const result = await service(t).classInsights("c1", {}, teacher);
    expect(result.students.map((s) => s.insights.map((i) => i.ruleCode))).toEqual([["INSUFFICIENT_EVIDENCE"], ["INSUFFICIENT_EVIDENCE"]]);
  });
  it("reconciles insight evidence to the source rows", async () => {
    const t = baseTables();
    quiz(t, "s1", 1, 60); quiz(t, "s1", 2, 60); quiz(t, "s1", 3, 60); quiz(t, "s1", 4, 85);
    const out = await service(t).studentInsights("c1", "s1", {}, teacher);
    const hit = out.insights.find((i) => i.ruleCode === "SCORE_CHANGE_UNUSUAL")!;
    expect(hit.evidence.map((e) => e.id)).toEqual(t.quizAttempt!.map((q) => q.id));
    expect(hit.values).toMatchObject({ latest: 85, mean: 60, delta: 25, direction: "UP" });
    expect(out.acknowledgements).toEqual([]);
    expect(out.displayName).toBe("Anh");
  });
  it("returns the same list for open and all while nothing is acknowledged (all adds a null latestAcknowledgement), and rejects other status values", async () => {
    const t = baseTables();
    quiz(t, "s1", 1, 60);
    const s = service(t);
    const stable = (r: Awaited<ReturnType<InsightsService["classInsights"]>>) => JSON.parse(JSON.stringify(r.students, (k, v) => (k === "computedAt" || k === "latestAcknowledgement" ? undefined : v)));
    expect(stable(await s.classInsights("c1", { status: "open" }, teacher))).toEqual(stable(await s.classInsights("c1", { status: "all" }, teacher)));
    await expect(s.classInsights("c1", { status: "closed" }, teacher)).rejects.toThrow();
    await expect(s.classInsights("c1", { status: "open", extra: "1" }, teacher)).rejects.toThrow();
    await expect(s.studentInsights("c1", "s1", { status: "x" }, teacher)).rejects.toThrow();
  });
  it("denies another teacher and an unknown class with the same 403 body, and answers 404 for a student who is not an approved member", async () => {
    const t = baseTables([["s1", "Anh"], ["s2", "Bình", "pending"]]);
    const s = service(t);
    const foreign = await s.classInsights("c1", {}, { sub: "t2", role: "TEACHER" }).catch((e) => e);
    const missing = await s.classInsights("nope", {}, teacher).catch((e) => e);
    expect(foreign.getStatus()).toBe(403);
    expect(foreign.getResponse()).toEqual(missing.getResponse());
    expect(foreign.getResponse().code).toBe("CLASS_ACCESS_DENIED");
    await expect(s.studentInsights("c1", "s1", {}, { sub: "t2", role: "TEACHER" })).rejects.toMatchObject({ status: 403 });
    for (const sid of ["s2", "ghost"]) {
      const err = await s.studentInsights("c1", sid, {}, teacher).catch((e) => e);
      expect(err.getStatus()).toBe(404);
      expect(err.getResponse().code).toBe("NOT_FOUND");
    }
  });
  it("returns empty insights with classArchived true for an archived class and loads no evidence", async () => {
    const t = baseTables([["s1", "Anh"]]);
    t.classroom![0]!.status = "ARCHIVED";
    quiz(t, "s1", 1, 60);
    const db = makeDb(t);
    const s = new InsightsService(db, { showSuddenUnaidedPass: false });
    const list = await s.classInsights("c1", {}, teacher);
    expect(list).toMatchObject({ classArchived: true, students: [{ studentId: "s1", insights: [] }] });
    const one = await s.studentInsights("c1", "s1", {}, teacher);
    expect(one).toMatchObject({ classArchived: true, insights: [], acknowledgements: [] });
    expect(db.calls.filter((c: string) => c.startsWith("quizAttempt"))).toEqual([]);
  });
  it("applies the SUDDEN_UNAIDED_PASS visibility flag in the service", async () => {
    const t = baseTables();
    practical(t, "s1", 1, "needs_practice", 3); practical(t, "s1", 2, "needs_practice", 4); practical(t, "s1", 3, "needs_practice", 3); practical(t, "s1", 4, "passed", 0);
    const hidden = (await service(t, false).studentInsights("c1", "s1", {}, teacher)).insights.find((i) => i.ruleCode === "HIGH_HINT_DEPENDENCE")!;
    const shown = (await service(t, true).studentInsights("c1", "s1", {}, teacher)).insights.find((i) => i.ruleCode === "HIGH_HINT_DEPENDENCE")!;
    expect(hidden.pattern).toBeUndefined();
    expect(hidden.status).toBe("INFORMATIONAL");
    expect(shown.pattern).toBe("SUDDEN_UNAIDED_PASS");
    expect(shown.status).toBe("TEACHER_REVIEW_RECOMMENDED");
    expect(hidden.fingerprint).toBe(shown.fingerprint);
  });
  it("drops a pattern-only insight when hidden", async () => {
    const t = baseTables();
    for (let i = 0; i < 6; i++) practical(t, "s1", i, "passed", 0);
    practical(t, "s1", 10, "needs_practice", 3); practical(t, "s1", 11, "needs_practice", 3); practical(t, "s1", 12, "needs_practice", 3); practical(t, "s1", 13, "passed", 0);
    expect((await service(t, false).studentInsights("c1", "s1", {}, teacher)).insights.some((i) => i.ruleCode === "HIGH_HINT_DEPENDENCE")).toBe(false);
    expect((await service(t, true).studentInsights("c1", "s1", {}, teacher)).insights.some((i) => i.pattern === "SUDDEN_UNAIDED_PASS")).toBe(true);
  });
  it("never writes: tables are unchanged after reads, and denied reads only add the class audit row", async () => {
    const t = baseTables();
    quiz(t, "s1", 1, 60);
    const before = JSON.stringify({ ...t, auditLog: [] });
    const s = service(t);
    await s.classInsights("c1", {}, teacher);
    await s.studentInsights("c1", "s1", {}, teacher);
    expect(JSON.stringify({ ...t, auditLog: [] })).toBe(before);
    expect(t.auditLog).toHaveLength(0);
    await s.classInsights("c1", {}, { sub: "t2", role: "TEACHER" }).catch(() => undefined);
    expect(t.auditLog.map((r) => r.action)).toEqual(["class.access"]);
  });
  it("exposes four teacher-only routes", () => {
    const proto = InsightsController.prototype as any;
    const routes = [
      ["classInsights", "classes/:classId/insights", 0],
      ["studentInsights", "classes/:classId/students/:studentId/insights", 0],
      ["acknowledge", "classes/:classId/students/:studentId/insights/:fingerprint/acknowledgements", 1],
      ["replay", "classes/:classId/students/:studentId/insights/:fingerprint/replay", 0],
    ] as const;
    for (const [name, path, method] of routes) {
      expect(Reflect.getMetadata("roles", proto[name])).toEqual(["TEACHER"]);
      expect(Reflect.getMetadata("path", proto[name])).toBe(path);
      expect(Reflect.getMetadata("method", proto[name])).toBe(method);
    }
  });
  it("delegates the controller to the service with the authenticated user", async () => {
    const t = baseTables();
    const controller = new InsightsController(service(t));
    expect(await controller.classInsights("c1", {}, { user: teacher })).toMatchObject({ classId: "c1" });
    await expect(controller.studentInsights("c1", "s1", {}, { user: { sub: "t2", role: "TEACHER" } })).rejects.toMatchObject({ status: 403 });
  });
});

describe("in-memory benchmark: 40 students x 6 steps", () => {
  it("computes the class overview well inside the 500 ms read budget", async () => {
    const students = Array.from({ length: 40 }, (_, i) => [`s${i}`, `Học sinh ${String(i).padStart(2, "0")}`] as [string, string]);
    const t = baseTables(students);
    for (let i = 0; i < 40; i++) {
      for (let step = 0; step < 6; step++) { quiz(t, `s${i}`, step, 40 + ((i * 7 + step * 13) % 50)); practical(t, `s${i}`, step, step % 2 ? "passed" : "needs_practice", (i + step) % 5); }
      submission(t, `s${i}`, 7); submission(t, `s${i}`, 8, { score: 30 });
    }
    const s = service(t);
    await s.classInsights("c1", {}, teacher);
    const samples: number[] = [];
    for (let run = 0; run < 20; run++) {
      const start = performance.now();
      const result = await s.classInsights("c1", {}, teacher);
      samples.push(performance.now() - start);
      expect(result.students).toHaveLength(40);
    }
    samples.sort((a, b) => a - b);
    const p95 = samples[Math.ceil(samples.length * 0.95) - 1]!;
    console.log(`TAI4-T2 in-memory benchmark (40 students x 6 steps, 20 runs): p95 ${p95.toFixed(1)} ms, max ${samples[samples.length - 1]!.toFixed(1)} ms`);
    expect(p95).toBeLessThan(500);
  });
});

/* ---------------------------------------------------------------- TAI4-T3 */

const req = (key: string | null, user = teacher) => ({ user, headers: key ? { "idempotency-key": key } : {} });
const KEY = (n: number) => `key-ack-${String(n).padStart(4, "0")}`;
/** A student with a stable baseline and a jump: one SCORE_CHANGE_UNUSUAL insight over q1..q4. */
function jumpClass(show = false) {
  const t = baseTables();
  quiz(t, "s1", 1, 60); quiz(t, "s1", 2, 60); quiz(t, "s1", 3, 60); quiz(t, "s1", 4, 90);
  return { t, svc: service(t, show) };
}
const current = async (svc: InsightsService, status = "open") => (await svc.studentInsights("c1", "s1", { status }, teacher)).insights;
const fpOf = async (svc: InsightsService, code = "SCORE_CHANGE_UNUSUAL") => (await current(svc, "all")).find((i) => i.ruleCode === code)!.fingerprint;
const errorOf = async (p: Promise<any>) => p.then(() => { throw new Error("expected a rejection"); }, (e) => e);

describe("TAI4-T3 acknowledgement", () => {
  beforeEach(() => setClock(new Date("2026-11-07T10:00:00.000Z")));

  it("appends one row, returns it without the actor and writes a note-free audit row", async () => {
    const { t, svc } = jumpClass();
    const fp = await fpOf(svc);
    const row = await svc.acknowledge("c1", "s1", fp, req(KEY(1)), { action: "DISMISSED", note: "  đã trao đổi với học sinh  " });
    expect(row).toMatchObject({ classId: "c1", studentId: "s1", fingerprint: fp, ruleVersion: "insights@1", ruleCode: "SCORE_CHANGE_UNUSUAL", action: "DISMISSED", note: "đã trao đổi với học sinh" });
    expect(row).not.toHaveProperty("actorId");
    expect(row.evidenceIds).toEqual(t.quizAttempt!.map((q) => q.id).sort());
    expect(t.insightAcknowledgement).toHaveLength(1);
    expect(t.insightAcknowledgement![0]!.actorId).toBe("t1");
    const audits = t.auditLog!.filter((a) => a.action === "insight.acknowledge");
    expect(audits).toHaveLength(1);
    expect(audits[0]!.after).toEqual({ classId: "c1", studentId: "s1", ruleCode: "SCORE_CHANGE_UNUSUAL", ruleVersion: "insights@1", action: "DISMISSED" });
    expect(JSON.stringify(audits[0])).not.toContain("trao đổi");
  });

  it("removes the insight from open, keeps it in all with latestAcknowledgement, and lists the rows newest first", async () => {
    const { svc } = jumpClass();
    const fp = await fpOf(svc);
    await svc.acknowledge("c1", "s1", fp, req(KEY(1)), { action: "ACKNOWLEDGED" });
    setClock(new Date("2026-11-07T11:00:00.000Z"));
    await svc.acknowledge("c1", "s1", fp, req(KEY(2)), { action: "DISMISSED", note: "xong" });
    expect(await current(svc, "open")).toEqual([]);
    const all = await svc.studentInsights("c1", "s1", { status: "all" }, teacher);
    expect(all.insights[0]!.latestAcknowledgement).toEqual({ action: "DISMISSED", createdAt: new Date("2026-11-07T11:00:00.000Z") });
    expect(all.acknowledgements.map((a) => a.action)).toEqual(["DISMISSED", "ACKNOWLEDGED"]);
    expect(all.acknowledgements.every((a) => !("actorId" in a))).toBe(true);
    expect((await svc.studentInsights("c1", "s1", { status: "open" }, teacher)).acknowledgements).toEqual([]);
    expect((await svc.classInsights("c1", { status: "open" }, teacher)).students[0]!.insights).toEqual([]);
    expect((await svc.classInsights("c1", { status: "all" }, teacher)).students[0]!.insights[0]).toMatchObject({ latestAcknowledgement: { action: "DISMISSED" } });
  });

  it("appends on a repeated acknowledgement and never touches earlier rows", async () => {
    const { t, svc } = jumpClass();
    const fp = await fpOf(svc);
    await svc.acknowledge("c1", "s1", fp, req(KEY(1)), { action: "ACKNOWLEDGED" });
    const first = JSON.stringify(t.insightAcknowledgement![0]);
    await svc.acknowledge("c1", "s1", fp, req(KEY(2)), { action: "DISMISSED" });
    expect(t.insightAcknowledgement).toHaveLength(2);
    expect(JSON.stringify(t.insightAcknowledgement![0])).toBe(first);
  });

  it("reopens through a new fingerprint when new evidence arrives, and answers 409 INSIGHT_STALE for the old one", async () => {
    const { t, svc } = jumpClass();
    const fp = await fpOf(svc);
    await svc.acknowledge("c1", "s1", fp, req(KEY(1)), { action: "DISMISSED" });
    quiz(t, "s1", 5, 20);
    const open = await current(svc, "open");
    expect(open.map((i) => i.ruleCode)).toEqual(["SCORE_CHANGE_UNUSUAL"]);
    expect(open[0]!.fingerprint).not.toBe(fp);
    const err = await errorOf(svc.acknowledge("c1", "s1", fp, req(KEY(2)), { action: "ACKNOWLEDGED" }));
    expect(err.getStatus()).toBe(409);
    expect(err.getResponse().code).toBe("INSIGHT_STALE");
    expect(t.insightAcknowledgement).toHaveLength(1);
    await svc.acknowledge("c1", "s1", open[0]!.fingerprint, req(KEY(3)), { action: "ACKNOWLEDGED" });
    expect(await current(svc, "open")).toEqual([]);
  });

  it("returns the stored row for the same key even after the insight changed, and 409 IDEMPOTENCY_KEY_REUSED for other content", async () => {
    const { t, svc } = jumpClass();
    const fp = await fpOf(svc);
    const first = await svc.acknowledge("c1", "s1", fp, req(KEY(1)), { action: "DISMISSED", note: "a" });
    quiz(t, "s1", 6, 10);
    const again = await svc.acknowledge("c1", "s1", fp, req(KEY(1)), { action: "DISMISSED", note: "a" });
    expect(again.id).toBe(first.id);
    expect(t.insightAcknowledgement).toHaveLength(1);
    expect(t.auditLog!.filter((a) => a.action === "insight.acknowledge")).toHaveLength(1);
    const reused = await errorOf(svc.acknowledge("c1", "s1", fp, req(KEY(1)), { action: "ACKNOWLEDGED", note: "a" }));
    expect(reused.getResponse().code).toBe("IDEMPOTENCY_KEY_REUSED");
  });

  it("rolls back the idempotency claim when the insight is stale, so the key can be used again", async () => {
    const { t, svc } = jumpClass();
    const err = await errorOf(svc.acknowledge("c1", "s1", "a".repeat(64), req(KEY(1)), { action: "DISMISSED" }));
    expect(err.getResponse().code).toBe("INSIGHT_STALE");
    expect(t.idempotencyRecord).toHaveLength(0);
    const fp = await fpOf(svc);
    await expect(svc.acknowledge("c1", "s1", fp, req(KEY(1)), { action: "DISMISSED" })).resolves.toMatchObject({ fingerprint: fp });
  });

  it("validates the body and the header: strict body, action, note length and normalization, key required", async () => {
    const { t, svc } = jumpClass();
    const fp = await fpOf(svc);
    expect((await errorOf(svc.acknowledge("c1", "s1", fp, req(null), { action: "DISMISSED" }))).getResponse().code).toBe("IDEMPOTENCY_KEY_REQUIRED");
    await expect(svc.acknowledge("c1", "s1", fp, req(KEY(1)), { action: "DELETE" })).rejects.toThrow();
    await expect(svc.acknowledge("c1", "s1", fp, req(KEY(1)), { action: "DISMISSED", extra: 1 })).rejects.toThrow();
    await expect(svc.acknowledge("c1", "s1", fp, req(KEY(1)), { action: "DISMISSED", note: "x".repeat(501) })).rejects.toThrow();
    await expect(svc.acknowledge("c1", "s1", fp, req(KEY(1)), {})).rejects.toThrow();
    await expect(svc.acknowledge("c1", "s1", "not-a-fingerprint", req(KEY(1)), { action: "DISMISSED" })).rejects.toThrow();
    expect(t.insightAcknowledgement).toHaveLength(0);
    expect((await svc.acknowledge("c1", "s1", fp, req(KEY(2)), { action: "ACKNOWLEDGED", note: "   " })).note).toBeNull();
    const max = await svc.acknowledge("c1", "s1", fp, req(KEY(3)), { action: "ACKNOWLEDGED", note: "đ".repeat(500) });
    expect([...max.note!]).toHaveLength(500);
    expect((await svc.acknowledge("c1", "s1", fp, req(KEY(4)), { action: "ACKNOWLEDGED", note: "é" })).note).toBe("é");
  });

  it("checks the owner (403), the archived class (409) before the fingerprint, and the approved student (404)", async () => {
    const { t, svc } = jumpClass();
    const fp = await fpOf(svc);
    expect((await errorOf(svc.acknowledge("c1", "s1", fp, req(KEY(1), { sub: "t2", role: "TEACHER" }), { action: "DISMISSED" }))).getStatus()).toBe(403);
    expect((await errorOf(svc.acknowledge("nope", "s1", fp, req(KEY(1)), { action: "DISMISSED" }))).getStatus()).toBe(403);
    t.enrollment!.push({ classId: "c1", studentId: "s2", status: "pending", student: { id: "s2", fullName: "Bình" } });
    for (const sid of ["s2", "ghost"]) {
      const err = await errorOf(svc.acknowledge("c1", sid, fp, req(KEY(2)), { action: "DISMISSED" }));
      expect(err.getStatus()).toBe(404);
      expect(err.getResponse().code).toBe("NOT_FOUND");
    }
    t.classroom![0]!.status = "ARCHIVED";
    const archived = await errorOf(svc.acknowledge("c1", "s1", "b".repeat(64), req(KEY(3)), { action: "DISMISSED" }));
    expect(archived.getStatus()).toBe(409);
    expect(archived.getResponse().code).toBe("CLASS_ARCHIVED");
    expect(t.insightAcknowledgement).toHaveLength(0);
  });

  it("does not let a hidden pattern-only insight be acknowledged", async () => {
    const t = baseTables();
    for (let i = 0; i < 6; i++) practical(t, "s1", i, "passed", 0);
    practical(t, "s1", 10, "needs_practice", 3); practical(t, "s1", 11, "needs_practice", 3); practical(t, "s1", 12, "needs_practice", 3); practical(t, "s1", 13, "passed", 0);
    const shown = service(t, true);
    const fp = (await current(shown, "all")).find((i) => i.ruleCode === "HIGH_HINT_DEPENDENCE")!.fingerprint;
    expect((await errorOf(service(t, false).acknowledge("c1", "s1", fp, req(KEY(1)), { action: "DISMISSED" }))).getResponse().code).toBe("INSIGHT_STALE");
    await expect(shown.acknowledge("c1", "s1", fp, req(KEY(2)), { action: "DISMISSED" })).resolves.toMatchObject({ fingerprint: fp });
  });

  it("keeps acknowledgements of other students apart", async () => {
    const t = baseTables([["s1", "Anh"], ["s2", "Bình"]]);
    for (const s of ["s1", "s2"]) { quiz(t, s, 1, 60); quiz(t, s, 2, 60); quiz(t, s, 3, 60); quiz(t, s, 4, 90); }
    const svc = service(t);
    const fp1 = (await svc.studentInsights("c1", "s1", { status: "all" }, teacher)).insights[0]!.fingerprint;
    await svc.acknowledge("c1", "s1", fp1, req(KEY(1)), { action: "DISMISSED" });
    expect((await svc.classInsights("c1", { status: "open" }, teacher)).students.map((s) => s.insights.length)).toEqual([0, 1]);
    expect((await errorOf(svc.acknowledge("c1", "s2", fp1, req(KEY(2)), { action: "DISMISSED" }))).getResponse().code).toBe("INSIGHT_STALE");
  });
});

describe("TAI4-T3 replay and as-of evidence", () => {
  beforeEach(() => setClock(new Date("2026-11-07T10:00:00.000Z")));
  const ackAt = (n: number) => setClock(new Date(at(n).getTime() + 3600_000));
  /** HIGH_HINT_DEPENDENCE over p1..p4 whose fingerprint survives a later hint log (ids unchanged). */
  function hintClass(show: boolean) {
    const t = baseTables();
    practical(t, "s1", 1, "needs_practice", 3); practical(t, "s1", 2, "needs_practice", 3); practical(t, "s1", 3, "needs_practice", 3);
    const last = practical(t, "s1", 4, "passed", 0);
    return { t, svc: service(t, show), last };
  }

  it("reproduces the evidence ids, thresholds and values of an insight that new evidence has since replaced", async () => {
    const { t, svc } = jumpClass();
    const fp = await fpOf(svc);
    const before = (await svc.studentInsights("c1", "s1", { status: "all" }, teacher)).insights[0]!;
    ackAt(4);
    await svc.acknowledge("c1", "s1", fp, req(KEY(1)), { action: "DISMISSED" });
    quiz(t, "s1", 10, 20);
    expect((await current(svc, "all")).some((i) => i.fingerprint === fp)).toBe(false);
    const replayed = await svc.replay("c1", "s1", fp, teacher);
    expect(replayed.fingerprint).toBe(fp);
    expect(replayed.evidence).toEqual(before.evidence);
    expect(replayed.thresholds).toEqual(before.thresholds);
    expect(replayed.values).toEqual(before.values);
    expect(replayed.computedAt).toBe(new Date(at(4).getTime() + 3600_000).toISOString());
  });

  it("treats a late-submission decision made after the acknowledgement as absent", async () => {
    const { t, svc } = jumpClass();
    const late = submission(t, "s1", 3, { score: 10, timing: "LATE", decision: null });
    const fp = await fpOf(svc);
    ackAt(4);
    await svc.acknowledge("c1", "s1", fp, req(KEY(1)), { action: "DISMISSED" });
    t.assignmentSubmission!.find((r) => r.id === late)!.decision = { decision: "REVISE_DEADLINE_FOR_CLASS", createdAt: at(20) };
    expect((await current(svc, "all")).some((i) => i.fingerprint === fp)).toBe(false);
    const replayed = await svc.replay("c1", "s1", fp, teacher);
    expect(replayed.evidence.map((e) => e.id)).not.toContain(late);
    expect(replayed.fingerprint).toBe(fp);
  });

  it("counts a decision made at or before the acknowledgement instant", async () => {
    const { t, svc } = jumpClass();
    const extended = submission(t, "s1", 3, { score: 60, timing: "LATE", decision: { decision: "REVISE_DEADLINE_FOR_CLASS", createdAt: at(4) } });
    const fp = await fpOf(svc);
    expect((await current(svc, "all")).find((i) => i.fingerprint === fp)!.evidence.map((e) => e.id)).toContain(extended);
    ackAt(4);
    await svc.acknowledge("c1", "s1", fp, req(KEY(1)), { action: "DISMISSED" });
    const replayed = await svc.replay("c1", "s1", fp, teacher);
    expect(replayed.fingerprint).toBe(fp);
    expect(replayed.evidence.map((e) => e.id)).toContain(extended);
  });

  it("ignores hint levels logged after the acknowledgement", async () => {
    const { t, svc, last } = hintClass(true);
    const fp = await fpOf(svc, "HIGH_HINT_DEPENDENCE");
    ackAt(5);
    await svc.acknowledge("c1", "s1", fp, req(KEY(1)), { action: "DISMISSED" });
    t.hintLog!.push({ attemptId: last, level: 3, createdAt: at(30) });
    const now = (await current(svc, "all")).find((i) => i.ruleCode === "HIGH_HINT_DEPENDENCE")!;
    expect(now.fingerprint).toBe(fp);
    expect(now.pattern).toBeUndefined();
    expect(now.values.highHintCount).toBe(4);
    const replayed = await svc.replay("c1", "s1", fp, teacher);
    expect(replayed.pattern).toBe("SUDDEN_UNAIDED_PASS");
    expect(replayed.values.highHintCount).toBe(3);
  });

  it("replays from the earliest acknowledgement row, not the latest", async () => {
    const { t, svc, last } = hintClass(true);
    const fp = await fpOf(svc, "HIGH_HINT_DEPENDENCE");
    ackAt(5);
    await svc.acknowledge("c1", "s1", fp, req(KEY(1)), { action: "ACKNOWLEDGED" });
    t.hintLog!.push({ attemptId: last, level: 3, createdAt: at(30) });
    ackAt(40);
    await svc.acknowledge("c1", "s1", fp, req(KEY(2)), { action: "DISMISSED" });
    expect((await svc.replay("c1", "s1", fp, teacher)).values.highHintCount).toBe(3);
  });

  it("applies the current visibility flag to a replay and keeps the fingerprint", async () => {
    const { t, svc } = hintClass(true);
    const fp = await fpOf(svc, "HIGH_HINT_DEPENDENCE");
    ackAt(5);
    await svc.acknowledge("c1", "s1", fp, req(KEY(1)), { action: "DISMISSED" });
    const hidden = await new InsightsService(makeDb(t), { showSuddenUnaidedPass: false }).replay("c1", "s1", fp, teacher);
    expect(hidden.pattern).toBeUndefined();
    expect(hidden.status).toBe("INFORMATIONAL");
    expect(hidden.fingerprint).toBe(fp);
  });

  it("answers 404 for a fingerprint without a row, a malformed one, an unknown rule version and a non-member, and 403 for an outsider", async () => {
    const { t, svc } = jumpClass();
    const fp = await fpOf(svc);
    for (const bad of [fp, "zzz", "c".repeat(64)]) expect((await errorOf(svc.replay("c1", "s1", bad, teacher))).getStatus()).toBe(404);
    t.insightAcknowledgement!.push({ id: "ack-v9", classId: "c1", studentId: "s1", fingerprint: fp, ruleVersion: "insights@9", ruleCode: "SCORE_CHANGE_UNUSUAL", evidenceIds: [], action: "DISMISSED", note: null, actorId: "t1", createdAt: at(5) });
    expect((await errorOf(svc.replay("c1", "s1", fp, teacher))).getResponse().code).toBe("NOT_FOUND");
    expect((await errorOf(svc.replay("c1", "ghost", fp, teacher))).getStatus()).toBe(404);
    expect((await errorOf(svc.replay("c1", "s1", fp, { sub: "t2", role: "TEACHER" }))).getStatus()).toBe(403);
  });

  it("answers 404 when the row exists but the evidence no longer reproduces the fingerprint", async () => {
    const { t, svc } = jumpClass();
    t.insightAcknowledgement!.push({ id: "ack-odd", classId: "c1", studentId: "s1", fingerprint: "d".repeat(64), ruleVersion: "insights@1", ruleCode: "SCORE_CHANGE_UNUSUAL", evidenceIds: [], action: "DISMISSED", note: null, actorId: "t1", createdAt: at(5) });
    expect((await errorOf(svc.replay("c1", "s1", "d".repeat(64), teacher))).getStatus()).toBe(404);
  });

  it("reads history in an archived class and writes nothing", async () => {
    const { t, svc } = jumpClass();
    const fp = await fpOf(svc);
    ackAt(4);
    await svc.acknowledge("c1", "s1", fp, req(KEY(1)), { action: "DISMISSED" });
    t.classroom![0]!.status = "ARCHIVED";
    const rows = JSON.stringify(t.insightAcknowledgement);
    expect((await svc.replay("c1", "s1", fp, teacher)).fingerprint).toBe(fp);
    expect(JSON.stringify(t.insightAcknowledgement)).toBe(rows);
  });
});
