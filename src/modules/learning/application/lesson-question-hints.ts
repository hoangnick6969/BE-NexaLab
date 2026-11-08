/**
 * SAI-03A — rules-only hints on lesson quiz questions (roadmap SAI-03, UC-AI-02 extended).
 *
 * Answer-blind by construction: the planner receives the prompt, the option texts and the lesson's own study
 * text, never the answer key, so its output is the same whichever option is correct. Text quoted from the
 * lesson has every option masked as "___", so a quoted sentence cannot be read off as a choice.
 * Levels: 1 question focus, 2 where to look, 3 the masked sentence (only after a submitted attempt got this
 * question wrong — BR-06, enforced by the caller).
 */
export const LESSON_HINT_RULES = "lesson-hints@1";
export const LESSON_HINT_KIND = "lesson-question-hint";
/** SAI-03-T3: same rules on an Open Curriculum basic exercise question. */
export const EXERCISE_HINT_KIND = "exercise-question-hint";
export const MASK = "___";

export type HintSourceKind = "READING" | "STUDY_CARDS" | "VIDEO";
export type HintSource = { kind: HintSourceKind; stepId: string; text: string };
/** Deliberately no answer field: the planner cannot see the key. */
export type HintQuestion = { id: string; prompt: string; options: ReadonlyArray<{ id: string; text: string }> };
export type QuestionHint = {
  level: 1 | 2 | 3;
  variant: "a" | "b";
  content: string;
  passage: { stepId: string; kind: HintSourceKind; sentence: number } | null;
};

// Vietnamese function syllables that carry no topic (kept small and explicit; versioned with the rules).
const STOP = new Set(("khi thì là của và có không sẽ được bị các những một nào gì bao nhiêu vì sao tại trong ngoài cho với " +
  "này đó kia hãy em chọn đúng sai câu sau đây trên dưới như thế nếu mà để từ đến ra vào lại cũng đã đang rất " +
  "hơn nhất theo về hay hoặc nên phải cần ở bằng làm gồm điều the a an of to is").split(" "));

const WORD = /[\p{L}\p{N}]+/gu;
const tokens = (text: string) => (text.normalize("NFC").match(WORD) ?? []);
const lower = (word: string) => word.toLocaleLowerCase("vi");

export function stripHtml(html: string) {
  return html.replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ").replace(/<br\s*\/?>|<\/(p|li|h[1-6]|div)>/gi, ". ")
    .replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"").replace(/&#39;/g, "'").replace(/\s+/g, " ").trim();
}

/** Study text of a lesson's steps, in step order. Quiz and exercise steps are never sources. */
export function lessonSources(steps: ReadonlyArray<{ id: string; type: string; config: any }>): HintSource[] {
  return steps.flatMap((step): HintSource[] => {
    if (step.type === "READING" && typeof step.config?.html === "string") return [{ kind: "READING", stepId: step.id, text: stripHtml(step.config.html) }];
    if (step.type === "STUDY_CARDS" && Array.isArray(step.config?.cards))
      return [{ kind: "STUDY_CARDS", stepId: step.id, text: step.config.cards.map((card: any) => `${card.front}: ${card.back}.`).join(" ") }];
    if (step.type === "VIDEO") {
      const text = step.config?.transcript ?? step.config?.equivalentText;
      return typeof text === "string" ? [{ kind: "VIDEO", stepId: step.id, text: stripHtml(text) }] : [];
    }
    return [];
  }).filter((source) => source.text);
}

const sentencesOf = (text: string) => text.split(/(?<=[.!?…])\s+|\n+/).map((item) => item.trim()).filter((item) => tokens(item).length >= 3);

