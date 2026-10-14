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
  BadRequestException,
  ConflictException,
  HttpException,
  NotFoundException,
} from "@nestjs/common";
import { ApiTags, ApiBearerAuth, ApiOperation } from "@nestjs/swagger";
import { z } from "zod";
import * as argon from "argon2";
import { randomBytes } from "node:crypto";
import { Db } from "./db";
import { Roles, publicUser } from "./auth";
import { audit, changedFields } from "./audit";
import { idempotent, readIdempotencyKey, replay } from "./idempotency";
import { JOIN_LIMITS, clear, hit, limiterKey, lockedAny, sweep } from "./limiter";
import { parseJoinCode, verifySecret, withFreshJoinCode } from "./join-code";
import { applicableAssignmentWhere, isOverdue, ownedClass, targetHash } from "./access";

const text = z.string().trim().min(1).max(200);
const grade = z.number().int().min(6).max(9);
const username = z
  .string()
  .trim()
  .toLowerCase()
  .min(3)
  .max(32)
  .regex(/^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?$/, "Username chỉ gồm chữ thường, số, dấu chấm, gạch ngang hoặc gạch dưới");
const reason = z.string().trim().max(500).optional();

export const temporaryPassword = () => `Nexa-${randomBytes(9).toString("base64url")}`;

const MSG = {
  classArchived: "Lớp đã lưu trữ; không thể thay đổi, thêm thành viên hay giao bài",
  joinInvalid: "Mã lớp không hợp lệ.",
  joinLocked: "Đã thử quá nhiều lần. Hãy thử lại sau 15 phút.",
  joinPending: "Yêu cầu vào lớp đang chờ giáo viên duyệt.",
  joinApproved: "Đã vào lớp.",
  publishFirst: "Hãy xuất bản nội dung trước khi giao.",
  dueInPast: "Hạn nộp không được ở trong quá khứ.",
  confirmRequired: "Cần xác nhận trước khi thực hiện thao tác này",
};

const classArchived = () => new ConflictException({ code: "CLASS_ARCHIVED", message: MSG.classArchived });
const joinInvalid = () =>
  new NotFoundException({
    code: "JOIN_CODE_INVALID",
    message: MSG.joinInvalid,
  });
const joinLocked = () => new HttpException({ code: "JOIN_RATE_LIMITED", message: MSG.joinLocked }, 429);

