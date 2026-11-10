import { AiProviderError, type AiGenerateInput, type AiGenerateResult, type AiProvider } from "../application/ai-provider";

const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";
/** Finish reasons that mean the candidate was withheld, not that the model answered. */
const BLOCKED_FINISH = new Set(["SAFETY", "RECITATION", "BLOCKLIST", "PROHIBITED_CONTENT", "SPII", "LANGUAGE"]);

type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

/**
 * Planned Gemini adapter (not approved for live use until gate G-6, see provider-and-data-flow.md).
 * - The API key travels in a header, never in the URL, and no message ever carries prompt or output text.
 * - Each failure maps to one documented job failure code; the runner decides about retries.
 * - `fetchImpl` exists so tests exercise every status without a network.
 */
export class GeminiProvider implements AiProvider {
  readonly name = "gemini" as const;

  constructor(
    private readonly apiKey: string,
    private readonly model: string,
    private readonly fetchImpl: FetchLike = (url, init) => fetch(url, init),
  ) {}

  async generate(input: AiGenerateInput): Promise<AiGenerateResult> {
    let response: Response;
    try {
      response = await this.fetchImpl(`${ENDPOINT}/${encodeURIComponent(this.model)}:generateContent`, {
        method: "POST",
        signal: AbortSignal.timeout(input.timeoutMs),
        headers: { "content-type": "application/json", "x-goog-api-key": this.apiKey },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: input.system }] },
          contents: [{ role: "user", parts: [{ text: input.user }] }],
          generationConfig: {
            temperature: 0,
            maxOutputTokens: input.maxTokens,
            responseMimeType: "application/json",
            ...(input.responseSchema ? { responseSchema: input.responseSchema } : {}),
          },
        }),
      });
    } catch (error) {
      const name = (error as { name?: string })?.name;
      throw new AiProviderError(name === "TimeoutError" || name === "AbortError" ? "PROVIDER_TIMEOUT" : "PROVIDER_UNAVAILABLE");
    }

    if (response.status === 429 || response.status >= 500) throw new AiProviderError("PROVIDER_UNAVAILABLE", response.status);
    if (!response.ok) throw new AiProviderError("INTERNAL_ERROR", response.status);

    let data: any;
    try {
      data = await response.json();
    } catch (error) {
      const name = (error as { name?: string })?.name;
      // A body read aborted by the timeout is a timeout; a malformed body counts as unusable output.
      throw new AiProviderError(name === "TimeoutError" || name === "AbortError" ? "PROVIDER_TIMEOUT" : "OUTPUT_SCHEMA_INVALID");
    }

    const candidate = data?.candidates?.[0];
    if (data?.promptFeedback?.blockReason || !candidate || BLOCKED_FINISH.has(candidate.finishReason))
      throw new AiProviderError("OUTPUT_SCHEMA_INVALID");
    const text = (candidate.content?.parts ?? [])
      .map((part: { text?: unknown }) => (typeof part?.text === "string" ? part.text : ""))
      .join("");
    if (!text.trim()) throw new AiProviderError("OUTPUT_SCHEMA_INVALID");

    return {
      text,
      inputTokens: Number(data?.usageMetadata?.promptTokenCount) || 0,
      outputTokens: Number(data?.usageMetadata?.candidatesTokenCount) || 0,
      ...(typeof data?.responseId === "string" ? { requestId: data.responseId } : {}),
    };
  }
}