/** Topic phrases of the prompt: runs of non-function syllables, longest first, at most three. */
export function keyPhrases(prompt: string): string[] {
  const runs: string[][] = [];
  // Punctuation ends a phrase as a function word does.
  for (const clause of prompt.split(/[,.;:!?…()"“”]+/)) {
    let run: string[] = [];
    for (const word of tokens(clause)) {
      if (STOP.has(lower(word))) { if (run.length) runs.push(run); run = []; }
      else run.push(word);
    }
    if (run.length) runs.push(run);
  }
  const phrases = runs.filter((item) => item.length >= 2).map((item) => item.join(" "));
  const chosen = phrases.length ? phrases : runs.map((item) => item.join(" "));
  return [...new Set(chosen.map(lower))].slice(0, 3);
}

function relevance(promptWords: string[], sentence: string) {
  const words = tokens(sentence).map(lower);
  const set = new Set(words);
  const bigrams = new Set(words.slice(1).map((word, i) => words[i] + " " + word));
  const content = promptWords.filter((word) => !STOP.has(word));
  const unigram = new Set(content.filter((word) => set.has(word))).size;
  const bigram = new Set(promptWords.slice(1).map((word, i) => promptWords[i] + " " + word)
    .filter((pair) => pair.split(" ").some((word) => !STOP.has(word)) && bigrams.has(pair))).size;
  return 2 * bigram + unigram;
}

/** Sentences of the lesson ranked by overlap with the prompt only (never with any option). */
export function rankPassages(prompt: string, sources: readonly HintSource[]) {
  const promptWords = tokens(prompt).map(lower);
  return sources.flatMap((source, sourceIndex) => sentencesOf(source.text).map((sentence, index) => ({
    source, sentence, index, order: sourceIndex * 10000 + index, score: relevance(promptWords, sentence),
  }))).filter((item) => item.score >= 2).sort((a, b) => b.score - a.score || a.order - b.order);
}

const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/**
 * Masks every option text (all of them, so the mask says nothing about which one is right). An occurrence that is
 * part of a two-word phrase the prompt itself contains ("quỳ tím" when the prompt says "quỳ tím") stays, since the
 * prompt already shows it; this depends on the prompt only, never on the key.
 */
export function maskOptions(text: string, options: HintQuestion["options"], prompt = "") {
  const promptWords = tokens(prompt).map(lower);
  const promptPairs = new Set(promptWords.slice(1).map((word, i) => promptWords[i] + " " + word));
  const inPromptPhrase = (out: string, start: number, end: number) => {
    const before = out.slice(0, start).match(/([\p{L}\p{N}]+)\s+$/u)?.[1];
    const after = out.slice(end).match(/^\s+([\p{L}\p{N}]+)/u)?.[1];
    const word = lower(out.slice(start, end));
    return Boolean((before && promptPairs.has(lower(before) + " " + word)) || (after && promptPairs.has(word + " " + lower(after))));
  };
  return [...options].map((option) => option.text.trim()).filter(Boolean).sort((a, b) => b.length - a.length)
    .reduce((out, option) => out.replace(new RegExp(`(?<![\\p{L}\\p{N}])${escape(option)}(?![\\p{L}\\p{N}])`, "giu"),
      (match: string, offset: number) => inPromptPhrase(out, offset, offset + match.length) ? match : MASK), text);
}

const WHERE: Record<HintSourceKind, string> = { READING: "phần Đọc của bài", STUDY_CARDS: "thẻ ghi nhớ của bài", VIDEO: "nội dung video của bài" };
const quote = (items: string[]) => items.map((item) => `“${item}”`).join(", ");

export function planQuestionHint(input: { question: HintQuestion; sources: readonly HintSource[]; level: 1 | 2 | 3; variant: "a" | "b" }): QuestionHint {
  const { question, level, variant } = input;
  const phrases = keyPhrases(question.prompt);
  const ranked = rankPassages(question.prompt, input.sources);
  const pick = level === 3 && variant === "b" && ranked[1] ? ranked[1] : ranked[0];
  const passage = pick ? { stepId: pick.source.stepId, kind: pick.source.kind, sentence: pick.index } : null;
  const masked = pick ? maskOptions(pick.sentence, question.options, question.prompt).replace(/[.!?…]+$/, "") : "";
  let content: string;
  if (level === 1) {
    content = !phrases.length ? "Đọc chậm câu hỏi và tìm từ khoá chính: câu hỏi cần em tìm điều gì?"
      : variant === "a" ? `Câu hỏi đang hỏi về ${quote(phrases)}. Hãy nói lại câu hỏi bằng lời của em: cần tìm điều gì?`
      : `Gạch chân ${quote(phrases)} trong câu hỏi. Mỗi lựa chọn nói gì về các ý đó?`;
  } else if (level === 2) {
    const about = phrases.length ? quote(phrases) : "nội dung của câu hỏi";
    content = !pick ? `Xem lại phần Đọc của bài, chú ý các ý về ${about}.`
      : variant === "a" ? `Xem lại ${WHERE[pick.source.kind]}, đoạn bắt đầu bằng “${tokensPrefix(masked, 6)}…”. Đoạn đó nói gì về ${about}?`
      : `Trong ${WHERE[pick.source.kind]}, tìm câu có nhắc tới ${about}. Câu đó giúp em loại bớt lựa chọn nào?`;
  } else {
    content = !pick ? "Bài học chưa có câu nói trực tiếp về câu hỏi này. Hãy đọc lại toàn bộ phần Đọc hoặc hỏi thầy cô."
      : masked.includes(MASK) ? `Đọc lại câu này trong ${WHERE[pick.source.kind]}: “${masked}”. Chỗ “${MASK}” là ý em cần tự nhớ ra; sau đó so với các lựa chọn.`
      : `Đọc lại câu này trong ${WHERE[pick.source.kind]}: “${masked}”. Câu đó áp dụng thế nào vào trường hợp trong câu hỏi?`;
  }
  return { level, variant, content, passage };
}

/** The first `n` words of a sentence, keeping its own spacing and the mask. */
function tokensPrefix(sentence: string, n: number) {
  const parts = sentence.split(/\s+/);
  return parts.slice(0, n).join(" ").replace(/[,.;:!?…]+$/, "");
}
