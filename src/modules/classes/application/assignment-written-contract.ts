import { BadRequestException, ConflictException } from "@nestjs/common";
import { z } from "zod";
import { studentWrittenTaskContent } from "./class-resource-contract";
import { DUE_SOON_MS, latestSubmission, submissionStatus, TEST_CONTENT_TYPE } from "./assignment-test-contract";

/**
 * TAI-02 written-task assignments. A written assignment points at one published WRITTEN_TASK class
 * resource and follows the test rules for due date, targets, deadline revisions and late decisions.
 * The teacher grades it by criterion (TAI2-T3); the grade is an append-only WrittenGradeDecision.
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

// ---------- TAI2-T3: teacher grading ----------

/**
 * Grade body. MANUAL since TAI2-T3; the `*_AI` kinds (TAI2-T6) record which stored suggestion the teacher reviewed and
 * need `basedOnSuggestionId`, which MANUAL must not carry. The points are always the teacher's.
 */
export const WRITTEN_GRADE_KINDS = ["MANUAL", "ACCEPTED_AI", "EDITED_AI", "REJECTED_AI"] as const;
export const writtenGradeSchema = z
  .object({
    kind: z.enum(WRITTEN_GRADE_KINDS),
    criterionPoints: z
      .array(z.object({ promptId: z.string().min(1).max(80), criterionCode: z.string().min(1).max(40), points: z.number() }).strict())
      .min(1)
      .max(60),
    feedback: z.string().max(4000).optional(),
    basedOnSuggestionId: z.string().trim().min(1).max(64).optional(),
  })
  .strict()
  .superRefine((body, ctx) => {
    if (body.kind === "MANUAL" && body.basedOnSuggestionId !== undefined)
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["basedOnSuggestionId"], message: "Chỉ dùng khi chấm dựa trên gợi ý AI" });
    if (body.kind !== "MANUAL" && body.basedOnSuggestionId === undefined)
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["basedOnSuggestionId"], message: "Bắt buộc khi chấm dựa trên gợi ý AI" });
  });

/** Feedback is teacher-written text, at most 2000 characters after trim and NFC (TAI2-T3 decision). */
export function normalizeFeedback(feedback: string | undefined) {
  const text = (feedback ?? "").trim().normalize("NFC");
  if ([...text].length > 2000) throw new BadRequestException({ code: "GRADE_FEEDBACK_INVALID", message: "Nhận xét tối đa 2000 ký tự" });
  return text.length ? text : null;
}

type Rubric = Array<{ id: string; prompt: string; criteria: Array<{ code: string; description: string; maxPoints: number; anchors?: unknown }> }>;

/**
 * Validates one teacher grade against the rubric of the resource version the submission answered:
 * every criterion exactly once, points in [0, maxPoints] on the half-point grid. The score is the
 * percentage of the rubric maximum, rounded (TAI2-T3 decision). Nothing is silently clamped.
 */
export function buildWrittenGrade(content: any, input: Array<{ promptId: string; criterionCode: string; points: number }>) {
  const rubric: Rubric = Array.isArray(content?.prompts) ? content.prompts : [];
  const order = rubric.flatMap((p) => p.criteria.map((c) => ({ promptId: p.id, code: c.code, maxPoints: c.maxPoints })));
  const details: Array<{ path: string; message: string }> = [];
  const seen = new Set<string>();
  input.forEach((row, index) => {
    const key = `${row.promptId}|${row.criterionCode}`;
    const known = order.find((o) => o.promptId === row.promptId && o.code === row.criterionCode);
    if (!known) details.push({ path: `criterionPoints.${index}`, message: "Tiêu chí không có trong biểu điểm của bài" });
    else if (seen.has(key)) details.push({ path: `criterionPoints.${index}`, message: "Mỗi tiêu chí chỉ được chấm một lần" });
    else if (!Number.isFinite(row.points) || row.points < 0 || row.points > known.maxPoints)
      details.push({ path: `criterionPoints.${index}.points`, message: `Điểm phải trong khoảng 0 đến ${known.maxPoints}` });
    else if (Math.round(row.points * 2) !== row.points * 2) details.push({ path: `criterionPoints.${index}.points`, message: "Điểm phải là bội số của 0,5" });
    seen.add(key);
  });
  for (const o of order) if (!seen.has(`${o.promptId}|${o.code}`)) details.push({ path: `${o.promptId}.${o.code}`, message: "Thiếu điểm cho tiêu chí này" });
  if (details.length)
    throw new BadRequestException({ code: "GRADE_POINTS_INVALID", message: "Điểm chấm không khớp biểu điểm của bài", details });
  const criterionPoints = order.map((o) => ({
    promptId: o.promptId,
    criterionCode: o.code,
    points: input.find((r) => r.promptId === o.promptId && r.criterionCode === o.code)!.points,
  }));
  const totalPoints = criterionPoints.reduce((sum, c) => sum + c.points, 0);
  const maxPoints = order.reduce((sum, o) => sum + o.maxPoints, 0);
  return { criterionPoints, totalPoints, maxPoints, score: Math.round((totalPoints / maxPoints) * 100) };
}

