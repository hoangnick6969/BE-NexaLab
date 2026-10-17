import { BadRequestException, Body, ConflictException, Controller, Delete, Get, Inject, Param, Post, Query, Req } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { z } from "zod";
import { cursorWhere, limit, notFound, page, reason } from "../common/admin-api";
import { assetReferences } from "./asset-versions";
import { Roles } from "../common/decorators";
import { audit } from "../common/audit";
import { Db } from "../infra/db";
import { storage } from "../infra/storage";
import { LICENSES } from "../lessons/lesson-content";

/**
 * Epic C2 admin console API. Every route is ADMIN-only (other roles get 403 from
 * the guard), every mutation and every audit read writes an AuditLog row in the
 * same transaction, and no operation edits evidence or attests a review.
 */
@ApiTags("Admin")
@ApiBearerAuth()
@Roles("ADMIN")
@Controller("admin")
export class AdminAssetsController {
  constructor(@Inject(Db) private db: Db) {}

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
}
