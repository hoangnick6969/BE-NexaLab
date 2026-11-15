import { assessmentResourceKind, EXAM_CONTENT_TYPE, examTotal10, writtenContentType } from "./exam-contract";
import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException, Optional } from "@nestjs/common";
import { z } from "zod";
import { audit } from "../../../common/audit";
import { idempotent, readIdempotencyKey } from "../../../common/idempotency";
import { AI_ASSESSMENT_CONFIG, assistActive, parseAiAssessmentConfig, type AiAssessmentConfig } from "../../../config/ai-assessment";
import { Db } from "../../../db/db";
import { latestSubmission, TEST_CONTENT_TYPE } from "./assignment-test-contract";
import { currentDeadlines } from "./assignment-test-state";
import { assertGradeable, DEADLINE_CONTENT_TYPES, WRITTEN_CONTENT_TYPE } from "./assignment-written-contract";
import { suggestionSelect } from "./assignment-written-ai";
import { finalizeExpiredInTx, finalizeExpiredSessions } from "./assessment-session";
import { ASSESSMENT_POLICY, isGraded, toScale10, type AssessmentType } from "./assessment-policy";
import { ownedClass } from "./class-access";
import { classArchived, lock } from "./class-common";
import {
  buildGradebookRows, classListOrder, csvFileName, entryStatus, gradebookCsv, gradebookSummary, lockBlockers,
  type AiSuggestionSummary, type CsvFormat, type SimilarityFlag,
} from "./gradebook";
import { appendWrittenGrade, assertGradebookUnlocked } from "./written-grade-write";

const quickApproveSchema = z.object({ submissionIds: z.array(z.string().min(1).max(64)).min(1).max(200).optional() }).strict();
const unlockSchema = z
  .object({ reason: z.string().transform((v) => v.trim().normalize("NFC")).refine((v) => [...v].length >= 1 && [...v].length <= 500, "Lý do mở khóa từ 1 đến 500 ký tự") })
  .strict();
const exportQuery = z.object({ format: z.enum(["vn", "standard"]).default("vn") });

/**
 * TAI-07 (TAI7-T3): the class gradebook of one test or written assignment ("Bảng điểm lớp"). Reads are computed from the
 * immutable submissions, grades, sessions, AI suggestions (assist mode, teacher-only) and the newest similarity run;
 * "Chốt sổ điểm" writes an immutable GradebookEntry snapshot that the CSV export reads. AI never grades: quick-approve
 * appends ACCEPTED_AI decisions through the same writer and checks as the manual grade route.
 */
@Injectable()
export class GradebookService {
  private assessment: AiAssessmentConfig;

  constructor(@Inject(Db) private db: Db, @Optional() @Inject(AI_ASSESSMENT_CONFIG) assessment?: AiAssessmentConfig) {
    this.assessment = assessment ?? parseAiAssessmentConfig({});
  }

  private async ownedAssignment(db: any, classId: string, assignmentId: string) {
    const a = await db.assignment.findFirst({
      where: { id: assignmentId, classId, contentType: { in: [...DEADLINE_CONTENT_TYPES] } },
      include: { targets: { include: { student: { select: { id: true, fullName: true, username: true } } } } },
    });
    if (!a) throw new NotFoundException({ code: "ASSIGNMENT_NOT_FOUND", message: "Không tìm thấy bài kiểm tra đã giao" });
    return a;
  }

