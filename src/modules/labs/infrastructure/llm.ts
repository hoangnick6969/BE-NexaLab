import { TutorProviderError, type ProviderPayload, type StudentTutorProvider } from "../application/tutor-provider";

/**
 * SAI-01 adapters behind the StudentTutorProvider port. Only the allowlisted payload is sent; the application layer
 * owns the kill switch, budget, cache and guard. SG-2 is open: production keeps STUDENT_AI_LLM_ENABLED=false.
 */
export class AnthropicTutorProvider implements StudentTutorProvider {
  readonly name = "anthropic" as const;
  constructor(private readonly apiKey: string, readonly model: string, private readonly fetchImpl: typeof fetch = (...args) => fetch(...args)) {}

  async complete(input: { system: string; payload: ProviderPayload; signal: AbortSignal }) {
    let response: Response;
    try {
      response = await this.fetchImpl("https://api.anthropic.com/v1/messages", {
        method: "POST",
        signal: input.signal,
        headers: { "content-type": "application/json", "x-api-key": this.apiKey, "anthropic-version": "2023-06-01" },
        body: JSON.stringify({ model: this.model, max_tokens: 180, system: input.system, messages: [{ role: "user", content: JSON.stringify(input.payload) }] }),
      });
    } catch {
      throw new TutorProviderError(input.signal.aborted ? "TIMEOUT" : "HTTP_ERROR");
    }
    if (!response.ok) throw new TutorProviderError("HTTP_ERROR");
    let data: any;
    try { data = await response.json(); } catch { throw new TutorProviderError(input.signal.aborted ? "TIMEOUT" : "PARSE"); }
    const text = Array.isArray(data?.content) ? data.content.filter((item: any) => item?.type === "text").map((item: any) => item.text).join("") : null;
    if (typeof text !== "string" || !text) throw new TutorProviderError("PARSE");
    return text;
  }
}

/**
 * Deterministic test adapter (non-production only). STUDENT_AI_FAKE_OBSERVATION overrides the reply so a test can
 * inject unsafe output; `calls` lets tests assert cache hits make no provider call.
 */
export class FakeTutorProvider implements StudentTutorProvider {
  readonly name = "fake" as const;
  readonly model = "fake-tutor@1";
  calls = 0;
  constructor(private readonly reply?: string) {}

  async complete() {
    this.calls += 1;
    return JSON.stringify({ observation: this.reply ?? "Em thấy kết quả của engine thay đổi thế nào so với lần trước?" });
  }
}

/**
 * Chooses the adapter from env. `STUDENT_AI_PROVIDER=fake` refuses to start in production; `anthropic` needs
 * ANTHROPIC_API_KEY and ANTHROPIC_MODEL (no default model in code). Returns null when nothing is configured.
 */
export function createStudentTutorProvider(env: NodeJS.ProcessEnv = process.env): StudentTutorProvider | null {
  const kind = env.STUDENT_AI_PROVIDER ?? "anthropic";
  if (kind === "fake") {
    if (env.NODE_ENV === "production" || !["development", "test"].includes(env.APP_ENV ?? ""))
      throw new Error("STUDENT_AI_PROVIDER=fake is allowed only with APP_ENV development or test, never in production");
    return new FakeTutorProvider(env.STUDENT_AI_FAKE_OBSERVATION);
  }
  if (kind !== "anthropic") throw new Error(`Unknown STUDENT_AI_PROVIDER: ${kind}`);
  return env.ANTHROPIC_API_KEY && env.ANTHROPIC_MODEL ? new AnthropicTutorProvider(env.ANTHROPIC_API_KEY, env.ANTHROPIC_MODEL) : null;
}
