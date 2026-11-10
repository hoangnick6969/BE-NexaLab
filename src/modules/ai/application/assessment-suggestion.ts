import { z } from "zod";
import { HIDDEN_TOKEN, STUDENT_TOKEN, toOriginalRange, type AssessPromptPayload, type OffsetMap } from "./assessment-privacy";

/**
 * TAI2-T4 output side of ASSESS_SUBMISSION (assessment-validation-and-evaluation.md, prompt-spec.md). Pure functions:
 * `parseAssessmentOutput` (strict Zod + KX-01), `detectInjection` (injection@1) and `verifySuggestion` (VA-01..VA-05).
 * Model output is never corrected: a failed criterion keeps `valid: false` with a reason and null points.
 */
export const INJECTION_PATTERN_VERSION = "injection@1";

/** Stored on AiJob.inputSnapshot. It carries no student, enrollment or class identity and no similarity data. */
export type AssessSnapshotV1 = {
  version: "assess-snapshot@1";
  redaction: string;
  payload: AssessPromptPayload;
  /** Per promptId: redacted -> original offsets (numbers only), to highlight evidence in the real answer. */
  offsetMaps: Record<string, OffsetMap>;
};

const criterionSchema = z
  .object({
    promptId: z.string().min(1).max(80),
    criterionCode: z.string().min(1).max(40),
    suggestedPoints: z.number(),
    rationale: z.string().min(1).max(500),
    evidenceQuotes: z.array(z.string().max(300)).max(3),
    uncertainty: z.string().max(300).nullable(),
  })
  .strict();
export const assessmentSuggestionV1 = z.object({ criteria: z.array(criterionSchema).max(60) }).strict();
export type AssessmentSuggestionV1 = z.infer<typeof assessmentSuggestionV1>;

/** KX-01: an unescaped LaTeX command shows up as a control character after JSON.parse (\f, \t, \b, \r, \n). */
const CONTROL = /[\u0000-\u001f]/;

/** JSON.parse + strict schema + KX-01. Any failure is OUTPUT_SCHEMA_INVALID (retried once by the runner). No pre-parse repair. */
export function parseAssessmentOutput(raw: string): { ok: true; value: AssessmentSuggestionV1 } | { ok: false; code: "OUTPUT_SCHEMA_INVALID"; rule: "JSON" | "SCHEMA" | "KX-01" } {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return { ok: false, code: "OUTPUT_SCHEMA_INVALID", rule: "JSON" };
  }
  const parsed = assessmentSuggestionV1.safeParse(json);
  if (!parsed.success) return { ok: false, code: "OUTPUT_SCHEMA_INVALID", rule: "SCHEMA" };
  if (parsed.data.criteria.some((c) => CONTROL.test(c.rationale) || (c.uncertainty !== null && CONTROL.test(c.uncertainty))))
    return { ok: false, code: "OUTPUT_SCHEMA_INVALID", rule: "KX-01" };
  return { ok: true, value: parsed.data };
}

/** Case- and diacritic-insensitive form used by injection@1 (đ -> d, combining marks removed). */
export const foldDiacritics = (text: string) =>
  text.normalize("NFD").replace(/\p{M}+/gu, "").replace(/đ/g, "d").replace(/Đ/g, "D").toLowerCase();

/** injection@1 (assessment-validation-and-evaluation.md), written on the folded text. */
const INJECTION_PATTERNS = [
  /bo qua (moi|cac)? ?(huong dan|yeu cau)/,
  /cho (toi|em|bai nay)? ?(\d+|toi da|diem tuyet doi)/,
  /ignore (all|previous|the) (instructions|rubric)/,
  /give (full|maximum) (marks|points)/,
  /system prompt/,
  /you are (now )?an? /,
];

/** True when any redacted response matches injection@1; the runner then makes no provider call. */
export function detectInjection(payload: AssessPromptPayload): boolean {
  return payload.prompts.some((prompt) => {
    const folded = foldDiacritics(prompt.response).replace(/\s+/g, " ");
    return INJECTION_PATTERNS.some((pattern) => pattern.test(folded));
  });
}

export type EvidenceSpan = { quote: string; start: number; end: number };
export type CriterionResult = {
  promptId: string;
  criterionCode: string;
  valid: boolean;
  reasonCode: "CRITERION_MISSING" | "CRITERION_DUPLICATE" | "POINTS_OUT_OF_RANGE" | "EVIDENCE_MISSING" | null;
  suggestedPoints: number | null;
  rationale: string | null;
  uncertainty: string | null;
  /** Verified quotes with [start, end) offsets in the ORIGINAL (unredacted) response of the same prompt. */
  evidence: EvidenceSpan[];
  returnedQuotes: number;
  verifiedQuotes: number;
};
export type SuggestionStatus = "VALID" | "PARTIAL" | "SUPPRESSED";

