import { assessmentResourceKind, EXAM_CONTENT_TYPE, pointsUnits, type ExamComponents, type PublishedExam } from "./exam-contract";
import { BadRequestException, ConflictException } from "@nestjs/common";
import { z } from "zod";
import { audit } from "../../../common/audit";
import { notify } from "../../notifications/application/notify";
import { TEST_CONTENT_TYPE } from "./assignment-test-contract";
import { currentDeadlines } from "./assignment-test-state";
import { normalizeResponseText } from "./assignment-written-contract";
import { isGraded, SESSION_GRACE_MS, sessionExpiry } from "./assessment-policy";
import { lock } from "./class-common";

/**
 * TAI-07 (TAI7-T1, AD-19): server-timed graded attempts. Every write path takes the same advisory lock as I3
 * submissions and deadline revisions (`assignment-deadline:<id>`), so start, draft, submit and auto-submit serialize
 * per assignment. Auto-submission is idempotent through the unique `AssignmentSubmission.sessionId`.
 */
const closed = () =>
  new ConflictException({ code: "ASSESSMENT_SESSION_CLOSED", message: "Phiên làm bài đã kết thúc; bài đã được nộp tự động từ bản lưu gần nhất" });

export const testDraftSchema = z.array(z.object({ questionId: z.string().min(1).max(80), optionId: z.string().min(1).max(80) }).strict()).max(100);
export const writtenDraftSchema = z.array(z.object({ promptId: z.string().min(1).max(80), text: z.string().max(20_000) }).strict()).max(5);
export const examDraftSchema = z.object({ choices: testDraftSchema.default([]), responses: writtenDraftSchema.default([]) }).strict();
export const draftBodySchema = z.object({ answers: z.union([testDraftSchema, writtenDraftSchema, examDraftSchema]) }).strict();

type AssignmentRow = { id: string; classId: string; contentId: string; contentType: string; title: string; dueDate: Date | null; assessmentType: string; durationMinutes: number | null };



/**
 * Graded TEST scoring: unanswered questions count as wrong (the session may end mid-paper); an unknown question or
 * option, or a question answered twice, is still rejected.
 */
export function scoreGradedTest(content: any, answers: Array<{ questionId: string; optionId: string }>) {
  const questions: any[] = content?.questions ?? [];
  const invalid = () =>
    new BadRequestException({ code: "TEST_ANSWERS_INVALID", message: "Câu trả lời có câu hỏi hoặc phương án không thuộc đề, hoặc một câu được trả lời hai lần" });
  if (new Set(answers.map((a) => a.questionId)).size !== answers.length) throw invalid();
  let correctCount = 0;
  for (const answer of answers) {
    const question = questions.find((q) => q.id === answer.questionId);
    const index = question?.options.findIndex((option: any) => option.id === answer.optionId) ?? -1;
    if (index < 0) throw invalid();
    if (index === question.correctOption) correctCount++;
  }
  const questionCount = questions.length;
  return { correctCount, questionCount, score: questionCount ? Math.round((correctCount / questionCount) * 100) : 0 };
}

/** Graded written: one entry per prompt in prompt order; a missing or blank answer is stored as "", maxChars still applies. */
export function normalizeGradedWritten(content: any, responses: Array<{ promptId: string; text: string }>) {
  const prompts: Array<{ id: string; maxChars: number }> = Array.isArray(content?.prompts) ? content.prompts : [];
  const details: Array<{ path: string; message: string }> = [];
  const byPrompt = new Map<string, string>();
  responses.forEach((r, i) => {
    if (!prompts.some((p) => p.id === r.promptId)) details.push({ path: `responses.${i}.promptId`, message: "Câu hỏi không thuộc bài này" });
    else if (byPrompt.has(r.promptId)) details.push({ path: `responses.${i}.promptId`, message: "Mỗi câu chỉ được trả lời một lần" });
    else byPrompt.set(r.promptId, r.text);
  });
  const stored = prompts.map((p, i) => {
    const text = normalizeResponseText(byPrompt.get(p.id) ?? "");
    const length = [...text].length;
    if (length > p.maxChars) details.push({ path: `prompts.${i}`, message: `Câu trả lời dài ${length} ký tự, tối đa ${p.maxChars}` });
    return { promptId: p.id, text };
  });
  if (!prompts.length || details.length)
    throw new BadRequestException({ code: "WRITTEN_RESPONSES_INVALID", message: "Câu trả lời không hợp lệ", details });
  return stored;
}

