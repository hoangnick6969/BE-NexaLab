/**
 * TAI-02 AI assessment gate (TAI2-T0). Shared configuration read by the `ai` module (requests, runner, evaluation) and
 * by the `classes` module (assisted grading, suggestion views), so it lives here and imports no module code.
 *
 * Gate G-2 is closed for development and test only, by a TEAM-LEAD decision recorded 2026-11-09 on the assumption of
 * PII scrubbing / anonymization. It is NOT an approval by the product owner, the supervising lecturer or a legal
 * reviewer. The policy below encodes exactly what that decision allows; boot fails for anything outside it.
 */
export type AiAssessmentMode = "off" | "shadow" | "assist";

/** Active prompt of ASSESS_SUBMISSION jobs (prompt-spec.md). A bump returns assist mode to shadow for the new version. */
export const ASSESS_SUBMISSION_PROMPT_VERSION = "assess-submission@1";
export const ASSESSMENT_SUGGESTION_SCHEMA_VERSION = "assessment-suggestion@1";

export type AssessmentPolicy = {
  id: string;
  recordedOn: string;
  recordedBy: string;
  basis: string;
  /** Provider adapters this policy covers. A provider outside the list refuses to boot with the gate enabled. */
  allowedProviders: ReadonlyArray<"fake" | "gemini">;
  /** When true, a submission needs an active ParentConsent (purpose `ai-assessment`) or it is skipped CONSENT_REQUIRED. */
  consentRequired: boolean;
  /** Whether the policy may run in production at all. */
  productionAllowed: boolean;
};

/**
 * Recorded policies. `g2-pii-scrub@1` mirrors the team-lead decision: only the AssessPromptPayload (lesson title,
 * prompt text, optional referenceAnswer, rubric with anchors, redacted response) may leave the server; no student or
 * class identifier is ever sent; the response is redacted and delimited as data; the provider payload builder fails
 * closed. It covers the deterministic fake adapter only (no live network call, no data leaves the machine), so it can
 * never run in production. A live provider needs a new policy record backed by PO and legal approval.
 */
export const ASSESSMENT_POLICIES: Readonly<Record<string, AssessmentPolicy>> = {
  "g2-pii-scrub@1": {
    id: "g2-pii-scrub@1",
    recordedOn: "2026-11-09",
    recordedBy: "team lead (not PO, lecturer or legal approval; awaiting legal and lecturer confirmation)",
    basis: "PII scrubbing/anonymization of the submission text plus the existing 3-layer privacy architecture",
    allowedProviders: ["fake"],
    consentRequired: false,
    productionAllowed: false,
  },
};

export type AssessmentEvaluationRecord = {
  promptVersion: string;
  /** SYNTHETIC records are harness proofs only; production requires a LECTURER record. */
  source: "SYNTHETIC" | "LECTURER";
  verdict: "PASS" | "FAIL";
  responses: number;
  report: string;
  recordedOn: string;
};

/**
 * Shadow-evaluation verdicts per prompt version (TAI2-T5). The SYNTHETIC entry is re-computed by
 * `assessment-evaluation.test.ts` from the synthetic set through the real pipeline, so this record cannot drift from
 * the code. No lecturer (real shadow) data has been collected.
 */
export const ASSESSMENT_EVALUATION_GATE: Readonly<Record<string, AssessmentEvaluationRecord>> = {
  "assess-submission@1": {
    promptVersion: "assess-submission@1",
    source: "SYNTHETIC",
    verdict: "PASS",
    responses: 120,
    report: "_bmad-output/implementation-artifacts/tai-02-shadow-evaluation.md",
    recordedOn: "2026-11-09",
  },
};

export type AiAssessmentConfig = {
  enabled: boolean;
  mode: AiAssessmentMode;
  policy: AssessmentPolicy | null;
  promptVersion: string;
  /** Submissions per teacher per rolling 24 h (AI_DAILY_ASSESSMENT_LIMIT). */
  dailyLimit: number;
};

