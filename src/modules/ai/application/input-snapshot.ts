import { createHash } from "node:crypto";
import { stableStringify } from "../../../common/idempotency";
import type { InputSnapshotV1 } from "./generate-resource-prompt";

export const MAX_PASSAGE_CHARS = 1200;
export const MAX_PASSAGES = 40;

/** The lesson fields the snapshot reads. `content` and READING `config.html` may hold HTML. */
export type LessonSource = {
  id: string;
  title: string;
  grade: number;
  domain: string | null;
  topic: string;
  learningObjective: string;
  content: string;
  outcomeCodes: unknown;
  readingSteps: Array<{ position: number; html: string }>;
};

export type SnapshotRequest = {
  targetKind: string;
  itemCount: number;
  difficulty: string | null;
  outcomeCodes: string[] | null;
  instruction: string | null;
};

/** Same stripping rule as `textOf` in lessons.controller.ts: tags become spaces, whitespace collapses. */
const textOf = (html: string) => html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();

/** Block boundaries become paragraph breaks before tags are stripped, so paragraphs stay separate passages. */
const BLOCK_BREAK = /<br\s*\/?>|<\/(?:p|div|li|h[1-6]|tr|section|article|blockquote|ul|ol|table)\s*>/gi;

function paragraphs(source: string): string[] {
  return source
    .replace(/\r\n?/g, "\n")
    .replace(BLOCK_BREAK, "\n\n")
    .split(/\n\s*\n/)
    .map(textOf)
    .filter((segment) => segment.length > 0);
}

/** Splits an over-long paragraph at the last space before the limit (hard cut when there is none). */
function chunk(segment: string): string[] {
  const parts: string[] = [];
  let rest = segment;
  while (rest.length > MAX_PASSAGE_CHARS) {
    const space = rest.lastIndexOf(" ", MAX_PASSAGE_CHARS);
    const cut = space > 0 ? space : MAX_PASSAGE_CHARS;
    parts.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  if (rest) parts.push(rest);
  return parts;
}

/** Packs paragraphs of one source into passages of at most MAX_PASSAGE_CHARS; passages never span two sources. */
function pack(source: string): string[] {
  const out: string[] = [];
  let current = "";
  for (const piece of paragraphs(source).flatMap(chunk)) {
    if (current && current.length + 1 + piece.length > MAX_PASSAGE_CHARS) {
      out.push(current);
      current = piece;
    } else current = current ? `${current}\n${piece}` : piece;
  }
  if (current) out.push(current);
  return out;
}

/**
 * Deterministic passages (implementation-contract.md, "Input snapshot"): learningObjective, then content, then each
 * READING step's html by position. Other step types never reach this function, so existing quiz questions and
 * answer keys are never sent. At most MAX_PASSAGES are kept, in source order, numbered P1..Pn.
 */
export function buildPassages(lesson: Pick<LessonSource, "learningObjective" | "content" | "readingSteps">) {
  const steps = [...lesson.readingSteps].sort((a, b) => a.position - b.position);
  const texts = [lesson.learningObjective, lesson.content, ...steps.map((step) => step.html)].flatMap((source) => pack(source ?? ""));
  return texts.slice(0, MAX_PASSAGES).map((text, index) => ({ id: `P${index + 1}`, text }));
}

export function lessonOutcomeCodes(lesson: Pick<LessonSource, "outcomeCodes">): string[] {
  return Array.isArray(lesson.outcomeCodes) ? lesson.outcomeCodes.filter((code): code is string => typeof code === "string") : [];
}

/** Requested codes win; otherwise the lesson's own codes. Statements come from CurriculumOutcome, in code order. */
export function selectOutcomes(lesson: Pick<LessonSource, "outcomeCodes">, requested: string[] | null, statements: Map<string, string>) {
  const codes = requested && requested.length > 0 ? requested : lessonOutcomeCodes(lesson);
  return codes.filter((code) => statements.has(code)).map((code) => ({ code, statement: statements.get(code)! }));
}

export function buildInputSnapshot(lesson: LessonSource, request: SnapshotRequest, statements: Map<string, string>): InputSnapshotV1 {
  return {
    lesson: { id: lesson.id, title: lesson.title, grade: lesson.grade, domain: lesson.domain, topic: lesson.topic, learningObjective: lesson.learningObjective },
    passages: buildPassages(lesson),
    outcomes: selectOutcomes(lesson, request.outcomeCodes, statements),
    constraints: { targetKind: request.targetKind, itemCount: request.itemCount, difficulty: request.difficulty },
    instruction: request.instruction,
  };
}

export function snapshotDigest(snapshot: InputSnapshotV1): string {
  return createHash("sha256").update(stableStringify(snapshot)).digest("hex");
}