/** Submission columns for a graded attempt; shared by the student submit route and auto-submission. */
export function gradedSubmissionData(contentType: string, resource: { version: number; content: unknown }, answers: unknown) {
  if (contentType === TEST_CONTENT_TYPE) {
    const parsed = testDraftSchema.safeParse(answers);
    const rows = parsed.success ? parsed.data : [];
    const result = scoreGradedTest(resource.content, rows);
    return { answers: rows, ...result, gradingMode: "AUTO" as const };
  }
  const parsed = writtenDraftSchema.safeParse(answers);
  const responses = normalizeGradedWritten(resource.content, parsed.success ? parsed.data : []);
  return { answers: responses, score: null, correctCount: null, questionCount: responses.length, gradingMode: "TEACHER" as const };
}

/** Lenient draft cleaning for auto-submission: keep only entries that are still valid for the paper. */
export function cleanDraft(contentType: string, content: any, draft: unknown) {
  if (contentType === TEST_CONTENT_TYPE) {
    const rows = testDraftSchema.safeParse(draft).success ? (draft as Array<{ questionId: string; optionId: string }>) : [];
    const seen = new Set<string>();
    return rows.filter((a) => {
      const q = (content?.questions ?? []).find((x: any) => x.id === a.questionId);
      const ok = !seen.has(a.questionId) && q?.options?.some((o: any) => o.id === a.optionId);
      if (ok) seen.add(a.questionId);
      return ok;
    });
  }
  const rows = writtenDraftSchema.safeParse(draft).success ? (draft as Array<{ promptId: string; text: string }>) : [];
  const prompts: Array<{ id: string; maxChars: number }> = content?.prompts ?? [];
  const seen = new Set<string>();
  return rows
    .filter((r) => !seen.has(r.promptId) && prompts.some((p) => p.id === r.promptId) && (seen.add(r.promptId), true))
    .map((r) => {
      const max = prompts.find((p) => p.id === r.promptId)!.maxChars;
      return { promptId: r.promptId, text: [...normalizeResponseText(r.text)].slice(0, max).join("") };
    });
}

/**
 * Auto-submits every OPEN session of one assignment (optionally one student) whose grace has passed. Must run inside
 * a transaction that already holds `assignment-deadline:<assignmentId>`. Returns the created submission ids.
 */
export async function finalizeExpiredInTx(tx: any, assignmentId: string, now: Date, studentId?: string) {
  const sessions = await tx.assessmentSession.findMany({
    where: { assignmentId, status: "OPEN", expiresAt: { lt: new Date(now.getTime() - SESSION_GRACE_MS) }, ...(studentId ? { studentId } : {}) },
    orderBy: { startedAt: "asc" },
  });
  if (!sessions.length) return [];
  const assignment: AssignmentRow | null = await tx.assignment.findUnique({ where: { id: assignmentId } });
  if (!assignment) return [];
  const [deadline, resource, owner] = await Promise.all([
    currentDeadlines(tx, [assignment]).then((map: any) => map.get(assignmentId)),
    tx.classResource.findFirst({ where: { id: assignment.contentId, classId: assignment.classId, kind: assessmentResourceKind(assignment.contentType), status: { not: "DRAFT" } } }),
    tx.classroom.findUnique({ where: { id: assignment.classId }, select: { teacherId: true } }),
  ]);
  if (!deadline?.id || !resource) return [];
  const created: string[] = [];
  for (const session of sessions) {
    const data = assignment.contentType === EXAM_CONTENT_TYPE
      ? await examSubmissionData(tx, session, resource.content, session.draftAnswers)
      : gradedSubmissionData(assignment.contentType, resource, cleanDraft(assignment.contentType, resource.content, session.draftAnswers));
    const submission = await tx.assignmentSubmission.create({
      data: {
        assignmentId,
        studentId: session.studentId,
        deadlineRevisionId: deadline.id,
        resourceVersion: resource.version,
        ...data,
        timing: "ON_TIME",
        lateReason: null,
        submittedAt: session.expiresAt,
        sessionId: session.id,
        autoSubmitted: true,
      },
    });
    await tx.assessmentSession.update({ where: { id: session.id }, data: { status: "SUBMITTED" } });
    await audit(tx, {
      actor: null,
      action: "assessment.submit",
      targetType: "AssignmentSubmission",
      targetId: submission.id,
      after: { assignmentId, sessionId: session.id, attemptNo: session.attemptNo, autoSubmitted: true, gradingMode: data.gradingMode },
    });
    if (owner?.teacherId)
      await notify(tx, [{
        recipientId: owner.teacherId,
        type: "SUBMISSION_RECEIVED",
        title: `Bài "${assignment.title}" được nộp tự động khi hết giờ`,
        link: "/classes",
        dedupKey: `submission:${submission.id}`,
      }]);
    created.push(submission.id);
  }
  return created;
}

