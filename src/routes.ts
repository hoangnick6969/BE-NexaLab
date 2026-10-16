import {
  Inject,
  Body,
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Query,
  Req,
  Res,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  UnauthorizedException,
  NotFoundException,
  HttpException,
} from "@nestjs/common";
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiBody,
  ApiResponse,
} from "@nestjs/swagger";
import { z } from "zod";
import * as argon from "argon2";
import { createHmac, randomBytes } from "node:crypto";
import { Db } from "./db";

const PARENT_CONSENT_VERSION = "2026-10-v1";
const PARENT_CONSENT_HASH = createHmac("sha256", process.env.JWT_SECRET ?? "dev").update("PARENT_CHILD_PROGRESS|2026-10-v1|vi").digest("hex");
const crockford = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
function parentCode(): string {
  const bytes = randomBytes(13);
  let value = "";
  for (let i = 0; i < 20; i++) value += crockford[bytes[i % bytes.length] % crockford.length];
  return `NP-${value.slice(0, 5)}-${value.slice(5, 10)}-${value.slice(10, 15)}-${value.slice(15)}`;
}
function parentCodeHash(code: string): string {
  return createHmac("sha256", process.env.JWT_SECRET ?? "dev").update(code.toUpperCase()).digest("hex");
}
import { Public, Roles, publicUser, access, token, hashToken } from "./auth";
import { misconceptions } from "./tutor";
import {
  buildPathwaySteps,
  materializeLegacySteps,
  reconcileVideoProgress,
  reconcileCardProgress,
  stepProgressActionSchema,
  validateLessonSteps,
  quizAttemptRequestSchema,
  quizConfigSchema,
  sanitizeQuizConfig,
} from "./pathway";
import {
  decodeCursor,
  deriveLesson,
  mergeActivityPage,
  normalizeVerdict,
  practicalSummary,
  quizSummary,
  withDerivedCompletion,
} from "./progress";
import { loadLessonEvidence, projectLab, projectLesson } from "./progress-projection";
import { applicableAssignmentWhere, assignmentQueueOrder, isOverdue, ownedClass } from "./access";
import { audit, changedFields } from "./audit";
import { idempotent, readIdempotencyKey } from "./idempotency";
import { requestHint } from "./hint";
import { smtpDeliver } from "./mail";
import { ENGINE as SIMULATION_ENGINE, evaluate, versionParams } from "./simulation-versions";
import { resolveModel } from "./sim-packs";
import { FORGOT_MESSAGE, completePasswordReset, requestPasswordReset } from "./password-reset";
import {
  CHALLENGE_PARAMETERS,
  DOMAINS,
  RELEASE_REVIEW_KINDS,
  RELEASE_REVIEW_LABELS,
  assetIds,
  materialVersionIds,
  attribution,
  challengeObjective,
  challengeParamErrors,
  domainSchema,
  isStructureChange,
  publishBlockers,
  reviewDraftSchema,
  variantChallengeId,
} from "./content";
const text = z.string().trim().min(1).max(200);
const password = z.string().min(12).max(128);
const email = z
  .string()
  .email()
  .transform((v) => v.toLowerCase());
const username = z
  .string()
  .trim()
  .toLowerCase()
  .min(3)
  .max(32)
  .regex(/^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?$/, "Username chỉ gồm chữ thường, số, dấu chấm, gạch ngang hoặc gạch dưới");
const lessonSchema = z.object({
  title: text,
  subjectId: text,
  chapter: text,
  grade: z.number().int().min(6).max(9),
  topic: text,
  learningObjective: text,
  prerequisites: text,
  curriculum: text,
  content: z.string().max(100000),
  labId: z.enum(["circuit", "eye", "chemistry"]).nullable().optional(),
  status: z.enum(["draft", "published", "archived"]),
  materials: z
    .array(
      z.object({
        type: z.enum(["video", "pdf", "image"]),
        url: z
          .string()
          .refine(
            (u) => /^https?:\/\//.test(u) || /^asset:[0-9a-f-]{36}$/.test(u) || /^assetv:[a-z0-9]{20,40}$/.test(u),
          ),
        title: text,
        transcript: z.string().trim().max(50000).optional(),
      }),
    )
    .max(20)
    .default([]),
  questions: z
    .array(
      z
        .object({
          prompt: text,
          options: z.array(text).min(2).max(6),
          answer: z.number().int().min(0).max(5),
        })
        .refine((q) => q.answer < q.options.length),
    )
    .max(30)
    .default([]),
  review: reviewDraftSchema.nullable().optional(),
  domain: domainSchema.nullable().optional(),
  outcomeCodes: z.array(z.string().trim().min(1).max(40)).max(20).default([]),
  challengeParams: z.record(z.union([z.number(), z.string().max(60)])).nullable().optional(),
  /** Only an admin may create shared-library content; ignored on update. */
  scope: z.enum(["TEACHER_PRIVATE", "SHARED_LIBRARY"]).optional(),
});
/** MSG-36: archived content for a student who has not started it. */
const ARCHIVED_CONTENT_MESSAGE = "Nội dung này không còn được cập nhật.";
function publishedSteps(lesson: z.infer<typeof lessonSchema>, namespace?: string) {
  if (lesson.status !== "published") return [];
  try {
    return materializeLegacySteps(lesson, namespace);
  } catch {
    throw new BadRequestException({
      code: "INVALID_LESSON_PATHWAY",
      message: "Bài học xuất bản cần tài nguyên hợp lệ cho từng bước",
    });
  }
}
@ApiTags("NexaLab")
@ApiBearerAuth()
@Controller()
export class ApiController {
  constructor(@Inject(Db) private db: Db) {}

