import { highHintDependence, insufficientEvidence, objectiveMasteryInconsistent, scoreChangeUnusual } from "./rules";
import { evaluateInsightsV2 } from "./similarity-rule";
import { INSIGHT_MESSAGES } from "./messages";
import type { Insight, InsightInput, InsightRuleVersion } from "./types";

export * from "./types";
export { insightFingerprint } from "./fingerprint";
export { INSIGHT_MESSAGES, FORBIDDEN_INSIGHT_WORDS } from "./messages";
export { INSIGHTS_V1_THRESHOLDS } from "./rules";
export { SIMILARITY_V2_THRESHOLDS, evaluateInsightsV2 } from "./similarity-rule";

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
};
/** Versions evaluated by the read routes, oldest first. */
export const ACTIVE_INSIGHT_VERSIONS: InsightRuleVersion[] = ["insights@1", "insights@2"];

/** All active versions together, sorted. */
export function evaluateActiveInsights(input: InsightInput): Insight[] {
  return sortInsights(ACTIVE_INSIGHT_VERSIONS.flatMap((version) => INSIGHT_ENGINES[version](input)));
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
