import { insightFingerprint } from "./fingerprint";
import { INSIGHT_MESSAGES } from "./messages";
import type { ExplanationFact, Insight, InsightEvidence, InsightInput, InsightRuleCode } from "./types";

/** Criterion codes of a written-task rubric that count as the "explanation" of the answer (summed over all prompts). */
export const EXPLANATION_CRITERION_CODES = ["EXPLANATION", "REASONING"] as const;

/**
 * `insights@3` thresholds (team-lead decision 2026-11-09, pending PO/lecturer confirmation; see insight-rules.md).
 * Percentages on the 0-100 scale; all comparisons use a tolerance of 1e-9.
 */
export const EXPLANATION_V3_THRESHOLDS = { answerHighMin: 80, answerLowMax: 40, explanationHighMin: 80, explanationLowMax: 40 } as const;
const EPS = 1e-9;
const atLeast = (value: number, bound: number) => value >= bound - EPS;
const atMost = (value: number, bound: number) => value <= bound + EPS;
const round1 = (value: number) => Math.round(value * 10) / 10;

const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
const newest = <T extends { at: Date; id: string }>(items: T[]): T | undefined =>
  [...items].sort((a, b) => a.at.getTime() - b.at.getTime() || cmp(a.id, b.id)).at(-1);

type Pairing = { fact: ExplanationFact; item: InsightEvidence; percent: number };

/** Facts in a fixed order (assignment, then submission), each with the newest item of the wanted kinds in its lesson. */
function pairings(input: InsightInput, pick: (e: InsightEvidence) => boolean): Pairing[] {
  const out: Pairing[] = [];
  const facts = [...(input.explanations ?? [])].sort((a, b) => cmp(a.assignmentId, b.assignmentId) || cmp(a.submissionId, b.submissionId));
  for (const fact of facts) {
    if (!(fact.explanationMaxPoints > 0)) continue;
    const item = newest(input.evidence.filter((e) => e.lessonId === fact.lessonId && pick(e)));
    if (!item) continue;
    out.push({ fact, item, percent: (fact.explanationPoints / fact.explanationMaxPoints) * 100 });
  }
  return out;
}

function build(input: InsightInput, ruleCode: InsightRuleCode, p: Pairing, thresholds: Record<string, number>, values: Record<string, number | string>): Insight {
  const evidence = [
    { kind: p.item.kind, id: p.item.id, at: p.item.at.toISOString() },
    { kind: "WRITTEN" as const, id: p.fact.submissionId, at: p.fact.submittedAt.toISOString() },
    { kind: "WRITTEN_GRADE" as const, id: p.fact.gradeId, at: p.fact.gradedAt.toISOString() },
  ];
  return {
    fingerprint: insightFingerprint({ ruleVersion: "insights@3", ruleCode, classId: input.classId, studentId: input.studentId, evidenceIds: evidence.map((e) => e.id) }),
    ruleVersion: "insights@3",
    ruleCode,
    status: "TEACHER_REVIEW_RECOMMENDED",
    studentId: input.studentId,
    message: INSIGHT_MESSAGES[ruleCode as "MCQ_EXPLANATION_MISMATCH" | "SIMULATION_EXPLANATION_MISMATCH"],
    thresholds,
    values: { assignmentId: p.fact.assignmentId, assignmentTitle: p.fact.assignmentTitle, lessonId: p.fact.lessonId, explanationPercent: round1(p.percent), ...values },
    evidence,
    computedAt: input.now.toISOString(),
  };
}

/**
 * MCQ_EXPLANATION_MISMATCH: per graded written submission, the student's newest scored QUIZ or TEST of the same lesson has
 * a score of at least 80 while the teacher-final explanation is at most 40% of its maximum, or the score is at most 40
 * while the explanation is at least 80%.
 */
function mcqExplanationMismatch(input: InsightInput): Insight[] {
  const t = EXPLANATION_V3_THRESHOLDS;
  return pairings(input, (e) => (e.kind === "QUIZ" || e.kind === "TEST") && typeof e.score === "number").flatMap((p) => {
    const score = p.item.score!;
    const direction = atLeast(score, t.answerHighMin) && atMost(p.percent, t.explanationLowMax)
      ? "ANSWER_HIGH_EXPLANATION_LOW"
      : atMost(score, t.answerLowMax) && atLeast(p.percent, t.explanationHighMin)
        ? "ANSWER_LOW_EXPLANATION_HIGH"
        : null;
    return direction ? [build(input, "MCQ_EXPLANATION_MISMATCH", p, { ...t }, { direction, mcqScore: score })] : [];
  });
}

/**
 * SIMULATION_EXPLANATION_MISMATCH: per graded written submission, the student's newest PRACTICAL attempt of the same lesson
 * is `passed` while the teacher-final explanation is at most 40%, or `needs_practice` while it is at least 80%.
 */
function simulationExplanationMismatch(input: InsightInput): Insight[] {
  const t = EXPLANATION_V3_THRESHOLDS;
  return pairings(input, (e) => e.kind === "PRACTICAL").flatMap((p) => {
    const verdict = p.item.verdict;
    const direction = verdict === "passed" && atMost(p.percent, t.explanationLowMax)
      ? "PASSED_EXPLANATION_LOW"
      : verdict === "needs_practice" && atLeast(p.percent, t.explanationHighMin)
        ? "NEEDS_PRACTICE_EXPLANATION_HIGH"
        : null;
    return direction
      ? [build(input, "SIMULATION_EXPLANATION_MISMATCH", p, { explanationHighMin: t.explanationHighMin, explanationLowMax: t.explanationLowMax }, { direction, verdict: verdict! })]
      : [];
  });
}

/** `insights@3`: pure and deterministic; reads only the teacher-final explanation facts and the scored evidence list. */
export function evaluateInsightsV3(input: InsightInput): Insight[] {
  return [...mcqExplanationMismatch(input), ...simulationExplanationMismatch(input)];
}
