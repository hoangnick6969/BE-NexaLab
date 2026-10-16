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
  NotFoundException,
  UnprocessableEntityException,
} from "@nestjs/common";
import { ApiTags, ApiBearerAuth, ApiOperation } from "@nestjs/swagger";
import { z } from "zod";
import * as argon from "argon2";
import { randomBytes } from "node:crypto";
import { unlink } from "node:fs/promises";
import { resolve } from "node:path";
import { Db } from "./db";
import { assetReferences } from "./assets";
import { storage, storageEnv } from "./storage";
import { preFetchProblems, runIngestion, sourcePolicySchema } from "./ingestion";
import { coverageReport } from "./content-pack";
import { MODEL_REGISTRY, activityDigest, activitySpecSchema, packInputSchema, packValidation, resolveModel } from "./sim-packs";
import { planRelease, retireRelease } from "./content-release";
import { Roles, publicUser } from "./auth";
import { audit, auditDiff, changedFields } from "./audit";
import { temporaryPassword } from "./classes";
import { CHALLENGE_PARAMETERS, DOMAINS, LICENSES, domainSchema, publishBlockers } from "./content";
import { smtpDeliver } from "./mail";
import { issueResetLink } from "./password-reset";
import {
  DELETION_BLOCKER_LABELS,
  activeOwnership,
  assertNotLastActiveAdmin,
  blockingKeys,
  deletionBlockers,
  lockAdminLifecycle,
  resolutionProblems,
  resolutionsSchema,
} from "./admin-policy";
import {
  ENGINE,
  evaluate,
  goldenCaseResults,
  goldenTemplates,
  versionErrors,
  versionInputSchema,
  versionParams,
} from "./simulation-versions";

const text = z.string().trim().min(1).max(200);
const reason = z.string().trim().min(3, "Cần nêu lý do (ít nhất 3 ký tự)").max(500);
const ebookUrl = z.string().url().refine((value) => new URL(value).protocol === "https:", "Liên kết ebook phải dùng HTTPS").nullable().optional();
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
const code = z
  .string()
  .trim()
  .min(2)
  .max(40)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/, "Mã chỉ gồm chữ, số, dấu chấm, gạch ngang hoặc gạch dưới");
const limit = z.coerce.number().int().min(1).max(100).default(25);
const uploadRoot = resolve(process.env.UPLOAD_DIR ?? "uploads");

/** Opaque keyset cursor over (createdAt desc, id desc). */
const encodeCursor = (row: { createdAt: Date; id: string }) =>
  Buffer.from(`${row.createdAt.toISOString()}|${row.id}`).toString("base64url");
function cursorWhere(cursor?: string) {
  if (!cursor) return {};
  const [at, id] = Buffer.from(cursor, "base64url").toString().split("|");
  const createdAt = new Date(at);
  if (!id || Number.isNaN(createdAt.getTime()))
    throw new BadRequestException({ code: "INVALID_CURSOR", message: "Con trỏ phân trang không hợp lệ" });
  return { OR: [{ createdAt: { lt: createdAt } }, { createdAt, id: { lt: id } }] };
}
function page<T extends { createdAt: Date; id: string }>(rows: T[], take: number) {
  const items = rows.slice(0, take);
  return { items, nextCursor: rows.length > take ? encodeCursor(items[items.length - 1]) : null };
}

export const adminUser = (u: any) => ({
  ...publicUser(u),
  status: u.status,
  disabledAt: u.disabledAt ?? null,
  emailVerifiedAt: u.emailVerifiedAt ?? null,
  createdAt: u.createdAt,
});
const notFound = (what: string) => new NotFoundException({ code: "NOT_FOUND", message: `Không tìm thấy ${what}` });

/**
 * Epic C2 admin console API. Every route is ADMIN-only (other roles get 403 from
 * the guard), every mutation and every audit read writes an AuditLog row in the
 * same transaction, and no operation edits evidence or attests a review.
 */
@ApiTags("Admin")
@ApiBearerAuth()
@Roles("ADMIN")
@Controller("admin")
export class AdminController {
  constructor(@Inject(Db) private db: Db) {}

