/**
 * TAI-05 estimate and charge arithmetic (ledger-rules.md "Estimate and charge"). Pure integer functions: the same
 * request and price always give the same estimate, so the server can recompute it on create and compare it with
 * the value the teacher confirmed.
 */
export type PriceTable = {
  baseCredits: number;
  perItemCredits: number;
  creditsPer1kInputTokens: number;
  creditsPer1kOutputTokens: number;
};

/** estimate = baseCredits + perItemCredits x requestedCount. Depends only on the request and the price. */
export const estimateCredits = (price: PriceTable, requestedCount: number) => price.baseCredits + price.perItemCredits * requestedCount;

/** tokenCost = ceil(creditsPer1kInputTokens x inputTokens / 1000 + creditsPer1kOutputTokens x outputTokens / 1000), in integers. */
export function tokenCostCredits(price: PriceTable, inputTokens: number | null | undefined, outputTokens: number | null | undefined) {
  const numerator = price.creditsPer1kInputTokens * Math.max(0, inputTokens ?? 0) + price.creditsPer1kOutputTokens * Math.max(0, outputTokens ?? 0);
  return Math.floor((numerator + 999) / 1000);
}

/**
 * A = ceil(min(estimate, tokenCost) x validCount / requestedCount), so 0 <= A <= estimate. Fractions round up per job
 * after proration. A job with no recorded usage (for example an assessment suppressed before any provider call) has
 * tokenCost 0 and is charged nothing.
 */
export function chargeCredits(input: { estimate: number; tokenCost: number; validCount: number; requestedCount: number }) {
  const requested = Math.max(0, Math.floor(input.requestedCount));
  if (requested === 0) return 0;
  const valid = Math.min(Math.max(0, Math.floor(input.validCount)), requested);
  const base = Math.min(Math.max(0, input.estimate), Math.max(0, input.tokenCost));
  return Math.min(input.estimate, Math.floor((base * valid + requested - 1) / requested));
}
