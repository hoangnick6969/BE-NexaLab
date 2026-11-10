/**
 * `subsim@1` — submission similarity evidence (TAI-03 Part B, TAI3-T3).
 *
 * Pure and deterministic: no provider, no database, no clock. It compares the current written
 * responses of different students, prompt by prompt, with word 5-gram shingles and winnowing, and
 * returns matched text spans as evidence for the owning teacher. It never judges anyone.
 * Changing any constant or step requires a new version string (see similarity-algorithms.md).
 */
export const SUBSIM_ALGORITHM_VERSION = "subsim@1";
/** Fewer eligible tokens than this skips the response for that prompt (SHORT_RESPONSE). */
export const MIN_ELIGIBLE_TOKENS = 40;
/** A pair is reported only with at least this many shared fingerprints. */
export const MIN_SHARED_FINGERPRINTS = 8;
export const SHINGLE_SIZE = 5;
export const WINNOW_WINDOW = 4;
export const MAX_SPANS_PER_SIDE = 10;
/** Ranges with at most this many original tokens between them join into one span. */
export const SPAN_GAP_TOKENS = 3;

const UNIT_TOKENS = new Set(["v", "a", "ω", "mol", "g", "ml", "°c"]);

export type ExclusionReason = "FORMULA" | "PROMPT_TEXT" | "COMMON_PHRASE";
export type SimilarityLevel = "HIGH" | "ELEVATED";

/** A token with its offsets in the original text (UTF-16 code units); `text` is normalized. */
export type SimilarityToken = { text: string; start: number; end: number; excluded: ExclusionReason | null };
export type SimilaritySpan = { start: number; end: number };

export type SimilarityPrompt = { id: string; text: string; commonPhrases?: string[] };
export type SimilaritySubmission = { id: string; studentId: string; responses: Array<{ promptId: string; text: string }> };

export type PromptSimilarity = {
  promptId: string;
  containment: number;
  shared: number;
  level: SimilarityLevel;
  spansA: SimilaritySpan[];
  spansB: SimilaritySpan[];
};
export type SimilarityMatch = {
  /** `submissionAId` is the lexicographically smaller id. */
  submissionAId: string;
  submissionBId: string;
  level: SimilarityLevel;
  maxContainment: number;
  perPrompt: PromptSimilarity[];
};
export type SimilaritySkip = { submissionId: string; promptId: string; reason: "SHORT_RESPONSE" };
export type SubmissionSimilarityResult = {
  algorithmVersion: typeof SUBSIM_ALGORITHM_VERSION;
  matches: SimilarityMatch[];
  skipped: SimilaritySkip[];
};

// ---------------------------------------------------------------------------------------------------------------
// Hashing: 64-bit FNV-1a over UTF-8 bytes. Computed with two 32-bit halves (no BigInt in the hot loop);
// the tests check it against a BigInt reference and the published vectors.

const encoder = new TextEncoder();
const hex8 = (n: number) => n.toString(16).padStart(8, "0");

export function fnv1a64(text: string): string {
  let hi = 0xcbf29ce4;
  let lo = 0x84222325;
  for (const byte of encoder.encode(text)) {
    lo = (lo ^ byte) >>> 0;
    // (hi, lo) * 0x100000001b3 mod 2^64 = (h << 40) + h * 0x1b3.
    const loProduct = lo * 0x1b3;
    const carry = Math.floor(loProduct / 4294967296);
    const nextHi = (hi * 0x1b3 + carry + ((lo << 8) >>> 0)) >>> 0;
    lo = loProduct >>> 0;
    hi = nextHi;
  }
  return hex8(hi) + hex8(lo);
}

// ---------------------------------------------------------------------------------------------------------------
// Tokenization on the original text.

type RawToken = { text: string; start: number; end: number; word: number };
type RawWord = { raw: string; start: number };

const WORD = /\S+/gu;
const TOKEN = /[^\s\p{P}]+/gu;

