import { insightFingerprint } from "./fingerprint";
import { INSIGHT_MESSAGES } from "./messages";
import type { AssessmentFact, Insight, InsightEvidenceRefItem, InsightInput, InsightRuleCode } from "./types";

/**
 * `insights@4` (TAI7-T2, project-owner request 2026-11-15, see insight-rules.md "insights@4"). Works on one
 * representative 10-point score per assignment (AssessmentFact), so resubmissions of one assignment can never raise a
 * trend. Thresholds are on the 10-point scale; comparisons use a 1e-9 tolerance.
 */
export const INSIGHTS_V4_THRESHOLDS = {
  /** Previous assignments compared with the newest one. */
  baselineMin: 3,
  baselineMax: 5,
  sigmaMultiplier: 2,
  /** Minimum change in points on the 10-point scale. */
  minDelta10: 2,
  /** Graded columns are preferred; practice first attempts fill in only when there are fewer graded ones. */
  minGradedSeries: 4,
  /** A midterm due within this many days is "upcoming". */
  readinessWindowDays: 7,
  /** Practice average below this (10-point scale) counts as low. */
  lowAverage10: 5,
} as const;

const T = INSIGHTS_V4_THRESHOLDS;
const EPS = 1e-9;
const DAY_MS = 24 * 3600_000;
const round2 = (n: number) => Math.round(n * 100) / 100;
const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
const graded = (type: string) => type === "REGULAR_15M" || type === "MIDTERM_45M";

/** Evidence entry of a scored fact: its representative record, with the assignment title and the 10-point score. */
const scoredRef = (f: AssessmentFact): InsightEvidenceRefItem => ({
  kind: f.ref!.kind,
  id: f.ref!.id,
  at: f.ref!.at.toISOString(),
  label: f.title,
  score10: f.score10,
  assessmentType: f.assessmentType,
});
const assignmentRef = (f: AssessmentFact, at: Date | null, status: string): InsightEvidenceRefItem => ({
  kind: "ASSIGNMENT",
  id: f.assignmentId,
  at: (at ?? f.createdAt).toISOString(),
  label: f.title,
  assessmentType: f.assessmentType,
  status,
});

function build(input: InsightInput, ruleCode: InsightRuleCode, fields: Pick<Insight, "status" | "thresholds" | "values" | "evidence">): Insight {
  return {
    fingerprint: insightFingerprint({ ruleVersion: "insights@4", ruleCode, classId: input.classId, studentId: input.studentId, evidenceIds: fields.evidence.map((e) => e.id) }),
    ruleVersion: "insights@4",
    ruleCode,
    studentId: input.studentId,
    message: INSIGHT_MESSAGES[ruleCode as "ASSESSMENT_TREND" | "READINESS_BEFORE_MIDTERM"],
    computedAt: input.now.toISOString(),
    ...fields,
  };
}

const scored = (facts: AssessmentFact[]) =>
  facts
    .filter((f) => f.status === "SCORED" && f.ref && typeof f.score10 === "number")
    .sort((a, b) => a.ref!.at.getTime() - b.ref!.at.getTime() || cmp(a.assignmentId, b.assignmentId));

/**
 * ASSESSMENT_TREND: the newest representative score differs from the mean of the 3–5 assignments before it by at least
 * max(2σ, 2.0 points). The series is the graded columns when there are at least 4 of them, otherwise every scored
 * assignment (practice first attempts included). One point per assignment, so a retake never forms a trend.
 */
