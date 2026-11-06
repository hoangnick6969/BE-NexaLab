import { describe, expect, it } from "vitest";
import {
  analyzeResponse,
  buildPromptContext,
  computeSubmissionSimilarity,
  fnv1a64,
  mergeRanges,
  similarityLevel,
  toSpans,
  winnow,
  type SimilaritySubmission,
} from "./submission-similarity";

const FNV_OFFSET = 0xcbf29ce484222325n;
const FNV_PRIME = 0x100000001b3n;
const MASK = (1n << 64n) - 1n;
function fnvReference(text: string) {
  let h = FNV_OFFSET;
  for (const byte of new TextEncoder().encode(text)) h = ((h ^ BigInt(byte)) * FNV_PRIME) & MASK;
  return h.toString(16).padStart(16, "0");
}

/** Letter-only pseudo words (no digits, never a unit token), unique per index. */
const L = "abcdefghijklmnopqrstuvwxyz";
const word = (i: number) => "xy" + L[i % 26] + L[Math.floor(i / 26) % 26] + L[Math.floor(i / 676) % 26];
const words = (from: number, count: number) => Array.from({ length: count }, (_, i) => word(from + i)).join(" ");
const sub = (id: string, studentId: string, text: string, promptId = "p1"): SimilaritySubmission => ({ id, studentId, responses: [{ promptId, text }] });
const eligible = (text: string, context = buildPromptContext({ text: "" })) => analyzeResponse(text, context).filter((t) => !t.excluded).length;

describe("fnv1a64", () => {
  it("matches the published vectors and a BigInt reference, including UTF-8 text", () => {
    expect(fnv1a64("")).toBe("cbf29ce484222325");
    expect(fnv1a64("a")).toBe("af63dc4c8601ec8c");
    expect(fnv1a64("foobar")).toBe("85944171f73967e8");
    const samples = ["dòng điện chạy qua dây tóc", "nhiệt lượng tỏa ra", "ệ ế ữ ơ ư", "x".repeat(200), "a b c d e"];
    for (const text of samples) expect(fnv1a64(text)).toBe(fnvReference(text));
  });
});

