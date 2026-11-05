import type { AiConfig } from "../application/ai-config";
import type { AiProvider } from "../application/ai-provider";
import { FakeAiProvider } from "./fake-provider";
import { GeminiProvider } from "./gemini-provider";

/** Returns null when no provider is configured; job creation then answers 503 AI_PROVIDER_NOT_CONFIGURED (TAI-T2). */
export function createAiProvider(config: AiConfig): AiProvider | null {
  if (config.provider === "fake") return new FakeAiProvider();
  if (config.provider === "gemini" && config.geminiApiKey && config.model) return new GeminiProvider(config.geminiApiKey, config.model);
  return null;
}
