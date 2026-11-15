import { BadRequestException } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { assignmentExecutionSchema, digest } from "../../labs/application/lab-run";
import { exploreResourceContentSchema, exploreResourceInputSchema } from "./class-explore-contract";

import { nonEmpty, cardSchema, studyQuizQuestionSchema, testQuestionSchema } from "./question-resource-contract";
import { normalizeWrittenTask, studentWrittenTaskContent } from "./written-resource-contract";
import { normalizeExam, studentExamContent } from "./exam-contract";
export { studentWrittenTaskContent } from "./written-resource-contract";

export const resourceKindSchema = z.enum(["DECK", "STUDY_QUIZ", "TEST", "LAB", "DOCUMENT", "REPORT_TEMPLATE", "LINK", "WRITTEN_TASK", "EXPLORE_LAB", "EXAM"]);
export type ResourceKind = z.infer<typeof resourceKindSchema>;
export const practiceKind = (kind: string) => kind === "DECK" || kind === "STUDY_QUIZ";
const identifier = z.string().trim().min(1).max(100);
export const httpsUrlSchema = z.string().trim().max(2048).url().refine((value) => {
  const url = new URL(value);
  return url.protocol === "https:" && !url.username && !url.password;
}, "Use an HTTPS URL without credentials");
const description = z.string().trim().max(10000).default("");
export const labResourceInputSchema = z.object({
  source: z.object({ labId: identifier, releaseId: identifier, challengeId: identifier }).strict(),
  learningObjective: z.string().trim().min(1).max(1000),
  instructions: z.string().trim().min(1).max(10000),
  reportPrompts: z.array(z.string().trim().min(1).max(1000)).max(20),
  thumbnailUrl: httpsUrlSchema.optional(),
  customParams: z.record(z.string().regex(/^[A-Za-z][A-Za-z0-9_]*$/).max(80), z.number().finite()).refine((value) => Object.keys(value).length <= 10).optional(),
}).strict();
export const labResourceContentSchema = labResourceInputSchema.extend({ execution: assignmentExecutionSchema, executionDigest: z.string().regex(/^[0-9a-f]{64}$/) }).strict();
export const documentResourceContentSchema = z.object({ description, source: z.discriminatedUnion("type", [
  z.object({ type: z.literal("upload"), assetVersionId: identifier }).strict(),
  z.object({ type: z.literal("link"), url: httpsUrlSchema }).strict(),
]) }).strict();
export const linkResourceContentSchema = z.object({ url: httpsUrlSchema, description }).strict();
export const classLabSnapshotSchema = z.object({
  resourceId: identifier, version: z.number().int().positive(), title: z.string().trim().min(1).max(160),
  lessonId: identifier.nullable(), ...labResourceInputSchema.omit({ source: true }).shape,
  source: labResourceInputSchema.shape.source, contentDigest: z.string().regex(/^[0-9a-f]{64}$/),
}).strict();
export function classLabSnapshot(resource: any) {
  const content = labResourceContentSchema.parse(resource.content);
  const fields = { resourceId: resource.id, version: resource.version, title: resource.title, lessonId: resource.lessonId,
    source: content.source, learningObjective: content.learningObjective, instructions: content.instructions, reportPrompts: content.reportPrompts,
    ...(content.thumbnailUrl ? { thumbnailUrl: content.thumbnailUrl } : {}) };
  return classLabSnapshotSchema.parse({ ...fields, contentDigest: digest(fields) });
}
export function verifyClassLabSnapshot(value: unknown) {
  const parsed = classLabSnapshotSchema.parse(value);
  const { contentDigest, ...fields } = parsed;
  if (digest(fields) !== contentDigest) throw new BadRequestException({ code: "CLASS_LAB_SNAPSHOT_INVALID" });
  return parsed;
}

/** Kinds that support CSV import; WRITTEN_TASK is authored in the rubric editor only. */
export const CSV_IMPORT_KINDS = ["DECK", "STUDY_QUIZ", "TEST"] as const;

