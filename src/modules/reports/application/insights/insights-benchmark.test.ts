import { describe, expect, it } from "vitest";
import { INSIGHT_ENGINES, type InsightInput } from "./index";
import { loadClassEvidence } from "./insights-loader";
import { at, baseTables, makeDb, practical, quiz, service, setClock, submission, teacher, type Tables } from "./insights-test-kit";

/**
 * TAI4-T7 in-memory benchmark for QR-09 (p95 500 ms) on the B2 workload of 40 students x 6 steps, over both rule
 * versions. It measures the loader logic, the engines and the service on an in-memory database, and it pins the query
 * shape of the loader. It says nothing about the latency of a remote database: that is recorded separately as a pilot
 * measurement (see the story notes) and no production claim is made from it.
 */
const BUDGET_MS = 500;

/** `students` students with 6 quiz attempts, 6 practical attempts and 2 tests each, a written assignment with one
 * submission each and a similarity run whose HIGH matches pair the students two by two, plus some acknowledgements. */
function workload(students: number): Tables {
  const t = baseTables(Array.from({ length: students }, (_, i) => [`s${i}`, `Học sinh ${String(i).padStart(3, "0")}`] as [string, string]));
  t.assignment!.push({ id: "a-w", classId: "c1", contentType: "written", contentId: "res-w", title: "Bài tự luận", status: "ACTIVE" });
  for (let i = 0; i < students; i++) {
    for (let step = 0; step < 6; step++) {
      quiz(t, `s${i}`, step, 40 + ((i * 7 + step * 13) % 50));
      practical(t, `s${i}`, step, step % 2 ? "passed" : "needs_practice", (i + step) % 5);
    }
    submission(t, `s${i}`, 7);
    submission(t, `s${i}`, 8, { score: 30 });
    t.assignmentSubmission!.push({ id: `w${i}`, assignmentId: "a-w", studentId: `s${i}`, score: null, gradingMode: "TEACHER", timing: "ON_TIME", submittedAt: at(9), decision: null });
  }
  t.submissionSimilarityRun!.push({ id: "r1", assignmentId: "a-w", createdAt: at(10) });
  for (let i = 0; i + 1 < students; i += 2) t.submissionSimilarityMatch!.push({ id: `m${i}`, runId: "r1", level: "HIGH", submissionAId: `w${i}`, submissionBId: `w${i + 1}`, reviews: [] });
  for (let i = 0; i < Math.min(students, 20); i++) t.insightAcknowledgement!.push({ id: `ack${i}`, classId: "c1", studentId: `s${i}`, fingerprint: String(i).padStart(64, "0"), ruleVersion: "insights@1", ruleCode: "SCORE_CHANGE_UNUSUAL", evidenceIds: [], action: "DISMISSED", note: null, actorId: "t1", createdAt: at(11) });
  return t;
}

const percentile = (samples: number[], p: number) => [...samples].sort((a, b) => a - b)[Math.ceil(samples.length * p) - 1]!;
async function measure(run: () => unknown | Promise<unknown>, runs = 30) {
  await run(); // warm-up
  const samples: number[] = [];
  for (let i = 0; i < runs; i++) {
    const start = performance.now();
    await run();
    samples.push(performance.now() - start);
  }
  return { p50: percentile(samples, 0.5), p95: percentile(samples, 0.95), max: Math.max(...samples) };
}
const fmt = (m: { p50: number; p95: number; max: number }) => `p50 ${m.p50.toFixed(1)} ms, p95 ${m.p95.toFixed(1)} ms, max ${m.max.toFixed(1)} ms`;

