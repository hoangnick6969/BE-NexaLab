import { beforeEach, describe, expect, it } from "vitest";
import { loadClassEvidence } from "./insights-loader";
import { InsightsService } from "./insights.service";
import { at, baseTables, makeDb, practical, quiz, setClock, teacher, type Row, type Tables } from "./insights-test-kit";

/**
 * TAI4-T5 (insights@3) on the in-memory stand-in for Prisma: the loader turns the teacher-final grade of a current written
 * submission into an explanation fact, the service evaluates insights@3 with the other versions, acknowledgement, replay
 * and INSIGHT_STALE work for it, and the AI suggestion table is never read.
 */
const req = (key: string) => ({ user: teacher, headers: { "idempotency-key": key } });
const KEY = (n: number) => `key-t5-${String(n).padStart(4, "0")}`;
const errorOf = async (p: Promise<unknown>) => { try { await p; } catch (e: any) { return e; } throw new Error("expected an error"); };

const RUBRIC = {
  prompts: [
    { id: "p1", criteria: [{ code: "ACCURACY", maxPoints: 5 }, { code: "REASONING", maxPoints: 5 }] },
    { id: "p2", criteria: [{ code: "EXPLANATION", maxPoints: 5 }, { code: "CLARITY", maxPoints: 5 }] },
  ],
};
const points = (reasoning: number, explanation: number) => [
  { promptId: "p1", criterionCode: "ACCURACY", points: 5 },
  { promptId: "p1", criterionCode: "REASONING", points: reasoning },
  { promptId: "p2", criterionCode: "EXPLANATION", points: explanation },
  { promptId: "p2", criterionCode: "CLARITY", points: 5 },
];

/** s1 in class c1 with a written assignment tied to lesson L1 (the lesson of the baseline quiz and practical step). */
function writtenClass(rubric: unknown = RUBRIC) {
  const t = baseTables([["s1", "Anh"], ["s2", "Bình"]]);
  t.classResource!.push({ id: "res-w", lessonId: "L1", content: rubric });
  t.assignment!.push({ id: "a-w", classId: "c1", contentType: "written", contentId: "res-w", title: "Bài tự luận 1", status: "ACTIVE" });
  t.assignmentSubmission!.push({ id: "w1", assignmentId: "a-w", studentId: "s1", score: null, gradingMode: "TEACHER", timing: "ON_TIME", submittedAt: at(2), decision: null });
  return t;
}
const grade = (t: Tables, n: number, criterionPoints: Row[], over: Row = {}) => {
  const row = { id: `g${t.writtenGradeDecision!.length + 1}`, submissionId: "w1", kind: "MANUAL", criterionPoints, createdAt: at(n), ...over };
  t.writtenGradeDecision!.push(row);
  return row.id as string;
};
const mismatches = async (svc: InsightsService, studentId = "s1", status = "all") =>
  (await svc.studentInsights("c1", studentId, { status }, teacher)).insights.filter((i) => i.ruleVersion === "insights@3");
const svcOf = (t: Tables) => new InsightsService(makeDb(t), { showSuddenUnaidedPass: false, includeRetired: true });

beforeEach(() => setClock(new Date("2026-11-09T10:00:00.000Z")));

