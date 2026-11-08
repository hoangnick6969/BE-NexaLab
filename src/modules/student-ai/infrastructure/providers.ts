import { StudentAiProviderError, type StudentAiProvider } from "../application/student-llm";

/** Anthropic Messages API adapter. Only the allowlisted payload built by the application layer is sent. */
export class AnthropicStudentProvider implements StudentAiProvider {
  readonly name = "anthropic" as const;
  constructor(private readonly apiKey: string, readonly model: string, private readonly fetchImpl: typeof fetch = (...args) => fetch(...args)) {}

  async complete(input: { system: string; user: string; signal: AbortSignal; maxTokens?: number }) {
    let response: Response;
    try {
      response = await this.fetchImpl("https://api.anthropic.com/v1/messages", {
        method: "POST",
        signal: input.signal,
        headers: { "content-type": "application/json", "x-api-key": this.apiKey, "anthropic-version": "2023-06-01" },
        body: JSON.stringify({ model: this.model, max_tokens: input.maxTokens ?? 300, system: input.system, messages: [{ role: "user", content: input.user }] }),
      });
    } catch {
      throw new StudentAiProviderError(input.signal.aborted ? "TIMEOUT" : "HTTP_ERROR");
    }
    if (!response.ok) throw new StudentAiProviderError("HTTP_ERROR");
    let data: any;
    try { data = await response.json(); } catch { throw new StudentAiProviderError(input.signal.aborted ? "TIMEOUT" : "PARSE"); }
    const text = Array.isArray(data?.content) ? data.content.filter((item: any) => item?.type === "text").map((item: any) => item.text).join("") : null;
    if (typeof text !== "string" || !text) throw new StudentAiProviderError("PARSE");
    return text;
  }
}

/**
 * Deterministic adapter for development and tests. Hints: rewrites the rule text (and turns it into a question when
 * asked). Chat: answers from `STUDENT_AI_FAKE_REPLY` or a fixed Socratic question. `calls` counts provider calls.
 */
export class FakeStudentProvider implements StudentAiProvider {
  readonly name = "fake" as const;
  readonly model = "fake-student@1";
  calls = 0;
  constructor(private readonly reply?: string) {}

  async complete(input: { system: string; user: string }) {
    this.calls += 1;
    if (this.reply !== undefined) return this.reply;
    let payload: any = null;
    try { payload = JSON.parse(input.user); } catch { /* chat turns are not JSON */ }
    if (payload && typeof payload.ruleHint === "string") {
      const base = payload.ruleHint.trim();
      return JSON.stringify({ hint: payload.mustAsk && !base.endsWith("?") ? `${base} Em thử nghĩ xem vì sao?` : `Gợi ý: ${base}` });
    }
    if (payload && typeof payload.message === "string")
      return JSON.stringify({ onTopic: true, reply: "Em thử nhớ lại bài học: hiện tượng này liên quan tới khái niệm nào em đã học?" });
    return JSON.stringify({ summary: "Em hãy đọc lại từng bước bên dưới để thấy bước nào đã làm tốt." });
  }
}

/**
 * Chooses the adapter from env. `STUDENT_AI_PROVIDER=fake` refuses to start outside APP_ENV development/test;
 * `anthropic` needs ANTHROPIC_API_KEY and ANTHROPIC_MODEL (no default model in code). Null when nothing is configured.
 */
export function createStudentAiProvider(env: NodeJS.ProcessEnv = process.env): StudentAiProvider | null {
  const kind = env.STUDENT_AI_PROVIDER ?? "anthropic";
  if (kind === "fake") {
    if (env.NODE_ENV === "production" || !["development", "test"].includes(env.APP_ENV ?? ""))
      throw new Error("STUDENT_AI_PROVIDER=fake is allowed only with APP_ENV development or test, never in production");
    return new FakeStudentProvider(env.STUDENT_AI_FAKE_REPLY);
  }
  if (kind !== "anthropic") throw new Error(`Unknown STUDENT_AI_PROVIDER: ${kind}`);
  return env.ANTHROPIC_API_KEY && env.ANTHROPIC_MODEL ? new AnthropicStudentProvider(env.ANTHROPIC_API_KEY, env.ANTHROPIC_MODEL) : null;
}
