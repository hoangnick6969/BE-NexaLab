import type { InputSnapshotV1 } from "./generate-resource-prompt";
import { jaccard, NEAR_DUPLICATE_THRESHOLD, normalizeText, trigrams, type ResourceItem } from "./resource-items";

export type DropReason =
  | "ITEM_TYPE_MISMATCH"
  | "LENGTH_INVALID"
  | "ANSWER_KEY_INVALID"
  | "OPTIONS_NOT_DISTINCT"
  | "OPTION_PATTERN_FORBIDDEN"
  | "GROUNDING_REF_INVALID"
  | "OUTCOME_INVALID"
  | "SAFETY_REJECTED"
  | "OVER_COUNT";

export type WarningFlag =
  | "EXACT_DUPLICATE"
  | "NEAR_DUPLICATE"
  | "EXACT_DUPLICATE_ELSEWHERE"
  | "NEAR_DUPLICATE_ELSEWHERE"
  | "NUMERIC_REVIEW"
  | "ANSWER_LENGTH_CUE"
  | "NEGATIVE_STEM"
  | "DIFFICULTY_MISMATCH"
  | "BATCH_DUPLICATE";

/** Existing class question prompts and card fronts (non-archived resources), read outside the write transaction. */
/** Plain texts (class-only VW-01/VW-02), or since TAI3-T2 a qdup@1 flagger over the teacher's classes and the library. */
export type DuplicateCorpus = string[] | ((text: string) => string[]);

export type ValidatedItem = { position: number; payload: ResourceItem; flags: WarningFlag[] };
export type DroppedItem = { position: number; reasonCodes: DropReason[] };

const LIMITS = { text: 500, explanation: 1000, minOptions: 2, maxOptions: 6 } as const;

/** VR-05: "all / none of the above" style options, matched on normalized text. */
const FORBIDDEN_OPTION = [
  /tất cả (các )?(đáp án|phương án|ý|câu)( trên)?( đều)?( đúng| sai)?$/u,
  /^tất cả đều (đúng|sai)$/u,
  /^cả [a-f] (và|lẫn) [a-f]( đều đúng)?$/u,
  /^cả [a-f], [a-f]( và [a-f])?$/u,
  /không có (đáp án|phương án|ý|câu) nào( đúng)?/u,
  /^không (đáp án|phương án) nào (đúng|sai)$/u,
  /^(all|none) of the above$/u,
];

/**
 * VR-08: reuses the unsafe-topic list of labs/infrastructure/llm.ts (copied, that adapter stays untouched and cannot be
 * imported across modules) and extends it with mains sockets, self-medication and self-mixed substances.
 */
const UNSAFE = [
  /ngoài đời|uống|nếm|điện lưới|tự chế|trộn hóa chất/iu,
  /ổ cắm( điện)?|nguồn điện 220|220 ?v\b|tự pha chế|tự điều trị|tự chữa|liều (dùng|thuốc)/iu,
];

/** VR-08 as a single check, shared with other Teacher AI purposes (TAI-06 rationale safety). */
export const isUnsafeText = (text: string) => UNSAFE.some((pattern) => pattern.test(text.normalize("NFC")));

const UNIT_TOKEN = /(?<![\p{L}])(V|A|Ω|g|kg|mg|mol|°C|km\/h|m\/s|m|cm|mm|km|s|J|W|N|Pa|L|ml)(?![\p{L}])/u;
const NEGATION = /(^|[\s,(])(không|sai)([\s,.?!)]|$)/u;

const len = (value: string) => value.trim().length;
const textFields = (item: ResourceItem) => (item.type === "CARD" ? [item.front, item.back] : [item.prompt, ...item.options, item.explanation]);
const keyText = (item: ResourceItem) => (item.type === "CARD" ? item.front : item.prompt);
const expectedType = (targetKind: string) => (targetKind === "DECK" ? "CARD" : "SINGLE_CHOICE");

/** VR-02..VR-05 and VR-08: the structural rules an EDITED payload must also pass (TAI-T4 returns AI_EDIT_INVALID). */
export function structuralDropReasons(item: ResourceItem): DropReason[] {
  const reasons = new Set<DropReason>();
  if (item.type === "CARD") {
    if (len(item.front) < 1 || item.front.length > LIMITS.text || len(item.back) < 1 || item.back.length > LIMITS.text) reasons.add("LENGTH_INVALID");
  } else {
    if (len(item.prompt) < 1 || item.prompt.length > LIMITS.text) reasons.add("LENGTH_INVALID");
    if (item.options.some((option) => len(option) < 1 || option.length > LIMITS.text)) reasons.add("LENGTH_INVALID");
    if (len(item.explanation) < 1 || item.explanation.length > LIMITS.explanation) reasons.add("LENGTH_INVALID");
    if (item.options.length < LIMITS.minOptions || item.options.length > LIMITS.maxOptions || !Number.isInteger(item.correctOption) ||
        item.correctOption < 0 || item.correctOption >= item.options.length)
      reasons.add("ANSWER_KEY_INVALID");
    const normalized = item.options.map(normalizeText);
    if (new Set(normalized).size !== normalized.length) reasons.add("OPTIONS_NOT_DISTINCT");
    if (normalized.some((option) => FORBIDDEN_OPTION.some((pattern) => pattern.test(option)))) reasons.add("OPTION_PATTERN_FORBIDDEN");
  }
  if (textFields(item).some((text) => UNSAFE.some((pattern) => pattern.test(text.normalize("NFC"))))) reasons.add("SAFETY_REJECTED");
  return [...reasons];
}

