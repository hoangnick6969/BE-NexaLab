/**
 * TAI2-T0 privacy contract, enforced in code (privacy-scrubbing-contract.md). Pure functions, no database, no provider.
 *
 * 1. `redact` replaces known identities (the submitting student and every approved class member: full name, name
 *    tokens of at least 2 characters, username, email, user id) with [HỌC_SINH], and emails, phone numbers, URLs,
 *    9–12 digit identifier numbers and class names with [ĐÃ_ẨN]. It keeps an offset map back to the original text so
 *    evidence can be highlighted in the student's real answer.
 * 2. `assertProviderPayloadSafe` is the fail-closed guard of the provider payload builder: the payload must have exactly
 *    the AssessPromptPayload keys (an unknown or forbidden key such as studentId, className or similarity fails), and
 *    no string may still contain an identifier. Any violation throws PrivacyGuardError and nothing is sent.
 *
 * Redaction of known identifiers is not a guarantee against indirect identification (SPEC constraint); it is one layer
 * on top of minimization (only the payload fields leave the server) and the data-not-instructions delimiting.
 */
export const STUDENT_TOKEN = "[HỌC_SINH]";
export const HIDDEN_TOKEN = "[ĐÃ_ẨN]";
export const REDACTION_VERSION = "redact@1";

/** Identities known to the server for one submission. Never part of the snapshot or the provider payload. */
export type KnownIdentities = {
  /** Submitting student and approved class members. */
  people: Array<{ id: string; fullName: string | null; username: string | null; email: string | null }>;
  classNames: string[];
};

export type IdentifierKind = "KNOWN_NAME" | "KNOWN_USERNAME" | "KNOWN_EMAIL" | "KNOWN_ID" | "NAME_TOKEN" | "EMAIL" | "PHONE" | "URL" | "ID_NUMBER" | "CLASS_NAME";

/** One replacement: [rStart, rEnd) in the redacted text stands for [oStart, oEnd) in the original. */
export type Replacement = { rStart: number; rEnd: number; oStart: number; oEnd: number; kind: IdentifierKind };
export type OffsetMap = Replacement[];

type Hit = { start: number; end: number; kind: IdentifierKind };

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** Whole-word match: no letter, digit or underscore directly before or after (Unicode-aware, case-insensitive). */
const wordPattern = (literal: string) => new RegExp(`(?<![\\p{L}\\p{N}_])${escapeRegex(literal)}(?![\\p{L}\\p{N}_])`, "giu");

const EMAIL = /[\p{L}\p{N}._%+-]+@[\p{L}\p{N}.-]+\.[\p{L}]{2,}/gu;
const PHONE = /(?<![\p{N}])(?:\+84|0)[0-9 .-]{8,12}/gu;
const URL = /\b(?:https?:\/\/|www\.)[^\s<>"]+/giu;
const ID_NUMBER = /(?<![\p{N}.,])\d{9,12}(?![\p{N}]|[.,]\d)/gu;

function patternHits(text: string, pattern: RegExp, kind: IdentifierKind, accept: (match: string) => number | null = (m) => m.length): Hit[] {
  const hits: Hit[] = [];
  for (const match of text.matchAll(new RegExp(pattern.source, pattern.flags))) {
    const length = accept(match[0]);
    if (length && length > 0) hits.push({ start: match.index!, end: match.index! + length, kind });
  }
  return hits;
}

/** Phone matches end on a digit and hold 9–12 digits (the spec pattern also swallows trailing separators). */
const phoneLength = (match: string) => {
  const trimmed = match.replace(/[ .-]+$/, "");
  const digits = trimmed.replace(/\D/g, "").length;
  return digits >= 9 && digits <= 12 ? trimmed.length : null;
};

type Literal = { value: string; kind: IdentifierKind };

/** Strong identifiers: whole names, usernames, emails, ids and class names (no single name tokens). */
function strongLiterals(identities: KnownIdentities): Literal[] {
  const out: Literal[] = [];
  for (const person of identities.people) {
    const name = person.fullName?.trim().normalize("NFC");
    if (name && [...name].length >= 2) out.push({ value: name, kind: "KNOWN_NAME" });
    if (person.username && person.username.trim().length >= 2) out.push({ value: person.username.trim(), kind: "KNOWN_USERNAME" });
    if (person.email && person.email.trim().length >= 3) out.push({ value: person.email.trim(), kind: "KNOWN_EMAIL" });
    if (person.id && person.id.length >= 6) out.push({ value: person.id, kind: "KNOWN_ID" });
  }
  for (const className of identities.classNames) {
    const value = className.trim().normalize("NFC");
    if ([...value].length >= 2) out.push({ value, kind: "CLASS_NAME" });
  }
  return out;
}

/** Name tokens of at least 2 characters (assessment-validation-and-evaluation.md, "Redaction"). */
function nameTokens(identities: KnownIdentities): Literal[] {
  const tokens = new Set<string>();
  for (const person of identities.people)
    for (const token of (person.fullName ?? "").normalize("NFC").split(/[\s\p{P}]+/u)) if ([...token].length >= 2) tokens.add(token);
  return [...tokens].map((value) => ({ value, kind: "NAME_TOKEN" as const }));
}

function findHits(text: string, identities: KnownIdentities, options: { nameTokens: boolean }): Hit[] {
  const literals = [...strongLiterals(identities), ...(options.nameTokens ? nameTokens(identities) : [])];
  const hits: Hit[] = [
    ...patternHits(text, EMAIL, "EMAIL"),
    ...patternHits(text, URL, "URL", (m) => m.replace(/[.,;:!?)\]]+$/, "").length),
    ...patternHits(text, PHONE, "PHONE", phoneLength),
    ...patternHits(text, ID_NUMBER, "ID_NUMBER"),
  ];
  for (const literal of literals) hits.push(...patternHits(text, wordPattern(literal.value), literal.kind));
  // Earliest first, then the longest, then a known person before a generic pattern (a classmate's email is [HỌC_SINH]):
  // overlapping matches collapse into the first one.
  const rank = (hit: Hit) => (STUDENT_KINDS.has(hit.kind) ? 0 : 1);
  hits.sort((a, b) => a.start - b.start || b.end - a.end || rank(a) - rank(b));
  const kept: Hit[] = [];
  for (const hit of hits) {
    const last = kept[kept.length - 1];
    if (last && hit.start < last.end) {
      if (hit.end > last.end) last.end = hit.end;
      continue;
    }
    kept.push({ ...hit });
  }
  return kept;
}

