import { describe, expect, it } from "vitest";
import { buildAssessmentFacts } from "./assessment-facts";
import { INSIGHT_MESSAGES, FORBIDDEN_INSIGHT_WORDS, insightFingerprint } from "./index";
import { InsightsService } from "./insights.service";
import { at, baseTables, day, makeDb, setClock, teacher, type Row, type Tables } from "./insights-test-kit";
import { assessmentTrend, evaluateInsightsV4, INSIGHTS_V4_THRESHOLDS, readinessBeforeMidterm } from "./trend-rule";
import type { AssessmentFact, InsightInput } from "./types";

/** TAI7-T2: insights@4 (ASSESSMENT_TREND, READINESS_BEFORE_MIDTERM) and the retirement of insights@1 SCORE_CHANGE_UNUSUAL. */
const NOW = at(400);
let n = 0;
const fact = (patch: Partial<AssessmentFact> & { score10?: number | null }): AssessmentFact => {
  const i = ++n;
  const score10 = patch.score10 === undefined ? 8 : patch.score10;
  return {
    assignmentId: `a${i}`,
    title: `Bài ${i}`,
    contentType: "test",
    assessmentType: "REGULAR_15M",
    lessonId: "L1",
    createdAt: at(i),
    dueAt: at(i + 1),
    status: score10 === null ? "NOT_DONE" : "SCORED",
    score10,
    ref: score10 === null ? null : { kind: "TEST", id: `sub${i}`, at: at(i) },
    ...patch,
  };
};
const input = (assessments: AssessmentFact[], now = NOW): InsightInput => ({ classId: "c1", studentId: "s1", evidence: [], assessments, now });

describe("ASSESSMENT_TREND", () => {
  it("fires DOWN when three 15-minute columns near 8.0 are followed by a 4.0, with all four assignments as evidence", () => {
    const facts = [fact({ score10: 8 }), fact({ score10: 8.3 }), fact({ score10: 7.7 }), fact({ score10: 4 })];
    const [hit] = assessmentTrend(input(facts));
    expect(hit).toMatchObject({ ruleVersion: "insights@4", ruleCode: "ASSESSMENT_TREND", status: "TEACHER_REVIEW_RECOMMENDED", message: INSIGHT_MESSAGES.ASSESSMENT_TREND });
    expect(hit!.values).toMatchObject({ direction: "DOWN", family: "GRADED", latest10: 4, mean10: 8, delta10: -4, latestAssignmentId: facts[3]!.assignmentId });
    expect(hit!.evidence.map((e) => e.id)).toEqual(["sub" + (n - 3), "sub" + (n - 2), "sub" + (n - 1), "sub" + n]);
    expect(hit!.evidence.map((e) => e.score10)).toEqual([8, 8.3, 7.7, 4]);
    expect(hit!.evidence[3]).toMatchObject({ kind: "TEST", label: facts[3]!.title, assessmentType: "REGULAR_15M" });
    expect(hit!.fingerprint).toBe(insightFingerprint({ ruleVersion: "insights@4", ruleCode: "ASSESSMENT_TREND", classId: "c1", studentId: "s1", evidenceIds: hit!.evidence.map((e) => e.id) }));
  });

  it("uses a 2.0-point minimum change on the 10-point scale: 2.0 fires, 1.9 does not", () => {
    expect(assessmentTrend(input([fact({ score10: 6 }), fact({ score10: 6 }), fact({ score10: 6 }), fact({ score10: 8 })]))).toHaveLength(1);
    expect(assessmentTrend(input([fact({ score10: 6 }), fact({ score10: 6 }), fact({ score10: 6 }), fact({ score10: 7.9 })]))).toEqual([]);
  });

  it("needs three earlier assignments and compares at most five", () => {
    expect(assessmentTrend(input([fact({ score10: 8 }), fact({ score10: 8 }), fact({ score10: 3 })]))).toEqual([]);
    const facts = [1, 2, 3, 4, 5, 6, 7].map(() => fact({ score10: 8 }));
    facts.push(fact({ score10: 3 }));
    expect(assessmentTrend(input(facts))[0]!.evidence).toHaveLength(6);
  });

  it("prefers graded columns when there are at least four, and fills in with practice otherwise", () => {
    const graded = [fact({ score10: 8 }), fact({ score10: 8 }), fact({ score10: 8 }), fact({ score10: 8, assessmentType: "MIDTERM_45M" })];
    const practiceDrop = fact({ score10: 2, assessmentType: "PRACTICE" });
    expect(assessmentTrend(input([...graded, practiceDrop]))).toEqual([]);
    const mixed = [fact({ score10: 8, assessmentType: "PRACTICE" }), fact({ score10: 8 }), fact({ score10: 8, assessmentType: "PRACTICE" }), fact({ score10: 3 })];
    expect(assessmentTrend(input(mixed))[0]!.values.family).toBe("ALL");
  });

  it("ignores pending and not-done work and results after the evaluation instant", () => {
    const facts = [fact({ score10: 8 }), fact({ score10: 8 }), fact({ score10: 8 }), fact({ score10: null, status: "PENDING" }), fact({ score10: null })];
    expect(assessmentTrend(input(facts))).toEqual([]);
    const future = fact({ score10: 2, ref: { kind: "TEST", id: "late", at: at(500) } });
    expect(assessmentTrend(input([...facts, future]))).toEqual([]);
  });
});

