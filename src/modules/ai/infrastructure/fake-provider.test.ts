import { describe, expect, it } from "vitest";
import { AiProviderError } from "../application/ai-provider";
import { parseAiConfig } from "../application/ai-config";
import { buildGenerateResourceUser, GENERATE_RESOURCE_SYSTEM, type InputSnapshotV1 } from "../application/generate-resource-prompt";
import { createAiProvider } from "./create-provider";
import { FakeAiProvider } from "./fake-provider";
import { GeminiProvider } from "./gemini-provider";

const snapshot = (targetKind: string, itemCount: number, difficulty: string | null = null): InputSnapshotV1 => ({
  lesson: { id: "lesson-circuit", title: "Mạch điện", grade: 8, domain: "ENERGY", topic: "Dòng điện", learningObjective: "Hiểu" },
  passages: [{ id: "P1", text: "a" }, { id: "P2", text: "b" }],
  outcomes: [{ code: "KHTN8.E1", statement: "s" }],
  constraints: { targetKind, itemCount, difficulty },
  instruction: null,
});
const call = (fake: FakeAiProvider, s: InputSnapshotV1) =>
  fake.generate({ system: GENERATE_RESOURCE_SYSTEM, user: buildGenerateResourceUser(s), maxTokens: 100, timeoutMs: 1000 });

describe("FakeAiProvider", () => {
  it("returns the requested number of cited single-choice items", async () => {
    const result = await call(new FakeAiProvider(), snapshot("TEST", 4, "STANDARD"));
    const { items } = JSON.parse(result.text);
    expect(items).toHaveLength(4);
    for (const item of items) {
      expect(item).toMatchObject({ type: "SINGLE_CHOICE", difficulty: "STANDARD", outcomeCodes: ["KHTN8.E1"] });
      expect(["P1", "P2"]).toContain(item.sourceRefs[0]);
      expect(item.correctOption).toBeLessThan(item.options.length);
    }
    expect(result.inputTokens).toBeGreaterThan(0);
    expect(result.outputTokens).toBeGreaterThan(0);
  });

  it("returns cards for a DECK job", async () => {
    const { items } = JSON.parse((await call(new FakeAiProvider(), snapshot("DECK", 3))).text);
    expect(items).toHaveLength(3);
    expect(items.every((item: any) => item.type === "CARD" && item.front && item.back)).toBe(true);
  });

  it("is deterministic and records its calls", async () => {
    const fake = new FakeAiProvider();
    const a = await call(fake, snapshot("TEST", 2));
    const b = await call(fake, snapshot("TEST", 2));
    expect(a.text).toBe(b.text);
    expect(fake.calls).toHaveLength(2);
  });

  it("returns a fixture chosen by lesson id", async () => {
    const fixture = { items: [{ type: "CARD", front: "f", back: "b", sourceRefs: ["P1"] }] };
    const result = await call(new FakeAiProvider("ok", { "lesson-circuit": fixture }), snapshot("DECK", 3));
    expect(JSON.parse(result.text)).toEqual(fixture);
  });

  it("can be forced to emit invalid JSON", async () => {
    const result = await call(new FakeAiProvider("invalid_json"), snapshot("TEST", 1));
    expect(() => JSON.parse(result.text)).toThrow();
  });

  it.each([["timeout", "PROVIDER_TIMEOUT"], ["unavailable", "PROVIDER_UNAVAILABLE"], ["empty", "OUTPUT_SCHEMA_INVALID"]] as const)(
    "can be forced to fail as %s",
    async (mode, code) => {
      const error = await call(new FakeAiProvider(mode), snapshot("TEST", 1)).then(() => null, (e) => e);
      expect(error).toBeInstanceOf(AiProviderError);
      expect(error.code).toBe(code);
    },
  );

  it("can be forced to emit unsafe content", async () => {
    const { items } = JSON.parse((await call(new FakeAiProvider("unsafe"), snapshot("TEST", 2))).text);
    expect(items[0].options[0]).toMatch(/điện lưới/);
  });

  it("fails as INTERNAL_ERROR when the prompt has no data block", async () => {
    const error = await new FakeAiProvider().generate({ system: "s", user: "no block", maxTokens: 1, timeoutMs: 1 }).then(() => null, (e) => e);
    expect(error.code).toBe("INTERNAL_ERROR");
  });
});

describe("createAiProvider", () => {
  const env = (values: Record<string, string>) => values as unknown as NodeJS.ProcessEnv;
  it("builds the configured adapter, or null when not configured", () => {
    expect(createAiProvider(parseAiConfig(env({ AI_PROVIDER: "fake" })))).toBeInstanceOf(FakeAiProvider);
    expect(createAiProvider(parseAiConfig(env({ AI_PROVIDER: "gemini", GEMINI_API_KEY: "k", GEMINI_MODEL: "m" })))).toBeInstanceOf(GeminiProvider);
    expect(createAiProvider(parseAiConfig(env({})))).toBeNull();
    expect(createAiProvider(parseAiConfig(env({ AI_PROVIDER: "gemini" })))).toBeNull();
  });
});
