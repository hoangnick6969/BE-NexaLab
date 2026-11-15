/**
 * TAI-05 AI credits configuration. Shared by the `ai` module (lifecycle, estimate, admin) and read only from the
 * environment; it imports no module code.
 *
 * Gate G-3 is closed for development and test by a TEAM-LEAD decision recorded 2026-11-09 on the assumption of a
 * baseline token-to-credit rate and default pricing tiers. It is NOT an approval by the product owner and no month of
 * measured usage exists. The defaults below are that baseline. Prices live in `PricingVersion` rows (an admin can
 * create and activate a new version at any time, no code change); the baseline only seeds version 1 of a purpose that
 * has no row yet, and every value can be overridden through the environment before that first seed.
 */
export const AI_CREDITS_CONFIG = Symbol("AI_CREDITS_CONFIG");

export const PRICED_PURPOSES = ["GENERATE_RESOURCE", "ASSESS_SUBMISSION", "DRAFT_LAB_CHALLENGE", "GENERATE_ASSESSMENT"] as const;
export type PricedPurpose = (typeof PRICED_PURPOSES)[number];

export type BaselinePrice = {
  baseCredits: number;
  perItemCredits: number;
  creditsPer1kInputTokens: number;
  creditsPer1kOutputTokens: number;
};

/** Path of the pricing evidence note written into every baseline PricingVersion. */
export const BASELINE_EVIDENCE_REF = "_bmad-output/specs/spec-teacher-ai-credits/tai-05-pricing-evidence.md";

/**
 * Team-lead baseline 2026-11-09, pending one month of measured usage.
 * GENERATE_RESOURCE: estimate = 2 + 1 x requested items, so 10 questions is 12 credits (the SPEC success signal).
 * ASSESS_SUBMISSION: estimate = 2 + 3 x 1 submission = 5 credits per submission.
 * Token rates: 2 credits per 1000 input tokens and 3 per 1000 output tokens for both purposes.
 */
export const BASELINE_PRICES: Readonly<Record<PricedPurpose, BaselinePrice>> = {
  GENERATE_RESOURCE: { baseCredits: 2, perItemCredits: 1, creditsPer1kInputTokens: 2, creditsPer1kOutputTokens: 3 },
  ASSESS_SUBMISSION: { baseCredits: 2, perItemCredits: 3, creditsPer1kInputTokens: 2, creditsPer1kOutputTokens: 3 },
  // TAI-06 (team-lead baseline 2026-11-09): estimate = 2 + 2 x requested proposals, so 3 proposals is 8 credits.
  DRAFT_LAB_CHALLENGE: { baseCredits: 2, perItemCredits: 2, creditsPer1kInputTokens: 2, creditsPer1kOutputTokens: 3 },
  // TAI7-T5 (team-lead baseline 2026-11-15): estimate = 4 + 1 x slots, so a 15-minute paper of 7 slots is 11 credits and a
  // 45-minute paper of 13 slots is 17. Rubrics and a larger prompt cost more tokens, hence the higher base.
  GENERATE_ASSESSMENT: { baseCredits: 4, perItemCredits: 1, creditsPer1kInputTokens: 2, creditsPer1kOutputTokens: 3 },
};

export type AiCreditsConfig = {
  /** AI_CREDITS_ENABLED (default false). False leaves TAI-01 behaviour exactly as specified. */
  enabled: boolean;
  /** AI_CREDITS_SEED_BASELINE (default true): when enabled, boot seeds PricingVersion 1 for a purpose with no row. */
  seedBaseline: boolean;
  baseline: Readonly<Record<PricedPurpose, BaselinePrice>>;
  evidenceRef: string;
};

function bool(env: NodeJS.ProcessEnv, name: string, fallback: boolean): boolean {
  const raw = env[name]?.trim().toLowerCase();
  if (!raw) return fallback;
  if (raw !== "true" && raw !== "false") throw new Error(`${name} must be true or false`);
  return raw === "true";
}

function integer(env: NodeJS.ProcessEnv, name: string, fallback: number): number {
  const raw = env[name]?.trim();
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 0 || value > 100_000) throw new Error(`${name} must be an integer between 0 and 100000`);
  return value;
}

/**
 * Parses AI_CREDITS_ENABLED, AI_CREDITS_SEED_BASELINE, AI_CREDITS_EVIDENCE_REF and the per-purpose baseline overrides
 * `AI_CREDITS_<PURPOSE>_BASE`, `_PER_ITEM`, `_IN_1K`, `_OUT_1K` (for example AI_CREDITS_GENERATE_RESOURCE_PER_ITEM).
 * Errors name variables only, never values.
 */
export function parseAiCreditsConfig(env: NodeJS.ProcessEnv): AiCreditsConfig {
  const baseline = Object.fromEntries(
    PRICED_PURPOSES.map((purpose) => {
      const fallback = BASELINE_PRICES[purpose];
      const p = `AI_CREDITS_${purpose}`;
      return [
        purpose,
        {
          baseCredits: integer(env, `${p}_BASE`, fallback.baseCredits),
          perItemCredits: integer(env, `${p}_PER_ITEM`, fallback.perItemCredits),
          creditsPer1kInputTokens: integer(env, `${p}_IN_1K`, fallback.creditsPer1kInputTokens),
          creditsPer1kOutputTokens: integer(env, `${p}_OUT_1K`, fallback.creditsPer1kOutputTokens),
        },
      ];
    }),
  ) as Record<PricedPurpose, BaselinePrice>;
  const evidenceRef = env.AI_CREDITS_EVIDENCE_REF?.trim() || BASELINE_EVIDENCE_REF;
  if (evidenceRef.length > 300) throw new Error("AI_CREDITS_EVIDENCE_REF must be at most 300 characters");
  return {
    enabled: bool(env, "AI_CREDITS_ENABLED", false),
    seedBaseline: bool(env, "AI_CREDITS_SEED_BASELINE", true),
    baseline,
    evidenceRef,
  };
}