  /** Newest assist-mode suggestion per current written submission (same rule as the written board, TAI2-T6). */
  private async suggestions(db: any, submissionIds: string[], rubric: any): Promise<Map<string, AiSuggestionSummary & { row: any }>> {
    const map = new Map<string, AiSuggestionSummary & { row: any }>();
    if (!assistActive(this.assessment) || !submissionIds.length) return map;
    const jobs = await db.aiJob.findMany({
      where: { submissionId: { in: submissionIds }, purpose: "ASSESS_SUBMISSION", promptVersion: this.assessment.promptVersion },
      orderBy: { createdAt: "desc" },
      select: { id: true, submissionId: true, request: true, suggestion: { select: suggestionSelect } },
    });
    const seen = new Set<string>();
    const maxPoints = (Array.isArray(rubric?.prompts) ? rubric.prompts : []).reduce(
      (sum: number, p: any) => sum + (Array.isArray(p?.criteria) ? p.criteria.reduce((s: number, c: any) => s + Number(c?.maxPoints ?? 0), 0) : 0),
      0,
    );
    for (const job of jobs as any[]) {
      if (seen.has(job.submissionId)) continue;
      seen.add(job.submissionId);
      const s = job.request?.mode === "assist" && job.suggestion?.mode === "assist" ? job.suggestion : null;
      if (!s) continue;
      const criteria = Array.isArray(s.criterionResults) ? s.criterionResults : [];
      const suggestedPoints = s.status === "VALID" ? criteria.reduce((sum: number, c: any) => sum + Number(c?.suggestedPoints ?? 0), 0) : null;
      map.set(job.submissionId, { suggestionId: s.id, status: s.status, suggestedPoints, maxPoints: maxPoints || null, row: s });
    }
    return map;
  }

