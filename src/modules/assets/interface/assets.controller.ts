import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  Inject,
  NotFoundException,
  Param,
  Post,
  Query,
  Req,
  Res,
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { z } from "zod";
import { canReadVersion, finalizeVersion, initSchema, startVersion } from "../application/asset-versions";
import { PART_SIZE } from "../application/media";
import { Roles } from "../../../common/decorators";
import { Db } from "../../../db/db";
import { objectKeys, parseByteRange, readTtl, storage, uploadTtl } from "../../storage/infrastructure/storage";

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
      assetStatus: ready.asset.status,
      scope: ready.asset.scope,
      kind: ready.asset.kind,
      mime: ready.mime,
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

  @Get("versions/:id/content")
  @ApiOperation({ summary: "Authorized byte-range read for viewers that cannot use storage CORS" })
  async content(@Param("id") id: string, @Req() req: any, @Res() res: any) {
    const v = await this.db.assetVersion.findUnique({ where: { id }, include: { asset: true } });
    if (!v || !(await canReadVersion(this.db, req.user, v)) || !v.objectKey || !v.bytes)
      throw new ForbiddenException({ code: "ASSET_ACCESS_DENIED", message: "Không có quyền mở tệp này hoặc tệp đang bị cách ly" });
    const range = parseByteRange(req.headers.range, v.bytes);
    res.setHeader("Accept-Ranges", "bytes");
    if (!range || range === "invalid") {
      res.setHeader("Content-Range", `bytes */${v.bytes}`);
      return res.status(416).end();
    }
    const body = await storage().readRange(v.objectKey, range.start, range.end);
    res.status(206);
    res.setHeader("Content-Type", v.mime);
    res.setHeader("Content-Range", `bytes ${range.start}-${range.end}/${v.bytes}`);
    res.setHeader("Content-Length", String(body.length));
    return res.end(body);
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