describe("tokenization and exclusions", () => {
  it("splits on whitespace and punctuation, keeps original offsets and normalizes each token", () => {
    const text = "  Dòng điện, chạy qua!  Dây-tóc";
    const tokens = analyzeResponse(text);
    expect(tokens.map((t) => t.text)).toEqual(["dòng", "điện", "chạy", "qua", "dây", "tóc"]);
    for (const t of tokens) expect(text.slice(t.start, t.end).normalize("NFC").toLocaleLowerCase("vi-VN")).toBe(t.text);
  });

  it("maps NFD text back to exact original offsets and matches its NFC form", () => {
    const nfc = "Điện trở của dây tóc rất lớn";
    const nfd = nfc.normalize("NFD");
    expect(nfd.length).toBeGreaterThan(nfc.length);
    const tokens = analyzeResponse(nfd);
    expect(tokens.map((t) => t.text)).toEqual(analyzeResponse(nfc).map((t) => t.text));
    for (const t of tokens) expect(nfd.slice(t.start, t.end).normalize("NFC").toLocaleLowerCase("vi-VN")).toBe(t.text);
  });

  it("excludes KaTeX spans (block then inline) and keeps an unpaired dollar as text", () => {
    const text = "độ lớn $$F = m a$$ và $U$ rồi giá $5 ở chợ";
    const tokens = analyzeResponse(text);
    const state = (t: string) => tokens.find((x) => x.text === t)?.excluded;
    expect(state("$$f")).toBe("FORMULA");
    expect(state("a$$")).toBe("FORMULA");
    expect(state("$u$")).toBe("FORMULA");
    expect(state("độ")).toBeNull();
    expect(state("giá")).toBeNull();
    expect(tokens.find((x) => x.text.includes("5"))?.excluded).toBeNull();
  });

  it("excludes formula-like words, units and the operands around a symbol-only word; pure numbers stay", () => {
    const tokens = analyzeResponse("nước h2o muối CuSO4 công thức u=i.r viết U = I.R với 220 v và 5 mol");
    const reason = (t: string) => tokens.find((x) => x.text === t)?.excluded ?? null;
    expect(reason("h2o")).toBe("FORMULA");
    expect(reason("cuso4")).toBe("FORMULA");
    expect(reason("u=i")).toBe("FORMULA");
    expect(reason("r")).toBe("FORMULA");
    expect(reason("i")).toBe("FORMULA");
    expect(reason("v")).toBe("FORMULA");
    expect(reason("mol")).toBe("FORMULA");
    expect(reason("220")).toBeNull();
    expect(reason("nước")).toBeNull();
    expect(reason("viết")).toBeNull();
  });

  it("excludes tokens covered by a prompt 5-gram on the full sequence", () => {
    const context = buildPromptContext({ text: "Giải thích vì sao dây tóc bóng đèn nóng lên khi có dòng điện" });
    const tokens = analyzeResponse("em nghĩ rằng vì sao dây tóc bóng đèn nóng lên là do điện trở", context);
    const excludedWords = tokens.filter((t) => t.excluded === "PROMPT_TEXT").map((t) => t.text);
    expect(excludedWords).toEqual(["vì", "sao", "dây", "tóc", "bóng", "đèn", "nóng", "lên"]);
    expect(tokens.find((t) => t.text === "em")?.excluded).toBeNull();
  });

  it("excludes occurrences of common phrases of 2 or more tokens, shorter than a 5-gram too", () => {
    const context = buildPromptContext({ text: "", commonPhrases: ["tác dụng nhiệt", "nhiệt", "do tác dụng nhiệt của dòng điện"] });
    const tokens = analyzeResponse("đó là tác dụng nhiệt và do tác dụng nhiệt của dòng điện nên nóng nhiệt", context);
    const phrase = tokens.filter((t) => t.excluded === "COMMON_PHRASE").map((t) => t.text);
    expect(phrase).toEqual(["tác", "dụng", "nhiệt", "do", "tác", "dụng", "nhiệt", "của", "dòng", "điện"]);
    // a one-token phrase is ignored, so the last "nhiệt" stays eligible
    expect(tokens[tokens.length - 1]).toMatchObject({ text: "nhiệt", excluded: null });
  });
});

describe("pair scoring boundaries", () => {
  it("uses integer thresholds around 0.59 / 0.60 / 0.79 / 0.80 and 7 / 8 shared", () => {
    expect(similarityLevel(59, 100)).toBeNull();
    expect(similarityLevel(7, 11)).toBeNull();
    expect(similarityLevel(8, 13)).toBe("ELEVATED");
    expect(similarityLevel(9, 15)).toBe("ELEVATED");
    expect(similarityLevel(79, 100)).toBe("ELEVATED");
    expect(similarityLevel(80, 100)).toBe("HIGH");
    expect(similarityLevel(8, 10)).toBe("HIGH");
    expect(similarityLevel(8, 0)).toBeNull();
  });
});

describe("winnowing and spans", () => {
  it("picks the minimum of each window of 4, rightmost on ties", () => {
    expect(winnow(["5", "3", "9", "4", "7", "1"])).toEqual([1, 5]);
    expect(winnow(["2", "2", "2", "2", "2"])).toEqual([3, 4]);
    expect(winnow(["9", "8", "7"])).toEqual([2]);
  });

  it("joins ranges with at most 3 tokens between them and caps at 10 spans in text order", () => {
    const range = (first: number, last: number) => ({ firstToken: first, lastToken: last, start: first * 10, end: last * 10 + 5 });
    expect(mergeRanges([range(0, 4), range(8, 12)])).toHaveLength(1); // 3 tokens between
    expect(mergeRanges([range(0, 4), range(9, 12)])).toHaveLength(2); // 4 tokens between
    expect(mergeRanges([range(0, 10), range(5, 12)])).toEqual([{ firstToken: 0, lastToken: 12, start: 0, end: 125 }]);
    const many = Array.from({ length: 15 }, (_, i) => range(i * 20, i * 20 + 4));
    const spans = toSpans(many.reverse());
    expect(spans).toHaveLength(10);
    expect(spans[0].start).toBe(0);
    expect(spans.map((s) => s.start)).toEqual([...spans.map((s) => s.start)].sort((a, b) => a - b));
  });
});

