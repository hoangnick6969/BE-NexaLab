import {
  Inject,
  Body,
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Req,
  Res,
  BadRequestException,
  ForbiddenException,
  UnauthorizedException,
  NotFoundException,
  HttpException,
} from "@nestjs/common";
import { ApiTags, ApiBearerAuth, ApiOperation } from "@nestjs/swagger";
import { z } from "zod";
import * as argon from "argon2";
import { createTransport } from "nodemailer";
import { randomBytes } from "node:crypto";
import { Db } from "./db";
import { Public, Roles, publicUser, access, token, hashToken } from "./auth";
import { simulate } from "../packages/sim";
import { buildContext, misconceptions } from "./tutor";
import { explain } from "./llm";
import { buildPathwaySteps, materializeLegacySteps, validateLessonSteps } from "./pathway";
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
            (u) => /^https?:\/\//.test(u) || /^asset:[0-9a-f-]{36}$/.test(u),
          ),
        title: text,
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
});
function publishedSteps(lesson: z.infer<typeof lessonSchema>) {
  if (lesson.status !== "published") return [];
  try {
    return materializeLegacySteps(lesson);
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
    const candidates = await db.assignment.findMany({
      where: {
        contentId: lessonId,
        contentType: "lesson",
        status: "ACTIVE",
        classroom: { enrollments: { some: { studentId, approved: true } } },
      },
      orderBy: [{ dueDate: "asc" }, { createdAt: "asc" }, { id: "asc" }],
    });
    return candidates.find((item: any) => {
      const targets = item.studentIds as string[];
      return !targets.length || targets.includes(studentId);
    });
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
  private async classOwner(id: string, req: any) {
    const c = await this.db.classroom.findUnique({ where: { id } });
    if (!c) throw new NotFoundException("Không tìm thấy lớp");
    if (c.teacherId !== req.user.sub)
      throw new ForbiddenException("Không phải lớp của bạn");
    return c;
  }
  private async applicableAssignment(id: string, studentId: string) {
    const assignment = await this.db.assignment.findFirst({
      where: {
        id,
        status: "ACTIVE",
        classroom: {
          enrollments: { some: { studentId, approved: true } },
        },
      },
      include: { classroom: { select: { id: true, name: true, grade: true } } },
    });
    if (!assignment) throw new NotFoundException("Không tìm thấy bài được giao");
    const targets = assignment.studentIds as string[];
    if (targets.length && !targets.includes(studentId))
      throw new NotFoundException("Không tìm thấy bài được giao");
    return assignment;
  }
  private async validatePublishedResources(
    lesson: z.infer<typeof lessonSchema>,
    actor: { sub: string; role: string },
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
    const assetIds = lesson.materials
      .map((item) => item.url.match(/^asset:([0-9a-f-]{36})$/)?.[1])
      .filter((value): value is string => Boolean(value));
    if (assetIds.length) {
      const assets = await this.db.assetFile.findMany({
        where: { id: { in: assetIds } },
        select: { id: true, ownerId: true },
      });
      if (
        assets.length !== new Set(assetIds).size ||
        (actor.role !== "ADMIN" && assets.some((asset) => asset.ownerId !== actor.sub))
      )
        throw new BadRequestException({
          code: "INVALID_LESSON_PATHWAY",
          message: "Tài nguyên bài học không tồn tại hoặc không thuộc quyền sử dụng",
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
      }))
    )
      return;
    if (
      req.user.role === "TEACHER" &&
      (await this.db.enrollment.findFirst({
        where: {
          studentId: id,
          approved: true,
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
    const u = await this.db.user.findUnique({ where: { email: b.email } });
    if (u && u.role !== "STUDENT" && u.status === "active") {
      const temporaryPassword = this.temporaryPassword();
      const expiresAt = new Date(Date.now() + 86400000);
      await createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT ?? 1025),
        secure: false,
        ...(process.env.SMTP_USER
          ? {
              auth: {
                user: process.env.SMTP_USER,
                pass: process.env.SMTP_PASSWORD,
              },
            }
          : {}),
      }).sendMail({
        from: process.env.SMTP_FROM,
        to: u.email!,
        subject: "Mật khẩu tạm thời NexaLab",
        text: `Mật khẩu tạm thời của bạn là: ${temporaryPassword}\nMật khẩu có hiệu lực đến ${expiresAt.toLocaleString("vi-VN")} và sẽ buộc đổi sau khi đăng nhập.`,
      });
      await this.db.$transaction([
        this.db.user.update({
          where: { id: u.id },
          data: {
            passwordHash: await argon.hash(temporaryPassword),
            mustChangePassword: true,
            temporaryPasswordExpiresAt: expiresAt,
          },
        }),
        this.db.session.deleteMany({ where: { userId: u.id } }),
      ]);
    }
    return { message: "Nếu email tồn tại, hướng dẫn đã được gửi." };
  }
  @Public() @Post("auth/reset") async reset(
    @Body() body: unknown,
    @Req() req: any,
  ) {
    this.rate("reset:" + req.ip, 5);
    const b = z.object({ token: z.string(), password }).parse(body);
    const s = await this.db.session.findUnique({
      where: { tokenHash: hashToken(b.token) },
    });
    if (!s || s.kind !== "reset" || s.expiresAt < new Date())
      throw new BadRequestException("Mã không hợp lệ hoặc hết hạn");
    await this.db.$transaction(async (tx) => {
      const used = await tx.session.deleteMany({ where: { id: s.id } });
      if (!used.count) throw new BadRequestException("Mã đã sử dụng");
      await tx.user.update({
        where: { id: s.userId },
        data: {
          passwordHash: await argon.hash(b.password),
          mustChangePassword: false,
          temporaryPasswordExpiresAt: null,
        },
      });
      await tx.session.deleteMany({ where: { userId: s.userId } });
    });
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
  @Roles("ADMIN") @Post("subjects") subjectCreate(@Body() b: unknown) {
    const data = z.object({ id: text, name: text }).parse(b);
    return this.db.subject.upsert({
      where: { id: data.id },
      create: data,
      update: { name: data.name },
    });
  }
  @Roles("ADMIN") @Get("admin/labs") allLabs() {
    return this.db.lab.findMany({ include: { challenges: true } });
  }
  @Roles("ADMIN") @Put("subjects/:id") updateSubject(
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    return this.db.subject.update({
      where: { id },
      data: z.object({ name: text }).parse(body),
    });
  }
  @Roles("ADMIN") @Delete("subjects/:id") async deleteSubject(
    @Param("id") id: string,
  ) {
    if (
      (await this.db.lesson.count({ where: { subjectId: id } })) ||
      (await this.db.lab.count({ where: { subjectId: id } }))
    )
      throw new BadRequestException(
        "Môn học còn bài học hoặc lab; không thể xóa",
      );
    return this.db.subject.delete({ where: { id } });
  }
  @Roles("ADMIN") @Delete("users/:id") async deleteUser(
    @Param("id") id: string,
    @Req() req: any,
  ) {
    if (id === req.user.sub)
      throw new BadRequestException("Không thể xóa tài khoản đang đăng nhập");
    if (
      (await this.db.classroom.count({ where: { teacherId: id } })) ||
      (await this.db.lesson.count({ where: { authorId: id } }))
    )
      throw new BadRequestException(
        "Người dùng đang sở hữu lớp hoặc bài học; cần xử lý các dữ liệu này trước",
      );
    return this.db.user.delete({ where: { id }, select: { id: true } });
  }
  @Get("labs") labs() {
    return this.db.lab.findMany({
      where: { status: "published" },
      include: { challenges: true },
    });
  }
  @Roles("ADMIN") @Put("labs/:id") labUpdate(
    @Param("id") id: string,
    @Body() b: unknown,
  ) {
    return this.db.lab.update({
      where: { id },
      data: z
        .object({
          title: text,
          topic: text,
          learningObjective: text,
          status: z.enum(["draft", "published", "archived"]),
          assets: z
            .array(
              z.object({
                name: text,
                url: z
                  .string()
                  .refine(
                    (u) =>
                      /^https?:\/\//.test(u) || /^asset:[0-9a-f-]{36}$/.test(u),
                  ),
                license: text,
              }),
            )
            .optional(),
        })
        .parse(b),
    });
  }
  @Get("lessons") async lessons(@Req() req: any) {
    let assignedLessonIds: string[] | undefined;
    if (req.user.role === "STUDENT") {
      const assignments = await this.db.assignment.findMany({
        where: {
          contentType: "lesson",
          status: "ACTIVE",
          classroom: { enrollments: { some: { studentId: req.user.sub, approved: true } } },
        },
        select: { contentId: true, studentIds: true },
      });
      assignedLessonIds = assignments
        .filter((assignment) => {
          const targets = assignment.studentIds as string[];
          return !targets.length || targets.includes(req.user.sub);
        })
        .map((assignment) => assignment.contentId);
    }
    const list = await this.db.lesson.findMany({
      where:
        req.user.role === "ADMIN"
          ? {}
          : req.user.role === "TEACHER"
            ? { OR: [{ status: "published" }, { authorId: req.user.sub }] }
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
  @Roles("TEACHER", "ADMIN") @Post("lessons") async createLesson(
    @Body() b: unknown,
    @Req() req: any,
  ) {
    const data = lessonSchema.parse(b);
    const steps = publishedSteps(data);
    await this.validatePublishedResources(data, req.user);
    return this.db.$transaction(async (tx) => {
      const lesson = await tx.lesson.create({
        data: { ...data, authorId: req.user.sub },
      });
      if (steps.length)
        await tx.lessonStep.createMany({
          data: steps.map((step) => ({
            ...step,
            id: `step-${lesson.id}-${step.type.toLowerCase().replace("_", "-")}`,
            lessonId: lesson.id,
            config: step.config as any,
          })),
        });
      return lesson;
    });
  }
  @Roles("TEACHER", "ADMIN") @Put("lessons/:id") async updateLesson(
    @Param("id") id: string,
    @Body() b: unknown,
    @Req() req: any,
  ) {
    const l = await this.db.lesson.findUniqueOrThrow({ where: { id } });
    if (l.authorId !== req.user.sub && req.user.role !== "ADMIN")
      throw new ForbiddenException();
    const data = lessonSchema.parse(b);
    const steps = publishedSteps(data);
    await this.validatePublishedResources(data, req.user);
    return this.db.$transaction(async (tx) => {
      const lesson = await tx.lesson.update({ where: { id }, data });
      const stepRows = steps.map((step) => ({
        ...step,
        id: `step-${id}-${step.type.toLowerCase().replace("_", "-")}`,
        lessonId: id,
        config: step.config as any,
      }));
      if (stepRows.length) {
        await tx.lessonStep.deleteMany({
          where: { lessonId: id, id: { notIn: stepRows.map((step) => step.id) } },
        });
        for (const step of stepRows)
          await tx.lessonStep.upsert({
            where: { id: step.id },
            create: step,
            update: {
              type: step.type,
              position: step.position,
              required: step.required,
              config: step.config,
            },
          });
      }
      return lesson;
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
    if (!assignment) throw new NotFoundException("Không tìm thấy bài được giao");
    const lesson = await db.lesson.findFirst({
      where: { id, status: "published" },
      include: {
        subject: true,
        steps: {
          orderBy: { position: "asc" },
          include: { progress: { where: { studentId } } },
        },
      },
    });
    if (!lesson) throw new NotFoundException("Nội dung không còn khả dụng");
    let pathway;
    try {
      validateLessonSteps(lesson.steps as any);
      pathway = buildPathwaySteps(lesson.steps as any);
    } catch {
      throw new NotFoundException("Nội dung không còn khả dụng");
    }
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
      assignment: {
        id: assignment.id,
        dueDate: assignment.dueDate,
        overdue: assignment.dueDate < new Date(),
      },
      ...pathway,
      updatedAt: new Date().toISOString(),
    };
  }
  @Roles("STUDENT") @Put("lessons/:lessonId/steps/:stepId/progress") async completeReading(
    @Param("lessonId") lessonId: string,
    @Param("stepId") stepId: string,
    @Body() body: unknown,
    @Req() req: any,
  ) {
    z.object({ action: z.literal("complete") }).strict().parse(body);
    const studentId = req.user.sub;
    const now = new Date();
    return this.db.$transaction(async (tx) => {
      if (!(await this.applicableLessonAssignment(lessonId, studentId, tx)))
        throw new NotFoundException("Không tìm thấy bài được giao");
      const lesson = await tx.lesson.findFirst({
        where: { id: lessonId, status: "published" },
        include: {
          steps: {
            orderBy: { position: "asc" },
            include: { progress: { where: { studentId } } },
          },
        },
      });
      if (!lesson) throw new NotFoundException("Nội dung không còn khả dụng");
      let currentPathway;
      try {
        currentPathway = buildPathwaySteps(lesson.steps as any);
      } catch {
        throw new NotFoundException("Nội dung không còn khả dụng");
      }
      const step = lesson.steps.find((item) => item.id === stepId);
      const authorizedStep = currentPathway.steps.find((item) => item.id === stepId);
      if (
        !step ||
        step.type !== "READING" ||
        !["IN_PROGRESS", "COMPLETED"].includes(authorizedStep?.state ?? "")
      )
        throw new NotFoundException("Bước đọc không còn khả dụng");

      await tx.stepProgress.createMany({
        data: [{ studentId, stepId, status: "COMPLETED", progressValue: 100, startedAt: now, completedAt: now }],
        skipDuplicates: true,
      });
      await tx.stepProgress.updateMany({
        where: { studentId, stepId, status: { not: "COMPLETED" } },
        data: { status: "COMPLETED", progressValue: 100, completedAt: now },
      });
      await tx.stepProgress.updateMany({
        where: { studentId, stepId, startedAt: null },
        data: { startedAt: now },
      });
      await tx.progress.createMany({
        data: [{ studentId, contentId: lessonId, status: "in_progress", score: 0 }],
        skipDuplicates: true,
      });
      await tx.progress.updateMany({
        where: { studentId, contentId: lessonId, status: { not: "completed" } },
        data: { status: "in_progress" },
      });
      const pathway = await this.studentPathway(lessonId, studentId, tx);
      return { step: pathway.steps.find((item) => item.id === stepId), pathway };
    }, { isolationLevel: "Serializable" });
  }
  @Roles("STUDENT") @Post("lessons/:id/complete") async complete(
    @Param("id") id: string,
    @Req() req: any,
  ) {
    const l = await this.db.lesson.findFirst({
      where: { id, status: "published" },
    });
    if (!l) throw new NotFoundException();
    if ((l.questions as any[]).length)
      throw new BadRequestException("Cần làm quiz để hoàn thành bài");
    return this.db.progress.upsert({
      where: {
        studentId_contentId: { studentId: req.user.sub, contentId: id },
      },
      create: {
        studentId: req.user.sub,
        contentId: id,
        status: "completed",
        score: 100,
      },
      update: { status: "completed", score: 100 },
    });
  }
  @Roles("STUDENT") @Post("lessons/:id/quiz") async quiz(
    @Param("id") id: string,
    @Body() b: unknown,
    @Req() req: any,
  ) {
    const { answers } = z
      .object({ answers: z.array(z.number().int().min(0).max(5)).max(30) })
      .parse(b);
    const l = await this.db.lesson.findFirst({
      where: { id, status: "published" },
    });
    if (!l) throw new NotFoundException();
    const qs = l.questions as any[];
    if (!qs.length || answers.length !== qs.length)
      throw new BadRequestException("Cần trả lời đủ câu hỏi");
    const score =
      (qs.filter((q, i) => q.answer === answers[i]).length / qs.length) * 100;
    await this.db.progress.upsert({
      where: {
        studentId_contentId: { studentId: req.user.sub, contentId: id },
      },
      create: {
        studentId: req.user.sub,
        contentId: id,
        status: score >= 70 ? "completed" : "in_progress",
        score,
        attemptsCount: 1,
      },
      update: {
        score,
        status: score >= 70 ? "completed" : "in_progress",
        attemptsCount: { increment: 1 },
      },
    });
    return { score };
  }
  @Roles("STUDENT", "TEACHER", "ADMIN") @Get("classes") async classes(
    @Req() req: any,
  ) {
    const rows = await this.db.classroom.findMany({
      where:
        req.user.role === "TEACHER"
          ? { teacherId: req.user.sub }
          : req.user.role === "STUDENT"
            ? { enrollments: { some: { studentId: req.user.sub } } }
            : {},
      include: {
        _count: { select: { enrollments: true } },
        assignments: true,
        enrollments: {
          where: { studentId: req.user.sub },
          select: { approved: true },
        },
      },
    });
    return rows.map((c) =>
      req.user.role === "STUDENT"
        ? {
            ...c,
            joinCode: undefined,
            assignments: c.enrollments[0]?.approved
              ? c.assignments.filter(
                  (a) =>
                    !(a.studentIds as string[]).length ||
                    (a.studentIds as string[]).includes(req.user.sub),
                )
              : [],
          }
        : c,
    );
  }
  @Roles("TEACHER") @Post("classes") createClass(
    @Req() req: any,
    @Body() body: unknown,
  ) {
    const b = z
      .object({ name: text, grade: z.number().int().min(6).max(9) })
      .parse(body);
    return this.db.classroom.create({
      data: {
        ...b,
        teacherId: req.user.sub,
        joinCode: randomBytes(5).toString("hex").toUpperCase(),
      },
    });
  }
  @Roles("STUDENT") @Post("classes/join") async join(
    @Req() req: any,
    @Body() body: unknown,
  ) {
    const { code } = z.object({ code: text }).parse(body);
    const c = await this.db.classroom.findUnique({
      where: { joinCode: code.toUpperCase() },
    });
    if (!c) throw new NotFoundException("Mã lớp không tồn tại");
    return this.db.enrollment.upsert({
      where: { classId_studentId: { classId: c.id, studentId: req.user.sub } },
      create: { classId: c.id, studentId: req.user.sub },
      update: {},
    });
  }
  @Roles("TEACHER") @Get("classes/:id/students") async roster(
    @Param("id") id: string,
    @Req() req: any,
  ) {
    await this.classOwner(id, req);
    return this.db.enrollment.findMany({
      where: { classId: id },
      include: {
        student: {
          select: {
            id: true,
            fullName: true,
            username: true,
            mustChangePassword: true,
            progress: true,
          },
        },
      },
    });
  }
  @Roles("TEACHER") @Post("classes/:id/students") async provisionStudent(
    @Param("id") id: string,
    @Req() req: any,
    @Body() body: unknown,
  ) {
    await this.classOwner(id, req);
    const b = z
      .object({
        username,
        fullName: text,
        grade: z.number().int().min(6).max(9),
        consent: z.literal(true),
      })
      .parse(body);
    const temporaryPassword = this.temporaryPassword();
    const user = await this.db.$transaction(async (tx) => {
      const student = await tx.user.create({
        data: {
          username: b.username,
          passwordHash: await argon.hash(temporaryPassword),
          fullName: b.fullName,
          role: "STUDENT",
          grade: b.grade,
          consentAt: new Date(),
          mustChangePassword: true,
          temporaryPasswordExpiresAt: new Date(Date.now() + 86400000),
        },
      });
      await tx.enrollment.create({
        data: { classId: id, studentId: student.id, approved: true },
      });
      return student;
    });
    return {
      user: publicUser(user),
      credentials: {
        username: user.username,
        temporaryPassword,
        expiresAt: user.temporaryPasswordExpiresAt,
      },
    };
  }
  @Roles("TEACHER") @Post("classes/:id/students/:studentId/reset-password") async resetStudentPassword(
    @Param("id") id: string,
    @Param("studentId") studentId: string,
    @Req() req: any,
  ) {
    await this.classOwner(id, req);
    const enrollment = await this.db.enrollment.findUnique({
      where: { classId_studentId: { classId: id, studentId } },
      include: { student: true },
    });
    if (!enrollment || enrollment.student.role !== "STUDENT")
      throw new NotFoundException("Không tìm thấy học sinh trong lớp");
    const temporaryPassword = this.temporaryPassword();
    const expiresAt = new Date(Date.now() + 86400000);
    await this.db.$transaction([
      this.db.user.update({
        where: { id: studentId },
        data: {
          passwordHash: await argon.hash(temporaryPassword),
          mustChangePassword: true,
          temporaryPasswordExpiresAt: expiresAt,
        },
      }),
      this.db.session.deleteMany({ where: { userId: studentId } }),
    ]);
    return {
      credentials: {
        username: enrollment.student.username,
        temporaryPassword,
        expiresAt,
      },
    };
  }
  @Roles("TEACHER") @Put("classes/:id/students/:studentId") async approve(
    @Param("id") id: string,
    @Param("studentId") studentId: string,
    @Req() req: any,
  ) {
    await this.classOwner(id, req);
    return this.db.enrollment.update({
      where: { classId_studentId: { classId: id, studentId } },
      data: { approved: true },
    });
  }
  @Roles("TEACHER") @Delete("classes/:id/students/:studentId") async remove(
    @Param("id") id: string,
    @Param("studentId") studentId: string,
    @Req() req: any,
  ) {
    await this.classOwner(id, req);
    return this.db.enrollment.delete({
      where: { classId_studentId: { classId: id, studentId } },
    });
  }
  @Roles("TEACHER") @Post("classes/:id/assignments") async assign(
    @Param("id") id: string,
    @Req() req: any,
    @Body() body: unknown,
  ) {
    await this.classOwner(id, req);
    const b = z
      .object({
        contentId: text,
        contentType: z.enum(["lesson", "lab"]),
        title: text,
        dueDate: z.string().datetime(),
        studentIds: z.array(text).max(100).default([]),
      })
      .parse(body);
    const content =
      b.contentType === "lesson"
        ? await this.db.lesson.findFirst({
            where: { id: b.contentId, status: "published" },
          })
        : await this.db.lab.findFirst({
            where: { id: b.contentId, status: "published" },
          });
    if (!content) throw new BadRequestException("Nội dung chưa xuất bản");
    if (new Set(b.studentIds).size !== b.studentIds.length)
      throw new BadRequestException("Danh sách học sinh bị trùng");
    if (b.studentIds.length) {
      const n = await this.db.enrollment.count({
        where: { classId: id, approved: true, studentId: { in: b.studentIds } },
      });
      if (n !== new Set(b.studentIds).size)
        throw new BadRequestException("Nhóm có học sinh ngoài lớp");
    }
    return this.db.assignment.create({
      data: {
        ...b,
        classId: id,
        dueDate: new Date(b.dueDate),
        status: "ACTIVE",
      },
    });
  }
  @Roles("STUDENT") @Get("assignments") async assignments(@Req() req: any) {
    const rows = await this.db.assignment.findMany({
      where: {
        status: "ACTIVE",
        classroom: {
          enrollments: { some: { studentId: req.user.sub, approved: true } },
        },
      },
      include: { classroom: { select: { name: true } } },
      orderBy: [{ dueDate: "asc" }, { createdAt: "asc" }, { id: "asc" }],
    });
    return rows
      .filter(
        (a) =>
          !(a.studentIds as string[]).length ||
          (a.studentIds as string[]).includes(req.user.sub),
      )
      .map((a) => ({
        id: a.id,
        title: a.title,
        contentId: a.contentId,
        contentType: a.contentType,
        dueDate: a.dueDate,
        createdAt: a.createdAt,
        overdue: a.dueDate < new Date(),
        classroom: a.classroom,
      }));
  }
  @Roles("STUDENT") @Get("assignments/:id") async assignment(
    @Param("id") id: string,
    @Req() req: any,
  ) {
    const a = await this.applicableAssignment(id, req.user.sub);
    const content =
      a.contentType === "lesson"
        ? await this.db.lesson.findFirst({
            where: { id: a.contentId, status: "published" },
            include: { subject: true },
          })
        : await this.db.lab.findFirst({
            where: { id: a.contentId, status: "published" },
            include: { subject: true },
          });
    if (!content) throw new NotFoundException("Nội dung không còn khả dụng");
    return {
      id: a.id,
      title: a.title,
      contentType: a.contentType,
      dueDate: a.dueDate,
      overdue: a.dueDate < new Date(),
      classroom: a.classroom,
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
  @Roles("STUDENT", "TEACHER") @Post("simulate/:labId") preview(
    @Param("labId") labId: string,
    @Body() body: any,
  ) {
    try {
      return simulate(labId, body);
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
        labState: z.unknown(),
        durationMs: z.number().int().min(0).max(86400000),
      })
      .parse(body);
    const c = await this.db.challenge.findUnique({
      where: { id: b.challengeId },
      include: { lab: true },
    });
    if (!c || c.lab.status !== "published") throw new NotFoundException();
    let result: any;
    try {
      result = simulate(c.labId, b.labState);
    } catch (e: any) {
      throw new BadRequestException(e.message);
    }
    return this.db.$transaction(async (tx) => {
      const a = await tx.attempt.create({
        data: {
          studentId: req.user.sub,
          challengeId: c.id,
          labState: b.labState as any,
          simulationResult: result,
          verdict: result.verdict,
          durationMs: b.durationMs,
        },
      });
      const old = await tx.progress.findUnique({
        where: {
          studentId_contentId: { studentId: req.user.sub, contentId: c.labId },
        },
      });
      const score =
        result.verdict === "passed"
          ? 100
          : result.verdict === "partial"
            ? 50
            : 0;
      await tx.progress.upsert({
        where: {
          studentId_contentId: { studentId: req.user.sub, contentId: c.labId },
        },
        create: {
          studentId: req.user.sub,
          contentId: c.labId,
          status: score === 100 ? "completed" : "in_progress",
          score,
          attemptsCount: 1,
        },
        update: {
          attemptsCount: { increment: 1 },
          score: Math.max(old?.score ?? 0, score),
          status:
            old?.status === "completed" || score === 100
              ? "completed"
              : "in_progress",
        },
      });
      return a;
    });
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
    return this.db.$transaction(
      async (tx) => {
        // Serialize hint progression per student, including parallel requests.
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${req.user.sub}))`;
        const a = await tx.attempt.findFirst({
          where: { id, studentId: req.user.sub },
          include: { challenge: true, hints: true },
        });
        if (!a) throw new NotFoundException();
        if (a.hints.length) return a.hints[0];
        const history = await tx.attempt.findMany({
          where: { studentId: req.user.sub, challengeId: a.challengeId },
          include: { hints: true },
          orderBy: { createdAt: "asc" },
        });
        if (history.at(-1)?.id !== id)
          throw new BadRequestException(
            "Hãy yêu cầu gợi ý cho lần thử mới nhất",
          );
        const previous = history.flatMap((x) => x.hints);
        const level = Math.min(
          4,
          1 + Math.max(0, ...previous.map((h) => h.level)),
        );
        const user = await tx.user.findUniqueOrThrow({
          where: { id: req.user.sub },
        });
        const context = buildContext(user, a, history, level);
        const explanation = await explain(context);
        const content = explanation.content;
        const h = await tx.hintLog.create({
          data: {
            attemptId: id,
            level,
            content,
            contextSnapshot: {
              ...context,
              provider: explanation.provider,
            } as any,
          },
        });
        await tx.progress.updateMany({
          where: { studentId: req.user.sub, contentId: a.challenge.labId },
          data: { lastHintLevel: level },
        });
        return h;
      },
      { timeout: 20000 },
    );
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
  @Roles("STUDENT") @Post("parent-code") async parentCode(@Req() req: any) {
    const linkCode = token();
    await this.db.user.update({
      where: { id: req.user.sub },
      data: { linkCode },
    });
    return { code: linkCode };
  }
  @Roles("PARENT") @Post("children/link") async link(
    @Req() req: any,
    @Body() body: unknown,
  ) {
    const b = z.object({ code: text, consent: z.literal(true) }).parse(body);
    return this.db.$transaction(async (tx) => {
      const student = await tx.user.findFirst({
        where: { linkCode: b.code, role: "STUDENT" },
      });
      if (!student) throw new BadRequestException("Mã liên kết không đúng");
      const consumed = await tx.user.updateMany({
        where: { id: student.id, linkCode: b.code },
        data: { linkCode: null },
      });
      if (!consumed.count) throw new BadRequestException("Mã đã sử dụng");
      return tx.parentLink.upsert({
        where: {
          parentId_studentId: { parentId: req.user.sub, studentId: student.id },
        },
        create: { parentId: req.user.sub, studentId: student.id },
        update: {},
      });
    });
  }
  @Roles("PARENT") @Get("children") async children(@Req() req: any) {
    return this.db.parentLink.findMany({
      where: { parentId: req.user.sub },
      select: {
        student: {
          select: { id: true, fullName: true, grade: true, progress: true },
        },
      },
    });
  }
  @Roles("TEACHER") @Get("classes/:id/analytics") async analytics(
    @Param("id") id: string,
    @Req() req: any,
  ) {
    await this.classOwner(id, req);
    const students = await this.db.enrollment.findMany({
      where: { classId: id, approved: true },
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
  @Roles("TEACHER", "ADMIN") @Post("users") async createUser(
    @Req() req: any,
    @Body() body: unknown,
  ) {
    const b = z
      .discriminatedUnion("role", [
        z.object({
          username,
          password,
          fullName: text,
          role: z.literal("STUDENT"),
          grade: z.number().int().min(6).max(9).default(8),
          consent: z.literal(true),
          classId: z.string().optional(),
        }),
        z.object({
          email,
          password,
          fullName: text,
          role: z.enum(["TEACHER", "PARENT", "ADMIN"]),
          grade: z.number().int().min(6).max(9).default(8),
          consent: z.literal(true),
        }),
      ])
      .parse(body);
    if (req.user.role === "TEACHER") {
      if (b.role !== "STUDENT" || !b.classId)
        throw new ForbiddenException(
          "Giáo viên chỉ tạo học sinh trong lớp của mình",
        );
      await this.classOwner(b.classId, req);
    }
    return this.db.$transaction(async (tx) => {
      const u = await tx.user.create({
        data: {
          email: "email" in b ? b.email : null,
          username: "username" in b ? b.username : null,
          passwordHash: await argon.hash(b.password),
          fullName: b.fullName,
          role: b.role,
          grade: b.grade,
          consentAt: new Date(),
          mustChangePassword: b.role === "STUDENT",
          temporaryPasswordExpiresAt:
            b.role === "STUDENT" ? new Date(Date.now() + 86400000) : null,
        },
      });
      if ("classId" in b && b.classId)
        await tx.enrollment.create({
          data: { classId: b.classId, studentId: u.id, approved: true },
        });
      return publicUser(u);
    });
  }
  private temporaryPassword() {
    return `Nexa-${randomBytes(9).toString("base64url")}`;
  }
  @Roles("ADMIN") @Get("users") async users() {
    return (
      await this.db.user.findMany({ orderBy: { createdAt: "desc" } })
    ).map(publicUser);
  }
  @Roles("ADMIN") @Put("users/:id") async updateUser(
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    const b = z
      .object({ fullName: text, grade: z.number().int().min(6).max(9) })
      .parse(body);
    return publicUser(await this.db.user.update({ where: { id }, data: b }));
  }
  @Roles("ADMIN") @Post("users/:id/reset-password") async resetUserPassword(
    @Param("id") id: string,
  ) {
    const user = await this.db.user.findUnique({ where: { id } });
    if (!user || user.role === "STUDENT")
      throw new NotFoundException("Không tìm thấy tài khoản người lớn");
    const temporaryPassword = this.temporaryPassword();
    const expiresAt = new Date(Date.now() + 86400000);
    await this.db.$transaction([
      this.db.user.update({
        where: { id },
        data: {
          passwordHash: await argon.hash(temporaryPassword),
          mustChangePassword: true,
          temporaryPasswordExpiresAt: expiresAt,
        },
      }),
      this.db.session.deleteMany({ where: { userId: id } }),
    ]);
    return { credentials: { email: user.email, temporaryPassword, expiresAt } };
  }
}
