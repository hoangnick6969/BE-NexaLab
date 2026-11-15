import { assessmentResourceKind, EXAM_CONTENT_TYPE, writtenContentType } from "./exam-contract";
import { Injectable, BadRequestException, Body, ConflictException, Controller, Get, Inject, NotFoundException, Optional, Param, Post, Put, Query, Req, } from "@nestjs/common";
import { z } from "zod";
import { AI_ASSESSMENT_CONFIG, assistActive, parseAiAssessmentConfig, type AiAssessmentConfig } from "../../../config/ai-assessment";
import { assertGradeMatchesSuggestion, suggestionSelect, teacherSuggestionView } from "./assignment-written-ai";
import { isOverdue, ownedClass, targetHash } from "./class-access";
import { MSG, classArchived, lock, reason, text } from "./class-common";
import { audit } from "../../../common/audit";
import { idempotent, readIdempotencyKey } from "../../../common/idempotency";
import { Db } from "../../../db/db";
import { labVersion, lessonVersion } from "../../lessons/application/lesson-content";
import { assertTestAssignmentUpdate, deadlineRevisionSchema, latestSubmission, rejectLateSchema, requireTestDueDate, submissionStatus, TEST_CONTENT_TYPE, } from "./assignment-test-contract";
import { currentDeadlines, deadlineStates, writtenGradeSelect } from "./assignment-test-state";
import { assertGradeable, buildWrittenGrade, DEADLINE_CONTENT_TYPES, normalizeFeedback, WRITTEN_CONTENT_TYPE, writtenGradeSchema, writtenSubmissionStatus } from "./assignment-written-contract";

import { notify } from "../../notifications/application/notify";
import { snapshotAssignmentLab } from "../../labs/application/assignment-lab-execution";
import { digest as labExecutionDigest } from "../../labs/application/lab-run";
import { resolveClassLabResource } from "./class-lab-resource";
import { buildExploreSnapshot } from "./class-explore-contract";
import { ASSESSMENT_POLICY, assessmentTypeSchema, isGraded, resolveAssessmentConfig, type AssessmentType } from "./assessment-policy";
import { finalizeExpiredInTx, finalizeExpiredSessions } from "./assessment-session";
import { eligibleLabs } from "./eligible-labs";
import { appendWrittenGrade, assertGradebookUnlocked } from "./written-grade-write";

type ContentType = "lesson" | "lab" | "test" | "written" | "explore_lab" | "exam";

function assignmentView(a: any, now = new Date()) {
  return {
    id: a.id,
    classId: a.classId,
    title: a.title,
    contentId: a.contentId,
    classLabSnapshot: a.classLabSnapshot ?? null,
    // Class Explore: a short description only; the pinned effective config stays server-side.
    explore: a.exploreSnapshot ? { resourceId: a.exploreSnapshot.resourceId, version: a.exploreSnapshot.version, templateId: a.exploreSnapshot.templateId, requirementCount: a.exploreSnapshot.requirements?.length ?? 0 } : null,
    contentType: a.contentType,
    dueDate: a.dueDate,
    overdue: isOverdue(a.dueDate, now),
    audience: a.audience,
    status: a.status,
    archivedAt: a.archivedAt,
    recipientCount: a._count?.targets ?? a.targets?.length ?? 0,
    createdAt: a.createdAt,
    updatedAt: a.updatedAt,
    // TAI-07 (AD-19): PRACTICE for every pre-existing row.
    assessment: {
      type: (a.assessmentType ?? "PRACTICE") as AssessmentType,
      graded: isGraded(a.assessmentType),
      coefficient: ASSESSMENT_POLICY[(a.assessmentType ?? "PRACTICE") as AssessmentType]?.coefficient ?? null,
      durationMinutes: a.durationMinutes ?? null,
      scoresPublishedAt: a.scoresPublishedAt ?? null,
      // TAI7-T3: "Chốt sổ điểm" state of the column.
      gradebookLockedAt: a.gradebookLockedAt ?? null,
      gradebookLockVersion: a.gradebookLockVersion ?? 0,
    },
  };
}

const retakeGrantSchema = z.object({ studentId: text, reason: z.string().trim().min(1).max(500) }).strict();

export const assignmentInput = z
  .object({
    contentType: z.enum(["lesson", "lab", "test", "written", "explore_lab", "exam"]),
    contentId: text,
    labReleaseId: text.optional(),
    labChallengeId: text.optional(),
    classLabResourceId: text.optional(),
    /** Class Explore (P0 C3.4): the published EXPLORE_LAB resource; `contentId` is its Lab. */
    exploreResourceId: text.optional(),
    title: text.optional(),
    dueDate: z.string().datetime().nullable().optional(),
    studentIds: z.array(text).max(200).default([]),
    audience: z.enum(["CLASS", "SUBSET"]).optional(),
    /** TAI-07: PRACTICE (default) or a graded type; fixed at creation. */
    assessmentType: assessmentTypeSchema.optional(),
    durationMinutes: z.number().int().positive().max(600).nullable().optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.contentType === "lab" && !value.classLabResourceId && (!value.labReleaseId || !value.labChallengeId))
      context.addIssue({ code: z.ZodIssueCode.custom, path: [!value.labReleaseId ? "labReleaseId" : "labChallengeId"], message: "Chọn một Foundational Release đang hoạt động và thử thách được duyệt." });
    if ((value.classLabResourceId && (value.labReleaseId || value.labChallengeId)) || (value.contentType !== "lab" && (value.classLabResourceId || value.labReleaseId || value.labChallengeId)))
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["contentType"], message: "Cấu hình Lab chỉ áp dụng cho bài Lab." });
    if (value.contentType === "explore_lab" && !value.exploreResourceId)
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["exploreResourceId"], message: "Chọn một bài Explore đã xuất bản." });
    if (value.contentType !== "explore_lab" && value.exploreResourceId)
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["contentType"], message: "Bài Explore chỉ áp dụng cho loại explore_lab." });
    if (value.audience === "SUBSET" && value.studentIds.length === 0)
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["studentIds"], message: "Hãy chọn ít nhất một học sinh." });
    if (value.audience === "CLASS" && value.studentIds.length > 0)
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["studentIds"], message: "Giao cả lớp không được kèm danh sách nhóm." });
  });