/** VR-01..VR-08 for one item (VR-10 depends on the batch and is applied by validateItems). */
export function dropReasons(item: ResourceItem, snapshot: InputSnapshotV1): DropReason[] {
  if (item.type !== expectedType(snapshot.constraints.targetKind)) return ["ITEM_TYPE_MISMATCH"];
  const reasons = new Set<DropReason>(structuralDropReasons(item));
  const passageIds = new Set(snapshot.passages.map((passage) => passage.id));
  if (item.sourceRefs.length === 0 || item.sourceRefs.some((ref) => !passageIds.has(ref))) reasons.add("GROUNDING_REF_INVALID");
  if (item.type === "SINGLE_CHOICE") {
    const outcomes = new Set(snapshot.outcomes.map((outcome) => outcome.code));
    if (item.outcomeCodes.some((code) => !outcomes.has(code))) reasons.add("OUTCOME_INVALID");
  }
  return [...reasons];
}

/** VW-03..VW-06: warnings that depend only on the item and the request. */
export function contentFlags(item: ResourceItem, requestedDifficulty: string | null): WarningFlag[] {
  if (item.type !== "SINGLE_CHOICE") return [];
  const flags: WarningFlag[] = [];
  const numeric = [item.prompt, ...item.options].some((text) => /[0-9]/.test(text) && (/[=%]/.test(text) || UNIT_TOKEN.test(text)));
  if (numeric) flags.push("NUMERIC_REVIEW");
  const key = item.options[item.correctOption] ?? "";
  const others = item.options.filter((_, index) => index !== item.correctOption);
  const mean = others.reduce((sum, option) => sum + option.length, 0) / Math.max(others.length, 1);
  if (others.every((option) => key.length > option.length) && key.length >= 1.5 * mean) flags.push("ANSWER_LENGTH_CUE");
  if (NEGATION.test(normalizeText(item.prompt))) flags.push("NEGATIVE_STEM");
  if (requestedDifficulty && item.difficulty !== requestedDifficulty) flags.push("DIFFICULTY_MISMATCH");
  return flags;
}

/** VW-01/VW-02 against the class corpus. A duplicate is a warning only; it never blocks accept or materialization. */
export function corpusFlags(item: ResourceItem, corpus: { exact: Set<string>; grams: Array<Set<string>> }): WarningFlag[] {
  const normalized = normalizeText(keyText(item));
  const flags: WarningFlag[] = [];
  if (corpus.exact.has(normalized)) flags.push("EXACT_DUPLICATE");
  const grams = trigrams(normalized);
  if (corpus.grams.some((other) => jaccard(grams, other) >= NEAR_DUPLICATE_THRESHOLD)) flags.push("NEAR_DUPLICATE");
  return flags;
}

export function prepareCorpus(corpus: string[]) {
  const normalized = corpus.map(normalizeText).filter(Boolean);
  return { exact: new Set(normalized), grams: normalized.map(trigrams) };
}

/**
 * validateItems(snapshot, targetKind, parsedOutput, duplicateCorpus) -> { items, dropped } (validation-rules.md).
 * Pure: no database or provider. Drop rules run first; VR-10 then drops survivors beyond the requested count, so the
 * teacher receives up to itemCount valid items. Warnings are computed on survivors, including batch duplicates
 * (VW-02 against any other surviving item, VW-07 against an earlier one).
 */
export function validateItems(snapshot: InputSnapshotV1, items: ResourceItem[], duplicateCorpus: DuplicateCorpus) {
  const dropped: DroppedItem[] = [];
  const survivors: Array<{ position: number; payload: ResourceItem }> = [];
  items.forEach((payload, position) => {
    const reasons = dropReasons(payload, snapshot);
    if (reasons.length > 0) dropped.push({ position, reasonCodes: reasons });
    else if (survivors.length >= snapshot.constraints.itemCount) dropped.push({ position, reasonCodes: ["OVER_COUNT"] });
    else survivors.push({ position, payload });
  });

  const flagger = typeof duplicateCorpus === "function" ? duplicateCorpus : null;
  const corpus = prepareCorpus(flagger ? [] : (duplicateCorpus as string[]));
  const keys = survivors.map((survivor) => normalizeText(keyText(survivor.payload)));
  const grams = keys.map(trigrams);
  const validated: ValidatedItem[] = survivors.map((survivor, index) => {
    const corpusHits = flagger ? (flagger(keyText(survivor.payload)) as WarningFlag[]) : corpusFlags(survivor.payload, corpus);
    const flags = new Set<WarningFlag>([...corpusHits, ...contentFlags(survivor.payload, snapshot.constraints.difficulty)]);
    for (let other = 0; other < survivors.length; other++) {
      if (other === index) continue;
      const exact = keys[other] === keys[index];
      const near = jaccard(grams[index], grams[other]) >= NEAR_DUPLICATE_THRESHOLD;
      if (near) flags.add("NEAR_DUPLICATE");
      if (other < index && (exact || near)) flags.add("BATCH_DUPLICATE");
    }
    return { position: survivor.position, payload: survivor.payload, flags: ORDER.filter((flag) => flags.has(flag)) };
  });
  return { items: validated, dropped };
}

const ORDER: WarningFlag[] = ["EXACT_DUPLICATE", "NEAR_DUPLICATE", "EXACT_DUPLICATE_ELSEWHERE", "NEAR_DUPLICATE_ELSEWHERE", "BATCH_DUPLICATE", "NUMERIC_REVIEW", "ANSWER_LENGTH_CUE", "NEGATIVE_STEM", "DIFFICULTY_MISMATCH"];