/** Serializes per-teacher name checks and per-class assignment checks. */
async function lock(tx: any, scope: string) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${scope}))`;
}

const normalizedName = (name: string) => name.trim().replace(/\s+/g, " ");

function classView(c: any) {
  return {
    id: c.id,
    name: c.name,
    grade: c.grade,
    status: c.status,
    archivedAt: c.archivedAt,
    requiresApproval: c.requiresApproval,
    joinCode: {
      enabled: c.joinCodeEnabled,
      issued: Boolean(c.joinLocator),
      rotatedAt: c.joinCodeRotatedAt,
    },
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
  };
}

function enrollmentView(e: any) {
  return {
    classId: e.classId,
    studentId: e.studentId,
    status: e.status,
    joinedAt: e.joinedAt,
    statusChangedAt: e.statusChangedAt,
    student: e.student
      ? {
          id: e.student.id,
          fullName: e.student.fullName,
          username: e.student.username,
          grade: e.student.grade,
          mustChangePassword: e.student.mustChangePassword,
        }
      : undefined,
  };
}

function assignmentView(a: any, now = new Date()) {
  return {
    id: a.id,
    classId: a.classId,
    title: a.title,
    contentId: a.contentId,
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

const assignmentInput = z
  .object({
    contentType: z.enum(["lesson", "lab"]),
    contentId: text,
    title: text.optional(),
    dueDate: z.string().datetime().nullable().optional(),
    studentIds: z.array(text).max(200).default([]),
  })
  .strict();

const assignmentUpdate = z
  .object({
    title: text.optional(),
    dueDate: z.string().datetime().nullable().optional(),
    studentIds: z.array(text).min(1).max(200).optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, "Không có thay đổi");

@ApiTags("Classes")
@ApiBearerAuth()
@Controller()
export class ClassesController {
  constructor(@Inject(Db) private db: Db) {}

  // ---------- B1-T1 class lifecycle ----------

  @Roles("STUDENT", "TEACHER", "ADMIN")
  @Get("classes")
  @ApiOperation({
    summary: "Teacher: owned classes with membership counts. Student: own memberships.",
  })
  async classes(@Req() req: any, @Query() query: unknown) {
    const q = z.object({ status: z.enum(["ACTIVE", "ARCHIVED", "ALL"]).default("ALL") }).parse(query);
    const now = new Date();
    if (req.user.role === "STUDENT") {
      const studentId = req.user.sub;
      const rows = await this.db.enrollment.findMany({
        where: { studentId, status: { in: ["approved", "pending"] } },
        include: { classroom: true },
        orderBy: { joinedAt: "desc" },
      });
      const assignments = await this.db.assignment.findMany({
        where: applicableAssignmentWhere(studentId),
        select: {
          id: true,
          classId: true,
          title: true,
          contentId: true,
          contentType: true,
          dueDate: true,
        },
      });
      return rows.map((e) => ({
        id: e.classroom.id,
        name: e.classroom.name,
        grade: e.classroom.grade,
        status: e.classroom.status,
        enrollmentStatus: e.status,
        assignments: assignments.filter((a) => a.classId === e.classId).map((a) => ({ ...a, overdue: isOverdue(a.dueDate, now) })),
      }));
    }
    const rows = await this.db.classroom.findMany({
      where: {
        ...(req.user.role === "TEACHER" ? { teacherId: req.user.sub } : {}),
        ...(q.status === "ALL" ? {} : { status: q.status }),
      },
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    });
    const ids = rows.map((c) => c.id);
    const [members, assignments] = await Promise.all([
      this.db.enrollment.groupBy({
        by: ["classId", "status"],
        where: { classId: { in: ids } },
        _count: { _all: true },
      }),
      this.db.assignment.groupBy({
        by: ["classId", "status"],
        where: { classId: { in: ids } },
        _count: { _all: true },
      }),
    ]);
    const countOf = (list: any[], classId: string, status: string) =>
      list.find((item) => item.classId === classId && item.status === status)?._count._all ?? 0;
    return rows.map((c) => ({
      ...classView(c),
      members: {
        approved: countOf(members, c.id, "approved"),
        pending: countOf(members, c.id, "pending"),
        removed: countOf(members, c.id, "removed"),
      },
      assignments: {
        active: countOf(assignments, c.id, "ACTIVE"),
        archived: countOf(assignments, c.id, "ARCHIVED"),
      },
    }));
  }

  @Roles("TEACHER")
  @Get("classes/:id")
  async classDetail(@Param("id") id: string, @Req() req: any) {
    const c = await ownedClass(this.db, id, req.user);
    return classView(c);
  }

  @Roles("TEACHER")
  @Post("classes")
  @ApiOperation({
    summary: "Create an owned class; the full join code is shown only in this response",
  })
  async createClass(@Req() req: any, @Body() body: unknown) {
    const b = z
      .object({
        name: text,
        grade,
        joinCodeEnabled: z.boolean().default(true),
        requiresApproval: z.boolean().default(false),
      })
      .strict()
      .parse(body);
    const name = normalizedName(b.name);
    const ctx = {
      actorId: req.user.sub,
      key: readIdempotencyKey(req),
      scope: "POST classes",
      payload: { ...b, name },
    };
    return withFreshJoinCode((code) =>
      idempotent(
        this.db,
        ctx,
        async (tx) => {
          await this.assertUniqueName(tx, req.user.sub, name);
          const c = await tx.classroom.create({
            data: {
              name,
              grade: b.grade,
              teacherId: req.user.sub,
              joinCodeEnabled: b.joinCodeEnabled,
              requiresApproval: b.requiresApproval,
              joinLocator: code.locator,
              joinSecretHash: code.secretHash,
              joinKeyVersion: code.keyVersion,
              joinCodeRotatedAt: new Date(),
            },
          });
          await audit(tx, {
            actor: req.user,
            action: "class.create",
            targetType: "Classroom",
            targetId: c.id,
            after: {
              name,
              grade: b.grade,
              joinCodeEnabled: b.joinCodeEnabled,
              requiresApproval: b.requiresApproval,
              joinCodeIssued: true,
            },
          });
          return { class: classView(c), joinCode: code.code };
        },
        // The full join code is shown once; a replay returns the class without it.
        {
          stored: (result: any) => ({
            ...result,
            joinCode: null,
            joinCodeShownOnce: true,
          }),
        },
      ),
    );
  }

  private async assertUniqueName(tx: any, teacherId: string, name: string, exceptId?: string) {
    await lock(tx, "class-name:" + teacherId);
    const clash = await tx.classroom.findFirst({
      where: {
        teacherId,
        status: "ACTIVE",
        name: { equals: name, mode: "insensitive" },
        ...(exceptId ? { id: { not: exceptId } } : {}),
      },
      select: { id: true },
    });
    if (clash)
      throw new ConflictException({
        code: "CLASS_NAME_TAKEN",
        message: "Bạn đã có lớp đang hoạt động trùng tên này",
      });
  }

  @Roles("TEACHER")
  @Put("classes/:id")
  async updateClass(@Param("id") id: string, @Req() req: any, @Body() body: unknown) {
    const b = z
      .object({
        name: text.optional(),
        grade: grade.optional(),
        joinCodeEnabled: z.boolean().optional(),
        requiresApproval: z.boolean().optional(),
      })
      .strict()
      .refine((value) => Object.keys(value).length > 0, "Không có thay đổi")
      .parse(body);
    const c = await ownedClass(this.db, id, req.user);
    if (c.status === "ARCHIVED") throw classArchived();
    const data = { ...b, ...(b.name ? { name: normalizedName(b.name) } : {}) };
    return this.db.$transaction(async (tx) => {
      if (data.name) await this.assertUniqueName(tx, req.user.sub, data.name, id);
      const updated = await tx.classroom.update({ where: { id }, data });
      const diff = changedFields(c, updated);
      if (diff.after)
        await audit(tx, {
          actor: req.user,
          action: "class.update",
          targetType: "Classroom",
          targetId: id,
          ...diff,
        });
      return classView(updated);
    });
  }

  @Roles("TEACHER")
  @Post("classes/:id/archive")
  @ApiOperation({
    summary: "Archive a class: closes student access immediately and keeps all records",
  })
  async archiveClass(@Param("id") id: string, @Req() req: any, @Body() body: unknown) {
    const b = z
      .object({ reason, confirm: z.literal(true) })
      .strict()
      .parse(body ?? {});
    const c = await ownedClass(this.db, id, req.user);
    return this.db.$transaction(async (tx) => {
      const counts = await this.classCounts(tx, id);
      if (c.status === "ARCHIVED") return { class: classView(c), retained: counts, alreadyArchived: true };
      const updated = await tx.classroom.update({
        where: { id },
        data: { status: "ARCHIVED", archivedAt: new Date() },
      });
      await audit(tx, {
        actor: req.user,
        action: "class.archive",
        targetType: "Classroom",
        targetId: id,
        reason: b.reason,
        before: { status: c.status },
        after: { status: "ARCHIVED", ...counts },
      });
      return {
        class: classView(updated),
        retained: counts,
        alreadyArchived: false,
      };
    });
  }

  private async classCounts(db: any, classId: string) {
    const assignmentIds = (await db.assignment.findMany({ where: { classId }, select: { id: true } })).map((a: any) => a.id);
    const [enrollments, assignments, quiz, practical] = await Promise.all([
      db.enrollment.count({ where: { classId } }),
      db.assignment.count({ where: { classId } }),
      db.quizAttempt.count({ where: { assignmentId: { in: assignmentIds } } }),
      db.attempt.count({ where: { assignmentId: { in: assignmentIds } } }),
    ]);
    return { enrollments, assignments, evidence: quiz + practical };
  }

  @Roles("TEACHER")
  @Post("classes/:id/join-code/rotate")
  @ApiOperation({
    summary: "Issue a new join code; the previous one stops working immediately",
  })
  async rotateJoinCode(@Param("id") id: string, @Req() req: any) {
    const c = await ownedClass(this.db, id, req.user);
    if (c.status === "ARCHIVED") throw classArchived();
    return withFreshJoinCode((code) =>
      this.db.$transaction(async (tx) => {
        const updated = await tx.classroom.update({
          where: { id },
          data: {
            joinLocator: code.locator,
            joinSecretHash: code.secretHash,
            joinKeyVersion: code.keyVersion,
            joinCodeRotatedAt: new Date(),
            joinCodeEnabled: true,
          },
        });
        await audit(tx, {
          actor: req.user,
          action: "class.join_code.rotate",
          targetType: "Classroom",
          targetId: id,
          after: { joinCodeRotated: true, joinCodeEnabled: true },
        });
        return { class: classView(updated), joinCode: code.code };
      }),
    );
  }

  // ---------- B1-T2 enrollment and roster ----------

  @Roles("TEACHER")
  @Get("classes/:id/students")
  async roster(@Param("id") id: string, @Req() req: any, @Query() query: unknown) {
    const q = z
      .object({
        status: z.enum(["approved", "pending", "removed", "all"]).default("all"),
      })
      .parse(query);
    await ownedClass(this.db, id, req.user);
    const rows = await this.db.enrollment.findMany({
      where: {
        classId: id,
        ...(q.status === "all" ? {} : { status: q.status }),
      },
      include: {
        student: {
          select: {
            id: true,
            fullName: true,
            username: true,
            grade: true,
            mustChangePassword: true,
          },
        },
      },
      orderBy: [{ status: "asc" }, { joinedAt: "asc" }],
    });
    return rows.map(enrollmentView);
  }

  @Roles("TEACHER")
  @Post("classes/:id/students")
  @ApiOperation({
    summary: "Provision a new student account into the class; the temporary password is shown once",
  })
  async provisionStudent(@Param("id") id: string, @Req() req: any, @Body() body: unknown) {
    const b = z
      .object({ username, fullName: text, grade, consent: z.literal(true) })
      .strict()
      .parse(body);
    const c = await ownedClass(this.db, id, req.user);
    if (c.status === "ARCHIVED") throw classArchived();
    const password = temporaryPassword();
    const passwordHash = await argon.hash(password);
    const ctx = {
      actorId: req.user.sub,
      key: readIdempotencyKey(req),
      scope: "POST classes/:id/students:" + id,
      payload: b,
    };
    try {
      return await idempotent(
        this.db,
        ctx,
        async (tx) => {
          const student = await tx.user.create({
            data: {
              username: b.username,
              passwordHash,
              fullName: b.fullName,
              role: "STUDENT",
              grade: b.grade,
              consentAt: new Date(),
              mustChangePassword: true,
              temporaryPasswordExpiresAt: new Date(Date.now() + 86400000),
            },
          });
          await tx.enrollment.create({
            data: {
              classId: id,
              studentId: student.id,
              status: "approved",
              approved: true,
            },
          });
          await audit(tx, {
            actor: req.user,
            action: "enrollment.provision",
            targetType: "Enrollment",
            targetId: `${id}:${student.id}`,
            after: {
              classId: id,
              studentId: student.id,
              enrollmentStatus: "approved",
              grade: b.grade,
            },
          });
          return {
            user: publicUser(student),
            credentials: {
              username: student.username,
              temporaryPassword: password,
              expiresAt: student.temporaryPasswordExpiresAt,
            },
          };
        },
        // Never persist the temporary password in the replay record.
        {
          stored: (result: any) => ({
            ...result,
            credentials: null,
            credentialsShownOnce: true,
          }),
        },
      );
    } catch (error) {
      if ((error as any)?.code === "P2002")
        throw new ConflictException({
          code: "USERNAME_TAKEN",
          message: "Tên đăng nhập này đã được dùng.",
        });
      throw error;
    }
  }

  @Roles("TEACHER")
  @Post("classes/:id/enrollments")
  @ApiOperation({
    summary: "Enroll an existing student account by username (approved immediately)",
  })
  async enrollExisting(@Param("id") id: string, @Req() req: any, @Body() body: unknown) {
    const b = z.object({ username }).strict().parse(body);
    const c = await ownedClass(this.db, id, req.user);
    if (c.status === "ARCHIVED") throw classArchived();
    const ctx = {
      actorId: req.user.sub,
      key: readIdempotencyKey(req),
      scope: "POST classes/:id/enrollments:" + id,
      payload: b,
    };
    return idempotent(this.db, ctx, async (tx) => {
      const student = await tx.user.findUnique({
        where: { username: b.username },
      });
      // Non-student and missing accounts share one response.
      if (!student || student.role !== "STUDENT" || student.status !== "active")
        throw new NotFoundException({
          code: "STUDENT_NOT_FOUND",
          message: "Không tìm thấy tài khoản học sinh với tên đăng nhập này",
        });
      const existing = await tx.enrollment.findUnique({
        where: { classId_studentId: { classId: id, studentId: student.id } },
      });
      if (existing?.status === "approved")
        return {
          enrollment: enrollmentView({ ...existing, student }),
          changed: false,
        };
      const now = new Date();
      const enrollment = await tx.enrollment.upsert({
        where: { classId_studentId: { classId: id, studentId: student.id } },
        create: {
          classId: id,
          studentId: student.id,
          status: "approved",
          approved: true,
        },
        update: { status: "approved", approved: true, statusChangedAt: now },
      });
      await audit(tx, {
        actor: req.user,
        action: "enrollment.enroll",
        targetType: "Enrollment",
        targetId: `${id}:${student.id}`,
        before: existing ? { enrollmentStatus: existing.status } : null,
        after: {
          classId: id,
          studentId: student.id,
          enrollmentStatus: "approved",
          rejoin: Boolean(existing),
        },
      });
      return {
        enrollment: enrollmentView({ ...enrollment, student }),
        changed: true,
      };
    });
  }

  @Roles("TEACHER")
  @Put("classes/:id/students/:studentId")
  @ApiOperation({
    summary: "Approve, decline or remove a member. Decline/remove require confirm=true.",
  })
  async setEnrollmentStatus(@Param("id") id: string, @Param("studentId") studentId: string, @Req() req: any, @Body() body: unknown) {
    const b = z
      .object({
        status: z.enum(["approved", "removed"]).default("approved"),
        confirm: z.boolean().optional(),
        reason,
      })
      .strict()
      .parse(body ?? {});
    return this.changeEnrollment(id, studentId, req, b.status, b.confirm, b.reason);
  }

  @Roles("TEACHER")
  @Delete("classes/:id/students/:studentId")
  @ApiOperation({
    summary: "Remove a member (soft): access ends, evidence is kept. Requires ?confirm=true.",
  })
  async removeMember(@Param("id") id: string, @Param("studentId") studentId: string, @Req() req: any, @Query() query: unknown) {
    const q = z.object({ confirm: z.enum(["true"]).optional(), reason }).parse(query);
    return this.changeEnrollment(id, studentId, req, "removed", q.confirm === "true", q.reason);
  }

  private async changeEnrollment(
    id: string,
    studentId: string,
    req: any,
    status: "approved" | "removed",
    confirm: boolean | undefined,
    why: string | undefined,
  ) {
    const c = await ownedClass(this.db, id, req.user);
    if (c.status === "ARCHIVED") throw classArchived();
    if (status === "removed" && confirm !== true)
      throw new BadRequestException({
        code: "CONFIRMATION_REQUIRED",
        message: MSG.confirmRequired,
      });
    return this.db.$transaction(async (tx) => {
      const existing = await tx.enrollment.findUnique({
        where: { classId_studentId: { classId: id, studentId } },
        include: {
          student: {
            select: {
              id: true,
              fullName: true,
              username: true,
              grade: true,
              mustChangePassword: true,
            },
          },
        },
      });
      if (!existing)
        throw new NotFoundException({
          code: "ENROLLMENT_NOT_FOUND",
          message: "Học sinh không thuộc lớp này",
        });
      if (existing.status === status) return { enrollment: enrollmentView(existing), changed: false };
      if (status === "approved" && existing.status === "removed")
        throw new ConflictException({
          code: "ENROLLMENT_REMOVED",
          message: "Học sinh đã bị xóa khỏi lớp; hãy ghi danh lại bằng tên đăng nhập hoặc để học sinh dùng mã lớp",
        });
      const updated = await tx.enrollment.update({
        where: { classId_studentId: { classId: id, studentId } },
        data: {
          status,
          approved: status === "approved",
          statusChangedAt: new Date(),
        },
      });
      await audit(tx, {
        actor: req.user,
        action: status === "approved" ? "enrollment.approve" : existing.status === "pending" ? "enrollment.decline" : "enrollment.remove",
        targetType: "Enrollment",
        targetId: `${id}:${studentId}`,
        reason: why,
        before: { enrollmentStatus: existing.status },
        after: { enrollmentStatus: status, classId: id, studentId },
      });
      return {
        enrollment: enrollmentView({ ...updated, student: existing.student }),
        changed: true,
      };
    });
  }

  @Roles("TEACHER")
  @Post("classes/:id/students/:studentId/reset-password")
  async resetStudentPassword(@Param("id") id: string, @Param("studentId") studentId: string, @Req() req: any) {
    const c = await ownedClass(this.db, id, req.user);
    if (c.status === "ARCHIVED") throw classArchived();
    const enrollment = await this.db.enrollment.findUnique({
      where: { classId_studentId: { classId: id, studentId } },
      include: { student: true },
    });
    if (!enrollment || enrollment.status === "removed" || enrollment.student.role !== "STUDENT")
      throw new NotFoundException({
        code: "ENROLLMENT_NOT_FOUND",
        message: "Không tìm thấy học sinh trong lớp",
      });
    const password = temporaryPassword();
    const expiresAt = new Date(Date.now() + 86400000);
    const passwordHash = await argon.hash(password);
    await this.db.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: studentId },
        data: {
          passwordHash,
          mustChangePassword: true,
          temporaryPasswordExpiresAt: expiresAt,
        },
      });
      await tx.session.deleteMany({ where: { userId: studentId } });
      await audit(tx, {
        actor: req.user,
        action: "student.password_reset",
        targetType: "User",
        targetId: studentId,
        after: { classId: id, studentId },
      });
    });
    return {
      credentials: {
        username: enrollment.student.username,
        temporaryPassword: password,
        expiresAt,
      },
    };
  }

  // ---------- B1-T3 join by code ----------

  @Roles("STUDENT")
  @Post("classes/join")
  @ApiOperation({
    summary: "Join a class with a teacher-issued code (UC-AUTH-05)",
  })
  async join(@Req() req: any, @Body() body: unknown) {
    const b = z
      .object({ code: z.string().max(64) })
      .strict()
      .parse(body);
    const studentId: string = req.user.sub;
    const ip = String(req.ip ?? "unknown");
    const parsed = parseJoinCode(b.code);
    const locator = parsed?.locator ?? "malformed";
    const keys = {
      pair: limiterKey("join:pair", ip, studentId),
      account: limiterKey("join:account", studentId),
      locatorIp: limiterKey("join:locator-ip", locator, ip),
      endpointIp: limiterKey("join:endpoint-ip", ip),
    };
    const now = new Date();
    // Locks are checked before the code is looked at, so a 429 never depends on code validity.
    if (await lockedAny(this.db, Object.values(keys), now)) throw joinLocked();
    const ctx = {
      actorId: studentId,
      key: readIdempotencyKey(req),
      scope: "POST classes/join",
      payload: { code: parsed ? `${parsed.locator}${parsed.secret}` : b.code },
    };
    const previous = await replay(this.db, ctx);
    if (previous !== null) return previous;
    await hit(this.db, [{ key: keys.endpointIp, rule: JOIN_LIMITS.endpointIp }], now);
    if (Math.random() < 0.01) await sweep(this.db, now);

    // Same lookup + HMAC work for malformed, unknown, disabled and archived codes.
    const classroom = await this.db.classroom.findUnique({
      where: { joinLocator: parsed?.locator ?? "~invalid~" },
      select: {
        id: true,
        name: true,
        status: true,
        joinCodeEnabled: true,
        requiresApproval: true,
        joinSecretHash: true,
        joinKeyVersion: true,
      },
    });
    const secretOk = verifySecret(parsed, classroom);
    const usable = Boolean(classroom && secretOk && classroom.status === "ACTIVE" && classroom.joinCodeEnabled);
    if (!usable || !classroom) {
      await hit(
        this.db,
        [
          { key: keys.pair, rule: JOIN_LIMITS.pair },
          { key: keys.account, rule: JOIN_LIMITS.account },
          { key: keys.locatorIp, rule: JOIN_LIMITS.locatorIp },
        ],
        now,
      );
      throw joinInvalid();
    }
    await clear(this.db, [keys.pair, keys.locatorIp]);
    return idempotent(this.db, ctx, async (tx) => {
      const existing = await tx.enrollment.findUnique({
        where: { classId_studentId: { classId: classroom.id, studentId } },
      });
      if (existing && existing.status !== "removed") return this.joinResult(classroom, existing.status, false);
      // Q-B1-01: rejoin reuses the enrollment and evidence; approval policy decides the status.
      const status = classroom.requiresApproval ? "pending" : "approved";
      await tx.enrollment.upsert({
        where: { classId_studentId: { classId: classroom.id, studentId } },
        create: {
          classId: classroom.id,
          studentId,
          status,
          approved: status === "approved",
        },
        update: {
          status,
          approved: status === "approved",
          statusChangedAt: new Date(),
        },
      });
      await audit(tx, {
        actor: req.user,
        action: status === "pending" ? "enrollment.join_request" : "enrollment.join",
        targetType: "Enrollment",
        targetId: `${classroom.id}:${studentId}`,
        before: existing ? { enrollmentStatus: existing.status } : null,
        after: {
          classId: classroom.id,
          studentId,
          enrollmentStatus: status,
          rejoin: Boolean(existing),
        },
      });
      return this.joinResult(classroom, status, true);
    });
  }

  private joinResult(classroom: { id: string; name: string }, status: string, changed: boolean) {
    return {
      class: { id: classroom.id, name: classroom.name },
      enrollmentStatus: status,
      changed,
      message: status === "pending" ? MSG.joinPending : MSG.joinApproved,
    };
  }

  // ---------- B1-T5 assignments ----------

  @Roles("TEACHER")
  @Get("classes/:id/assignments")
  async classAssignments(@Param("id") id: string, @Req() req: any, @Query() query: unknown) {
    const q = z.object({ status: z.enum(["ACTIVE", "ARCHIVED", "ALL"]).default("ALL") }).parse(query);
    await ownedClass(this.db, id, req.user);
    const rows = await this.db.assignment.findMany({
      where: {
        classId: id,
        ...(q.status === "ALL" ? {} : { status: q.status }),
      },
      include: { _count: { select: { targets: true } } },
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    });
    return rows.map((a) => assignmentView(a));
  }

  @Roles("TEACHER")
  @Get("classes/:id/assignable-content")
  @ApiOperation({
    summary: "Published lessons and labs this teacher may assign",
  })
  async assignableContent(@Param("id") id: string, @Req() req: any) {
    const c = await ownedClass(this.db, id, req.user);
    const [lessons, labs] = await Promise.all([
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
          scope: true,
          synthetic: true,
          subject: { select: { id: true, name: true } },
        },
        orderBy: [{ grade: "asc" }, { title: "asc" }],
      }),
      this.db.lab.findMany({
        where: { status: "published" },
        select: {
          id: true,
          title: true,
          grade: true,
          topic: true,
          subject: { select: { id: true, name: true } },
        },
        orderBy: { title: "asc" },
      }),
    ]);
    return { classGrade: c.grade, lessons, labs };
  }

  private async assignableContentOrThrow(tx: any, contentType: "lesson" | "lab", contentId: string, teacherId: string) {
    const content =
      contentType === "lesson"
        ? await tx.lesson.findFirst({
            where: {
              id: contentId,
              status: "published",
              OR: [{ scope: "SHARED_LIBRARY" }, { authorId: teacherId }],
            },
            select: { id: true, title: true },
          })
        : await tx.lab.findFirst({
            where: { id: contentId, status: "published" },
            select: { id: true, title: true },
          });
    if (!content)
      throw new BadRequestException({
        code: "CONTENT_NOT_PUBLISHED",
        message: MSG.publishFirst,
      });
    return content;
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
        message: "Bài này đã được giao cho cùng nhóm học sinh với cùng hạn nộp",
        details: { assignmentId: duplicate.id },
      });
  }

  @Roles("TEACHER")
  @Post("classes/:id/assignments")
  @ApiOperation({
    summary: "Assign a published lesson or lab to approved members or a subset (MSG-31 count)",
  })
  async assign(@Param("id") id: string, @Req() req: any, @Body() body: unknown) {
    const b = assignmentInput.parse(body);
    const c = await ownedClass(this.db, id, req.user);
    if (c.status === "ARCHIVED") throw classArchived();
    const now = new Date();
    const dueDate = this.assertDueDate(b.dueDate, now);
    const ctx = {
      actorId: req.user.sub,
      key: readIdempotencyKey(req),
      scope: "POST classes/:id/assignments:" + id,
      payload: b,
    };
    return idempotent(this.db, ctx, async (tx) => {
      await lock(tx, "class-assign:" + id);
      const content = await this.assignableContentOrThrow(tx, b.contentType, b.contentId, req.user.sub);
      const targets = await this.resolveTargets(tx, id, b.studentIds);
      const hash = targetHash(targets);
      await this.assertNotDuplicate(tx, {
        classId: id,
        contentType: b.contentType,
        contentId: b.contentId,
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
      await audit(tx, {
        actor: req.user,
        action: "assignment.create",
        targetType: "Assignment",
        targetId: assignment.id,
        after: {
          classId: id,
          contentType: b.contentType,
          contentId: b.contentId,
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

  @Roles("TEACHER")
  @Put("classes/:id/assignments/:assignmentId")
  @ApiOperation({
    summary: "Update title, due date or target set; evidence is never deleted",
  })
  async updateAssignment(@Param("id") id: string, @Param("assignmentId") assignmentId: string, @Req() req: any, @Body() body: unknown) {
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

  @Roles("TEACHER")
  @Post("classes/:id/assignments/:assignmentId/archive")
  @ApiOperation({
    summary: "Archive an assignment: it leaves student queues, evidence and history remain",
  })
  async archiveAssignment(@Param("id") id: string, @Param("assignmentId") assignmentId: string, @Req() req: any, @Body() body: unknown) {
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
