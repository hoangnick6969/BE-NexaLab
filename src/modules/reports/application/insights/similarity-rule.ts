import { insightFingerprint } from "./fingerprint";
import { INSIGHT_MESSAGES } from "./messages";
import type { Insight, InsightInput, SimilarityFact } from "./types";

/** TAI-03 `subsim@1` HIGH level: at least 80% containment over at least 8 shared fingerprints. */
export const SIMILARITY_V2_THRESHOLDS = { highContainmentPercent: 80, minSharedShingles: 8 } as const;

const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/**
 * `insights@2`: SUBMISSION_SIMILARITY_HIGH. One insight per assignment for which the student has at least one HIGH match
 * that the teacher has not reviewed. The evidence is the student's own submission plus one entry per unreviewed match, so
 * the fingerprint changes with a new run or when a pair gets reviewed. Nothing identifies the other student of a pair.
 */
export function evaluateInsightsV2(input: InsightInput): Insight[] {
  const byAssignment = new Map<string, SimilarityFact[]>();
  for (const fact of input.similarity ?? []) {
    if (fact.level !== "HIGH" || fact.reviewed) continue;
    byAssignment.set(fact.assignmentId, [...(byAssignment.get(fact.assignmentId) ?? []), fact]);
  }
  const insights: Insight[] = [];
  for (const [assignmentId, facts] of [...byAssignment].sort(([a], [b]) => cmp(a, b))) {
    const matches = [...new Map(facts.map((f) => [f.matchId, f])).values()].sort((a, b) => cmp(a.matchId, b.matchId));
    const own = matches[0]!;
    const evidence = [
      { kind: "WRITTEN" as const, id: own.submissionId, at: own.submittedAt.toISOString() },
      ...matches.map((m) => ({ kind: "SIMILARITY_MATCH" as const, id: m.matchId, at: m.runAt.toISOString() })),
    ];
    insights.push({
      fingerprint: insightFingerprint({ ruleVersion: "insights@2", ruleCode: "SUBMISSION_SIMILARITY_HIGH", classId: input.classId, studentId: input.studentId, evidenceIds: evidence.map((e) => e.id) }),
      ruleVersion: "insights@2",
      ruleCode: "SUBMISSION_SIMILARITY_HIGH",
      status: "TEACHER_REVIEW_RECOMMENDED",
      studentId: input.studentId,
      message: INSIGHT_MESSAGES.SUBMISSION_SIMILARITY_HIGH,
      thresholds: { ...SIMILARITY_V2_THRESHOLDS },
      values: { assignmentId, assignmentTitle: own.assignmentTitle, level: "HIGH", pairCount: matches.length },
      evidence,
      computedAt: input.now.toISOString(),
    });
  }
  return insights;
}
