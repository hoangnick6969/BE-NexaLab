import { describe, expect, it, vi } from "vitest";
import {
  guardHint, hintCacheKey, phraseHint, STUDENT_HINT_PROMPT_VERSION, studentAiConfig, studentHintPromptDigest,
  type HintPayload, type LlmStore,
} from "./student-llm";
import { AnthropicStudentProvider, createStudentAiProvider, FakeStudentProvider, GeminiStudentProvider } from "../infrastructure/providers";

const payload = (over: Partial<HintPayload> = {}): HintPayload => ({
  surface: "lab-checkpoint", context: { title: "Lưới thức ăn", step: "Khi mất rắn" }, level: 2, levelType: "Gợi ý khái niệm",
  mustAsk: false, ruleHint: "Ảnh hưởng trực tiếp đi theo mũi tên: mất kẻ ăn thì loài bị ăn bớt bị săn.", ...over,
});
const quiz = (over: Partial<HintPayload> = {}) => payload({
  surface: "lesson-quiz", context: { title: "Định luật Ôm" }, ruleHint: "Xem lại phần Đọc, đoạn nói về điện trở.",
  question: { prompt: "Khi tăng điện trở thì dòng điện sẽ?", options: ["Giảm", "Tăng", "Không đổi"] }, ...over,
});
const store = (calls = 0): LlmStore => ({ cached: async () => null, providerCallsLast24h: async () => calls });
const on = { ...studentAiConfig({ APP_ENV: "test", STUDENT_AI_LLM_ENABLED: "true" } as any) };
const reply = (hint: string) => new FakeStudentProvider(JSON.stringify({ hint }));

