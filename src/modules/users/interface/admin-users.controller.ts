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
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { cursorWhere, limit, notFound, page, reason, text } from "../../../common/admin-api";
import { publicUser } from "../../auth/interface/auth";
import { Roles } from "../../../common/decorators";
import { issueResetLink } from "../../auth/application/password-reset";
import { temporaryPassword } from "../../auth/application/temporary-password";
import { audit, changedFields } from "../../../common/audit";
import { Db } from "../../../db/db";
import { smtpDeliver } from "../../mail/infrastructure/mail";
import { storage } from "../../storage/infrastructure/storage";
import {
  DELETION_BLOCKER_LABELS,
  activeOwnership,
  assertNotLastActiveAdmin,
  blockingKeys,
  deletionBlockers,
  lockAdminLifecycle,
  resolutionProblems,
  resolutionsSchema,
} from "../application/admin-policy";
import { lessonOperationData } from "../../lessons/application/lesson-moderation";

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
  .regex(/^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?$/);

const password = z.string().min(12).max(128);

export const adminUser = (u: any) => ({
  ...publicUser(u),
  status: u.status,
  disabledAt: u.disabledAt ?? null,
  emailVerifiedAt: u.emailVerifiedAt ?? null,
  createdAt: u.createdAt,
});

/**
 * Epic C2 admin console API. Every route is ADMIN-only (other roles get 403 from
 * the guard), every mutation and every audit read writes an AuditLog row in the
 * same transaction, and no operation edits evidence or attests a review.
 */
@ApiTags("Admin")
@ApiBearerAuth()
@Roles("ADMIN")
@Controller("admin")
export class AdminUsersController {
  constructor(@Inject(Db) private db: Db) {}

  // ───────────────────────── C2-T1 users ─────────────────────────
  @Get("users")
  @ApiOperation({ summary: "Paginated user list with search and role/status filters" })
  async users(@Query() query: unknown) {
    const q = z
      .object({
        q: z.string().trim().max(100).optional(),
        role: z.enum(["STUDENT", "TEACHER", "PARENT", "ADMIN"]).optional(),
        status: z.enum(["active", "disabled"]).optional(),
        cursor: z.string().max(200).optional(),
        limit,
      })
      .strict()
      .parse(query ?? {});
    const search = q.q
      ? {
          OR: [
            { fullName: { contains: q.q, mode: "insensitive" as const } },
            { email: { contains: q.q, mode: "insensitive" as const } },
            { username: { contains: q.q, mode: "insensitive" as const } },
          ],
        }
      : {};
    const rows = await this.db.user.findMany({
      where: { AND: [search, q.role ? { role: q.role } : {}, q.status ? { status: q.status } : {}, cursorWhere(q.cursor)] },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: q.limit + 1,
    });
    const result = page(rows, q.limit);
    return { items: result.items.map(adminUser), nextCursor: result.nextCursor };
  }

  @Get("users/:id")
  @ApiOperation({ summary: "User detail with active ownership and hard-delete eligibility" })
  async user(@Param("id") id: string) {
    const user = await this.db.user.findUnique({ where: { id } });
    if (!user) throw notFound("tài khoản");
    const [ownership, blockers] = await Promise.all([activeOwnership(this.db, id), deletionBlockers(this.db, id)]);
    return { user: adminUser(user), ownership, deletion: this.eligibility(blockers) };
  }

  @Get("users/:id/deletion-eligibility")
  async deletionEligibility(@Param("id") id: string) {
    if (!(await this.db.user.findUnique({ where: { id }, select: { id: true } }))) throw notFound("tài khoản");
    return this.eligibility(await deletionBlockers(this.db, id));
  }
  private eligibility(blockers: Awaited<ReturnType<typeof deletionBlockers>>) {
    const keys = blockingKeys(blockers);
    return {
      eligible: keys.length === 0,
      blockers,
      blocking: keys.map((key) => ({ key, label: DELETION_BLOCKER_LABELS[key], count: blockers[key] })),
    };
  }

