import { describe, expect, it, vi } from "vitest";
import { AiProviderError } from "../application/ai-provider";
import { GeminiProvider } from "./gemini-provider";

const input = { system: "SYSTEM-TEXT", user: "USER-TEXT", maxTokens: 100, timeoutMs: 5000 };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const ok = (text = '{"items":[]}') => json({ candidates: [{ content: { parts: [{ text }] }, finishReason: "STOP" }], usageMetadata: { promptTokenCount: 11, candidatesTokenCount: 7 }, responseId: "resp-1" });
const provider = (fetchImpl: any) => new GeminiProvider("test-key-123", "test-model", fetchImpl);
const failure = async (p: GeminiProvider) => p.generate(input).then(() => null, (error) => error as AiProviderError);

describe("GeminiProvider error mapping", () => {
  it("returns text, token usage and request id on 200", async () => {
    await expect(provider(async () => ok()).generate(input)).resolves.toEqual({ text: '{"items":[]}', inputTokens: 11, outputTokens: 7, requestId: "resp-1" });
  });

  it("joins multi-part text and defaults missing usage to 0", async () => {
    const response = json({ candidates: [{ content: { parts: [{ text: "{" }, { text: "}" }] } }] });
    await expect(provider(async () => response).generate(input)).resolves.toMatchObject({ text: "{}", inputTokens: 0, outputTokens: 0 });
  });

  it.each([429, 500, 502, 503])("maps HTTP %s to PROVIDER_UNAVAILABLE", async (status) => {
    const error = await failure(provider(async () => json({ error: "x" }, status)));
    expect(error).toBeInstanceOf(AiProviderError);
    expect(error?.code).toBe("PROVIDER_UNAVAILABLE");
  });

  it.each([400, 401, 403, 404])("maps other 4xx (%s) to non-retryable INTERNAL_ERROR", async (status) => {
    expect((await failure(provider(async () => json({ error: "x" }, status))))?.code).toBe("INTERNAL_ERROR");
  });

  it.each(["TimeoutError", "AbortError"])("maps %s to PROVIDER_TIMEOUT", async (name) => {
    const error = await failure(provider(async () => { throw Object.assign(new Error("aborted"), { name }); }));
    expect(error?.code).toBe("PROVIDER_TIMEOUT");
  });

  it("maps other network errors to PROVIDER_UNAVAILABLE", async () => {
    expect((await failure(provider(async () => { throw new TypeError("fetch failed"); })))?.code).toBe("PROVIDER_UNAVAILABLE");
  });

  it("maps a real timeout signal to PROVIDER_TIMEOUT", async () => {
    const slow = (_url: string, init: RequestInit) => new Promise<Response>((_resolve, reject) => init.signal!.addEventListener("abort", () => reject(init.signal!.reason)));
    const error = await provider(slow).generate({ ...input, timeoutMs: 20 }).then(() => null, (e) => e as AiProviderError);
    expect(error?.code).toBe("PROVIDER_TIMEOUT");
  });

  it.each([
    ["prompt blocked", { promptFeedback: { blockReason: "SAFETY" } }],
    ["no candidates", { candidates: [] }],
    ["candidate blocked", { candidates: [{ finishReason: "SAFETY", content: { parts: [{ text: "x" }] } }] }],
    ["empty text", { candidates: [{ content: { parts: [{ text: "   " }] }, finishReason: "STOP" }] }],
    ["no parts", { candidates: [{ finishReason: "STOP" }] }],
  ])("maps a blocked or empty response (%s) to OUTPUT_SCHEMA_INVALID", async (_label, body) => {
    expect((await failure(provider(async () => json(body))))?.code).toBe("OUTPUT_SCHEMA_INVALID");
  });

  it("maps a malformed 200 body to OUTPUT_SCHEMA_INVALID", async () => {
    expect((await failure(provider(async () => new Response("<html>", { status: 200 }))))?.code).toBe("OUTPUT_SCHEMA_INVALID");
  });
});

describe("GeminiProvider request and secrecy", () => {
  it("sends the key in a header, not the URL, and asks for temperature 0 JSON output", async () => {
    const fetchImpl = vi.fn(async () => ok());
    await provider(fetchImpl).generate({ ...input, responseSchema: { type: "OBJECT" } });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://generativelanguage.googleapis.com/v1beta/models/test-model:generateContent");
    expect(url).not.toContain("test-key-123");
    expect((init.headers as Record<string, string>)["x-goog-api-key"]).toBe("test-key-123");
    const body = JSON.parse(init.body as string);
    expect(body.systemInstruction.parts[0].text).toBe("SYSTEM-TEXT");
    expect(body.contents[0].parts[0].text).toBe("USER-TEXT");
    expect(body.generationConfig).toMatchObject({ temperature: 0, maxOutputTokens: 100, responseMimeType: "application/json", responseSchema: { type: "OBJECT" } });
  });

  it("omits responseSchema when none is given", async () => {
    const fetchImpl = vi.fn(async () => ok());
    await provider(fetchImpl).generate(input);
    expect(JSON.parse((fetchImpl.mock.calls[0] as any)[1].body).generationConfig).not.toHaveProperty("responseSchema");
  });

  it("never puts prompt text, output text or the key in an error", async () => {
    const error = await failure(provider(async () => json({ error: { message: "echo USER-TEXT test-key-123" } }, 400)));
    const printed = `${error?.message} ${error?.stack?.split("\n")[0]}`;
    expect(printed).not.toMatch(/USER-TEXT|SYSTEM-TEXT|test-key-123/);
  });
});