describe("computeSubmissionSimilarity", () => {
  const prompts = [{ id: "p1", text: "" }];

  it("skips responses under 40 eligible tokens and accepts 40", () => {
    expect(eligible(words(0, 39))).toBe(39);
    expect(eligible(words(0, 40))).toBe(40);
    const short = computeSubmissionSimilarity({ prompts, submissions: [sub("a", "s1", words(0, 39)), sub("b", "s2", words(0, 39))] });
    expect(short.skipped).toEqual([
      { submissionId: "a", promptId: "p1", reason: "SHORT_RESPONSE" },
      { submissionId: "b", promptId: "p1", reason: "SHORT_RESPONSE" },
    ]);
    expect(short.matches).toEqual([]);
    const enough = computeSubmissionSimilarity({ prompts, submissions: [sub("a", "s1", words(0, 40)), sub("b", "s2", words(0, 40))] });
    expect(enough.skipped).toEqual([]);
  });

  it("flags a near copy as HIGH with spans in both texts and ignores independent answers", () => {
    const original = words(0, 80);
    const copy = original.split(" ").map((w, i) => (i % 40 === 0 ? "zz" + w : w)).join(" ");
    const result = computeSubmissionSimilarity({
      prompts,
      submissions: [sub("b", "s2", copy), sub("a", "s1", original), sub("c", "s3", words(500, 80)), sub("d", "s4", words(900, 80))],
    });
    expect(result.matches).toHaveLength(1);
    const [match] = result.matches;
    expect([match.submissionAId, match.submissionBId]).toEqual(["a", "b"]);
    expect(match.level).toBe("HIGH");
    expect(match.perPrompt[0].shared).toBeGreaterThanOrEqual(8);
    expect(match.perPrompt[0].spansA.length).toBeGreaterThan(0);
    expect(match.perPrompt[0].spansB.length).toBeGreaterThan(0);
    for (const span of match.perPrompt[0].spansA) expect(original.slice(span.start, span.end)).toMatch(/^xy/);
  });

  it("does not report responses that share only prompt text and formulas, but would without exclusions", () => {
    const promptText = words(300, 120);
    const formulas = "U = I.R và CuSO4 với h2o rồi 5 mol";
    const a = `${promptText} ${formulas} ${words(0, 45)}`;
    const b = `${promptText} ${formulas} ${words(100, 45)}`;
    const subs = [sub("a", "s1", a), sub("b", "s2", b)];
    const excluded = computeSubmissionSimilarity({ prompts: [{ id: "p1", text: promptText }], submissions: subs });
    expect(excluded.skipped).toEqual([]); // not skipped as too short: the exclusion itself keeps them apart
    expect(excluded.matches).toEqual([]);
    // control: without the prompt text the copied passage would be reported
    expect(computeSubmissionSimilarity({ prompts, submissions: subs }).matches).toHaveLength(1);
  });

  it("does not report shared common phrases, but would without them", () => {
    const shared = words(300, 120);
    const a = `${shared} ${words(0, 45)}`;
    const b = `${shared} ${words(100, 45)}`;
    const subs = [sub("a", "s1", a), sub("b", "s2", b)];
    const excluded = computeSubmissionSimilarity({ prompts: [{ id: "p1", text: "", commonPhrases: [shared] }], submissions: subs });
    expect(excluded.skipped).toEqual([]);
    expect(excluded.matches).toEqual([]);
    expect(computeSubmissionSimilarity({ prompts, submissions: subs }).matches).toHaveLength(1);
  });

  it("never compares a student with their own submissions", () => {
    const text = words(0, 80);
    const result = computeSubmissionSimilarity({ prompts, submissions: [sub("old", "s1", text), sub("new", "s1", text)] });
    expect(result.matches).toEqual([]);
  });

  it("matches an NFD copy with an NFC text and maps spans to each text's own offsets", () => {
    const base = Array.from({ length: 70 }, (_, i) => ["điện", "trở", "nhiệt", "dòng", "chạy", "tóc", "bóng", "đèn", "sáng", "nóng"][i % 10] + word(i)).join(" ");
    const nfc = base.normalize("NFC");
    const nfd = base.normalize("NFD");
    expect(nfd).not.toBe(nfc);
    const result = computeSubmissionSimilarity({ prompts, submissions: [sub("a", "s1", nfc), sub("b", "s2", nfd)] });
    expect(result.matches).toHaveLength(1);
    const { spansA, spansB } = result.matches[0].perPrompt[0];
    expect(spansA.length).toBeGreaterThan(0);
    expect(spansA.length).toBe(spansB.length);
    spansA.forEach((span, i) => expect(nfc.slice(span.start, span.end).normalize("NFC")).toBe(nfd.slice(spansB[i].start, spansB[i].end).normalize("NFC")));
  });

  it("lists only the prompts that reach the threshold and sorts pairs by containment then ids", () => {
    const text = words(0, 80);
    const twoPrompts = [{ id: "p1", text: "" }, { id: "p2", text: "" }];
    const mk = (id: string, student: string, p1: string, p2: string): SimilaritySubmission => ({ id, studentId: student, responses: [{ promptId: "p1", text: p1 }, { promptId: "p2", text: p2 }] });
    const partial = text.split(" ").map((w, i) => (i % 5 === 0 ? "q" + w : w)).join(" ");
    const result = computeSubmissionSimilarity({
      prompts: twoPrompts,
      submissions: [mk("c", "s3", text, words(700, 80)), mk("a", "s1", text, words(200, 80)), mk("b", "s2", text, words(400, 80)), mk("d", "s4", partial, words(900, 80))],
    });
    for (const match of result.matches) expect(match.perPrompt.map((p) => p.promptId)).toEqual(["p1"]);
    const keys = result.matches.map((m) => `${m.submissionAId}${m.submissionBId}`);
    expect(keys.slice(0, 3)).toEqual(["ab", "ac", "bc"]);
    const containments = result.matches.map((m) => m.maxContainment);
    expect(containments).toEqual([...containments].sort((x, y) => y - x));
  });

  it("is deterministic and records the algorithm version", () => {
    const subs = [sub("a", "s1", words(0, 60)), sub("b", "s2", words(0, 60))];
    const first = computeSubmissionSimilarity({ prompts, submissions: subs });
    expect(first.algorithmVersion).toBe("subsim@1");
    expect(computeSubmissionSimilarity({ prompts, submissions: [...subs].reverse() })).toEqual(first);
  });
});

