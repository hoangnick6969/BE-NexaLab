import { insightFingerprint } from "./fingerprint";
import { INSIGHT_MESSAGES } from "./messages";
import type { Insight, InsightEvidence, InsightEvidenceKind, InsightInput, InsightRuleCode } from "./types";

/** Exact `insights@1` thresholds, approved by the PO (gate G-5, 2026-11-06). */
export const INSIGHTS_V1_THRESHOLDS = {
  minScoredItems: 3,
  baselineMin: 3,
  baselineMax: 10,
  sigmaMultiplier: 2,
  minDelta: 25,
  minPracticals: 3,
  highHintLevel: 3,
  hintShareNumerator: 2,
  hintShareDenominator: 3,
  patternPrecedingPracticals: 3,
  masteryMinItems: 3,
  masteryMinPassing: 1,
  masteryMinNonPassing: 2,
  quizPassScore: 50,
} as const;

const T = INSIGHTS_V1_THRESHOLDS;
/**
 * Context only (not a threshold, so the approved insights@1 rule and its fingerprints do not change): compared results
 * that are all resubmissions of one assigned test, first to last within this window, are labelled a retake.
 */
export const RETAKE_WINDOW_HOURS = 24;

/** True when every item is a TEST of the same assignment and they span at most RETAKE_WINDOW_HOURS. */
export function isSameTestRetake(items: InsightEvidence[]): boolean {
  if (items.length < 2) return false;
  const assignmentId = items[0]!.assignmentId;
  if (!assignmentId || items.some((e) => e.kind !== "TEST" || e.assignmentId !== assignmentId)) return false;
  const times = items.map((e) => e.at.getTime());
  return Math.max(...times) - Math.min(...times) <= RETAKE_WINDOW_HOURS * 3_600_000;
}
const EPSILON = 1e-9;
const KIND_ORDER: InsightEvidenceKind[] = ["PRACTICAL", "QUIZ", "TEST"];

const byTimeThenId = (a: InsightEvidence, b: InsightEvidence) => a.at.getTime() - b.at.getTime() || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
const round4 = (n: number) => Math.round(n * 10_000) / 10_000;
const ref = (e: InsightEvidence) => ({ kind: e.kind, id: e.id, at: e.at.toISOString() });

function build(input: InsightInput, fields: Omit<Insight, "fingerprint" | "ruleVersion" | "studentId" | "computedAt"> & { outcomeCode?: string }): Insight {
  const { outcomeCode, ...rest } = fields;
  return {
    fingerprint: insightFingerprint({
      ruleVersion: "insights@1",
      ruleCode: rest.ruleCode,
      classId: input.classId,
      studentId: input.studentId,
      outcomeCode,
      evidenceIds: rest.evidence.map((e) => e.id),
    }),
    ruleVersion: "insights@1",
    studentId: input.studentId,
    computedAt: input.now.toISOString(),
    ...rest,
  };
}

export function isPassing(e: InsightEvidence): boolean {
  if (e.kind === "QUIZ") return e.passed === true;
  if (e.kind === "TEST") return (e.score ?? 0) >= T.quizPassScore;
  return e.verdict === "passed";
}

/** Scored items are QUIZ and TEST, oldest first. PRACTICAL is not scored. */
export function scoredItems(evidence: InsightEvidence[]): InsightEvidence[] {
  return evidence.filter((e) => e.kind !== "PRACTICAL" && typeof e.score === "number").sort(byTimeThenId);
}

export function insufficientEvidence(input: InsightInput): Insight[] {
  const scored = scoredItems(input.evidence);
  if (scored.length >= T.minScoredItems) return [];
  return [build(input, {
    ruleCode: "INSUFFICIENT_EVIDENCE",
    status: "NEEDS_MORE_EVIDENCE",
    message: INSIGHT_MESSAGES.INSUFFICIENT_EVIDENCE,
    thresholds: { minScoredItems: T.minScoredItems },
    values: { scoredCount: scored.length },
    evidence: scored.map(ref),
  })];
}

