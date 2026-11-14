import { BadRequestException } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { assignmentExecutionSchema, digest } from "../../labs/application/lab-run";

const nonEmpty = z.string().trim().min(1).max(500);
const optionsSchema = z.array(nonEmpty).min(2).max(6);
const cardSchema = z.object({ front: nonEmpty, back: nonEmpty }).strict();
const questionSchema = z.object({ prompt: nonEmpty, options: optionsSchema, explanation: z.string().trim().max(1000).optional() }).strict();
const testQuestionSchema = questionSchema.extend({ correctOption: z.number().int().min(0).max(5) });

export const resourceKindSchema = z.enum(["DECK", "STUDY_QUIZ", "TEST", "LAB", "DOCUMENT", "REPORT_TEMPLATE", "LINK", "WRITTEN_TASK"]);
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

const half = (value: number) => Number.isInteger(value * 2);
const anchorSchema = z.object({ points: z.number(), description: z.string().trim().min(1).max(300) }).strict();
const criterionSchema = z
  .object({
    code: z.string().regex(/^[A-Z][A-Z0-9_]{1,31}$/),
    description: z.string().trim().min(1).max(500),
    maxPoints: z.number().min(1).max(10).refine(half, "maxPoints phải là bội số của 0.5"),
    anchors: z.array(anchorSchema).min(2).max(5),
  })
  .strict()
  .superRefine((criterion, ctx) => {
    const points = criterion.anchors.map((anchor) => anchor.points);
    points.forEach((p, i) => {
      if (!half(p) || p < 0 || p > criterion.maxPoints)
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["anchors", i, "points"], message: "Điểm mốc phải là bội số 0.5 trong [0, maxPoints]" });
      if (i > 0 && !(p > points[i - 1]))
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["anchors", i, "points"], message: "Điểm mốc phải tăng dần" });
    });
    if (points[0] !== 0) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["anchors", 0, "points"], message: "Mốc đầu tiên phải là 0 điểm" });
    if (points[points.length - 1] !== criterion.maxPoints)
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["anchors", points.length - 1, "points"], message: "Mốc cuối phải bằng maxPoints" });
  });
const writtenPromptSchema = z
  .object({
    prompt: z.string().trim().min(1).max(2000),
    maxChars: z.number().int().min(100).max(5000),
    referenceAnswer: z.string().trim().max(2000).optional(),
    commonPhrases: z.array(z.string().trim().min(1).max(200)).max(20).optional(),
    criteria: z.array(criterionSchema).min(1).max(6),
  })
  .strict()
  .superRefine((prompt, ctx) => {
    const seen = new Set<string>();
    prompt.criteria.forEach((criterion, i) => {
      if (seen.has(criterion.code)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["criteria", i, "code"], message: "Mã tiêu chí bị trùng trong câu hỏi" });
      seen.add(criterion.code);
    });
  });
const writtenTaskSchema = z.object({ prompts: z.array(writtenPromptSchema).min(1).max(5) }).strict();

/** WRITTEN_TASK branch: violations are 400 RUBRIC_INVALID with field-level details (TAI2-T1). Ids are server-generated. */
function normalizeWrittenTask(raw: unknown) {
  const parsed = writtenTaskSchema.safeParse(raw);
  if (!parsed.success)
    throw new BadRequestException({
      code: "RUBRIC_INVALID",
      message: "Bài tự luận hoặc biểu điểm không hợp lệ",
      details: parsed.error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })),
    });
  return {
    prompts: parsed.data.prompts.map((prompt) => ({
      id: randomUUID(),
      prompt: prompt.prompt,
      maxChars: prompt.maxChars,
      ...(prompt.referenceAnswer ? { referenceAnswer: prompt.referenceAnswer } : {}),
      ...(prompt.commonPhrases?.length ? { commonPhrases: prompt.commonPhrases } : {}),
      criteria: prompt.criteria.map((criterion) => ({
        code: criterion.code,
        description: criterion.description,
        maxPoints: criterion.maxPoints,
        anchors: criterion.anchors.map((anchor) => ({ points: anchor.points, description: anchor.description })),
      })),
    })),
  };
}