describe("subsim@1 performance", () => {
  it("compares 200 submissions x 5 prompts in under 2 s and finds the planted copies", () => {
    let seed = 12345;
    const random = () => {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed / 4294967296;
    };
    const vocabulary = 6000;
    const response = () => Array.from({ length: 140 }, () => word(Math.floor(random() * vocabulary))).join(" ");
    const promptList = Array.from({ length: 5 }, (_, i) => ({ id: `p${i}`, text: `${words(7000 + i * 20, 12)}` }));
    const submissions: SimilaritySubmission[] = Array.from({ length: 200 }, (_, i) => ({
      id: `s${String(i).padStart(3, "0")}`,
      studentId: `u${i}`,
      responses: promptList.map((p) => ({ promptId: p.id, text: response() })),
    }));
    // plant 10 near copies: submission 2k+1 copies prompt p0 of submission 2k (k < 10)
    const planted: Array<[string, string]> = [];
    for (let k = 0; k < 10; k++) {
      const from = submissions[2 * k];
      const to = submissions[2 * k + 1];
      to.responses[0].text = from.responses[0].text.split(" ").map((w, i) => (i % 30 === 0 ? "zz" + w : w)).join(" ");
      planted.push([from.id, to.id]);
    }
    const started = performance.now();
    const result = computeSubmissionSimilarity({ prompts: promptList, submissions });
    const elapsed = performance.now() - started;
    console.log(`subsim@1 200 submissions x 5 prompts: ${elapsed.toFixed(0)} ms, ${result.matches.length} matches`);
    expect(elapsed).toBeLessThan(2000);
    const found = new Set(result.matches.map((m) => `${m.submissionAId}|${m.submissionBId}`));
    for (const [a, b] of planted) expect(found.has(`${a}|${b}`)).toBe(true);
    expect(result.matches).toHaveLength(planted.length);
  });
});
