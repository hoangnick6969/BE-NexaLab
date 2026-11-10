/**
 * TAI-06 lab-challenge drafting limits. Read only from the environment; imports no module code.
 * Quota is counted per actor and per purpose (job-runtime-and-failure-modes.md "Quota"), so DRAFT_LAB_CHALLENGE never
 * consumes the GENERATE_RESOURCE or ASSESS_SUBMISSION quota. The defaults are team-lead choices (2026-11-09), not a
 * measured or approved figure.
 */
export const AI_LAB_CHALLENGE_CONFIG = Symbol("AI_LAB_CHALLENGE_CONFIG");

export type AiLabChallengeConfig = { dailyLimit: number; concurrentLimit: number };

function integer(env: NodeJS.ProcessEnv, name: string, fallback: number): number {
  const raw = env[name]?.trim();
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1) throw new Error(`${name} must be an integer >= 1`);
  return value;
}

/** AI_LAB_CHALLENGE_DAILY_LIMIT (default 10) and AI_LAB_CHALLENGE_CONCURRENT_LIMIT (default 2). Errors name variables only. */
export function parseAiLabChallengeConfig(env: NodeJS.ProcessEnv): AiLabChallengeConfig {
  return {
    dailyLimit: integer(env, "AI_LAB_CHALLENGE_DAILY_LIMIT", 10),
    concurrentLimit: integer(env, "AI_LAB_CHALLENGE_CONCURRENT_LIMIT", 2),
  };
}