  private async applicableLessonAssignment(lessonId: string, studentId: string, db: any = this.db) {
    return db.assignment.findFirst({
      where: { ...applicableAssignmentWhere(studentId), contentId: lessonId, contentType: "lesson" },
      orderBy: assignmentQueueOrder,
    });
  }
  /** Standalone lab work counts toward an assignment only when one applies (D3). */
  private async applicableLabAssignment(labId: string, studentId: string, db: any = this.db) {
    return db.assignment.findFirst({
      where: { ...applicableAssignmentWhere(studentId), contentId: labId, contentType: "lab" },
      orderBy: assignmentQueueOrder,
    });
  }
  /** Q-B1-02: archived content stays open only to students who already started it. */
  private async lessonStarted(lessonId: string, studentId: string, db: any = this.db, assignmentId?: string) {
    const stepIds = (await db.lessonStep.findMany({ where: { lessonId }, select: { id: true } })).map((step: any) => step.id);
    const [progress, quiz, practical] = await Promise.all([
      db.stepProgress.count({ where: { studentId, ...(assignmentId ? { assignmentId } : {}), stepId: { in: stepIds }, status: { not: "NOT_STARTED" } } }),
      db.quizAttempt.count({ where: { studentId, lessonId, ...(assignmentId ? { assignmentId } : {}) } }),
      db.attempt.count({ where: { studentId, lessonStepId: { in: stepIds }, ...(assignmentId ? { assignmentId } : {}) } }),
    ]);
    return progress + quiz + practical > 0;
  }
  private buckets = new Map<string, { n: number; until: number }>();
  private rate(key: string, max = 10) {
    const now = Date.now();
    if (this.buckets.size > 10000)
      for (const [k, v] of this.buckets)
        if (v.until < now) this.buckets.delete(k);
    let b = this.buckets.get(key);
    if (!b || b.until < now) {
      b = { n: 0, until: now + 60000 };
      this.buckets.set(key, b);
    }
    if (++b.n > max)
      throw new HttpException("Thao tác quá nhanh, thử lại sau một phút", 429);
  }
  private async session(user: any, res: any) {
    const refresh = token();
    const session = await this.db.session.create({
      data: {
        userId: user.id,
        tokenHash: hashToken(refresh),
        expiresAt: new Date(Date.now() + 7 * 86400000),
      },
    });
    res.cookie("refresh", refresh, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/api/auth",
      maxAge: 7 * 86400000,
    });
    return { user: publicUser(user), accessToken: access(user, session.id) };
  }
  private async applicableAssignment(id: string, studentId: string) {
    const assignment = await this.db.assignment.findFirst({
      where: { id, ...applicableAssignmentWhere(studentId) },
      include: { classroom: { select: { id: true, name: true, grade: true } } },
    });
    if (!assignment)
      throw new NotFoundException({ code: "ASSIGNMENT_NOT_FOUND", message: "Không tìm thấy bài được giao" });
    return assignment;
  }
  private async validatePublishedResources(
    lesson: z.infer<typeof lessonSchema>,
    actor: { sub: string; role: string },
    clonedFromId?: string | null,
  ) {
    if (lesson.status !== "published") return;
    if (lesson.labId) {
      const lab = await this.db.lab.findFirst({
        where: { id: lesson.labId, status: "published" },
        select: { id: true },
      });
      if (!lab)
        throw new BadRequestException({
          code: "INVALID_LESSON_PATHWAY",
          message: "Phòng lab tham chiếu chưa được xuất bản",
        });
    }
    const referenced = assetIds(lesson.materials);
    if (referenced.length) {
      const assets = await this.db.assetFile.findMany({
        where: { id: { in: referenced } },
        select: { id: true, ownerId: true, scope: true, status: true },
      });
      if (assets.some((asset) => asset.status === "QUARANTINED"))
        throw new BadRequestException({ code: "ASSET_QUARANTINED", message: "Bài học tham chiếu tệp đang bị cách ly" });
      // A clone intentionally reuses the asset references of its source (D7).
      const inherited = new Set<string>();
      if (clonedFromId) {
        const source = await this.db.lesson.findUnique({ where: { id: clonedFromId }, select: { materials: true } });
        for (const id of assetIds((source?.materials as any[]) ?? [])) inherited.add(id);
      }
      if (
        assets.length !== new Set(referenced).size ||
        (actor.role !== "ADMIN" &&
          assets.some((asset) => asset.ownerId !== actor.sub && asset.scope !== "SHARED_LIBRARY" && !inherited.has(asset.id)))
      )
        throw new BadRequestException({
          code: "INVALID_LESSON_PATHWAY",
          message: "Tài nguyên bài học không tồn tại hoặc không thuộc quyền sử dụng",
        });
    }
    // CF-T2: published content pins READY immutable versions of active assets.
    const pinned = materialVersionIds(lesson.materials);
    if (pinned.length) {
      const versions = await this.db.assetVersion.findMany({ where: { id: { in: pinned } }, include: { asset: true } });
      if (versions.some((v) => v.asset.status === "QUARANTINED" || v.status === "QUARANTINED"))
        throw new BadRequestException({ code: "ASSET_QUARANTINED", message: "Bài học tham chiếu tệp đang bị cách ly" });
      const inherited = new Set<string>();
      if (clonedFromId) {
        const source = await this.db.lesson.findUnique({ where: { id: clonedFromId }, select: { materials: true } });
        for (const id of materialVersionIds((source?.materials as any[]) ?? [])) inherited.add(id);
      }
      if (
        versions.length !== new Set(pinned).size ||
        versions.some((v) => v.status !== "READY" || v.asset.status !== "ACTIVE") ||
        (actor.role !== "ADMIN" &&
          versions.some((v) => v.asset.ownerId !== actor.sub && v.asset.scope !== "SHARED_LIBRARY" && !inherited.has(v.id)))
      )
        throw new BadRequestException({
          code: "INVALID_LESSON_PATHWAY",
          message: "Tệp bài học chưa sẵn sàng, không tồn tại hoặc không thuộc quyền sử dụng",
        });
    }
  }
  private async readableStudent(id: string, req: any) {
    if (req.user.sub === id || req.user.role === "ADMIN") return;
    if (
      req.user.role === "PARENT" &&
      (await this.db.parentLink.findUnique({
        where: {
          parentId_studentId: { parentId: req.user.sub, studentId: id },
        },
        select: { status: true, revokedAt: true },
      }))?.status === "approved" &&
      !(await this.db.parentLink.findUnique({ where: { parentId_studentId: { parentId: req.user.sub, studentId: id } }, select: { revokedAt: true } }))?.revokedAt
    )
      return;
    if (
      req.user.role === "TEACHER" &&
      (await this.db.enrollment.findFirst({
        where: {
          studentId: id,
          status: "approved",
          classroom: { teacherId: req.user.sub },
        },
      }))
    )
      return;
    throw new ForbiddenException("Không được xem dữ liệu học sinh này");
  }
  @Public() @Get("health") health() {
    return { status: "ok", version: "1.0.0" };
  }
  @Public() @Post("auth/login") async login(
    @Body() body: unknown,
    @Req() req: any,
    @Res({ passthrough: true }) res: any,
  ) {
    this.rate("login:" + req.ip);
    const b = z.object({ email, password: z.string().max(128) }).parse(body);
    const user = await this.db.user.findUnique({ where: { email: b.email } });
    if (
      !user ||
      user.role === "STUDENT" ||
      user.role === "ADMIN" ||
      user.status !== "active" ||
      !(await argon.verify(user.passwordHash, b.password))
    )
      throw new UnauthorizedException("Email hoặc mật khẩu không đúng");
    return this.session(user, res);
  }
  @Public() @Post("auth/admin/login") async adminLogin(
    @Body() body: unknown,
    @Req() req: any,
    @Res({ passthrough: true }) res: any,
  ) {
    this.rate("admin-login:" + req.ip);
    const b = z.object({ email, password: z.string().max(128) }).parse(body);
    const user = await this.db.user.findUnique({ where: { email: b.email } });
    if (
      !user ||
      user.role !== "ADMIN" ||
      user.status !== "active" ||
      !(await argon.verify(user.passwordHash, b.password))
    )
      throw new UnauthorizedException("Email hoặc mật khẩu quản trị không đúng");
    return this.session(user, res);
  }
  @Public() @Post("auth/student/login") async studentLogin(
    @Body() body: unknown,
    @Req() req: any,
    @Res({ passthrough: true }) res: any,
  ) {
    this.rate("student-login:" + req.ip);
    const b = z.object({ username, password: z.string().max(128) }).parse(body);
    const user = await this.db.user.findUnique({ where: { username: b.username } });
    if (
      !user ||
      user.role !== "STUDENT" ||
      user.status !== "active" ||
      !(await argon.verify(user.passwordHash, b.password))
    )
      throw new UnauthorizedException("Tên đăng nhập hoặc mật khẩu không đúng");
    if (
      user.mustChangePassword &&
      user.temporaryPasswordExpiresAt &&
      user.temporaryPasswordExpiresAt < new Date()
    )
      throw new UnauthorizedException(
        "Mật khẩu tạm đã hết hạn. Hãy nhờ giáo viên cấp lại.",
      );
    return this.session(user, res);
  }
  @Public() @Post("auth/register") async register(
    @Body() body: unknown,
    @Req() req: any,
    @Res({ passthrough: true }) res: any,
  ) {
    this.rate("register:" + req.ip, 3);
    const b = z
      .object({
        email,
        password,
        fullName: text,
        role: z.literal("PARENT"),
        consent: z.literal(true),
      })
      .parse(body);
    const user = await this.db.user.create({
      data: {
        email: b.email,
        fullName: b.fullName,
        passwordHash: await argon.hash(b.password),
        role: "PARENT",
        consentAt: new Date(),
      },
    });
    return this.session(user, res);
  }
  @Public() @Post("auth/refresh") async refresh(
    @Req() req: any,
    @Res({ passthrough: true }) res: any,
  ) {
    this.rate("refresh:" + req.ip, 60);
    const hash = hashToken(req.cookies.refresh ?? "");
    const s = await this.db.session.findUnique({
      where: { tokenHash: hash },
      include: { user: true },
    });
    if (
      !s ||
      s.kind !== "refresh" ||
      s.expiresAt < new Date() ||
      s.user.status !== "active"
    )
      throw new UnauthorizedException();
    const deleted = await this.db.session.deleteMany({ where: { id: s.id } });
    if (!deleted.count) throw new UnauthorizedException();
    return this.session(s.user, res);
  }
  @Public() @Post("auth/logout") async logout(
    @Req() req: any,
    @Res({ passthrough: true }) res: any,
  ) {
    await this.db.session.deleteMany({
      where: { tokenHash: hashToken(req.cookies.refresh ?? "") },
    });
    res.clearCookie("refresh", { path: "/api/auth" });
    return { ok: true };
  }
  @Get("auth/me") async me(@Req() req: any) {
    return publicUser(
      await this.db.user.findUniqueOrThrow({ where: { id: req.user.sub } }),
    );
  }
  @Post("auth/password") async changePassword(
    @Req() req: any,
    @Body() body: unknown,
    @Res({ passthrough: true }) res: any,
  ) {
    const b = z.object({ currentPassword: z.string(), password }).parse(body);
    const u = await this.db.user.findUniqueOrThrow({
      where: { id: req.user.sub },
    });
    if (!(await argon.verify(u.passwordHash, b.currentPassword)))
      throw new BadRequestException("Mật khẩu cũ không đúng");
    await this.db.$transaction([
      this.db.user.update({
        where: { id: u.id },
        data: {
          passwordHash: await argon.hash(b.password),
          mustChangePassword: false,
          temporaryPasswordExpiresAt: null,
        },
      }),
      this.db.session.deleteMany({ where: { userId: u.id } }),
    ]);
    const refreshedUser = await this.db.user.findUniqueOrThrow({
      where: { id: u.id },
    });
    return this.session(refreshedUser, res);
  }
  @Public() @Post("auth/forgot") async forgot(
    @Req() req: any,
    @Body() body: unknown,
  ) {
    this.rate("forgot:" + req.ip, 3);
    const b = z.object({ email }).parse(body);
    // C2-T4: answered before lookup or delivery finishes, so neither existence
    // nor delivery failure shows in the response or its timing.
    void requestPasswordReset(this.db, b.email, smtpDeliver).catch(() => console.error("NexaLab password-reset request failed"));
    return { message: FORGOT_MESSAGE };
  }
  @Public() @Post("auth/reset") async reset(
    @Body() body: unknown,
    @Req() req: any,
  ) {
    this.rate("reset:" + req.ip, 5);
    const b = z.object({ token: z.string().max(200), password }).parse(body);
    await completePasswordReset(this.db, b.token, b.password);
    return { ok: true };
  }
  @Get("tutor/status") tutorStatus() {
    return {
      provider:
        process.env.ANTHROPIC_API_KEY && process.env.ANTHROPIC_MODEL
          ? "anthropic"
          : "rules",
    };
  }
  @Get("subjects") subjects() {
    return this.db.subject.findMany();
  }
  @Get("labs") labs() {
    return this.db.lab.findMany({
      where: { status: "published" },
      // Lesson-variant challenges belong to their lesson pathway, not the public lab list.
      include: { challenges: { where: { NOT: { id: { contains: "_v-" } } } } },
    });
  }
  @Get("lessons") async lessons(@Req() req: any) {
    let assignedLessonIds: string[] | undefined;
    if (req.user.role === "STUDENT") {
      const assignments = await this.db.assignment.findMany({
        where: { ...applicableAssignmentWhere(req.user.sub), contentType: "lesson" },
        select: { contentId: true },
      });
      assignedLessonIds = assignments.map((assignment) => assignment.contentId);
    }
    const list = await this.db.lesson.findMany({
      where:
        req.user.role === "ADMIN"
          ? {}
          : req.user.role === "TEACHER"
            ? { OR: [{ status: "published", scope: "SHARED_LIBRARY" }, { authorId: req.user.sub }] }
            : {
                status: "published",
                ...(assignedLessonIds ? { id: { in: assignedLessonIds } } : {}),
              },
      include: { subject: true },
      orderBy: { createdAt: "desc" },
    });
    return list.map((l) => ({
      ...l,
      questions:
        req.user.role === "STUDENT" || req.user.role === "PARENT"
          ? (l.questions as any[]).map(({ answer, ...q }) => q)
          : l.questions,
    }));
  }
  private assertPublishable(data: z.infer<typeof lessonSchema>, scope: string) {
    if (data.status !== "published") return;
    const missing = publishBlockers(data as any, scope);
    if (missing.length)
      throw new BadRequestException({
        code: "PUBLISH_BLOCKED",
        message: "Chưa thể xuất bản. Còn thiếu: " + missing.join("; "),
        details: { missing },
      });
  }
  /** D7: a published lesson with an active assignment or any evidence keeps its structure. */
  private async structureLocked(lessonId: string, db: any = this.db) {
    const stepIds = (await db.lessonStep.findMany({ where: { lessonId }, select: { id: true } })).map((step: any) => step.id);
    const [assignments, progress, quiz, practical] = await Promise.all([
      db.assignment.count({ where: { contentType: "lesson", contentId: lessonId, status: "ACTIVE" } }),
      db.stepProgress.count({ where: { stepId: { in: stepIds } } }),
      db.quizAttempt.count({ where: { lessonId } }),
      db.attempt.count({ where: { lessonStepId: { in: stepIds } } }),
    ]);
    return assignments + progress + quiz + practical > 0;
  }
  private lessonAuditFields(lesson: any) {
    return {
      title: lesson.title,
      status: lesson.status,
      scope: lesson.scope,
      grade: lesson.grade,
      clonedFromId: lesson.clonedFromId,
      reviewChecklist: Boolean(lesson.review),
      domain: lesson.domain ?? null,
      outcomeCodes: lesson.outcomeCodes ?? [],
      challengeParams: lesson.challengeParams ?? null,
    };
  }
  /** Outcome codes must exist in the map for the lesson's grade; challenge parameters must be in range. */
  private async assertTaxonomy(data: z.infer<typeof lessonSchema>, alreadyMapped: string[] = []) {
    const errors = challengeParamErrors(data.labId, data.challengeParams);
    if (errors.length)
      throw new BadRequestException({ code: "INVALID_CHALLENGE_PARAMS", message: errors.join("; "), details: { errors } });
    const codes = [...new Set(data.outcomeCodes)];
    if (codes.length !== data.outcomeCodes.length)
      throw new BadRequestException({ code: "INVALID_OUTCOME", message: "Yêu cầu cần đạt bị trùng" });
    if (!codes.length) return;
    const outcomes = await this.db.curriculumOutcome.findMany({ where: { code: { in: codes } } });
    const invalid = codes.filter((code) => {
      const outcome = outcomes.find((item) => item.code === code);
      // An archived outcome stays on lessons that already map it but cannot be newly mapped (C2-T2).
      return (
        !outcome ||
        outcome.grade !== data.grade ||
        (data.domain && outcome.domain !== data.domain) ||
        (outcome.status !== "active" && !alreadyMapped.includes(code))
      );
    });
    if (invalid.length)
      throw new BadRequestException({
        code: "INVALID_OUTCOME",
        message: "Yêu cầu cần đạt không thuộc khối lớp hoặc mạch nội dung đã chọn: " + invalid.join(", "),
        details: { invalid },
      });
  }
  private async writeSteps(
    tx: any,
    lessonId: string,
    steps: ReturnType<typeof publishedSteps>,
    variant?: { labId?: string | null; challengeParams?: Record<string, number | string> | null },
  ) {
    if (steps.length && variant?.labId && variant.challengeParams) {
      // A teacher variant gets its own challenge row; the shared model is untouched.
      const challengeId = variantChallengeId(variant.labId, lessonId);
      const challenge = {
        objective: challengeObjective(variant.labId, variant.challengeParams),
        constraints: { params: variant.challengeParams, modelRef: CHALLENGE_PARAMETERS[variant.labId].modelRef } as any,
      };
      await tx.challenge.upsert({ where: { id: challengeId }, create: { id: challengeId, labId: variant.labId, ...challenge }, update: challenge });
      steps = [...steps, { type: "CHALLENGE", position: 60, required: true, config: { challengeId } }] as typeof steps;
    }
    const stepRows = steps.map((step) => ({
      ...step,
      id: `step-${lessonId}-${step.type.toLowerCase().replace("_", "-")}`,
      lessonId,
      config: step.config as any,
    }));
    if (!stepRows.length) return;
    await tx.lessonStep.deleteMany({
      where: { lessonId, id: { notIn: stepRows.map((step) => step.id) } },
    });
    for (const step of stepRows)
      await tx.lessonStep.upsert({
        where: { id: step.id },
        create: step,
        update: { type: step.type, position: step.position, required: step.required, config: step.config },
      });
  }
  @Roles("TEACHER", "ADMIN") @Post("lessons") async createLesson(
    @Body() b: unknown,
    @Req() req: any,
  ) {
    const { scope: requestedScope, ...data } = lessonSchema.parse(b);
    if (requestedScope === "SHARED_LIBRARY" && req.user.role !== "ADMIN")
      throw new ForbiddenException({ code: "BASELINE_READ_ONLY", message: "Chỉ quản trị viên tạo bài cho thư viện chung" });
    const scope = requestedScope ?? "TEACHER_PRIVATE";
    await this.assertTaxonomy(data);
    this.assertPublishable(data, scope);
    const steps = publishedSteps(data);
    await this.validatePublishedResources(data, req.user);
    return this.db.$transaction(async (tx) => {
      const lesson = await tx.lesson.create({
        data: {
          ...data,
          review: (data.review ?? undefined) as any,
          challengeParams: (data.challengeParams ?? undefined) as any,
          authorId: req.user.sub,
          scope,
          publishedAt: data.status === "published" ? new Date() : null,
        },
      });
      await this.writeSteps(tx, lesson.id, steps, data);
      await audit(tx, { actor: req.user, action: "lesson.create", targetType: "Lesson", targetId: lesson.id, after: this.lessonAuditFields(lesson) });
      return lesson;
    });
  }
  @Roles("TEACHER", "ADMIN") @Put("lessons/:id") async updateLesson(
    @Param("id") id: string,
    @Body() b: unknown,
    @Req() req: any,
  ) {
    const l = await this.db.lesson.findUnique({ where: { id } });
    if (!l || (l.authorId !== req.user.sub && req.user.role !== "ADMIN"))
      throw new ForbiddenException({ code: "LESSON_ACCESS_DENIED", message: "Bạn chỉ sửa được bài học của mình" });
    // C2-T2: an admin operates another teacher's private content (inspect, quarantine,
    // archive, reassign) but never rewrites its body.
    if (req.user.role === "ADMIN" && l.scope !== "SHARED_LIBRARY" && l.authorId !== req.user.sub)
      throw new ForbiddenException({
        code: "PRIVATE_CONTENT_READ_ONLY",
        message: "Quản trị viên không sửa nội dung riêng của giáo viên; hãy dùng thao tác quản trị có lý do",
      });
    if (l.status === "quarantined")
      throw new ConflictException({ code: "CONTENT_QUARANTINED", message: "Bài học đang bị cách ly; quản trị viên cần gỡ cách ly trước" });
    if (l.scope === "SHARED_LIBRARY" && req.user.role !== "ADMIN")
      throw new ForbiddenException({
        code: "BASELINE_READ_ONLY",
        message: "Bài nền dùng chung không sửa trực tiếp; hãy tạo bản riêng để tùy biến",
      });
    const { scope: _ignoredScope, ...parsed } = lessonSchema.parse(b);
    await this.assertTaxonomy(parsed, (l.outcomeCodes as string[]) ?? []);
    // Structural edits invalidate earlier shared-library release reviews.
    const reviewsStale = l.scope === "SHARED_LIBRARY" && isStructureChange(l as any, parsed as any);
    const data = { ...parsed, releaseReview: reviewsStale ? null : l.releaseReview };
    this.assertPublishable(data as any, l.scope);
    const locked = l.status !== "draft" && (await this.structureLocked(id));
    if (locked) {
      if (isStructureChange(l as any, data as any))
        throw new ConflictException({
          code: "LESSON_STRUCTURE_LOCKED",
          message: "Bài đã được giao hoặc đã có kết quả học tập; hãy tạo bản sao để thay đổi nội dung, câu hỏi hoặc phòng thực hành",
        });
      if (data.status === "draft")
        throw new ConflictException({
          code: "LESSON_STRUCTURE_LOCKED",
          message: "Bài đang được dùng; chỉ có thể lưu trữ chứ không thể chuyển về bản nháp",
        });
    }
    const steps = publishedSteps(parsed, l.clonedFromId ? id : undefined);
    await this.validatePublishedResources(parsed, req.user, l.clonedFromId);
    return this.db.$transaction(async (tx) => {
      const lesson = await tx.lesson.update({
        where: { id },
        data: {
          ...parsed,
          review: (parsed.review ?? undefined) as any,
          challengeParams: (parsed.challengeParams ?? null) as any,
          releaseReview: (data.releaseReview ?? null) as any,
          publishedAt: data.status === "published" ? (l.publishedAt ?? new Date()) : l.publishedAt,
        },
      });
      // A locked structure is unchanged by definition; never rewrite its steps.
      if (!locked) await this.writeSteps(tx, id, steps, parsed);
      const action =
        l.status !== data.status ? (data.status === "published" ? "lesson.publish" : data.status === "archived" ? "lesson.archive" : "lesson.unpublish") : "lesson.update";
      const diff = changedFields(this.lessonAuditFields(l), this.lessonAuditFields(lesson));
      await audit(tx, {
        actor: req.user,
        action,
        targetType: "Lesson",
        targetId: id,
        before: diff.before,
        after: { ...(diff.after ?? {}), structureLocked: locked, ...(reviewsStale && l.releaseReview ? { releaseReviewsReset: true } : {}) },
      });
      return lesson;
    });
  }
  @Roles("TEACHER", "ADMIN")
  @Post("lessons/:id/clone")
  @ApiOperation({ summary: "Create a private draft copy with new lesson/step/question IDs and reused asset references" })
  async cloneLesson(@Param("id") id: string, @Req() req: any) {
    const ctx = { actorId: req.user.sub, key: readIdempotencyKey(req), scope: "POST lessons/:id/clone", payload: { id } };
    return idempotent(this.db, ctx, async (tx) => {
      const source = await tx.lesson.findFirst({
        where:
          req.user.role === "ADMIN"
            ? { id }
            : { id, OR: [{ status: "published", scope: "SHARED_LIBRARY" }, { authorId: req.user.sub }] },
      });
      if (!source) throw new NotFoundException({ code: "LESSON_NOT_FOUND", message: "Không tìm thấy bài học" });
      const clone = await tx.lesson.create({
        data: {
          subjectId: source.subjectId,
          authorId: req.user.sub,
          title: source.title + " (bản riêng)",
          chapter: source.chapter,
          grade: source.grade,
          topic: source.topic,
          learningObjective: source.learningObjective,
          prerequisites: source.prerequisites,
          curriculum: source.curriculum,
          content: source.content,
          labId: source.labId,
          materials: source.materials as any,
          questions: source.questions as any,
          domain: source.domain,
          outcomeCodes: source.outcomeCodes as any,
          challengeParams: (source.challengeParams ?? undefined) as any,
          status: "draft",
          scope: "TEACHER_PRIVATE",
          synthetic: source.synthetic,
          clonedFromId: source.id,
        },
      });
      await audit(tx, {
        actor: req.user,
        action: "lesson.clone",
        targetType: "Lesson",
        targetId: clone.id,
        after: { clonedFromId: source.id, scope: "TEACHER_PRIVATE", status: "draft", title: clone.title },
      });
      return clone;
    });
  }
  @Roles("TEACHER", "ADMIN")
  @Get("teacher/content")
  @ApiOperation({ summary: "Content library: shared baseline plus own content, with readiness and coverage by grade" })
  async teacherContent(@Req() req: any, @Query() query: unknown) {
    const q = z
      .object({
        grade: z.coerce.number().int().min(6).max(9).optional(),
        subjectId: z.string().max(100).optional(),
        chapter: z.string().max(200).optional(),
        topic: z.string().max(200).optional(),
        domain: domainSchema.optional(),
        outcome: z.string().max(40).optional(),
        q: z.string().max(200).optional(),
        scope: z.enum(["SHARED_LIBRARY", "TEACHER_PRIVATE", "ALL"]).default("ALL"),
        status: z.enum(["draft", "published", "archived", "ALL"]).default("ALL"),
      })
      .strict()
      .parse(query);
    const visible = { OR: [{ status: "published", scope: "SHARED_LIBRARY" }, { authorId: req.user.sub }] };
    const rows = await this.db.lesson.findMany({
      where: {
        AND: [
          visible,
          q.grade ? { grade: q.grade } : {},
          q.subjectId ? { subjectId: q.subjectId } : {},
          q.chapter ? { chapter: { contains: q.chapter, mode: "insensitive" } } : {},
          q.topic ? { topic: { contains: q.topic, mode: "insensitive" } } : {},
          q.domain ? { domain: q.domain } : {},
          q.outcome ? { outcomeCodes: { array_contains: [q.outcome] } } : {},
          q.q ? { OR: [{ title: { contains: q.q, mode: "insensitive" } }, { learningObjective: { contains: q.q, mode: "insensitive" } }] } : {},
          q.scope === "ALL" ? {} : { scope: q.scope },
          q.status === "ALL" ? {} : { status: q.status },
        ],
      },
      include: { subject: { select: { id: true, name: true } } },
      orderBy: [{ grade: "asc" }, { chapter: "asc" }, { title: "asc" }],
    });
    const items: any[] = [];
    for (const lesson of rows) {
      const own = lesson.authorId === req.user.sub;
      items.push({
        id: lesson.id,
        title: lesson.title,
        subject: lesson.subject,
        grade: lesson.grade,
        chapter: lesson.chapter,
        topic: lesson.topic,
        learningObjective: lesson.learningObjective,
        domain: lesson.domain,
        outcomeCodes: lesson.outcomeCodes,
        hasChallengeVariant: lesson.challengeParams != null,
        attribution: attribution(lesson),
        status: lesson.status,
        scope: lesson.scope,
        synthetic: lesson.synthetic,
        own,
        editable: own && lesson.scope === "TEACHER_PRIVATE",
        clonedFromId: lesson.clonedFromId,
        structureLocked: own && lesson.status !== "draft" ? await this.structureLocked(lesson.id) : false,
        publishBlockers:
          (own || req.user.role === "ADMIN") && lesson.status === "draft" ? publishBlockers(lesson as any, lesson.scope) : [],
        releaseReview: lesson.scope === "SHARED_LIBRARY" ? this.releaseReviewView(lesson.releaseReview) : null,
        updatedAt: lesson.updatedAt,
      });
    }
    return { items, ...(await this.libraryCoverage(req.user.sub)), taxonomy: this.taxonomy() };
  }
  private taxonomy() {
    return {
      domains: Object.entries(DOMAINS).map(([id, label]) => ({ id, label })),
      challengeParameters: CHALLENGE_PARAMETERS,
    };
  }
  private releaseReviewView(value: unknown) {
    const reviews = (value ?? {}) as Record<string, any>;
    return RELEASE_REVIEW_KINDS.map((kind) => ({
      kind,
      label: RELEASE_REVIEW_LABELS[kind],
      reviewerName: reviews[kind]?.reviewerName ?? null,
      at: reviews[kind]?.at ?? null,
    }));
  }
  /**
   * Coverage per grade × domain over the outcome map. Released numbers use only
   * the released (non-synthetic) map and released baseline lessons; when no
   * released map exists the denominator is null and the fixture map is shown
   * separately, so a fixture is never reported as corpus coverage (CF-T5).
   */
  private async libraryCoverage(teacherId: string) {
    const [outcomes, lessons] = await Promise.all([
      this.db.curriculumOutcome.findMany({ where: { grade: { in: [8, 9] } }, orderBy: { code: "asc" } }),
      this.db.lesson.findMany({
        where: { grade: { in: [8, 9] }, OR: [{ status: "published", scope: "SHARED_LIBRARY" }, { authorId: teacherId }] },
        select: { grade: true, status: true, scope: true, synthetic: true, authorId: true, outcomeCodes: true },
      }),
    ]);
    const covered = (filter: (lesson: (typeof lessons)[number]) => boolean) =>
      new Set(lessons.filter(filter).flatMap((lesson) => (lesson.outcomeCodes as string[]) ?? []));
    const released = covered((l) => l.scope === "SHARED_LIBRARY" && l.status === "published" && !l.synthetic);
    const fixture = covered((l) => l.scope === "SHARED_LIBRARY" && l.status === "published");
    const own = covered((l) => l.authorId === teacherId && l.status === "published");
    const metric = (map: typeof outcomes, set: Set<string>) =>
      map.length ? { covered: map.filter((o) => set.has(o.code)).length, total: map.length, gaps: map.filter((o) => !set.has(o.code)).map((o) => o.code) } : null;
    const coverage = [8, 9].flatMap((grade) =>
      (Object.keys(DOMAINS) as Array<keyof typeof DOMAINS>).map((domain) => {
        const cell = outcomes.filter((o) => o.grade === grade && o.domain === domain);
        const releasedMap = cell.filter((o) => !o.synthetic);
        const fixtureMap = cell.filter((o) => o.synthetic);
        const ofGrade = lessons.filter((l) => l.grade === grade);
        return {
          grade,
          domain,
          domainLabel: DOMAINS[domain],
          releasedBaseline: metric(releasedMap, released),
          ownPublished: metric(releasedMap, own),
          fixture: metric(fixtureMap, fixture),
          releasedLessons: ofGrade.filter((l) => l.scope === "SHARED_LIBRARY" && l.status === "published" && !l.synthetic).length,
        };
      }),
    );
    const releasedMapSize = outcomes.filter((o) => !o.synthetic).length;
    return {
      coverage,
      outcomes: outcomes.map(({ code, grade, domain, chapter, statement, synthetic }) => ({ code, grade, domain, chapter, statement, synthetic })),
      coverageNote: releasedMapSize
        ? "Mỗi ô là số yêu cầu cần đạt có bài đã phát hành trên tổng số yêu cầu của mạch nội dung; danh sách còn thiếu hiển thị riêng."
        : "Chưa có bản đồ yêu cầu cần đạt lớp 8–9 được phát hành (Content Foundation CF-T5); số liệu bản đồ mẫu chỉ phục vụ phát triển, không phải tỉ lệ bao phủ.",
    };
  }
  /** Readable lesson for the library: shared published baseline or own content (admin: any). */
  private async libraryLesson(id: string, user: { sub: string; role: string }) {
    const lesson = await this.db.lesson.findFirst({
      where:
        user.role === "ADMIN" ? { id } : { id, OR: [{ status: "published", scope: "SHARED_LIBRARY" }, { authorId: user.sub }] },
      include: { subject: { select: { id: true, name: true } } },
    });
    if (!lesson) throw new NotFoundException({ code: "LESSON_NOT_FOUND", message: "Không tìm thấy bài học" });
    return lesson;
  }
  @Roles("TEACHER", "ADMIN")
  @Get("teacher/content/:id/preview")
  @ApiOperation({ summary: "Student-view preview with text alternatives for every step, attribution and readiness blockers" })
  async previewLesson(@Param("id") id: string, @Req() req: any) {
    const lesson = await this.libraryLesson(id, req.user);
    let steps: any[] = [];
    let pathwayError: string | null = null;
    try {
      steps = materializeLegacySteps(lesson as any);
    } catch {
      pathwayError = "Bài chưa đủ tài nguyên hợp lệ cho từng bước";
    }
    const lab = lesson.labId ? await this.db.lab.findUnique({ where: { id: lesson.labId } }) : null;
    const params = lesson.challengeParams as Record<string, number | string> | null;
    if (lab && params) steps.push({ type: "CHALLENGE", position: 60, required: true, config: { challengeId: variantChallengeId(lab.id, lesson.id) } });
    const textOf = (html: string) => html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
    return {
      lesson: {
        id: lesson.id,
        title: lesson.title,
        subject: lesson.subject,
        grade: lesson.grade,
        chapter: lesson.chapter,
        topic: lesson.topic,
        learningObjective: lesson.learningObjective,
        domain: lesson.domain,
        domainLabel: lesson.domain ? DOMAINS[lesson.domain as keyof typeof DOMAINS] ?? null : null,
        outcomeCodes: lesson.outcomeCodes,
        status: lesson.status,
        scope: lesson.scope,
      },
      attribution: attribution(lesson),
      readiness: { ready: !publishBlockers(lesson as any, lesson.scope).length, blockers: publishBlockers(lesson as any, lesson.scope) },
      pathwayError,
      steps: steps.map((step) => {
        const config = step.config as any;
        const textAlternative =
          step.type === "READING"
            ? textOf(config.html ?? "")
            : step.type === "VIDEO"
              ? config.transcript || config.equivalentText || null
              : step.type === "QUIZ"
                ? `${config.questions?.length ?? 0} câu hỏi trắc nghiệm, đọc được bằng trình đọc màn hình.`
                : step.type === "LAB"
                  ? `${lab?.title ?? "Phòng thực hành"}: ${lab?.learningObjective ?? ""}`
                  : params && lab
                    ? challengeObjective(lab.id, params)
                    : null;
        return {
          type: step.type,
          position: step.position,
          title:
            step.type === "VIDEO" ? config.title : step.type === "LAB" ? lab?.title ?? null : step.type === "CHALLENGE" ? "Thử thách tùy chỉnh" : null,
          textAlternative,
          missingAlternative: !textAlternative,
        };
      }),
      materials: (lesson.materials as any[]).map(({ type, title, url, transcript }) => ({ type, title, url, hasTranscript: Boolean(transcript?.trim()) })),
    };
  }
  @Roles("ADMIN")
  @Post("lessons/:id/release-reviews")
  @ApiOperation({ summary: "Record one named shared-library release review (editorial/subject/rights/safety/model)" })
  async releaseReview(@Param("id") id: string, @Req() req: any, @Body() body: unknown) {
    const b = z.object({ kind: z.enum(RELEASE_REVIEW_KINDS), note: z.string().trim().max(500).optional() }).strict().parse(body);
    return this.db.$transaction(async (tx) => {
      const lesson = await tx.lesson.findUnique({ where: { id } });
      if (!lesson) throw new NotFoundException({ code: "LESSON_NOT_FOUND", message: "Không tìm thấy bài học" });
      if (lesson.scope !== "SHARED_LIBRARY")
        throw new BadRequestException({ code: "NOT_SHARED_LIBRARY", message: "Bài riêng của giáo viên dùng phiếu tự kiểm duyệt" });
      if (b.kind === "model" && !lesson.labId)
        throw new BadRequestException({ code: "NO_MODEL_TO_REVIEW", message: "Bài không có phòng thực hành để duyệt mô hình" });
      const reviewer = await tx.user.findUniqueOrThrow({ where: { id: req.user.sub }, select: { fullName: true } });
      const reviews = { ...((lesson.releaseReview ?? {}) as Record<string, unknown>) };
      reviews[b.kind] = { reviewerId: req.user.sub, reviewerName: reviewer.fullName, at: new Date().toISOString(), ...(b.note ? { note: b.note } : {}) };
      const updated = await tx.lesson.update({ where: { id }, data: { releaseReview: reviews as any } });
      await audit(tx, { actor: req.user, action: "lesson.release_review", targetType: "Lesson", targetId: id, after: { reviewKind: b.kind, scope: lesson.scope } });
      return { releaseReview: this.releaseReviewView(updated.releaseReview), publishBlockers: publishBlockers(updated as any, updated.scope) };
    });
  }
  @Roles("STUDENT") @Get("lessons/:id/pathway") async pathway(
    @Param("id") id: string,
    @Req() req: any,
  ) {
    return this.studentPathway(id, req.user.sub);
  }
  private async studentPathway(id: string, studentId: string, db: any = this.db) {
    const assignment = await this.applicableLessonAssignment(id, studentId, db);
    if (!assignment) throw new NotFoundException({ code: "ASSIGNMENT_NOT_FOUND", message: "Không tìm thấy bài được giao" });
    const lesson = await db.lesson.findFirst({
      where: { id, status: { in: ["published", "archived"] } },
      include: {
        subject: true,
        steps: {
          orderBy: { position: "asc" },
          include: { progress: { where: { studentId, assignmentId: assignment.id } } },
        },
      },
    });
    if (!lesson) throw new NotFoundException("Nội dung không còn khả dụng");
    if (lesson.status === "archived" && !(await this.lessonStarted(id, studentId, db, assignment.id)))
      throw new NotFoundException({ code: "CONTENT_ARCHIVED", message: ARCHIVED_CONTENT_MESSAGE });
    let pathway;
    try {
      validateLessonSteps(lesson.steps as any);
      const evidence = await loadLessonEvidence(db, studentId, id, lesson.steps.map((step: any) => step.id), assignment.id);
      pathway = buildPathwaySteps(withDerivedCompletion(lesson.steps as any, evidence));
    } catch {
      throw new NotFoundException("Nội dung không còn khả dụng");
    }
    const overrides = await db.teacherGateOverride.findMany({
      where: { studentId, assignmentId: assignment.id, revokedAt: null },
      select: { stepId: true, reason: true, createdAt: true },
    });
    const unlocked = new Map(overrides.map((item: any) => [item.stepId, item]));
    pathway.steps = pathway.steps.map((step: any) => {
      const override = unlocked.get(step.id) as any;
      if (!override || step.state !== "LOCKED") return step;
      return {
        ...step,
        state: "IN_PROGRESS",
        lockReasonCode: null,
        teacherUnlocked: true,
        teacherUnlockReason: override.reason,
        teacherUnlockedAt: override.createdAt,
      };
    });
    return {
      lesson: {
        id: lesson.id,
        title: lesson.title,
        subject: { id: lesson.subject.id, name: lesson.subject.name },
        grade: lesson.grade,
        chapter: lesson.chapter,
        topic: lesson.topic,
        learningObjective: lesson.learningObjective,
        prerequisites: lesson.prerequisites,
        curriculum: lesson.curriculum,
      },
      attribution: attribution(lesson),
      assignment: {
        id: assignment.id,
        dueDate: assignment.dueDate,
        overdue: isOverdue(assignment.dueDate),
      },
      contentArchived: lesson.status === "archived",
      ...pathway,
      updatedAt: new Date().toISOString(),
    };
  }
  private async assertPracticalGate(labId: string, studentId: string, db: any) {
    const lessons = await db.lesson.findMany({
      where: { status: "published" },
      include: { steps: { where: { type: { in: ["LAB", "CHALLENGE"] } }, select: { config: true, type: true } } },
    });
    const linked = lessons.filter((lesson: any) =>
      lesson.steps.some((step: any) => (step.config as any)?.labId === labId || (step.config as any)?.challengeId?.startsWith(labId)),
    );
    if (!linked.length) return;
    let hasApplicableAssignment = false;
    for (const lesson of linked) {
      if (!(await this.applicableLessonAssignment(lesson.id, studentId, db))) continue;
      hasApplicableAssignment = true;
      try {
        const pathway = await this.studentPathway(lesson.id, studentId, db);
        if (pathway.steps.some((step: any) => (step.type === "LAB" || step.type === "CHALLENGE") && step.state !== "LOCKED")) return;
      } catch {
        // An unassigned lesson cannot grant practical access.
      }
    }
    if (!hasApplicableAssignment) return;
    throw new NotFoundException("Hoàn thành và vượt qua bài kiểm tra được giao để mở phòng thực hành");
  }
  /** Retry guidance for the model that produced the result (circuit, chemistry or eye). */
  private retryGuidance(labId: string, verdict: string, simulationResult: any): string | null {
    if (verdict === "passed") return null;
    const check = simulationResult?.challengeCheck;
    if (check?.unmet?.includes("maxCurrentMa"))
      return `Thử thách của giáo viên yêu cầu dòng qua mỗi nhánh LED không quá ${check.params.maxCurrentMa} mA. Hãy tăng điện trở.`;
    if (check?.unmet?.includes("minLitLeds"))
      return `Thử thách yêu cầu ít nhất ${check.params.minLitLeds} LED sáng. Hãy thêm LED hoặc nhánh song song an toàn.`;
    if (check?.unmet?.includes("reactionId")) return "Thử thách yêu cầu một phản ứng khác; hãy đọc lại đề bài.";
    if (check?.unmet?.includes("minScore")) return `Cần đạt ít nhất ${check.params.minScore}% để hoàn thành thử thách.`;
    if (labId === "chemistry") {
      if (simulationResult?.experiment === "ph") return "Nhúng quỳ tím vào cả ba lọ rồi xác định tính chất của từng lọ theo màu quan sát được.";
      if (!simulationResult?.extent) return "Chưa có phản ứng xảy ra. Hãy đặt lượng cả hai chất lớn hơn 0.";
      const leftover = simulationResult.limiting === simulationResult.a ? simulationResult.b : simulationResult.a;
      return `Còn ${leftover} dư. Dựa vào hệ số trong phương trình để chỉnh tỉ lệ số mol cho hai chất phản ứng vừa đủ.`;
    }
    if (labId === "eye") return "Còn bộ phận chưa đúng tên. Chuyển sang Khám phá để đọc mô tả từng bộ phận rồi thử lại.";
    if (verdict === "partial" || simulationResult?.status === "LED_OVERLOAD") {
      return "Dòng điện qua LED vượt mức an toàn (> 20 mA). Hãy tăng giá trị điện trở (R ≥ 350Ω) để bảo vệ linh kiện.";
    }
    if (simulationResult?.status === "OPEN_CIRCUIT") {
      return "Mạch điện đang bị hở hoặc thiếu dây nối. Hãy nối kín các linh kiện thành một vòng hoàn chỉnh.";
    }
    if (simulationResult?.status === "SWITCH_OPEN") {
      return "Công tắc đang mở làm ngắt dòng điện. Hãy bấm vào công tắc để đóng mạch.";
    }
    if (simulationResult?.status === "NO_LED") {
      return "Mạch điện chưa có đèn LED. Hãy bổ sung ít nhất một đèn LED vào mạch.";
    }
    if (simulationResult?.status === "LOW_CURRENT") {
      return "Dòng điện quá nhỏ (dưới 1 mA) khiến đèn không sáng. Hãy giảm bớt điện trở hoặc kiểm tra nguồn điện.";
    }
    return "Hãy kiểm tra lại các linh kiện và mối nối trên mạch điện.";
  }
  @Roles("STUDENT")
  @Get("lessons/:lessonId/quiz")
  @ApiOperation({ summary: "Get the sanitized quiz for an eligible student" })
  @ApiResponse({ status: 200, schema: { $ref: "#/components/schemas/StudentQuiz" } })
  @ApiResponse({ status: 401, schema: { $ref: "#/components/schemas/ApiErrorEnvelope" } })
  @ApiResponse({ status: 403, schema: { $ref: "#/components/schemas/ApiErrorEnvelope" } })
  @ApiResponse({ status: 404, schema: { $ref: "#/components/schemas/ApiErrorEnvelope" } })
  async studentQuiz(
    @Param("lessonId") lessonId: string,
    @Req() req: any,
  ) {
    const pathway = await this.studentPathway(lessonId, req.user.sub);
    const step = pathway.steps.find((item: any) => item.type === "QUIZ");
    if (!step || !["IN_PROGRESS", "COMPLETED"].includes(step.state) || !step.resource)
      throw new NotFoundException("Bài kiểm tra chưa khả dụng");
    return { lessonId, stepId: step.id, questions: (step.resource as any).questions };
  }
  @Roles("STUDENT")
  @Get("lessons/:lessonId/quiz-attempts")
  @ApiOperation({ summary: "Get the authenticated student's quiz attempt history" })
  @ApiResponse({ status: 200, schema: { $ref: "#/components/schemas/QuizAttemptHistory" } })
  @ApiResponse({ status: 401, schema: { $ref: "#/components/schemas/ApiErrorEnvelope" } })
  @ApiResponse({ status: 403, schema: { $ref: "#/components/schemas/ApiErrorEnvelope" } })
  @ApiResponse({ status: 404, schema: { $ref: "#/components/schemas/ApiErrorEnvelope" } })
  async studentQuizAttempts(
    @Param("lessonId") lessonId: string,
    @Req() req: any,
  ) {
    const pathway = await this.studentPathway(lessonId, req.user.sub);
    const step = pathway.steps.find((item: any) => item.type === "QUIZ");
    if (!step || !["IN_PROGRESS", "COMPLETED"].includes(step.state))
      throw new NotFoundException("Bài kiểm tra chưa khả dụng");
    const attempts = await this.db.quizAttempt.findMany({
      where: { studentId: req.user.sub, lessonId, stepId: step.id },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    });
    const latestId = attempts[0]?.id;
    const bestId = [...attempts].sort((a: any, b: any) => b.score - a.score || b.createdAt.getTime() - a.createdAt.getTime())[0]?.id;
    return {
      attempts: attempts.map((attempt: any) => {
        const snapshot = attempt.questionSnapshot as any[];
        const answers = attempt.answers as Array<{ questionId: string; optionId: string }>;
        const results = snapshot.map((question) => {
          const answer = answers.find((item) => item.questionId === question.id);
          const selected = question.options.find((option: any) => option.id === answer?.optionId);
          return {
            questionId: question.id,
            prompt: question.prompt,
            selectedOptionText: selected?.text ?? "",
            correct: answer?.optionId === question.answerOptionId,
          };
        });
        return {
          id: attempt.id,
          idempotencyKey: attempt.idempotencyKey,
          score: attempt.score,
          passed: attempt.passed,
          correctCount: attempt.correctCount,
          questionCount: attempt.questionCount,
          createdAt: attempt.createdAt.toISOString(),
          latest: attempt.id === latestId,
          best: attempt.id === bestId,
          results,
        };
      }),
    };
  }
  @Roles("STUDENT")
  @Post("lessons/:lessonId/quiz-attempts")
  @ApiOperation({ summary: "Submit one immutable quiz attempt" })
  @ApiBody({ schema: { $ref: "#/components/schemas/QuizAttemptRequest" } })
  @ApiResponse({ status: 201, schema: { $ref: "#/components/schemas/QuizAttemptResponse" } })
  @ApiResponse({ status: 400, schema: { $ref: "#/components/schemas/ApiErrorEnvelope" } })
  @ApiResponse({ status: 401, schema: { $ref: "#/components/schemas/ApiErrorEnvelope" } })
  @ApiResponse({ status: 403, schema: { $ref: "#/components/schemas/ApiErrorEnvelope" } })
  @ApiResponse({ status: 404, schema: { $ref: "#/components/schemas/ApiErrorEnvelope" } })
  @ApiResponse({ status: 409, schema: { $ref: "#/components/schemas/ApiErrorEnvelope" } })
  async submitQuizAttempt(
    @Param("lessonId") lessonId: string,
    @Body() body: unknown,
    @Req() req: any,
  ) {
    const request = quizAttemptRequestSchema.parse(body);
    const studentId = req.user.sub;
    try {
      return await this.db.$transaction(async (tx) => {
      const previous = await tx.quizAttempt.findUnique({
        where: { studentId_idempotencyKey: { studentId, idempotencyKey: request.idempotencyKey } },
      });
      const answers = [...request.answers].sort((a, b) => a.questionId.localeCompare(b.questionId));
      if (previous) {
        const savedAnswers = [...(previous.answers as any[])].sort((a, b) => a.questionId.localeCompare(b.questionId));
        const sameAnswers = savedAnswers.length === answers.length && savedAnswers.every((saved, index) =>
          saved.questionId === answers[index].questionId && saved.optionId === answers[index].optionId,
        );
        if (previous.lessonId !== lessonId || !sameAnswers)
          throw new ConflictException({ code: "IDEMPOTENCY_KEY_REUSED", message: "Khóa gửi lại đã được dùng cho nội dung khác" });
        return {
          attempt: this.quizAttemptSummary(previous),
          pathway: await this.studentPathway(lessonId, studentId, tx),
        };
      }
      const pathway = await this.studentPathway(lessonId, studentId, tx);
      const currentStep = pathway.steps.find((item: any) => item.type === "QUIZ");
      if (!currentStep || !["IN_PROGRESS", "COMPLETED"].includes(currentStep.state))
        throw new NotFoundException("Bài kiểm tra chưa khả dụng");
      const step = await tx.lessonStep.findUnique({ where: { id: currentStep.id } });
      const config = quizConfigSchema.safeParse(step?.config);
      if (!config.success) throw new NotFoundException("Bài kiểm tra chưa khả dụng");
      const questions = config.data.questions;
      const received = new Set(answers.map((answer) => answer.questionId));
      if (answers.length !== questions.length || questions.some((question) => !received.has(question.id)) ||
          answers.some((answer) => !questions.some((question) => question.id === answer.questionId && question.options.some((option) => option.id === answer.optionId))))
        throw new BadRequestException({ code: "QUIZ_ANSWERS_INVALID", message: "Câu trả lời không khớp với bài kiểm tra" });
      const correctCount = questions.filter((question) => answers.some((answer) => answer.questionId === question.id && answer.optionId === question.answerOptionId)).length;
      const score = (correctCount / questions.length) * 100;
      const passed = score >= 50;
      const assignment = await this.applicableLessonAssignment(lessonId, studentId, tx);
      const created = await tx.quizAttempt.create({
        data: {
          studentId,
          lessonId,
          stepId: currentStep.id,
          assignmentId: assignment.id,
          answers: answers as any,
          questionSnapshot: questions as any,
          correctCount,
          questionCount: questions.length,
          score,
          passed,
          idempotencyKey: request.idempotencyKey,
        },
      });
      const priorProgress = await tx.stepProgress.findUnique({ where: { studentId_assignmentId_stepId: { studentId, assignmentId: assignment.id, stepId: currentStep.id } } });
      await tx.stepProgress.upsert({
        where: { studentId_assignmentId_stepId: { studentId, assignmentId: assignment.id, stepId: currentStep.id } },
        create: {
          studentId,
          stepId: currentStep.id,
          assignmentId: assignment.id,
          status: passed ? "COMPLETED" : "IN_PROGRESS",
          progressValue: passed ? 100 : 0,
          startedAt: new Date(),
          completedAt: passed ? new Date() : null,
        },
        update: {
          status: priorProgress?.status === "COMPLETED" || passed ? "COMPLETED" : "IN_PROGRESS",
          progressValue: priorProgress?.status === "COMPLETED" || passed ? 100 : 0,
          startedAt: priorProgress?.startedAt ?? new Date(),
          completedAt: priorProgress?.completedAt ?? (passed ? new Date() : null),
        },
      });
      await projectLesson(tx, studentId, lessonId, assignment.id);
      return {
        attempt: this.quizAttemptSummary(created),
        pathway: await this.studentPathway(lessonId, studentId, tx),
      };
      });
    } catch (error) {
      if ((error as any)?.code !== "P2002") throw error;
      const previous = await this.db.quizAttempt.findUnique({
        where: { studentId_idempotencyKey: { studentId, idempotencyKey: request.idempotencyKey } },
      });
      if (!previous) throw error;
      const answers = [...request.answers].sort((a, b) => a.questionId.localeCompare(b.questionId));
      const savedAnswers = [...(previous.answers as any[])].sort((a, b) => a.questionId.localeCompare(b.questionId));
      const sameAnswers = previous.lessonId === lessonId && savedAnswers.length === answers.length &&
        savedAnswers.every((saved, index) => saved.questionId === answers[index].questionId && saved.optionId === answers[index].optionId);
      if (!sameAnswers)
        throw new ConflictException({ code: "IDEMPOTENCY_KEY_REUSED", message: "Khóa gửi lại đã được dùng cho nội dung khác" });
      return {
        attempt: this.quizAttemptSummary(previous),
        pathway: await this.studentPathway(lessonId, studentId),
      };
    }
  }
  @Roles("STUDENT")
  @Get("lessons/:lessonId/steps/:stepId/lab")
  @ApiOperation({ summary: "Get the sanitized lab/challenge workspace for an eligible student" })
  async studentLab(
    @Param("lessonId") lessonId: string,
    @Param("stepId") stepId: string,
    @Req() req: any,
  ) {
    const pathway = await this.studentPathway(lessonId, req.user.sub);
    const step = pathway.steps.find((item: any) => item.id === stepId && (item.type === "LAB" || item.type === "CHALLENGE"));
    if (!step) throw new NotFoundException("Bước thực hành không tồn tại");
    if (step.state === "LOCKED")
      throw new ForbiddenException({
        code: "STEP_LOCKED",
        message: step.lockReasonCode === "QUIZ_NOT_PASSED" ? "Hoàn thành và vượt qua bài kiểm tra để mở phòng thực hành" : "Bước thực hành chưa khả dụng",
      });
    const stepResource = step.resource as any;
    const challengeId = stepResource?.challengeId ?? (stepResource?.labId ? `${stepResource.labId}_001` : "circuit_001");
    const challenge = challengeId ? await this.db.challenge.findUnique({ where: { id: challengeId }, include: { lab: true } }) : null;
    return {
      lessonId,
      stepId,
      challengeId: challenge?.id ?? challengeId,
      labId: challenge?.labId ?? stepResource?.labId ?? "circuit",
      title: challenge?.lab?.title ?? "Thực hành mạch điện",
      instruction: challenge?.objective ?? "Tạo mạch kín an toàn cho đèn LED",
      targetObjective: (challenge?.constraints as any)?.params
        ? challengeObjective(challenge!.labId, (challenge!.constraints as any).params)
        : ({
            circuit: "Giữ dòng qua mỗi LED từ 1 đến 20 mA.",
            chemistry: "Nhúng quỳ tím vào ba lọ mất nhãn và xác định đúng axit, trung tính, bazơ.",
            eye: "Gọi đúng tên cả 8 bộ phận của mắt.",
          } as Record<string, string>)[challenge?.labId ?? stepResource?.labId ?? "circuit"] ?? null,
      config: stepResource,
    };
  }
  private quizAttemptSummary(attempt: any) {
    const answers = attempt.answers as Array<{ questionId: string; optionId: string }>;
    const questions = attempt.questionSnapshot as Array<{ id: string; answerOptionId: string }>;
    return {
      id: attempt.id,
      score: attempt.score,
      passed: attempt.passed,
      correctCount: attempt.correctCount,
      questionCount: attempt.questionCount,
      createdAt: attempt.createdAt.toISOString(),
      results: questions.map((question) => ({
        questionId: question.id,
        correct: answers.some((answer) => answer.questionId === question.id && answer.optionId === question.answerOptionId),
      })),
    };
  }
  @Roles("STUDENT") @Put("lessons/:lessonId/steps/:stepId/progress") async updateStepProgress(
    @Param("lessonId") lessonId: string,
    @Param("stepId") stepId: string,
    @Body() body: unknown,
    @Req() req: any,
  ) {
    const action = stepProgressActionSchema.parse(body);
    const studentId = req.user.sub;
    const now = new Date();
    return this.db.$transaction(async (tx) => {
      const assignment = await this.applicableLessonAssignment(lessonId, studentId, tx);
      if (!assignment)
        throw new NotFoundException({ code: "ASSIGNMENT_NOT_FOUND", message: "Không tìm thấy bài được giao" });
      const lesson = await tx.lesson.findFirst({
        where: { id: lessonId, status: { in: ["published", "archived"] } },
        include: {
          steps: {
            orderBy: { position: "asc" },
            include: { progress: { where: { studentId, assignmentId: assignment.id } } },
          },
        },
      });
      if (!lesson) throw new NotFoundException("Nội dung không còn khả dụng");
      if (lesson.status === "archived" && !(await this.lessonStarted(lessonId, studentId, tx, assignment.id)))
        throw new NotFoundException({ code: "CONTENT_ARCHIVED", message: ARCHIVED_CONTENT_MESSAGE });
      let currentPathway;
      try {
        currentPathway = buildPathwaySteps(lesson.steps as any);
      } catch {
        throw new NotFoundException("Nội dung không còn khả dụng");
      }
      const step = lesson.steps.find((item) => item.id === stepId);
      const authorizedStep = currentPathway.steps.find((item) => item.id === stepId);
      if (!step || !["IN_PROGRESS", "COMPLETED"].includes(authorizedStep?.state ?? ""))
        throw new NotFoundException("Bước học không còn khả dụng");

      const saved = step.progress[0];
      if (step.type === "READING") {
        if (action.action !== "complete")
          throw new NotFoundException("Bước học không còn khả dụng");
        await tx.stepProgress.upsert({
          where: { studentId_assignmentId_stepId: { studentId, assignmentId: assignment.id, stepId } },
          create: {
            studentId,
            stepId,
            assignmentId: assignment.id,
            status: "COMPLETED",
            progressValue: 100,
            startedAt: now,
            completedAt: now,
          },
          update: saved?.status === "COMPLETED"
            ? { startedAt: saved.startedAt ?? now }
            : {
                status: "COMPLETED",
                progressValue: 100,
                startedAt: saved?.startedAt ?? now,
                completedAt: now,
              },
        });
      } else if (step.type === "VIDEO") {
        if (action.action === "complete")
          throw new NotFoundException("Bước học không còn khả dụng");
        let evidence;
        try {
          evidence = reconcileVideoProgress(step.config, saved, action as any, now);
        } catch {
          throw new NotFoundException("Bước học không còn khả dụng");
        }
        await tx.stepProgress.upsert({
          where: { studentId_assignmentId_stepId: { studentId, assignmentId: assignment.id, stepId } },
          create: { studentId, stepId, assignmentId: assignment.id, ...evidence },
          update: evidence,
        });
      } else if (step.type === "STUDY_CARDS") {
        if (action.action !== "visit" && !(action.action === "complete" && "cardIndex" in action))
          throw new NotFoundException("Bước học không còn khả dụng");
        let evidence;
        try {
          evidence = reconcileCardProgress(step.config, saved as any, action as any, now);
        } catch (error) {
          throw new BadRequestException(error instanceof Error ? error.message : "Thẻ học không hợp lệ");
        }
        await tx.stepProgress.upsert({
          where: { studentId_assignmentId_stepId: { studentId, assignmentId: assignment.id, stepId } },
          create: { studentId, stepId, assignmentId: assignment.id, ...evidence },
          update: {
            status: evidence.status,
            progressValue: Math.max(saved?.progressValue ?? 0, evidence.progressValue),
            visitedCardIds: evidence.visitedCardIds,
            startedAt: saved?.startedAt ?? now,
            completedAt: evidence.completedAt ?? saved?.completedAt ?? null,
          },
        });
      } else {
        throw new NotFoundException("Bước học không còn khả dụng");
      }
      await projectLesson(tx, studentId, lessonId, assignment.id);
      const pathway = await this.studentPathway(lessonId, studentId, tx);
      return { step: pathway.steps.find((item) => item.id === stepId), pathway };
    }, { isolationLevel: "Serializable" });
  }
  @Roles("STUDENT") @Post("lessons/:id/complete") async complete(
    @Param("id") id: string,
  ) {
    // Official completion is derived from step evidence (A5); a bare
    // "mark complete" would create progress without a source record.
    void id;
    throw new ConflictException({
      code: "ASSIGNMENT_PATHWAY_REQUIRED",
      message: "Tiến độ chính thức chỉ được ghi nhận trong lộ trình bài được giao",
    });
  }
  @Roles("STUDENT") @Post("lessons/:id/quiz") async legacyQuiz(
    @Param("id") id: string,
    @Body() b: unknown,
  ) {
    void id; void b;
    throw new ConflictException({
      code: "ASSIGNMENT_QUIZ_REQUIRED",
      message: "Bài kiểm tra chỉ khả dụng trong lộ trình bài được giao",
    });
  }
  /** Availability of assigned content for one student (Q-B1-02, MSG-36). */
  private async contentState(a: { contentType: string; contentId: string }, studentId: string) {
    const content =
      a.contentType === "lesson"
        ? await this.db.lesson.findUnique({ where: { id: a.contentId }, include: { subject: true } })
        : await this.db.lab.findUnique({ where: { id: a.contentId }, include: { subject: true } });
    if (!content || !["published", "archived"].includes(content.status)) return { state: "UNAVAILABLE" as const, content: null };
    if (content.status === "published") return { state: "AVAILABLE" as const, content };
    const started =
      a.contentType === "lesson"
        ? await this.lessonStarted(a.contentId, studentId)
        : (await this.db.attempt.count({ where: { studentId, challenge: { labId: a.contentId } } })) > 0;
    return { state: started ? ("ARCHIVED_STARTED" as const) : ("ARCHIVED_NOT_STARTED" as const), content };
  }
  @Roles("STUDENT") @Get("assignments") async assignments(@Req() req: any) {
    const now = new Date();
    const rows = await this.db.assignment.findMany({
      where: applicableAssignmentWhere(req.user.sub),
      include: { classroom: { select: { id: true, name: true } } },
      orderBy: assignmentQueueOrder,
    });
    const items: any[] = [];
    for (const a of rows) {
      const { state } = await this.contentState(a, req.user.sub);
      if (state === "UNAVAILABLE") continue;
      items.push({
        id: a.id,
        title: a.title,
        contentId: a.contentId,
        contentType: a.contentType,
        dueDate: a.dueDate,
        createdAt: a.createdAt,
        overdue: isOverdue(a.dueDate, now),
        classroom: a.classroom,
        contentState: state,
        canOpen: state !== "ARCHIVED_NOT_STARTED",
        notice: state === "AVAILABLE" ? null : ARCHIVED_CONTENT_MESSAGE,
      });
    }
    return items;
  }
  @Roles("STUDENT") @Get("assignments/:id") async assignment(
    @Param("id") id: string,
    @Req() req: any,
  ) {
    const a = await this.applicableAssignment(id, req.user.sub);
    const { state, content } = await this.contentState(a, req.user.sub);
    if (!content) throw new NotFoundException("Nội dung không còn khả dụng");
    if (state === "ARCHIVED_NOT_STARTED")
      throw new NotFoundException({ code: "CONTENT_ARCHIVED", message: ARCHIVED_CONTENT_MESSAGE });
    return {
      id: a.id,
      title: a.title,
      contentType: a.contentType,
      dueDate: a.dueDate,
      overdue: isOverdue(a.dueDate),
      classroom: a.classroom,
      contentState: state,
      content: {
        id: content.id,
        title: content.title,
        subject: { id: content.subject.id, name: content.subject.name },
        grade: content.grade,
        topic: content.topic,
        learningObjective: content.learningObjective,
        prerequisites: "prerequisites" in content ? content.prerequisites : "",
        ...(a.contentType !== "lesson" && "content" in content
          ? { content: content.content }
          : {}),
      },
    };
  }
  @Roles("STUDENT", "TEACHER") @Post("simulate/:labId") async preview(
    @Param("labId") labId: string,
    @Body() body: any,
  ) {
    // CF-T4: the lab's allowlisted model reference decides the engine; unknown labs fail closed.
    const lab = await this.db.lab.findUnique({ where: { id: labId }, select: { simulationModelRef: true } });
    if (!lab) throw new NotFoundException({ code: "LAB_NOT_FOUND", message: "Không tìm thấy phòng thực hành" });
    try {
      return resolveModel(lab.simulationModelRef).simulate(body);
    } catch (e: any) {
      throw new BadRequestException(e.message);
    }
  }
  @Roles("STUDENT") @Post("attempts") async attempt(
    @Req() req: any,
    @Body() body: unknown,
  ) {
    this.rate("attempt:" + req.user.sub, 30);
    const b = z
      .object({
        challengeId: text,
        lessonStepId: text.optional(),
        assignmentId: text.optional(),
        idempotencyKey: z.string().uuid().optional(),
        labState: z.unknown(),
        durationMs: z.number().int().min(0).max(86400000),
      })
      .parse(body);
    const c = await this.db.challenge.findUnique({
      where: { id: b.challengeId },
      include: { lab: true },
    });
    if (!c || c.lab.status !== "published") throw new NotFoundException();

    // Idempotency fast-path
    if (b.idempotencyKey) {
      const existing = await this.db.attempt.findUnique({
        where: {
          studentId_idempotencyKey: {
            studentId: req.user.sub,
            idempotencyKey: b.idempotencyKey,
          },
        },
      });
      if (existing) {
        const samePayload =
          existing.challengeId === b.challengeId &&
          JSON.stringify(existing.labState) === JSON.stringify(b.labState);
        if (!samePayload) {
          throw new ConflictException({
            code: "IDEMPOTENCY_KEY_REUSED",
            message: "Khóa gửi lại đã được dùng cho nội dung khác",
          });
        }
        const attemptNumber = await this.db.attempt.count({
          where: {
            studentId: req.user.sub,
            challengeId: existing.challengeId,
            createdAt: { lte: existing.createdAt },
          },
        });
        let pathway: any = undefined;
        if (existing.lessonStepId) {
          const step = await this.db.lessonStep.findUnique({
            where: { id: existing.lessonStepId },
          });
          if (step) {
            pathway = await this.studentPathway(step.lessonId, req.user.sub);
          }
        }
        return {
          ...existing,
          attempt: {
            ...existing,
            attemptNumber,
          },
          pathway,
          retryGuidance: this.retryGuidance(
            c.labId,
            existing.verdict,
            existing.simulationResult,
          ),
        };
      }
    }

    // C2-T3: a base challenge is evaluated with the lab's active configuration
    // version, which the attempt pins; a teacher variant keeps its own reviewed
    // parameters. Either way the scientific model is unchanged.
    const isVariant = c.id.includes("_v-");
    const configVersion = isVariant
      ? null
      : await this.db.simulationConfigVersion.findFirst({ where: { labId: c.labId, status: "active" } });
    const params = (isVariant ? null : versionParams(configVersion, c.id)) ?? (c.constraints as any)?.params;
    const activePack = await this.db.simulationPackVersion.findFirst({ where: { labId: c.labId, status: "active" }, select: { id: true } });
    let result: any;
    let normalizedVerdict: string;
    try {
      ({ result, verdict: normalizedVerdict } = evaluate(c.labId, b.labState, params, c.lab.simulationModelRef));
    } catch (e: any) {
      throw new BadRequestException(e.message);
    }

    return this.db.$transaction(async (tx) => {
      // The step link and assignment are derived server-side; client-sent
      // assignmentId is ignored so evidence cannot be attributed elsewhere.
      const link = await this.practicalStepLink(b.lessonStepId, c, req.user.sub, tx);
      // D3: a direct attempt counts toward an applicable standalone lab assignment.
      const labAssignment = link ? null : await this.applicableLabAssignment(c.labId, req.user.sub, tx);
      // D-B1-01: an applicable standalone lab assignment opens the lab even when a
      // gated lesson embeds it; the attempt has no lessonStepId, so it never
      // completes the lesson's lab step. Every other direct submission keeps the A3 gate.
      if (!labAssignment) await this.assertPracticalGate(c.labId, req.user.sub, tx);
      const a = await tx.attempt.create({
        data: {
          studentId: req.user.sub,
          challengeId: c.id,
          assignmentId: link?.assignmentId ?? labAssignment?.id ?? null,
          lessonStepId: link?.stepId ?? null,
          simulationModelVersion: SIMULATION_ENGINE,
          configVersionId: configVersion?.id ?? null,
          packVersionId: activePack?.id ?? null,
          idempotencyKey: b.idempotencyKey ?? null,
          labState: b.labState as any,
          simulationResult: result,
          verdict: normalizedVerdict,
          durationMs: b.durationMs,
        },
      });

      const attemptCount = await tx.attempt.count({
        where: { studentId: req.user.sub, challengeId: c.id },
      });

      let pathway: any = undefined;
      if (link) {
        const isCompleted = normalizedVerdict === "passed";
        const now = new Date();
        const saved = await tx.stepProgress.findUnique({
          where: { studentId_assignmentId_stepId: { studentId: req.user.sub, assignmentId: link.assignmentId!, stepId: link.stepId } },
        });
        // High-water evidence: a later failed retry never undoes a pass.
        await tx.stepProgress.upsert({
          where: {
            studentId_assignmentId_stepId: { studentId: req.user.sub, assignmentId: link.assignmentId!, stepId: link.stepId },
          },
          create: {
            studentId: req.user.sub,
            stepId: link.stepId,
            assignmentId: link.assignmentId!,
            status: isCompleted ? "COMPLETED" : "IN_PROGRESS",
            progressValue: isCompleted ? 100 : 50,
            startedAt: now,
            completedAt: isCompleted ? now : null,
          },
          update: saved?.status === "COMPLETED"
            ? { startedAt: saved.startedAt ?? now }
            : {
                status: isCompleted ? "COMPLETED" : "IN_PROGRESS",
                progressValue: isCompleted ? 100 : 50,
                startedAt: saved?.startedAt ?? now,
                completedAt: isCompleted ? now : null,
              },
        });
        await projectLesson(tx, req.user.sub, link.lessonId, link.assignmentId);
        pathway = await this.studentPathway(link.lessonId, req.user.sub, tx);
      }
      await projectLab(tx, req.user.sub, c.labId);
      return {
        ...a,
        attempt: {
          ...a,
          attemptNumber: attemptCount,
        },
        pathway,
        retryGuidance: this.retryGuidance(c.labId, normalizedVerdict, result),
      };
      // Gate, evidence, projections and the pathway reconcile in one transaction; at
      // pooled-database round-trip latency that exceeds Prisma's 5 s default.
    }, { timeout: 20000 });
  }
  private async practicalStepLink(
    lessonStepId: string | undefined,
    challenge: { id: string; labId: string },
    studentId: string,
    db: any,
  ) {
    if (!lessonStepId) return null;
    const step = await db.lessonStep.findUnique({ where: { id: lessonStepId } });
    const config = step?.config as any;
    const matches =
      (step?.type === "LAB" && config?.labId === challenge.labId) ||
      (step?.type === "CHALLENGE" && config?.challengeId === challenge.id);
    if (!step || !matches) throw new NotFoundException("Bước thực hành không tồn tại");
    const pathway = await this.studentPathway(step.lessonId, studentId, db);
    const current = pathway.steps.find((item: any) => item.id === step.id);
    if (!current || current.state === "LOCKED")
      throw new ForbiddenException({ code: "STEP_LOCKED", message: "Bước thực hành chưa khả dụng" });
    return { stepId: step.id as string, lessonId: step.lessonId as string, assignmentId: pathway.assignment.id as string };
  }
  @Roles("STUDENT") @Get("attempts") attempts(@Req() req: any) {
    return this.db.attempt.findMany({
      where: { studentId: req.user.sub },
      include: { challenge: true, hints: true },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
  }
  @Roles("STUDENT") @Post("attempts/:id/hint") async hint(
    @Param("id") id: string,
    @Req() req: any,
  ) {
    this.rate("hint:" + req.user.sub, 8);
    // B0P-T4: provider call outside the transaction; authorization rechecked before persisting.
    return requestHint(this.db, req.user, id);
  }
  @Roles("STUDENT") @Post("saved") async save(
    @Req() req: any,
    @Body() body: unknown,
  ) {
    const b = z
      .object({ attemptId: text, note: z.string().max(1000) })
      .parse(body);
    const a = await this.db.attempt.findFirst({
      where: { id: b.attemptId, studentId: req.user.sub },
      include: { challenge: true },
    });
    if (!a) throw new NotFoundException();
    return this.db.savedExperiment.create({
      data: {
        studentId: req.user.sub,
        labId: a.challenge.labId,
        labState: a.labState!,
        simulationResult: a.simulationResult!,
        note: b.note,
      },
    });
  }
  @Roles("STUDENT") @Get("saved") saved(@Req() req: any) {
    return this.db.savedExperiment.findMany({
      where: { studentId: req.user.sub },
      orderBy: { createdAt: "desc" },
    });
  }
  @Roles("STUDENT") @Delete("saved/:id") async deleteSaved(
    @Req() req: any,
    @Param("id") id: string,
  ) {
    return this.db.savedExperiment.deleteMany({
      where: { id, studentId: req.user.sub },
    });
  }
  @Get("progress/:studentId") async progress(
    @Param("studentId") studentId: string,
    @Req() req: any,
  ) {
    await this.readableStudent(studentId, req);
    const [progress, attempts] = await Promise.all([
      this.db.progress.findMany({ where: { studentId } }),
      this.db.attempt.findMany({
        where: { studentId },
        select: {
          id: true,
          verdict: true,
          durationMs: true,
          createdAt: true,
          challengeId: true,
        },
        orderBy: { createdAt: "desc" },
        take: 100,
      }),
    ]);
    return { progress, attempts };
  }
  @Roles("STUDENT")
  @Get("me/progress")
  @ApiOperation({ summary: "Official progress for the authenticated student, derived from source evidence" })
  async myProgress(@Req() req: any) {
    const studentId = req.user.sub;
    const now = new Date();
    const applicable = await this.db.assignment.findMany({
      where: applicableAssignmentWhere(studentId),
      orderBy: assignmentQueueOrder,
    });
    const assignments = applicable.filter((item) => item.contentType === "lesson");
    const labAssignments = applicable.filter((item) => item.contentType === "lab");
    const lessonIds = [...new Set(assignments.map((item) => item.contentId))];
    // One parallel batch: each sequential round trip to the database costs the most here.
    const [lessons, stepProgress, quizEvidence, practicalEvidence, quizAttempts, practicalAttempts, passedPracticals, latestQuiz, latestPractical] = await Promise.all([
      this.db.lesson.findMany({
        where: { id: { in: lessonIds }, status: { in: ["published", "archived"] } },
        include: { subject: true, steps: { orderBy: { position: "asc" } } },
      }),
      this.db.stepProgress.findMany({ where: { studentId, step: { lessonId: { in: lessonIds } } } }),
      this.db.quizAttempt.findMany({
        where: { studentId, lessonId: { in: lessonIds } },
        select: { id: true, stepId: true, lessonId: true, assignmentId: true, score: true, passed: true, createdAt: true },
      }),
      this.db.attempt.findMany({
        where: { studentId, lessonStepId: { not: null } },
        select: { id: true, challengeId: true, lessonStepId: true, assignmentId: true, verdict: true, createdAt: true },
      }),
      this.db.quizAttempt.count({ where: { studentId } }),
      this.db.attempt.count({ where: { studentId } }),
      this.db.attempt.count({ where: { studentId, verdict: "passed" } }),
      this.db.quizAttempt.findFirst({ where: { studentId }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], select: { createdAt: true } }),
      this.db.attempt.findFirst({ where: { studentId }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], select: { createdAt: true } }),
    ]);
    const derivedByAssignment = new Map<string, ReturnType<typeof deriveLesson> | null>();
    for (const assignment of assignments) {
      const lesson = lessons.find((item) => item.id === assignment.contentId);
      if (!lesson) continue;
      const stepIds = new Set(lesson.steps.map((step) => step.id));
      const evidence = {
        stepProgress: stepProgress.filter((item) => item.assignmentId === assignment.id && stepIds.has(item.stepId)) as any,
        quizAttempts: quizEvidence.filter((item) => item.assignmentId === assignment.id && item.lessonId === lesson.id),
        attempts: practicalEvidence.filter((item) => item.assignmentId === assignment.id && stepIds.has(item.lessonStepId!)).map((item) => ({ ...item, hintLevel: 0 })),
      };
      try {
        derivedByAssignment.set(assignment.id, deriveLesson(lesson.steps as any, evidence));
      } catch {
        derivedByAssignment.set(assignment.id, null);
      }
    }
    const items = assignments.flatMap((assignment) => {
      const lesson = lessons.find((item) => item.id === assignment.contentId);
      const derived = lesson ? derivedByAssignment.get(assignment.id) : null;
      if (!lesson || !derived) return [];
      // Archived content stays visible only once the student has started it (Q-B1-02).
      if (lesson.status === "archived" && !derived.steps.some((step) => step.evidenceId || step.stepProgress)) return [];
      const quizStep = derived.steps.find((step) => step.type === "QUIZ");
      const practicalStep = derived.steps.find((step) => step.type === "LAB") ?? derived.steps.find((step) => step.type === "CHALLENGE");
      return [{
        kind: "LESSON" as const,
        assignmentId: assignment.id,
        lessonId: lesson.id,
        labId: null,
        title: assignment.title,
        lessonTitle: lesson.title,
        subject: { id: lesson.subject.id, name: lesson.subject.name },
        chapter: lesson.chapter,
        contentArchived: lesson.status === "archived",
        dueDate: assignment.dueDate?.toISOString() ?? null,
        overdue: isOverdue(assignment.dueDate, now),
        completed: derived.completed,
        completedRequired: derived.completedRequired,
        totalRequired: derived.totalRequired,
        percent: derived.percent,
        nextStepId: derived.nextStepId,
        quiz: quizStep?.quiz ?? null,
        practical: practicalStep?.practical ?? null,
        updatedAt: derived.updatedAt,
        steps: derived.steps,
      }];
    });
    // D3: a standalone lab assignment completes on a passed attempt carrying its assignmentId.
    const [labs, labAttempts] = labAssignments.length
      ? await Promise.all([
          this.db.lab.findMany({
            where: { id: { in: [...new Set(labAssignments.map((item) => item.contentId))] }, status: { in: ["published", "archived"] } },
            include: { subject: true },
          }),
          this.db.attempt.findMany({
            where: { studentId, assignmentId: { in: labAssignments.map((item) => item.id) } },
            select: { id: true, challengeId: true, lessonStepId: true, assignmentId: true, verdict: true, createdAt: true },
          }),
        ])
      : [[], []];
    const labItems = labAssignments.flatMap((assignment) => {
      const lab = labs.find((item) => item.id === assignment.contentId);
      if (!lab) return [];
      const attempts = labAttempts.filter((item) => item.assignmentId === assignment.id);
      if (lab.status === "archived" && !attempts.length) return [];
      const practical = practicalSummary(attempts.map((item) => ({ ...item, hintLevel: 0 })));
      const completed = Boolean(practical?.passedAt);
      return [{
        kind: "LAB" as const,
        assignmentId: assignment.id,
        lessonId: null,
        labId: lab.id,
        title: assignment.title,
        lessonTitle: lab.title,
        subject: { id: lab.subject.id, name: lab.subject.name },
        chapter: lab.topic,
        contentArchived: lab.status === "archived",
        dueDate: assignment.dueDate?.toISOString() ?? null,
        overdue: isOverdue(assignment.dueDate, now),
        completed,
        completedRequired: completed ? 1 : 0,
        totalRequired: 1,
        percent: completed ? 100 : 0,
        nextStepId: null,
        quiz: null,
        practical,
        updatedAt: practical?.latest.createdAt ?? null,
        steps: [],
      }];
    });
    items.push(...(labItems as any[]));
    const timestamps = [
      ...items.map((item) => item.updatedAt),
      latestQuiz?.createdAt.toISOString(),
      latestPractical?.createdAt.toISOString(),
    ].filter((value): value is string => Boolean(value)).sort();
    return {
      assignments: items,
      summary: {
        activeAssignments: items.length,
        completedAssignments: items.filter((item) => item.completed).length,
        remainingRequiredSteps: items.reduce((sum, item) => sum + item.totalRequired - item.completedRequired, 0),
        quizAttempts,
        practicalAttempts,
        passedPracticals,
        updatedAt: timestamps.at(-1) ?? null,
      },
      generatedAt: now.toISOString(),
    };
  }
  @Roles("STUDENT")
  @Get("me/activity")
  @ApiOperation({ summary: "Newest-first page of the authenticated student's quiz and practical attempts" })
  async myActivity(@Req() req: any, @Query() query: unknown) {
    const studentId = req.user.sub;
    const q = z
      .object({
        cursor: z.string().max(200).optional(),
        limit: z.coerce.number().int().min(1).max(50).default(20),
        stepId: z.string().min(1).max(200).optional(),
        kind: z.enum(["QUIZ", "PRACTICAL"]).optional(),
      })
      .strict()
      .parse(query);
    let cursor;
    try {
      cursor = decodeCursor(q.cursor);
    } catch {
      throw new BadRequestException({ code: "INVALID_CURSOR", message: "Con trỏ phân trang không hợp lệ" });
    }
    const before = cursor
      ? { OR: [{ createdAt: { lt: new Date(cursor.t) } }, { createdAt: new Date(cursor.t), id: { lt: cursor.id } }] }
      : {};
    const orderBy = [{ createdAt: "desc" as const }, { id: "desc" as const }];
    const [quiz, practical] = await Promise.all([
      q.kind === "PRACTICAL"
        ? []
        : this.db.quizAttempt.findMany({
            where: { studentId, ...(q.stepId ? { stepId: q.stepId } : {}), ...before },
            orderBy,
            take: q.limit + 1,
            select: { id: true, lessonId: true, stepId: true, assignmentId: true, score: true, passed: true, createdAt: true },
          }),
      q.kind === "QUIZ"
        ? []
        : this.db.attempt.findMany({
            where: { studentId, ...(q.stepId ? { lessonStepId: q.stepId } : {}), ...before },
            orderBy,
            take: q.limit + 1,
            select: {
              id: true,
              challengeId: true,
              lessonStepId: true,
              assignmentId: true,
              verdict: true,
              createdAt: true,
              challenge: { select: { lab: { select: { id: true, title: true } } } },
            },
          }),
    ]);
    const page = mergeActivityPage<any>(
      [quiz.map((item) => ({ ...item, kind: "QUIZ" })), practical.map((item) => ({ ...item, kind: "PRACTICAL" }))],
      q.limit,
    );
    const stepIds = [...new Set(page.items.map((item: any) => item.stepId ?? item.lessonStepId).filter(Boolean))] as string[];
    const quizLessonIds = [...new Set(page.items.map((item: any) => item.lessonId).filter(Boolean))] as string[];
    const [steps, quizLessons] = await Promise.all([
      this.db.lessonStep.findMany({
        where: { id: { in: stepIds } },
        select: { id: true, lessonId: true, type: true, lesson: { select: { id: true, title: true, status: true } } },
      }),
      this.db.lesson.findMany({ where: { id: { in: quizLessonIds } }, select: { id: true, title: true, status: true } }),
    ]);
    const lessons = [...quizLessons, ...steps.map((step) => step.lesson)];
    return {
      items: page.items.map((item: any) => {
        if (item.kind === "QUIZ") {
          const step = steps.find((entry) => entry.id === item.stepId);
          const lesson = lessons.find((entry) => entry.id === item.lessonId);
          return {
            id: item.id,
            kind: "QUIZ" as const,
            lessonId: item.lessonId,
            stepId: item.stepId,
            stepType: step?.type ?? "QUIZ",
            assignmentId: item.assignmentId,
            title: lesson?.title ?? "Bài học không còn khả dụng",
            occurredAt: item.createdAt.toISOString(),
            score: item.score,
            passed: item.passed,
            verdict: null,
            sourceAvailable: Boolean(step && lesson?.status === "published"),
            legacy: !item.assignmentId,
          };
        }
        const step = steps.find((entry) => entry.id === item.lessonStepId);
        const lesson = step ? lessons.find((entry) => entry.id === step.lessonId) : undefined;
        const verdict = normalizeVerdict(item.verdict);
        return {
          id: item.id,
          kind: "PRACTICAL" as const,
          lessonId: step?.lessonId ?? null,
          stepId: item.lessonStepId,
          stepType: step?.type ?? null,
          assignmentId: item.assignmentId,
          challengeId: item.challengeId,
          title: lesson?.title ?? item.challenge.lab.title,
          labTitle: item.challenge.lab.title,
          occurredAt: item.createdAt.toISOString(),
          score: null,
          passed: verdict === "passed",
          verdict,
          sourceAvailable: Boolean(step && lesson?.status === "published"),
          legacy: !item.lessonStepId || !step || verdict !== item.verdict,
        };
      }),
      nextCursor: page.nextCursor,
    };
  }
  /** Unknown and foreign IDs share one response; probing another student's record is logged without exposing it. */
  private async evidenceNotFound(kind: "quiz_attempt" | "attempt", id: string, actorId: string): Promise<never> {
    const exists =
      kind === "quiz_attempt"
        ? await this.db.quizAttempt.count({ where: { id } })
        : await this.db.attempt.count({ where: { id } });
    if (exists)
      console.warn(JSON.stringify({ event: "evidence_access_denied", resource: kind, actorId, at: new Date().toISOString() }));
    throw new NotFoundException({ code: "EVIDENCE_NOT_FOUND", message: "Không tìm thấy bản ghi" });
  }
  @Roles("STUDENT")
  @Get("me/quiz-attempts/:id")
  @ApiOperation({ summary: "One quiz attempt of the authenticated student" })
  async myQuizAttempt(@Param("id") id: string, @Req() req: any) {
    const studentId = req.user.sub;
    const attempt = await this.db.quizAttempt.findFirst({ where: { id, studentId } });
    if (!attempt) return this.evidenceNotFound("quiz_attempt", id, studentId);
    const [siblings, lesson, step] = await Promise.all([
      this.db.quizAttempt.findMany({
        where: { studentId, stepId: attempt.stepId },
        select: { id: true, stepId: true, lessonId: true, assignmentId: true, score: true, passed: true, createdAt: true },
      }),
      this.db.lesson.findUnique({ where: { id: attempt.lessonId }, select: { id: true, title: true, status: true } }),
      this.db.lessonStep.findUnique({ where: { id: attempt.stepId }, select: { id: true } }),
    ]);
    const summary = quizSummary(siblings)!;
    const ordered = [...siblings].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || (a.id < b.id ? -1 : 1));
    const snapshot = attempt.questionSnapshot as any[];
    const answers = attempt.answers as Array<{ questionId: string; optionId: string }>;
    return {
      id: attempt.id,
      kind: "QUIZ" as const,
      lessonId: attempt.lessonId,
      lessonTitle: lesson?.title ?? "Bài học không còn khả dụng",
      stepId: attempt.stepId,
      assignmentId: attempt.assignmentId,
      sourceAvailable: Boolean(step && lesson?.status === "published"),
      createdAt: attempt.createdAt.toISOString(),
      attemptNumber: ordered.findIndex((item) => item.id === attempt.id) + 1,
      totalAttempts: ordered.length,
      latest: summary.latest.attemptId === attempt.id,
      best: summary.best.attemptId === attempt.id,
      score: attempt.score,
      passed: attempt.passed,
      passThreshold: 50,
      correctCount: attempt.correctCount,
      questionCount: attempt.questionCount,
      // Allowed feedback only: the student's own choice and correctness, never the answer key.
      results: snapshot.map((question) => {
        const answer = answers.find((item) => item.questionId === question.id);
        const selected = question.options.find((option: any) => option.id === answer?.optionId);
        return {
          questionId: question.id,
          prompt: question.prompt,
          selectedOptionText: selected?.text ?? "",
          correct: answer?.optionId === question.answerOptionId,
        };
      }),
    };
  }
  @Roles("STUDENT")
  @Get("me/attempts/:id")
  @ApiOperation({ summary: "One practical attempt of the authenticated student" })
  async myAttempt(@Param("id") id: string, @Req() req: any) {
    const studentId = req.user.sub;
    const attempt = await this.db.attempt.findFirst({
      where: { id, studentId },
      include: { challenge: { include: { lab: true } }, hints: { select: { level: true, createdAt: true }, orderBy: { level: "asc" } } },
    });
    if (!attempt) return this.evidenceNotFound("attempt", id, studentId);
    const step = attempt.lessonStepId
      ? await this.db.lessonStep.findUnique({ where: { id: attempt.lessonStepId }, select: { id: true, type: true, lessonId: true } })
      : null;
    const lesson = step ? await this.db.lesson.findUnique({ where: { id: step.lessonId }, select: { id: true, title: true, status: true } }) : null;
    const attemptNumber = await this.db.attempt.count({
      where: {
        studentId,
        challengeId: attempt.challengeId,
        OR: [{ createdAt: { lt: attempt.createdAt } }, { createdAt: attempt.createdAt, id: { lte: attempt.id } }],
      },
    });
    const verdict = normalizeVerdict(attempt.verdict);
    const result = attempt.simulationResult as any;
    return {
      id: attempt.id,
      kind: "PRACTICAL" as const,
      challengeId: attempt.challengeId,
      challengeObjective: attempt.challenge.objective,
      labId: attempt.challenge.labId,
      labTitle: attempt.challenge.lab.title,
      lessonId: step?.lessonId ?? null,
      lessonTitle: lesson?.title ?? null,
      stepId: attempt.lessonStepId,
      stepType: step?.type ?? null,
      assignmentId: attempt.assignmentId,
      sourceAvailable: Boolean(step && lesson?.status === "published"),
      legacy: !attempt.lessonStepId || !step || verdict !== attempt.verdict,
      createdAt: attempt.createdAt.toISOString(),
      attemptNumber,
      verdict,
      durationMs: attempt.durationMs,
      simulationModelVersion: attempt.simulationModelVersion,
      // Server-recomputed outcome context; the verdict is the official result.
      outcome: {
        status: typeof result?.status === "string" ? result.status : null,
        currentMa: typeof result?.currentMa === "number" ? result.currentMa : null,
        ledState: typeof result?.ledState === "string" ? result.ledState : null,
      },
      retryGuidance: this.retryGuidance(attempt.challenge.labId, verdict ?? "needs_practice", result),
      hintLevels: attempt.hints.map((hint) => hint.level),
    };
  }
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
    await this.readableStudent(studentId, req);
    const [progress, quizAttempts, practicalAttempts] = await Promise.all([
      this.db.progress.findMany({ where: { studentId }, select: { contentId: true, score: true, status: true, attemptsCount: true, updatedAt: true } }),
      this.db.quizAttempt.findMany({ where: { studentId }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], select: { id: true, lessonId: true, stepId: true, score: true, passed: true, createdAt: true } }),
      this.db.attempt.findMany({ where: { studentId }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], select: { id: true, challengeId: true, lessonStepId: true, verdict: true, durationMs: true, createdAt: true } }),
    ]);
    return { progress, summary: { quizAttempts: quizAttempts.length, practicalAttempts: practicalAttempts.length, passedPracticals: practicalAttempts.filter((a) => a.verdict === "passed").length, lastActivityAt: [quizAttempts[0]?.createdAt, practicalAttempts[0]?.createdAt].filter(Boolean).sort().at(-1) ?? null } };
  }
  @Roles("PARENT") @Get("children/:studentId/activity") async parentActivity(@Req() req: any, @Param("studentId") studentId: string, @Query() query: unknown) {
    await this.readableStudent(studentId, req);
    const q = z.object({ limit: z.coerce.number().int().min(1).max(50).default(20) }).parse(query);
    const [quiz, practical] = await Promise.all([
      this.db.quizAttempt.findMany({ where: { studentId }, orderBy: { createdAt: "desc" }, take: q.limit, select: { id: true, lessonId: true, stepId: true, score: true, passed: true, createdAt: true } }),
      this.db.attempt.findMany({ where: { studentId }, orderBy: { createdAt: "desc" }, take: q.limit, select: { id: true, challengeId: true, lessonStepId: true, verdict: true, durationMs: true, createdAt: true } }),
    ]);
    return [...quiz.map((a) => ({ kind: "QUIZ", ...a })), ...practical.map((a) => ({ kind: "PRACTICAL", ...a }))].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()).slice(0, q.limit);
  }
  @Roles("TEACHER") @Get("classes/:classId/assignments/:assignmentId/progress") async assignmentProgressBoard(
    @Param("classId") classId: string,
    @Param("assignmentId") assignmentId: string,
    @Req() req: any,
  ) {
    await ownedClass(this.db, classId, req.user);
    const assignment = await this.db.assignment.findFirst({
      where: { id: assignmentId, classId, status: { in: ["ACTIVE", "ARCHIVED"] } },
      include: { targets: { where: { student: { enrollments: { some: { classId, status: "approved" } } } }, include: { student: { select: { id: true, fullName: true, username: true } } } } },
    });
    if (!assignment) throw new NotFoundException({ code: "ASSIGNMENT_NOT_FOUND", message: "Không tìm thấy bài giao" });
    if (assignment.contentType === "lesson") {
      const lesson = await this.db.lesson.findUnique({ where: { id: assignment.contentId }, include: { steps: { orderBy: { position: "asc" } } } });
      if (!lesson) throw new NotFoundException({ code: "ASSIGNMENT_NOT_FOUND", message: "Không tìm thấy nội dung" });
      const stepIds = lesson.steps.map((step) => step.id);
      const studentIds = assignment.targets.map((target) => target.studentId);
      const [progress, quizzes, attempts] = await Promise.all([
        this.db.stepProgress.findMany({ where: { assignmentId, studentId: { in: studentIds }, stepId: { in: stepIds } } }),
        this.db.quizAttempt.findMany({ where: { assignmentId, studentId: { in: studentIds }, stepId: { in: stepIds } }, select: { id: true, studentId: true, stepId: true, score: true, passed: true, createdAt: true } }),
        this.db.attempt.findMany({ where: { assignmentId, studentId: { in: studentIds }, lessonStepId: { in: stepIds } }, select: { id: true, studentId: true, lessonStepId: true, verdict: true, createdAt: true } }),
      ]);
      return assignment.targets.map(({ student }) => {
        const evidence = {
          stepProgress: progress.filter((row) => row.studentId === student.id),
          quizAttempts: quizzes.filter((row) => row.studentId === student.id),
          attempts: attempts.filter((row) => row.studentId === student.id).map((row) => ({ ...row, challengeId: "", assignmentId, hintLevel: 0 })),
        };
        const derived = deriveLesson(lesson.steps as any, evidence as any);
        return { student, completed: derived.completed, completedRequired: derived.completedRequired, totalRequired: derived.totalRequired, percent: derived.percent, steps: derived.steps };
      });
    }
    const studentIds = assignment.targets.map((target) => target.studentId);
    const attempts = await this.db.attempt.findMany({ where: { assignmentId, studentId: { in: studentIds } }, select: { id: true, studentId: true, verdict: true, createdAt: true } });
    return assignment.targets.map(({ student }) => {
      const rows = attempts.filter((attempt) => attempt.studentId === student.id);
      return { student, attempts: rows.length, latestVerdict: rows.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0]?.verdict ?? null, passed: rows.some((attempt) => attempt.verdict === "passed") };
    });
  }
  @Roles("TEACHER") @Get("classes/:id/analytics") async analytics(
    @Param("id") id: string,
    @Req() req: any,
  ) {
    await ownedClass(this.db, id, req.user);
    const students = await this.db.enrollment.findMany({
      where: { classId: id, status: "approved" },
      include: {
        student: {
          include: {
            progress: true,
            attempts: {
              include: { hints: true },
              orderBy: { createdAt: "desc" },
              take: 100,
            },
          },
        },
      },
    });
    return students.map(({ student: s }) => ({
      id: s.id,
      fullName: s.fullName,
      progress: s.progress,
      attempts: s.attempts,
      misconceptions: misconceptions(
        s.attempts.filter((a) => a.challengeId === "circuit_001"),
      ),
    }));
  }
}