/** Words on whitespace, then tokens on Unicode punctuation; offsets always point into the original string. */
function tokenizeText(text: string): { tokens: RawToken[]; words: RawWord[] } {
  const tokens: RawToken[] = [];
  const words: RawWord[] = [];
  for (const word of text.matchAll(WORD)) {
    const wordIndex = words.length;
    const wordStart = word.index ?? 0;
    words.push({ raw: word[0], start: wordStart });
    for (const token of word[0].matchAll(TOKEN)) {
      const start = wordStart + (token.index ?? 0);
      tokens.push({ text: token[0].normalize("NFC").toLocaleLowerCase("vi-VN"), start, end: start + token[0].length, word: wordIndex });
    }
  }
  return { tokens, words };
}

/** KaTeX ranges on the original text: block `$$…$$` first, then inline `$…$` outside the block ranges. */
function katexRanges(text: string): Array<[number, number]> {
  const ranges: Array<[number, number]> = [];
  const masked = text.replace(/\$\$[\s\S]+?\$\$/g, (match: string, offset: number) => {
    ranges.push([offset, offset + match.length]);
    return " ".repeat(match.length);
  });
  for (const match of masked.matchAll(/\$[^$\n]+?\$/g)) ranges.push([match.index ?? 0, (match.index ?? 0) + match[0].length]);
  return ranges;
}

/** Words that mark all their tokens as formulas: `=`, digits mixed with letters, and neighbours of a symbol-only word. */
function formulaWords(words: RawWord[]): Set<number> {
  const marked = new Set<number>();
  words.forEach((word, index) => {
    if (word.raw.includes("=") || (/\p{Nd}/u.test(word.raw) && /\p{L}/u.test(word.raw))) marked.add(index);
    if (/^\p{Sm}+$/u.test(word.raw)) {
      marked.add(index - 1);
      marked.add(index);
      marked.add(index + 1);
    }
  });
  return marked;
}

type PromptContext = { promptGrams: Set<string>; phrases: string[][] };
const EMPTY_CONTEXT: PromptContext = { promptGrams: new Set(), phrases: [] };

const joinGram = (tokens: Array<{ text: string }>, from: number, to: number) => {
  const parts: string[] = [];
  for (let i = from; i < to; i++) parts.push(tokens[i].text);
  return parts.join(" ");
};

/** The prompt's word 5-grams and the common phrases (at least 2 tokens), tokenized like a response. */
export function buildPromptContext(prompt: Pick<SimilarityPrompt, "text" | "commonPhrases">): PromptContext {
  const promptTokens = tokenizeText(prompt.text ?? "").tokens;
  const promptGrams = new Set<string>();
  for (let i = 0; i + SHINGLE_SIZE <= promptTokens.length; i++) promptGrams.add(joinGram(promptTokens, i, i + SHINGLE_SIZE));
  const seen = new Set<string>();
  const phrases: string[][] = [];
  for (const phrase of prompt.commonPhrases ?? []) {
    const tokens = tokenizeText(phrase).tokens.map((t) => t.text);
    const key = tokens.join(" ");
    if (tokens.length >= 2 && !seen.has(key)) {
      seen.add(key);
      phrases.push(tokens);
    }
  }
  return { promptGrams, phrases };
}

/** Tokens of one response with exclusion reasons (the first matching reason wins). */
export function analyzeResponse(text: string, context: PromptContext = EMPTY_CONTEXT): SimilarityToken[] {
  const { tokens: raw, words } = tokenizeText(text);
  const tokens: SimilarityToken[] = raw.map((t) => ({ text: t.text, start: t.start, end: t.end, excluded: null }));
  const mark = (index: number, reason: ExclusionReason) => {
    if (!tokens[index].excluded) tokens[index].excluded = reason;
  };
  const ranges = katexRanges(text);
  if (ranges.length)
    tokens.forEach((token, index) => {
      if (ranges.some(([start, end]) => token.start < end && token.end > start)) mark(index, "FORMULA");
    });
  const formulas = formulaWords(words);
  raw.forEach((token, index) => {
    if (formulas.has(token.word) || UNIT_TOKENS.has(token.text)) mark(index, "FORMULA");
  });
  if (context.promptGrams.size)
    for (let i = 0; i + SHINGLE_SIZE <= tokens.length; i++)
      if (context.promptGrams.has(joinGram(tokens, i, i + SHINGLE_SIZE))) for (let j = i; j < i + SHINGLE_SIZE; j++) mark(j, "PROMPT_TEXT");
  for (const phrase of context.phrases)
    for (let i = 0; i + phrase.length <= tokens.length; i++) {
      let same = true;
      for (let j = 0; j < phrase.length && same; j++) same = tokens[i + j].text === phrase[j];
      if (same) for (let j = 0; j < phrase.length; j++) mark(i + j, "COMMON_PHRASE");
    }
  return tokens;
}