export function scoreChangeUnusual(input: InsightInput): Insight[] {
  const scored = scoredItems(input.evidence);
  if (scored.length < T.minScoredItems) return []; // INSUFFICIENT_EVIDENCE owns this case
  const latest = scored[scored.length - 1]!;
  const baseline = scored.slice(Math.max(0, scored.length - 1 - T.baselineMax), scored.length - 1);
  if (baseline.length < T.baselineMin) return [];
  const scores = baseline.map((e) => e.score!);
  const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
  const sd = Math.sqrt(scores.reduce((a, b) => a + (b - mean) ** 2, 0) / scores.length);
  const threshold = Math.max(T.sigmaMultiplier * sd, T.minDelta);
  const delta = latest.score! - mean;
  if (Math.abs(delta) < threshold - EPSILON) return [];
  const retake = isSameTestRetake([...baseline, latest]);
  return [build(input, {
    ruleCode: "SCORE_CHANGE_UNUSUAL",
    status: "TEACHER_REVIEW_RECOMMENDED",
    message: retake ? INSIGHT_MESSAGES.SCORE_CHANGE_RETAKE : INSIGHT_MESSAGES.SCORE_CHANGE_UNUSUAL,
    thresholds: { baselineMin: T.baselineMin, baselineMax: T.baselineMax, sigmaMultiplier: T.sigmaMultiplier, minDelta: T.minDelta },
    values: {
      latest: latest.score!, mean: round4(mean), standardDeviation: round4(sd), delta: round4(delta), threshold: round4(threshold), direction: delta > 0 ? "UP" : "DOWN",
      // "RETAKE_SAME_ASSIGNMENT": resubmissions of one assigned test; "ACROSS_WORK": results of different work.
      context: retake ? "RETAKE_SAME_ASSIGNMENT" : "ACROSS_WORK",
      ...(retake ? { assignmentId: latest.assignmentId! } : {}),
    },
    evidence: [...baseline, latest].map(ref),
  })];
}

/**
 * One insight when the base rule or the SUDDEN_UNAIDED_PASS pattern holds. The pattern can hold without the base rule
 * (for example 3 high-hint attempts then a clean pass after many unaided ones), so `baseRuleMet` says which applies:
 * a service that hides the pattern downgrades the insight when the base rule holds and drops it otherwise.
 */
export function highHintDependence(input: InsightInput): Insight[] {
  const practicals = input.evidence.filter((e) => e.kind === "PRACTICAL").sort(byTimeThenId);
  if (practicals.length < T.minPracticals) return [];
  const high = (e: InsightEvidence) => (e.maxHintLevel ?? 0) >= T.highHintLevel;
  const highCount = practicals.filter(high).length;
  const baseRuleMet = T.hintShareDenominator * highCount >= T.hintShareNumerator * practicals.length;
  const latest = practicals[practicals.length - 1]!;
  const preceding = practicals.slice(-1 - T.patternPrecedingPracticals, -1);
  const pattern = preceding.length === T.patternPrecedingPracticals && preceding.every(high) && latest.verdict === "passed" && (latest.maxHintLevel ?? 0) === 0;
  if (!baseRuleMet && !pattern) return [];
  return [build(input, {
    ruleCode: "HIGH_HINT_DEPENDENCE",
    ...(pattern ? { pattern: "SUDDEN_UNAIDED_PASS" as const } : {}),
    status: pattern ? "TEACHER_REVIEW_RECOMMENDED" : "INFORMATIONAL",
    message: pattern ? INSIGHT_MESSAGES.SUDDEN_UNAIDED_PASS : INSIGHT_MESSAGES.HIGH_HINT_DEPENDENCE,
    thresholds: { minPracticals: T.minPracticals, highHintLevel: T.highHintLevel, shareNumerator: T.hintShareNumerator, shareDenominator: T.hintShareDenominator },
    values: { practicalCount: practicals.length, highHintCount: highCount, baseRuleMet: baseRuleMet ? 1 : 0 },
    evidence: practicals.map(ref),
  })];
}

export function objectiveMasteryInconsistent(input: InsightInput): Insight[] {
  const codes = new Set<string>();
  for (const e of input.evidence) for (const code of e.outcomeCodes) codes.add(code);
  const out: Insight[] = [];
  for (const code of [...codes].sort()) {
    const items = input.evidence.filter((e) => e.outcomeCodes.includes(code)).sort(byTimeThenId);
    if (items.length < T.masteryMinItems) continue;
    const pair = KIND_ORDER.flatMap((k1) => KIND_ORDER.filter((k2) => k2 !== k1).map((k2) => [k1, k2] as const)).find(([k1, k2]) =>
      items.filter((e) => e.kind === k1 && isPassing(e)).length >= T.masteryMinPassing &&
      items.filter((e) => e.kind === k2 && !isPassing(e)).length >= T.masteryMinNonPassing);
    if (!pair) continue;
    const [passingKind, nonPassingKind] = pair;
    const involved = items.filter((e) => (e.kind === passingKind && isPassing(e)) || (e.kind === nonPassingKind && !isPassing(e)));
    out.push(build(input, {
      ruleCode: "OBJECTIVE_MASTERY_INCONSISTENT",
      status: "INFORMATIONAL",
      message: INSIGHT_MESSAGES.OBJECTIVE_MASTERY_INCONSISTENT,
      thresholds: { minItems: T.masteryMinItems, minPassing: T.masteryMinPassing, minNonPassing: T.masteryMinNonPassing },
      values: { outcomeCode: code, passingKind, nonPassingKind },
      evidence: involved.map(ref),
      outcomeCode: code,
    }));
  }
  return out;
}

export const RULE_ORDER: InsightRuleCode[] = ["HIGH_HINT_DEPENDENCE", "INSUFFICIENT_EVIDENCE", "OBJECTIVE_MASTERY_INCONSISTENT", "SCORE_CHANGE_UNUSUAL"];
