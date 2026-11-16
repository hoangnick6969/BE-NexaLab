import { ConflictException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { z } from "zod";
import { audit } from "../../../common/audit";
import { idempotent, readIdempotencyKey } from "../../../common/idempotency";
import { Db } from "../../../db/db";
import { applicableAssignmentWhere, ownedClass } from "./class-access";
import { lock } from "./class-common";
import { assertExploreAnswers, canResubmitExplore, exploreAnswersSchema, isLateExplore, readStoredAnswers, verifyExploreSnapshot } from "./class-explore-contract";

const reviewSchema = z.object({ feedback: z.string().trim().min(1).max(2000) }).strict();

const submissionView = (row: any, dueDate: Date | null, now = new Date()) => ({
  id: row.id, assignmentId: row.assignmentId, answers: readStoredAnswers(row.answers), status: row.status, submittedAt: row.submittedAt,
  feedback: row.feedback ?? null, reviewedAt: row.reviewedAt ?? null,
  late: isLateExplore(row.submittedAt, dueDate), canResubmit: canResubmitExplore(row.status, dueDate, now),
});

const sameAnswers = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
/** Measures in requirement order, so the same answers always compare equal. */
const ordered = (answers: z.infer<typeof exploreAnswersSchema>, order: string[]) => ({
  measures: [...answers.measures].sort((x, y) => order.indexOf(x.itemId) - order.indexOf(y.itemId)),
  ...(answers.explanation ? { explanation: answers.explanation } : {}),
});

/** Class Explore submissions (P0 C3.4): a student hands in measurements and an explanation; the teacher comments. No run, verdict or progress. */
@Injectable()
export class ClassExploreService {
  constructor(@Inject(Db) private db: Db) {}

  /** The student's assignment, only when they belong to its audience (class member, approved, in the targets). */
  private async studentAssignment(assignmentId: string, studentId: string) {
    const assignment = await this.db.assignment.findFirst({ where: { id: assignmentId, contentType: "explore_lab", ...applicableAssignmentWhere(studentId) } });
    if (!assignment) throw new NotFoundException({ code: "ASSIGNMENT_NOT_FOUND", message: "Bài giao không tồn tại hoặc không dành cho bạn" });
    return assignment;
  }

  /**
   * POST assignments/:id/explore-submissions. A student may submit after the due date (it shows as late) and may resubmit
   * until the due date while the teacher has not commented. The same answers again return the saved submission.
   */
  async submit(assignmentId: string, req: any, body: unknown) {
    const parsed = exploreAnswersSchema.parse(body);
    const assignment = await this.studentAssignment(assignmentId, req.user.sub);
    const snapshot = verifyExploreSnapshot(assignment.exploreSnapshot);
    assertExploreAnswers(snapshot.requirements, parsed);
    const order = snapshot.requirements.flatMap((item) => (item.kind === "measure" ? [item.itemId] : []));
    const answers = ordered(parsed, order);
    const ctx = { actorId: req.user.sub, key: readIdempotencyKey(req), scope: "POST assignments/:id/explore-submissions:" + assignmentId, payload: answers };
    return idempotent(this.db, ctx, async (tx) => {
      await lock(tx, `class-explore-submit:${assignmentId}:${req.user.sub}`);
      const existing = await tx.classExploreSubmission.findUnique({ where: { assignmentId_studentId: { assignmentId, studentId: req.user.sub } } });
      const due: Date | null = assignment.dueDate ?? null;
      const now = new Date();
      if (existing) {
        if (sameAnswers(readStoredAnswers(existing.answers), answers)) return { submission: submissionView(existing, due, now), replayed: true };
        if (existing.status === "REVIEWED")
          throw new ConflictException({ code: "EXPLORE_ALREADY_REVIEWED", message: "Giáo viên đã nhận xét bài này; em không nộp lại được." });
        if (!canResubmitExplore(existing.status, due, now))
          throw new ConflictException({ code: "EXPLORE_RESUBMIT_CLOSED", message: "Đã quá hạn nộp; em không nộp lại được." });
        const updated = await tx.classExploreSubmission.update({ where: { id: existing.id }, data: { answers, submittedAt: now, idempotencyKey: readIdempotencyKey(req) } });
        await audit(tx, { actor: req.user, action: "class_explore.resubmit", targetType: "Assignment", targetId: assignmentId, after: { assignmentId, studentId: req.user.sub, status: "SUBMITTED" } });
        return { submission: submissionView(updated, due, now), replayed: false, resubmitted: true };
      }
      const row = await tx.classExploreSubmission.create({
        data: { assignmentId, studentId: req.user.sub, idempotencyKey: readIdempotencyKey(req), answers, submittedAt: now },
      });
      await audit(tx, { actor: req.user, action: "class_explore.submit", targetType: "Assignment", targetId: assignmentId, after: { assignmentId, studentId: req.user.sub, status: "SUBMITTED" } });
      return { submission: submissionView(row, due, now), replayed: false, resubmitted: false };
    });
  }


  private async teacherAssignment(classId: string, assignmentId: string, req: any) {
    await ownedClass(this.db, classId, req.user);
    const assignment = await this.db.assignment.findFirst({
      where: { id: assignmentId, classId, contentType: "explore_lab" },
      include: { targets: { include: { student: { select: { id: true, fullName: true, username: true } } } } },
    });
    if (!assignment) throw new NotFoundException({ code: "ASSIGNMENT_NOT_FOUND", message: "Không tìm thấy bài giao Explore" });
    return assignment;
  }

  /** GET classes/:id/assignments/:assignmentId/explore-submissions: what was asked, who handed in what, and who has not. */
  async list(classId: string, assignmentId: string, req: any) {
    const assignment = await this.teacherAssignment(classId, assignmentId, req);
    const snapshot = verifyExploreSnapshot(assignment.exploreSnapshot);
    const rows = await this.db.classExploreSubmission.findMany({ where: { assignmentId }, orderBy: { submittedAt: "asc" } });
    const students = new Map(assignment.targets.map((target: any) => [target.studentId, target.student]));
    return {
      assignment: { id: assignment.id, title: assignment.title, dueDate: assignment.dueDate, requirements: snapshot.requirements, instructions: snapshot.instructions, effectiveConfig: snapshot.effectiveConfig },
      submissions: rows.map((row: any) => ({ ...submissionView(row, assignment.dueDate ?? null), student: students.get(row.studentId) ?? { id: row.studentId, fullName: null, username: null } })),
      pending: [...students.values()].filter((student: any) => !rows.some((row: any) => row.studentId === student.id)),
    };
  }

  /** PUT classes/:id/assignments/:assignmentId/explore-submissions/:submissionId/review: the comment moves it to REVIEWED. It can be edited later. */
  async review(classId: string, assignmentId: string, submissionId: string, req: any, body: unknown) {
    const { feedback } = reviewSchema.parse(body);
    const assignment = await this.teacherAssignment(classId, assignmentId, req);
    return this.db.$transaction(async (tx) => {
      const row = await tx.classExploreSubmission.findFirst({ where: { id: submissionId, assignmentId } });
      if (!row) throw new NotFoundException({ code: "SUBMISSION_NOT_FOUND", message: "Không tìm thấy bài nộp" });
      const updated = await tx.classExploreSubmission.update({ where: { id: submissionId }, data: { feedback, status: "REVIEWED", reviewedById: req.user.sub, reviewedAt: new Date() } });
      await audit(tx, { actor: req.user, action: "class_explore.review", targetType: "Assignment", targetId: assignmentId, after: { assignmentId, studentId: row.studentId, status: "REVIEWED" } });
      return { submission: submissionView(updated, assignment.dueDate ?? null) };
    });
  }
}

