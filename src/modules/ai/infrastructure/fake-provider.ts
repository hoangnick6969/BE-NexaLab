import { AiProviderError, type AiGenerateInput, type AiGenerateResult, type AiProvider } from "../application/ai-provider";
import type { InputSnapshotV1 } from "../application/generate-resource-prompt";
import type { AssessPromptPayload } from "../application/assessment-privacy";
import type { LabChallengeSnapshotV1 } from "../application/lab-challenge-prompt";

/** How the fake behaves; tests force failures through it. `raw_latex` emits an unescaped \frac (KX-01 fixture). */
export type FakeAiMode = "ok" | "invalid_json" | "timeout" | "unavailable" | "unsafe" | "empty" | "raw_latex";

type Snapshot = Omit<InputSnapshotV1, "instruction">;
/** Test hook for ASSESS_SUBMISSION: return an object (serialized as JSON) or a raw string to send back verbatim. */
export type FakeAssessmentFixture = (payload: AssessPromptPayload) => unknown;

/** Test hook for DRAFT_LAB_CHALLENGE (TAI-06): return an object (serialized as JSON) or a raw string to send back verbatim. */
export type FakeLabChallengeFixture = (snapshot: Omit<LabChallengeSnapshotV1, "instruction">) => unknown;

const DIFFICULTIES = ["FOUNDATION", "STANDARD", "ADVANCED"] as const;

/**
 * Deterministic provider for tests and local development. It never touches the network and is refused in production
 * by `parseAiConfig`. It reads the snapshot from the prompt's <data> block, so its output always cites real passage
 * ids and honours the requested kind and count.
 * `fixtures` lets a test return fixed JSON for a given lesson id instead of the generated items.
 * For ASSESS_SUBMISSION (TAI-02) it scores each criterion by the highest anchor whose quoted phrases (in «…» or “…”)
 * all appear in the response, and quotes the sentences that contain them verbatim; `assessment` overrides that.
 */
export class FakeAiProvider implements AiProvider {
  readonly name = "fake" as const;
  readonly calls: AiGenerateInput[] = [];

  constructor(
    public mode: FakeAiMode = "ok",
    private readonly fixtures: Record<string, unknown> = {},
    public assessment: FakeAssessmentFixture | null = null,
    public labChallenge: FakeLabChallengeFixture | null = null,
  ) {}

  async generate(input: AiGenerateInput): Promise<AiGenerateResult> {
    this.calls.push(input);
    if (this.mode === "timeout") throw new AiProviderError("PROVIDER_TIMEOUT");
    if (this.mode === "unavailable") throw new AiProviderError("PROVIDER_UNAVAILABLE", 503);

    const inputTokens = Math.ceil((input.system.length + input.user.length) / 4);
    const reply = (text: string): AiGenerateResult => ({ text, inputTokens, outputTokens: Math.ceil(text.length / 4), requestId: `fake-${this.calls.length}` });

    if (this.mode === "invalid_json") return reply("{ items: [ this is not json");
    if (this.mode === "empty") throw new AiProviderError("OUTPUT_SCHEMA_INVALID");

    const data = readData(input.user) as Record<string, unknown>;
    if (Array.isArray(data.models) && typeof data.proposalCount === "number") return reply(this.labProposals(data as unknown as Omit<LabChallengeSnapshotV1, "instruction">));
    if (Array.isArray(data.prompts) && typeof data.topic === "string") return reply(this.assess(data as unknown as AssessPromptPayload));
    const snapshot = data as unknown as Snapshot;
    const fixed = this.fixtures[snapshot.lesson.id];
    if (fixed !== undefined && this.mode === "ok") return reply(JSON.stringify(fixed));
    return reply(JSON.stringify({ items: buildItems(snapshot, this.mode === "unsafe") }));
  }