describe("READINESS_BEFORE_MIDTERM", () => {
  const midterm = (patch: Partial<AssessmentFact> = {}) =>
    fact({ assessmentType: "MIDTERM_45M", score10: null, status: "NOT_DONE", dueAt: new Date(NOW.getTime() + 3 * day), ...patch });

  it("fires when practice of the midterm's lesson is not done, with the midterm and the missing work as evidence", () => {
    const m = midterm();
    const undone = fact({ assessmentType: "PRACTICE", score10: null });
    const done = fact({ assessmentType: "REGULAR_15M", score10: 7 });
    const [hit] = readinessBeforeMidterm(input([m, undone, done]));
    expect(hit).toMatchObject({ ruleCode: "READINESS_BEFORE_MIDTERM", status: "INFORMATIONAL", message: INSIGHT_MESSAGES.READINESS_BEFORE_MIDTERM });
    expect(hit!.values).toMatchObject({ midtermAssignmentId: m.assignmentId, daysLeft: 3, prepCount: 2, notDoneCount: 1, scoredCount: 1, average10: 7, reason: "NOT_DONE" });
    expect(hit!.evidence.map((e) => [e.kind, e.id, e.status ?? e.score10])).toEqual([
      ["ASSIGNMENT", m.assignmentId, "UPCOMING"],
      ["ASSIGNMENT", undone.assignmentId, "NOT_DONE"],
      ["TEST", done.ref!.id, 7],
    ]);
  });

  it("fires on a practice average below 5.0 and not at 5.0", () => {
    expect(readinessBeforeMidterm(input([midterm(), fact({ assessmentType: "PRACTICE", score10: 4 }), fact({ assessmentType: "PRACTICE", score10: 5.9 })]))[0]!.values).toMatchObject({ reason: "LOW_AVERAGE", average10: 4.95 });
    expect(readinessBeforeMidterm(input([midterm(), fact({ assessmentType: "PRACTICE", score10: 4 }), fact({ assessmentType: "PRACTICE", score10: 6 })]))).toEqual([]);
  });

  it("stays silent outside the 7-day window, once the midterm is submitted, without practice, and for other lessons", () => {
    const low = () => fact({ assessmentType: "PRACTICE", score10: 2 });
    expect(readinessBeforeMidterm(input([midterm({ dueAt: new Date(NOW.getTime() + 8 * day) }), low()]))).toEqual([]);
    expect(readinessBeforeMidterm(input([midterm({ dueAt: new Date(NOW.getTime() - day) }), low()]))).toEqual([]);
    expect(readinessBeforeMidterm(input([midterm({ status: "PENDING" }), low()]))).toEqual([]);
    expect(readinessBeforeMidterm(input([midterm()]))).toEqual([]);
    expect(readinessBeforeMidterm(input([midterm(), fact({ assessmentType: "PRACTICE", score10: 2, lessonId: "L9" })]))).toEqual([]);
    expect(readinessBeforeMidterm(input([midterm({ lessonId: null }), fact({ assessmentType: "PRACTICE", score10: 2, lessonId: "L9" })]))).toHaveLength(1);
  });

  it("keeps neutral wording and exposes its thresholds", () => {
    expect(INSIGHTS_V4_THRESHOLDS).toMatchObject({ readinessWindowDays: 7, lowAverage10: 5, minDelta10: 2 });
    for (const text of [INSIGHT_MESSAGES.ASSESSMENT_TREND, INSIGHT_MESSAGES.READINESS_BEFORE_MIDTERM])
      for (const word of FORBIDDEN_INSIGHT_WORDS) expect(text.toLowerCase()).not.toContain(word);
    expect(evaluateInsightsV4(input([]))).toEqual([]);
  });
});