describe("QR-09 in memory: 40 students x 6 steps", () => {
  it("keeps the class overview of both rule versions within the budget", async () => {
    setClock(new Date("2026-11-07T10:00:00.000Z"));
    const t = workload(40);
    const svc = service(t);
    const overview = await svc.classInsights("c1", { status: "all" }, teacher);
    expect(overview.students).toHaveLength(40);
    const byVersion = (version: string) => overview.students.flatMap((s) => s.insights).filter((i) => i.ruleVersion === version).length;
    expect(byVersion("insights@1")).toBeGreaterThan(0);
    expect(byVersion("insights@2")).toBe(40); // every student sits in one HIGH pair

    const end = await measure(() => svc.classInsights("c1", { status: "all" }, teacher));
    const student = await measure(() => svc.studentInsights("c1", "s7", { status: "all" }, teacher));
    const loaded = await loadClassEvidence(makeDb(t), "c1");
    const inputs: InsightInput[] = loaded.members.map((m) => ({ classId: "c1", studentId: m.id, evidence: loaded.evidenceByStudent.get(m.id) ?? [], similarity: loaded.similarityByStudent.get(m.id) ?? [], now: new Date("2026-11-07T10:00:00.000Z") }));
    const v1 = await measure(() => inputs.forEach((input) => INSIGHT_ENGINES["insights@1"](input)));
    const v2 = await measure(() => inputs.forEach((input) => INSIGHT_ENGINES["insights@2"](input)));
    console.log(
      `TAI4-T7 in-memory benchmark, 40 students x 6 steps, 30 runs each: class overview ${fmt(end)}; one student ${fmt(student)}; engine insights@1 for 40 students ${fmt(v1)}; engine insights@2 for 40 students ${fmt(v2)}`,
    );
    for (const m of [end, student, v1, v2]) expect(m.p95).toBeLessThan(BUDGET_MS);
  });

  it("stays within the budget at 200 students", async () => {
    setClock(new Date("2026-11-07T10:00:00.000Z"));
    const svc = service(workload(200));
    const m = await measure(() => svc.classInsights("c1", { status: "all" }, teacher), 10);
    console.log(`TAI4-T7 in-memory benchmark, 200 students, 10 runs: class overview ${fmt(m)}`);
    expect(m.p95).toBeLessThan(BUDGET_MS);
  });
});

describe("loader query shape", () => {
  it("is 3 stage-1 queries, 11 stage-2 queries issued together and one lesson lookup, for 3, 40 and 200 students", async () => {
    const lists: string[][] = [];
    for (const n of [3, 40, 200]) {
      const db = makeDb(workload(n));
      await loadClassEvidence(db, "c1");
      lists.push(db.calls);
    }
    expect(lists[1]).toEqual(lists[0]);
    expect(lists[2]).toEqual(lists[0]);
    const calls = lists[2]!;
    expect(calls.slice(0, 3).sort()).toEqual(["assignment.findMany", "enrollment.findMany", "insightAcknowledgement.findMany"]);
    expect(calls.slice(3, 14).sort()).toEqual([
      "assignmentSubmission.findMany", "assignmentSubmission.findMany", "attempt.findMany", "classResource.findMany", "classResource.findMany", "hintLog.groupBy",
      "lessonStep.findMany", "quizAttempt.findMany", "submissionSimilarityMatch.findMany", "submissionSimilarityRun.findMany", "writtenGradeDecision.findMany",
    ]);
    expect(calls.slice(14)).toEqual(["lesson.findMany"]);
    expect(calls).toHaveLength(15);
  });

  it("is the same for the per-student read and for the as-of replay, and is smaller for an archived class", async () => {
    const one = makeDb(workload(40));
    await loadClassEvidence(one, "c1", { studentId: "s7" });
    const all = makeDb(workload(40));
    await loadClassEvidence(all, "c1");
    expect(one.calls).toEqual(all.calls);
    const replay = makeDb(workload(40));
    await loadClassEvidence(replay, "c1", { studentId: "s7", acknowledgements: false, asOf: at(20) });
    expect(replay.calls).toHaveLength(14);
    const members = makeDb(workload(40));
    await loadClassEvidence(members, "c1", { withEvidence: false });
    expect(members.calls.sort()).toEqual(["assignment.findMany", "enrollment.findMany"]);
  });
});