/** Item count for audit and views: prompts for WRITTEN_TASK, cards for DECK, questions otherwise. */
export function resourceItemCount(kind: string, content: any): number {
  if (kind === "EXPLORE_LAB") return content?.requirements?.length ?? 0;
  if (kind === "EXAM") return (content?.questions?.length ?? 0) + (content?.prompts?.length ?? 0) + (content?.labs?.length ?? 0);
  if (kind === "WRITTEN_TASK") return content?.prompts?.length ?? 0;
  if (kind === "DECK") return content?.cards?.length ?? 0;
  return content?.questions?.length ?? 0;
}

export function normalizeResourceContent(kind: ResourceKind, raw: unknown) {
  if (kind === "EXAM") return normalizeExam(raw);
  if (kind === "WRITTEN_TASK") return normalizeWrittenTask(raw);
  if (kind === "LAB") return labResourceInputSchema.parse(raw);
  // Explore content is built server-side from a selection; `normalize` only checks the shape a teacher may send.
  if (kind === "EXPLORE_LAB") return exploreResourceInputSchema.parse(raw);
  if (kind === "DOCUMENT" || kind === "REPORT_TEMPLATE") return documentResourceContentSchema.parse(raw);
  if (kind === "LINK") return linkResourceContentSchema.parse(raw);
  const parsed: any =
    kind === "DECK"
      ? z.object({ cards: z.array(cardSchema).min(1).max(200) }).strict().parse(raw)
      : kind === "STUDY_QUIZ"
        ? z.object({ questions: z.array(studyQuizQuestionSchema).min(1).max(100) }).strict().parse(raw)
        : z.object({ questions: z.array(testQuestionSchema).min(1).max(100), thumbnailUrl: httpsUrlSchema.optional() }).strict().parse(raw);
  if (kind === "DECK") return { cards: parsed.cards.map((card: any) => ({ id: randomUUID(), ...card })) };
  for (const question of parsed.questions) {
    if (question.correctOption !== undefined && question.correctOption >= question.options.length) throw new BadRequestException({ code: "TEST_ANSWER_INVALID", message: "Đáp án đúng phải trỏ tới phương án có nội dung" });
  }
  return { ...(kind === "TEST" && parsed.thumbnailUrl ? { thumbnailUrl: parsed.thumbnailUrl } : {}), questions: parsed.questions.map((question: any) => ({
    id: randomUUID(), prompt: question.prompt, explanation: question.explanation ?? null,
    options: question.options.map((text: string) => ({ id: randomUUID(), text })),
    ...(question.correctOption !== undefined ? { correctOption: question.correctOption } : {}),
  })) };
}

/** Remove answer keys before any class member response. */
export function studentResource(kind: ResourceKind, content: any) {
  if (kind === "EXAM") return studentExamContent(content);
  if (kind === "WRITTEN_TASK") return studentWrittenTaskContent(content);
  // The pinned effective config and selection stay with the assignment snapshot; a class member only needs to know what it is.
  if (kind === "EXPLORE_LAB") return { source: { mode: "explore", labId: String(content?.source?.labId ?? "") }, instructions: String(content?.instructions ?? "") };
  if (kind !== "TEST") return content;
  return { questions: content.questions.map(({ correctOption: _answer, ...question }: any) => question) };
}

