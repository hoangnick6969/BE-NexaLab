import { describe, expect, it } from "vitest";
import {
  EXPLANATION_CRITERION_CODES, EXPLANATION_V3_THRESHOLDS, evaluateInsightsV3, FORBIDDEN_INSIGHT_WORDS, INSIGHT_MESSAGES,
  type ExplanationFact, type InsightEvidence,
} from "./index";

const now = new Date("2026-11-09T00:00:00.000Z");
const at = (n: number) => new Date(Date.UTC(2026, 9, 1) + n * 24 * 3600_000);
const mcq = (id: string, n: number, score: number, lessonId: string | null = "L1", kind: "QUIZ" | "TEST" = "QUIZ"): InsightEvidence => ({ kind, id, at: at(n), score, outcomeCodes: [], lessonId });
const practical = (id: string, n: number, verdict: string, lessonId: string | null = "L1"): InsightEvidence => ({ kind: "PRACTICAL", id, at: at(n), verdict, maxHintLevel: 0, outcomeCodes: [], lessonId });
/** Explanation grade as points out of 100, so any percentage is exact. */
const fact = (percent: number, over: Partial<ExplanationFact> = {}): ExplanationFact => ({
  assignmentId: "a1", assignmentTitle: "Bài tự luận 1", lessonId: "L1", submissionId: "w1", submittedAt: at(2), gradeId: "g1", gradedAt: at(3),
  explanationPoints: percent, explanationMaxPoints: 100, ...over,
});
const run = (evidence: InsightEvidence[], explanations: ExplanationFact[] | undefined, studentId = "s1") => evaluateInsightsV3({ classId: "c1", studentId, evidence, explanations, now });
const mcqHit = (score: number, percent: number) => run([mcq("q1", 1, score)], [fact(percent)]).filter((i) => i.ruleCode === "MCQ_EXPLANATION_MISMATCH");
const simHit = (verdict: string, percent: number) => run([practical("p1", 1, verdict)], [fact(percent)]).filter((i) => i.ruleCode === "SIMULATION_EXPLANATION_MISMATCH");

describe("MCQ_EXPLANATION_MISMATCH boundaries (insights@3)", () => {
  it("fires for a score of at least 80 with an explanation of at most 40%", () => {
    expect(mcqHit(80, 40)).toHaveLength(1);
    expect(mcqHit(100, 0)).toHaveLength(1);
    expect(mcqHit(79, 40)).toHaveLength(0);
    expect(mcqHit(80, 41)).toHaveLength(0);
    expect(mcqHit(79.99, 40)).toHaveLength(0);
    expect(mcqHit(80, 40.01)).toHaveLength(0);
    expect(mcqHit(80, 40)[0]!.values.direction).toBe("ANSWER_HIGH_EXPLANATION_LOW");
  });
  it("fires for the inverse: a score of at most 40 with an explanation of at least 80%", () => {
    expect(mcqHit(40, 80)).toHaveLength(1);
    expect(mcqHit(0, 100)).toHaveLength(1);
    expect(mcqHit(41, 80)).toHaveLength(0);
    expect(mcqHit(40, 79)).toHaveLength(0);
    expect(mcqHit(40, 80)[0]!.values.direction).toBe("ANSWER_LOW_EXPLANATION_HIGH");
  });
  it("does not fire in between or when both are high or both low", () => {
    expect(mcqHit(60, 60)).toHaveLength(0);
    expect(mcqHit(90, 90)).toHaveLength(0);
    expect(mcqHit(20, 20)).toHaveLength(0);
    expect(mcqHit(60, 20)).toHaveLength(0);
  });
  it("tolerates floating point noise at the boundary (1e-9)", () => {
    expect(run([mcq("q1", 1, 79.9999999995)], [fact(40)])).toHaveLength(1);
    expect(run([mcq("q1", 1, 80)], [fact(0.3, { explanationMaxPoints: 0.75 })])).toHaveLength(1);
  });
  it("uses the newest scored item of the same lesson, QUIZ and TEST together, ordered by time then id", () => {
    expect(run([mcq("q1", 1, 95), mcq("q2", 2, 60)], [fact(10)])).toEqual([]);
    expect(run([mcq("q1", 1, 60), mcq("t1", 2, 95, "L1", "TEST")], [fact(10)])).toHaveLength(1);
    const tie = run([mcq("qb", 2, 95), mcq("qa", 2, 60)], [fact(10)]);
    expect(tie).toHaveLength(1);
    expect(tie[0]!.evidence[0]).toMatchObject({ kind: "QUIZ", id: "qb" });
  });
  it("links by lesson only: another lesson, no lesson and no written fact never fire", () => {
    expect(run([mcq("q1", 1, 95, "L2")], [fact(10)])).toEqual([]);
    expect(run([mcq("q1", 1, 95, null)], [fact(10)])).toEqual([]);
    expect(run([{ ...mcq("q1", 1, 95), lessonId: undefined }], [fact(10)])).toEqual([]);
    expect(run([mcq("q1", 1, 95)], [])).toEqual([]);
    expect(run([mcq("q1", 1, 95)], undefined)).toEqual([]);
    expect(run([], [fact(10)])).toEqual([]);
  });
  it("ignores a fact whose explanation criteria carry no points to divide by", () => {
    expect(run([mcq("q1", 1, 95)], [fact(0, { explanationMaxPoints: 0 })])).toEqual([]);
  });
  it("gives one insight per graded written submission of the lesson", () => {
    const list = run([mcq("q1", 1, 95)], [fact(10, { assignmentId: "b", submissionId: "wb", gradeId: "gb" }), fact(10)]);
    expect(list.map((i) => i.values.assignmentId)).toEqual(["a1", "b"]);
    expect(list[0]!.fingerprint).not.toBe(list[1]!.fingerprint);
  });
});