/** Lazy auto-submission for read paths: one short transaction per graded assignment that has expired open sessions. */
export async function finalizeExpiredSessions(db: any, filter: { assignmentIds?: string[]; studentId?: string } = {}, now = new Date()) {
  const due = await db.assessmentSession.findMany({
    where: {
      status: "OPEN",
      expiresAt: { lt: new Date(now.getTime() - SESSION_GRACE_MS) },
      ...(filter.assignmentIds ? { assignmentId: { in: filter.assignmentIds } } : {}),
      ...(filter.studentId ? { studentId: filter.studentId } : {}),
    },
    select: { assignmentId: true },
    distinct: ["assignmentId"],
    take: 200,
  });
  let count = 0;
  for (const { assignmentId } of due) {
    count += await db.$transaction(async (tx: any) => {
      await lock(tx, "assignment-deadline:" + assignmentId);
      return (await finalizeExpiredInTx(tx, assignmentId, now, filter.studentId)).length;
    });
  }
  return count;
}

/** Attempts used, unconsumed grants and the open session of one student per graded assignment. */
export async function attemptSummaries(db: any, assignmentIds: string[], studentId: string, now = new Date()) {
  const map = new Map<string, { used: number; grants: number; openSession: null | { id: string; attemptNo: number; startedAt: Date; expiresAt: Date } }>();
  if (!assignmentIds.length) return map;
  const [sessions, grants] = await Promise.all([
    db.assessmentSession.findMany({ where: { assignmentId: { in: assignmentIds }, studentId }, select: { id: true, assignmentId: true, attemptNo: true, startedAt: true, expiresAt: true, status: true } }),
    db.assessmentRetakeGrant.findMany({ where: { assignmentId: { in: assignmentIds }, studentId }, select: { assignmentId: true, consumedAt: true } }),
  ]);
  for (const id of assignmentIds) {
    const own = sessions.filter((s: any) => s.assignmentId === id);
    const open = own.find((s: any) => s.status === "OPEN" && s.expiresAt.getTime() + SESSION_GRACE_MS > now.getTime()) ?? null;
    map.set(id, {
      used: own.length,
      grants: grants.filter((g: any) => g.assignmentId === id).length,
      openSession: open ? { id: open.id, attemptNo: open.attemptNo, startedAt: open.startedAt, expiresAt: open.expiresAt } : null,
    });
  }
  return map;
}

export const sessionView = (s: any) => ({
  id: s.id,
  attemptNo: s.attemptNo,
  startedAt: s.startedAt,
  expiresAt: s.expiresAt,
  status: s.status,
  draftAnswers: s.draftAnswers ?? [],
  draftSavedAt: s.draftSavedAt ?? null,
});

/**
 * Starts (or resumes) the student's graded attempt. Caller holds the assignment lock and has checked the target.
 * Order: finalize expired → resume open → closed window → attempts left (first attempt or oldest unconsumed grant).
 */