export function assessmentTrend(input: InsightInput): Insight[] {
  const all = scored((input.assessments ?? []).filter((f) => f.ref && f.ref.at.getTime() <= input.now.getTime()));
  const gradedOnly = all.filter((f) => graded(f.assessmentType));
  const family = gradedOnly.length >= T.minGradedSeries ? "GRADED" : "ALL";
  const series = family === "GRADED" ? gradedOnly : all;
  if (series.length < T.baselineMin + 1) return [];
  const latest = series[series.length - 1]!;
  const baseline = series.slice(Math.max(0, series.length - 1 - T.baselineMax), series.length - 1);
  const values = baseline.map((f) => f.score10!);
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const sd = Math.sqrt(values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length);
  const threshold = Math.max(T.sigmaMultiplier * sd, T.minDelta10);
  const delta = latest.score10! - mean;
  if (Math.abs(delta) < threshold - EPS) return [];
  return [build(input, "ASSESSMENT_TREND", {
    status: "TEACHER_REVIEW_RECOMMENDED",
    thresholds: { baselineMin: T.baselineMin, baselineMax: T.baselineMax, sigmaMultiplier: T.sigmaMultiplier, minDelta10: T.minDelta10, minGradedSeries: T.minGradedSeries },
    values: {
      family,
      latest10: latest.score10!,
      mean10: round2(mean),
      delta10: round2(delta),
      threshold10: round2(threshold),
      direction: delta > 0 ? "UP" : "DOWN",
      latestAssignmentId: latest.assignmentId,
      latestTitle: latest.title,
      latestAssessmentType: latest.assessmentType,
    },
    evidence: [...baseline, latest].map(scoredRef),
  })];
}

/**
 * READINESS_BEFORE_MIDTERM: for each MIDTERM_45M of this student due within 7 days and not yet submitted, the practice
 * work before it (PRACTICE and REGULAR_15M of the midterm's lesson, or of the class when the midterm has no lesson) is
 * not all done, or its representative scores average below 5.0.
 */
export function readinessBeforeMidterm(input: InsightInput): Insight[] {
  const facts = input.assessments ?? [];
  const now = input.now.getTime();
  const out: Insight[] = [];
  const midterms = facts
    .filter((f) => f.assessmentType === "MIDTERM_45M" && f.status === "NOT_DONE" && f.dueAt && f.dueAt.getTime() > now && f.dueAt.getTime() - now <= T.readinessWindowDays * DAY_MS)
    .sort((a, b) => a.dueAt!.getTime() - b.dueAt!.getTime() || cmp(a.assignmentId, b.assignmentId));
  for (const midterm of midterms) {
    const prep = facts
      .filter((f) => (f.assessmentType === "PRACTICE" || f.assessmentType === "REGULAR_15M") && f.assignmentId !== midterm.assignmentId)
      .filter((f) => f.createdAt.getTime() <= now && (!midterm.lessonId || f.lessonId === midterm.lessonId))
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || cmp(a.assignmentId, b.assignmentId));
    if (!prep.length) continue;
    const notDone = prep.filter((f) => f.status === "NOT_DONE");
    const withScore = prep.filter((f) => f.status === "SCORED" && typeof f.score10 === "number" && f.ref);
    const average = withScore.length ? withScore.reduce((a, f) => a + f.score10!, 0) / withScore.length : null;
    const low = average !== null && average < T.lowAverage10 - EPS;
    if (!notDone.length && !low) continue;
    out.push(build(input, "READINESS_BEFORE_MIDTERM", {
      status: "INFORMATIONAL",
      thresholds: { readinessWindowDays: T.readinessWindowDays, lowAverage10: T.lowAverage10 },
      values: {
        midtermAssignmentId: midterm.assignmentId,
        midtermTitle: midterm.title,
        midtermDueAt: midterm.dueAt!.toISOString(),
        daysLeft: Math.ceil((midterm.dueAt!.getTime() - now) / DAY_MS),
        prepCount: prep.length,
        notDoneCount: notDone.length,
        scoredCount: withScore.length,
        // Two decimals so an average just under the bound never displays as "5,0" (4.95 stays 4.95).
        average10: average === null ? "" : round2(average),
        reason: notDone.length && low ? "NOT_DONE_AND_LOW" : notDone.length ? "NOT_DONE" : "LOW_AVERAGE",
      },
      evidence: [
        assignmentRef(midterm, midterm.dueAt, "UPCOMING"),
        ...notDone.map((f) => assignmentRef(f, f.dueAt, "NOT_DONE")),
        ...withScore.map(scoredRef),
      ],
    }));
  }
  return out;
}

/** `insights@4`: pure and deterministic; reads only the per-assignment assessment facts. */
export function evaluateInsightsV4(input: InsightInput): Insight[] {
  return [...assessmentTrend(input), ...readinessBeforeMidterm(input)];
}