  // ───────────────────────── overview ─────────────────────────
  @Get("overview")
  @ApiOperation({ summary: "Dashboard counts for the admin console" })
  async overview() {
    const since = new Date(Date.now() - 86400000);
    const [users, lessons, assets, versions, audit24h, denied24h] = await Promise.all([
      this.db.user.groupBy({ by: ["role", "status"], _count: { _all: true } }),
      this.db.lesson.groupBy({ by: ["scope", "status"], _count: { _all: true } }),
      this.db.asset.groupBy({ by: ["status", "scope"], _count: { _all: true } }),
      this.db.simulationConfigVersion.groupBy({ by: ["status"], _count: { _all: true } }),
      this.db.auditLog.count({ where: { createdAt: { gte: since } } }),
      this.db.auditLog.count({ where: { createdAt: { gte: since }, outcome: "denied" } }),
    ]);
    const flat = (rows: any[], keys: string[]) =>
      rows.map((row) => ({ ...Object.fromEntries(keys.map((k) => [k, row[k]])), count: row._count._all }));
    return {
      users: flat(users, ["role", "status"]),
      lessons: flat(lessons, ["scope", "status"]),
      assets: flat(assets, ["status", "scope"]),
      simulationVersions: flat(versions, ["status"]),
      audit: { last24h: audit24h, denied24h },
    };
  }

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
      await tx.lesson.update({ where: { id: r.id }, data: this.lessonOperationData(lesson, r.action, why, r.newOwnerId) });
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
    return this.db.$transaction(
      async (tx) => {
        await lockAdminLifecycle(tx);
        const target = await tx.user.findUnique({ where: { id } });
        if (!target) throw notFound("tài khoản");
        await assertNotLastActiveAdmin(tx, target);
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

  // ───────────────────────── C2-T2 taxonomy ─────────────────────────
  @Get("taxonomy")
  @ApiOperation({ summary: "Subjects, chapters, topics and outcomes with usage counts" })
  async taxonomy() {
    const [subjects, chapters, topics, outcomes, lessons] = await Promise.all([
      this.db.subject.findMany({ include: { _count: { select: { lessons: true, labs: true } } }, orderBy: { id: "asc" } }),
      this.db.curriculumChapter.findMany({ orderBy: [{ grade: "asc" }, { code: "asc" }] }),
      this.db.curriculumTopic.findMany({ orderBy: { code: "asc" } }),
      this.db.curriculumOutcome.findMany({ orderBy: [{ grade: "asc" }, { code: "asc" }] }),
      this.db.lesson.findMany({ select: { outcomeCodes: true } }),
    ]);
    const usage = new Map<string, number>();
    for (const lesson of lessons) for (const c of (lesson.outcomeCodes as string[]) ?? []) usage.set(c, (usage.get(c) ?? 0) + 1);
    return {
      domains: DOMAINS,
      subjects: subjects.map(({ _count, ...s }) => ({ ...s, lessons: _count.lessons, labs: _count.labs })),
      chapters,
      topics,
      outcomes: outcomes.map((o) => ({ ...o, lessons: usage.get(o.code) ?? 0 })),
    };
  }
  @Post("subjects")
  async createSubject(@Req() req: any, @Body() body: unknown) {
    const b = z.object({ id: code, name: text, ebookUrl, reason: reason.optional() }).strict().parse(body);
    return this.db.$transaction(async (tx) => {
      if (await tx.subject.findUnique({ where: { id: b.id } }))
        throw new ConflictException({ code: "SUBJECT_EXISTS", message: `Mã môn "${b.id}" đã tồn tại; không ghi đè` });
      const subject = await tx.subject.create({ data: { id: b.id, name: b.name, ebookUrl: b.ebookUrl ?? null } });
      await audit(tx, {
        actor: req.user,
        action: "subject.create",
        targetType: "Subject",
        targetId: b.id,
        reason: b.reason,
        after: { name: b.name, ebookUrl: b.ebookUrl ?? null },
      });
      return subject;
    });
  }
  @Put("subjects/:id")
  async updateSubject(@Param("id") id: string, @Req() req: any, @Body() body: unknown) {
    const b = z.object({ name: text, ebookUrl, reason: reason.optional() }).strict().parse(body);
    return this.db.$transaction(async (tx) => {
      const before = await tx.subject.findUnique({ where: { id } });
      if (!before) throw notFound("môn học");
      const subject = await tx.subject.update({
        where: { id },
        data: { name: b.name, ...(b.ebookUrl !== undefined ? { ebookUrl: b.ebookUrl } : {}) },
      });
      await audit(tx, {
        actor: req.user,
        action: "subject.update",
        targetType: "Subject",
        targetId: id,
        reason: b.reason,
        before: { name: before.name, ebookUrl: before.ebookUrl },
        after: { name: b.name, ebookUrl: b.ebookUrl ?? before.ebookUrl },
      });
      return subject;
    });
  }
  @Delete("subjects/:id")
  async deleteSubject(@Param("id") id: string, @Req() req: any, @Body() body: unknown) {
    const b = z
      .object({ reason, confirm: z.literal(true) })
      .strict()
      .parse(body ?? {});
    return this.db.$transaction(async (tx) => {
      const subject = await tx.subject.findUnique({ where: { id } });
      if (!subject) throw notFound("môn học");
      const [lessons, labs, chapters] = await Promise.all([
        tx.lesson.count({ where: { subjectId: id } }),
        tx.lab.count({ where: { subjectId: id } }),
        tx.curriculumChapter.count({ where: { subjectId: id } }),
      ]);
      if (lessons + labs + chapters)
        throw new ConflictException({
          code: "SUBJECT_IN_USE",
          message: "Môn học còn bài học, phòng thực hành hoặc chương; không thể xóa",
          details: { lessons, labs, chapters },
        });
      await tx.subject.delete({ where: { id } });
      await audit(tx, {
        actor: req.user,
        action: "subject.delete",
        targetType: "Subject",
        targetId: id,
        reason: b.reason,
        before: { name: subject.name },
      });
      return { deleted: true, id };
    });
  }
  @Post("chapters")
  async createChapter(@Req() req: any, @Body() body: unknown) {
    const b = z
      .object({
        code,
        subjectId: text,
        grade: z.number().int().min(8).max(9),
        domain: domainSchema,
        title: text,
        reason: reason.optional(),
      })
      .strict()
      .parse(body);
    return this.db.$transaction(async (tx) => {
      if (await tx.curriculumChapter.findUnique({ where: { code: b.code } }))
        throw new ConflictException({ code: "CHAPTER_EXISTS", message: `Mã chương "${b.code}" đã tồn tại; không ghi đè` });
      if (!(await tx.subject.findUnique({ where: { id: b.subjectId } }))) throw notFound("môn học");
      const { reason: why, ...data } = b;
      const chapter = await tx.curriculumChapter.create({ data });
      await audit(tx, {
        actor: req.user,
        action: "chapter.create",
        targetType: "CurriculumChapter",
        targetId: b.code,
        reason: why,
        after: { title: b.title, grade: b.grade, domain: b.domain },
      });
      return chapter;
    });
  }
  @Put("chapters/:code")
  async updateChapter(@Param("code") chapterCode: string, @Req() req: any, @Body() body: unknown) {
    const b = z
      .object({ title: text, status: z.enum(["active", "archived"]), reason })
      .strict()
      .parse(body);
    return this.db.$transaction(async (tx) => {
      const before = await tx.curriculumChapter.findUnique({ where: { code: chapterCode } });
      if (!before) throw notFound("chương");
      const chapter = await tx.curriculumChapter.update({ where: { code: chapterCode }, data: { title: b.title, status: b.status } });
      const diff = changedFields(before, chapter);
      await audit(tx, {
        actor: req.user,
        action: "chapter.update",
        targetType: "CurriculumChapter",
        targetId: chapterCode,
        reason: b.reason,
        ...diff,
      });
      return chapter;
    });
  }
  @Post("topics")
  async createTopic(@Req() req: any, @Body() body: unknown) {
    const b = z
      .object({ code, chapterCode: code, title: text, outcomeCodes: z.array(code).max(30).default([]), reason: reason.optional() })
      .strict()
      .parse(body);
    return this.db.$transaction(async (tx) => {
      if (await tx.curriculumTopic.findUnique({ where: { code: b.code } }))
        throw new ConflictException({ code: "TOPIC_EXISTS", message: `Mã chủ đề "${b.code}" đã tồn tại; không ghi đè` });
      const chapter = await tx.curriculumChapter.findUnique({ where: { code: b.chapterCode } });
      if (!chapter || chapter.status !== "active")
        throw new BadRequestException({ code: "CHAPTER_UNAVAILABLE", message: "Chương không tồn tại hoặc đã lưu trữ" });
      await this.assertOutcomes(tx, b.outcomeCodes, chapter, []);
      const { reason: why, ...data } = b;
      const topic = await tx.curriculumTopic.create({ data });
      await audit(tx, {
        actor: req.user,
        action: "topic.create",
        targetType: "CurriculumTopic",
        targetId: b.code,
        reason: why,
        after: { title: b.title, outcomeCodes: b.outcomeCodes },
      });
      return topic;
    });
  }
  @Put("topics/:code")
  async updateTopic(@Param("code") topicCode: string, @Req() req: any, @Body() body: unknown) {
    const b = z
      .object({ title: text, outcomeCodes: z.array(code).max(30), status: z.enum(["active", "archived"]), reason })
      .strict()
      .parse(body);
    return this.db.$transaction(async (tx) => {
      const before = await tx.curriculumTopic.findUnique({ where: { code: topicCode }, include: { chapter: true } });
      if (!before) throw notFound("chủ đề");
      await this.assertOutcomes(tx, b.outcomeCodes, before.chapter, (before.outcomeCodes as string[]) ?? []);
      const topic = await tx.curriculumTopic.update({
        where: { code: topicCode },
        data: { title: b.title, outcomeCodes: b.outcomeCodes, status: b.status },
      });
      const diff = changedFields(before, topic);
      await audit(tx, {
        actor: req.user,
        action: "topic.update",
        targetType: "CurriculumTopic",
        targetId: topicCode,
        reason: b.reason,
        ...diff,
      });
      return topic;
    });
  }
  /** Topic → outcome mapping stays traceable: codes exist, match the chapter's grade/domain and are active (unless already mapped). */
  private async assertOutcomes(tx: any, codes: string[], chapter: { grade: number; domain: string }, kept: string[]) {
    if (new Set(codes).size !== codes.length)
      throw new BadRequestException({ code: "INVALID_OUTCOME", message: "Yêu cầu cần đạt bị trùng" });
    const outcomes = await tx.curriculumOutcome.findMany({ where: { code: { in: codes } } });
    const invalid = codes.filter((c) => {
      const o = outcomes.find((item: any) => item.code === c);
      return !o || o.grade !== chapter.grade || o.domain !== chapter.domain || (o.status !== "active" && !kept.includes(c));
    });
    if (invalid.length)
      throw new BadRequestException({
        code: "INVALID_OUTCOME",
        message: "Yêu cầu cần đạt không tồn tại, đã lưu trữ hoặc khác khối/mạch: " + invalid.join(", "),
        details: { invalid },
      });
  }
  @Post("outcomes")
  async createOutcome(@Req() req: any, @Body() body: unknown) {
    const b = z
      .object({
        code,
        grade: z.number().int().min(8).max(9),
        domain: domainSchema,
        chapter: text,
        statement: z.string().trim().min(5).max(1000),
        reason: reason.optional(),
      })
      .strict()
      .parse(body);
    return this.db.$transaction(async (tx) => {
      if (await tx.curriculumOutcome.findUnique({ where: { code: b.code } }))
        throw new ConflictException({ code: "OUTCOME_EXISTS", message: `Mã yêu cầu cần đạt "${b.code}" đã tồn tại; không ghi đè` });
      const { reason: why, ...data } = b;
      const outcome = await tx.curriculumOutcome.create({ data });
      await audit(tx, {
        actor: req.user,
        action: "outcome.create",
        targetType: "CurriculumOutcome",
        targetId: b.code,
        reason: why,
        after: { grade: b.grade, domain: b.domain },
      });
      return outcome;
    });
  }
  @Put("outcomes/:code")
  @ApiOperation({ summary: "Archive/restore an outcome; its statement changes only while no lesson or topic maps it" })
  async updateOutcome(@Param("code") outcomeCode: string, @Req() req: any, @Body() body: unknown) {
    const b = z
      .object({ statement: z.string().trim().min(5).max(1000), status: z.enum(["active", "archived"]), reason })
      .strict()
      .parse(body);
    return this.db.$transaction(async (tx) => {
      const before = await tx.curriculumOutcome.findUnique({ where: { code: outcomeCode } });
      if (!before) throw notFound("yêu cầu cần đạt");
      if (before.statement !== b.statement) {
        const [lessons, topics] = await Promise.all([
          tx.lesson.count({ where: { outcomeCodes: { array_contains: [outcomeCode] } } }),
          tx.curriculumTopic.count({ where: { outcomeCodes: { array_contains: [outcomeCode] } } }),
        ]);
        if (lessons + topics)
          throw new ConflictException({
            code: "OUTCOME_IN_USE",
            message: "Yêu cầu cần đạt đang được bài học hoặc chủ đề tham chiếu; hãy lưu trữ và tạo mã mới thay vì sửa nội dung",
            details: { lessons, topics },
          });
      }
      const outcome = await tx.curriculumOutcome.update({
        where: { code: outcomeCode },
        data: { statement: b.statement, status: b.status },
      });
      await audit(tx, {
        actor: req.user,
        action: "outcome.update",
        targetType: "CurriculumOutcome",
        targetId: outcomeCode,
        reason: b.reason,
        before: { status: before.status },
        after: { status: outcome.status, statementChanged: before.statement !== outcome.statement },
      });
      return outcome;
    });
  }

  // ───────────────────────── C2-T2 content operations ─────────────────────────
  @Get("content")
  @ApiOperation({ summary: "All lessons with owner, scope, status, active assignments and release blockers" })
  async content(@Query() query: unknown) {
    const q = z
      .object({
        q: z.string().trim().max(100).optional(),
        scope: z.enum(["TEACHER_PRIVATE", "SHARED_LIBRARY"]).optional(),
        status: z.enum(["draft", "published", "archived", "quarantined"]).optional(),
        cursor: z.string().max(200).optional(),
        limit,
      })
      .strict()
      .parse(query ?? {});
    const rows = await this.db.lesson.findMany({
      where: {
        AND: [
          q.q ? { title: { contains: q.q, mode: "insensitive" as const } } : {},
          q.scope ? { scope: q.scope } : {},
          q.status ? { status: q.status } : {},
          cursorWhere(q.cursor),
        ],
      },
      include: { author: { select: { id: true, fullName: true, role: true, status: true } } },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: q.limit + 1,
    });
    const result = page(rows, q.limit);
    const active = await this.db.assignment.groupBy({
      by: ["contentId"],
      where: { contentType: "lesson", status: "ACTIVE", contentId: { in: result.items.map((l) => l.id) } },
      _count: { _all: true },
    });
    return {
      items: result.items.map((lesson) => ({
        id: lesson.id,
        title: lesson.title,
        grade: lesson.grade,
        scope: lesson.scope,
        status: lesson.status,
        synthetic: lesson.synthetic,
        author: lesson.author,
        quarantinedAt: lesson.quarantinedAt,
        quarantineReason: lesson.quarantineReason,
        releaseReview: lesson.releaseReview,
        activeAssignments: active.find((a) => a.contentId === lesson.id)?._count._all ?? 0,
        // Shared releases need named reviews; an admin can see but never fill these gaps by role.
        // Pack lessons passed the content-release gates (CF-T1) instead of the B1 review route.
        packVersionId: lesson.packVersionId,
        releaseBlockers:
          lesson.scope === "SHARED_LIBRARY" && !lesson.packVersionId ? publishBlockers({ ...lesson, status: "published" } as any, "SHARED_LIBRARY") : [],
        createdAt: lesson.createdAt,
      })),
      nextCursor: result.nextCursor,
    };
  }
  private lessonOperationData(lesson: any, action: string, why: string, newOwnerId?: string) {
    if (action === "reassign") return { authorId: newOwnerId };
    if (action === "archive") return { status: "archived", quarantinedAt: null, quarantineReason: null, statusBeforeQuarantine: null };
    if (action === "quarantine")
      return { status: "quarantined", quarantinedAt: new Date(), quarantineReason: why, statusBeforeQuarantine: lesson.status };
    // release: restore the status the lesson had before quarantine.
    return { status: lesson.statusBeforeQuarantine ?? "draft", quarantinedAt: null, quarantineReason: null, statusBeforeQuarantine: null };
  }
  @Post("content/:id/operations")
  @ApiOperation({ summary: "Quarantine, release, archive or reassign a lesson with a reason; never edits its body or evidence" })
  async contentOperation(@Param("id") id: string, @Req() req: any, @Body() body: unknown) {
    const b = z
      .object({
        action: z.enum(["quarantine", "release", "archive", "reassign"]),
        reason,
        newOwnerId: z.string().max(100).optional(),
        acknowledgeActiveAssignments: z.boolean().default(false),
      })
      .strict()
      .parse(body);
    return this.db.$transaction(async (tx) => {
      const lesson = await tx.lesson.findUnique({ where: { id } });
      if (!lesson) throw new NotFoundException({ code: "LESSON_NOT_FOUND", message: "Không tìm thấy bài học" });
      const allowedFrom: Record<string, string[]> = {
        quarantine: ["draft", "published", "archived"],
        release: ["quarantined"],
        archive: ["draft", "published", "quarantined"],
        reassign: ["draft", "published", "archived", "quarantined"],
      };
      if (!allowedFrom[b.action].includes(lesson.status))
        throw new ConflictException({
          code: "INVALID_CONTENT_TRANSITION",
          message: `Không thể ${b.action} bài học ở trạng thái ${lesson.status}`,
        });
      if (b.action === "reassign") {
        const owner = b.newOwnerId ? await tx.user.findUnique({ where: { id: b.newOwnerId } }) : null;
        const ok =
          owner && owner.status === "active" && (owner.role === "TEACHER" || (lesson.scope === "SHARED_LIBRARY" && owner.role === "ADMIN"));
        if (!ok || owner!.id === lesson.authorId)
          throw new BadRequestException({
            code: "INVALID_NEW_OWNER",
            message: "Chủ sở hữu mới phải là giáo viên đang hoạt động (hoặc quản trị viên với nội dung dùng chung)",
          });
      }
      const activeAssignments = await tx.assignment.count({ where: { contentType: "lesson", contentId: id, status: "ACTIVE" } });
      if (["quarantine", "archive"].includes(b.action) && activeAssignments && !b.acknowledgeActiveAssignments)
        throw new ConflictException({
          code: "ACTIVE_ASSIGNMENTS_WARNING",
          message: `Bài học đang được giao trong ${activeAssignments} bài giao còn hiệu lực; học sinh sẽ ${b.action === "quarantine" ? "mất quyền mở bài" : "chỉ tiếp tục được nếu đã bắt đầu"}. Xác nhận để tiếp tục.`,
          details: { activeAssignments },
        });
      const updated = await tx.lesson.update({ where: { id }, data: this.lessonOperationData(lesson, b.action, b.reason, b.newOwnerId) });
      await audit(tx, {
        actor: req.user,
        action: `lesson.${b.action}`,
        targetType: "Lesson",
        targetId: id,
        reason: b.reason,
        before: { status: lesson.status, ownerId: lesson.authorId },
        after: { status: updated.status, ownerId: updated.authorId, activeAssignments },
      });
      return {
        lesson: { id: updated.id, status: updated.status, authorId: updated.authorId, quarantineReason: updated.quarantineReason },
        activeAssignments,
      };
    });
  }

  // ───────────────────────── C2-T3 simulation versions ─────────────────────────
  @Get("labs")
  @ApiOperation({ summary: "Labs with challenges, active configuration version and model allowlist" })
  async labs() {
    const [labs, versions] = await Promise.all([
      this.db.lab.findMany({ include: { challenges: { where: { NOT: { id: { contains: "_v-" } } } } }, orderBy: { id: "asc" } }),
      this.db.simulationConfigVersion.findMany({ orderBy: [{ labId: "asc" }, { version: "desc" }] }),
    ]);
    return labs.map((lab) => ({
      ...lab,
      model: CHALLENGE_PARAMETERS[lab.id] ?? null,
      engineVersion: ENGINE,
      activeVersion: versions.find((v) => v.labId === lab.id && v.status === "active") ?? null,
      versionCount: versions.filter((v) => v.labId === lab.id).length,
    }));
  }
  @Put("labs/:id")
  @ApiOperation({ summary: "Technical availability and labels; scientific configuration changes only through new versions" })
  async updateLab(@Param("id") id: string, @Req() req: any, @Body() body: unknown) {
    const b = z
      .object({ title: text, topic: text, learningObjective: text, status: z.enum(["draft", "published", "archived"]), reason })
      .strict()
      .parse(body);
    return this.db.$transaction(async (tx) => {
      const before = await tx.lab.findUnique({ where: { id } });
      if (!before) throw notFound("phòng thực hành");
      const { reason: why, ...data } = b;
      const lab = await tx.lab.update({ where: { id }, data });
      const diff = changedFields(before, lab);
      await audit(tx, { actor: req.user, action: "lab.update", targetType: "Lab", targetId: id, reason: why, ...diff });
      return lab;
    });
  }
  @Get("labs/:id/versions")
  async versions(@Param("id") labId: string) {
    const lab = await this.db.lab.findUnique({
      where: { id: labId },
      include: { challenges: { where: { NOT: { id: { contains: "_v-" } } } } },
    });
    if (!lab) throw notFound("phòng thực hành");
    const versions = await this.db.simulationConfigVersion.findMany({ where: { labId }, orderBy: { version: "desc" } });
    const pinned = await this.db.attempt.groupBy({
      by: ["configVersionId"],
      where: { configVersionId: { in: versions.map((v) => v.id) } },
      _count: { _all: true },
    });
    return {
      lab: {
        id: lab.id,
        title: lab.title,
        status: lab.status,
        challenges: lab.challenges.map((c) => ({ id: c.id, objective: c.objective })),
      },
      model: CHALLENGE_PARAMETERS[labId] ?? null,
      templates: goldenTemplates(labId),
      versions: versions.map((v) => ({ ...v, attempts: pinned.find((p) => p.configVersionId === v.id)?._count._all ?? 0 })),
    };
  }
  @Post("labs/:id/versions")
  @ApiOperation({ summary: "Store a new draft configuration version after validation and golden cases pass" })
  async createVersion(@Param("id") labId: string, @Req() req: any, @Body() body: unknown) {
    const input = versionInputSchema.parse(body);
    const lab = await this.db.lab.findUnique({
      where: { id: labId },
      include: { challenges: { where: { NOT: { id: { contains: "_v-" } } } } },
    });
    if (!lab) throw notFound("phòng thực hành");
    const spec = CHALLENGE_PARAMETERS[labId];
    const errors = versionErrors(
      labId,
      lab.challenges.map((c) => c.id),
      input,
    );
    if (spec && lab.simulationModelRef && !spec.modelRef.startsWith(lab.simulationModelRef.split("@")[0]))
      errors.push(`Mô hình của phòng (${lab.simulationModelRef}) không khớp danh sách cho phép (${spec.modelRef})`);
    if (errors.length)
      throw new UnprocessableEntityException({ code: "INVALID_SIMULATION_CONFIG", message: errors.join("; "), details: { errors } });
    const golden = goldenCaseResults(labId, input);
    if (golden.some((g) => !g.ok))
      throw new UnprocessableEntityException({
        code: "GOLDEN_CASE_MISMATCH",
        message: "Có ca mẫu không cho kết quả như mong đợi trên máy chủ",
        details: { golden },
      });
    return this.db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"nexalab:sim-version:" + labId}))`;
      const last = await tx.simulationConfigVersion.findFirst({
        where: { labId },
        orderBy: { version: "desc" },
        select: { version: true },
      });
      const version = await tx.simulationConfigVersion.create({
        data: {
          labId,
          version: (last?.version ?? 0) + 1,
          modelRef: spec!.modelRef,
          challengeParams: input.challengeParams,
          goldenCases: input.goldenCases.map((g, i) => ({ ...g, actual: golden[i].actual })) as any,
          reason: input.reason,
          createdById: req.user.sub,
        },
      });
      await audit(tx, {
        actor: req.user,
        action: "simulation.version.create",
        targetType: "SimulationConfigVersion",
        targetId: version.id,
        reason: input.reason,
        after: { labId, version: version.version, modelRef: version.modelRef, status: "draft", goldenCases: golden.length },
      });
      return { ...version, golden };
    });
  }
  @Post("labs/:id/versions/:version/activate")
  @ApiOperation({ summary: "Activate a draft version for future attempts; the previous active version is retired, never rewritten" })
  async activateVersion(@Param("id") labId: string, @Param("version") versionParam: string, @Req() req: any, @Body() body: unknown) {
    const b = z
      .object({ reason })
      .strict()
      .parse(body ?? {});
    const number = z.coerce.number().int().min(1).parse(versionParam);
    return this.db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"nexalab:sim-version:" + labId}))`;
      const version = await tx.simulationConfigVersion.findUnique({ where: { labId_version: { labId, version: number } } });
      if (!version) throw notFound("phiên bản cấu hình");
      if (version.status !== "draft")
        throw new ConflictException({
          code: "VERSION_NOT_DRAFT",
          message: "Chỉ kích hoạt được phiên bản nháp; phiên bản đã dùng là bất biến",
        });
      const now = new Date();
      const previous = await tx.simulationConfigVersion.findFirst({ where: { labId, status: "active" } });
      if (previous) await tx.simulationConfigVersion.update({ where: { id: previous.id }, data: { status: "retired", retiredAt: now } });
      const active = await tx.simulationConfigVersion.update({ where: { id: version.id }, data: { status: "active", activatedAt: now } });
      await audit(tx, {
        actor: req.user,
        action: "simulation.version.activate",
        targetType: "SimulationConfigVersion",
        targetId: version.id,
        reason: b.reason,
        before: { version: previous?.version ?? null },
        after: { labId, version: active.version, status: "active" },
      });
      return active;
    });
  }
  @Get("attempts/:id/reproduce")
  @ApiOperation({ summary: "Re-evaluate a historical attempt with the version it pinned" })
  async reproduce(@Param("id") id: string) {
    const attempt = await this.db.attempt.findUnique({ where: { id }, include: { challenge: true } });
    if (!attempt) throw notFound("lần thực hành");
    const version = attempt.configVersionId
      ? await this.db.simulationConfigVersion.findUnique({ where: { id: attempt.configVersionId } })
      : null;
    const params =
      (attempt.challenge.id.includes("_v-") ? null : versionParams(version, attempt.challengeId)) ??
      (attempt.challenge.constraints as any)?.params;
    let reproduced: string;
    try {
      reproduced = evaluate(attempt.challenge.labId, attempt.labState, params).verdict;
    } catch {
      reproduced = "invalid";
    }
    return {
      attemptId: id,
      challengeId: attempt.challengeId,
      engineVersion: attempt.simulationModelVersion,
      configVersion: version ? { id: version.id, version: version.version, status: version.status } : null,
      packVersionId: attempt.packVersionId,
      originalVerdict: attempt.verdict,
      reproducedVerdict: reproduced,
      matches: reproduced === attempt.verdict,
    };
  }

  // ───────────────────────── C2-T3 practical activities and simulation packs (CF-T4) ─────────────────────────
  @Get("practicals")
  async practicals() {
    return this.db.practicalActivityVersion.findMany({ orderBy: [{ key: "asc" }, { version: "desc" }] });
  }
  @Post("practicals")
  @ApiOperation({ summary: "Store an immutable reviewed practical activity version (same content → same version)" })
  async createPractical(@Req() req: any, @Body() body: unknown) {
    const spec = activitySpecSchema.parse(body);
    const digest = activityDigest(spec);
    return this.db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"nexalab:practical:" + spec.key}))`;
      const same = await tx.practicalActivityVersion.findUnique({ where: { key_digest: { key: spec.key, digest } } });
      if (same) return { ...same, unchanged: true };
      const outcomes = await tx.curriculumOutcome.findMany({ where: { code: { in: spec.outcomeCodes } } });
      if (outcomes.length !== spec.outcomeCodes.length)
        throw new BadRequestException({ code: "INVALID_OUTCOME", message: "Hoạt động gắn yêu cầu cần đạt không có trong bản đồ chương trình" });
      const last = await tx.practicalActivityVersion.findFirst({ where: { key: spec.key }, orderBy: { version: "desc" }, select: { version: true } });
      const { reviews, ...rest } = spec;
      const created = await tx.practicalActivityVersion.create({
        data: { key: spec.key, version: (last?.version ?? 0) + 1, digest, spec: rest as any, reviews: reviews as any, createdById: req.user.sub },
      });
      await audit(tx, { actor: req.user, action: "practical.version.create", targetType: "PracticalActivityVersion", targetId: created.id, after: { version: created.version } });
      return created;
    });
  }
  @Get("labs/:id/packs")
  async labPacks(@Param("id") labId: string) {
    const [lab, packs] = await Promise.all([
      this.db.lab.findUnique({ where: { id: labId }, select: { id: true, title: true, simulationModelRef: true } }),
      this.db.simulationPackVersion.findMany({ where: { labId }, orderBy: [{ key: "asc" }, { version: "desc" }] }),
    ]);
    if (!lab) throw notFound("phòng thực hành");
    const pinned = await this.db.attempt.groupBy({ by: ["packVersionId"], where: { packVersionId: { in: packs.map((p) => p.id) } }, _count: { _all: true } });
    return {
      lab,
      model: MODEL_REGISTRY[lab.simulationModelRef] ? { modelRef: lab.simulationModelRef, ...MODEL_REGISTRY[lab.simulationModelRef], simulate: undefined } : null,
      packs: packs.map((p) => ({ ...p, attempts: pinned.find((x) => x.packVersionId === p.id)?._count._all ?? 0 })),
    };
  }
  @Post("sim-packs")
  @ApiOperation({ summary: "Validate and store a draft topic simulation pack version; golden cases run before any visual check" })
  async createSimPack(@Req() req: any, @Body() body: unknown) {
    const input = packInputSchema.parse(body);
    const [lab, activity, visual] = await Promise.all([
      this.db.lab.findUnique({ where: { id: input.labId } }),
      this.db.practicalActivityVersion.findUnique({ where: { id: input.activityVersionId } }),
      input.visualAssetVersionId ? this.db.assetVersion.findUnique({ where: { id: input.visualAssetVersionId }, include: { asset: true } }) : null,
    ]);
    if (!lab) throw notFound("phòng thực hành");
    const glb = (visual?.validation as any)?.glb ?? null;
    const visualReady = Boolean(visual && visual.status === "READY" && visual.asset.kind === "model" && visual.asset.status === "ACTIVE" && glb?.ok);
    const { errors, golden } = packValidation(input, { labModelRef: lab.simulationModelRef, activity: activity ? { spec: activity.spec } : null, glb, visualReady });
    if (errors.length) throw new UnprocessableEntityException({ code: "SIM_PACK_INVALID", message: errors.join("; "), details: { errors, golden } });
    return this.db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"nexalab:sim-pack:" + input.key}))`;
      const last = await tx.simulationPackVersion.findFirst({ where: { key: input.key }, orderBy: { version: "desc" }, select: { version: true } });
      const model = resolveModel(input.modelRef);
      const created = await tx.simulationPackVersion.create({
        data: {
          key: input.key,
          version: (last?.version ?? 0) + 1,
          labId: input.labId,
          modelRef: input.modelRef,
          engineVersion: model.engineVersion,
          activityVersionId: input.activityVersionId,
          template: input.template as any,
          visualAssetVersionId: input.visualAssetVersionId,
          semanticMap: input.semanticMap,
          bindings: input.bindings as any,
          challengeTemplates: input.challengeTemplates as any,
          reviews: { ...input.reviews, ...(input.rangeApproval ? { rangeApproval: input.rangeApproval } : {}) } as any,
          validation: { golden, glbNodes: glb?.nodes ?? null } as any,
          reason: input.reason,
          createdById: req.user.sub,
        },
      });
      await audit(tx, {
        actor: req.user,
        action: "simulation.pack.create",
        targetType: "SimulationPackVersion",
        targetId: created.id,
        reason: input.reason,
        after: { labId: input.labId, version: created.version, modelRef: input.modelRef, goldenCases: golden.length, status: "draft" },
      });
      return { ...created, golden };
    });
  }
  @Post("sim-packs/:id/activate")
  @ApiOperation({ summary: "Activate a draft pack for future attempts; the previous active pack retires, never rewritten" })
  async activateSimPack(@Param("id") id: string, @Req() req: any, @Body() body: unknown) {
    const b = z.object({ reason }).strict().parse(body ?? {});
    return this.db.$transaction(async (tx) => {
      const pack = await tx.simulationPackVersion.findUnique({ where: { id } });
      if (!pack) throw notFound("gói mô phỏng");
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"nexalab:sim-pack-lab:" + pack.labId}))`;
      if (pack.status !== "draft") throw new ConflictException({ code: "PACK_NOT_DRAFT", message: "Chỉ kích hoạt được gói ở trạng thái nháp; gói đã dùng là bất biến" });
      if (["pilot", "production"].includes(storageEnv()) && !(pack.reviews as any)?.rangeApproval)
        throw new ConflictException({ code: "RANGE_APPROVAL_REQUIRED", message: "Khoảng tham số của mô hình chưa được duyệt (Q-C2-04)" });
      const previous = await tx.simulationPackVersion.findFirst({ where: { labId: pack.labId, status: "active" } });
      const now = new Date();
      if (previous) await tx.simulationPackVersion.update({ where: { id: previous.id }, data: { status: "retired", retiredAt: now } });
      const active = await tx.simulationPackVersion.update({ where: { id }, data: { status: "active", activatedAt: now } });
      await audit(tx, {
        actor: req.user,
        action: "simulation.pack.activate",
        targetType: "SimulationPackVersion",
        targetId: id,
        reason: b.reason,
        before: { version: previous?.version ?? null },
        after: { labId: pack.labId, version: pack.version, status: "active" },
      });
      return active;
    });
  }

  // ───────────────────────── C2-T5 assets (CF-T2 versions in object storage) ─────────────────────────
  @Get("assets")
  async assets(@Query() query: unknown) {
    const q = z
      .object({
        status: z.enum(["ACTIVE", "QUARANTINED", "ARCHIVED"]).optional(),
        scope: z.enum(["TEACHER_PRIVATE", "SHARED_LIBRARY"]).optional(),
        ownerId: z.string().max(100).optional(),
        cursor: z.string().max(200).optional(),
        limit,
      })
      .strict()
      .parse(query ?? {});
    const rows = await this.db.asset.findMany({
      where: {
        AND: [q.status ? { status: q.status } : {}, q.scope ? { scope: q.scope } : {}, q.ownerId ? { ownerId: q.ownerId } : {}, cursorWhere(q.cursor)],
      },
      include: { versions: { orderBy: { version: "desc" } } },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: q.limit + 1,
    });
    const result = page(rows, q.limit);
    const owners = await this.db.user.findMany({
      where: { id: { in: [...new Set(result.items.map((a) => a.ownerId).filter((id): id is string => Boolean(id)))] } },
      select: { id: true, fullName: true, role: true, status: true },
    });
    return {
      items: await Promise.all(
        result.items.map(async ({ versions, ...asset }) => ({
          ...asset,
          owner: owners.find((o) => o.id === asset.ownerId) ?? null,
          versions: versions.map((v) => ({
            id: v.id,
            version: v.version,
            status: v.status,
            storage: v.storage,
            fileName: v.fileName,
            mime: v.mime,
            bytes: v.bytes ?? v.declaredBytes,
            sha256: v.sha256,
            failureReason: v.failureReason,
            createdAt: v.createdAt,
            readyAt: v.readyAt,
          })),
          references: await assetReferences(this.db, { versionIds: versions.map((v) => v.id), legacyFileId: asset.legacyFileId }),
        })),
      ),
      nextCursor: result.nextCursor,
    };
  }
  @Post("assets/:id/operations")
  @ApiOperation({ summary: "Quarantine, release, reassign or share an asset with a reason; versions stay immutable" })
  async assetOperation(@Param("id") id: string, @Req() req: any, @Body() body: unknown) {
    const b = z
      .discriminatedUnion("action", [
        z.object({ action: z.literal("quarantine"), reason }).strict(),
        z.object({ action: z.literal("release"), reason }).strict(),
        z.object({ action: z.literal("reassign"), reason, newOwnerId: z.string().max(100) }).strict(),
        // Shared scope needs explicit rights metadata; the admin records it, it is not a scientific review.
        z.object({ action: z.literal("share"), reason, license: z.enum(LICENSES), source: z.string().trim().min(3).max(300) }).strict(),
      ])
      .parse(body);
    return this.db.$transaction(async (tx) => {
      const asset = await tx.asset.findUnique({ where: { id }, include: { versions: { where: { status: "READY" } } } });
      if (!asset) throw notFound("tệp");
      let data: Record<string, unknown>;
      if (b.action === "quarantine") {
        if (asset.status === "QUARANTINED") throw new ConflictException({ code: "ALREADY_QUARANTINED", message: "Tệp đã bị cách ly" });
        data = { status: "QUARANTINED", quarantinedAt: new Date(), quarantineReason: b.reason };
      } else if (b.action === "release") {
        if (asset.status !== "QUARANTINED") throw new ConflictException({ code: "NOT_QUARANTINED", message: "Tệp không bị cách ly" });
        data = { status: "ACTIVE", quarantinedAt: null, quarantineReason: null };
      } else if (b.action === "reassign") {
        const owner = await tx.user.findUnique({ where: { id: b.newOwnerId } });
        if (!owner || owner.status !== "active" || !["TEACHER", "ADMIN"].includes(owner.role) || owner.id === asset.ownerId)
          throw new BadRequestException({ code: "INVALID_NEW_OWNER", message: "Chủ sở hữu mới phải là giáo viên hoặc quản trị viên đang hoạt động" });
        data = { ownerId: owner.id };
      } else {
        if (asset.status !== "ACTIVE") throw new ConflictException({ code: "ASSET_QUARANTINED", message: "Tệp đang bị cách ly hoặc lưu trữ" });
        if (!asset.versions.some((v) => v.sha256))
          throw new ConflictException({ code: "ASSET_NOT_READY", message: "Tệp chưa có phiên bản sẵn sàng đã kiểm checksum" });
        data = { scope: "SHARED_LIBRARY", license: b.license, source: b.source, attribution: b.source };
      }
      const updated = await tx.asset.update({ where: { id }, data });
      await audit(tx, {
        actor: req.user,
        action: `asset.${b.action}`,
        targetType: "Asset",
        targetId: id,
        reason: b.reason,
        before: { status: asset.status, scope: asset.scope, ownerId: asset.ownerId },
        after: { status: updated.status, scope: updated.scope, ownerId: updated.ownerId, license: updated.license },
      });
      return updated;
    });
  }
  @Delete("assets/:id")
  @ApiOperation({ summary: "Delete an asset and its stored versions only when no lesson, step or lab references any version" })
  async deleteAsset(@Param("id") id: string, @Req() req: any, @Body() body: unknown) {
    const b = z
      .object({ reason, confirm: z.literal(true) })
      .strict()
      .parse(body ?? {});
    const deleted = await this.db.$transaction(async (tx) => {
      const asset = await tx.asset.findUnique({ where: { id }, include: { versions: true } });
      if (!asset) throw notFound("tệp");
      const references = await assetReferences(tx, { versionIds: asset.versions.map((v) => v.id), legacyFileId: asset.legacyFileId });
      if (references.lessons.length || references.labs.length)
        throw new ConflictException({
          code: "ASSET_REFERENCED",
          message: "Tệp đang được bài học hoặc phòng thực hành tham chiếu; không thể xóa",
          details: references,
        });
      await tx.assetVersion.deleteMany({ where: { assetId: id } });
      await tx.asset.delete({ where: { id } });
      await audit(tx, {
        actor: req.user,
        action: "asset.delete",
        targetType: "Asset",
        targetId: id,
        reason: b.reason,
        before: { status: asset.status, scope: asset.scope, version: asset.versions.length },
      });
      return asset;
    });
    // Rows go first; a leftover object is unreachable, never a broken reference.
    const s = storage();
    for (const v of deleted.versions) for (const key of [v.objectKey, v.stagingKey]) if (key) await s.delete(key).catch(() => undefined);
    return { deleted: true, id };
  }

  // ───────────────────────── C2-T5 sources and ingestion (CF-T3) ─────────────────────────
  @Get("sources")
  @ApiOperation({ summary: "Source policy registry with current policy, enabled state, preflight problems and recent runs" })
  async sources() {
    const rows = await this.db.sourcePolicy.findMany({ include: { versions: { orderBy: { version: "desc" } } }, orderBy: { key: "asc" } });
    const runs = await this.db.ingestionRun.findMany({ orderBy: { startedAt: "desc" }, take: 50 });
    return rows.map(({ versions, ...source }) => {
      const current = versions.find((v) => v.version === source.currentVersion) ?? versions[0];
      const policy = sourcePolicySchema.safeParse(current?.policy);
      return {
        ...source,
        policy: current?.policy ?? null,
        versions: versions.map((v) => ({ id: v.id, version: v.version, reason: v.reason, createdAt: v.createdAt })),
        problems: policy.success ? preFetchProblems(policy.data, source.enabled) : ["chính sách không hợp lệ"],
        runs: runs.filter((r) => r.sourceKey === source.key).slice(0, 5),
      };
    });
  }
  @Post("sources")
  async createSource(@Req() req: any, @Body() body: unknown) {
    const b = z
      .object({ key: z.string().regex(/^[a-z0-9][a-z0-9-]{1,59}$/), title: text, policy: sourcePolicySchema, reason })
      .strict()
      .parse(body);
    return this.db.$transaction(async (tx) => {
      if (await tx.sourcePolicy.findUnique({ where: { key: b.key } })) throw new ConflictException({ code: "SOURCE_EXISTS", message: `Nguồn "${b.key}" đã tồn tại` });
      // New sources start disabled: enabling is a separate, audited decision.
      await tx.sourcePolicy.create({ data: { key: b.key, title: b.title, enabled: false, currentVersion: 1 } });
      await tx.sourcePolicyVersion.create({ data: { key: b.key, version: 1, policy: b.policy, reason: b.reason, createdById: req.user.sub } });
      await audit(tx, { actor: req.user, action: "source.create", targetType: "SourcePolicy", targetId: b.key, reason: b.reason, after: { version: 1, status: "disabled" } });
      return { key: b.key, version: 1, enabled: false };
    });
  }
  @Put("sources/:key")
  @ApiOperation({ summary: "New policy version; affects only later ingestion runs" })
  async updateSource(@Param("key") key: string, @Req() req: any, @Body() body: unknown) {
    const b = z.object({ policy: sourcePolicySchema, reason }).strict().parse(body);
    return this.db.$transaction(async (tx) => {
      const source = await tx.sourcePolicy.findUnique({ where: { key } });
      if (!source) throw notFound("nguồn");
      const version = source.currentVersion + 1;
      await tx.sourcePolicyVersion.create({ data: { key, version, policy: b.policy, reason: b.reason, createdById: req.user.sub } });
      await tx.sourcePolicy.update({ where: { key }, data: { currentVersion: version } });
      await audit(tx, { actor: req.user, action: "source.update", targetType: "SourcePolicy", targetId: key, reason: b.reason, before: { version: source.currentVersion }, after: { version } });
      return { key, version };
    });
  }
  @Post("sources/:key/enable")
  enableSource(@Param("key") key: string, @Req() req: any, @Body() body: unknown) {
    return this.toggleSource(key, "enable", req, body);
  }
  @Post("sources/:key/disable")
  disableSource(@Param("key") key: string, @Req() req: any, @Body() body: unknown) {
    return this.toggleSource(key, "disable", req, body);
  }
  private async toggleSource(key: string, state: "enable" | "disable", req: any, body: unknown) {
    const b = z.object({ reason }).strict().parse(body ?? {});
    return this.db.$transaction(async (tx) => {
      const source = await tx.sourcePolicy.findUnique({ where: { key }, include: { versions: { orderBy: { version: "desc" }, take: 1 } } });
      if (!source) throw notFound("nguồn");
      if (state === "enable") {
        const policy = sourcePolicySchema.parse(source.versions[0].policy);
        const problems = preFetchProblems(policy, true);
        if (problems.length) throw new ConflictException({ code: "SOURCE_NOT_READY", message: "Chưa thể bật nguồn: " + problems.join("; "), details: { problems } });
      }
      const updated = await tx.sourcePolicy.update({ where: { key }, data: { enabled: state === "enable" } });
      await audit(tx, { actor: req.user, action: `source.${state}`, targetType: "SourcePolicy", targetId: key, reason: b.reason, before: { active: source.enabled }, after: { active: updated.enabled } });
      return updated;
    });
  }
  @Post("sources/:key/runs")
  @ApiOperation({ summary: "Run a bounded ingestion pass; candidates are staged, never published" })
  async runSource(@Param("key") key: string, @Req() req: any, @Body() body: unknown) {
    const b = z
      .object({
        reason,
        items: z
          .array(z.object({ externalId: z.string().trim().min(1).max(200), url: z.string().url().max(500).optional(), locator: z.string().max(300).optional() }).strict())
          .min(1)
          .max(20),
      })
      .strict()
      .parse(body);
    const source = await this.db.sourcePolicy.findUnique({ where: { key }, include: { versions: { orderBy: { version: "desc" }, take: 1 } } });
    if (!source) throw notFound("nguồn");
    const run = await runIngestion(this.db, source, source.versions[0], { items: b.items }, req.user);
    await this.db.$transaction((tx) =>
      audit(tx, { actor: req.user, action: "source.ingest", targetType: "IngestionRun", targetId: run.id, reason: b.reason, after: { status: run.status, references: run.items.length } }),
    );
    return run;
  }
  @Get("ingestion/runs/:id")
  async ingestionRun(@Param("id") id: string) {
    const run = await this.db.ingestionRun.findUnique({ where: { id }, include: { items: { orderBy: { createdAt: "asc" } } } });
    if (!run) throw notFound("lượt nhập liệu");
    return run;
  }

  // ───────────────────────── content packs, coverage and releases (CF-T1/T3/T5) ─────────────────────────
  @Get("content/packs")
  async packs() {
    const packs = await this.db.contentPack.findMany({
      include: { versions: { orderBy: { version: "desc" }, select: { id: true, version: true, status: true, digest: true, lessonId: true, releaseId: true, releasedAt: true, retiredAt: true, synthetic: true, outcomeCodes: true } } },
      orderBy: { key: "asc" },
    });
    return packs;
  }
  @Get("content/coverage")
  @ApiOperation({ summary: "Five separate coverage dimensions per grade × domain; synthetic fixtures reported apart" })
  async coverage() {
    const [outcomes, versions, labs] = await Promise.all([
      this.db.curriculumOutcome.findMany(),
      this.db.contentPackVersion.findMany({ where: { status: "released" } }),
      this.db.lab.findMany({ where: { status: "published" }, select: { id: true } }),
    ]);
    return {
      note: "Mẫu số của bản đồ chính thức để trống cho tới khi danh mục yêu cầu cần đạt lớp 8–9 được duyệt (CF-T5).",
      rows: coverageReport(
        outcomes,
        versions.map((v) => ({ manifest: v.manifest as any, synthetic: v.synthetic })),
        new Set(labs.map((l) => l.id)),
      ),
    };
  }
  @Get("releases")
  async releases() {
    return this.db.contentRelease.findMany({ include: { items: true }, orderBy: { createdAt: "desc" }, take: 50 });
  }
  @Post("releases/plan")
  @ApiOperation({ summary: "Dry run of a release manifest: exact changes and every blocking gate; writes nothing" })
  async planManifest(@Req() req: any, @Body() body: unknown) {
    const b = z.object({ manifest: z.unknown() }).strict().parse(body);
    const plan = await planRelease(this.db, b.manifest, storageEnv());
    await this.db.$transaction((tx) => audit(tx, { actor: req.user, action: "content.release.plan", targetType: "ContentRelease", reason: plan.name, after: { status: plan.blocked ? "blocked" : "ok" } }));
    return plan;
  }
  @Post("releases/:id/retire")
  @ApiOperation({ summary: "Retire a release: its lessons archive (evidence kept) and superseded versions return" })
  async retire(@Param("id") id: string, @Req() req: any, @Body() body: unknown) {
    const b = z.object({ reason, confirm: z.literal(true) }).strict().parse(body ?? {});
    try {
      return await retireRelease(this.db, id, req.user, b.reason);
    } catch (error: any) {
      if (error?.message === "RELEASE_NOT_FOUND") throw notFound("đợt phát hành");
      if (error?.message === "RELEASE_NOT_APPLIED") throw new ConflictException({ code: "RELEASE_NOT_APPLIED", message: "Đợt phát hành đã được gỡ" });
      throw error;
    }
  }

  // ───────────────────────── C2-T6 audit explorer ─────────────────────────
  @Get("audit")
  @ApiOperation({ summary: "Paginated, filtered, redacted audit read; the read itself is audited" })
  async auditLog(@Req() req: any, @Query() query: unknown) {
    const q = z
      .object({
        actorId: z.string().max(100).optional(),
        action: z.string().max(100).optional(),
        targetType: z.string().max(100).optional(),
        targetId: z.string().max(100).optional(),
        outcome: z.enum(["success", "denied", "failure"]).optional(),
        from: z.coerce.date().optional(),
        to: z.coerce.date().optional(),
        cursor: z.string().max(200).optional(),
        limit,
      })
      .strict()
      .parse(query ?? {});
    const where = {
      AND: [
        q.actorId ? { actorId: q.actorId } : {},
        q.action ? { action: { startsWith: q.action } } : {},
        q.targetType ? { targetType: q.targetType } : {},
        q.targetId ? { targetId: q.targetId } : {},
        q.outcome ? { outcome: q.outcome } : {},
        q.from || q.to ? { createdAt: { ...(q.from ? { gte: q.from } : {}), ...(q.to ? { lte: q.to } : {}) } } : {},
        cursorWhere(q.cursor),
      ],
    };
    const filters = Object.entries(q)
      .filter(([key, value]) => value !== undefined && !["cursor", "limit"].includes(key))
      .map(([key, value]) => `${key}=${value instanceof Date ? value.toISOString() : value}`)
      .join(" ");
    return this.db.$transaction(async (tx) => {
      const rows = await tx.auditLog.findMany({ where, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: q.limit + 1 });
      const result = page(rows, q.limit);
      const actors = await tx.user.findMany({
        where: { id: { in: [...new Set(result.items.map((r) => r.actorId).filter((v): v is string => Boolean(v)))] } },
        select: { id: true, fullName: true, role: true },
      });
      await audit(tx, {
        actor: req.user,
        action: "audit.read",
        targetType: "AuditLog",
        reason: filters || "no filter",
        after: { resultCount: result.items.length },
      });
      return {
        // Stored diffs are already allowlisted; they pass the allowlist again so nothing protected renders.
        items: result.items.map((row) => ({
          ...row,
          actor: actors.find((a) => a.id === row.actorId) ?? null,
          before: auditDiff(row.before as any),
          after: auditDiff(row.after as any),
        })),
        nextCursor: result.nextCursor,
      };
    });
  }
}