export async function startSession(tx: any, assignment: AssignmentRow, studentId: string, now: Date) {
  if (!isGraded(assignment.assessmentType))
    throw new ConflictException({ code: "ASSESSMENT_NOT_GRADED", message: "Bài luyện tập không cần bắt đầu phiên làm bài" });
  await finalizeExpiredInTx(tx, assignment.id, now, studentId);
  const sessions = await tx.assessmentSession.findMany({ where: { assignmentId: assignment.id, studentId }, orderBy: { attemptNo: "asc" } });
  const open = sessions.find((s: any) => s.status === "OPEN");
  if (open) return { session: open, resumed: true };
  const deadline = (await currentDeadlines(tx, [assignment])).get(assignment.id);
  if (!deadline || now.getTime() >= deadline.dueAt.getTime())
    throw new ConflictException({ code: "ASSESSMENT_CLOSED", message: "Bài kiểm tra đã hết thời hạn làm bài" });
  let grantId: string | null = null;
  if (sessions.length) {
    const grant = await tx.assessmentRetakeGrant.findFirst({ where: { assignmentId: assignment.id, studentId, consumedAt: null }, orderBy: { createdAt: "asc" } });
    if (!grant) throw new ConflictException({ code: "ASSESSMENT_ATTEMPT_USED", message: "Em đã dùng hết lượt làm bài kiểm tra này" });
    await tx.assessmentRetakeGrant.update({ where: { id: grant.id }, data: { consumedAt: now } });
    grantId = grant.id;
  }
  const session = await tx.assessmentSession.create({
    data: {
      assignmentId: assignment.id,
      studentId,
      attemptNo: sessions.length + 1,
      startedAt: now,
      expiresAt: sessionExpiry(now, assignment.durationMinutes!, deadline.dueAt),
      retakeGrantId: grantId,
    },
  });
  return { session, resumed: false };
}

/** The owner's OPEN session, still inside expiresAt + grace; otherwise 409 ASSESSMENT_SESSION_CLOSED. */
export async function openSessionOrThrow(tx: any, assignmentId: string, studentId: string, sessionId: string, now: Date) {
  const session = await tx.assessmentSession.findFirst({ where: { id: sessionId, assignmentId, studentId } });
  if (!session) throw new BadRequestException({ code: "ASSESSMENT_SESSION_INVALID", message: "Phiên làm bài không hợp lệ" });
  if (session.status !== "OPEN" || now.getTime() > session.expiresAt.getTime() + SESSION_GRACE_MS) throw closed();
  return session;
}

/** The Lab runs are already persisted. Only attempts bound to this student, item and session can score. */
export async function examAttempts(tx: any, session: { id: string; studentId: string; startedAt: Date; expiresAt: Date }) {
  const rows = await tx.attempt.findMany({
    where: {
      studentId: session.studentId,
      labRun: { assessmentSessionId: session.id, context: "EXAM" },
      createdAt: { gte: session.startedAt, lte: session.expiresAt },
    },
    select: { id: true, verdict: true, labRun: { select: { examItemId: true } } },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
  return rows.map((row: any) => ({ id: row.id, itemId: row.labRun.examItemId, passed: row.verdict === "passed" })) as ExamComponents["attempts"];
}

export async function examSubmissionData(tx: any, session: any, content: PublishedExam, draft: unknown) {
  const { choices, responses } = examDraftSchema.safeParse(draft).data ?? { choices: [], responses: [] };
  const validChoices = cleanDraft("test", content, choices) as Array<{ questionId: string; optionId: string }>;
  const answers = content.prompts.length
    ? normalizeGradedWritten(content, cleanDraft("written", content, responses) as Array<{ promptId: string; text: string }>)
    : [];
  const labIds = new Set<string>(content.labs.map((lab) => lab.id));
  const attempts = labIds.size ? (await examAttempts(tx, session)).filter((attempt) => labIds.has(attempt.itemId)) : [];
  const selected = new Map(validChoices.map((answer) => [answer.questionId, answer.optionId]));
  const passed = new Set(attempts.filter((attempt) => attempt.passed).map((attempt) => attempt.itemId));
  const correct = content.questions.filter((q) => q.options[q.correctOption].id === selected.get(q.id));
  const examComponents: ExamComponents = {
    choices: validChoices,
    attempts,
    mcqUnits: correct.reduce((sum, item) => sum + pointsUnits(item.points), 0),
    labUnits: content.labs.filter((item) => passed.has(item.id)).reduce((sum, item) => sum + pointsUnits(item.points), 0),
    writtenRequired: content.prompts.length > 0,
  };
  return { answers, examComponents, score: null, correctCount: null, questionCount: content.questions.length + content.prompts.length + content.labs.length, gradingMode: "MIXED" as const };
}

