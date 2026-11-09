import { describe, expect, it } from "vitest";
import { ASSESSMENT_EVALUATION_GATE, ASSESSMENT_POLICIES, assistActive, parseAiAssessmentConfig } from "./ai-assessment";

/** TAI2-T0: the AI assessment gate cannot be switched on without a recorded policy; assist needs a recorded pass. */
const ON = { AI_ASSESSMENT_ENABLED: "true", AI_ASSESSMENT_POLICY: "g2-pii-scrub@1", AI_PROVIDER: "fake" };

describe("TAI2-T0 AI assessment gate (boot check)", () => {
  it("defaults to disabled and off", () => {
    expect(parseAiAssessmentConfig({})).toMatchObject({ enabled: false, mode: "off", policy: null, promptVersion: "assess-submission@1", dailyLimit: 200 });
    expect(assistActive(parseAiAssessmentConfig({}))).toBe(false);
  });

  it("refuses to enable the gate without a recorded policy id", () => {
    expect(() => parseAiAssessmentConfig({ AI_ASSESSMENT_ENABLED: "true", AI_ASSESSMENT_MODE: "shadow" })).toThrow(/AI_ASSESSMENT_POLICY/);
    expect(() => parseAiAssessmentConfig({ AI_ASSESSMENT_ENABLED: "true", AI_ASSESSMENT_POLICY: "anything-else", AI_ASSESSMENT_MODE: "shadow" })).toThrow(/AI_ASSESSMENT_POLICY/);
  });

  it("refuses a mode other than off while the gate is disabled", () => {
    expect(() => parseAiAssessmentConfig({ AI_ASSESSMENT_MODE: "shadow" })).toThrow(/AI_ASSESSMENT_ENABLED/);
    expect(() => parseAiAssessmentConfig({ AI_ASSESSMENT_MODE: "assist" })).toThrow(/AI_ASSESSMENT_ENABLED/);
  });

  it("the recorded team-lead policy covers the fake adapter only: a live provider cannot receive student text", () => {
    expect(ASSESSMENT_POLICIES["g2-pii-scrub@1"]).toMatchObject({ allowedProviders: ["fake"], consentRequired: false, productionAllowed: false });
    expect(ASSESSMENT_POLICIES["g2-pii-scrub@1"].recordedBy).toMatch(/not PO, lecturer or legal approval/);
    expect(() => parseAiAssessmentConfig({ ...ON, AI_PROVIDER: "gemini", AI_ASSESSMENT_MODE: "shadow" })).toThrow(/not covered/);
    expect(parseAiAssessmentConfig({ ...ON, AI_ASSESSMENT_MODE: "shadow" })).toMatchObject({ enabled: true, mode: "shadow" });
  });

  it("never runs in production under the dev/test policy", () => {
    expect(() => parseAiAssessmentConfig({ ...ON, AI_ASSESSMENT_MODE: "shadow", APP_ENV: "production" })).toThrow(/production/);
    expect(() => parseAiAssessmentConfig({ ...ON, AI_ASSESSMENT_MODE: "shadow", NODE_ENV: "production" })).toThrow(/production/);
  });

  it("assist needs a recorded shadow PASS for the active prompt version", () => {
    expect(assistActive(parseAiAssessmentConfig({ ...ON, AI_ASSESSMENT_MODE: "assist" }))).toBe(true);
    expect(() => parseAiAssessmentConfig({ ...ON, AI_ASSESSMENT_MODE: "assist" }, {})).toThrow(/shadow-evaluation PASS/);
    const failed = { "assess-submission@1": { ...ASSESSMENT_EVALUATION_GATE["assess-submission@1"], verdict: "FAIL" as const } };
    expect(() => parseAiAssessmentConfig({ ...ON, AI_ASSESSMENT_MODE: "assist" }, failed)).toThrow(/shadow-evaluation PASS/);
  });

  it("rejects malformed values and names only the variable", () => {
    expect(() => parseAiAssessmentConfig({ AI_ASSESSMENT_ENABLED: "yes" })).toThrow("AI_ASSESSMENT_ENABLED must be true or false");
    expect(() => parseAiAssessmentConfig({ AI_ASSESSMENT_MODE: "auto" })).toThrow("AI_ASSESSMENT_MODE must be off, shadow or assist");
    expect(() => parseAiAssessmentConfig({ AI_DAILY_ASSESSMENT_LIMIT: "0" })).toThrow("AI_DAILY_ASSESSMENT_LIMIT must be an integer >= 1");
    expect(parseAiAssessmentConfig({ AI_DAILY_ASSESSMENT_LIMIT: "5" }).dailyLimit).toBe(5);
  });
});
