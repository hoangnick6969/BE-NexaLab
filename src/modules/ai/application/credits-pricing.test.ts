import { describe, expect, it } from "vitest";
import { BASELINE_PRICES } from "../../../config/ai-credits";
import { chargeCredits, estimateCredits, tokenCostCredits } from "./credits-pricing";

const price = BASELINE_PRICES.GENERATE_RESOURCE; // base 2, per item 1, 2 per 1k input, 3 per 1k output

describe("TAI5-T2 estimate", () => {
  it("is deterministic and depends only on the request and the price", () => {
    expect(estimateCredits(price, 10)).toBe(12);
    expect(estimateCredits(price, 10)).toBe(12);
    expect(estimateCredits(price, 1)).toBe(3);
    expect(estimateCredits(price, 20)).toBe(22);
    expect(estimateCredits(BASELINE_PRICES.ASSESS_SUBMISSION, 1)).toBe(5);
    expect(estimateCredits({ ...price, perItemCredits: 2 }, 10)).toBe(22);
  });
});

describe("TAI5-T3 token cost and charge fixtures", () => {
  it("rounds the token cost up to whole credits", () => {
    expect(tokenCostCredits(price, 0, 0)).toBe(0);
    expect(tokenCostCredits(price, null, undefined)).toBe(0);
    expect(tokenCostCredits(price, 1, 0)).toBe(1); // 2 * 1 / 1000 -> 1
    expect(tokenCostCredits(price, 500, 0)).toBe(1); // exactly 1
    expect(tokenCostCredits(price, 501, 0)).toBe(2); // 1.002 -> 2
    expect(tokenCostCredits(price, 1500, 600)).toBe(5); // 3 + 1.8 = 4.8 -> 5
    expect(tokenCostCredits(price, 2000, 2500)).toBe(12); // 4 + 7.5 = 11.5 -> 12
    expect(tokenCostCredits(price, -5, 0)).toBe(0);
  });

  it("full valid: A = min(E, tokenCost)", () => {
    expect(chargeCredits({ estimate: 12, tokenCost: 8, validCount: 10, requestedCount: 10 })).toBe(8);
    expect(chargeCredits({ estimate: 12, tokenCost: 12, validCount: 10, requestedCount: 10 })).toBe(12);
  });

  it("partial valid prorates and rounds up, never above the reservation", () => {
    expect(chargeCredits({ estimate: 12, tokenCost: 8, validCount: 8, requestedCount: 10 })).toBe(7); // 6.4 -> 7
    // the SPEC example: 8 of 10 valid settles at most 10 of the 12 reserved credits
    expect(chargeCredits({ estimate: 12, tokenCost: 40, validCount: 8, requestedCount: 10 })).toBe(10); // 9.6 -> 10
  });

  it("tokenCost above the estimate is capped at the estimate", () => {
    expect(chargeCredits({ estimate: 12, tokenCost: 500, validCount: 10, requestedCount: 10 })).toBe(12);
  });

  it("1 of 20 valid rounds up to at least 1", () => {
    expect(chargeCredits({ estimate: 22, tokenCost: 18, validCount: 1, requestedCount: 20 })).toBe(1); // 0.9 -> 1
    expect(chargeCredits({ estimate: 22, tokenCost: 22, validCount: 1, requestedCount: 20 })).toBe(2); // 1.1 -> 2
    expect(chargeCredits({ estimate: 22, tokenCost: 1, validCount: 1, requestedCount: 20 })).toBe(1);
  });

  it("never exceeds the estimate and never goes negative, for any input", () => {
    for (const estimate of [0, 1, 3, 12, 22])
      for (const tokenCost of [0, 1, 7, 12, 100])
        for (const requestedCount of [0, 1, 5, 20])
          for (const validCount of [0, 1, 5, 20, 99]) {
            const a = chargeCredits({ estimate, tokenCost, validCount, requestedCount });
            expect(a).toBeGreaterThanOrEqual(0);
            expect(a).toBeLessThanOrEqual(estimate);
          }
  });

  it("charges nothing when no tokens were recorded or nothing was valid", () => {
    expect(chargeCredits({ estimate: 5, tokenCost: 0, validCount: 1, requestedCount: 1 })).toBe(0);
    expect(chargeCredits({ estimate: 5, tokenCost: 9, validCount: 0, requestedCount: 1 })).toBe(0);
  });
});