/** Gradeable = ON_TIME or ACCEPTED_BY_EXTENSION and the current submission; regrading appends (TAI2-T3). */
export function assertGradeable(row: { timing: string; decision?: { decision: string; note?: string | null; createdAt: Date } | null; id: string; submittedAt: Date }, rows: Array<{ id: string; submittedAt: Date }>) {
  const status = submissionStatus(row);
  if (status === "LATE_REVIEW_PENDING" || status === "REJECTED_ZERO")
    throw new ConflictException({ code: "SUBMISSION_NOT_GRADEABLE", message: "Bài nộp này chưa được chấm: đang chờ duyệt trễ hoặc đã bị từ chối (0 điểm)" });
  if (latestSubmission(rows)?.id !== row.id)
    throw new ConflictException({ code: "SUBMISSION_NOT_GRADEABLE", message: "Học sinh đã nộp bài mới hơn; hãy chấm bài hiện tại" });
}

// ---------- student and parent read models ----------

export type StudentWrittenStatus = "UPCOMING" | "DUE_SOON" | "OVERDUE_UNSUBMITTED" | "AWAITING_GRADE" | "GRADED" | "LATE_REVIEW_PENDING" | "REJECTED";
export type WrittenSubmissionStatus = "AWAITING_GRADE" | "GRADED" | "LATE_REVIEW_PENDING" | "REJECTED_ZERO";

export type WrittenGradeRow = {
  id: string;
  kind: string;
  score: number;
  totalPoints: number;
  maxPoints: number;
  criterionPoints: unknown;
  feedback: string | null;
  resourceVersion: number;
  createdAt: Date;
};

type WrittenRow = {
  id: string;
  timing: string;
  questionCount: number;
  lateReason: string | null;
  submittedAt: Date;
  answers?: unknown;
  deadlineRevision?: { revision: number } | null;
  decision?: { decision: string; note?: string | null; createdAt: Date } | null;
  /** Newest first; the first row is the current grade. */
  gradeDecisions?: WrittenGradeRow[];
};

const latestGrade = (row: WrittenRow) => row.gradeDecisions?.[0] ?? null;

/** Gradeable submissions show AWAITING_GRADE until a grade exists, then GRADED. */
export function writtenSubmissionStatus(row: Pick<WrittenRow, "timing" | "decision" | "gradeDecisions">): WrittenSubmissionStatus {
  const status = submissionStatus(row);
  if (status === "LATE_REVIEW_PENDING") return "LATE_REVIEW_PENDING";
  if (status === "REJECTED_ZERO") return "REJECTED_ZERO";
  return row.gradeDecisions?.length ? "GRADED" : "AWAITING_GRADE";
}

/**
 * Student-facing submission view. Responses only with `withResponses`; the grade (score, criterion
 * points and comment) only with `withGrade`, and only for the current submission (the caller decides).
 */
export function writtenSubmissionView(row: WrittenRow, options: { withResponses?: boolean; withGrade?: boolean } = {}) {
  const status = writtenSubmissionStatus(row);
  const grade = latestGrade(row);
  const score = status === "REJECTED_ZERO" ? 0 : status === "GRADED" && options.withGrade ? grade!.score : null;
  return {
    id: row.id,
    submittedAt: row.submittedAt,
    timing: row.timing,
    lateReason: row.lateReason,
    status,
    gradeable: status === "AWAITING_GRADE" || status === "GRADED",
    score,
    questionCount: row.questionCount,
    deadlineRevision: row.deadlineRevision?.revision ?? null,
    decision: row.decision ? { decision: row.decision.decision, note: row.decision.note ?? null, decidedAt: row.decision.createdAt } : null,
    grade: status === "GRADED" && options.withGrade
      ? { score: grade!.score, totalPoints: grade!.totalPoints, maxPoints: grade!.maxPoints, feedback: grade!.feedback, criterionPoints: grade!.criterionPoints, decidedAt: grade!.createdAt, resourceVersion: grade!.resourceVersion }
      : null,
    ...(options.withResponses
      ? { responses: (Array.isArray(row.answers) ? row.answers : []).map((a: any) => ({ promptId: String(a?.promptId ?? ""), text: String(a?.text ?? "") })) }
      : {}),
  };
}

/** Same deadline rules as studentTestState; the current submission is the latest one. */
export function studentWrittenState(input: { dueAt: Date; revision: number; submissions: WrittenRow[]; now: Date; withResponses?: boolean; withGrade?: boolean }) {
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
    .map((row) => writtenSubmissionView(row, { withResponses: input.withResponses, withGrade: false }));
  return {
    status,
    dueAt: input.dueAt,
    revision: input.revision,
    extended: input.revision > 1,
    dueSoon: status === "DUE_SOON",
    lateReasonRequired: now > due,
    current: latest ? writtenSubmissionView(latest, { withResponses: input.withResponses, withGrade: input.withGrade }) : null,
    history,
  };
}

/** Student view of a grade: criterion points with the rubric's code and description only (never anchors or reference answers). */
export function studentGradeCriteria(content: any, criterionPoints: unknown) {
  const rubric: Array<{ id: string; criteria: Array<{ code: string; description: string; maxPoints: number }> }> = Array.isArray(content?.prompts) ? content.prompts : [];
  const points: Array<{ promptId: string; criterionCode: string; points: number }> = Array.isArray(criterionPoints) ? (criterionPoints as any[]) : [];
  return points.map((p) => {
    const criterion = rubric.find((r) => r.id === p.promptId)?.criteria.find((c) => c.code === p.criterionCode);
    return { promptId: p.promptId, code: p.criterionCode, description: criterion?.description ?? "", points: p.points, maxPoints: criterion?.maxPoints ?? null };
  });
}