const assignmentUpdate = z
  .object({
    title: text.optional(),
    dueDate: z.string().datetime().nullable().optional(),
    studentIds: z.array(text).min(1).max(200).optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, "Không có thay đổi");

/** Use cases behind AssignmentsController (moved from the controller unchanged; repository ports are the next step). */
@Injectable()
export class AssignmentsService {
  private assessment: AiAssessmentConfig;

  constructor(
    @Inject(Db) private db: Db,
    @Optional() @Inject(AI_ASSESSMENT_CONFIG) assessment?: AiAssessmentConfig,
  ) {
    // TAI2-T6: suggestions are shown and *_AI grades accepted only in assist mode; default (no config) is off.
    this.assessment = assessment ?? parseAiAssessmentConfig({});
  }

  async classAssignments(id: string, req: any, query: unknown) {
    const q = z.object({ status: z.enum(["ACTIVE", "ARCHIVED", "ALL"]).default("ALL") }).parse(query);
    await ownedClass(this.db, id, req.user);
    const rows = await this.db.assignment.findMany({
      where: {
        classId: id,
        ...(q.status === "ALL" ? {} : { status: q.status }),
      },
      include: { _count: { select: { targets: true } }, targets: { select: { studentId: true } } },
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    });
    const deadlined = rows.filter((a) => (DEADLINE_CONTENT_TYPES as readonly string[]).includes(a.contentType));
    const graded = deadlined.filter((a) => isGraded(a.assessmentType)).map((a) => a.id);
    if (graded.length) await finalizeExpiredSessions(this.db, { assignmentIds: graded });
    const studentIds = [...new Set(deadlined.flatMap((a) => a.targets.map((t) => t.studentId)))];
    const { states, key } = await deadlineStates(this.db, deadlined, studentIds, new Date(), { revealResults: true });
    return rows.map(({ targets, ...a }) => {
      if (writtenContentType(a.contentType)) {
        // TAI2-T2: written work waits for the teacher grade instead of being scored.
        const counts = { AWAITING_GRADE: 0, GRADED: 0, LATE_REVIEW_PENDING: 0, REJECTED: 0, OVERDUE_UNSUBMITTED: 0, NOT_SUBMITTED: 0 };
        let revision = 1;
        for (const t of targets) {
          const state = states.get(key(a.id, t.studentId));
          if (!state) continue;
          revision = state.revision;
          if (state.status in counts) counts[state.status as keyof typeof counts]++;
          else counts.NOT_SUBMITTED++;
        }
        return { ...assignmentView(a), writtenSummary: { revision, extended: revision > 1, counts } };
      }
      if (a.contentType !== TEST_CONTENT_TYPE) return { ...assignmentView(a), ...(a.contentType === "lab" ? { targetStudentIds: a.audience === "SUBSET" ? targets.map((target) => target.studentId) : [] } : {}) };
      const counts = { SUBMITTED: 0, LATE_REVIEW_PENDING: 0, REJECTED: 0, OVERDUE_UNSUBMITTED: 0, NOT_SUBMITTED: 0 };
      let revision = 1;
      for (const t of targets) {
        const state = states.get(key(a.id, t.studentId));
        if (!state) continue;
        revision = state.revision;
        if (state.status in counts) counts[state.status as keyof typeof counts]++;
        else counts.NOT_SUBMITTED++;
      }
      return { ...assignmentView(a), testSummary: { revision, extended: revision > 1, counts } };
    });
  }

  // ---------- I3 assigned-test lifecycle ----------
  /** TAI2-T2: late decisions and deadline revisions apply to test and written assignments alike. */
  private async ownedTestAssignment(db: any, classId: string, assignmentId: string, contentTypes: readonly string[] = DEADLINE_CONTENT_TYPES) {
    const assignment = await db.assignment.findFirst({
      where: { id: assignmentId, classId, contentType: { in: [...contentTypes] } },
      include: { targets: { include: { student: { select: { id: true, fullName: true, username: true } } } }, classroom: { select: { status: true } } },
    });
    if (!assignment)
      throw new NotFoundException({
        code: "ASSIGNMENT_NOT_FOUND",
        message: "Không tìm thấy bài kiểm tra đã giao",
      });
    return assignment;
  }

  async testStatus(id: string, assignmentId: string, req: any) {
    await ownedClass(this.db, id, req.user);
    const a = await this.ownedTestAssignment(this.db, id, assignmentId, [TEST_CONTENT_TYPE]);
    if (isGraded(a.assessmentType)) await finalizeExpiredSessions(this.db, { assignmentIds: [assignmentId] });
    const [{ states, key }, revisions, sessions] = await Promise.all([
      deadlineStates(this.db, [a], a.targets.map((t: any) => t.studentId), new Date(), { revealResults: true }),
      this.db.assignmentDeadlineRevision.findMany({
        where: { assignmentId },
        orderBy: { revision: "asc" },
        select: { revision: true, dueAt: true, note: true, createdAt: true, triggeredBySubmissionId: true },
      }),
      this.assessmentRows(a),
    ]);
    return {
      assignment: assignmentView({ ...a, _count: { targets: a.targets.length } }),
      deadlines: revisions,
      permittedDecisions: this.permittedDecisions(a),
      students: a.targets.map((t: any) => ({ student: t.student, ...states.get(key(a.id, t.studentId))!, ...sessions(t.studentId) })),
    };
  }

  async lateQueue(id: string, req: any) {
    await ownedClass(this.db, id, req.user);
    const pending = await this.db.assignmentSubmission.findMany({
      where: { assignment: { classId: id, contentType: { in: [...DEADLINE_CONTENT_TYPES] } }, timing: "LATE", decision: null },
      select: { id: true, assignmentId: true, studentId: true },
    });
    if (!pending.length) return [];
    const assignments = await this.db.assignment.findMany({
      where: { id: { in: [...new Set(pending.map((p) => p.assignmentId))] } },
      include: { targets: { include: { student: { select: { id: true, fullName: true, username: true } } } }, classroom: { select: { status: true } } },
    });
    const { states, key } = await deadlineStates(this.db, assignments, [...new Set(pending.map((p) => p.studentId))], new Date(), { revealResults: true });
    const items: any[] = [];
    for (const a of assignments)
      for (const t of a.targets) {
        const state = states.get(key(a.id, t.studentId));
        // Only the current (latest) submission is decided; an older pending one is superseded.
        if (state?.status !== "LATE_REVIEW_PENDING" || !state.current) continue;
        items.push({
          assignmentId: a.id,
          assignmentTitle: a.title,
          assignmentStatus: a.status,
          contentType: a.contentType,
          student: t.student,
          submissionId: state.current.id,
          submittedAt: state.current.submittedAt,
          lateReason: state.current.lateReason,
          dueAt: state.dueAt,
          revision: state.revision,
          permittedDecisions: this.permittedDecisions(a),
        });
      }
    return items.sort((x, y) => new Date(x.submittedAt).getTime() - new Date(y.submittedAt).getTime());
  }

  /** Rejection stays available after archive (§2a); a deadline revision needs an active assignment and class. */
  private permittedDecisions(a: { status: string; classroom: { status: string } }) {
    return a.status === "ACTIVE" && a.classroom.status === "ACTIVE" ? ["REJECT_ZERO", "REVISE_DEADLINE_FOR_CLASS"] : ["REJECT_ZERO"];
  }

  async rejectLate(id: string, assignmentId: string, submissionId: string, req: any, body: unknown) {
    const b = rejectLateSchema.parse(body ?? {});
    await ownedClass(this.db, id, req.user);
    const ctx = {
      actorId: req.user.sub,
      key: readIdempotencyKey(req),
      scope: "POST late-submissions/:submissionId/reject:" + submissionId,
      payload: b,
    };
    return idempotent(this.db, ctx, async (tx) => {
      await lock(tx, "assignment-deadline:" + assignmentId);
      const owned = await this.ownedTestAssignment(tx, id, assignmentId);
      const submission = await tx.assignmentSubmission.findFirst({
        where: { id: submissionId, assignmentId },
        include: { decision: true },
      });
      if (!submission)
        throw new NotFoundException({ code: "SUBMISSION_NOT_FOUND", message: "Không tìm thấy bài nộp" });
      if (submissionStatus(submission) !== "LATE_REVIEW_PENDING")
        throw new ConflictException({ code: "LATE_SUBMISSION_NOT_PENDING", message: "Bài nộp này không còn chờ duyệt" });
      const own = await tx.assignmentSubmission.findMany({
        where: { assignmentId, studentId: submission.studentId },
        select: { id: true, submittedAt: true },
      });
      if (latestSubmission(own)?.id !== submissionId)
        throw new ConflictException({ code: "LATE_SUBMISSION_SUPERSEDED", message: "Học sinh đã nộp bài mới hơn; hãy xem bài nộp hiện tại" });
      const decision = await tx.lateDecision.create({
        data: { submissionId, decision: "REJECT_ZERO", actorId: req.user.sub, note: b.note ?? null },
      });
      await audit(tx, {
        actor: req.user,
        action: "assignment.late_reject",
        targetType: "AssignmentSubmission",
        targetId: submissionId,
        after: { assignmentId, studentId: submission.studentId, decision: "REJECT_ZERO" },
      });
      await notify(tx, [
        {
          recipientId: submission.studentId,
          type: "LATE_REJECTED",
          title: `Bài nộp trễ bị từ chối: ${owned.title}`,
          body: b.note ? `Ghi chú của giáo viên: ${b.note}` : "Kết quả hiện tại là 0 điểm.",
          link: `/assignments/${assignmentId}`,
          dedupKey: `late-reject:${submissionId}`,
        },
      ]);
      return { submissionId, decision: decision.decision, decidedAt: decision.createdAt, score: 0 };
    });
  }

  async reviseDeadline(id: string, assignmentId: string, req: any, body: unknown) {
    const b = deadlineRevisionSchema.parse(body);
    const c = await ownedClass(this.db, id, req.user);
    if (c.status === "ARCHIVED") throw classArchived();
    const ctx = {
      actorId: req.user.sub,
      key: readIdempotencyKey(req),
      scope: "POST classes/:id/assignments/:assignmentId/deadline-revisions:" + assignmentId,
      payload: b,
    };
    return idempotent(this.db, ctx, async (tx) => {
      await lock(tx, "assignment-deadline:" + assignmentId);
      const a = await this.ownedTestAssignment(tx, id, assignmentId);
      if (a.status !== "ACTIVE")
        throw new ConflictException({ code: "ASSIGNMENT_ARCHIVED", message: "Bài đã lưu trữ; không thể đổi hạn nộp" });
      const current = (await currentDeadlines(tx, [a])).get(assignmentId)!;
      if (b.expectedRevision !== current.revision)
        throw new ConflictException({
          code: "DEADLINE_REVISION_STALE",
          message: "Hạn nộp vừa được thay đổi; hãy tải lại trước khi đổi tiếp",
          details: { revision: current.revision, dueAt: current.dueAt },
        });
      const now = new Date();
      const dueAt = new Date(b.dueAt);
      if (dueAt.getTime() <= now.getTime() || dueAt.getTime() <= current.dueAt.getTime())
        throw new BadRequestException({ code: "DUE_DATE_NOT_LATER", message: "Hạn mới phải sau hạn hiện tại và sau thời điểm này" });
      if (b.submissionId) {
        const trigger = await tx.assignmentSubmission.findFirst({ where: { id: b.submissionId, assignmentId }, include: { decision: true } });
        if (!trigger || submissionStatus(trigger) !== "LATE_REVIEW_PENDING")
          throw new ConflictException({ code: "LATE_SUBMISSION_NOT_PENDING", message: "Bài nộp này không còn chờ duyệt" });
      }
      const revision = await tx.assignmentDeadlineRevision.create({
        data: {
          assignmentId,
          revision: current.revision + 1,
          dueAt,
          actorId: req.user.sub,
          note: b.note ?? null,
          triggeredBySubmissionId: b.submissionId ?? null,
        },
      });
      await tx.assignment.update({ where: { id: assignmentId }, data: { dueDate: dueAt } });
      // D-I3-01: the class-wide revision accepts every late submission still awaiting review.
      const pending = await tx.assignmentSubmission.findMany({
        where: { assignmentId, timing: "LATE", decision: null },
        select: { id: true },
      });
      if (pending.length)
        await tx.lateDecision.createMany({
          data: pending.map((p: any) => ({
            submissionId: p.id,
            decision: "REVISE_DEADLINE_FOR_CLASS",
            actorId: req.user.sub,
            note: b.note ?? null,
            deadlineRevisionId: revision.id,
          })),
        });
      await audit(tx, {
        actor: req.user,
        action: "assignment.deadline_revise",
        targetType: "Assignment",
        targetId: assignmentId,
        before: { dueDate: current.dueAt, deadlineRevision: current.revision },
        after: {
          dueDate: dueAt,
          deadlineRevision: revision.revision,
          recipientCount: a.targets.length,
          acceptedCount: pending.length,
          submissionId: b.submissionId ?? null,
        },
      });
      await notify(
        tx,
        a.targets.map((t: any) => ({
          recipientId: t.studentId,
          type: "DEADLINE_EXTENDED" as const,
          title: `Hạn nộp mới: ${a.title}`,
          body: b.note ?? null,
          link: `/assignments/${assignmentId}`,
          dedupKey: `deadline:${assignmentId}:${revision.revision}`,
        })),
      );
      return {
        deadline: { revision: revision.revision, dueAt: revision.dueAt },
        recipientCount: a.targets.length,
        acceptedSubmissions: pending.length,
        message: `Đã dời hạn cho ${a.targets.length} học sinh.`,
      };
    });
  }

  async assignableContent(id: string, req: any) {
    const c = await ownedClass(this.db, id, req.user);
    const [lessons, tests, writtenTasks] = await Promise.all([
      this.db.lesson.findMany({
        where: {
          status: "published",
          OR: [{ scope: "SHARED_LIBRARY" }, { authorId: req.user.sub }],
        },
        select: {
          id: true,
          title: true,
          grade: true,
          chapter: true,
          topic: true,
          labId: true,
          scope: true,
          synthetic: true,
          subject: { select: { id: true, name: true } },
        },
        orderBy: [{ grade: "asc" }, { title: "asc" }],
      }),
      this.db.classResource.findMany({
        where: { classId: id, kind: "TEST", status: "PUBLISHED" },
        select: { id: true, title: true, version: true, lessonId: true, lesson: { select: { grade: true, subject: { select: { id: true, name: true } } } }, content: true, publishedAt: true },
        orderBy: [{ title: "asc" }, { version: "desc" }],
      }),
      this.db.classResource.findMany({
        where: { classId: id, kind: "WRITTEN_TASK", status: "PUBLISHED" },
        select: { id: true, title: true, version: true, lessonId: true, content: true, publishedAt: true },
        orderBy: [{ title: "asc" }, { version: "desc" }],
      }),
    ]);
    // TAI7-T5: one rule for the editor's Lab list and the AI exam draft (eligible-labs.ts, extracted unchanged).
    const eligible = await eligibleLabs(this.db, lessons, c.grade);
    return {
      classGrade: c.grade,
      // Published Class Explore resources the teacher can assign (P0 C3.4); the pinned effective config stays server-side.
      exploreLabs: (await this.db.classResource.findMany({ where: { classId: id, kind: "EXPLORE_LAB", status: "PUBLISHED" }, select: { id: true, title: true, version: true, content: true }, orderBy: { createdAt: "desc" } }))
        .map(({ content, ...resource }: any) => ({ ...resource, labId: content?.source?.labId ?? null, requirementCount: content?.requirements?.length ?? 0 })),
      classLabs: await this.db.classResource.findMany({ where: { classId: id, kind: "LAB", status: "PUBLISHED" }, select: { id: true, title: true, version: true, content: true }, orderBy: { createdAt: "desc" } }),
      lessons,
      exams: await this.db.classResource.findMany({ where: { classId: id, kind: "EXAM", status: "PUBLISHED" }, select: { id: true, title: true, version: true, lessonId: true, publishedAt: true }, orderBy: { title: "asc" } }),
      labs: eligible,
      tests: tests.map(({ content, lesson, ...test }) => ({ ...test, grade: lesson?.grade ?? null, subject: lesson?.subject ?? null, questionCount: (content as any)?.questions?.length ?? 0 })),
      // TAI2-T2: the rubric never leaves this route; only the prompt count is listed.
      writtenTasks: writtenTasks.map(({ content, ...task }) => ({ ...task, promptCount: (content as any)?.prompts?.length ?? 0 })),
    };
  }

  /** The published Class Explore resource and the snapshot this assignment will carry (P0 C3.4). */
  private async exploreSource(tx: any, classId: string, b: z.infer<typeof assignmentInput>) {
    const resource = await tx.classResource.findFirst({ where: { id: b.exploreResourceId, classId, kind: "EXPLORE_LAB", status: "PUBLISHED" } });
    if (!resource) throw new BadRequestException({ code: "CONTENT_NOT_PUBLISHED", message: MSG.publishFirst });
    const snapshot = await buildExploreSnapshot(tx, resource);
    if (snapshot.labId !== b.contentId) throw new BadRequestException({ code: "CLASS_LAB_SOURCE_MISMATCH" });
    return { resource, snapshot };
  }

  private async assignableContentOrThrow(tx: any, classId: string, contentType: ContentType, contentId: string, teacherId: string, classGrade: number) {
    if (contentType === TEST_CONTENT_TYPE || writtenContentType(contentType)) {
      // Only an explicit assignment makes a shared class test scored (I3 / 3.1); a written task (TAI2-T2) likewise.
      const test = await tx.classResource.findFirst({
        where: { id: contentId, classId, kind: assessmentResourceKind(contentType), status: "PUBLISHED" },
        select: { id: true, title: true, version: true, lesson: { select: { grade: true } } },
      });
      if (!test)
        throw new BadRequestException({
          code: "CONTENT_NOT_PUBLISHED",
          message: MSG.publishFirst,
        });
      if (test.lesson && test.lesson.grade !== classGrade)
        throw new BadRequestException({ code: "ASSIGNMENT_GRADE_MISMATCH", message: `Bài kiểm tra thuộc khối ${test.lesson.grade}, lớp này thuộc khối ${classGrade}.` });
      return { id: test.id as string, title: test.title as string, version: String(test.version) };
    }
    const content = contentType === "lesson"
        ? await tx.lesson.findFirst({
            where: {
              id: contentId,
              status: "published",
              OR: [{ scope: "SHARED_LIBRARY" }, { authorId: teacherId }],
            },
            select: { id: true, title: true, grade: true, content: true, materials: true, questions: true, labId: true, challengeParams: true },
          })
        : await tx.lab.findFirst({
            where: {
              id: contentId, status: "published", scope: "SHARED_LIBRARY", releaseCleared: true,
              synthetic: false, topicCode: { not: null }, releases: { some: { status: "ACTIVE" } },
            },
            select: { id: true, title: true, grade: true, simulationModelRef: true, config: true },
          });
    if (!content)
      throw new BadRequestException({
        code: "CONTENT_NOT_PUBLISHED",
        message: MSG.publishFirst,
      });
    if (contentType === "lab" && content.grade !== classGrade)
      throw new BadRequestException({ code: "ASSIGNMENT_GRADE_MISMATCH", message: `Nội dung thuộc khối ${content.grade}, lớp này thuộc khối ${classGrade}.` });
    // D7 keeps an in-use lesson's structure immutable, so this hash names the version students receive.
    return {
      id: content.id as string,
      title: content.title as string,
      version: contentType === "lesson" ? lessonVersion(content) : labVersion(content),
    };
  }

  private assertDueDate(dueDate: string | null | undefined, now: Date) {
    if (!dueDate) return null;
    const due = new Date(dueDate);
    if (due.getTime() < now.getTime() - 60_000)
      throw new BadRequestException({
        code: "DUE_DATE_IN_PAST",
        message: MSG.dueInPast,
      });
    return due;
  }

  private async resolveTargets(tx: any, classId: string, studentIds: string[]) {
    if (new Set(studentIds).size !== studentIds.length)
      throw new BadRequestException({
        code: "INVALID_TARGETS",
        message: "Danh sách học sinh bị trùng",
      });
    const approved = await tx.enrollment.findMany({
      where: {
        classId,
        status: "approved",
        ...(studentIds.length ? { studentId: { in: studentIds } } : {}),
      },
      select: { studentId: true },
    });
    if (studentIds.length && approved.length !== studentIds.length)
      throw new BadRequestException({
        code: "INVALID_TARGETS",
        message: "Nhóm có học sinh không phải thành viên đã duyệt của lớp",
      });
    const targets = approved.map((item: any) => item.studentId as string);
    if (!targets.length)
      throw new BadRequestException({
        code: "NO_RECIPIENTS",
        message: "Lớp chưa có học sinh đã duyệt để nhận bài",
      });
    return targets;
  }

  private async assertNotDuplicate(
    tx: any,
    a: {
      classId: string;
      contentType: string;
      contentId: string;
      contentVersion: string | null;
      dueDate: Date | null;
      targetHash: string;
    },
    exceptId?: string,
  ) {
    const duplicate = await tx.assignment.findFirst({
      where: {
        classId: a.classId,
        contentType: a.contentType,
        contentId: a.contentId,
        // Rows created before the version column count as the same version.
        OR: [{ contentVersion: a.contentVersion }, { contentVersion: null }],
        status: "ACTIVE",
        dueDate: a.dueDate,
        targetHash: a.targetHash,
        ...(exceptId ? { id: { not: exceptId } } : {}),
      },
      select: { id: true },
    });
    if (duplicate)
      throw new ConflictException({
        code: "ASSIGNMENT_DUPLICATE",
        message: "Bài này (cùng phiên bản nội dung) đã được giao cho cùng nhóm học sinh với cùng hạn nộp",
        details: { assignmentId: duplicate.id },
      });
  }

  async assign(id: string, req: any, body: unknown) {
    const b = assignmentInput.parse(body);
    const c = await ownedClass(this.db, id, req.user);
    if (c.status === "ARCHIVED") throw classArchived();
    const now = new Date();
    const dueDate = this.assertDueDate(b.dueDate, now);
    if (b.contentType === TEST_CONTENT_TYPE || writtenContentType(b.contentType)) requireTestDueDate(dueDate);
    const assessment = resolveAssessmentConfig(b.contentType, b.assessmentType, b.durationMinutes);
    const ctx = {
      actorId: req.user.sub,
      key: readIdempotencyKey(req),
      scope: "POST classes/:id/assignments:" + id,
      payload: b,
    };
    return idempotent(this.db, ctx, async (tx) => {
      await lock(tx, "class-assign:" + id);
      const privateLab = b.classLabResourceId ? await resolveClassLabResource(tx, b.classLabResourceId, undefined, id) : null;
      if (privateLab && privateLab.content.source.labId !== b.contentId) throw new BadRequestException({ code: "CLASS_LAB_SOURCE_MISMATCH" });
      const explore = b.contentType === "explore_lab" ? await this.exploreSource(tx, id, b) : null;
      const content = explore
        ? { title: explore.resource.title, version: explore.snapshot.contentDigest }
        : privateLab ? { title: privateLab.resource.title, version: privateLab.snapshot.contentDigest } : await this.assignableContentOrThrow(tx, id, b.contentType, b.contentId, req.user.sub, c.grade);
      if (privateLab || explore) {
        const source = await tx.lab.findUnique({ where: { id: b.contentId }, select: { grade: true } });
        if (!source || source.grade !== c.grade)
          throw new BadRequestException({ code: "ASSIGNMENT_GRADE_MISMATCH", message: `Lab nguồn phải thuộc khối ${c.grade} của lớp.` });
      }
      const labExecution = privateLab?.content.execution ?? (b.contentType === "lab" ? await snapshotAssignmentLab(tx, b.contentId, b.labReleaseId!, b.labChallengeId!) : null);
      const contentVersion = explore?.snapshot.contentDigest ?? privateLab?.snapshot.contentDigest ?? labExecution?.releaseDigest ?? content.version;
      const targets = await this.resolveTargets(tx, id, b.studentIds);
      const hash = targetHash(targets);
      await this.assertNotDuplicate(tx, {
        classId: id,
        contentType: b.contentType,
        contentId: b.contentId,
        contentVersion,
        dueDate,
        targetHash: hash,
      });
      const audience = b.studentIds.length ? "SUBSET" : "CLASS";
      const assignment = await tx.assignment.create({
        data: {
          classId: id,
          contentId: b.contentId,
          contentType: b.contentType,
          title: b.title ?? content.title,
          dueDate,
          audience,
          targetHash: hash,
          contentVersion,
          assessmentType: assessment.assessmentType,
          durationMinutes: assessment.durationMinutes,
          ...(labExecution ? { labExecution, labExecutionDigest: labExecutionDigest(labExecution) } : {}),
          ...(privateLab ? { classLabSnapshot: privateLab.snapshot } : {}),
          ...(explore ? { exploreSnapshot: explore.snapshot } : {}),
          // Deprecated mirror for older deployments: [] meant "whole class".
          studentIds: audience === "SUBSET" ? targets : [],
          createdById: req.user.sub,
          status: "ACTIVE",
          targets: {
            create: targets.map((studentId: string) => ({ studentId })),
          },
        },
        include: { _count: { select: { targets: true } } },
      });
      await notify(
        tx,
        targets.map((studentId: string) => ({
          recipientId: studentId,
          type: "ASSIGNMENT_CREATED" as const,
          title: `Bài mới: ${assignment.title}`,
          body: `Lớp ${c.name}`,
          link: `/assignments/${assignment.id}`,
          dedupKey: `assignment:${assignment.id}`,
        })),
      );
      if (b.contentType === TEST_CONTENT_TYPE || writtenContentType(b.contentType))
        await tx.assignmentDeadlineRevision.create({
          data: { assignmentId: assignment.id, revision: 1, dueAt: dueDate!, actorId: req.user.sub },
        });
      await audit(tx, {
        actor: req.user,
        action: "assignment.create",
        targetType: "Assignment",
        targetId: assignment.id,
        after: {
          classId: id,
          contentType: b.contentType,
          contentId: b.contentId,
          contentVersion,
          dueDate,
          audience,
          recipientCount: targets.length,
          title: assignment.title,
          assessmentType: assessment.assessmentType,
          durationMinutes: assessment.durationMinutes,
        },
      });
      return {
        assignment: assignmentView(assignment, now),
        recipientCount: targets.length,
        message: `Đã giao cho ${targets.length} học sinh.`,
      };
    });
  }

  async updateAssignment(id: string, assignmentId: string, req: any, body: unknown) {
    const b = assignmentUpdate.parse(body);
    const c = await ownedClass(this.db, id, req.user);
    if (c.status === "ARCHIVED") throw classArchived();
    const now = new Date();
    return this.db.$transaction(async (tx) => {
      await lock(tx, "class-assign:" + id);
      const existing = await tx.assignment.findFirst({
        where: { id: assignmentId, classId: id },
        include: { targets: true },
      });
      if (!existing)
        throw new NotFoundException({
          code: "ASSIGNMENT_NOT_FOUND",
          message: "Không tìm thấy bài đã giao",
        });
      if (existing.status !== "ACTIVE")
        throw new ConflictException({
          code: "ASSIGNMENT_ARCHIVED",
          message: "Bài đã lưu trữ; hãy giao bài mới",
        });
      if (existing.contentType === TEST_CONTENT_TYPE || writtenContentType(existing.contentType)) assertTestAssignmentUpdate(b, existing.dueDate);
      const dueDate =
        b.dueDate === undefined
          ? existing.dueDate
          : b.dueDate === null
            ? null
            : existing.dueDate && new Date(b.dueDate).getTime() === existing.dueDate.getTime()
              ? existing.dueDate
              : this.assertDueDate(b.dueDate, now);
      const before = existing.targets.map((t) => t.studentId);
      let targets = before;
      if (b.studentIds) targets = await this.resolveTargets(tx, id, b.studentIds);
      const hash = targetHash(targets);
      await this.assertNotDuplicate(
        tx,
        {
          classId: id,
          contentType: existing.contentType,
          contentId: existing.contentId,
          contentVersion: existing.contentVersion,
          dueDate,
          targetHash: hash,
        },
        assignmentId,
      );
      const added = targets.filter((s) => !before.includes(s));
      const removed = before.filter((s) => !targets.includes(s));
      if (removed.length)
        await tx.assignmentTarget.deleteMany({
          where: { assignmentId, studentId: { in: removed } },
        });
      if (added.length)
        await tx.assignmentTarget.createMany({
          data: added.map((studentId) => ({ assignmentId, studentId })),
        });
      const audience = b.studentIds ? "SUBSET" : existing.audience;
      const updated = await tx.assignment.update({
        where: { id: assignmentId },
        data: {
          ...(b.title ? { title: b.title } : {}),
          dueDate,
          targetHash: hash,
          audience,
          studentIds: audience === "SUBSET" ? targets : [],
        },
        include: { _count: { select: { targets: true } } },
      });
      await audit(tx, {
        actor: req.user,
        action: "assignment.update",
        targetType: "Assignment",
        targetId: assignmentId,
        before: {
          title: existing.title,
          dueDate: existing.dueDate,
          audience: existing.audience,
          recipientCount: before.length,
        },
        after: {
          title: updated.title,
          dueDate: updated.dueDate,
          audience,
          recipientCount: targets.length,
          targetsAdded: added,
          targetsRemoved: removed,
        },
      });
      return {
        assignment: assignmentView(updated, now),
        recipientCount: targets.length,
      };
    });
  }

  async archiveAssignment(id: string, assignmentId: string, req: any, body: unknown) {
    const b = z
      .object({ reason, confirm: z.literal(true) })
      .strict()
      .parse(body ?? {});
    await ownedClass(this.db, id, req.user);
    return this.db.$transaction(async (tx) => {
      const existing = await tx.assignment.findFirst({
        where: { id: assignmentId, classId: id },
        include: { _count: { select: { targets: true } } },
      });
      if (!existing)
        throw new NotFoundException({
          code: "ASSIGNMENT_NOT_FOUND",
          message: "Không tìm thấy bài đã giao",
        });
      if (existing.status === "ARCHIVED") return { assignment: assignmentView(existing), alreadyArchived: true };
      const updated = await tx.assignment.update({
        where: { id: assignmentId },
        data: { status: "ARCHIVED", archivedAt: new Date() },
        include: { _count: { select: { targets: true } } },
      });
      await audit(tx, {
        actor: req.user,
        action: "assignment.archive",
        targetType: "Assignment",
        targetId: assignmentId,
        reason: b.reason,
        before: { status: existing.status },
        after: { status: "ARCHIVED" },
      });
      return { assignment: assignmentView(updated), alreadyArchived: false };
    });
  }

  // ---------- TAI-07 (TAI7-T1) assessment mode ----------

  /** Per-student attempt facts for the teacher boards (graded only; PRACTICE rows get `attempts: null`). */
  private async assessmentRows(a: { id: string; assessmentType?: string | null }) {
    if (!isGraded(a.assessmentType)) return (_studentId: string) => ({ attempts: null });
    const [sessions, grants] = await Promise.all([
      this.db.assessmentSession.findMany({
        where: { assignmentId: a.id },
        orderBy: { attemptNo: "asc" },
        select: { id: true, studentId: true, attemptNo: true, startedAt: true, expiresAt: true, status: true, submission: { select: { id: true, submittedAt: true, autoSubmitted: true } } },
      }),
      this.db.assessmentRetakeGrant.findMany({ where: { assignmentId: a.id }, select: { studentId: true, consumedAt: true, createdAt: true } }),
    ]);
    return (studentId: string) => {
      const own = sessions.filter((s: any) => s.studentId === studentId);
      return {
        attempts: {
          used: own.length,
          allowed: 1 + grants.filter((g: any) => g.studentId === studentId).length,
          retakePending: grants.some((g: any) => g.studentId === studentId && !g.consumedAt),
          sessions: own.map((s: any) => ({
            id: s.id,
            attemptNo: s.attemptNo,
            status: s.status,
            startedAt: s.startedAt,
            expiresAt: s.expiresAt,
            submissionId: s.submission?.id ?? null,
            autoSubmitted: s.submission?.autoSubmitted ?? false,
            durationUsedSeconds: s.submission ? Math.max(0, Math.round((s.submission.submittedAt.getTime() - s.startedAt.getTime()) / 1000)) : null,
          })),
        },
      };
    };
  }

  private async ownedGradedAssignment(db: any, classId: string, assignmentId: string) {
    const a = await db.assignment.findFirst({
      where: { id: assignmentId, classId, contentType: { in: [...DEADLINE_CONTENT_TYPES] } },
      include: { targets: { select: { studentId: true } } },
    });
    if (!a) throw new NotFoundException({ code: "ASSIGNMENT_NOT_FOUND", message: "Không tìm thấy bài kiểm tra đã giao" });
    if (!isGraded(a.assessmentType))
      throw new ConflictException({ code: "ASSESSMENT_NOT_GRADED", message: "Thao tác này chỉ dùng cho bài kiểm tra lấy điểm" });
    return a;
  }

  /** "Cho phép làm lại": one extra attempt for one target student; at most one unconsumed grant at a time. */
  async grantRetake(id: string, assignmentId: string, req: any, body: unknown) {
    const b = retakeGrantSchema.parse(body ?? {});
    const c = await ownedClass(this.db, id, req.user);
    if (c.status === "ARCHIVED") throw classArchived();
    const ctx = { actorId: req.user.sub, key: readIdempotencyKey(req), scope: "POST classes/:id/assignments/:aid/retake-grants:" + assignmentId, payload: b };
    return idempotent(this.db, ctx, async (tx) => {
      await lock(tx, "assignment-deadline:" + assignmentId);
      const a = await this.ownedGradedAssignment(tx, id, assignmentId);
      assertGradebookUnlocked(a);
      if (!a.targets.some((t: any) => t.studentId === b.studentId))
        throw new NotFoundException({ code: "STUDENT_NOT_TARGETED", message: "Học sinh không thuộc danh sách được giao bài này" });
      const pending = await tx.assessmentRetakeGrant.findFirst({ where: { assignmentId, studentId: b.studentId, consumedAt: null } });
      if (pending) throw new ConflictException({ code: "ASSESSMENT_RETAKE_PENDING", message: "Học sinh đã có một lượt làm lại chưa dùng" });
      const grant = await tx.assessmentRetakeGrant.create({ data: { assignmentId, studentId: b.studentId, grantedById: req.user.sub, reason: b.reason } });
      await audit(tx, {
        actor: req.user,
        action: "assessment.retake.grant",
        targetType: "AssessmentRetakeGrant",
        targetId: grant.id,
        reason: b.reason,
        after: { assignmentId, studentId: b.studentId, retakeGrantId: grant.id },
      });
      await notify(tx, [{
        recipientId: b.studentId,
        type: "ASSESSMENT_RETAKE_GRANTED",
        title: `Em được làm lại bài "${a.title}"`,
        link: `/assignments/${a.id}`,
        dedupKey: `retake:${grant.id}`,
      }]);
      return { grant: { id: grant.id, studentId: grant.studentId, createdAt: grant.createdAt, consumedAt: null } };
    });
  }

  /** "Công bố điểm": results become visible to students and parents. Append-once; publishing again returns the same instant. */
  async publishScores(id: string, assignmentId: string, req: any) {
    const c = await ownedClass(this.db, id, req.user);
    if (c.status === "ARCHIVED") throw classArchived();
    const ctx = { actorId: req.user.sub, key: readIdempotencyKey(req), scope: "POST classes/:id/assignments/:aid/publish-scores:" + assignmentId, payload: {} };
    return idempotent(this.db, ctx, async (tx) => {
      await lock(tx, "assignment-deadline:" + assignmentId);
      const a = await this.ownedGradedAssignment(tx, id, assignmentId);
      if (a.scoresPublishedAt) return { scoresPublishedAt: a.scoresPublishedAt, alreadyPublished: true };
      await finalizeExpiredInTx(tx, assignmentId, new Date());
      const now = new Date();
      await tx.assignment.update({ where: { id: assignmentId }, data: { scoresPublishedAt: now, scoresPublishedById: req.user.sub } });
      await audit(tx, { actor: req.user, action: "assessment.scores.publish", targetType: "Assignment", targetId: assignmentId, after: { scoresPublishedAt: now } });
      const submitted = await tx.assignmentSubmission.findMany({ where: { assignmentId }, select: { studentId: true }, distinct: ["studentId"] });
      await notify(tx, submitted.map((row: any) => ({
        recipientId: row.studentId,
        type: "SCORES_PUBLISHED" as const,
        title: `Đã có điểm bài "${a.title}"`,
        link: `/assignments/${a.id}`,
        dedupKey: `scores-published:${a.id}:${row.studentId}`,
      })));
      return { scoresPublishedAt: now, alreadyPublished: false };
    });
  }

  // ---------- TAI2-T3 written grading (owner only; an archived assignment or resource stays gradeable) ----------
  private async ownedWrittenAssignment(db: any, classId: string, assignmentId: string) {
    const assignment = await db.assignment.findFirst({
      where: { id: assignmentId, classId, contentType: { in: [WRITTEN_CONTENT_TYPE, EXAM_CONTENT_TYPE] } },
      include: {
        targets: { include: { student: { select: { id: true, fullName: true, username: true } } } },
        classroom: { select: { status: true } },
      },
    });
    if (!assignment)
      throw new NotFoundException({ code: "ASSIGNMENT_NOT_FOUND", message: "Không tìm thấy bài tự luận đã giao" });
    return assignment;
  }

  /** written-status board: per recipient, the server-derived state and the current grade (teacher only). */
  async writtenStatus(id: string, assignmentId: string, req: any) {
    await ownedClass(this.db, id, req.user);
    const a = await this.ownedWrittenAssignment(this.db, id, assignmentId);
    if (isGraded(a.assessmentType)) await finalizeExpiredSessions(this.db, { assignmentIds: [assignmentId] });
    const [{ states, key }, revisions, sessions, examResource] = await Promise.all([
      deadlineStates(this.db, [a], a.targets.map((t: any) => t.studentId), new Date(), { withGrade: true, revealResults: true }),
      this.db.assignmentDeadlineRevision.findMany({
        where: { assignmentId },
        orderBy: { revision: "asc" },
        select: { revision: true, dueAt: true, note: true, createdAt: true, triggeredBySubmissionId: true },
      }),
      this.assessmentRows(a),
      a.contentType === EXAM_CONTENT_TYPE ? this.db.classResource.findFirst({
        where: { id: a.contentId, classId: id, kind: "EXAM" }, select: { content: true },
      }) : null,
    ]);
    const hasWritten = a.contentType !== EXAM_CONTENT_TYPE || !!(examResource?.content as any)?.prompts?.length;
    const students = a.targets.map((t: any) => ({ student: t.student, ...states.get(key(a.id, t.studentId))!, ...sessions(t.studentId) }));
    const assist = hasWritten && assistActive(this.assessment);
    // TAI2-T6: in assist mode each current submission carries its latest AI job state and suggestion summary.
    // In shadow mode nothing about suggestions (content or existence) is returned.
    const aiByCurrent = assist ? await this.latestAiState(students.map((s: any) => s.current?.id).filter(Boolean)) : new Map();
    return {
      assignment: assignmentView({ ...a, _count: { targets: a.targets.length } }),
      deadlines: revisions,
      permittedDecisions: this.permittedDecisions(a),
      ...(a.contentType === EXAM_CONTENT_TYPE ? { hasWritten } : {}),
      aiAssessment: hasWritten ? this.aiAssessmentFlags() : { available: false, assist: false },
      students: assist ? students.map((s: any) => ({ ...s, aiSuggestion: (s.current && aiByCurrent.get(s.current.id)) ?? null })) : students,
    };
  }

  /** What the teacher UI may offer: requests in shadow or assist mode, suggestions in assist mode only. */
  private aiAssessmentFlags() {
    const available = this.assessment.enabled && this.assessment.mode !== "off";
    return { available, assist: assistActive(this.assessment) };
  }

  /** Latest ASSESS_SUBMISSION job per submission with its assist-mode suggestion summary (assist mode only). */
  private async latestAiState(submissionIds: string[]) {
    const map = new Map<string, { jobId: string; jobStatus: string; failureCode: string | null; suggestionId: string | null; status: string | null }>();
    if (!submissionIds.length) return map;
    const jobs = await this.db.aiJob.findMany({
      where: { submissionId: { in: submissionIds }, purpose: "ASSESS_SUBMISSION", promptVersion: this.assessment.promptVersion },
      orderBy: { createdAt: "desc" },
      select: { id: true, submissionId: true, status: true, failureCode: true, request: true, suggestion: { select: { id: true, status: true, mode: true } } },
    });
    for (const job of jobs as any[]) {
      // Jobs created in shadow mode stay hidden after the switch to assist (their suggestions belong to the evaluation).
      if (map.has(job.submissionId) || job.request?.mode !== "assist") continue;
      const visible = job.suggestion && job.suggestion.mode === "assist" ? job.suggestion : null;
      map.set(job.submissionId, { jobId: job.id, jobStatus: job.status, failureCode: job.failureCode, suggestionId: visible?.id ?? null, status: visible?.status ?? null });
    }
    return map;
  }

  /** One submission for grading: responses, the rubric of the answered version (with anchors), and every grade (append-only history). */
  async writtenSubmission(id: string, assignmentId: string, submissionId: string, req: any) {
    await ownedClass(this.db, id, req.user);
    const a = await this.ownedWrittenAssignment(this.db, id, assignmentId);
    const submission = await this.db.assignmentSubmission.findFirst({
      where: { id: submissionId, assignmentId },
      include: {
        gradeDecisions: { orderBy: { createdAt: "desc" }, select: writtenGradeSelect },
        student: { select: { id: true, fullName: true, username: true } },
      },
    });
    if (!submission)
      throw new NotFoundException({ code: "SUBMISSION_NOT_FOUND", message: "Không tìm thấy bài nộp" });
    const resource = await this.db.classResource.findFirst({
      where: { id: a.contentId, classId: id, kind: assessmentResourceKind(a.contentType) },
      select: { id: true, title: true, version: true, content: true },
    });
    if (!resource) throw new NotFoundException("Nội dung không còn khả dụng");
    const siblings = await this.db.assignmentSubmission.findMany({ where: { assignmentId, studentId: submission.studentId }, select: { id: true, submittedAt: true } });
    const assist = assistActive(this.assessment);
    const ai = assist ? (await this.latestAiState([submission.id])).get(submission.id) ?? null : null;
    const suggestion = ai?.suggestionId
      ? await this.db.aiAssessmentSuggestion.findFirst({ where: { id: ai.suggestionId, submissionId: submission.id, mode: "assist" }, select: suggestionSelect })
      : null;
    return {
      aiAssessment: this.aiAssessmentFlags(),
      // Assist mode only: the latest job state (for fallback messages) and the suggestion with evidence offsets.
      ...(assist ? { aiJob: ai ? { id: ai.jobId, status: ai.jobStatus, failureCode: ai.failureCode } : null, suggestion: suggestion ? teacherSuggestionView(suggestion as any) : null } : {}),
      submission: {
        id: submission.id,
        student: submission.student,
        timing: submission.timing,
        lateReason: submission.lateReason,
        submittedAt: submission.submittedAt,
        resourceVersion: submission.resourceVersion,
        status: writtenSubmissionStatus(submission as any),
        isCurrent: latestSubmission(siblings)?.id === submission.id,
        responses: Array.isArray(submission.answers) ? submission.answers : [],
      },
      rubric: { id: resource.id, title: resource.title, version: resource.version, prompts: (resource.content as any)?.prompts ?? [] },
      grades: submission.gradeDecisions,
    };
  }

  /**
   * Append-only teacher grade: validated against the answered rubric; 409 when the submission is not gradeable or not
   * current. `*_AI` kinds (TAI2-T6, assist mode only) reference a stored suggestion of this submission; ACCEPTED_AI must
   * equal its points exactly. The stored points are always the teacher's, and the actor is always the teacher.
   */
  async gradeWritten(id: string, assignmentId: string, submissionId: string, req: any, body: unknown) {
    const b = writtenGradeSchema.parse(body);
    const c = await ownedClass(this.db, id, req.user);
    if (c.status === "ARCHIVED") throw classArchived();
    if (b.kind !== "MANUAL" && !assistActive(this.assessment))
      throw new ConflictException({ code: "AI_ASSESSMENT_DISABLED", message: "Chế độ hỗ trợ chấm bằng AI đang tắt; hãy chấm thủ công" });
    const feedback = normalizeFeedback(b.feedback);
    const ctx = {
      actorId: req.user.sub,
      key: readIdempotencyKey(req),
      scope: "POST classes/:id/assignments/:aid/submissions/:sid/grades:" + submissionId,
      payload: b,
    };
    return idempotent(this.db, ctx, async (tx) => {
      await lock(tx, "assignment-deadline:" + assignmentId);
      const a = await this.ownedWrittenAssignment(tx, id, assignmentId);
      assertGradebookUnlocked(a);
      const submission = await tx.assignmentSubmission.findFirst({ where: { id: submissionId, assignmentId }, include: { decision: true } });
      if (!submission)
        throw new NotFoundException({ code: "SUBMISSION_NOT_FOUND", message: "Không tìm thấy bài nộp" });
      const siblings = await tx.assignmentSubmission.findMany({ where: { assignmentId, studentId: submission.studentId }, select: { id: true, submittedAt: true } });
      assertGradeable(submission as any, siblings);
      // The assignment pins the resource row it was created from; that row is immutable once published.
      const resource = await tx.classResource.findFirst({ where: { id: a.contentId, classId: id, kind: assessmentResourceKind(a.contentType) }, select: { content: true } });
      if (!resource) throw new NotFoundException("Nội dung không còn khả dụng");
      const suggestion = b.kind !== "MANUAL"
        ? await tx.aiAssessmentSuggestion.findFirst({ where: { id: b.basedOnSuggestionId, submissionId }, select: suggestionSelect })
        : null;
      const { row } = await appendWrittenGrade(tx, {
        actor: req.user,
        submission,
        rubricContent: resource.content,
        kind: b.kind,
        criterionPoints: b.criterionPoints,
        feedback,
        basedOnSuggestionId: b.basedOnSuggestionId,
        suggestion: suggestion as any,
      });
      return { grade: row, status: "GRADED" };
    });
  }
}