describe("assessment facts: one representative result per assignment", () => {
  const sources = (assignments: Row[], extra: Partial<Parameters<typeof buildAssessmentFacts>[0]> = {}) =>
    buildAssessmentFacts({ studentIds: ["s1"], assignments, resourceLesson: new Map([["r1", "L1"]]), testSubmissions: [], writtenSubmissions: [], writtenGrades: [], quizzes: [], ...extra }).get("s1")!;
  const assignment = (patch: Row = {}) => ({ id: "a1", title: "KT", contentType: "test", contentId: "r1", status: "ACTIVE", assessmentType: "PRACTICE", scoresPublishedAt: null, dueDate: at(5), createdAt: at(1), targets: [{ studentId: "s1" }], ...patch });
  const sub = (id: string, n: number, correctCount: number, patch: Row = {}) => ({ id, assignmentId: "a1", studentId: "s1", submittedAt: at(n), timing: "ON_TIME", correctCount, questionCount: 3, score: Math.round((correctCount / 3) * 100), decision: null, ...patch });

  it("takes the first counted submission of a practice test, never a retake", () => {
    const [f] = sources([assignment()], { testSubmissions: [sub("s-first", 2, 1), sub("s-retake", 3, 3)] });
    expect(f).toMatchObject({ status: "SCORED", score10: 3.3, ref: { kind: "TEST", id: "s-first" } });
  });

  it("counts a graded test only once its scores are published (as of the replay instant)", () => {
    const graded = assignment({ assessmentType: "REGULAR_15M", scoresPublishedAt: at(4) });
    expect(sources([assignment({ assessmentType: "REGULAR_15M" })], { testSubmissions: [sub("g", 2, 2)] })[0]).toMatchObject({ status: "PENDING", score10: null });
    expect(sources([graded], { testSubmissions: [sub("g", 2, 2)] })[0]).toMatchObject({ status: "SCORED", score10: 6.7 });
    expect(sources([graded], { testSubmissions: [sub("g", 2, 2)], asOf: at(3) })[0]).toMatchObject({ status: "PENDING" });
  });

  it("marks active unsubmitted work NOT_DONE, skips archived work, non-targets and lesson assignments without a quiz", () => {
    expect(sources([assignment()])[0]).toMatchObject({ status: "NOT_DONE", score10: null, lessonId: "L1" });
    expect(sources([assignment({ status: "ARCHIVED" })])).toEqual([]);
    expect(sources([assignment({ targets: [{ studentId: "s2" }] })])).toEqual([]);
    expect(sources([assignment({ contentType: "lesson", contentId: "L1" })])).toEqual([]);
    const quiz = { id: "q1", assignmentId: "a1", studentId: "s1", score: 45, createdAt: at(2) };
    expect(sources([assignment({ contentType: "lesson", contentId: "L1" })], { quizzes: [quiz, { ...quiz, id: "q2", score: 100, createdAt: at(3) }] })[0]).toMatchObject({ status: "SCORED", score10: 4.5, ref: { kind: "QUIZ", id: "q1" } });
  });

  it("uses the newest teacher grade of the current written submission", () => {
    const w = assignment({ contentType: "written", assessmentType: "MIDTERM_45M", scoresPublishedAt: at(9) });
    const subs = [sub("w1", 2, 0, { assignmentId: "a1" })];
    const grades = [{ id: "g1", submissionId: "w1", totalPoints: 1, maxPoints: 4, createdAt: at(3) }, { id: "g2", submissionId: "w1", totalPoints: 1.5, maxPoints: 4, createdAt: at(4) }];
    expect(sources([w], { writtenSubmissions: subs, writtenGrades: grades })[0]).toMatchObject({ status: "SCORED", score10: 3.8, ref: { kind: "WRITTEN", id: "w1" } });
  });
});