export const AI_ASSESSMENT_CONFIG = Symbol("AI_ASSESSMENT_CONFIG");

const isProduction = (env: NodeJS.ProcessEnv) => env.APP_ENV === "production" || env.NODE_ENV === "production";

function integer(env: NodeJS.ProcessEnv, name: string, fallback: number, min: number): number {
  const raw = env[name]?.trim();
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < min) throw new Error(`${name} must be an integer >= ${min}`);
  return value;
}

/**
 * Parses and guards AI_ASSESSMENT_ENABLED (default false), AI_ASSESSMENT_MODE (off|shadow|assist, default off),
 * AI_ASSESSMENT_POLICY and AI_DAILY_ASSESSMENT_LIMIT. Boot fails when:
 * - the gate is enabled without a recorded policy id, or with a provider the policy does not cover;
 * - the policy forbids production and the process runs in production;
 * - a mode other than off is set while the gate is disabled;
 * - assist is set without a recorded PASS for the active prompt version (a SYNTHETIC pass is refused in production).
 * Errors name variables only, never values.
 */
export function parseAiAssessmentConfig(env: NodeJS.ProcessEnv, evaluations = ASSESSMENT_EVALUATION_GATE): AiAssessmentConfig {
  const enabledRaw = env.AI_ASSESSMENT_ENABLED?.trim().toLowerCase() || "false";
  if (enabledRaw !== "true" && enabledRaw !== "false") throw new Error("AI_ASSESSMENT_ENABLED must be true or false");
  const enabled = enabledRaw === "true";
  const modeRaw = env.AI_ASSESSMENT_MODE?.trim().toLowerCase() || "off";
  if (modeRaw !== "off" && modeRaw !== "shadow" && modeRaw !== "assist") throw new Error("AI_ASSESSMENT_MODE must be off, shadow or assist");
  const mode = modeRaw as AiAssessmentMode;
  const dailyLimit = integer(env, "AI_DAILY_ASSESSMENT_LIMIT", 200, 1);

  if (!enabled) {
    if (mode !== "off") throw new Error("AI_ASSESSMENT_MODE requires AI_ASSESSMENT_ENABLED=true (gate G-2 record)");
    return { enabled: false, mode: "off", policy: null, promptVersion: ASSESS_SUBMISSION_PROMPT_VERSION, dailyLimit };
  }
  const policyId = env.AI_ASSESSMENT_POLICY?.trim() || "";
  const policy = ASSESSMENT_POLICIES[policyId];
  if (!policy) throw new Error("AI_ASSESSMENT_ENABLED=true requires AI_ASSESSMENT_POLICY to name a recorded provider/legal policy");
  if (isProduction(env) && !policy.productionAllowed) throw new Error("AI_ASSESSMENT_POLICY does not allow production use");
  const provider = env.AI_PROVIDER?.trim().toLowerCase() || "";
  if (provider && !policy.allowedProviders.includes(provider as "fake" | "gemini"))
    throw new Error("AI_PROVIDER is not covered by AI_ASSESSMENT_POLICY; student text may not be sent to it");
  if (mode === "assist") {
    const record = evaluations[ASSESS_SUBMISSION_PROMPT_VERSION];
    if (!record || record.verdict !== "PASS")
      throw new Error("AI_ASSESSMENT_MODE=assist requires a recorded shadow-evaluation PASS for the active prompt version");
    if (record.source !== "LECTURER" && isProduction(env))
      throw new Error("AI_ASSESSMENT_MODE=assist in production requires a lecturer shadow-evaluation PASS, not a synthetic one");
  }
  return { enabled, mode, policy, promptVersion: ASSESS_SUBMISSION_PROMPT_VERSION, dailyLimit };
}

/** True when teacher routes may show suggestions (assist mode only). */
export const assistActive = (config: AiAssessmentConfig) => config.enabled && config.mode === "assist";
