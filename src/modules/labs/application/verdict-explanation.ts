import { CHECKPOINT_HINT_CATALOGS, CHECKPOINT_HINT_RULES, unmetHintKeys } from "./checkpoint-hint-rules";

/**
 * B2 — post-verdict explanation (spec-student-ai-checkpoint-hints, step 4).
 * Built only from the evaluator result already stored on the attempt; no model call, no write.
 * A met step reuses the catalog's leak-tested level-4 wording (the method, never the value).
 * An unmet step shows only its name, so a not-passed learner still has to find the answer.
 */
export const VERDICT_EXPLANATION_RULES = "verdict-explanations@1";

export type VerdictExplanationItem = { criterion: string; label: string; met: boolean; why: string | null };
export type VerdictExplanation = {
  verdict: "passed" | "not_passed";
  summary: string;
  items: VerdictExplanationItem[];
  ruleVersion: string;
  hintRules: string;
  provider: "rules";
};

const OTHER = "other";

export function explainVerdict(input: { rubricRef: string; verdict: string; result: any }): VerdictExplanation | null {
  const catalog = CHECKPOINT_HINT_CATALOGS[input.rubricRef];
  if (!catalog) return null;
  const passed = input.verdict === "passed";
  // A passed verdict is official (FR-22): nothing is shown as unmet even if the result lists leftovers.
  const unmet = passed ? new Set<string>() : unmetHintKeys(input.rubricRef, input.result);
  const items: VerdictExplanationItem[] = catalog.order.map((criterion) => {
    const hints = catalog.criteria[criterion];
    const met = !unmet.has(criterion);
    return { criterion, label: hints.label, met, why: met ? hints.levels[3][0] : null };
  });
  // Not passed, yet no catalog step is unmet (a criterion the catalog does not name): say so instead of "all met".
  if (!passed && !items.some((item) => !item.met))
    items.push({ criterion: OTHER, label: "Yêu cầu chung của bài", met: false, why: null });
  const missing = items.filter((item) => !item.met).length;
  return {
    verdict: passed ? "passed" : "not_passed",
    summary: passed
      ? `Em đạt vì cả ${items.length} bước đều đúng yêu cầu. Dưới đây là cách nghĩ ở từng bước.`
      : `Em chưa đạt vì còn ${missing} bước chưa đúng yêu cầu. Các bước đã đúng có giải thích; bước chưa đúng chỉ ghi tên để em tự tìm lại.`,
    items,
    ruleVersion: VERDICT_EXPLANATION_RULES,
    hintRules: CHECKPOINT_HINT_RULES,
    provider: "rules",
  };
}