const STUDENT_KINDS = new Set<IdentifierKind>(["KNOWN_NAME", "KNOWN_USERNAME", "KNOWN_EMAIL", "KNOWN_ID", "NAME_TOKEN"]);

/** Redacts one response. Text is NFC-normalized first (stored responses already are). */
export function redact(response: string, identities: KnownIdentities): { text: string; offsetMap: OffsetMap } {
  const original = response.normalize("NFC");
  const hits = findHits(original, identities, { nameTokens: true });
  let text = "";
  let cursor = 0;
  const offsetMap: OffsetMap = [];
  for (const hit of hits) {
    text += original.slice(cursor, hit.start);
    const token = STUDENT_KINDS.has(hit.kind) ? STUDENT_TOKEN : HIDDEN_TOKEN;
    offsetMap.push({ rStart: text.length, rEnd: text.length + token.length, oStart: hit.start, oEnd: hit.end, kind: hit.kind });
    text += token;
    cursor = hit.end;
  }
  text += original.slice(cursor);
  return { text, offsetMap };
}

/** Maps [start, end) of the redacted text to the original text; a range touching a token covers the whole original identifier. */
export function toOriginalRange(map: OffsetMap, start: number, end: number): { start: number; end: number } {
  const position = (p: number, edge: "start" | "end") => {
    let delta = 0;
    for (const r of map) {
      if (p < r.rStart) break;
      if (p < r.rEnd || (edge === "end" && p === r.rEnd)) return edge === "start" ? r.oStart : r.oEnd;
      delta = r.oEnd - r.rEnd;
    }
    return p + delta;
  };
  return { start: position(start, "start"), end: position(end, "end") };
}

/** Identifiers still present in a text. Responses are checked with name tokens; teacher-authored text without them. */
export function residualIdentifiers(text: string, identities: KnownIdentities, options: { nameTokens: boolean }): IdentifierKind[] {
  const withoutTokens = text.split(STUDENT_TOKEN).join(" ").split(HIDDEN_TOKEN).join(" ");
  return [...new Set(findHits(withoutTokens, identities, options).map((hit) => hit.kind))];
}

/** Share of the response characters that were replaced (data-minimization rule of g2-pii-scrub@1). */
export function redactedShare(original: string, map: OffsetMap): number {
  const length = original.normalize("NFC").trim().length;
  if (!length) return 1;
  return map.reduce((sum, r) => sum + (r.oEnd - r.oStart), 0) / length;
}
/** A response that is mostly personal data is not sent at all (AI_POLICY_INELIGIBLE, detail REDACTION_DOMINANT). */
export const MAX_REDACTED_SHARE = 0.5;

// ---------- fail-closed provider payload guard ----------

