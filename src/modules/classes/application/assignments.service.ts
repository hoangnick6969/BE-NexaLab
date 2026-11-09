import { Injectable, BadRequestException, Body, ConflictException, Controller, Get, Inject, NotFoundException, Param, Post, Put, Query, Req, } from "@nestjs/common";
import { z } from "zod";
import { isOverdue, ownedClass, targetHash } from "./class-access";
import { MSG, classArchived, lock, reason, text } from "./class-common";
import { audit } from "../../../common/audit";
import { idempotent, readIdempotencyKey } from "../../../common/idempotency";
import { Db } from "../../../db/db";
import { labVersion, lessonVersion } from "../../lessons/application/lesson-content";
import { assertTestAssignmentUpdate, deadlineRevisionSchema, latestSubmission, rejectLateSchema, requireTestDueDate, submissionStatus, TEST_CONTENT_TYPE, } from "./assignment-test-contract";
import { currentDeadlines, testStates } from "./assignment-test-state";
import { notify } from "../../notifications/application/notify";
import { snapshotAssignmentLab } from "../../labs/application/assignment-lab-execution";
import { digest as labExecutionDigest } from "../../labs/application/lab-run";
import { resolveClassLabResource } from "./class-lab-resource";

type ContentType = "lesson" | "lab" | "test";

function assignmentView(a: any, now = new Date()) {
  return {
    id: a.id,
    classId: a.classId,
    title: a.title,
    contentId: a.contentId,
    classLabSnapshot: a.classLabSnapshot ?? null,
    contentType: a.contentType,
    dueDate: a.dueDate,
    overdue: isOverdue(a.dueDate, now),
    audience: a.audience,
    status: a.status,
    archivedAt: a.archivedAt,
    recipientCount: a._count?.targets ?? a.targets?.length ?? 0,
    createdAt: a.createdAt,
    updatedAt: a.updatedAt,
  };
}