  /** Strongest flag of each current submission in the newest similarity run (HIGH before ELEVATED). */
  private async similarity(db: any, assignmentId: string, currentIds: Set<string>, studentOf: Map<string, string>) {
    const map = new Map<string, SimilarityFlag>();
    const run = await db.submissionSimilarityRun.findFirst({ where: { assignmentId }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], select: { id: true } });
    if (!run) return map;
    const matches = await db.submissionSimilarityMatch.findMany({
      where: { runId: run.id },
      select: { id: true, submissionAId: true, submissionBId: true, level: true, reviews: { select: { status: true, createdAt: true } } },
    });
    const rank = (level: string) => (level === "HIGH" ? 2 : level === "ELEVATED" ? 1 : 0);
    for (const m of matches as any[]) {
      if (!currentIds.has(m.submissionAId) || !currentIds.has(m.submissionBId) || !rank(m.level)) continue;
      const reviewed = (m.reviews ?? []).length > 0;
      for (const [own, other] of [[m.submissionAId, m.submissionBId], [m.submissionBId, m.submissionAId]]) {
        const prev = map.get(own);
        if (!prev || rank(m.level) > rank(prev.level) || (rank(m.level) === rank(prev.level) && prev.reviewed && !reviewed))
          map.set(own, { level: m.level, matchId: m.id, reviewed, otherStudentId: studentOf.get(other) ?? "" });
      }
    }
    return map;
  }

  /** Loads everything one gradebook needs, from `db` (read) or `tx` (lock and quick-approve). */
  private async load(db: any, classId: string, assignmentId: string, now = new Date()) {
    const a = await this.ownedAssignment(db, classId, assignmentId);
    const [deadline, submissions, sessions, resource] = await Promise.all([
      currentDeadlines(db, [a]).then((m: any) => m.get(a.id)),
      db.assignmentSubmission.findMany({
        where: { assignmentId },
        select: {
          id: true, studentId: true, submittedAt: true, timing: true, correctCount: true, questionCount: true, resourceVersion: true,
          sessionId: true, autoSubmitted: true, ...(a.contentType === EXAM_CONTENT_TYPE ? { examComponents: true } : {}), decision: { select: { decision: true, createdAt: true } },
          gradeDecisions: { orderBy: { createdAt: "desc" }, select: { id: true, kind: true, totalPoints: true, maxPoints: true, createdAt: true } },
        },
      }),
      db.assessmentSession.findMany({ where: { assignmentId }, select: { id: true, studentId: true, attemptNo: true, startedAt: true, expiresAt: true, status: true } }),
      db.classResource.findFirst({ where: { id: a.contentId, classId, kind: assessmentResourceKind(a.contentType) }, select: { id: true, version: true, content: true } }),
    ]);
    const students = a.targets.map((t: any) => t.student);
    const currentIds = new Set<string>(
      students.map((s: any) => latestSubmission(submissions.filter((x: any) => x.studentId === s.id))?.id).filter(Boolean) as string[],
    );
    const studentOf = new Map<string, string>(submissions.map((s: any) => [s.id, s.studentId]));
    const isWritten = writtenContentType(a.contentType) && (a.contentType !== EXAM_CONTENT_TYPE || resource?.content?.prompts?.length > 0);
    const [suggestions, similarity] = await Promise.all([
      isWritten ? this.suggestions(db, [...currentIds], resource?.content) : Promise.resolve(new Map()),
      isWritten ? this.similarity(db, assignmentId, currentIds, studentOf) : Promise.resolve(new Map()),
    ]);
    const rows = buildGradebookRows({
      assignment: { id: a.id, contentType: a.contentType, assessmentType: a.assessmentType, dueAt: deadline?.dueAt ?? a.dueDate ?? null },
      students,
      submissions,
      sessions,
      suggestions,
      similarity,
      now,
    });
    return { a, rows, resource, submissions, suggestions, deadline };
  }

  private view(a: any, rows: any[], deadline: any, resource?: any) {
    const type = (a.assessmentType ?? "PRACTICE") as AssessmentType;
    return {
      assignment: {
        id: a.id,
        title: a.title,
        contentType: a.contentType,
        ...(a.contentType === EXAM_CONTENT_TYPE ? { hasWritten: !!resource?.content?.prompts?.length } : {}),
        dueAt: deadline?.dueAt ?? a.dueDate,
        assessment: { type, graded: isGraded(type), coefficient: ASSESSMENT_POLICY[type]?.coefficient ?? null, durationMinutes: a.durationMinutes ?? null, scoresPublishedAt: a.scoresPublishedAt ?? null },
        gradebook: { lockedAt: a.gradebookLockedAt ?? null, lockVersion: a.gradebookLockVersion ?? 0 },
      },
      aiAssist: assistActive(this.assessment),
      summary: gradebookSummary(rows),
      blockers: lockBlockers(rows),
      rows,
    };
  }

  async gradebook(classId: string, assignmentId: string, req: any) {
    await ownedClass(this.db, classId, req.user);
    const peek = await this.ownedAssignment(this.db, classId, assignmentId);
    if (isGraded(peek.assessmentType)) await finalizeExpiredSessions(this.db, { assignmentIds: [assignmentId] });
    const { a, rows, deadline, resource } = await this.load(this.db, classId, assignmentId);
    return this.view(a, rows, deadline, resource);
  }

  /**
   * "Duyệt nhanh gợi ý AI": appends ACCEPTED_AI for every chosen current written submission that is gradeable, has no
   * grade yet and has a VALID assist-mode suggestion of the answered rubric version. Each one goes through
   * assertGradeable, buildWrittenGrade and assertGradeMatchesSuggestion like the manual grade route; the rest are skipped
   * with a reason. The grade is the teacher's decision (actor = teacher).
   */
  async quickApprove(classId: string, assignmentId: string, req: any, body: unknown) {
    const b = quickApproveSchema.parse(body ?? {});
    const c = await ownedClass(this.db, classId, req.user);
    if (c.status === "ARCHIVED") throw classArchived();
    if (!assistActive(this.assessment))
      throw new ConflictException({ code: "AI_ASSESSMENT_DISABLED", message: "Chế độ hỗ trợ chấm bằng AI đang tắt; hãy chấm thủ công" });
    const ctx = { actorId: req.user.sub, key: readIdempotencyKey(req), scope: "POST classes/:id/assignments/:aid/gradebook/quick-approve:" + assignmentId, payload: b };
    return idempotent(this.db, ctx, async (tx) => {
      await lock(tx, "assignment-deadline:" + assignmentId);
      const { a, rows, resource, submissions, suggestions } = await this.load(tx, classId, assignmentId);
      if (!writtenContentType(a.contentType) || (a.contentType === EXAM_CONTENT_TYPE && !resource?.content?.prompts?.length))
        throw new BadRequestException({ code: "QUICK_APPROVE_UNSUPPORTED", message: "Chỉ bài tự luận có gợi ý chấm của AI" });
      assertGradebookUnlocked(a);
      if (!resource) throw new NotFoundException("Nội dung không còn khả dụng");
      const wanted = b.submissionIds ?? rows.filter((r) => r.ai?.canQuickApprove).map((r) => r.submissionId!);
      const approved: Array<{ submissionId: string; gradeId: string; score10: number | null }> = [];
      const skipped: Array<{ submissionId: string; reason: string }> = [];
      for (const submissionId of wanted) {
        const row = rows.find((r) => r.submissionId === submissionId);
        const submission = submissions.find((s: any) => s.id === submissionId);
        const suggestion = suggestions.get(submissionId);
        if (!row || !submission) { skipped.push({ submissionId, reason: "NOT_CURRENT_SUBMISSION" }); continue; }
        if (row.grade) { skipped.push({ submissionId, reason: "ALREADY_GRADED" }); continue; }
        if (!suggestion) { skipped.push({ submissionId, reason: "NO_SUGGESTION" }); continue; }
        if (suggestion.status !== "VALID") { skipped.push({ submissionId, reason: "SUGGESTION_NOT_VALID" }); continue; }
        try {
          assertGradeable(submission, submissions.filter((s: any) => s.studentId === submission.studentId));
          const criterionPoints = (suggestion.row.criterionResults as any[]).map((cr) => ({ promptId: cr.promptId, criterionCode: cr.criterionCode, points: cr.suggestedPoints }));
          const { row: grade, grade: computed } = await appendWrittenGrade(tx, {
            actor: req.user,
            submission,
            rubricContent: resource.content,
            kind: "ACCEPTED_AI",
            criterionPoints,
            feedback: null,
            basedOnSuggestionId: suggestion.suggestionId,
            suggestion: suggestion.row,
          });
          approved.push({ submissionId, gradeId: grade.id, score10: submission.examComponents ? examTotal10(submission.examComponents, computed.totalPoints) : toScale10(computed.totalPoints, computed.maxPoints) });
        } catch (error: any) {
          // Any guard failure (not gradeable, rubric or suggestion mismatch) skips the row with its code; nothing is written for it.
          skipped.push({ submissionId, reason: error?.response?.code ?? "INVALID" });
        }
      }
      await audit(tx, {
        actor: req.user,
        action: "gradebook.quick_approve",
        targetType: "Assignment",
        targetId: assignmentId,
        after: { assignmentId, createdCount: approved.length, skippedCount: skipped.length },
      });
      return { approved, skipped };
    });
  }

  /** "Chốt sổ điểm": refuses while work is running or waiting for the teacher; writes one immutable entry per target. */
  async lock(classId: string, assignmentId: string, req: any) {
    const c = await ownedClass(this.db, classId, req.user);
    if (c.status === "ARCHIVED") throw classArchived();
    const ctx = { actorId: req.user.sub, key: readIdempotencyKey(req), scope: "POST classes/:id/assignments/:aid/gradebook/lock:" + assignmentId, payload: {} };
    return idempotent(this.db, ctx, async (tx) => {
      await lock(tx, "assignment-deadline:" + assignmentId);
      await finalizeExpiredInTx(tx, assignmentId, new Date());
      const { a, rows, deadline, resource } = await this.load(tx, classId, assignmentId);
      if (a.gradebookLockedAt)
        throw new ConflictException({ code: "GRADEBOOK_LOCKED", message: "Sổ điểm của bài này đã được chốt" });
      const blockers = lockBlockers(rows);
      if (blockers.length)
        throw new ConflictException({ code: "GRADEBOOK_NOT_READY", message: "Còn bài đang làm, chưa đến hạn hoặc chưa chấm; hãy xử lý trước khi chốt sổ", details: blockers });
      const now = new Date();
      const version = (a.gradebookLockVersion ?? 0) + 1;
      for (const r of rows)
        await tx.gradebookEntry.create({
          data: {
            assignmentId,
            studentId: r.student.id,
            lockVersion: version,
            status: entryStatus(r),
            score10: r.total10,
            rawPoints: r.rawPoints,
            maxPoints: r.maxPoints,
            similarityFlag: r.similarity?.level ?? null,
            sourceSubmissionId: r.submissionId,
            sourceGradeId: r.grade?.id ?? null,
            lockedById: req.user.sub,
            lockedAt: now,
          },
        });
      const updated = await tx.assignment.update({
        where: { id: assignmentId },
        data: { gradebookLockedAt: now, gradebookLockedById: req.user.sub, gradebookLockVersion: version },
      });
      await audit(tx, {
        actor: req.user,
        action: "gradebook.lock",
        targetType: "Assignment",
        targetId: assignmentId,
        after: { assignmentId, lockVersion: version, recipientCount: rows.length },
      });
      return this.view({ ...a, ...updated }, rows, deadline, resource);
    });
  }

  /** Explicit unlock with a reason (audited); the snapshot rows stay as history and the next lock gets a new version. */
  async unlock(classId: string, assignmentId: string, req: any, body: unknown) {
    const b = unlockSchema.parse(body ?? {});
    const c = await ownedClass(this.db, classId, req.user);
    if (c.status === "ARCHIVED") throw classArchived();
    const ctx = { actorId: req.user.sub, key: readIdempotencyKey(req), scope: "POST classes/:id/assignments/:aid/gradebook/unlock:" + assignmentId, payload: b };
    return idempotent(this.db, ctx, async (tx) => {
      await lock(tx, "assignment-deadline:" + assignmentId);
      const a = await this.ownedAssignment(tx, classId, assignmentId);
      if (!a.gradebookLockedAt) throw new ConflictException({ code: "GRADEBOOK_NOT_LOCKED", message: "Sổ điểm của bài này chưa chốt" });
      await tx.assignment.update({ where: { id: assignmentId }, data: { gradebookLockedAt: null, gradebookLockedById: null } });
      await audit(tx, {
        actor: req.user,
        action: "gradebook.unlock",
        targetType: "Assignment",
        targetId: assignmentId,
        reason: b.reason,
        after: { assignmentId, lockVersion: a.gradebookLockVersion },
      });
      return { lockedAt: null, lockVersion: a.gradebookLockVersion };
    });
  }

  /** CSV of the locked snapshot in class-list order (UTF-8 BOM; "vn" = `;` and decimal comma for Vietnamese Excel). */
  async exportCsv(classId: string, assignmentId: string, req: any, query: unknown) {
    const { format } = exportQuery.parse(query ?? {});
    await ownedClass(this.db, classId, req.user);
    const a = await this.ownedAssignment(this.db, classId, assignmentId);
    if (!a.gradebookLockedAt)
      throw new ConflictException({ code: "GRADEBOOK_NOT_LOCKED", message: "Hãy chốt sổ điểm trước khi xuất bảng điểm" });
    const entries = await this.db.gradebookEntry.findMany({
      where: { assignmentId, lockVersion: a.gradebookLockVersion },
      select: { studentId: true, status: true, score10: true },
    });
    const byStudent = new Map<string, any>(entries.map((e: any) => [e.studentId, e]));
    const csv = gradebookCsv(
      classListOrder(a.targets.map((t: any) => t.student) as Array<{ id: string; fullName: string; username: string | null }>)
        .filter((st) => byStudent.has(st.id))
        .map((st, i) => {
          const e = byStudent.get(st.id);
          return { index: i + 1, username: st.username, fullName: st.fullName, status: e.status, score10: e.score10 === null || e.score10 === undefined ? null : Number(e.score10) };
        }),
      format as CsvFormat,
    );
    await audit(this.db, { actor: req.user, action: "gradebook.export", targetType: "Assignment", targetId: assignmentId, after: { assignmentId, lockVersion: a.gradebookLockVersion } });
    return { csv, fileName: csvFileName(a.title, a.gradebookLockVersion) };
  }
}
