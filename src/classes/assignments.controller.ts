import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
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
import { z } from "zod";
import { Roles } from "../common/decorators";
import { isOverdue, ownedClass, targetHash } from "./class-access";
import { MSG, classArchived, lock, reason, text } from "./class-common";
import { audit } from "../common/audit";
import { idempotent, readIdempotencyKey } from "../common/idempotency";
import { Db } from "../infra/db";
import { labVersion, lessonVersion } from "../lessons/lesson-content";

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
export class AssignmentsController {
  constructor(@Inject(Db) private db: Db) {}

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
            select: { id: true, title: true, content: true, materials: true, questions: true, labId: true, challengeParams: true },
          })
        : await tx.lab.findFirst({
            where: { id: contentId, status: "published" },
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
        contentVersion: content.version,
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
          contentVersion: content.version,
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
          contentVersion: content.version,
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