describe("TAI4-T5 loader: teacher-final explanation facts", () => {
  const load = (t: Tables, options = {}) => loadClassEvidence(makeDb(t), "c1", options);

  it("sums the explanation criteria over all prompts of the newest teacher grade", async () => {
    const t = writtenClass();
    grade(t, 3, points(5, 5));
    const newest = grade(t, 4, points(1, 2));
    const { explanationsByStudent } = await load(t);
    expect(explanationsByStudent.get("s1")).toEqual([{
      assignmentId: "a-w", assignmentTitle: "Bài tự luận 1", lessonId: "L1", submissionId: "w1", submittedAt: at(2), gradeId: newest, gradedAt: at(4),
      explanationPoints: 3, explanationMaxPoints: 10,
    }]);
    expect(explanationsByStudent.get("s2")).toEqual([]);
  });

  it("treats AI-based grade kinds like any teacher grade (the stored points are the teacher's)", async () => {
    const t = writtenClass();
    grade(t, 3, points(1, 1), { kind: "EDITED_AI", basedOnSuggestionId: "sug1" });
    expect((await load(t)).explanationsByStudent.get("s1")![0]).toMatchObject({ explanationPoints: 2, explanationMaxPoints: 10 });
  });

  it("gives no fact without a grade, without an explanation criterion, without a lesson or with an incomplete grade", async () => {
    const t = writtenClass();
    expect((await load(t)).explanationsByStudent.get("s1")).toEqual([]);
    const noCode = writtenClass({ prompts: [{ id: "p1", criteria: [{ code: "ACCURACY", maxPoints: 5 }] }] });
    grade(noCode, 3, [{ promptId: "p1", criterionCode: "ACCURACY", points: 1 }]);
    expect((await load(noCode)).explanationsByStudent.get("s1")).toEqual([]);
    const noLesson = writtenClass();
    noLesson.classResource!.find((r) => r.id === "res-w")!.lessonId = null;
    grade(noLesson, 3, points(1, 1));
    expect((await load(noLesson)).explanationsByStudent.get("s1")).toEqual([]);
    const partial = writtenClass();
    grade(partial, 3, points(1, 1).filter((c) => c.criterionCode !== "EXPLANATION"));
    expect((await load(partial)).explanationsByStudent.get("s1")).toEqual([]);
  });

  it("uses only the current submission: a newer ungraded submission leaves no fact, and a late or rejected one none either", async () => {
    const t = writtenClass();
    grade(t, 3, points(1, 1));
    t.assignmentSubmission!.push({ id: "w1b", assignmentId: "a-w", studentId: "s1", score: null, gradingMode: "TEACHER", timing: "ON_TIME", submittedAt: at(5), decision: null });
    expect((await load(t)).explanationsByStudent.get("s1")).toEqual([]);
    const late = writtenClass();
    late.assignmentSubmission![0]!.timing = "LATE";
    grade(late, 3, points(1, 1));
    expect((await load(late)).explanationsByStudent.get("s1")).toEqual([]);
    late.assignmentSubmission![0]!.decision = { decision: "REJECT_ZERO", createdAt: at(2) };
    expect((await load(late)).explanationsByStudent.get("s1")).toEqual([]);
    late.assignmentSubmission![0]!.decision = { decision: "ACCEPT", createdAt: at(2) };
    expect((await load(late)).explanationsByStudent.get("s1")).toHaveLength(1);
  });

  it("replays as of an instant: later grades and later late decisions do not count", async () => {
    const t = writtenClass();
    grade(t, 3, points(1, 1));
    grade(t, 8, points(5, 5));
    expect((await load(t, { asOf: at(4) })).explanationsByStudent.get("s1")![0]).toMatchObject({ explanationPoints: 2, gradedAt: at(3) });
    expect((await load(t, { asOf: at(2.5) })).explanationsByStudent.get("s1")).toEqual([]);
    const late = writtenClass();
    late.assignmentSubmission![0]!.timing = "LATE";
    late.assignmentSubmission![0]!.decision = { decision: "ACCEPT", createdAt: at(7) };
    grade(late, 3, points(1, 1));
    expect((await load(late, { asOf: at(4) })).explanationsByStudent.get("s1")).toEqual([]);
    expect((await load(late, { asOf: at(7) })).explanationsByStudent.get("s1")).toHaveLength(1);
  });

  it("never reads the AI suggestion or AI job tables", async () => {
    const t = writtenClass();
    grade(t, 3, points(1, 1));
    const db = makeDb(t);
    for (const name of ["aiAssessmentSuggestion", "aiJob"]) Object.defineProperty(db, name, { get() { throw new Error(`${name} must not be read`); } });
    await loadClassEvidence(db, "c1");
    expect(db.calls.filter((c: string) => /^ai/i.test(c))).toEqual([]);
  });

  it("adds the lesson to the scored evidence without changing what counts as evidence", async () => {
    const t = writtenClass();
    quiz(t, "s1", 1, 90);
    practical(t, "s1", 2, "passed", 0);
    const items = (await load(t)).evidenceByStudent.get("s1")!;
    expect(items.map((i) => [i.kind, i.lessonId])).toEqual([["QUIZ", "L1"], ["PRACTICAL", "L1"]]);
  });
});