export function parseResourceCsv(kind: ResourceKind, csv: string) {
  if (!(CSV_IMPORT_KINDS as readonly string[]).includes(kind))
    throw new BadRequestException({ code: "IMPORT_KIND_UNSUPPORTED", message: "Loại tài nguyên này không hỗ trợ nhập CSV" });
  if (Buffer.byteLength(csv, "utf8") > 1_000_000) throw new BadRequestException({ code: "IMPORT_TOO_LARGE", message: "CSV không được vượt quá 1 MB" });
  const records = parseCsv(csv);
  const answerHeaders = ["prompt", "optionA", "optionB", "optionC", "optionD", "correctOption", "explanation"];
  const actual = records.shift()?.map((x) => x.trim()) ?? [];
  // STUDY_QUIZ accepts the answer-key layout too, so a practice quiz can give right/wrong feedback.
  const quizWithAnswers = kind === "STUDY_QUIZ" && actual.join(",") === answerHeaders.join(",");
  const headers = kind === "DECK" ? ["front", "back"] : kind === "STUDY_QUIZ" && !quizWithAnswers
    ? ["prompt", "optionA", "optionB", "optionC", "optionD", "explanation"]
    : answerHeaders;
  if (actual.join(",") !== headers.join(",")) throw new BadRequestException({ code: "IMPORT_HEADERS_INVALID", message: `Cột CSV phải theo thứ tự: ${headers.join(",")}` });
  if (!records.length || records.length > (kind === "DECK" ? 200 : 100)) throw new BadRequestException({ code: "IMPORT_ROW_LIMIT", message: `Số dòng dữ liệu phải từ 1 đến ${kind === "DECK" ? 200 : 100}` });
  const errors: Array<{ row: number; field: string; message: string }> = [];
  const data: any[] = [];
  const seen = new Set<string>();
  records.forEach((row, index) => {
    const rowNumber = index + 2;
    if (row.every((cell) => !cell.trim())) return;
    if (row.length !== headers.length) { errors.push({ row: rowNumber, field: "row", message: `Cần ${headers.length} cột, nhận được ${row.length}` }); return; }
    const cells = Object.fromEntries(headers.map((header, i) => [header, row[i].trim()]));
    const normalizedRow = headers.map((header) => String(cells[header] ?? "").trim().toLocaleLowerCase("vi-VN")).join("\u0000");
    if (seen.has(normalizedRow)) errors.push({ row: rowNumber, field: "row", message: "Dòng bị trùng với nội dung đã nhập" });
    seen.add(normalizedRow);
    const required = kind === "DECK" ? ["front", "back"] : ["prompt", "optionA", "optionB"];
    for (const field of required) if (!cells[field]) errors.push({ row: rowNumber, field, message: "Không được để trống" });
    if (kind === "DECK") data.push({ front: cells.front, back: cells.back });
    else {
      const options = [cells.optionA, cells.optionB, cells.optionC, cells.optionD].filter(Boolean);
      const q: any = { prompt: cells.prompt, options, ...(cells.explanation ? { explanation: cells.explanation } : {}) };
      if (kind === "TEST" || (quizWithAnswers && cells.correctOption)) {
        const answer = ["A", "B", "C", "D"].indexOf((cells.correctOption ?? "").toUpperCase());
        if (answer < 0 || answer >= options.length) errors.push({ row: rowNumber, field: "correctOption", message: "Chọn A/B/C/D ứng với một phương án có nội dung" });
        q.correctOption = answer;
      }
      data.push(q);
    }
  });
  if (errors.length) return { data: null, errors };
  const content = kind === "DECK" ? { cards: data } : { questions: data };
  return { data: normalizeResourceContent(kind, content), errors: [] };
}

function parseCsv(source: string): string[][] {
  source = source.replace(/^\uFEFF/, "");
  const rows: string[][] = [];
  let row: string[] = [], cell = "", quoted = false;
  for (let i = 0; i < source.length; i++) {
    const ch = source[i];
    if (quoted) {
      if (ch === '"' && source[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"' && cell.length === 0) quoted = true;
    else if (ch === ",") { row.push(cell); cell = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && source[i + 1] === "\n") i++;
      row.push(cell); rows.push(row); row = []; cell = "";
    } else cell += ch;
  }
  if (quoted) throw new BadRequestException({ code: "IMPORT_CSV_INVALID", message: "CSV có dấu ngoặc kép chưa đóng" });
  if (cell.length || row.length) { row.push(cell); rows.push(row); }
  while (rows.length && rows.at(-1)?.every((value) => value === "")) rows.pop();
  return rows;
}