describe("SIMULATION_EXPLANATION_MISMATCH boundaries (insights@3)", () => {
  it("fires for a passed practical with an explanation of at most 40%", () => {
    expect(simHit("passed", 40)).toHaveLength(1);
    expect(simHit("passed", 41)).toHaveLength(0);
    expect(simHit("passed", 40)[0]!.values.direction).toBe("PASSED_EXPLANATION_LOW");
  });
  it("fires for a needs_practice practical with an explanation of at least 80%", () => {
    expect(simHit("needs_practice", 80)).toHaveLength(1);
    expect(simHit("needs_practice", 79)).toHaveLength(0);
    expect(simHit("needs_practice", 80)[0]!.values.direction).toBe("NEEDS_PRACTICE_EXPLANATION_HIGH");
  });
  it("does not fire for the other combinations or for an unknown verdict", () => {
    expect(simHit("passed", 80)).toHaveLength(0);
    expect(simHit("needs_practice", 10)).toHaveLength(0);
    expect(simHit("something_new", 10)).toHaveLength(0);
    expect(simHit("something_new", 90)).toHaveLength(0);
  });
  it("uses the newest practical attempt of the same lesson and ignores quizzes", () => {
    expect(run([practical("p1", 1, "passed"), practical("p2", 2, "needs_practice")], [fact(10)])).toEqual([]);
    expect(run([practical("p1", 1, "needs_practice"), practical("p2", 2, "passed")], [fact(10)])).toHaveLength(1);
    expect(run([practical("p1", 1, "passed", "L2")], [fact(10)])).toEqual([]);
    expect(run([mcq("q1", 1, 95)], [fact(10)]).map((i) => i.ruleCode)).toEqual(["MCQ_EXPLANATION_MISMATCH"]);
  });
  it("can fire together with the MCQ rule on the same written grade", () => {
    expect(run([mcq("q1", 1, 95), practical("p1", 2, "passed")], [fact(10)]).map((i) => i.ruleCode)).toEqual(["MCQ_EXPLANATION_MISMATCH", "SIMULATION_EXPLANATION_MISMATCH"]);
  });
});

