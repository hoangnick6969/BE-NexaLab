import { Controller, Get, Inject, Query, Req } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { z } from "zod";
import { cursorWhere, limit, page } from "../common/admin-api";
import { Roles } from "../common/decorators";
import { audit, auditDiff } from "../common/audit";
import { Db } from "../infra/db";

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
