import { BadRequestException } from "@nestjs/common";
import { z } from "zod";
import { studentWrittenTaskContent } from "./class-resource-contract";
import { DUE_SOON_MS, latestSubmission, submissionStatus, TEST_CONTENT_TYPE } from "./assignment-test-contract";

/**
 * TAI-02 (TAI2-T2) written-task assignments. A written assignment points at one published
 * WRITTEN_TASK class resource and follows the I3 test rules for due date, targets, deadline
 * revisions and late decisions; the teacher grades it (TAI2-T3), so submissions carry no score.
 */
export const WRITTEN_CONTENT_TYPE = "written";
/** Content types with a deadline lifecycle (revisions, late reasons, LateDecision). */
export const DEADLINE_CONTENT_TYPES = [TEST_CONTENT_TYPE, WRITTEN_CONTENT_TYPE] as const;
export const isDeadlineContentType = (contentType: string) => (DEADLINE_CONTENT_TYPES as readonly string[]).includes(contentType);

/** Raw text is bounded only to cap the body; the per-prompt `maxChars` rule is applied after normalization. */
export const writtenSubmissionSchema = z
  .object({
    responses: z
      .array(z.object({ promptId: z.string().min(1).max(80), text: z.string().max(20_000) }).strict())
      .min(1)
      .max(5),
    lateReason: z.string().trim().max(1000).optional(),
  })
  .strict();

/** Trim, NFC, then Unicode code points; the FE counter uses the same rule (TAI2-T2 decision). */
export function normalizeResponseText(text: string) {
  return text.trim().normalize("NFC");
}
export const responseLength = (text: string) => [...normalizeResponseText(text)].length;

const responsesInvalid = (details: Array<{ path: string; message: string }>) =>
  new BadRequestException({
    code: "WRITTEN_RESPONSES_INVALID",
    message: "Cần trả lời mỗi câu đúng một lần, không để trống và không vượt quá số ký tự cho phép",
    details,
  });

/** Every prompt answered exactly once, 1..maxChars after normalization; returned in prompt order. */
export function normalizeWrittenResponses(content: any, responses: Array<{ promptId: string; text: string }>) {
  const prompts: Array<{ id: string; maxChars: number }> = Array.isArray(content?.prompts) ? content.prompts : [];
  const details: Array<{ path: string; message: string }> = [];
  const byPrompt = new Map<string, string>();
  responses.forEach((response, index) => {
    if (!prompts.some((p) => p.id === response.promptId)) details.push({ path: `responses.${index}.promptId`, message: "Câu hỏi không thuộc bài này" });
    else if (byPrompt.has(response.promptId)) details.push({ path: `responses.${index}.promptId`, message: "Mỗi câu chỉ được trả lời một lần" });
    else byPrompt.set(response.promptId, response.text);
  });
  const stored = prompts.map((p, index) => {
    const raw = byPrompt.get(p.id);
    if (raw === undefined) {
      details.push({ path: `prompts.${index}`, message: "Chưa trả lời câu này" });
      return null;
    }
    const text = normalizeResponseText(raw);
    const length = [...text].length;
    if (length < 1) details.push({ path: `prompts.${index}`, message: "Câu trả lời không được để trống" });
    else if (length > p.maxChars) details.push({ path: `prompts.${index}`, message: `Câu trả lời dài ${length} ký tự, tối đa ${p.maxChars}` });
    return { promptId: p.id, text };
  });
  if (!prompts.length || details.length) throw responsesInvalid(details);
  return stored as Array<{ promptId: string; text: string }>;
}

/** Student copy of a written assignment's resource: allowlisted through studentWrittenTaskContent only. */
export function studentWrittenAssignmentContent(resource: { id: string; title: string; version: number; content: unknown }) {
  const { prompts } = studentWrittenTaskContent(resource.content);
  return { id: resource.id, title: resource.title, version: resource.version, promptCount: prompts.length, prompts };
}

export type WrittenSubmissionStatus = "AWAITING_GRADE" | "LATE_REVIEW_PENDING" | "REJECTED_ZERO";
export type StudentWrittenStatus = "UPCOMING" | "DUE_SOON" | "OVERDUE_UNSUBMITTED" | "AWAITING_GRADE" | "LATE_REVIEW_PENDING" | "REJECTED";

type WrittenRow = {
  id: string;
  timing: string;
  questionCount: number;
  lateReason: string | null;
  submittedAt: Date;
  answers?: unknown;
  deadlineRevision?: { revision: number } | null;
  decision?: { decision: string; note?: string | null; createdAt: Date } | null;
};

/** Gradeable = ON_TIME or ACCEPTED_BY_EXTENSION; it waits for the teacher grade (GRADED arrives in TAI2-T3). */
export function writtenSubmissionStatus(row: Pick<WrittenRow, "timing" | "decision">): WrittenSubmissionStatus {
  const status = submissionStatus(row);
  return status === "LATE_REVIEW_PENDING" ? "LATE_REVIEW_PENDING" : status === "REJECTED_ZERO" ? "REJECTED_ZERO" : "AWAITING_GRADE";
}

/** Only the student's own responses, never the rubric; `withResponses` is false for teacher summaries. */
export function writtenSubmissionView(row: WrittenRow, withResponses = false) {
  const status = writtenSubmissionStatus(row);
  return {
    id: row.id,
    submittedAt: row.submittedAt,
    timing: row.timing,
    lateReason: row.lateReason,
    status,
    gradeable: status === "AWAITING_GRADE",
    score: status === "REJECTED_ZERO" ? 0 : null,
    questionCount: row.questionCount,
    deadlineRevision: row.deadlineRevision?.revision ?? null,
    decision: row.decision ? { decision: row.decision.decision, note: row.decision.note ?? null, decidedAt: row.decision.createdAt } : null,
    ...(withResponses
      ? { responses: (Array.isArray(row.answers) ? row.answers : []).map((a: any) => ({ promptId: String(a?.promptId ?? ""), text: String(a?.text ?? "") })) }
      : {}),
  };
}

/** Same deadline rules as studentTestState; the current submission is the latest one. */
export function studentWrittenState(input: { dueAt: Date; revision: number; submissions: WrittenRow[]; now: Date; withResponses?: boolean }) {
  const latest = latestSubmission(input.submissions);
  const due = input.dueAt.getTime();
  const now = input.now.getTime();
  let status: StudentWrittenStatus;
  if (!latest) status = now > due ? "OVERDUE_UNSUBMITTED" : now >= due - DUE_SOON_MS ? "DUE_SOON" : "UPCOMING";
  else {
    const current = writtenSubmissionStatus(latest);
    status = current === "REJECTED_ZERO" ? "REJECTED" : current;
  }
  const history = [...input.submissions]
    .sort((a, b) => b.submittedAt.getTime() - a.submittedAt.getTime() || (b.id > a.id ? 1 : -1))
    .map((row) => writtenSubmissionView(row, input.withResponses));
  return {
    status,
    dueAt: input.dueAt,
    revision: input.revision,
    extended: input.revision > 1,
    dueSoon: status === "DUE_SOON",
    lateReasonRequired: now > due,
    current: latest ? writtenSubmissionView(latest, input.withResponses) : null,
    history,
  };
}
