import { AiProviderError, type AiGenerateInput, type AiGenerateResult, type AiProvider } from "../application/ai-provider";
import type { InputSnapshotV1 } from "../application/generate-resource-prompt";
import type { AssessPromptPayload } from "../application/assessment-privacy";
import type { LabChallengeSnapshotV1 } from "../application/lab-challenge-prompt";
import type { AssessmentSnapshotV1 } from "../application/generate-assessment-prompt";

/** How the fake behaves; tests force failures through it. `raw_latex` emits an unescaped \frac (KX-01 fixture). */
export type FakeAiMode = "ok" | "invalid_json" | "timeout" | "unavailable" | "unsafe" | "empty" | "raw_latex";

type Snapshot = Omit<InputSnapshotV1, "instruction">;
/** Test hook for ASSESS_SUBMISSION: return an object (serialized as JSON) or a raw string to send back verbatim. */
export type FakeAssessmentFixture = (payload: AssessPromptPayload) => unknown;

/** Test hook for DRAFT_LAB_CHALLENGE (TAI-06): return an object (serialized as JSON) or a raw string to send back verbatim. */
export type FakeLabChallengeFixture = (snapshot: Omit<LabChallengeSnapshotV1, "instruction">) => unknown;

/** Test hook for GENERATE_ASSESSMENT (TAI7-T5): return an object (serialized as JSON) or a raw string to send back verbatim. */
export type FakeAssessmentDraftFixture = (snapshot: Omit<AssessmentSnapshotV1, "instruction">) => unknown;

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
    public assessmentDraft: FakeAssessmentDraftFixture | null = null,
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
    // TAI7-T5: the exam blueprint is the only payload with `blueprint` and `assessmentType`.
    if (typeof data.assessmentType === "string" && data.blueprint) return reply(this.assessmentPaper(data as unknown as Omit<AssessmentSnapshotV1, "instruction">));
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

  /**
   * Deterministic exam draft: one item per blueprint slot, echoing its slot, citing real passages, rubrics whose criteria add up
   * to the slot's budget, and a Lab prompt from the picked challenge. `unsafe` makes the first multiple-choice explanation
   * unsafe so the slot is dropped (partial-output tests); `assessmentDraft` overrides everything for negative tests.
   */
  private assessmentPaper(snapshot: Omit<AssessmentSnapshotV1, "instruction">): string {
    if (this.assessmentDraft) {
      const fixed = this.assessmentDraft(snapshot);
      return typeof fixed === "string" ? fixed : JSON.stringify(fixed);
    }
    const ref = (n: number) => [snapshot.passages[n % Math.max(snapshot.passages.length, 1)]?.id ?? "P1"];
    const LEVEL = { RECALL: "nhận biết", UNDERSTAND: "thông hiểu", APPLY: "vận dụng" } as const;
    // Each question quotes a different window of the lesson text, so a batch never looks like duplicates.
    const lessonText = snapshot.passages.map((passage) => passage.text).join(" ");
    // Whole words only: a window cut inside a word would look like a unit symbol and trip the numeric-review warning.
    const windowAt = (n: number) => lessonText.slice((n * 53) % Math.max(lessonText.length - 60, 1)).slice(0, 60).split(" ").slice(1, -1).join(" ");
    const mcq = snapshot.blueprint.mcq.map((cell) => ({
      slot: cell.slot,
      prompt: `Câu ${cell.slot + 1} (${LEVEL[cell.cognitiveLevel]}): với nội dung "${windowAt(cell.slot)}", phát biểu nào đúng theo bài học?`,
      options: [`Phát biểu đúng của câu ${cell.slot + 1}`, `Phát biểu sai thứ nhất của câu ${cell.slot + 1}`, `Phát biểu sai thứ hai của câu ${cell.slot + 1}`, `Phát biểu sai thứ ba của câu ${cell.slot + 1}`],
      correctOption: cell.slot % 4,
      explanation: this.mode === "unsafe" && cell.slot === 0 ? "Tự chế thiết bị nối trực tiếp vào điện lưới để kiểm chứng" : `Đáp án đúng bám theo đoạn ${ref(cell.slot)[0]} của bài học.`,
      sourceRefs: ref(cell.slot),
    }));
    // Options are rotated so the correct text sits at correctOption.
    for (const item of mcq) {
      const [right, ...wrong] = item.options;
      item.options = [...wrong.slice(0, item.correctOption), right!, ...wrong.slice(item.correctOption)];
    }
    const written = snapshot.blueprint.written.map((cell) => {
      const halves = Math.round(cell.budgetPoints * 2);
      const count = Math.max(1, Math.min(cell.maxCriteria, Math.floor(halves / 2)));
      const each = Math.floor(halves / count);
      return {
        slot: cell.slot,
        prompt: `Câu tự luận ${cell.slot + 1} (${LEVEL[cell.cognitiveLevel]}): trình bày và giải thích nội dung chính của bài "${snapshot.lesson.title}".`,
        maxChars: 1200,
        referenceAnswer: `Nêu đúng nội dung chính của đoạn ${ref(cell.slot)[0]} và giải thích bằng ví dụ.`,
        criteria: Array.from({ length: count }, (_, i) => {
          const maxPoints = (i === count - 1 ? halves - each * (count - 1) : each) / 2;
          return {
            code: `TIEU_CHI_${i + 1}`,
            description: `Tiêu chí ${i + 1}: nội dung đúng và đầy đủ`,
            maxPoints,
            anchors: [{ points: 0, description: "Chưa nêu được ý chính" }, ...(maxPoints >= 2 ? [{ points: Math.floor(maxPoints), description: "Nêu được một phần ý chính" }] : []), { points: maxPoints, description: "Nêu đủ và đúng ý chính" }]
              .filter((anchor, index, all) => index === 0 || anchor.points > all[index - 1]!.points),
          };
        }),
        sourceRefs: ref(cell.slot + 1),
      };
    });
    const lab = snapshot.blueprint.lab ? { prompt: `Thực hành trong phòng Lab "${snapshot.blueprint.lab.labTitle}": ${snapshot.blueprint.lab.objective}`, sourceRefs: ref(0) } : null;
    return JSON.stringify({ mcq, written, lab });
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
