import { BadRequestException, Body, Controller, Delete, ForbiddenException, Get, Inject, NotFoundException, Param, Post, Query, Req, ServiceUnavailableException } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { z } from "zod";
import { access } from "../../auth/interface/auth";
import { Public, Roles } from "../../../common/decorators";
import { RequestRateLimiter } from "../../../common/request-rate-limiter";
import { smtpDeliver } from "../../mail/infrastructure/mail";
import { Db } from "../../../db/db";
import { email } from "../../../common/validation";
import { StudentAccessService } from "../../progress/application/student-access.service";
import { applicableAssignmentWhere, assignmentQueueOrder } from "../../classes/application/class-access";
import { TEST_CONTENT_TYPE } from "../../classes/application/assignment-test-contract";
import { testStates } from "../../classes/application/assignment-test-state";
import { notify } from "../../notifications/application/notify";
import { overdueNotice } from "../../notifications/application/time-based-notices";
import { PARENT_CONSENT_HASH, PARENT_CONSENT_VERSION, parentCode, parentCodeHash } from "../application/parent-codes";
import { summarizeHelpSeeking } from "../application/help-seeking";
import { approvePendingLinks, confirmEmailVerification, issueEmailVerification, linkPrerequisites } from "../application/parent-links";

const MINUTE = 60 * 1000;
const linkCodeInvalid = () => new BadRequestException({ code: "LINK_CODE_INVALID", message: "Mã liên kết không hợp lệ" });