  @Post("users")
  @ApiOperation({ summary: "Create a teacher, parent or admin account (setup link by email), or a student in a class" })
  async createUser(@Req() req: any, @Body() body: unknown) {
    const b = z
      .discriminatedUnion("role", [
        z
          .object({
            role: z.literal("STUDENT"),
            username,
            fullName: text,
            grade: z.number().int().min(6).max(9).default(8),
            classId: z.string().max(100).optional(),
            consent: z.literal(true),
            password: password.optional(),
          })
          .strict(),
        z
          .object({
            role: z.enum(["TEACHER", "PARENT", "ADMIN"]),
            email,
            fullName: text,
            grade: z.number().int().min(6).max(9).default(8),
            consent: z.literal(true),
            /** Automation only. Without it the account gets an emailed one-time setup link and no admin-known password. */
            password: password.optional(),
          })
          .strict(),
      ])
      .parse(body);
    if (b.role === "STUDENT" && b.classId) {
      const target = await this.db.classroom.findUnique({ where: { id: b.classId }, select: { status: true } });
      if (!target) throw new NotFoundException({ code: "CLASS_NOT_FOUND", message: "Không tìm thấy lớp" });
      if (target.status === "ARCHIVED")
        throw new ConflictException({ code: "CLASS_ARCHIVED", message: "Lớp đã lưu trữ; không thể thêm thành viên" });
    }
    const studentPassword = b.role === "STUDENT" ? (b.password ?? temporaryPassword()) : null;
    const initial = b.role === "STUDENT" ? studentPassword! : (b.password ?? randomBytes(32).toString("base64url"));
    const user = await this.db.$transaction(async (tx) => {
      const exists = await tx.user.findFirst({
        where: b.role === "STUDENT" ? { username: b.username } : { email: b.email },
        select: { id: true },
      });
      if (exists) throw new ConflictException({ code: "USER_EXISTS", message: "Email hoặc tên đăng nhập đã được dùng" });
      const u = await tx.user.create({
        data: {
          email: b.role === "STUDENT" ? null : b.email,
          username: b.role === "STUDENT" ? b.username : null,
          passwordHash: await argon.hash(initial),
          fullName: b.fullName,
          role: b.role,
          grade: b.grade,
          consentAt: new Date(),
          mustChangePassword: b.role === "STUDENT",
          temporaryPasswordExpiresAt: b.role === "STUDENT" ? new Date(Date.now() + 86400000) : null,
        },
      });
      if (b.role === "STUDENT" && b.classId)
        await tx.enrollment.create({ data: { classId: b.classId, studentId: u.id, status: "approved", approved: true } });
      await audit(tx, {
        actor: req.user,
        action: "user.create",
        targetType: "User",
        targetId: u.id,
        after: {
          role: u.role,
          grade: u.grade,
          status: u.status,
          ...(b.role === "STUDENT" && b.classId ? { classId: b.classId, enrollmentStatus: "approved" } : {}),
        },
      });
      return u;
    });
    const setupLinkSent = b.role !== "STUDENT" && !b.password ? await issueResetLink(this.db, user, smtpDeliver) : false;
    return {
      ...adminUser(user),
      setupLinkSent,
      // A student's temporary password is shown once to the provisioning admin, as for teachers.
      ...(b.role === "STUDENT" && !b.password ? { credentials: { username: user.username, temporaryPassword: studentPassword } } : {}),
    };
  }

  @Put("users/:id")
  async updateUser(@Param("id") id: string, @Req() req: any, @Body() body: unknown) {
    const b = z
      .object({ fullName: text, grade: z.number().int().min(6).max(9) })
      .strict()
      .parse(body);
    return this.db.$transaction(async (tx) => {
      const before = await tx.user.findUnique({ where: { id } });
      if (!before) throw notFound("tài khoản");
      const user = await tx.user.update({ where: { id }, data: b });
      const diff = changedFields({ grade: before.grade }, { grade: user.grade });
      await audit(tx, {
        actor: req.user,
        action: "user.update",
        targetType: "User",
        targetId: id,
        before: diff.before,
        after: { ...(diff.after ?? {}), nameChanged: before.fullName !== user.fullName },
      });
      return adminUser(user);
    });
  }

