/**
 * Verification helper for the TAI-04 privacy boundary (TAI4-T7). It walks a response body recursively and reports every
 * key and every string that contains a forbidden token, case-insensitively. It is used by the unit tests and by
 * scripts/tai04-integration.mjs to prove that student, parent and outside-teacher views never carry insight data.
 */
export type Leak = { path: string; token: string; where: "key" | "value" };

/** Words that only an insight payload (or what the teacher wrote about one) can contain. */
export const INSIGHT_TOKENS = [
  "ruleCode", "ruleVersion", "fingerprint", "acknowledg", "insight",
  "INSUFFICIENT_EVIDENCE", "SCORE_CHANGE_UNUSUAL", "HIGH_HINT_DEPENDENCE", "OBJECTIVE_MASTERY_INCONSISTENT",
  "SUBMISSION_SIMILARITY_HIGH", "SUDDEN_UNAIDED_PASS", "SIMILARITY_MATCH", "pairCount", "latestAcknowledgement",
  "MCQ_EXPLANATION_MISMATCH", "SIMULATION_EXPLANATION_MISMATCH", "WRITTEN_GRADE", "explanationPercent",
];

export function findLeaks(value: unknown, tokens: string[], path = "$"): Leak[] {
  const wanted = tokens.filter(Boolean).map((token) => ({ token, lower: token.toLowerCase() }));
  const leaks: Leak[] = [];
  const visit = (node: unknown, at: string) => {
    if (node === null || node === undefined) return;
    if (typeof node === "string") {
      const lower = node.toLowerCase();
      for (const w of wanted) if (lower.includes(w.lower)) leaks.push({ path: at, token: w.token, where: "value" });
      return;
    }
    if (typeof node === "number" || typeof node === "boolean") return;
    if (node instanceof Date) return visit(node.toISOString(), at);
    if (Array.isArray(node)) return node.forEach((item, index) => visit(item, `${at}[${index}]`));
    if (typeof node === "object") {
      for (const [key, child] of Object.entries(node as Record<string, unknown>)) {
        const lower = key.toLowerCase();
        for (const w of wanted) if (lower.includes(w.lower)) leaks.push({ path: `${at}.${key}`, token: w.token, where: "key" });
        visit(child, `${at}.${key}`);
      }
    }
  };
  visit(value, path);
  return leaks;
}