// ---------------------------------------------------------------------------------------------------------------
// Shingles, winnowing, scoring.

type Shingle = { hash: string; firstToken: number; lastToken: number; start: number; end: number };

/** Word 5-gram shingles over the eligible-token sequence; the token indices refer to the full token list. */
export function shinglesOf(tokens: SimilarityToken[]): Shingle[] {
  const eligible: number[] = [];
  tokens.forEach((token, index) => {
    if (!token.excluded) eligible.push(index);
  });
  const shingles: Shingle[] = [];
  for (let k = 0; k + SHINGLE_SIZE <= eligible.length; k++) {
    const first = eligible[k];
    const last = eligible[k + SHINGLE_SIZE - 1];
    const parts: string[] = [];
    for (let j = 0; j < SHINGLE_SIZE; j++) parts.push(tokens[eligible[k + j]].text);
    shingles.push({ hash: fnv1a64(parts.join(" ")), firstToken: first, lastToken: last, start: tokens[first].start, end: tokens[last].end });
  }
  return shingles;
}

/** Selected positions: the minimum hash of each window of 4 (rightmost on ties), unique and ascending. */
export function winnow(hashes: string[]): number[] {
  const selected = new Set<number>();
  if (!hashes.length) return [];
  const windows = Math.max(1, hashes.length - WINNOW_WINDOW + 1);
  for (let from = 0; from < windows; from++) {
    let best = from;
    const to = Math.min(hashes.length, from + WINNOW_WINDOW);
    for (let p = from + 1; p < to; p++) if (hashes[p] <= hashes[best]) best = p;
    selected.add(best);
  }
  return [...selected].sort((a, b) => a - b);
}

/** Report level from integer arithmetic: containment 0.60 is `shared*5 >= min*3`, 0.80 is `shared*5 >= min*4`. */
export function similarityLevel(shared: number, smallerSet: number): SimilarityLevel | null {
  if (smallerSet <= 0 || shared < MIN_SHARED_FINGERPRINTS) return null;
  if (shared * 5 >= smallerSet * 4) return "HIGH";
  if (shared * 5 >= smallerSet * 3) return "ELEVATED";
  return null;
}

type TokenRange = { firstToken: number; lastToken: number; start: number; end: number };

/** Merges ranges at most `maxGap` original tokens apart (overlaps always join). */
export function mergeRanges(ranges: TokenRange[], maxGap = SPAN_GAP_TOKENS): TokenRange[] {
  const sorted = [...ranges].sort((a, b) => a.firstToken - b.firstToken || a.lastToken - b.lastToken);
  const merged: TokenRange[] = [];
  for (const range of sorted) {
    const current = merged[merged.length - 1];
    if (current && range.firstToken - current.lastToken - 1 <= maxGap) {
      current.lastToken = Math.max(current.lastToken, range.lastToken);
      current.start = Math.min(current.start, range.start);
      current.end = Math.max(current.end, range.end);
    } else merged.push({ ...range });
  }
  return merged;
}

/** Spans for the teacher: merged, at most 10 per side, in text order. */
export function toSpans(ranges: TokenRange[]): SimilaritySpan[] {
  return mergeRanges(ranges)
    .slice(0, MAX_SPANS_PER_SIDE)
    .map(({ start, end }) => ({ start, end }));
}

type Analysis = { shingles: Shingle[]; fingerprints: Map<string, number[]> };