export const assignmentInput = z
  .object({
    contentType: z.enum(["lesson", "lab", "test"]),
    contentId: text,
    labReleaseId: text.optional(),
    labChallengeId: text.optional(),
    classLabResourceId: text.optional(),
    title: text.optional(),
    dueDate: z.string().datetime().nullable().optional(),
    studentIds: z.array(text).max(200).default([]),
    audience: z.enum(["CLASS", "SUBSET"]).optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.contentType === "lab" && !value.classLabResourceId && (!value.labReleaseId || !value.labChallengeId))
      context.addIssue({ code: z.ZodIssueCode.custom, path: [!value.labReleaseId ? "labReleaseId" : "labChallengeId"], message: "Chọn một Foundational Release đang hoạt động và thử thách được duyệt." });
    if ((value.classLabResourceId && (value.labReleaseId || value.labChallengeId)) || (value.contentType !== "lab" && (value.classLabResourceId || value.labReleaseId || value.labChallengeId)))
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["contentType"], message: "Cấu hình Lab chỉ áp dụng cho bài Lab." });
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
  constructor(@Inject(Db) private db: Db) {}

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
    const tests = rows.filter((a) => a.contentType === TEST_CONTENT_TYPE);
    const studentIds = [...new Set(tests.flatMap((a) => a.targets.map((t) => t.studentId)))];
    const { states, key } = await testStates(this.db, tests, studentIds);
    return rows.map(({ targets, ...a }) => {
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
  private async ownedTestAssignment(db: any, classId: string, assignmentId: string) {
    const assignment = await db.assignment.findFirst({
      where: { id: assignmentId, classId, contentType: TEST_CONTENT_TYPE },
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
    const a = await this.ownedTestAssignment(this.db, id, assignmentId);
    const [{ states, key }, revisions] = await Promise.all([
      testStates(this.db, [a], a.targets.map((t: any) => t.studentId)),
      this.db.assignmentDeadlineRevision.findMany({
        where: { assignmentId },
        orderBy: { revision: "asc" },
        select: { revision: true, dueAt: true, note: true, createdAt: true, triggeredBySubmissionId: true },
      }),
    ]);
    return {
      assignment: assignmentView({ ...a, _count: { targets: a.targets.length } }),
      deadlines: revisions,
      permittedDecisions: this.permittedDecisions(a),
      students: a.targets.map((t: any) => ({ student: t.student, ...states.get(key(a.id, t.studentId))! })),
    };
  }

  async lateQueue(id: string, req: any) {
    await ownedClass(this.db, id, req.user);
    const pending = await this.db.assignmentSubmission.findMany({
      where: { assignment: { classId: id, contentType: TEST_CONTENT_TYPE }, timing: "LATE", decision: null },
      select: { id: true, assignmentId: true, studentId: true },
    });
    if (!pending.length) return [];
    const assignments = await this.db.assignment.findMany({
      where: { id: { in: [...new Set(pending.map((p) => p.assignmentId))] } },
      include: { targets: { include: { student: { select: { id: true, fullName: true, username: true } } } }, classroom: { select: { status: true } } },
    });
    const { states, key } = await testStates(this.db, assignments, [...new Set(pending.map((p) => p.studentId))]);
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
    const [lessons, labs, tests] = await Promise.all([
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
      this.db.lab.findMany({
        where: {
          status: "published", scope: "SHARED_LIBRARY", releaseCleared: true, synthetic: false,
          topicCode: { not: null }, releases: { some: { status: "ACTIVE" } },
        },
        select: {
          id: true,
          title: true,
          grade: true,
          topic: true,
          subject: { select: { id: true, name: true } },
          challenges: { where: { NOT: { id: { contains: "_v-" } } }, select: { id: true, objective: true }, orderBy: { id: "asc" } },
          releases: { where: { status: "ACTIVE" }, select: { id: true, version: true, digest: true, snapshot: true }, take: 1 },
        },
        orderBy: { title: "asc" },
      }),
      this.db.classResource.findMany({
        where: { classId: id, kind: "TEST", status: "PUBLISHED" },
        select: { id: true, title: true, version: true, lessonId: true, content: true, publishedAt: true },
        orderBy: [{ title: "asc" }, { version: "desc" }],
      }),
    ]);
    const releaseRows = labs.flatMap((lab: any) => {
      const release = lab.releases?.[0];
      const snapshot = release?.snapshot as any;
      const execution = snapshot?.execution;
      const challengeIds = execution && typeof execution.effectiveParams === "object" ? Object.keys(execution.effectiveParams) : [];
      if (!release || !snapshot?.lab || snapshot.lab.id !== lab.id || labExecutionDigest(snapshot) !== release.digest || !challengeIds.length)
        return [];
      return [{ lab, release, challengeIds }];
    });
    const revokedIds = releaseRows.length ? new Set((await this.db.labPackRevocation.findMany({
      where: { packVersionId: { in: releaseRows.map(({ release }: any) => (release.snapshot as any).execution.packVersionId) } },
      select: { packVersionId: true },
    })).map((entry: any) => entry.packVersionId)) : new Set<string>();
    const eligibleLabs = releaseRows.flatMap(({ lab, release, challengeIds }: any) => {
      const execution = (release.snapshot as any).execution;
      if (revokedIds.has(execution.packVersionId)) return [];
      return [{
        id: lab.id, title: lab.title, grade: lab.grade, topic: lab.topic, subject: lab.subject,
        release: { id: release.id, version: release.version, digest: release.digest },
        ranges: (execution.template as any)?.ranges ?? {},
        previewConfig: (execution.template as any)?.buoyancy ?? null,
        effectiveParams: execution.effectiveParams,
        lessonIds: lessons.filter((lesson: any) => lesson.labId === lab.id).map((lesson: any) => lesson.id),
        challenges: lab.challenges.filter((challenge: any) => challengeIds.includes(challenge.id)),
      }].filter((entry: any) => entry.challenges.length > 0);
    });
    return {
      classGrade: c.grade,
      classLabs: await this.db.classResource.findMany({ where: { classId: id, kind: "LAB", status: "PUBLISHED" }, select: { id: true, title: true, version: true, content: true }, orderBy: { createdAt: "desc" } }),
      lessons,
      labs: eligibleLabs,
      tests: tests.map(({ content, ...test }) => ({ ...test, questionCount: (content as any)?.questions?.length ?? 0 })),
    };
  }

  private async assignableContentOrThrow(tx: any, classId: string, contentType: ContentType, contentId: string, teacherId: string) {
    if (contentType === TEST_CONTENT_TYPE) {
      // Only an explicit assignment makes a shared class test scored (I3 / 3.1).
      const test = await tx.classResource.findFirst({
        where: { id: contentId, classId, kind: "TEST", status: "PUBLISHED" },
        select: { id: true, title: true, version: true },
      });
      if (!test)
        throw new BadRequestException({
          code: "CONTENT_NOT_PUBLISHED",
          message: MSG.publishFirst,
        });
      return { id: test.id as string, title: test.title as string, version: String(test.version) };
    }
    const content = contentType === "lesson"
        ? await tx.lesson.findFirst({
            where: {
              id: contentId,
              status: "published",
              OR: [{ scope: "SHARED_LIBRARY" }, { authorId: teacherId }],
            },
            select: { id: true, title: true, content: true, materials: true, questions: true, labId: true, challengeParams: true },
          })
        : await tx.lab.findFirst({
            where: {
              id: contentId, status: "published", scope: "SHARED_LIBRARY", releaseCleared: true,
              synthetic: false, topicCode: { not: null }, releases: { some: { status: "ACTIVE" } },
            },
            select: { id: true, title: true, simulationModelRef: true, config: true },
          });
    if (!content)
      throw new BadRequestException({
        code: "CONTENT_NOT_PUBLISHED",
        message: MSG.publishFirst,
      });
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
    if (b.contentType === TEST_CONTENT_TYPE) requireTestDueDate(dueDate);
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
      const content = privateLab ? { title: privateLab.resource.title, version: privateLab.snapshot.contentDigest } : await this.assignableContentOrThrow(tx, id, b.contentType, b.contentId, req.user.sub);
      const labExecution = privateLab?.content.execution ?? (b.contentType === "lab" ? await snapshotAssignmentLab(tx, b.contentId, b.labReleaseId!, b.labChallengeId!) : null);
      const contentVersion = privateLab?.snapshot.contentDigest ?? labExecution?.releaseDigest ?? content.version;
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
          ...(labExecution ? { labExecution, labExecutionDigest: labExecutionDigest(labExecution) } : {}),
          ...(privateLab ? { classLabSnapshot: privateLab.snapshot } : {}),
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
      if (b.contentType === TEST_CONTENT_TYPE)
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
      if (existing.contentType === TEST_CONTENT_TYPE) assertTestAssignmentUpdate(b, existing.dueDate);
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
}
