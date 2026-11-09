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
 * Google Gemini API adapter (owner 2026-11-09: "Chuyển sang dùng Gemini Flash"). Only the allowlisted payload is sent.
 * The prompts ask for JSON, so the response MIME type is JSON. Thinking defaults to `minimal` (GEMINI_THINKING_LEVEL):
 * measured 2026-11-09 on gemini-3.5-flash, default thinking took 8.3 s (over the 8 s timeout), minimal 2.4 s. Thinking
 * tokens count against the output limit, hence the headroom; thought parts are dropped. Note: the Gemini API Additional Terms bar apps directed to or
 * likely used by people under 18; recorded under SG-2, dev/test only until it closes.
 */
export class GeminiStudentProvider implements StudentAiProvider {
  readonly name = "gemini" as const;
  constructor(private readonly apiKey: string, readonly model: string, private readonly fetchImpl: typeof fetch = (...args) => fetch(...args),
    private readonly thinkingLevel = "minimal") {}

  async complete(input: { system: string; user: string; signal: AbortSignal; maxTokens?: number }) {
    let response: Response;
    try {
      response = await this.fetchImpl(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(this.model)}:generateContent`, {
        method: "POST",
        signal: input.signal,
        headers: { "content-type": "application/json", "x-goog-api-key": this.apiKey },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: input.system }] },
          contents: [{ role: "user", parts: [{ text: input.user }] }],
          generationConfig: { maxOutputTokens: (input.maxTokens ?? 300) + 1024, responseMimeType: "application/json", thinkingConfig: { thinkingLevel: this.thinkingLevel } },
        }),
      });
    } catch {
      throw new StudentAiProviderError(input.signal.aborted ? "TIMEOUT" : "HTTP_ERROR");
    }
    if (!response.ok) throw new StudentAiProviderError("HTTP_ERROR");
    let data: any;
    try { data = await response.json(); } catch { throw new StudentAiProviderError(input.signal.aborted ? "TIMEOUT" : "PARSE"); }
    const parts = data?.candidates?.[0]?.content?.parts;
    const text = Array.isArray(parts) ? parts.filter((part: any) => typeof part?.text === "string" && !part.thought).map((part: any) => part.text).join("") : null;
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
 * Chooses the adapter from env (default `gemini`). `STUDENT_AI_PROVIDER=fake` refuses to start outside APP_ENV
 * development/test; `gemini` needs GEMINI_API_KEY and GEMINI_MODEL, `anthropic` needs ANTHROPIC_API_KEY and
 * ANTHROPIC_MODEL (no default model in code). Null when the chosen provider has no credentials.
 */
export function createStudentAiProvider(env: NodeJS.ProcessEnv = process.env): StudentAiProvider | null {
  const kind = env.STUDENT_AI_PROVIDER ?? "gemini";
  if (kind === "fake") {
    if (env.NODE_ENV === "production" || !["development", "test"].includes(env.APP_ENV ?? ""))
      throw new Error("STUDENT_AI_PROVIDER=fake is allowed only with APP_ENV development or test, never in production");
    return new FakeStudentProvider(env.STUDENT_AI_FAKE_REPLY);
  }
  if (kind === "gemini") return env.GEMINI_API_KEY && env.GEMINI_MODEL ? new GeminiStudentProvider(env.GEMINI_API_KEY, env.GEMINI_MODEL, undefined, env.GEMINI_THINKING_LEVEL || "minimal") : null;
  if (kind !== "anthropic") throw new Error(`Unknown STUDENT_AI_PROVIDER: ${kind}`);
  return env.ANTHROPIC_API_KEY && env.ANTHROPIC_MODEL ? new AnthropicStudentProvider(env.ANTHROPIC_API_KEY, env.ANTHROPIC_MODEL) : null;
}
