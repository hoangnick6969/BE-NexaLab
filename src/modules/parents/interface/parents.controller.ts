import { BadRequestException, Body, Controller, Delete, ForbiddenException, Get, Inject, NotFoundException, Param, Post, Query, Req } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { z } from "zod";
import { access } from "../../auth/interface/auth";
import { Roles } from "../../../common/decorators";
import { Db } from "../../../db/db";
import { email } from "../../../common/validation";
import { StudentAccessService } from "../../progress/application/student-access.service";
import { applicableAssignmentWhere, assignmentQueueOrder } from "../../classes/application/class-access";
import { TEST_CONTENT_TYPE } from "../../classes/application/assignment-test-contract";
import { testStates } from "../../classes/application/assignment-test-state";
import { notify } from "../../notifications/application/notify";
import { overdueNotice } from "../../notifications/application/time-based-notices";
import { PARENT_CONSENT_HASH, PARENT_CONSENT_VERSION, parentCode, parentCodeHash } from "../application/parent-codes";

@ApiTags("NexaLab")
@ApiBearerAuth()
@Controller()
export class ParentsController {
  constructor(@Inject(Db) private db: Db, @Inject(StudentAccessService) private access: StudentAccessService) {}
  @Roles("TEACHER") @Post("classes/:classId/students/:studentId/parent-link-codes") async issueParentLinkCode(
    @Req() req: any, @Param("classId") classId: string, @Param("studentId") studentId: string,
    @Body() body: unknown,
  ) {
    const b = z.object({ guardianVerified: z.literal(true) }).parse(body);
    const enrollment = await this.db.enrollment.findFirst({ where: { classId, studentId, status: "approved", classroom: { teacherId: req.user.sub, status: "ACTIVE" } } });
    if (!enrollment) throw new ForbiddenException("Học sinh không thuộc lớp đang quản lý");
    const code = parentCode();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await this.db.parentLinkCode.create({ data: { studentId, teacherId: req.user.sub, classId, codeHash: parentCodeHash(code), guardianVerifiedAt: new Date(), expiresAt } });
    return { code, expiresAt, consentVersion: PARENT_CONSENT_VERSION };
  }
  @Roles("PARENT") @Post("auth/email/verify") async verifyParentEmail(@Req() req: any) {
    await this.db.user.update({ where: { id: req.user.sub }, data: { emailVerifiedAt: new Date() } });
    return { verified: true };
  }
  @Roles("PARENT") @Post("auth/consents") async acceptParentConsent(@Req() req: any, @Body() body: unknown) {
    const b = z.object({ purpose: z.literal("PARENT_CHILD_PROGRESS"), version: z.string().min(1), contentHash: z.string().min(1) }).parse(body);
    if (b.version !== PARENT_CONSENT_VERSION || (b.contentHash !== PARENT_CONSENT_HASH && !(process.env.NODE_ENV !== "production" && b.contentHash === "dev"))) throw new BadRequestException("Phiên bản đồng ý không hợp lệ");
    const consent = await this.db.parentConsent.create({ data: { userId: req.user.sub, purpose: b.purpose, version: b.version, contentHash: b.contentHash, actorId: req.user.sub } });
    await this.db.parentLink.updateMany({ where: { parentId: req.user.sub, status: "pending", revokedAt: null }, data: { status: "approved", verifiedAt: new Date() } });
    return consent;
  }
  @Roles("PARENT") @Post("children/link") async link(
    @Req() req: any,
    @Body() body: unknown,
  ) {
    const b = z.object({ code: z.string().regex(/^NP-[0-9A-Z]{5}(?:-[0-9A-Z]{5}){3}$/i) }).parse(body);
    return this.db.$transaction(async (tx) => {
      const linkCode = await tx.parentLinkCode.findUnique({ where: { codeHash: parentCodeHash(b.code) } });
      if (!linkCode || linkCode.consumedAt || linkCode.revokedAt || linkCode.expiresAt <= new Date()) throw new BadRequestException({ code: "LINK_CODE_INVALID", message: "Mã liên kết không hợp lệ" });
      await tx.parentLinkCode.update({ where: { id: linkCode.id }, data: { consumedAt: new Date() } });
      const parent = await tx.user.findUnique({ where: { id: req.user.sub }, select: { emailVerifiedAt: true } });
      const consent = await tx.parentConsent.findFirst({ where: { userId: req.user.sub, purpose: "PARENT_CHILD_PROGRESS", version: PARENT_CONSENT_VERSION, ...(process.env.NODE_ENV !== "production" ? { contentHash: { in: [PARENT_CONSENT_HASH, "dev"] } } : { contentHash: PARENT_CONSENT_HASH }), withdrawnAt: null } });
      const approved = Boolean(parent?.emailVerifiedAt && consent);
      return tx.parentLink.upsert({ where: { parentId_studentId: { parentId: req.user.sub, studentId: linkCode.studentId } }, create: { parentId: req.user.sub, studentId: linkCode.studentId, codeId: linkCode.id, status: approved ? "approved" : "pending" }, update: { codeId: linkCode.id, status: approved ? "approved" : "pending", revokedAt: null } });
    });
  }
  @Roles("PARENT") @Get("children") async children(@Req() req: any) {
    return this.db.parentLink.findMany({
      where: { parentId: req.user.sub, status: "approved", revokedAt: null },
      select: {
        student: {
          select: { id: true, fullName: true, grade: true, progress: true },
        },
      },
    });
  }
  @Roles("PARENT") @Delete("children/:studentId/link") async unlinkChild(@Req() req: any, @Param("studentId") studentId: string) {
    const result = await this.db.parentLink.updateMany({ where: { parentId: req.user.sub, studentId, status: "approved", revokedAt: null }, data: { status: "revoked", revokedAt: new Date() } });
    if (!result.count) throw new ForbiddenException({ code: "PARENT_LINK_REQUIRED", message: "Chưa có liên kết phụ huynh" });
    return { unlinked: true };
  }
  @Roles("PARENT") @Get("children/:studentId/progress") async parentProgress(@Req() req: any, @Param("studentId") studentId: string) {
    await this.access.readableStudent(studentId, req);
    const [progress, quizAttempts, practicalAttempts] = await Promise.all([
      this.db.progress.findMany({ where: { studentId }, select: { contentId: true, score: true, status: true, attemptsCount: true, updatedAt: true } }),
      this.db.quizAttempt.findMany({ where: { studentId }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], select: { id: true, lessonId: true, stepId: true, score: true, passed: true, createdAt: true } }),
      this.db.attempt.findMany({ where: { studentId }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], select: { id: true, challengeId: true, lessonStepId: true, verdict: true, durationMs: true, createdAt: true } }),
    ]);
    return { progress, summary: { quizAttempts: quizAttempts.length, practicalAttempts: practicalAttempts.length, passedPracticals: practicalAttempts.filter((a) => a.verdict === "passed").length, lastActivityAt: [quizAttempts[0]?.createdAt, practicalAttempts[0]?.createdAt].filter(Boolean).sort().at(-1) ?? null } };
  }
  @Roles("PARENT") @Get("children/:studentId/activity") async parentActivity(@Req() req: any, @Param("studentId") studentId: string, @Query() query: unknown) {
    await this.access.readableStudent(studentId, req);
    const q = z.object({ limit: z.coerce.number().int().min(1).max(50).default(20) }).parse(query);
    const [quiz, practical] = await Promise.all([
      this.db.quizAttempt.findMany({ where: { studentId }, orderBy: { createdAt: "desc" }, take: q.limit, select: { id: true, lessonId: true, stepId: true, score: true, passed: true, createdAt: true } }),
      this.db.attempt.findMany({ where: { studentId }, orderBy: { createdAt: "desc" }, take: q.limit, select: { id: true, challengeId: true, lessonStepId: true, verdict: true, durationMs: true, createdAt: true } }),
    ]);
    return [...quiz.map((a) => ({ kind: "QUIZ", ...a })), ...practical.map((a) => ({ kind: "PRACTICAL", ...a }))].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()).slice(0, q.limit);
  }
  /** Read-only status and deadline for a linked child's assigned test; no answers, scores or actions (I3 / 3.6). */
  private async childTestStates(studentId: string, assignmentId?: string) {
    const rows = await this.db.assignment.findMany({
      where: { ...applicableAssignmentWhere(studentId), contentType: TEST_CONTENT_TYPE, ...(assignmentId ? { id: assignmentId } : {}) },
      include: { classroom: { select: { name: true } } },
      orderBy: assignmentQueueOrder,
    });
    const { states, key } = await testStates(this.db, rows, [studentId]);
    return rows.map((a) => {
      const state = states.get(key(a.id, studentId));
      return {
        assignmentId: a.id,
        title: a.title,
        className: a.classroom.name,
        status: state?.status ?? null,
        dueAt: state?.dueAt ?? a.dueDate,
        revision: state?.revision ?? 1,
        extended: state?.extended ?? false,
      };
    });
  }
  @Roles("PARENT") @Get("children/:studentId/assignment-notices") async overdueNotices(@Req() req: any, @Param("studentId") studentId: string) {
    await this.access.readableStudent(studentId, req);
    // The panel shows the parent's stored overdue notifications (D-ACC-02 replaces the derived I3 notice), limited to
    // the ones still current: an extension changes the revision, so the old notice drops out of the panel but stays
    // in the notification history. Reading it here or from the bell marks the same row.
    const current = (await this.childTestStates(studentId)).filter((item) => item.status === "OVERDUE_UNSUBMITTED");
    if (!current.length) return [];
    const child = await this.db.user.findUnique({ where: { id: studentId }, select: { id: true, fullName: true } });
    const notices = current.map((item) => overdueNotice(req.user.sub, child!, item));
    await notify(this.db, notices);
    const stored = await this.db.notification.findMany({
      where: { recipientId: req.user.sub, dedupKey: { in: notices.map((n) => n.dedupKey!) } },
      select: { id: true, dedupKey: true, readAt: true, createdAt: true },
    });
    const byKey = new Map(stored.map((row) => [row.dedupKey, row]));
    return current.map((item, i) => {
      const row = byKey.get(notices[i].dedupKey!);
      return { id: row?.id ?? notices[i].dedupKey, kind: "OVERDUE", readAt: row?.readAt ?? null, notifiedAt: row?.createdAt ?? null, ...item };
    });
  }
  @Roles("PARENT") @Get("children/:studentId/assignments/:assignmentId") async childAssignment(@Req() req: any, @Param("studentId") studentId: string, @Param("assignmentId") assignmentId: string) {
    await this.access.readableStudent(studentId, req);
    const [item] = await this.childTestStates(studentId, assignmentId);
    if (!item) throw new NotFoundException({ code: "ASSIGNMENT_NOT_FOUND", message: "Không tìm thấy bài được giao" });
    return item;
  }
}