/**
 * The only student/parent projection of WRITTEN_TASK content (allowlist): prompt text, answer length and criteria
 * without anchors. referenceAnswer, anchors, commonPhrases and any other field never leave through it.
 */
export function studentWrittenTaskContent(content: any) {
  return {
    prompts: (Array.isArray(content?.prompts) ? content.prompts : []).map((prompt: any) => ({
      id: String(prompt?.id ?? ""),
      prompt: String(prompt?.prompt ?? ""),
      maxChars: Number(prompt?.maxChars ?? 0),
      criteria: (Array.isArray(prompt?.criteria) ? prompt.criteria : []).map((criterion: any) => ({
        code: String(criterion?.code ?? ""),
        description: String(criterion?.description ?? ""),
        maxPoints: Number(criterion?.maxPoints ?? 0),
      })),
    })),
  };
}

/** Item count for audit and views: prompts for WRITTEN_TASK, cards for DECK, questions otherwise. */
export function resourceItemCount(kind: string, content: any): number {
  if (kind === "WRITTEN_TASK") return content?.prompts?.length ?? 0;
  if (kind === "DECK") return content?.cards?.length ?? 0;
  return content?.questions?.length ?? 0;
}

export function normalizeResourceContent(kind: ResourceKind, raw: unknown) {
  if (kind === "WRITTEN_TASK") return normalizeWrittenTask(raw);
  if (kind === "LAB") return labResourceInputSchema.parse(raw);
  if (kind === "DOCUMENT" || kind === "REPORT_TEMPLATE") return documentResourceContentSchema.parse(raw);
  if (kind === "LINK") return linkResourceContentSchema.parse(raw);
  const parsed: any =
    kind === "DECK"
      ? z.object({ cards: z.array(cardSchema).min(1).max(200) }).strict().parse(raw)
      : kind === "STUDY_QUIZ"
        ? z.object({ questions: z.array(questionSchema).min(1).max(100) }).strict().parse(raw)
        : z.object({ questions: z.array(testQuestionSchema).min(1).max(100), thumbnailUrl: httpsUrlSchema.optional() }).strict().parse(raw);
  if (kind === "DECK") return { cards: parsed.cards.map((card: any) => ({ id: randomUUID(), ...card })) };
  for (const question of parsed.questions) {
    if (kind === "TEST" && question.correctOption >= question.options.length) throw new BadRequestException({ code: "TEST_ANSWER_INVALID", message: "Đáp án đúng phải trỏ tới phương án có nội dung" });
  }
  return { ...(kind === "TEST" && parsed.thumbnailUrl ? { thumbnailUrl: parsed.thumbnailUrl } : {}), questions: parsed.questions.map((question: any) => ({
    id: randomUUID(), prompt: question.prompt, explanation: question.explanation ?? null,
    options: question.options.map((text: string) => ({ id: randomUUID(), text })),
    ...(kind === "TEST" ? { correctOption: question.correctOption } : {}),
  })) };
}

/** Remove answer keys before any class member response. */
export function studentResource(kind: ResourceKind, content: any) {
  if (kind === "WRITTEN_TASK") return studentWrittenTaskContent(content);
  if (kind !== "TEST") return content;
  return { questions: content.questions.map(({ correctOption: _answer, ...question }: any) => question) };
}

export function parseResourceCsv(kind: ResourceKind, csv: string) {
  if (!(CSV_IMPORT_KINDS as readonly string[]).includes(kind))
    throw new BadRequestException({ code: "IMPORT_KIND_UNSUPPORTED", message: "Loại tài nguyên này không hỗ trợ nhập CSV" });
  if (Buffer.byteLength(csv, "utf8") > 1_000_000) throw new BadRequestException({ code: "IMPORT_TOO_LARGE", message: "CSV không được vượt quá 1 MB" });
  const records = parseCsv(csv);
  const headers = kind === "DECK" ? ["front", "back"] : kind === "STUDY_QUIZ"
    ? ["prompt", "optionA", "optionB", "optionC", "optionD", "explanation"]
    : ["prompt", "optionA", "optionB", "optionC", "optionD", "correctOption", "explanation"];
  const actual = records.shift()?.map((x) => x.trim()) ?? [];
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
      if (kind === "TEST") {
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
