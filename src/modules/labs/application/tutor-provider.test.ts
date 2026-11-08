import { describe, expect, it, vi } from "vitest";
import {
  buildProviderPayload, guardObservation, observationCacheKey, resolveObservation, studentAiConfig, TUTOR_OBSERVATION_PROMPT_VERSION,
  tutorPromptDigest, type ObservationStore, type ProviderPayload, type StudentTutorProvider,
} from "./tutor-provider";
import { AnthropicTutorProvider, createStudentTutorProvider, FakeTutorProvider } from "../infrastructure/llm";

const payload = (level: 1 | 2 | 3 | 4 = 3): ProviderPayload => buildProviderPayload({
  objective: "Làm LED sáng an toàn", labState: { nodes: [], edges: [] },
  simulation: { status: "LED_OVERLOAD", current: 0.027, minimumResistance: 350, verdict: "partial" }, level, templateHint: "Thử tăng điện trở rồi chạy lại.",
});
const emptyStore = (calls = 0): ObservationStore => ({ cached: async () => null, providerCallsLast24h: async () => calls });
const enabled = { ...studentAiConfig({}), llmEnabled: true };
const cacheKeyInput = { challengeId: "circuit_001", labDigest: "d", key: "LED_OVERLOAD" as const, level: 3 as const };