  /**
   * Deterministic lab proposals: model i % n, one varying parameter per proposal (the first number parameter, else the
   * last choice parameter), the others omitted so the engine uses its defaults. The values are always inside the
   * snapshot's allowlist; the hook `labChallenge` overrides this for negative tests. `unsafe` makes the first rationale unsafe.
   */
  private labProposals(snapshot: Omit<LabChallengeSnapshotV1, "instruction">): string {
    if (this.labChallenge) {
      const fixed = this.labChallenge(snapshot);
      return typeof fixed === "string" ? fixed : JSON.stringify(fixed);
    }
    const models = snapshot.models;
    const proposals = Array.from({ length: snapshot.proposalCount }, (_, index) => {
      const model = models[index % Math.max(models.length, 1)];
      const round = Math.floor(index / Math.max(models.length, 1));
      const entries = Object.entries(model?.params ?? {}).sort(([a], [b]) => a.localeCompare(b));
      const numberParam = entries.find(([, param]) => param.kind === "number");
      const choiceParams = entries.filter(([, param]) => param.kind === "choice");
      const params: Record<string, number | string> = {};
      if (numberParam && numberParam[1].kind === "number") {
        const { min, max, step } = numberParam[1];
        const steps = Math.floor((max - min) / step);
        params[numberParam[0]] = max - Math.min(steps, Math.round((steps * round) / 3)) * step;
      } else if (choiceParams.length) {
        const [name, param] = choiceParams[choiceParams.length - 1];
        if (param.kind === "choice") params[name] = param.options[round % param.options.length].value;
      }
      return {
        labId: model?.labId ?? "",
        challengeParams: params,
        rationale: this.mode === "unsafe" && index === 0 ? "Tự chế thiết bị nối trực tiếp vào điện lưới để thử" : `Phù hợp với mục tiêu bài học ${snapshot.lesson.title}.`,
        outcomeCodes: snapshot.outcomes.slice(0, 1).map((outcome) => outcome.code),
        sourceRefs: snapshot.passages.slice(0, 1).map((passage) => passage.id),
      };
    });
    return JSON.stringify({ proposals });
  }

  private assess(payload: AssessPromptPayload): string {
    if (this.assessment) {
      const fixed = this.assessment(payload);
      return typeof fixed === "string" ? fixed : JSON.stringify(fixed);
    }
    const output = JSON.stringify({ criteria: payload.prompts.flatMap((prompt) => prompt.criteria.map((c) => scoreCriterion(prompt.promptId, prompt.response, c))) });
    // KX-01 fixture: turn the escaped "\\frac" into a raw "\frac", which JSON.parse reads as form feed + "rac".
    return this.mode === "raw_latex" ? output.replace('"rationale":"', '"rationale":"\\frac{U}{R} ') : output;
  }
}

function readData(user: string): unknown {
  const match = /<data>\n([\s\S]*?)\n<\/data>/.exec(user);
  if (!match) throw new AiProviderError("INTERNAL_ERROR");
  try {
    return JSON.parse(match[1]);
  } catch {
    throw new AiProviderError("INTERNAL_ERROR");
  }
}

/** Phrases a synthetic anchor requires, written in «…» or “…”. */
const phrasesOf = (description: string) => [...description.matchAll(/[«“]([^»”]{2,120})[»”]/g)].map((m) => m[1].trim());

/** The sentence of `text` containing `at`, verbatim (bounded by . ! ? or a line break). */
function sentenceAt(text: string, at: number, length: number) {
  let start = at;
  while (start > 0 && !/[.!?\n]/.test(text[start - 1])) start--;
  let end = at + length;
  while (end < text.length && !/[.!?\n]/.test(text[end])) end++;
  if (end < text.length) end++;
  return text.slice(start, end).trim().slice(0, 300);
}

function scoreCriterion(promptId: string, response: string, criterion: AssessPromptPayload["prompts"][number]["criteria"][number]) {
  const lower = response.toLowerCase();
  const anchors = [...criterion.anchors].sort((a, b) => a.points - b.points);
  let awarded = { points: 0, description: anchors[0]?.description ?? "", quotes: [] as string[] };
  for (const anchor of anchors) {
    if (anchor.points <= 0) continue;
    const phrases = phrasesOf(anchor.description);
    if (!phrases.length) continue;
    const positions = phrases.map((p) => ({ at: lower.indexOf(p.toLowerCase()), length: p.length }));
    if (positions.some((p) => p.at < 0)) continue;
    const quotes = [...new Set(positions.map((p) => sentenceAt(response, p.at, p.length)))].filter((q) => q.length >= 5).slice(0, 3);
    awarded = { points: anchor.points, description: anchor.description, quotes };
  }
  return {
    promptId,
    criterionCode: criterion.criterionCode,
    suggestedPoints: awarded.points,
    rationale: (awarded.points > 0 ? `Khớp mốc ${awarded.points} điểm: ${awarded.description}` : "Không tìm thấy ý khớp với các mốc chấm có điểm.").slice(0, 500),
    evidenceQuotes: awarded.quotes,
    uncertainty: null,
  };
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