describe("insights@3 output", () => {
  it("lists the answer, the written submission and the teacher grade as evidence, with values and thresholds", () => {
    const [insight] = mcqHit(90, 20);
    expect(insight).toMatchObject({
      ruleVersion: "insights@3", ruleCode: "MCQ_EXPLANATION_MISMATCH", status: "TEACHER_REVIEW_RECOMMENDED", studentId: "s1",
      message: INSIGHT_MESSAGES.MCQ_EXPLANATION_MISMATCH, computedAt: now.toISOString(),
      thresholds: { ...EXPLANATION_V3_THRESHOLDS },
      values: { assignmentId: "a1", assignmentTitle: "Bài tự luận 1", lessonId: "L1", explanationPercent: 20, direction: "ANSWER_HIGH_EXPLANATION_LOW", mcqScore: 90 },
    });
    expect(insight!.evidence).toEqual([
      { kind: "QUIZ", id: "q1", at: at(1).toISOString() },
      { kind: "WRITTEN", id: "w1", at: at(2).toISOString() },
      { kind: "WRITTEN_GRADE", id: "g1", at: at(3).toISOString() },
    ]);
    const [sim] = simHit("passed", 20);
    expect(sim!.thresholds).toEqual({ explanationHighMin: 80, explanationLowMax: 40 });
    expect(sim!.values).toMatchObject({ verdict: "passed", direction: "PASSED_EXPLANATION_LOW", explanationPercent: 20 });
    expect(sim!.evidence.map((e) => e.kind)).toEqual(["PRACTICAL", "WRITTEN", "WRITTEN_GRADE"]);
  });
  it("rounds the shown percentage to one decimal but decides on the exact value", () => {
    const [insight] = run([mcq("q1", 1, 90)], [fact(1, { explanationMaxPoints: 3 })]);
    expect(insight!.values.explanationPercent).toBe(33.3);
  });
  it("has a stable fingerprint that changes with a new grade, a new answer, the student and the class", () => {
    const base = mcqHit(90, 20)[0]!.fingerprint;
    expect(base).toMatch(/^[a-f0-9]{64}$/);
    expect(mcqHit(90, 20)[0]!.fingerprint).toBe(base);
    expect(mcqHit(85, 20)[0]!.fingerprint).toBe(base); // same evidence IDs, new score value is the same item
    expect(run([mcq("q1", 1, 90)], [fact(20, { gradeId: "g2" })])[0]!.fingerprint).not.toBe(base);
    expect(run([mcq("q9", 1, 90)], [fact(20)])[0]!.fingerprint).not.toBe(base);
    expect(run([mcq("q1", 1, 90)], [fact(20, { submissionId: "w2" })])[0]!.fingerprint).not.toBe(base);
    expect(run([mcq("q1", 1, 90)], [fact(20)], "s2")[0]!.fingerprint).not.toBe(base);
    expect(evaluateInsightsV3({ classId: "c2", studentId: "s1", evidence: [mcq("q1", 1, 90)], explanations: [fact(20)], now })[0]!.fingerprint).not.toBe(base);
    expect(simHit("passed", 20)[0]!.fingerprint).not.toBe(base);
  });
  it("is deterministic regardless of input order and does not mutate its input", () => {
    const evidence = [mcq("q1", 1, 95), practical("p1", 2, "passed")];
    const facts = [fact(10, { assignmentId: "b", submissionId: "wb", gradeId: "gb" }), fact(10)];
    const copy = JSON.stringify({ evidence, facts });
    const a = run(evidence, facts);
    expect(JSON.stringify({ evidence, facts })).toBe(copy);
    expect(run([...evidence].reverse(), [...facts].reverse())).toEqual(a);
  });
  it("uses fixed neutral templates without forbidden words, raw codes or answer content", () => {
    for (const code of ["MCQ_EXPLANATION_MISMATCH", "SIMULATION_EXPLANATION_MISMATCH"] as const) {
      const text = INSIGHT_MESSAGES[code];
      for (const word of FORBIDDEN_INSIGHT_WORDS) expect(text.toLowerCase()).not.toContain(word);
      for (const word of FORBIDDEN_INSIGHT_WORDS) expect(code.toLowerCase()).not.toContain(word);
      expect(text).not.toContain(code);
      expect(text).toContain("không phải kết luận");
    }
    const all = [...mcqHit(90, 20), ...simHit("passed", 20)];
    for (const insight of all) for (const word of FORBIDDEN_INSIGHT_WORDS) expect(JSON.stringify([insight.message, insight.values, insight.thresholds]).toLowerCase()).not.toContain(word);
  });
  it("knows exactly two explanation criterion codes", () => {
    expect([...EXPLANATION_CRITERION_CODES]).toEqual(["EXPLANATION", "REASONING"]);
    expect(EXPLANATION_V3_THRESHOLDS).toEqual({ answerHighMin: 80, answerLowMax: 40, explanationHighMin: 80, explanationLowMax: 40 });
  });
});