  @Post("users/:id/disable")
  @ApiOperation({ summary: "Disable (default for any account with history): revokes sessions; owners must resolve active ownership" })
  async disableUser(@Param("id") id: string, @Req() req: any, @Body() body: unknown) {
    const b = z
      .object({ reason, resolutions: resolutionsSchema })
      .strict()
      .parse(body ?? {});
    if (id === req.user.sub)
      throw new ConflictException({ code: "SELF_ACTION_FORBIDDEN", message: "Không thể vô hiệu hóa tài khoản đang đăng nhập" });
    const newOwners = await this.reassignTargets(id, [...b.resolutions.classes, ...b.resolutions.lessons, ...b.resolutions.assets]);
    return this.db.$transaction(
      async (tx) => {
        await lockAdminLifecycle(tx);
        const target = await tx.user.findUnique({ where: { id } });
        if (!target) throw notFound("tài khoản");
        if (target.status === "disabled") return { user: adminUser(target), alreadyDisabled: true, applied: [] };
        await assertNotLastActiveAdmin(tx, target);
        const owned = await activeOwnership(tx, id);
        const problems = resolutionProblems(owned, b.resolutions);
        for (const r of [...b.resolutions.classes, ...b.resolutions.lessons, ...b.resolutions.assets])
          if (r.action === "reassign" && r.newOwnerId) {
            const owner = newOwners.get(r.newOwnerId);
            const lesson = owned.lessons.find((l) => l.id === r.id);
            const asset = owned.assets.find((a) => a.id === r.id);
            const shared = lesson?.scope === "SHARED_LIBRARY" || asset?.scope === "SHARED_LIBRARY";
            if (!owner || (owner.role !== "TEACHER" && !(shared && owner.role === "ADMIN")))
              problems.push({
                kind: lesson ? "lesson" : asset ? "asset" : "class",
                id: r.id,
                label: r.id,
                problem: "invalid_new_owner",
                allowed: [],
              });
          }
        if (problems.length)
          throw new ConflictException({
            code: "OWNERSHIP_RESOLUTION_REQUIRED",
            message: "Cần chọn cách xử lý cho mọi lớp, bài học và tệp đang thuộc tài khoản này",
            details: { ownership: owned, problems },
          });
        const applied = await this.applyResolutions(tx, req.user, id, b.reason, b.resolutions);
        const user = await tx.user.update({ where: { id }, data: { status: "disabled", disabledAt: new Date() } });
        const sessions = await tx.session.deleteMany({ where: { userId: id } });
        await audit(tx, {
          actor: req.user,
          action: "user.disable",
          targetType: "User",
          targetId: id,
          reason: b.reason,
          before: { status: target.status },
          after: { status: "disabled", sessionsRevoked: sessions.count, resolutions: applied.length },
        });
        return { user: adminUser(user), alreadyDisabled: false, applied, sessionsRevoked: sessions.count };
      },
      { timeout: 20000 },
    );
  }
  /** Active reassignment targets, checked before the transaction. */
  private async reassignTargets(disabledId: string, resolutions: Array<{ action: string; newOwnerId?: string }>) {
    const ids = [...new Set(resolutions.filter((r) => r.action === "reassign" && r.newOwnerId).map((r) => r.newOwnerId!))];
    if (ids.includes(disabledId))
      throw new BadRequestException({
        code: "INVALID_NEW_OWNER",
        message: "Không thể chuyển quyền sở hữu cho chính tài khoản bị vô hiệu hóa",
      });
    const users = await this.db.user.findMany({ where: { id: { in: ids }, status: "active" }, select: { id: true, role: true } });
    return new Map(users.map((u) => [u.id, u]));
  }
  private async applyResolutions(tx: any, actor: any, fromId: string, why: string, resolutions: z.infer<typeof resolutionsSchema>) {
    const applied: Array<{ kind: string; id: string; action: string; newOwnerId?: string }> = [];
    const now = new Date();
    for (const r of resolutions.classes) {
      if (r.action === "reassign") await tx.classroom.update({ where: { id: r.id }, data: { teacherId: r.newOwnerId } });
      else await tx.classroom.update({ where: { id: r.id }, data: { status: "ARCHIVED", archivedAt: now } });
      await audit(tx, {
        actor,
        action: r.action === "reassign" ? "class.reassign" : "class.archive",
        targetType: "Classroom",
        targetId: r.id,
        reason: why,
        before: { ownerId: fromId },
        after: r.action === "reassign" ? { ownerId: r.newOwnerId } : { status: "ARCHIVED" },
      });
      applied.push({ kind: "class", ...r });
    }
    for (const r of resolutions.lessons) {
      const lesson = await tx.lesson.findUniqueOrThrow({ where: { id: r.id } });
      await tx.lesson.update({ where: { id: r.id }, data: lessonOperationData(lesson, r.action, why, r.newOwnerId) });
      await audit(tx, {
        actor,
        action: `lesson.${r.action}`,
        targetType: "Lesson",
        targetId: r.id,
        reason: why,
        before: { ownerId: fromId, status: lesson.status },
        after: r.action === "reassign" ? { ownerId: r.newOwnerId } : { status: r.action === "archive" ? "archived" : "quarantined" },
      });
      applied.push({ kind: "lesson", ...r });
    }
    for (const r of resolutions.assets) {
      await tx.asset.update({
        where: { id: r.id },
        data: r.action === "reassign" ? { ownerId: r.newOwnerId } : { status: "QUARANTINED", quarantinedAt: now, quarantineReason: why },
      });
      await audit(tx, {
        actor,
        action: `asset.${r.action}`,
        targetType: "Asset",
        targetId: r.id,
        reason: why,
        before: { ownerId: fromId },
        after: r.action === "reassign" ? { ownerId: r.newOwnerId } : { status: "QUARANTINED" },
      });
      applied.push({ kind: "asset", ...r });
    }
    return applied;
  }

