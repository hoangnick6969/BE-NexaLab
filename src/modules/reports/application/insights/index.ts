import { highHintDependence, insufficientEvidence, objectiveMasteryInconsistent, scoreChangeUnusual } from "./rules";
import { INSIGHT_MESSAGES } from "./messages";
import type { Insight, InsightInput, InsightRuleVersion } from "./types";

export * from "./types";
export { insightFingerprint } from "./fingerprint";
export { INSIGHT_MESSAGES, FORBIDDEN_INSIGHT_WORDS } from "./messages";
export { INSIGHTS_V1_THRESHOLDS } from "./rules";

const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** `insights@1`: pure, deterministic; insights ordered by rule code, then outcome code. Never queries or mutates anything. */
export function evaluateInsightsV1(input: InsightInput): Insight[] {
  return [
    ...highHintDependence(input),
    ...insufficientEvidence(input),
    ...objectiveMasteryInconsistent(input),
    ...scoreChangeUnusual(input),
  ].sort((a, b) => cmp(a.ruleCode, b.ruleCode) || cmp(String(a.values.outcomeCode ?? ""), String(b.values.outcomeCode ?? "")));
}

/** Old versions stay callable for replay; a rule change adds a new entry and never edits an old one. */
export const INSIGHT_ENGINES: Record<InsightRuleVersion, (input: InsightInput) => Insight[]> = {
  "insights@1": evaluateInsightsV1,
};
export const CURRENT_INSIGHT_VERSION: InsightRuleVersion = "insights@1";

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