describe("read routes: production configuration", () => {
  const prod = (t: Tables) => new InsightsService(makeDb(t), { showSuddenUnaidedPass: false });
  const practiceRetakes = () => {
    const t = baseTables();
    t.assignmentTarget = [];
    t.assignment!.push({ id: "a-p", classId: "c1", contentType: "test", contentId: "res1", status: "ACTIVE", assessmentType: "PRACTICE", title: "Luyện tập", createdAt: at(0), dueDate: at(20), targets: [{ studentId: "s1" }] });
    // Five resubmissions of one practice test inside one evening: 35, 35, 30, 35, 75 points.
    [35, 35, 30, 35, 75].forEach((score, i) =>
      t.assignmentSubmission!.push({ id: `r${i}`, assignmentId: "a-p", studentId: "s1", score, correctCount: null, questionCount: 20, gradingMode: "AUTO", timing: "ON_TIME", submittedAt: new Date(at(1).getTime() + i * 600_000), decision: null }));
    return t;
  };

  it("never reports resubmissions of one practice test as a sudden change", async () => {
    setClock(NOW);
    const t = practiceRetakes();
    const listed = (await prod(t).studentInsights("c1", "s1", { status: "all" }, teacher)).insights.map((i) => i.ruleCode);
    expect(listed).not.toContain("SCORE_CHANGE_UNUSUAL");
    expect(listed).not.toContain("ASSESSMENT_TREND");
    // The legacy rule still exists in the engine (replay), it is only not listed.
    const legacy = (await new InsightsService(makeDb(t), { showSuddenUnaidedPass: false, includeRetired: true }).studentInsights("c1", "s1", { status: "all" }, teacher)).insights;
    expect(legacy.map((i) => i.ruleCode)).toContain("SCORE_CHANGE_UNUSUAL");
  });

  it("still replays an acknowledged insights@1 SCORE_CHANGE_UNUSUAL with the version 1 engine", async () => {
    const t = practiceRetakes();
    const legacy = (await new InsightsService(makeDb(t), { showSuddenUnaidedPass: false, includeRetired: true }).studentInsights("c1", "s1", { status: "all" }, teacher)).insights.find((i) => i.ruleCode === "SCORE_CHANGE_UNUSUAL")!;
    t.insightAcknowledgement!.push({ id: "ack1", classId: "c1", studentId: "s1", fingerprint: legacy.fingerprint, ruleVersion: "insights@1", ruleCode: "SCORE_CHANGE_UNUSUAL", evidenceIds: [], action: "ACKNOWLEDGED", note: null, actorId: "t1", createdAt: at(2) });
    const replayed = await prod(t).replay("c1", "s1", legacy.fingerprint, teacher);
    expect(replayed).toMatchObject({ ruleVersion: "insights@1", ruleCode: "SCORE_CHANGE_UNUSUAL", fingerprint: legacy.fingerprint });
  });

  it("lists ASSESSMENT_TREND across published 15-minute columns and READINESS_BEFORE_MIDTERM before a midterm, end to end", async () => {
    setClock(NOW);
    const t = baseTables();
    const col = (id: string, n: number, correct: number) => {
      t.assignment!.push({ id, classId: "c1", contentType: "test", contentId: "res1", status: "ACTIVE", assessmentType: "REGULAR_15M", title: `15p ${id}`, scoresPublishedAt: at(n + 1), createdAt: at(n), dueDate: at(n + 1), targets: [{ studentId: "s1" }] });
      t.assignmentSubmission!.push({ id: `sub-${id}`, assignmentId: id, studentId: "s1", score: correct * 10, correctCount: correct, questionCount: 10, gradingMode: "AUTO", timing: "ON_TIME", submittedAt: at(n), decision: null });
    };
    col("k1", 1, 8); col("k2", 3, 8); col("k3", 5, 8); col("k4", 7, 4);
    t.assignment!.push(
      // The service reads the real clock, so the upcoming midterm is placed relative to it (2 days, rounded up from 1.9).
      { id: "mid", classId: "c1", contentType: "test", contentId: "res1", status: "ACTIVE", assessmentType: "MIDTERM_45M", title: "Giữa kỳ", createdAt: at(20), dueDate: new Date(Date.now() + 1.9 * day), targets: [{ studentId: "s1" }] },
      { id: "prep", classId: "c1", contentType: "test", contentId: "res1", status: "ACTIVE", assessmentType: "PRACTICE", title: "Ôn tập", createdAt: at(21), dueDate: new Date(Date.now() + day), targets: [{ studentId: "s1" }] },
    );
    const insights = (await prod(t).studentInsights("c1", "s1", { status: "open" }, teacher)).insights;
    const trend = insights.find((i) => i.ruleCode === "ASSESSMENT_TREND")!;
    expect(trend.values).toMatchObject({ direction: "DOWN", family: "GRADED", latest10: 4, mean10: 8 });
    expect(trend.evidence.map((e) => e.id)).toEqual(["sub-k1", "sub-k2", "sub-k3", "sub-k4"]);
    const ready = insights.find((i) => i.ruleCode === "READINESS_BEFORE_MIDTERM")!;
    expect(ready.values).toMatchObject({ midtermAssignmentId: "mid", notDoneCount: 1, daysLeft: 2 });
    // The new insights can be acknowledged like any other.
    const svc = prod(t);
    await svc.acknowledge("c1", "s1", trend.fingerprint, { user: teacher, headers: { "idempotency-key": "ack-trend-0001" } }, { action: "ACKNOWLEDGED" });
    expect((await svc.studentInsights("c1", "s1", { status: "open" }, teacher)).insights.map((i) => i.ruleCode)).toEqual(["READINESS_BEFORE_MIDTERM"]);
  });
});