function analyze(text: string, context: PromptContext): Analysis | null {
  const tokens = analyzeResponse(text, context);
  if (tokens.filter((t) => !t.excluded).length < MIN_ELIGIBLE_TOKENS) return null;
  const shingles = shinglesOf(tokens);
  const fingerprints = new Map<string, number[]>();
  for (const position of winnow(shingles.map((s) => s.hash))) {
    const hash = shingles[position].hash;
    const positions = fingerprints.get(hash);
    if (positions) positions.push(position);
    else fingerprints.set(hash, [position]);
  }
  return { shingles, fingerprints };
}

const compareIds = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

function spansFor(analysis: Analysis, sharedHashes: string[]): SimilaritySpan[] {
  const ranges: TokenRange[] = [];
  for (const hash of sharedHashes) for (const position of analysis.fingerprints.get(hash) ?? []) ranges.push(analysis.shingles[position]);
  return toSpans(ranges);
}

/**
 * Compares the current responses of different students prompt by prompt. The caller passes one
 * (current) submission per student of one assignment; a pair with the same `studentId` is ignored anyway.
 */
export function computeSubmissionSimilarity(input: { prompts: SimilarityPrompt[]; submissions: SimilaritySubmission[] }): SubmissionSimilarityResult {
  const submissions = [...input.submissions].sort((a, b) => compareIds(a.id, b.id));
  const count = submissions.length;
  const skipped: SimilaritySkip[] = [];
  const pairs = new Map<number, PromptSimilarity[]>();

  for (const prompt of input.prompts) {
    const context = buildPromptContext(prompt);
    const analyses = submissions.map((submission) => {
      const text = submission.responses.find((response) => response.promptId === prompt.id)?.text ?? "";
      const analysis = analyze(text, context);
      if (!analysis) skipped.push({ submissionId: submission.id, promptId: prompt.id, reason: "SHORT_RESPONSE" });
      return analysis;
    });

    // Candidate pairs from an inverted index: only submissions that share at least one fingerprint are counted.
    const index = new Map<string, number[]>();
    analyses.forEach((analysis, i) => {
      if (!analysis) return;
      for (const hash of analysis.fingerprints.keys()) {
        const holders = index.get(hash);
        if (holders) holders.push(i);
        else index.set(hash, [i]);
      }
    });
    const shared = new Map<number, number>();
    for (const holders of index.values())
      for (let x = 0; x < holders.length; x++)
        for (let y = x + 1; y < holders.length; y++) {
          if (submissions[holders[x]].studentId === submissions[holders[y]].studentId) continue;
          const key = holders[x] * count + holders[y];
          shared.set(key, (shared.get(key) ?? 0) + 1);
        }

    for (const [key, sharedCount] of shared) {
      const a = Math.floor(key / count);
      const b = key % count;
      const analysisA = analyses[a]!;
      const analysisB = analyses[b]!;
      const smaller = Math.min(analysisA.fingerprints.size, analysisB.fingerprints.size);
      const level = similarityLevel(sharedCount, smaller);
      if (!level) continue;
      const sharedHashes = [...analysisA.fingerprints.keys()].filter((hash) => analysisB.fingerprints.has(hash));
      const row: PromptSimilarity = {
        promptId: prompt.id,
        containment: sharedCount / smaller,
        shared: sharedCount,
        level,
        spansA: spansFor(analysisA, sharedHashes),
        spansB: spansFor(analysisB, sharedHashes),
      };
      const rows = pairs.get(key);
      if (rows) rows.push(row);
      else pairs.set(key, [row]);
    }
  }

  const matches: SimilarityMatch[] = [];
  for (const [key, perPrompt] of pairs) {
    matches.push({
      submissionAId: submissions[Math.floor(key / count)].id,
      submissionBId: submissions[key % count].id,
      level: perPrompt.some((row) => row.level === "HIGH") ? "HIGH" : "ELEVATED",
      maxContainment: Math.max(...perPrompt.map((row) => row.containment)),
      perPrompt,
    });
  }
  matches.sort((x, y) => y.maxContainment - x.maxContainment || compareIds(x.submissionAId, y.submissionAId) || compareIds(x.submissionBId, y.submissionBId));
  skipped.sort((x, y) => compareIds(x.submissionId, y.submissionId) || compareIds(x.promptId, y.promptId));
  return { algorithmVersion: SUBSIM_ALGORITHM_VERSION, matches, skipped };
}
