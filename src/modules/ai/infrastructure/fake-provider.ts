import { AiProviderError, type AiGenerateInput, type AiGenerateResult, type AiProvider } from "../application/ai-provider";
import type { InputSnapshotV1 } from "../application/generate-resource-prompt";

/** How the fake behaves; tests force failures through it. */
export type FakeAiMode = "ok" | "invalid_json" | "timeout" | "unavailable" | "unsafe" | "empty";

type Snapshot = Omit<InputSnapshotV1, "instruction">;

const DIFFICULTIES = ["FOUNDATION", "STANDARD", "ADVANCED"] as const;

/**
 * Deterministic provider for tests and local development. It never touches the network and is refused in production
 * by `parseAiConfig`. It reads the snapshot from the prompt's <data> block, so its output always cites real passage
 * ids and honours the requested kind and count.
 * `fixtures` lets a test return fixed JSON for a given lesson id instead of the generated items.
 */
export class FakeAiProvider implements AiProvider {
  readonly name = "fake" as const;
  readonly calls: AiGenerateInput[] = [];

  constructor(
    public mode: FakeAiMode = "ok",
    private readonly fixtures: Record<string, unknown> = {},
  ) {}

  async generate(input: AiGenerateInput): Promise<AiGenerateResult> {
    this.calls.push(input);
    if (this.mode === "timeout") throw new AiProviderError("PROVIDER_TIMEOUT");
    if (this.mode === "unavailable") throw new AiProviderError("PROVIDER_UNAVAILABLE", 503);

    const inputTokens = Math.ceil((input.system.length + input.user.length) / 4);
    const reply = (text: string): AiGenerateResult => ({ text, inputTokens, outputTokens: Math.ceil(text.length / 4), requestId: `fake-${this.calls.length}` });

    if (this.mode === "invalid_json") return reply("{ items: [ this is not json");
    if (this.mode === "empty") throw new AiProviderError("OUTPUT_SCHEMA_INVALID");

    const snapshot = readSnapshot(input.user);
    const fixed = this.fixtures[snapshot.lesson.id];
    if (fixed !== undefined && this.mode === "ok") return reply(JSON.stringify(fixed));
    return reply(JSON.stringify({ items: buildItems(snapshot, this.mode === "unsafe") }));
  }
}

function readSnapshot(user: string): Snapshot {
  const match = /<data>\n([\s\S]*?)\n<\/data>/.exec(user);
  if (!match) throw new AiProviderError("INTERNAL_ERROR");
  try {
    return JSON.parse(match[1]) as Snapshot;
  } catch {
    throw new AiProviderError("INTERNAL_ERROR");
  }
}

function buildItems(snapshot: Snapshot, unsafe: boolean) {
  const { targetKind, itemCount, difficulty } = snapshot.constraints;
  const passageIds = snapshot.passages.map((passage) => passage.id);
  const outcomeCodes = snapshot.outcomes.slice(0, 1).map((outcome) => outcome.code);
  return Array.from({ length: itemCount }, (_, index) => {
    const sourceRefs = [passageIds[index % Math.max(passageIds.length, 1)] ?? "P1"];
    if (targetKind === "DECK")
      return { type: "CARD", front: `Thẻ ${index + 1}: ${snapshot.lesson.title}`, back: `Ý chính ${index + 1} của bài ${snapshot.lesson.topic}`, sourceRefs };
    const options = [`Phương án A ${index + 1}`, `Phương án B ${index + 1}`, `Phương án C ${index + 1}`, `Phương án D ${index + 1}`];
    if (unsafe && index === 0) options[0] = "Tự chế thiết bị nối trực tiếp vào điện lưới để thử";
    return {
      type: "SINGLE_CHOICE",
      prompt: `Câu ${index + 1} về ${snapshot.lesson.title}?`,
      options,
      correctOption: index % options.length,
      explanation: `Đáp án đúng dựa trên đoạn ${sourceRefs[0]} của bài học.`,
      difficulty: difficulty ?? DIFFICULTIES[index % DIFFICULTIES.length],
      outcomeCodes,
      sourceRefs,
    };
  });
}
