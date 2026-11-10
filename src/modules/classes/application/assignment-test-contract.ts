import { BadRequestException, ConflictException } from "@nestjs/common";
import { z } from "zod";

/**
 * I3 scored-test assignment rules (class-space-assignment-contract.md §2a).
 * A test assignment points at one published TEST class resource, always has a
 * due date, and keeps its recipient snapshot and deadline history immutable.
 */
export const TEST_CONTENT_TYPE = "test";

export function requireTestDueDate(dueDate: Date | null) {
  if (!dueDate)
    throw new BadRequestException({
      code: "DUE_DATE_REQUIRED",
      message: "Bài kiểm tra được giao phải có hạn nộp",
    });
  return dueDate;
}

/**
 * Targets never change after assignment, and the deadline only moves through
 * a deadline revision (Story 3.3). Resending the current due date is accepted
 * so a title-only edit stays valid.
 */
export function assertTestAssignmentUpdate(update: { dueDate?: string | null; studentIds?: string[] }, currentDueDate: Date | null) {
  const dueChanged =
    update.dueDate !== undefined && (update.dueDate === null || !currentDueDate || new Date(update.dueDate).getTime() !== currentDueDate.getTime());
  if (update.studentIds || dueChanged)
    throw new ConflictException({
      code: "TEST_ASSIGNMENT_IMMUTABLE",
      message: "Danh sách học sinh và hạn nộp của bài kiểm tra đã giao không sửa trực tiếp",
    });
}

/** Student copy of a test before submission: no answer keys and no explanations. */
export function studentTestContent(content: any) {
  return {
    questions: (content?.questions ?? []).map((question: any) => ({
      id: question.id,
      prompt: question.prompt,
      options: question.options,
    })),
  };
}

/** Due-soon window for the in-app reminder (§2a): the last 24 hours before `dueAt`. */
export const DUE_SOON_MS = 24 * 3600_000;

export const testSubmissionSchema = z
  .object({
    answers: z
      .array(z.object({ questionId: z.string().min(1).max(80), optionId: z.string().min(1).max(80) }).strict())
      .min(1)
      .max(100),
    lateReason: z.string().trim().max(1000).optional(),
  })
  .strict();

export const rejectLateSchema = z.object({ note: z.string().trim().max(1000).optional() }).strict();

export const deadlineRevisionSchema = z
  .object({
    dueAt: z.string().datetime(),
    expectedRevision: z.number().int().min(1),
    note: z.string().trim().max(1000).optional(),
    submissionId: z.string().min(1).optional(),
  })
  .strict();

/** Scores every question once; an unknown, missing or repeated answer is rejected before anything is stored. */
export function scoreTest(content: any, answers: Array<{ questionId: string; optionId: string }>) {
  const questions: any[] = content?.questions ?? [];
  const invalid = () =>
    new BadRequestException({ code: "TEST_ANSWERS_INVALID", message: "Cần trả lời mỗi câu đúng một lần bằng một phương án có trong đề" });
  if (answers.length !== questions.length || new Set(answers.map((a) => a.questionId)).size !== answers.length) throw invalid();
  let correctCount = 0;
  for (const answer of answers) {
    const question = questions.find((q) => q.id === answer.questionId);
    const index = question?.options.findIndex((option: any) => option.id === answer.optionId) ?? -1;
    if (index < 0) throw invalid();
    if (index === question.correctOption) correctCount++;
  }
  return { correctCount, questionCount: questions.length, score: Math.round((correctCount / questions.length) * 100) };
}

export type SubmissionStatus = "SCORED" | "LATE_REVIEW_PENDING" | "REJECTED_ZERO" | "ACCEPTED_BY_EXTENSION";
export type StudentTestStatus = "UPCOMING" | "DUE_SOON" | "OVERDUE_UNSUBMITTED" | "SUBMITTED" | "LATE_REVIEW_PENDING" | "REJECTED";

type SubmissionRow = {
  id: string;
  timing: string;
  score: number;
  correctCount: number;
  questionCount: number;
  lateReason: string | null;
  submittedAt: Date;
  deadlineRevision?: { revision: number } | null;
  decision?: { decision: string; note?: string | null; createdAt: Date } | null;
};

export function submissionStatus(row: Pick<SubmissionRow, "timing" | "decision">): SubmissionStatus {
  if (row.timing === "ON_TIME") return "SCORED";
  if (!row.decision) return "LATE_REVIEW_PENDING";
  return row.decision.decision === "REJECT_ZERO" ? "REJECTED_ZERO" : "ACCEPTED_BY_EXTENSION";
}

/** A pending late score is never shown; a rejected one is zero. */
export function submissionView(row: SubmissionRow) {
  const status = submissionStatus(row);
  return {
    id: row.id,
    submittedAt: row.submittedAt,
    timing: row.timing,
    lateReason: row.lateReason,
    status,
    score: status === "LATE_REVIEW_PENDING" ? null : status === "REJECTED_ZERO" ? 0 : row.score,
    correctCount: status === "SCORED" || status === "ACCEPTED_BY_EXTENSION" ? row.correctCount : null,
    questionCount: row.questionCount,
    deadlineRevision: row.deadlineRevision?.revision ?? null,
    decision: row.decision ? { decision: row.decision.decision, note: row.decision.note ?? null, decidedAt: row.decision.createdAt } : null,
  };
}

/** Latest submission by server receive time; ties fall back to ID so the order is stable. */
export function latestSubmission<T extends { id: string; submittedAt: Date }>(rows: T[]) {
  return rows.reduce<T | null>(
    (latest, row) =>
      !latest || row.submittedAt.getTime() > latest.submittedAt.getTime() || (row.submittedAt.getTime() === latest.submittedAt.getTime() && row.id > latest.id)
        ? row
        : latest,
    null,
  );
}

/** One server-derived status shared by the student, teacher and parent views. */
export function studentTestState(input: { dueAt: Date; revision: number; submissions: SubmissionRow[]; now: Date }) {
  const latest = latestSubmission(input.submissions);
  const due = input.dueAt.getTime();
  const now = input.now.getTime();
  let status: StudentTestStatus;
  if (!latest) status = now > due ? "OVERDUE_UNSUBMITTED" : now >= due - DUE_SOON_MS ? "DUE_SOON" : "UPCOMING";
  else {
    const current = submissionStatus(latest);
    status = current === "LATE_REVIEW_PENDING" ? "LATE_REVIEW_PENDING" : current === "REJECTED_ZERO" ? "REJECTED" : "SUBMITTED";
  }
  const history = [...input.submissions]
    .sort((a, b) => b.submittedAt.getTime() - a.submittedAt.getTime() || (b.id > a.id ? 1 : -1))
    .map(submissionView);
  return {
    status,
    dueAt: input.dueAt,
    revision: input.revision,
    extended: input.revision > 1,
    dueSoon: status === "DUE_SOON",
    lateReasonRequired: now > due,
    current: latest ? submissionView(latest) : null,
    history,
  };
}
