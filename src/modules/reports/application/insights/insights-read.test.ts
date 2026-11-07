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

function makeDb(t: Tables) {
  const calls: string[] = [];
  const matches = (row: Row, where: Row = {}): boolean =>
    Object.entries(where).every(([key, cond]) => {
      if (cond === undefined) return true;
      if (key === "attempt") return matches(t.attempt!.find((a) => a.id === row.attemptId) ?? {}, cond);
      const value = row[key];
      if (cond && typeof cond === "object" && !(cond instanceof Date)) {
        if ("in" in cond) return cond.in.includes(value);
        if ("not" in cond) return !same(value, cond.not);
        return false;
      }
      return same(value, cond);
    });
  const table = (name: string) => ({
    findMany: async ({ where }: Row = {}) => { calls.push(`${name}.findMany`); return t[name]!.filter((r) => matches(r, where)).map((r) => ({ ...r })); },
    findUnique: async ({ where }: Row) => { calls.push(`${name}.findUnique`); const r = t[name]!.find((x) => matches(x, where)); return r ? { ...r } : null; },
    create: async ({ data }: Row) => { t[name]!.push({ id: `${name}-${t[name]!.length}`, ...data }); return data; },
    groupBy: async ({ where }: Row) => {
      calls.push(`${name}.groupBy`);
      const max = new Map<string, number>();
      for (const h of t[name]!.filter((r) => matches(r, where))) max.set(h.attemptId, Math.max(max.get(h.attemptId) ?? 0, h.level));
      return [...max].map(([attemptId, level]) => ({ attemptId, _max: { level } }));
    },
  });
  const db: any = { calls };
  for (const name of Object.keys(t)) db[name] = table(name);
  return db;
}

const day = 24 * 3600_000;
const at = (n: number) => new Date(Date.UTC(2026, 9, 1) + n * day);
const teacher = { sub: "t1", role: "TEACHER" };
let seq = 0;
const id = (p: string) => `${p}${++seq}`;

function emptyTables(): Tables {
  return { classroom: [], enrollment: [], assignment: [], quizAttempt: [], attempt: [], assignmentSubmission: [], hintLog: [], lessonStep: [], classResource: [], lesson: [], auditLog: [] };
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
  if (hint > 0) for (let level = 1; level <= hint; level++) t.hintLog!.push({ attemptId, level });
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
    expect(large.calls.length).toBeLessThanOrEqual(10);
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
  it("returns the same list for open and all until acknowledgements exist, and rejects other status values", async () => {
    const t = baseTables();
    quiz(t, "s1", 1, 60);
    const s = service(t);
    const stable = (r: Awaited<ReturnType<InsightsService["classInsights"]>>) => JSON.parse(JSON.stringify(r.students, (k, v) => (k === "computedAt" ? undefined : v)));
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
  it("exposes two teacher-only GET routes", () => {
    const proto = InsightsController.prototype as any;
    for (const [name, path] of [["classInsights", "classes/:classId/insights"], ["studentInsights", "classes/:classId/students/:studentId/insights"]] as const) {
      expect(Reflect.getMetadata("roles", proto[name])).toEqual(["TEACHER"]);
      expect(Reflect.getMetadata("path", proto[name])).toBe(path);
      expect(Reflect.getMetadata("method", proto[name])).toBe(0);
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
