import { Body, ConflictException, Controller, Get, Inject, Param, Post, Put, Req } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { z } from "zod";
import { notFound, reason, text } from "../../../common/admin-api";
import { Roles } from "../../../common/decorators";
import { audit } from "../../../common/audit";
import { coverageReport } from "../application/content-pack";
import { planRelease, retireRelease } from "../application/content-release";
import { preFetchProblems, runIngestion, sourcePolicySchema } from "../application/ingestion";
import { importStructuredLessons as importStructuredLessonDrafts, structuredLessonSchema } from "../application/structured-lesson-import";
import { Db } from "../../../db/db";
import { storageEnv } from "../../storage/infrastructure/storage";

/**
 * Epic C2 admin console API. Every route is ADMIN-only (other roles get 403 from
 * the guard), every mutation and every audit read writes an AuditLog row in the
 * same transaction, and no operation edits evidence or attests a review.
 */
@ApiTags("Admin")
@ApiBearerAuth()
@Roles("ADMIN")
@Controller("admin")
export class AdminContentController {
  constructor(@Inject(Db) private db: Db) {}

  @Post("structured-lessons/import")
  @ApiOperation({ summary: "Import Content Tool Structured Lesson candidates as private, idempotent drafts" })
  async importStructuredLessons(@Body() body: unknown) {
    const b = z.object({ lessons: z.array(structuredLessonSchema).min(1).max(100) }).strict().parse(body);
    return importStructuredLessonDrafts(this.db, b.lessons);
  }

  @Get("structured-lessons/drafts/:id")
  @ApiOperation({ summary: "Read back an imported private Structured Lesson draft" })
  async structuredLessonDraft(@Param("id") id: string) {
    const draft = await this.db.contentPackVersion.findUnique({
      where: { id },
      select: { id: true, packKey: true, version: true, digest: true, manifest: true, status: true, synthetic: true },
    });
    if (!draft || draft.status !== "draft" || !draft.synthetic) throw notFound("bản nháp Structured Lesson");
    const manifest = structuredLessonSchema.safeParse(draft.manifest);
    if (!manifest.success) throw notFound("bản nháp Structured Lesson");
    return { ...draft, manifest: manifest.data };
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
}
