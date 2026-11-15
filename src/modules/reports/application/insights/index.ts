import { highHintDependence, insufficientEvidence, objectiveMasteryInconsistent, scoreChangeUnusual } from "./rules";
import { evaluateInsightsV2 } from "./similarity-rule";
import { evaluateInsightsV3 } from "./explanation-rule";
import { evaluateInsightsV4 } from "./trend-rule";
import { INSIGHT_MESSAGES } from "./messages";
import type { Insight, InsightInput, InsightRuleVersion } from "./types";

export * from "./types";
export { insightFingerprint } from "./fingerprint";
export { INSIGHT_MESSAGES, FORBIDDEN_INSIGHT_WORDS } from "./messages";
export { INSIGHTS_V1_THRESHOLDS } from "./rules";
export { SIMILARITY_V2_THRESHOLDS, evaluateInsightsV2 } from "./similarity-rule";
export { EXPLANATION_CRITERION_CODES, EXPLANATION_V3_THRESHOLDS, evaluateInsightsV3 } from "./explanation-rule";
export { INSIGHTS_V4_THRESHOLDS, evaluateInsightsV4 } from "./trend-rule";

const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** Insights ordered by rule code, then outcome code. */
export const sortInsights = (insights: Insight[]) =>
  [...insights].sort((a, b) => cmp(a.ruleCode, b.ruleCode) || cmp(String(a.values.outcomeCode ?? ""), String(b.values.outcomeCode ?? "")));

/** `insights@1`: pure, deterministic; insights ordered by rule code, then outcome code. Never queries or mutates anything. */
export function evaluateInsightsV1(input: InsightInput): Insight[] {
  return sortInsights([
    ...highHintDependence(input),
    ...insufficientEvidence(input),
    ...objectiveMasteryInconsistent(input),
    ...scoreChangeUnusual(input),
  ]);
}

/**
 * Every version stays callable for replay; a wave of new rules adds a new version holding only those rules and never
 * edits an earlier one, so fingerprints (which contain the version) of acknowledged insights stay valid.
 */
export const INSIGHT_ENGINES: Record<InsightRuleVersion, (input: InsightInput) => Insight[]> = {
  "insights@1": evaluateInsightsV1,
  "insights@2": evaluateInsightsV2,
  "insights@3": evaluateInsightsV3,
  "insights@4": evaluateInsightsV4,
};
/** Versions evaluated by the read routes, oldest first. */
export const ACTIVE_INSIGHT_VERSIONS: InsightRuleVersion[] = ["insights@1", "insights@2", "insights@3", "insights@4"];

/**
 * Rules retired from the read routes (TAI7-T2, G-5 amendment requested by the project owner 2026-11-15). Their engine
 * code is unchanged and replay of an acknowledged fingerprint still runs them through `engineFor`; they are only no
 * longer listed. `insights@1 SCORE_CHANGE_UNUSUAL` compared resubmissions of one practice test; `insights@4
 * ASSESSMENT_TREND` replaces it with one representative score per assignment.
 */
export const RETIRED_RULES: ReadonlyArray<{ ruleVersion: InsightRuleVersion; ruleCode: string }> = [
  { ruleVersion: "insights@1", ruleCode: "SCORE_CHANGE_UNUSUAL" },
];
export const isRetiredInsight = (insight: Pick<Insight, "ruleVersion" | "ruleCode">) =>
  RETIRED_RULES.some((r) => r.ruleVersion === insight.ruleVersion && r.ruleCode === insight.ruleCode);

/** All active versions together, sorted. Pure: the service removes retired rules (`applyRetirement`). */
export function evaluateActiveInsights(input: InsightInput): Insight[] {
  return sortInsights(ACTIVE_INSIGHT_VERSIONS.flatMap((version) => INSIGHT_ENGINES[version](input)));
}

/**
 * Service layer (TAI7-T2): drops retired rules from the read routes. `includeRetired` exists only for the TAI-04
 * mechanics tests that use SCORE_CHANGE_UNUSUAL as their sample insight; production configuration never sets it.
 */
export function applyRetirement(insights: Insight[], includeRetired = false): Insight[] {
  return includeRetired ? insights : insights.filter((insight) => !isRetiredInsight(insight));
}

export function engineFor(version: string): ((input: InsightInput) => Insight[]) | undefined {
  return (INSIGHT_ENGINES as Record<string, (input: InsightInput) => Insight[]>)[version];
}

/**
 * Applies the pilot visibility flag for SUDDEN_UNAIDED_PASS (service layer, TAI4-T2). With the flag off the insight
 * drops to the plain INFORMATIONAL hint-dependence insight when the base rule holds, and disappears when only the
 * pattern held. The fingerprint is unchanged either way.
 */
export function applyPatternVisibility(insights: Insight[], showPattern: boolean): Insight[] {
  if (showPattern) return insights;
  return insights.flatMap((insight) => {
    if (insight.pattern !== "SUDDEN_UNAIDED_PASS") return [insight];
    if (insight.values.baseRuleMet !== 1) return [];
    const { pattern: _pattern, ...rest } = insight;
    return [{ ...rest, status: "INFORMATIONAL" as const, message: INSIGHT_MESSAGES.HIGH_HINT_DEPENDENCE }];
  });
}