describe("tutor-observation@1 provider path (SAI-01 T2/T3)", () => {
  it("pins the prompt and sends only the allowlisted payload keys", () => {
    expect(TUTOR_OBSERVATION_PROMPT_VERSION).toBe("tutor-observation@1");
    expect(tutorPromptDigest()).toBe("9c48af1709f07f9a84484ab7226be1374f85c0f62d7d939a7fc55519f7d05048");
    const body = payload();
    expect(Object.keys(body).sort()).toEqual(["challengeObjective", "engine", "hintLevel", "labState", "templateHint"]);
    expect(body.engine).toEqual({ status: "LED_OVERLOAD" });
    expect(JSON.stringify(body)).not.toMatch(/studentLevel|userId|attemptId|current|minimumResistance/);
  });

  it("defaults to the kill switch off and the hint-rules.md limits", () => {
    expect(studentAiConfig({})).toEqual({ llmEnabled: false, hintsPer10Min: 8, dailyProviderCalls: 20, providerTimeoutMs: 8000, cacheTtlDays: 30 });
  });

  it.each([
    ["not json", "PARSE"],
    [JSON.stringify({ observation: 3 }), "NOT_STRING"],
    [JSON.stringify({ observation: "  " }), "EMPTY"],
    [JSON.stringify({ observation: "Vì sao".repeat(60) + "?" }), "TOO_LONG"],
    [JSON.stringify({ observation: "Dùng 9 V nhé?" }), "NUMERIC"],
    [JSON.stringify({ observation: "Có nên thử với điện lưới không?" }), "TOPIC"],
    [JSON.stringify({ observation: "Em đã đạt rồi phải không?" }), "VERDICT"],
    [JSON.stringify({ observation: "Hãy tăng điện trở." }), "NOT_QUESTION"],
  ])("guard rejects %s with %s", (raw, rule) => {
    expect(guardObservation(raw)).toEqual({ rule });
  });

  it("guard accepts one short question", () => {
    expect(guardObservation(JSON.stringify({ observation: "Điện trở làm gì với dòng điện qua LED?" })))
      .toEqual({ observation: "Điện trở làm gì với dòng điện qua LED?" });
  });

  it("levels 1–2 never call the provider; the kill switch records DISABLED", async () => {
    const provider = new FakeTutorProvider();
    expect(await resolveObservation({ provider, config: enabled, store: emptyStore(), payload: payload(2), cacheKeyInput }))
      .toMatchObject({ provider: "rules", fallbackReason: null });
    expect(await resolveObservation({ provider, config: studentAiConfig({}), store: emptyStore(), payload: payload(3), cacheKeyInput }))
      .toMatchObject({ provider: "rules", fallbackReason: "DISABLED", content: "Thử tăng điện trở rồi chạy lại." });
    expect(provider.calls).toBe(0);
  });

  it("prepends a guarded observation, serves a cache hit without a call, and falls back on budget", async () => {
    const provider = new FakeTutorProvider("Điều gì giới hạn dòng điện qua LED?");
    const fresh = await resolveObservation({ provider, config: enabled, store: emptyStore(), payload: payload(), cacheKeyInput });
    expect(fresh).toMatchObject({ provider: "fake", model: "fake-tutor@1", promptVersion: "tutor-observation@1", fallbackReason: null,
      content: "Điều gì giới hạn dòng điện qua LED?\n\nThử tăng điện trở rồi chạy lại." });
    expect(fresh.cacheWrite?.key).toBe(observationCacheKey({ ...cacheKeyInput, promptVersion: "tutor-observation@1", model: "fake-tutor@1" }));
    const hit = await resolveObservation({ provider, config: enabled, payload: payload(), cacheKeyInput,
      store: { cached: async () => ({ observation: "Đã lưu?", model: "fake-tutor@1", promptVersion: "tutor-observation@1" }), providerCallsLast24h: async () => 99 } });
    expect(hit).toMatchObject({ provider: "cache", cacheWrite: null, content: "Đã lưu?\n\nThử tăng điện trở rồi chạy lại." });
    expect(await resolveObservation({ provider, config: enabled, store: emptyStore(20), payload: payload(), cacheKeyInput }))
      .toMatchObject({ provider: "rules-fallback", fallbackReason: "BUDGET" });
    expect(await resolveObservation({ provider, config: enabled, store: emptyStore(19), payload: payload(), cacheKeyInput }))
      .toMatchObject({ provider: "fake" });
    expect(provider.calls).toBe(2);
  });

  it("an unsafe observation falls back with the guard rule", async () => {
    const outcome = await resolveObservation({ provider: new FakeTutorProvider("Dùng 9 V nhé?"), config: enabled, store: emptyStore(), payload: payload(), cacheKeyInput });
    expect(outcome).toMatchObject({ provider: "rules-fallback", fallbackReason: "GUARD:NUMERIC", cacheWrite: null, content: "Thử tăng điện trở rồi chạy lại." });
  });

  it("maps adapter failures to TIMEOUT, HTTP_ERROR and PARSE", async () => {
    const run = (fetchImpl: any, timeoutMs = 8000) => resolveObservation({
      provider: new AnthropicTutorProvider("key", "model-x", fetchImpl), config: { ...enabled, providerTimeoutMs: timeoutMs }, store: emptyStore(), payload: payload(), cacheKeyInput,
    });
    expect((await run(async () => new Response("{}", { status: 429 }))).fallbackReason).toBe("HTTP_ERROR");
    expect((await run(async () => new Response("{}", { status: 503 }))).fallbackReason).toBe("HTTP_ERROR");
    expect((await run(async () => new Response("not json", { status: 200 }))).fallbackReason).toBe("PARSE");
    expect((await run(async () => new Response(JSON.stringify({ content: [{ type: "text", text: "plain" }] }), { status: 200 }))).fallbackReason).toBe("PARSE");
    const hanging = (_url: string, init: RequestInit) => new Promise<Response>((_resolve, reject) =>
      init.signal!.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError"))));
    expect((await run(hanging, 20)).fallbackReason).toBe("TIMEOUT");
    const ok = vi.fn(async () => new Response(JSON.stringify({ content: [{ type: "text", text: '{"observation":"Dòng điện đang lớn hay nhỏ?"}' }] }), { status: 200 }));
    expect(await run(ok)).toMatchObject({ provider: "anthropic", model: "model-x" });
    const sent = JSON.parse((ok.mock.calls[0] as any)[1].body);
    expect(Object.keys(JSON.parse(sent.messages[0].content)).sort()).toEqual(["challengeObjective", "engine", "hintLevel", "labState", "templateHint"]);
  });

  it("refuses the fake adapter outside development/test and needs a model for anthropic", () => {
    expect(() => createStudentTutorProvider({ STUDENT_AI_PROVIDER: "fake", APP_ENV: "development", NODE_ENV: "production" } as any)).toThrow(/never in production/);
    expect(() => createStudentTutorProvider({ STUDENT_AI_PROVIDER: "fake", APP_ENV: "pilot" } as any)).toThrow();
    expect(createStudentTutorProvider({ STUDENT_AI_PROVIDER: "fake", APP_ENV: "test" } as any)?.name).toBe("fake");
    expect(createStudentTutorProvider({ ANTHROPIC_API_KEY: "k" } as any)).toBeNull();
    const provider = createStudentTutorProvider({ ANTHROPIC_API_KEY: "k", ANTHROPIC_MODEL: "m" } as any) as StudentTutorProvider;
    expect(provider).toMatchObject({ name: "anthropic", model: "m" });
  });
});
