import { describe, expect, it } from "vitest";
import { parseAiConfig } from "./ai-config";

const env = (values: Record<string, string>) => values as unknown as NodeJS.ProcessEnv;

describe("parseAiConfig", () => {
  it("is not configured by default and uses the documented limits", () => {
    expect(parseAiConfig(env({}))).toEqual({
      provider: null, geminiApiKey: null, model: null, runnerEnabled: true,
      dailyJobLimit: 20, concurrentJobLimit: 2, providerMinIntervalMs: 6000,
    });
  });

  it("allows the fake provider outside production", () => {
    for (const APP_ENV of ["development", "test", "staging"])
      expect(parseAiConfig(env({ AI_PROVIDER: "fake", APP_ENV })).provider).toBe("fake");
  });

  it("refuses to boot with the fake provider in production", () => {
    expect(() => parseAiConfig(env({ AI_PROVIDER: "fake", APP_ENV: "production" }))).toThrow(/forbidden/);
    expect(() => parseAiConfig(env({ AI_PROVIDER: "fake", NODE_ENV: "production" }))).toThrow(/forbidden/);
    expect(() => parseAiConfig(env({ AI_PROVIDER: "FAKE", APP_ENV: "production" }))).toThrow(/forbidden/);
  });

  it("reports gemini as configured only with both key and model", () => {
    expect(parseAiConfig(env({ AI_PROVIDER: "gemini", GEMINI_API_KEY: "k", GEMINI_MODEL: "m" })).provider).toBe("gemini");
    expect(parseAiConfig(env({ AI_PROVIDER: "gemini", GEMINI_API_KEY: "k" })).provider).toBeNull();
    expect(parseAiConfig(env({ AI_PROVIDER: "gemini", GEMINI_MODEL: "m" })).provider).toBeNull();
    expect(parseAiConfig(env({ AI_PROVIDER: "gemini", GEMINI_API_KEY: "  ", GEMINI_MODEL: "m" })).provider).toBeNull();
  });

  it("allows gemini in production when configured", () => {
    expect(parseAiConfig(env({ AI_PROVIDER: "gemini", GEMINI_API_KEY: "k", GEMINI_MODEL: "m", APP_ENV: "production" })).provider).toBe("gemini");
  });

  it("rejects an unknown provider without echoing the value", () => {
    try {
      parseAiConfig(env({ AI_PROVIDER: "secret-vendor" }));
      throw new Error("should have thrown");
    } catch (error) {
      expect((error as Error).message).toContain("AI_PROVIDER");
      expect((error as Error).message).not.toContain("secret-vendor");
    }
  });

  it("parses limits, the runner switch and rejects bad numbers", () => {
    const config = parseAiConfig(env({ AI_RUNNER_ENABLED: "false", AI_DAILY_JOB_LIMIT: "5", AI_CONCURRENT_JOB_LIMIT: "1", AI_PROVIDER_MIN_INTERVAL_MS: "0" }));
    expect(config).toMatchObject({ runnerEnabled: false, dailyJobLimit: 5, concurrentJobLimit: 1, providerMinIntervalMs: 0 });
    for (const bad of ["0", "-1", "2.5", "abc"]) expect(() => parseAiConfig(env({ AI_DAILY_JOB_LIMIT: bad }))).toThrow(/AI_DAILY_JOB_LIMIT/);
    expect(() => parseAiConfig(env({ AI_PROVIDER_MIN_INTERVAL_MS: "-5" }))).toThrow(/AI_PROVIDER_MIN_INTERVAL_MS/);
  });

  it("never includes the API key in an error", () => {
    try {
      parseAiConfig(env({ AI_PROVIDER: "gemini", GEMINI_API_KEY: "sk-very-secret", GEMINI_MODEL: "m", AI_DAILY_JOB_LIMIT: "x" }));
    } catch (error) {
      expect((error as Error).message).not.toContain("sk-very-secret");
    }
  });
});
