import { BadRequestException } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { z } from "zod";

const nonEmpty = z.string().trim().min(1).max(500);
const optionsSchema = z.array(nonEmpty).min(2).max(6);
const cardSchema = z.object({ front: nonEmpty, back: nonEmpty }).strict();
const questionSchema = z.object({ prompt: nonEmpty, options: optionsSchema, explanation: z.string().trim().max(1000).optional() }).strict();
const testQuestionSchema = questionSchema.extend({ correctOption: z.number().int().min(0).max(5) });

export type ResourceKind = "DECK" | "STUDY_QUIZ" | "TEST";

export function normalizeResourceContent(kind: ResourceKind, raw: unknown) {
  const parsed: any =
    kind === "DECK"
      ? z.object({ cards: z.array(cardSchema).min(1).max(200) }).strict().parse(raw)
      : kind === "STUDY_QUIZ"
        ? z.object({ questions: z.array(questionSchema).min(1).max(100) }).strict().parse(raw)
        : z.object({ questions: z.array(testQuestionSchema).min(1).max(100) }).strict().parse(raw);
  if (kind === "DECK") return { cards: parsed.cards.map((card: any) => ({ id: randomUUID(), ...card })) };
  for (const question of parsed.questions) {
    if (kind === "TEST" && question.correctOption >= question.options.length) throw new BadRequestException({ code: "TEST_ANSWER_INVALID", message: "Đáp án đúng phải trỏ tới phương án có nội dung" });
  }
  return { questions: parsed.questions.map((question: any) => ({
    id: randomUUID(), prompt: question.prompt, explanation: question.explanation ?? null,
    options: question.options.map((text: string) => ({ id: randomUUID(), text })),
    ...(kind === "TEST" ? { correctOption: question.correctOption } : {}),
  })) };
}

/** Remove answer keys before any class member response. */
export function studentResource(kind: ResourceKind, content: any) {
  if (kind !== "TEST") return content;
  return { questions: content.questions.map(({ correctOption: _answer, ...question }: any) => question) };
}

export function parseResourceCsv(kind: ResourceKind, csv: string) {
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