@ApiTags("NexaLab")
@ApiBearerAuth()
@Controller()
export class ParentsController {
  constructor(
    @Inject(Db) private db: Db,
    @Inject(StudentAccessService) private access: StudentAccessService,
    @Inject(RequestRateLimiter) private limiter: RequestRateLimiter,
  ) {}
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
  /** Mails a one-time verification link; the email counts as verified only when that link is opened (PRD §14). */
  @Roles("PARENT") @Post("auth/email/verify/request") async requestEmailVerification(@Req() req: any) {
    this.limiter.rate("email-verify-request:" + req.user.sub, 3);
    const user = await this.db.user.findUniqueOrThrow({ where: { id: req.user.sub }, select: { id: true, email: true, role: true, status: true, emailVerifiedAt: true } });
    if (user.emailVerifiedAt) return { verified: true, sent: false };
    if (!(await issueEmailVerification(this.db, user, smtpDeliver)))
      throw new ServiceUnavailableException({ code: "EMAIL_DELIVERY_FAILED", message: "Chưa gửi được email xác minh, hãy thử lại sau" });
    return { verified: false, sent: true };
  }
  @Public() @Post("auth/email/verify") async verifyParentEmail(@Req() req: any, @Body() body: unknown) {
    this.limiter.rate("email-verify:" + req.ip, 10);
    const b = z.object({ token: z.string().min(1).max(200) }).parse(body);
    return confirmEmailVerification(this.db, b.token);
  }
  @Roles("PARENT") @Get("auth/consents/parent-child-progress") parentConsentTerms() {
    return { purpose: "PARENT_CHILD_PROGRESS", version: PARENT_CONSENT_VERSION, contentHash: PARENT_CONSENT_HASH };
  }
  @Roles("PARENT") @Post("auth/consents") async acceptParentConsent(@Req() req: any, @Body() body: unknown) {
    const b = z.object({ purpose: z.literal("PARENT_CHILD_PROGRESS"), version: z.string().min(1), contentHash: z.string().min(1) }).parse(body);
    if (b.version !== PARENT_CONSENT_VERSION || (b.contentHash !== PARENT_CONSENT_HASH && !(process.env.NODE_ENV !== "production" && b.contentHash === "dev"))) throw new BadRequestException("Phiên bản đồng ý không hợp lệ");
    // Pending links are approved only when the email is verified as well (C1 SPEC).
    return this.db.$transaction(async (tx) => {
      const consent = await tx.parentConsent.create({ data: { userId: req.user.sub, purpose: b.purpose, version: b.version, contentHash: b.contentHash, actorId: req.user.sub } });
      return { ...consent, approvedLinks: await approvePendingLinks(tx, req.user.sub) };
    });
  }
  @Roles("PARENT") @Post("children/link") async link(
    @Req() req: any,
    @Body() body: unknown,
  ) {
    // C1 SPEC redemption limits: IP + account 5 failures / 10 min, account 15 failures / hour, IP 30 attempts / hour.
    const pair = `parent-link:${req.ip}:${req.user.sub}`;
    const account = `parent-link-account:${req.user.sub}`;
    this.limiter.guard(pair, 5);
    this.limiter.guard(account, 15);
    this.limiter.rate(`parent-link-ip:${req.ip}`, 30, 60 * MINUTE);
    const failed = () => {
      this.limiter.record(pair, 10 * MINUTE);
      this.limiter.record(account, 60 * MINUTE);
      return linkCodeInvalid();
    };
    // Malformed, unknown, expired, used and revoked codes all get the same response.
    const b = z.object({ code: z.string().regex(/^NP-[0-9A-Z]{5}(?:-[0-9A-Z]{5}){3}$/i) }).safeParse(body);
    if (!b.success) throw failed();
    const link = await this.db.$transaction(async (tx) => {
      const linkCode = await tx.parentLinkCode.findUnique({ where: { codeHash: parentCodeHash(b.data.code) } });
      if (!linkCode || linkCode.consumedAt || linkCode.revokedAt || linkCode.expiresAt <= new Date()) return null;
      await tx.parentLinkCode.update({ where: { id: linkCode.id }, data: { consumedAt: new Date() } });
      const { emailVerified, consent } = await linkPrerequisites(tx, req.user.sub);
      const status = emailVerified && consent ? "approved" : "pending";
      return tx.parentLink.upsert({ where: { parentId_studentId: { parentId: req.user.sub, studentId: linkCode.studentId } }, create: { parentId: req.user.sub, studentId: linkCode.studentId, codeId: linkCode.id, status }, update: { codeId: linkCode.id, status, revokedAt: null } });
    });
    if (!link) throw failed();
    return link;
  }
  /** C1 CAP-3: the parent's own activation prerequisites and pending links (approved children come from GET children). */
  @Roles("PARENT") @Get("children/link-status") async linkStatus(@Req() req: any) {
    const [prerequisites, pending] = await Promise.all([
      linkPrerequisites(this.db, req.user.sub),
      this.db.parentLink.findMany({
        where: { parentId: req.user.sub, status: "pending", revokedAt: null },
        // verifiedAt defaults to the redemption time while the link is still pending.
        select: { verifiedAt: true, student: { select: { id: true, fullName: true } } },
        orderBy: { verifiedAt: "asc" },
      }),
    ]);
    return { ...prerequisites, pending: pending.map((p) => ({ studentId: p.student.id, fullName: p.student.fullName, linkedAt: p.verifiedAt })) };
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
  /** SAI-05 (BR-11): how often the child asked for hints, by level per Lab. Counts only, no content. */
  @Roles("PARENT") @Get("children/:studentId/help-seeking") async helpSeeking(@Req() req: any, @Param("studentId") studentId: string) {
    await this.access.readableStudent(studentId, req);
    // After-submit hints hang off the attempt; in-run hints (SAI-01A moments A/B) only off the LabRun.
    const rows = await this.db.hintLog.findMany({
      where: { OR: [{ attempt: { studentId } }, { attemptId: null, labRun: { studentId } }] },
      select: { level: true, createdAt: true, attempt: { select: { challenge: { select: { labId: true } } } }, labRun: { select: { labId: true } } },
    });
    const hints = rows.map((row) => ({ level: row.level, createdAt: row.createdAt, labId: row.attempt?.challenge.labId ?? row.labRun?.labId ?? null }));
    const labIds = [...new Set(hints.map((row) => row.labId).filter((id): id is string => Boolean(id)))];
    const labs = labIds.length ? await this.db.lab.findMany({ where: { id: { in: labIds } }, select: { id: true, title: true } }) : [];
    return { labs: summarizeHelpSeeking(hints, new Map(labs.map((lab) => [lab.id, lab.title]))) };
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