  @Post("users/:id/reactivate")
  async reactivateUser(@Param("id") id: string, @Req() req: any, @Body() body: unknown) {
    const b = z
      .object({ reason })
      .strict()
      .parse(body ?? {});
    return this.db.$transaction(async (tx) => {
      const target = await tx.user.findUnique({ where: { id } });
      if (!target) throw notFound("tài khoản");
      if (target.status === "active") return { user: adminUser(target), alreadyActive: true };
      const user = await tx.user.update({ where: { id }, data: { status: "active", disabledAt: null } });
      await audit(tx, {
        actor: req.user,
        action: "user.reactivate",
        targetType: "User",
        targetId: id,
        reason: b.reason,
        before: { status: target.status },
        after: { status: "active" },
      });
      return { user: adminUser(user), alreadyActive: false };
    });
  }

  @Delete("users/:id")
  @ApiOperation({ summary: "Hard delete only when the eligibility query finds no reference" })
  async deleteUser(@Param("id") id: string, @Req() req: any, @Body() body: unknown) {
    const b = z
      .object({ reason, confirm: z.literal(true) })
      .strict()
      .parse(body ?? {});
    if (id === req.user.sub)
      throw new ConflictException({ code: "SELF_ACTION_FORBIDDEN", message: "Không thể xóa tài khoản đang đăng nhập" });
    let avatarKey: string | null = null;
    const result = await this.db.$transaction(
      async (tx) => {
        await lockAdminLifecycle(tx);
        const target = await tx.user.findUnique({ where: { id } });
        if (!target) throw notFound("tài khoản");
        await assertNotLastActiveAdmin(tx, target);
        avatarKey = target.avatarKey;
        const blockers = await deletionBlockers(tx, id);
        const keys = blockingKeys(blockers);
        if (keys.length)
          throw new ConflictException({
            code: "DELETE_INELIGIBLE",
            message: "Tài khoản còn dữ liệu lịch sử hoặc quyền sở hữu; hãy vô hiệu hóa thay vì xóa",
            details: this.eligibility(blockers),
          });
        const sessions = await tx.session.deleteMany({ where: { userId: id } });
        await tx.user.delete({ where: { id } });
        await audit(tx, {
          actor: req.user,
          action: "user.delete",
          targetType: "User",
          targetId: id,
          reason: b.reason,
          before: { role: target.role, status: target.status },
          after: { status: "deleted", sessionsRevoked: sessions.count },
        });
        return { deleted: true, id, report: { ...blockers, sessionsRevoked: sessions.count } };
      },
      { timeout: 20000 },
    );
    // The avatar is personal data: remove the private object once the account row is gone (D-ACC-03).
    if (avatarKey) await storage().delete(avatarKey).catch(() => undefined);
    return result;
  }

  @Post("users/:id/reset-link")
  @ApiOperation({ summary: "Email an adult a one-time 60-minute reset link; the admin never sees a password" })
  async resetLink(@Param("id") id: string, @Req() req: any) {
    const user = await this.db.user.findUnique({ where: { id } });
    if (!user || user.role === "STUDENT" || !user.email)
      throw new NotFoundException({
        code: "ADULT_NOT_FOUND",
        message: "Không tìm thấy tài khoản người lớn; học sinh do giáo viên cấp lại mật khẩu",
      });
    if (user.status !== "active") throw new ConflictException({ code: "USER_DISABLED", message: "Tài khoản đang bị vô hiệu hóa" });
    const sent = await issueResetLink(this.db, user, smtpDeliver);
    await this.db.$transaction((tx) =>
      audit(tx, { actor: req.user, action: "user.reset_link", targetType: "User", targetId: id, outcome: sent ? "success" : "failure" }),
    );
    if (!sent) throw new ConflictException({ code: "DELIVERY_FAILED", message: "Chưa gửi được email; thử lại sau" });
    return { sent: true };
  }
}
