import type { AiProviderName } from "./ai-provider";

export type AiConfig = {
  /** null when no provider is configured: job creation then returns 503 AI_PROVIDER_NOT_CONFIGURED (TAI-T2). */
  provider: AiProviderName | null;
  geminiApiKey: string | null;
  model: string | null;
  runnerEnabled: boolean;
  dailyJobLimit: number;
  concurrentJobLimit: number;
  providerMinIntervalMs: number;
};

const isProduction = (env: NodeJS.ProcessEnv) => env.APP_ENV === "production" || env.NODE_ENV === "production";

function integer(env: NodeJS.ProcessEnv, name: string, fallback: number, min: number): number {
  const raw = env[name]?.trim();
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < min) throw new Error(`${name} must be an integer >= ${min}`);
  return value;
}

/**
 * Parses and guards the AI environment. Errors name the variable only, never its value, so keys cannot leak.
 * Boot fails when the fake provider is selected in production, and when AI_PROVIDER holds an unknown value.
 * Missing Gemini credentials do not fail boot: the provider is reported as not configured instead.
 */
export function parseAiConfig(env: NodeJS.ProcessEnv): AiConfig {
  const selected = env.AI_PROVIDER?.trim().toLowerCase() || null;
  if (selected !== null && selected !== "gemini" && selected !== "fake")
    throw new Error("AI_PROVIDER must be gemini, fake or empty");
  if (selected === "fake" && isProduction(env))
    throw new Error("AI_PROVIDER=fake is forbidden when APP_ENV or NODE_ENV is production");

  const geminiApiKey = env.GEMINI_API_KEY?.trim() || null;
  const model = env.GEMINI_MODEL?.trim() || null;
  const configured = selected === "fake" || (selected === "gemini" && geminiApiKey !== null && model !== null);

  return {
    provider: configured ? selected : null,
    geminiApiKey,
    model: selected === "fake" ? (model ?? "fake-model") : model,
    runnerEnabled: (env.AI_RUNNER_ENABLED?.trim().toLowerCase() ?? "true") !== "false",
    dailyJobLimit: integer(env, "AI_DAILY_JOB_LIMIT", 20, 1),
    concurrentJobLimit: integer(env, "AI_CONCURRENT_JOB_LIMIT", 2, 1),
    providerMinIntervalMs: integer(env, "AI_PROVIDER_MIN_INTERVAL_MS", 6000, 0),
  };
}
