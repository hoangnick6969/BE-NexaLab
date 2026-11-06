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
  Query,
  Req,
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { z } from "zod";
import { cursorWhere, limit, page, reason } from "../../../common/admin-api";
import { Roles } from "../../../common/decorators";
import { audit } from "../../../common/audit";
import { Db } from "../../../db/db";
import { publishBlockers } from "../application/lesson-content";
import { lessonOperationData } from "../application/lesson-moderation";
import { syncLibraryLessonFingerprints } from "../../ai/application/question-fingerprints";

/**
 * Epic C2 admin console API. Every route is ADMIN-only (other roles get 403 from
 * the guard), every mutation and every audit read writes an AuditLog row in the
 * same transaction, and no operation edits evidence or attests a review.
 */
@ApiTags("Admin")
@ApiBearerAuth()
@Roles("ADMIN")
@Controller("admin")
export class AdminLessonsController {
  constructor(@Inject(Db) private db: Db) {}

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
      const updated = await tx.lesson.update({ where: { id }, data: lessonOperationData(lesson, b.action, b.reason, b.newOwnerId) });
      await syncLibraryLessonFingerprints(tx, id);
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
}