/** AssessPromptPayload (prompt-spec.md): the only data that may reach a provider. */
export type AssessPromptPayload = {
  topic: string;
  prompts: Array<{
    promptId: string;
    question: string;
    referenceAnswer: string | null;
    criteria: Array<{ criterionCode: string; description: string; maxPoints: number; anchors: Array<{ points: number; description: string }> }>;
    response: string;
  }>;
};

export class PrivacyGuardError extends Error {
  constructor(readonly reasons: string[]) {
    // Reasons are field paths and identifier kinds only, never the matched text, so the error is safe to log.
    super(`PRIVACY_GUARD_REJECTED: ${reasons.join(", ")}`);
    this.name = "PrivacyGuardError";
  }
}

const KEYS = {
  payload: ["topic", "prompts"],
  prompt: ["promptId", "question", "referenceAnswer", "criteria", "response"],
  criterion: ["criterionCode", "description", "maxPoints", "anchors"],
  anchor: ["points", "description"],
} as const;

const isObject = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);

/**
 * Throws PrivacyGuardError unless `payload` has exactly the AssessPromptPayload shape and no identifier remains in any
 * string. Responses are checked with name tokens (they were redacted with them); teacher-authored strings are checked
 * for whole names, usernames, emails, ids, class names and the email/phone/URL/ID-number patterns.
 */
export function assertProviderPayloadSafe(payload: unknown, identities: KnownIdentities): asserts payload is AssessPromptPayload {
  const reasons: string[] = [];
  const keysExactly = (value: unknown, allowed: readonly string[], path: string) => {
    if (!isObject(value)) return void reasons.push(`${path}:NOT_OBJECT`);
    for (const key of Object.keys(value)) if (!allowed.includes(key)) reasons.push(`${path}.${key}:FORBIDDEN_FIELD`);
    for (const key of allowed) if (!(key in value)) reasons.push(`${path}.${key}:MISSING_FIELD`);
  };
  const text = (value: unknown, path: string, kind: "teacher" | "response", nullable = false) => {
    if (nullable && value === null) return;
    if (typeof value !== "string") return void reasons.push(`${path}:NOT_STRING`);
    for (const found of residualIdentifiers(value, identities, { nameTokens: kind === "response" })) reasons.push(`${path}:${found}`);
  };
  keysExactly(payload, KEYS.payload, "payload");
  if (!isObject(payload)) throw new PrivacyGuardError(reasons);
  text(payload.topic, "payload.topic", "teacher");
  if (!Array.isArray(payload.prompts) || payload.prompts.length === 0) reasons.push("payload.prompts:NOT_ARRAY");
  (Array.isArray(payload.prompts) ? payload.prompts : []).forEach((prompt: unknown, i: number) => {
    const p = `payload.prompts.${i}`;
    keysExactly(prompt, KEYS.prompt, p);
    if (!isObject(prompt)) return;
    if (typeof prompt.promptId !== "string" || !/^[\w-]{1,80}$/.test(prompt.promptId)) reasons.push(`${p}.promptId:INVALID`);
    text(prompt.question, `${p}.question`, "teacher");
    text(prompt.referenceAnswer, `${p}.referenceAnswer`, "teacher", true);
    text(prompt.response, `${p}.response`, "response");
    if (!Array.isArray(prompt.criteria)) return void reasons.push(`${p}.criteria:NOT_ARRAY`);
    prompt.criteria.forEach((criterion: unknown, j: number) => {
      const c = `${p}.criteria.${j}`;
      keysExactly(criterion, KEYS.criterion, c);
      if (!isObject(criterion)) return;
      if (typeof criterion.criterionCode !== "string" || !/^[A-Z][A-Z0-9_]{1,31}$/.test(criterion.criterionCode)) reasons.push(`${c}.criterionCode:INVALID`);
      if (typeof criterion.maxPoints !== "number") reasons.push(`${c}.maxPoints:NOT_NUMBER`);
      text(criterion.description, `${c}.description`, "teacher");
      if (!Array.isArray(criterion.anchors)) return void reasons.push(`${c}.anchors:NOT_ARRAY`);
      criterion.anchors.forEach((anchor: unknown, k: number) => {
        keysExactly(anchor, KEYS.anchor, `${c}.anchors.${k}`);
        if (!isObject(anchor)) return;
        if (typeof anchor.points !== "number") reasons.push(`${c}.anchors.${k}.points:NOT_NUMBER`);
        text(anchor.description, `${c}.anchors.${k}.description`, "teacher");
      });
    });
  });
  if (reasons.length) throw new PrivacyGuardError(reasons);
}