describe("student-hint@1 LLM layer (owner 2026-11-08: LLM writes, rules plan and fall back)", () => {
  it("pins the prompt version and digest", () => {
    expect(STUDENT_HINT_PROMPT_VERSION).toBe("student-hint@1");
    expect(studentHintPromptDigest()).toMatch(/^[0-9a-f]{64}$/);
  });

  it("honours the demo flag by APP_ENV even with production HTTP settings", () => {
    expect(studentAiConfig({ APP_ENV: "development", STUDENT_AI_LLM_ENABLED: "true" } as any).llmEnabled).toBe(true);
    expect(studentAiConfig({ APP_ENV: "pilot", STUDENT_AI_LLM_ENABLED: "true" } as any).llmEnabled).toBe(false);
    expect(studentAiConfig({ APP_ENV: "development", NODE_ENV: "production", STUDENT_AI_LLM_ENABLED: "true" } as any).llmEnabled).toBe(true);
    expect(studentAiConfig({ APP_ENV: "production", NODE_ENV: "production", STUDENT_AI_LLM_ENABLED: "true" } as any).llmEnabled).toBe(false);
    expect(studentAiConfig({ APP_ENV: "development" } as any)).toEqual({ llmEnabled: false, hintsPer10Min: 8, dailyProviderCalls: 60, providerTimeoutMs: 8000, cacheTtlDays: 30 });
  });

  it.each([
    ["not json", payload(), [], "PARSE"],
    [JSON.stringify({ hint: 3 }), payload(), [], "NOT_STRING"],
    [JSON.stringify({ hint: " " }), payload(), [], "EMPTY"],
    [JSON.stringify({ hint: "a".repeat(401) }), payload(), [], "TOO_LONG"],
    [JSON.stringify({ hint: "Ếch tăng khoảng 30 con?" }), payload(), [], "NUMBER_NOT_GROUNDED"],
    [JSON.stringify({ hint: "Thử nếm dung dịch xem sao?" }), payload(), [], "TOPIC"],
    [JSON.stringify({ hint: "Em đã đạt bước này." }), payload(), [], "VERDICT"],
    [JSON.stringify({ hint: "Đáp án là ếch tăng." }), payload(), [], "VERDICT"],
    [JSON.stringify({ hint: "Khi rắn mất thì ếch sẽ tăng nhé." }), payload(), [/ếch (sẽ )?(tăng|nhiều lên)/i], "LEAK"],
    [JSON.stringify({ hint: "Có phải dòng điện giảm không?" }), quiz(), [], "OPTION_NAMED"],
    [JSON.stringify({ hint: "Rắn là gì đối với ếch." }), payload({ mustAsk: true }), [], "NOT_QUESTION"],
  ])("guard rejects %s", (raw, p, forbidden, rule) => {
    expect(guardHint(raw as string, p as HintPayload, forbidden as RegExp[])).toEqual({ rule });
  });

  it("guard accepts grounded numbers, prompt words and fenced JSON", () => {
    const p = payload({ ruleHint: "Engine tính điện trở tối thiểu 350 Ω." });
    expect(guardHint(JSON.stringify({ hint: "Với nguồn này cần ít nhất 350 Ω, vì sao vậy?" }), p)).toEqual({ hint: "Với nguồn này cần ít nhất 350 Ω, vì sao vậy?" });
    expect(guardHint("```json\n" + JSON.stringify({ hint: "Điện trở ảnh hưởng thế nào tới dòng điện?" }) + "\n```", quiz())).toMatchObject({ hint: expect.any(String) });
  });

  it("kill switch → rules with DISABLED and no call; LLM text when on; cache hit without a call; budget fallback", async () => {
    const provider = reply("Mất kẻ ăn thì con mồi thay đổi thế nào?");
    expect(await phraseHint({ provider, config: studentAiConfig({}), store: store(), payload: payload() }))
      .toMatchObject({ provider: "rules", fallbackReason: "DISABLED", content: payload().ruleHint });
    expect(provider.calls).toBe(0);
    const fresh = await phraseHint({ provider, config: on, store: store(), payload: payload() });
    expect(fresh).toMatchObject({ provider: "fake", model: "fake-student@1", promptVersion: "student-hint@1", fallbackReason: null, content: "Mất kẻ ăn thì con mồi thay đổi thế nào?" });
    expect(fresh.cacheWrite?.key).toBe(hintCacheKey(payload(), "fake-student@1"));
    const hit = await phraseHint({ provider, config: on, payload: payload(), store: { cached: async () => ({ text: "Đã lưu?", model: "fake-student@1", promptVersion: "student-hint@1" }), providerCallsLast24h: async () => 999 } });
    expect(hit).toMatchObject({ provider: "cache", content: "Đã lưu?", cacheWrite: null });
    expect(await phraseHint({ provider, config: on, store: store(60), payload: payload() })).toMatchObject({ provider: "rules-fallback", fallbackReason: "BUDGET", model: null });
    expect(provider.calls).toBe(1);
  });

  it("a guarded output falls back to the rule text with the rule name", async () => {
    expect(await phraseHint({ provider: reply("Có phải dòng điện giảm không?"), config: on, store: store(), payload: quiz() }))
      .toMatchObject({ provider: "rules-fallback", fallbackReason: "GUARD:OPTION_NAMED", content: quiz().ruleHint, cacheWrite: null });
  });

  it("the payload carries no identity, IDs, key or draft", () => {
    expect(Object.keys(quiz()).sort()).toEqual(["context", "level", "levelType", "mustAsk", "question", "ruleHint", "surface"]);
    expect(JSON.stringify(quiz())).not.toMatch(/studentId|userId|attemptId|answerOptionId|correctOptionId|draft/);
  });

  it("maps adapter failures to TIMEOUT, HTTP_ERROR and PARSE and sends the payload unchanged", async () => {
    const run = (fetchImpl: any, timeoutMs = 8000) => phraseHint({
      provider: new AnthropicStudentProvider("key", "model-x", fetchImpl), config: { ...on, providerTimeoutMs: timeoutMs }, store: store(), payload: payload(),
    });
    expect((await run(async () => new Response("{}", { status: 429 }))).fallbackReason).toBe("HTTP_ERROR");
    expect((await run(async () => new Response("{}", { status: 503 }))).fallbackReason).toBe("HTTP_ERROR");
    expect((await run(async () => new Response("not json", { status: 200 }))).fallbackReason).toBe("PARSE");
    expect((await run(async () => new Response(JSON.stringify({ content: [{ type: "text", text: "plain" }] }), { status: 200 }))).fallbackReason).toBe("PARSE");
    const hanging = (_url: string, init: RequestInit) => new Promise<Response>((_resolve, reject) =>
      init.signal!.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError"))));
    expect((await run(hanging, 20)).fallbackReason).toBe("TIMEOUT");
    const ok = vi.fn(async () => new Response(JSON.stringify({ content: [{ type: "text", text: '{"hint":"Rắn là gì đối với ếch?"}' }] }), { status: 200 }));
    expect(await run(ok)).toMatchObject({ provider: "anthropic", content: "Rắn là gì đối với ếch?" });
    const sent = JSON.parse((ok.mock.calls[0] as any)[1].body);
    expect(JSON.parse(sent.messages[0].content)).toEqual(payload());
  });

  it("refuses the fake adapter outside development/test and needs a model for anthropic", () => {
    expect(() => createStudentAiProvider({ STUDENT_AI_PROVIDER: "fake", APP_ENV: "development", NODE_ENV: "production" } as any)).toThrow(/never in production/);
    expect(() => createStudentAiProvider({ STUDENT_AI_PROVIDER: "fake", APP_ENV: "pilot" } as any)).toThrow();
    expect(createStudentAiProvider({ STUDENT_AI_PROVIDER: "fake", APP_ENV: "test" } as any)?.name).toBe("fake");
    expect(createStudentAiProvider({ STUDENT_AI_PROVIDER: "anthropic", ANTHROPIC_API_KEY: "k" } as any)).toBeNull();
    expect(createStudentAiProvider({ STUDENT_AI_PROVIDER: "anthropic", ANTHROPIC_API_KEY: "k", ANTHROPIC_MODEL: "m" } as any)).toMatchObject({ name: "anthropic", model: "m" });
    // Gemini is the default provider (owner 2026-11-09).
    expect(createStudentAiProvider({ GEMINI_API_KEY: "k" } as any)).toBeNull();
    expect(createStudentAiProvider({ GEMINI_API_KEY: "k", GEMINI_MODEL: "g" } as any)).toMatchObject({ name: "gemini", model: "g" });
    expect(() => createStudentAiProvider({ STUDENT_AI_PROVIDER: "openai" } as any)).toThrow(/Unknown/);
  });

  it("Gemini adapter: system instruction, JSON output, thought parts dropped, failures mapped", async () => {
    const run = (fetchImpl: any) => phraseHint({ provider: new GeminiStudentProvider("gkey", "gemini-flash-x", fetchImpl), config: on, store: store(), payload: payload() });
    expect((await run(async () => new Response("{}", { status: 429 }))).fallbackReason).toBe("HTTP_ERROR");
    expect((await run(async () => new Response("not json", { status: 200 }))).fallbackReason).toBe("PARSE");
    expect((await run(async () => new Response(JSON.stringify({ candidates: [{ finishReason: "SAFETY" }] }), { status: 200 }))).fallbackReason).toBe("PARSE");
    const ok = vi.fn(async () => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: "nghĩ...", thought: true }, { text: '{"hint":"Rắn là gì đối với ếch?"}' }] } }] }), { status: 200 }));
    expect(await run(ok)).toMatchObject({ provider: "gemini", model: "gemini-flash-x", content: "Rắn là gì đối với ếch?" });
    const [url, init] = ok.mock.calls[0] as any;
    expect(url).toBe("https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-x:generateContent");
    expect(init.headers["x-goog-api-key"]).toBe("gkey");
    const sent = JSON.parse(init.body);
    expect(sent.systemInstruction.parts[0].text).toContain("gợi ý");
    expect(JSON.parse(sent.contents[0].parts[0].text)).toEqual(payload());
    expect(sent.generationConfig).toMatchObject({ responseMimeType: "application/json", thinkingConfig: { thinkingLevel: "minimal" } });
  });
});