/** Whitespace-normalized text with an index back to the source string. */
function normalizeWithIndex(text: string) {
  let out = "";
  const index: number[] = [];
  let inSpace = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (/\s/.test(ch)) {
      if (!inSpace && out.length > 0) {
        out += " ";
        index.push(i);
      }
      inSpace = true;
      continue;
    }
    inSpace = false;
    out += ch;
    index.push(i);
  }
  if (out.endsWith(" ")) {
    out = out.slice(0, -1);
    index.pop();
  }
  return { text: out, index };
}
const normalizeSpaces = (text: string) => text.replace(/\s+/g, " ").trim();
const onlyTokens = (quote: string) => quote.split(STUDENT_TOKEN).join("").split(HIDDEN_TOKEN).join("").replace(/[\s\p{P}\p{S}]/gu, "").length === 0;

/** VA-03 + VA-05 for one quote: a verified span in the redacted response, or null when the quote is dropped. */
function locateQuote(quote: string, response: string, question: string): { start: number; end: number } | null {
  const q = normalizeSpaces(quote);
  if ([...q].length < 5 || onlyTokens(q)) return null; // VA-05 (token only) and the 5-char minimum
  if (normalizeSpaces(question).includes(q)) return null; // VA-05: copies the prompt text itself
  const { text, index } = normalizeWithIndex(response);
  const at = text.indexOf(q);
  if (at < 0) return null; // VA-03: not an exact substring after whitespace normalization
  return { start: index[at], end: index[at + q.length - 1] + 1 };
}

const onGrid = (points: number) => Number.isFinite(points) && Math.round(points * 2) === points * 2;

/**
 * VA-01..VA-05 over every rubric criterion of the snapshot (unknown output codes are ignored). Status is VALID when all
 * criteria are valid, PARTIAL when at least one is, SUPPRESSED when none is.
 */
export function verifySuggestion(snapshot: AssessSnapshotV1, output: AssessmentSuggestionV1): { status: SuggestionStatus; criterionResults: CriterionResult[] } {
  const results: CriterionResult[] = [];
  for (const prompt of snapshot.payload.prompts) {
    for (const criterion of prompt.criteria) {
      const entries = output.criteria.filter((c) => c.promptId === prompt.promptId && c.criterionCode === criterion.criterionCode);
      const base = { promptId: prompt.promptId, criterionCode: criterion.criterionCode };
      const invalid = (reasonCode: CriterionResult["reasonCode"], returnedQuotes = 0, verifiedQuotes = 0): CriterionResult => ({
        ...base, valid: false, reasonCode, suggestedPoints: null, rationale: null, uncertainty: null, evidence: [], returnedQuotes, verifiedQuotes,
      });
      if (entries.length === 0) {
        results.push(invalid("CRITERION_MISSING"));
        continue;
      }
      if (entries.length > 1) {
        results.push(invalid("CRITERION_DUPLICATE", entries.reduce((n, e) => n + e.evidenceQuotes.length, 0)));
        continue;
      }
      const entry = entries[0];
      const evidence: EvidenceSpan[] = [];
      for (const quote of entry.evidenceQuotes) {
        const span = locateQuote(quote, prompt.response, prompt.question);
        if (!span) continue;
        const original = toOriginalRange(snapshot.offsetMaps[prompt.promptId] ?? [], span.start, span.end);
        evidence.push({ quote: prompt.response.slice(span.start, span.end), start: original.start, end: original.end });
      }
      const counts = [entry.evidenceQuotes.length, evidence.length] as const;
      if (entry.suggestedPoints < 0 || entry.suggestedPoints > criterion.maxPoints || !onGrid(entry.suggestedPoints)) {
        results.push(invalid("POINTS_OUT_OF_RANGE", ...counts));
        continue;
      }
      if (entry.suggestedPoints > 0 && evidence.length === 0) {
        results.push(invalid("EVIDENCE_MISSING", ...counts));
        continue;
      }
      results.push({
        ...base, valid: true, reasonCode: null, suggestedPoints: entry.suggestedPoints, rationale: entry.rationale, uncertainty: entry.uncertainty,
        evidence, returnedQuotes: counts[0], verifiedQuotes: counts[1],
      });
    }
  }
  const validCount = results.filter((r) => r.valid).length;
  const status: SuggestionStatus = validCount === results.length && validCount > 0 ? "VALID" : validCount > 0 ? "PARTIAL" : "SUPPRESSED";
  return { status, criterionResults: results };
}

/** The SUPPRESSED suggestion written when injection@1 matched: every criterion invalid, no provider call made. */
export function suppressedForInjection(snapshot: AssessSnapshotV1): CriterionResult[] {
  return snapshot.payload.prompts.flatMap((prompt) =>
    prompt.criteria.map((criterion) => ({
      promptId: prompt.promptId, criterionCode: criterion.criterionCode, valid: false, reasonCode: null, suggestedPoints: null,
      rationale: null, uncertainty: null, evidence: [], returnedQuotes: 0, verifiedQuotes: 0,
    })));
}
