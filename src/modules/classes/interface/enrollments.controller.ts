import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Delete,
  Get,
  Inject,
  NotFoundException,
  Param,
  Post,
  Put,
  Query,
  Req,
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import * as argon from "argon2";
import { z } from "zod";
import { publicUser } from "../../auth/interface/auth";
import { Roles } from "../../../common/decorators";
import { temporaryPassword } from "../../auth/application/temporary-password";
import { ownedClass } from "../application/class-access";
import { MSG, classArchived, grade, joinInvalid, joinLocked, reason, text } from "../application/class-common";
import { parseJoinCode, verifySecret } from "../application/join-code";
import { audit } from "../../../common/audit";
import { idempotent, readIdempotencyKey, replay, TX_LIMITS } from "../../../common/idempotency";
import { JOIN_LIMITS, clear, hit, limiterKey, lockedAny, sweep } from "../../../common/limiter";
import { Db } from "../../../db/db";
import { notify } from "../../notifications/application/notify";

const username = z
  .string()
  .trim()
  .toLowerCase()
  .min(3)
  .max(32)
  .regex(/^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?$/, "Username chỉ gồm chữ thường, số, dấu chấm, gạch ngang hoặc gạch dưới");

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

@ApiTags("Classes")
@ApiBearerAuth()
@Controller()
export class EnrollmentsController {
  constructor(@Inject(Db) private db: Db) {}

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
      if (status === "approved")
        await notify(tx, [{ recipientId: studentId, type: "ENROLLMENT_APPROVED", title: `Em đã được duyệt vào lớp ${c.name}`, link: "/classes", dedupKey: `enrollment-approved:${id}:${studentId}:${updated.statusChangedAt.getTime()}` }]);
      return {
        enrollment: enrollmentView({ ...updated, student: existing.student }),
        changed: true,
      };
    }, TX_LIMITS);
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
        teacherId: true,
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
      if (status === "pending") {
        const student = await tx.user.findUnique({ where: { id: studentId }, select: { fullName: true } });
        await notify(tx, [{ recipientId: classroom.teacherId, type: "ENROLLMENT_REQUESTED", title: `${student?.fullName} xin vào lớp ${classroom.name}`, link: "/classes", dedupKey: `enrollment-request:${classroom.id}:${studentId}:${Date.now()}` }]);
      }
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
}
