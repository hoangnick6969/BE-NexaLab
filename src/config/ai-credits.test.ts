import { describe, expect, it } from "vitest";
import { BASELINE_PRICES, parseAiCreditsConfig } from "./ai-credits";

describe("TAI-05 credits configuration", () => {
  it("is disabled by default and carries the team-lead baseline", () => {
    const config = parseAiCreditsConfig({});
    expect(config).toMatchObject({ enabled: false, seedBaseline: true });
    expect(config.baseline).toEqual(BASELINE_PRICES);
    expect(config.baseline.GENERATE_RESOURCE).toMatchObject({ baseCredits: 2, perItemCredits: 1 });
  });

  it("reads the flag and per-purpose overrides", () => {
    const config = parseAiCreditsConfig({ AI_CREDITS_ENABLED: "true", AI_CREDITS_ASSESS_SUBMISSION_PER_ITEM: "4", AI_CREDITS_GENERATE_RESOURCE_OUT_1K: "5" });
    expect(config.enabled).toBe(true);
    expect(config.baseline.ASSESS_SUBMISSION.perItemCredits).toBe(4);
    expect(config.baseline.GENERATE_RESOURCE.creditsPer1kOutputTokens).toBe(5);
  });

  it("rejects bad values naming the variable only", () => {
    expect(() => parseAiCreditsConfig({ AI_CREDITS_ENABLED: "yes" })).toThrow(/AI_CREDITS_ENABLED/);
    expect(() => parseAiCreditsConfig({ AI_CREDITS_GENERATE_RESOURCE_BASE: "-1" })).toThrow(/AI_CREDITS_GENERATE_RESOURCE_BASE/);
    expect(() => parseAiCreditsConfig({ AI_CREDITS_GENERATE_RESOURCE_BASE: "1.5" })).toThrow(/must be an integer/);
  });
});