describe("TAI4-T5 service: insights@3 end to end", () => {
  it("raises MCQ_EXPLANATION_MISMATCH from a scored quiz and a low teacher-final explanation", async () => {
    const t = writtenClass();
    quiz(t, "s1", 1, 90);
    const gradeId = grade(t, 3, points(1, 1));
    const found = await mismatches(svcOf(t));
    expect(found.map((i) => i.ruleCode)).toEqual(["MCQ_EXPLANATION_MISMATCH"]);
    expect(found[0]).toMatchObject({
      status: "TEACHER_REVIEW_RECOMMENDED",
      values: { assignmentId: "a-w", assignmentTitle: "Bài tự luận 1", lessonId: "L1", direction: "ANSWER_HIGH_EXPLANATION_LOW", mcqScore: 90, explanationPercent: 20 },
    });
    expect(found[0]!.evidence.map((e) => [e.kind, e.id])).toEqual([["QUIZ", t.quizAttempt![0]!.id], ["WRITTEN", "w1"], ["WRITTEN_GRADE", gradeId]]);
    expect(await mismatches(svcOf(t), "s2")).toEqual([]);
  });

  it("raises SIMULATION_EXPLANATION_MISMATCH from a needs_practice attempt and a high explanation", async () => {
    const t = writtenClass();
    practical(t, "s1", 1, "needs_practice", 0);
    grade(t, 3, points(5, 4));
    const found = await mismatches(svcOf(t));
    expect(found.map((i) => i.ruleCode)).toEqual(["SIMULATION_EXPLANATION_MISMATCH"]);
    expect(found[0]!.values).toMatchObject({ direction: "NEEDS_PRACTICE_EXPLANATION_HIGH", verdict: "needs_practice", explanationPercent: 90 });
    expect(found[0]!.evidence.map((e) => e.kind)).toEqual(["PRACTICAL", "WRITTEN", "WRITTEN_GRADE"]);
  });

  it("combines with insights@1 in the sorted union and leaves insights@1 fingerprints unchanged", async () => {
    const t = writtenClass();
    quiz(t, "s1", 1, 60); quiz(t, "s1", 2, 60); quiz(t, "s1", 3, 60); quiz(t, "s1", 4, 90);
    const svc = svcOf(t);
    const before = (await svc.studentInsights("c1", "s1", { status: "all" }, teacher)).insights;
    grade(t, 6, points(1, 1));
    const after = (await svc.studentInsights("c1", "s1", { status: "all" }, teacher)).insights;
    expect(before.map((i) => i.ruleCode)).toEqual(["SCORE_CHANGE_UNUSUAL"]);
    expect(after.map((i) => i.ruleCode)).toEqual(["MCQ_EXPLANATION_MISMATCH", "SCORE_CHANGE_UNUSUAL"]);
    expect(after.find((i) => i.ruleCode === "SCORE_CHANGE_UNUSUAL")!.fingerprint).toBe(before[0]!.fingerprint);
    const overview = await svc.classInsights("c1", { status: "all" }, teacher);
    expect(overview.students.find((s) => s.studentId === "s1")!.insights.map((i) => i.ruleVersion)).toEqual(["insights@3", "insights@1"]);
  });

  it("is never raised from an AI suggestion alone, and never reads the suggestion tables", async () => {
    const t = writtenClass();
    t.aiAssessmentSuggestion = [{
      id: "sug1", submissionId: "w1", status: "VALID", mode: "assist", resourceVersion: 1, promptVersion: "x", flags: [], createdAt: at(3),
      criterionResults: points(0, 0).map((c) => ({ ...c, valid: true, suggestedPoints: c.criterionCode === "REASONING" || c.criterionCode === "EXPLANATION" ? 0 : 5 })),
    }];
    t.aiJob = [{ id: "job1", submissionId: "w1" }];
    quiz(t, "s1", 1, 95);
    practical(t, "s1", 2, "passed", 0);
    const db = makeDb(t);
    for (const name of ["aiAssessmentSuggestion", "aiJob"]) Object.defineProperty(db, name, { get() { throw new Error(`${name} must not be read`); } });
    const svc = new InsightsService(db, { showSuddenUnaidedPass: false, includeRetired: true });
    expect(await mismatches(svc)).toEqual([]);
    expect((await svc.classInsights("c1", { status: "all" }, teacher)).students.flatMap((s) => s.insights).filter((i) => i.ruleVersion === "insights@3")).toEqual([]);
  });

  it("uses the teacher grade even when a stored suggestion says the opposite", async () => {
    const t = writtenClass();
    t.aiAssessmentSuggestion = [{ id: "sug1", submissionId: "w1", status: "VALID", mode: "assist", criterionResults: points(5, 5).map((c) => ({ ...c, valid: true, suggestedPoints: c.points })) }];
    quiz(t, "s1", 1, 95);
    grade(t, 3, points(0, 1), { kind: "REJECTED_AI", basedOnSuggestionId: "sug1" });
    const db = makeDb(t);
    for (const name of ["aiAssessmentSuggestion", "aiJob"]) Object.defineProperty(db, name, { get() { throw new Error(`${name} must not be read`); } });
    const found = await mismatches(new InsightsService(db, { showSuddenUnaidedPass: false, includeRetired: true }));
    expect(found).toHaveLength(1);
    expect(found[0]!.values.explanationPercent).toBe(10);
  });

  it("changes the fingerprint on a regrade, reopens after an acknowledgement and answers INSIGHT_STALE for the old one", async () => {
    const t = writtenClass();
    quiz(t, "s1", 1, 90);
    grade(t, 3, points(1, 1));
    const svc = svcOf(t);
    const [first] = await mismatches(svc);
    const row = await svc.acknowledge("c1", "s1", first!.fingerprint, req(KEY(1)), { action: "DISMISSED", note: "đã xem" });
    expect(row).toMatchObject({ ruleVersion: "insights@3", ruleCode: "MCQ_EXPLANATION_MISMATCH" });
    expect(await mismatches(svc, "s1", "open")).toEqual([]);
    expect((await mismatches(svc, "s1", "all"))[0]!.latestAcknowledgement).toMatchObject({ action: "DISMISSED" });
    // A regrade that still mismatches is new evidence: a new fingerprint, open again.
    grade(t, 6, points(2, 1));
    const open = await mismatches(svc, "s1", "open");
    expect(open).toHaveLength(1);
    expect(open[0]!.fingerprint).not.toBe(first!.fingerprint);
    expect((await errorOf(svc.acknowledge("c1", "s1", first!.fingerprint, req(KEY(2)), { action: "DISMISSED" }))).getResponse().code).toBe("INSIGHT_STALE");
    // A regrade that no longer mismatches removes it.
    grade(t, 7, points(5, 5));
    expect(await mismatches(svc, "s1", "all")).toEqual([]);
  });

  it("changes the fingerprint when a newer answer or practical arrives", async () => {
    const t = writtenClass();
    quiz(t, "s1", 1, 90);
    grade(t, 3, points(1, 1));
    const svc = svcOf(t);
    const [first] = await mismatches(svc);
    quiz(t, "s1", 4, 95);
    const [second] = await mismatches(svc);
    expect(second!.fingerprint).not.toBe(first!.fingerprint);
    expect(second!.evidence[0]!.id).toBe(t.quizAttempt![1]!.id);
  });

  it("replays an insights@3 acknowledgement as it stood: later grades and answers do not count", async () => {
    const t = writtenClass();
    quiz(t, "s1", 1, 90);
    const gradeId = grade(t, 3, points(1, 1));
    const svc = svcOf(t);
    const [seen] = await mismatches(svc);
    setClock(new Date(at(4).getTime()));
    await svc.acknowledge("c1", "s1", seen!.fingerprint, req(KEY(1)), { action: "ACKNOWLEDGED" });
    grade(t, 8, points(5, 5));
    quiz(t, "s1", 9, 70);
    expect(await mismatches(svc, "s1", "all")).toEqual([]);
    const replayed = await svc.replay("c1", "s1", seen!.fingerprint, teacher);
    expect(replayed.ruleVersion).toBe("insights@3");
    expect(replayed.fingerprint).toBe(seen!.fingerprint);
    expect(replayed.evidence).toEqual(seen!.evidence);
    expect(replayed.evidence.at(-1)!.id).toBe(gradeId);
  });

  it("changes neither scores nor progress: reads and acknowledgement touch only the acknowledgement, audit and idempotency tables", async () => {
    const t = writtenClass();
    quiz(t, "s1", 1, 90);
    grade(t, 3, points(1, 1));
    const watched = () => JSON.stringify(Object.fromEntries(Object.entries(t).filter(([name]) => !["insightAcknowledgement", "auditLog", "idempotencyRecord"].includes(name))));
    const before = watched();
    const svc = svcOf(t);
    const [one] = await mismatches(svc);
    await svc.acknowledge("c1", "s1", one!.fingerprint, req(KEY(1)), { action: "DISMISSED" });
    await svc.classInsights("c1", { status: "all" }, teacher);
    await svc.replay("c1", "s1", one!.fingerprint, teacher);
    expect(watched()).toBe(before);
    expect(t.auditLog!.at(-1)).toMatchObject({ action: "insight.acknowledge" });
    expect(JSON.stringify(t.auditLog)).not.toContain("explanation");
  });

  it("leaves a removed member out", async () => {
    const t = writtenClass();
    t.enrollment!.find((e) => e.studentId === "s1")!.status = "removed";
    quiz(t, "s1", 1, 90);
    grade(t, 3, points(1, 1));
    const overview = await svcOf(t).classInsights("c1", { status: "all" }, teacher);
    expect(overview.students.map((s) => s.studentId)).toEqual(["s2"]);
    expect(overview.students.flatMap((s) => s.insights).filter((i) => i.ruleVersion === "insights@3")).toEqual([]);
  });

  it("uses no query per student: the same calls for 2 or 40 students, with the two new queries in stage 2 only for written classes", async () => {
    const big = writtenClass();
    for (let i = 3; i <= 40; i++) big.enrollment!.push({ classId: "c1", studentId: `s${i}`, status: "approved", student: { id: `s${i}`, fullName: `HS ${i}` } });
    const small = makeDb(writtenClass());
    const large = makeDb(big);
    await loadClassEvidence(small, "c1");
    await loadClassEvidence(large, "c1");
    expect(large.calls).toEqual(small.calls);
    expect(large.calls.filter((c: string) => c === "writtenGradeDecision.findMany")).toHaveLength(1);
    const plain = makeDb(baseTables());
    await loadClassEvidence(plain, "c1");
    expect(plain.calls.filter((c: string) => c.startsWith("writtenGradeDecision"))).toEqual([]);
  });
});
