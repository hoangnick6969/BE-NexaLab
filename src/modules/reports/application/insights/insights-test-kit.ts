import { InsightsService } from "./insights.service";

/**
 * Shared test kit for the TAI-04 insight tests: an in-memory stand-in for the Prisma calls of the loader and the service
 * (no database, no shared Supabase), with a call log, a controllable clock, rollback on transaction errors and small
 * fixture builders. Used by insights-read.test.ts and insights-benchmark.test.ts.
 */
export type Row = Record<string, any>;
export type Tables = Record<string, Row[]>;

export const same = (a: any, b: any) => (a instanceof Date && b instanceof Date ? a.getTime() === b.getTime() : a === b);

let clockNow = new Date("2026-11-07T00:00:00.000Z");
export const setClock = (d: Date) => { clockNow = d; };
export const time = (v: any) => (v instanceof Date ? v.getTime() : v);

export function makeDb(t: Tables) {
  const calls: string[] = [];
  const matches = (row: Row, where: Row = {}): boolean =>
    Object.entries(where).every(([key, cond]) => {
      if (cond === undefined) return true;
      if (key === "attempt") return matches(t.attempt!.find((a) => a.id === row.attemptId) ?? {}, cond);
      if (key === "actorId_key") return matches(row, cond);
      if (key === "run") return matches(t.submissionSimilarityRun!.find((r) => r.id === row.runId) ?? {}, cond);
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

export const day = 24 * 3600_000;
export const at = (n: number) => new Date(Date.UTC(2026, 9, 1) + n * day);
export const teacher = { sub: "t1", role: "TEACHER" };
let seq = 0;
export const id = (p: string) => `${p}${++seq}`;

export function emptyTables(): Tables {
  return { classroom: [], enrollment: [], assignment: [], quizAttempt: [], attempt: [], assignmentSubmission: [], hintLog: [], lessonStep: [], classResource: [], lesson: [], auditLog: [], insightAcknowledgement: [], idempotencyRecord: [], submissionSimilarityRun: [], submissionSimilarityMatch: [] };
}
export function baseTables(students: Array<[string, string, string?]> = [["s1", "Anh"]]): Tables {
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
export const quiz = (t: Tables, studentId: string, n: number, score: number, assignmentId: string | null = "a-lesson") =>
  t.quizAttempt!.push({ id: id("q"), studentId, assignmentId, lessonId: "L1", score, passed: score >= 50, createdAt: at(n) });
export const practical = (t: Tables, studentId: string, n: number, verdict: string, hint: number, assignmentId: string | null = "a-lesson") => {
  const attemptId = id("p");
  t.attempt!.push({ id: attemptId, studentId, assignmentId, lessonStepId: "step1", verdict, createdAt: at(n) });
  if (hint > 0) for (let level = 1; level <= hint; level++) t.hintLog!.push({ attemptId, level, createdAt: at(n) });
  return attemptId;
};
export const submission = (t: Tables, studentId: string, n: number, extra: Row = {}) => {
  const sid = id("sub");
  t.assignmentSubmission!.push({ id: sid, assignmentId: "a-test", studentId, score: 80, gradingMode: "AUTO", timing: "ON_TIME", submittedAt: at(n), decision: null, ...extra });
  return sid;
};
export const service = (t: Tables, show = false) => new InsightsService(makeDb(t), { showSuddenUnaidedPass: show });
