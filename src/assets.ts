import {
  Inject,
  Body,
  Controller,
  Get,
  Post,
  Put,
  Param,
  Query,
  Req,
  Res,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from "@nestjs/common";
import { ApiTags, ApiBearerAuth, ApiOperation } from "@nestjs/swagger";
import { z } from "zod";
import { createHash } from "node:crypto";
import { Db } from "./db";
import { Public, Roles } from "./auth";
import { audit } from "./audit";
import { LICENSES } from "./content";
import { PART_SIZE, SINGLE_PUT_LIMIT, inspectGlb, inspectVtt, mediaTypeFor, scanStatus, uploadsEnabled } from "./media";
import { localStorage, objectKeys, readTtl, storage, uploadTtl, verifyLocalGrant } from "./storage";

/** `assetv:<versionId>` is how content pins an immutable asset version. */
export const ASSET_VERSION_REF = /^assetv:([a-z0-9]{20,40})$/;
export const assetVersionIds = (urls: string[]) =>
  urls.map((url) => url.match(ASSET_VERSION_REF)?.[1]).filter((id): id is string => Boolean(id));
const UPLOAD_WINDOW_MS = 24 * 3600 * 1000;
const MAX_PENDING_PER_USER = 20;

export const initSchema = z
  .object({
    fileName: z.string().trim().min(1).max(200),
    mime: z.string().trim().max(100),
    bytes: z.number().int().min(1),
    title: z.string().trim().min(1).max(200).optional(),
    /** New version of an asset the caller manages; omitted creates a new asset. */
    assetId: z.string().max(40).optional(),
    scope: z.enum(["TEACHER_PRIVATE", "SHARED_LIBRARY"]).default("TEACHER_PRIVATE"),
    license: z.enum(LICENSES).optional(),
    source: z.string().trim().min(3).max(300).optional(),
    expectedSha256: z
      .string()
      .regex(/^[0-9a-f]{64}$/)
      .optional(),
  })
  .strict();

/** Aborts uploads that were never finalized and removes their staging objects. */
export async function cleanupExpiredUploads(db: any, now = new Date()) {
  const expired = await db.assetVersion.findMany({ where: { status: "PENDING", expiresAt: { lt: now } }, take: 50 });
  const s = storage();
  for (const v of expired) {
    if (v.multipart && v.uploadId) await s.abortMultipart(v.stagingKey, v.uploadId);
    if (v.stagingKey) await s.delete(v.stagingKey).catch(() => undefined);
    await db.assetVersion.updateMany({
      where: { id: v.id, status: "PENDING" },
      data: { status: "FAILED", failureReason: "upload expired before finalize", stagingKey: null, uploadId: null },
    });
  }
  return expired.length;
}

/**
 * Validates the uploaded staging object and promotes it to an immutable
 * released key: size, signature on a bounded range read, type-specific
 * inspection, full streamed SHA-256 and the security hook. Failed objects are
 * deleted and the version is marked FAILED with the reason.
 */
export async function finalizeVersion(db: any, versionId: string, actor: { sub: string; role: string }) {
  const claimed = await db.assetVersion.updateMany({ where: { id: versionId, status: "PENDING" }, data: { status: "VALIDATING" } });
  const v = await db.assetVersion.findUnique({ where: { id: versionId }, include: { asset: true } });
  if (!v) throw new NotFoundException({ code: "ASSET_VERSION_NOT_FOUND", message: "Không tìm thấy phiên bản tệp" });
  if (!claimed.count) {
    if (v.status === "READY") return v;
    throw new ConflictException({ code: "ASSET_VERSION_NOT_PENDING", message: `Phiên bản đang ở trạng thái ${v.status}` });
  }
  const s = storage();
  const fail = async (problems: string[], validation: Record<string, unknown>) => {
    await s.delete(v.stagingKey).catch(() => undefined);
    const failed = await db.assetVersion.update({
      where: { id: v.id },
      data: { status: "FAILED", failureReason: problems.join("; ").slice(0, 500), validation, stagingKey: null, uploadId: null },
    });
    await db.$transaction((tx: any) =>
      audit(tx, {
        actor,
        action: "asset.version.reject",
        targetType: "AssetVersion",
        targetId: v.id,
        outcome: "failure",
        reason: problems.join("; "),
        after: { kind: v.asset.kind, mime: v.mime, bytes: v.declaredBytes },
      }),
    );
    throw new UnprocessableEntityException({
      code: "ASSET_VALIDATION_FAILED",
      message: "Tệp không hợp lệ: " + problems.join("; "),
      details: { problems, validation: failed.validation },
    });
  };
  if (v.expiresAt && v.expiresAt < new Date()) await fail(["hết hạn tải lên"], {});
  const head = await s.head(v.stagingKey);
  if (!head) {
    await db.assetVersion.update({ where: { id: v.id }, data: { status: "PENDING" } });
    throw new ConflictException({ code: "UPLOAD_INCOMPLETE", message: "Chưa nhận được tệp; hãy tải lên trước khi hoàn tất" });
  }
  const type = mediaTypeFor(v.fileName, v.mime)!;
  const problems: string[] = [];
  const validation: Record<string, any> = { headBytes: head.bytes, storage: s.kind };
  if (head.bytes !== v.declaredBytes) problems.push(`kích thước thực ${head.bytes} khác khai báo ${v.declaredBytes}`);
  if (head.bytes > type.maxBytes) problems.push(`vượt hạn mức ${Math.round(type.maxBytes / 1048576)} MB`);
  let first = await s.readRange(v.stagingKey, 0, Math.min(head.bytes, 64 * 1024) - 1);
  if (!type.signature(first)) problems.push("chữ ký tệp không khớp loại khai báo");
  else if (type.kind === "model") {
    let glb = inspectGlb(first);
    if ((glb as any).needBytes && (glb as any).needBytes <= 5 * 1048576) {
      first = await s.readRange(v.stagingKey, 0, (glb as any).needBytes - 1);
      glb = inspectGlb(first);
    }
    validation.glb = glb;
    problems.push(...glb.problems);
  } else if (type.kind === "caption") {
    const vtt = inspectVtt((await s.readRange(v.stagingKey, 0, head.bytes - 1)).toString("utf8"));
    validation.vtt = vtt;
    if (!vtt.ok) problems.push("WebVTT thiếu tiêu đề hoặc mốc thời gian");
  }
  // Full-object SHA-256, streamed with bounded memory; the multipart ETag is not a checksum.
  const hash = createHash("sha256");
  for await (const chunk of await s.stream(v.stagingKey)) hash.update(chunk as Buffer);
  const sha256 = hash.digest("hex");
  if (v.expectedSha256 && v.expectedSha256 !== sha256) problems.push("SHA-256 không khớp giá trị kỳ vọng");
  validation.security = scanStatus();
  if (validation.security === "required-not-configured") problems.push("chưa cấu hình quét bảo mật cho môi trường này");
  if (problems.length) await fail(problems, validation);

  const releasedKey = objectKeys(v.assetId, v.id, v.fileName, v.asset.scope).released;
  await s.copy(v.stagingKey, releasedKey);
  await s.delete(v.stagingKey).catch(() => undefined);
  return db.$transaction(async (tx: any) => {
    const ready = await tx.assetVersion.update({
      where: { id: v.id },
      data: {
        status: "READY",
        objectKey: releasedKey,
        stagingKey: null,
        uploadId: null,
        bytes: head.bytes,
        sha256,
        etag: head.etag,
        validation,
        readyAt: new Date(),
      },
      include: { asset: true },
    });
    await audit(tx, {
      actor,
      action: "asset.version.ready",
      targetType: "AssetVersion",
      targetId: v.id,
      after: { kind: v.asset.kind, mime: v.mime, bytes: head.bytes, version: v.version, scope: v.asset.scope },
    });
    return ready;
  });
}

/** Who may read a version: admins always; nobody while quarantined; owner; staff for shared; anyone for published content. */
export async function canReadVersion(db: any, user: { sub: string; role: string }, version: any) {
  if (user.role === "ADMIN") return true;
  if (version.status !== "READY" || version.asset.status !== "ACTIVE") return false;
  if (version.asset.ownerId === user.sub) return true;
  if (version.asset.scope === "SHARED_LIBRARY" && ["TEACHER", "ADMIN"].includes(user.role)) return true;
  const needle = `%assetv:${version.id}%`;
  const [lessons, labs] = await Promise.all([
    db.$queryRaw`SELECT 1 FROM "Lesson" l LEFT JOIN "LessonStep" s ON s."lessonId" = l.id
      WHERE l.status IN ('published','archived') AND (l.materials::text LIKE ${needle} OR s.config::text LIKE ${needle}) LIMIT 1`,
    db.$queryRaw`SELECT 1 FROM "Lab" WHERE status = 'published' AND assets::text LIKE ${needle} LIMIT 1`,
  ]);
  return (lessons as any[]).length + (labs as any[]).length > 0;
}

/** Lessons, steps and labs whose JSON references any version of the asset (or a given version). */
export async function assetReferences(db: any, ids: { versionIds: string[]; legacyFileId?: string | null }) {
  const needles = [...ids.versionIds.map((id) => `%assetv:${id}%`), ...(ids.legacyFileId ? [`%asset:${ids.legacyFileId}%`] : [])];
  if (!needles.length) return { lessons: [], labs: [] };
  const lessons: any[] = [];
  const labs: any[] = [];
  for (const needle of needles) {
    lessons.push(
      ...((await db.$queryRaw`SELECT DISTINCT l.id, l.title, l.status FROM "Lesson" l LEFT JOIN "LessonStep" s ON s."lessonId" = l.id
        WHERE l.materials::text LIKE ${needle} OR s.config::text LIKE ${needle}`) as any[]),
    );
    labs.push(...((await db.$queryRaw`SELECT id, title, status FROM "Lab" WHERE assets::text LIKE ${needle}`) as any[]));
  }
  const unique = (rows: any[]) => [...new Map(rows.map((r) => [r.id, r])).values()];
  return { lessons: unique(lessons), labs: unique(labs) };
}

/** Validates an upload request and creates the asset (or its next version) in PENDING state. */
export async function startVersion(db: any, user: { sub: string; role: string }, b: z.infer<typeof initSchema>) {
  const gate = uploadsEnabled();
  if (!gate.enabled) throw new ServiceUnavailableException({ code: "UPLOADS_NOT_CONFIGURED", message: gate.reason });
  const type = mediaTypeFor(b.fileName, b.mime);
  if (!type)
    throw new BadRequestException({ code: "ASSET_TYPE_REJECTED", message: "Chỉ nhận PDF, PNG, JPEG, MP4, WebVTT hoặc GLB đúng đuôi tệp" });
  if (b.bytes > type.maxBytes)
    throw new BadRequestException({
      code: "ASSET_TOO_LARGE",
      message: `Tệp ${type.kind} tối đa ${Math.round(type.maxBytes / 1048576)} MB`,
    });
  if (type.kind === "model" && user.role !== "ADMIN")
    throw new ForbiddenException({ code: "MODEL_ADMIN_ONLY", message: "Chỉ admin quản lý asset 3D" });
  if (b.scope === "SHARED_LIBRARY" && (user.role !== "ADMIN" || !b.license || !b.source))
    throw new ForbiddenException({
      code: "SHARED_ASSET_REQUIRES_ADMIN_RIGHTS",
      message: "Tệp thư viện chung do admin tải lên kèm giấy phép và nguồn",
    });
  await cleanupExpiredUploads(db);
  if ((await db.assetVersion.count({ where: { createdById: user.sub, status: "PENDING" } })) >= MAX_PENDING_PER_USER)
    throw new ConflictException({ code: "TOO_MANY_PENDING_UPLOADS", message: "Có quá nhiều tệp đang tải dở; hãy hoàn tất hoặc huỷ trước" });
  const s = storage();
  const { asset, version } = await db.$transaction(async (tx: any) => {
    let asset = b.assetId ? await tx.asset.findUnique({ where: { id: b.assetId } }) : null;
    if (b.assetId) {
      if (!asset) throw new NotFoundException({ code: "ASSET_NOT_FOUND", message: "Không tìm thấy tệp" });
      if (asset.ownerId !== user.sub && user.role !== "ADMIN")
        throw new ForbiddenException({ code: "ASSET_ACCESS_DENIED", message: "Bạn không quản lý tệp này" });
      if (asset.status !== "ACTIVE") throw new ConflictException({ code: "ASSET_NOT_ACTIVE", message: "Tệp đang bị cách ly hoặc lưu trữ" });
      if (asset.kind !== type.kind)
        throw new BadRequestException({ code: "ASSET_KIND_MISMATCH", message: "Phiên bản mới phải cùng loại tệp" });
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"nexalab:asset:" + asset.id}))`;
    } else
      asset = await tx.asset.create({
        data: {
          scope: b.scope,
          ownerId: user.sub,
          title: b.title ?? b.fileName,
          kind: type.kind,
          license: b.license ?? null,
          source: b.source ?? null,
        },
      });
    const last = await tx.assetVersion.findFirst({
      where: { assetId: asset!.id },
      orderBy: { version: "desc" },
      select: { version: true },
    });
    const version = await tx.assetVersion.create({
      data: {
        assetId: asset!.id,
        version: (last?.version ?? 0) + 1,
        storage: s.kind,
        bucket: s.bucket,
        fileName: b.fileName,
        mime: type.mime,
        declaredBytes: b.bytes,
        expectedSha256: b.expectedSha256 ?? null,
        multipart: b.bytes > SINGLE_PUT_LIMIT,
        expiresAt: new Date(Date.now() + UPLOAD_WINDOW_MS),
        createdById: user.sub,
      },
    });
    return { asset: asset!, version };
  });
  return { asset, version, type };
}

@ApiTags("Assets")
@ApiBearerAuth()
@Controller("assets")
export class AssetsController {
  constructor(@Inject(Db) private db: Db) {}

  @Roles("TEACHER", "ADMIN")
  @Post("uploads")
  @ApiOperation({ summary: "Start an upload: presigned PUT (small) or multipart (large) to a private staging key" })
  async init(@Req() req: any, @Body() body: unknown) {
    const b = initSchema.parse(body);
    const { asset, version, type } = await startVersion(this.db, req.user, b);
    const s = storage();
    const stagingKey = objectKeys(asset.id, version.id, b.fileName, asset.scope).staging;
    if (version.multipart) {
      const uploadId = await s.createMultipart(stagingKey, type.mime);
      await this.db.assetVersion.update({ where: { id: version.id }, data: { stagingKey, uploadId } });
      return {
        assetId: asset.id,
        versionId: version.id,
        version: version.version,
        mode: "multipart",
        partSize: PART_SIZE,
        partCount: Math.ceil(b.bytes / PART_SIZE),
        expiresAt: version.expiresAt,
      };
    }
    await this.db.assetVersion.update({ where: { id: version.id }, data: { stagingKey } });
    return {
      assetId: asset.id,
      versionId: version.id,
      version: version.version,
      mode: "single",
      upload: { method: "PUT", url: await s.presignPut(stagingKey, type.mime, uploadTtl()), headers: { "content-type": type.mime } },
      expiresAt: version.expiresAt,
    };
  }

  private async pendingOwned(id: string, user: any) {
    const v = await this.db.assetVersion.findUnique({ where: { id } });
    if (!v || (v.createdById !== user.sub && user.role !== "ADMIN"))
      throw new NotFoundException({ code: "ASSET_VERSION_NOT_FOUND", message: "Không tìm thấy phiên bản tệp" });
    return v;
  }

  @Roles("TEACHER", "ADMIN")
  @Post("uploads/:id/parts")
  @ApiOperation({ summary: "Presigned URLs for multipart part numbers (short-lived)" })
  async parts(@Param("id") id: string, @Req() req: any, @Body() body: unknown) {
    const b = z
      .object({ partNumbers: z.array(z.number().int().min(1).max(10000)).min(1).max(100) })
      .strict()
      .parse(body);
    const v = await this.pendingOwned(id, req.user);
    if (v.status !== "PENDING" || !v.multipart || !v.uploadId || !v.stagingKey)
      throw new ConflictException({ code: "ASSET_VERSION_NOT_PENDING", message: "Phiên bản không ở trạng thái tải lên nhiều phần" });
    const maxPart = Math.ceil(v.declaredBytes / PART_SIZE);
    if (b.partNumbers.some((n) => n > maxPart)) throw new BadRequestException({ code: "INVALID_PART", message: `Chỉ có ${maxPart} phần` });
    const s = storage();
    return {
      parts: await Promise.all(
        b.partNumbers.map(async (partNumber) => ({
          partNumber,
          url: await s.presignPart(v.stagingKey!, v.uploadId!, partNumber, uploadTtl()),
        })),
      ),
    };
  }

  @Roles("TEACHER", "ADMIN")
  @Post("uploads/:id/complete")
  @ApiOperation({ summary: "Finish the upload and validate; READY only after size, signature, SHA-256 and type checks pass" })
  async complete(@Param("id") id: string, @Req() req: any, @Body() body: unknown) {
    const b = z
      .object({
        parts: z
          .array(z.object({ partNumber: z.number().int().min(1), etag: z.string().min(1).max(200) }).strict())
          .max(10000)
          .optional(),
      })
      .strict()
      .parse(body ?? {});
    const v = await this.pendingOwned(id, req.user);
    if (v.status === "PENDING" && v.multipart) {
      const expected = Math.ceil(v.declaredBytes / PART_SIZE);
      if (!b.parts || b.parts.length !== expected)
        throw new BadRequestException({ code: "PARTS_REQUIRED", message: `Cần đủ ${expected} phần kèm ETag` });
      await storage().completeMultipart(v.stagingKey!, v.uploadId!, b.parts);
      await this.db.assetVersion.update({ where: { id }, data: { uploadId: null } });
    }
    const ready = await finalizeVersion(this.db, id, req.user);
    return {
      assetId: ready.assetId,
      versionId: ready.id,
      version: ready.version,
      status: ready.status,
      sha256: ready.sha256,
      bytes: ready.bytes,
      url: "assetv:" + ready.id,
    };
  }

  @Roles("TEACHER", "ADMIN")
  @Post("uploads/:id/abort")
  async abort(@Param("id") id: string, @Req() req: any) {
    const v = await this.pendingOwned(id, req.user);
    if (v.status !== "PENDING")
      throw new ConflictException({ code: "ASSET_VERSION_NOT_PENDING", message: "Phiên bản không còn đang tải lên" });
    const s = storage();
    if (v.multipart && v.uploadId) await s.abortMultipart(v.stagingKey!, v.uploadId);
    if (v.stagingKey) await s.delete(v.stagingKey).catch(() => undefined);
    await this.db.assetVersion.update({
      where: { id },
      data: { status: "FAILED", failureReason: "aborted by uploader", stagingKey: null, uploadId: null },
    });
    return { aborted: true };
  }

  @Get("versions/:id/access")
  @ApiOperation({ summary: "Short-lived read URL after role, ownership, publication and quarantine checks" })
  async access(@Param("id") id: string, @Req() req: any) {
    const v = await this.db.assetVersion.findUnique({ where: { id }, include: { asset: true } });
    if (!v || !(await canReadVersion(this.db, req.user, v)) || !v.objectKey)
      throw new ForbiddenException({ code: "ASSET_ACCESS_DENIED", message: "Không có quyền mở tệp này hoặc tệp đang bị cách ly" });
    const ttl = readTtl();
    return {
      url: await storage().presignGet(v.objectKey, ttl, { fileName: v.fileName, contentType: v.mime }),
      expiresAt: new Date(Date.now() + ttl * 1000),
      mime: v.mime,
      fileName: v.fileName,
      bytes: v.bytes,
    };
  }

  @Roles("TEACHER", "ADMIN")
  @Get("mine")
  async mine(@Req() req: any, @Query() query: unknown) {
    const q = z
      .object({ kind: z.enum(["pdf", "image", "video", "caption", "model"]).optional() })
      .strict()
      .parse(query ?? {});
    const assets = await this.db.asset.findMany({
      where: { OR: [{ ownerId: req.user.sub }, { scope: "SHARED_LIBRARY", status: "ACTIVE" }], ...(q.kind ? { kind: q.kind } : {}) },
      include: { versions: { where: { status: "READY" }, orderBy: { version: "desc" } } },
      orderBy: { createdAt: "desc" },
      take: 200,
    });
    return assets.map(({ versions, ...a }) => ({
      ...a,
      versions: versions.map((v) => ({ id: v.id, version: v.version, fileName: v.fileName, bytes: v.bytes, url: "assetv:" + v.id })),
    }));
  }
}

/** Serves the local driver's signed URLs; never used when ASSET_STORAGE=r2. */
@Controller("storage/local")
export class LocalStorageController {
  @Public()
  @Put(":token")
  async put(@Param("token") token: string, @Req() req: any, @Res({ passthrough: true }) res: any) {
    const grant = verifyLocalGrant(token);
    const local = localStorage();
    if (!local || !grant || !["put", "part"].includes(grant.op))
      throw new ForbiddenException({ code: "SIGNATURE_INVALID", message: "Liên kết tải lên không hợp lệ hoặc đã hết hạn" });
    if (grant.op === "part") {
      await local.writePart(grant.uploadId!, grant.part!, req);
      res.setHeader("ETag", `"local-${grant.part}"`);
      return { ok: true };
    }
    await local.writeObject(grant.key, req);
    return { ok: true };
  }
  @Public()
  @Get(":token")
  async get(@Param("token") token: string, @Res() res: any) {
    const grant = verifyLocalGrant(token);
    const local = localStorage();
    if (!local || !grant || grant.op !== "get")
      return res.status(403).json({ statusCode: 403, code: "SIGNATURE_INVALID", message: "Liên kết đã hết hạn" });
    const head = await local.head(grant.key);
    if (!head) return res.status(404).end();
    res.setHeader("Content-Type", grant.ct ?? "application/octet-stream");
    res.setHeader("Content-Length", String(head.bytes));
    if (grant.name) res.setHeader("Content-Disposition", `inline; filename*=UTF-8''${encodeURIComponent(grant.name)}`);
    (await local.stream(grant.key)).pipe(res);
  }
}
