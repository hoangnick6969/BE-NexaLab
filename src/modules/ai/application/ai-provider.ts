/**
 * Provider port shared by every Teacher AI purpose (job-runtime-and-failure-modes.md). Adapters live in
 * `infrastructure/`; application code only sees this interface, so the runner is testable without a network.
 */
export type AiProviderName = "gemini" | "fake";

/** Job `failureCode` values an adapter may raise (implementation-contract.md, "Error codes"). */
export type AiProviderFailureCode =
  | "PROVIDER_UNAVAILABLE"
  | "PROVIDER_TIMEOUT"
  | "OUTPUT_SCHEMA_INVALID"
  | "INTERNAL_ERROR";

export type AiGenerateInput = {
  system: string;
  user: string;
  maxTokens: number;
  timeoutMs: number;
  /** Transport hint only. The server's strict parse and validation rules stay the authority. */
  responseSchema?: Record<string, unknown>;
};

export type AiGenerateResult = {
  text: string;
  inputTokens: number;
  outputTokens: number;
  requestId?: string;
};

export interface AiProvider {
  readonly name: AiProviderName;
  generate(input: AiGenerateInput): Promise<AiGenerateResult>;
}

/**
 * Carries only a failure code and a fixed message. It never includes prompt text, provider output or
 * credentials, so it is safe to log (retention rule: logs hold ids, status and token counts only).
 */
export class AiProviderError extends Error {
  constructor(readonly code: AiProviderFailureCode, readonly httpStatus?: number) {
    super(httpStatus === undefined ? code : `${code} (HTTP ${httpStatus})`);
    this.name = "AiProviderError";
  }
}

/** Retryable codes per the job state machine: a second attempt is allowed while attemptCount < 2. */
export const RETRYABLE_FAILURE_CODES: ReadonlySet<AiProviderFailureCode> = new Set([
  "PROVIDER_UNAVAILABLE",
  "PROVIDER_TIMEOUT",
  "OUTPUT_SCHEMA_INVALID",
]);

export const AI_PROVIDER = Symbol("AI_PROVIDER");
export const AI_CONFIG = Symbol("AI_CONFIG");
