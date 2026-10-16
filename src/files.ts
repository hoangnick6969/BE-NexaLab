import {
  Controller,
  Get,
  Post,
  Param,
  Req,
  Res,
  UploadedFile,
  UseInterceptors,
  Inject,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  StreamableFile,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { ApiTags, ApiBearerAuth, ApiConsumes } from "@nestjs/swagger";
import { createReadStream } from "node:fs";
import { extname, resolve } from "node:path";
import { Db } from "./db";
import { Roles } from "./auth";
import { mediaTypes } from "./media";
import { canReadVersion, finalizeVersion, startVersion } from "./assets";
import { objectKeys, readTtl, storage } from "./storage";
const root = resolve(process.env.UPLOAD_DIR ?? "uploads");
/** Form uploads are for small files; larger media uses the presigned /assets/uploads flow. */
const FORM_LIMIT = 20 * 1024 * 1024;

@ApiTags("Files")
@ApiBearerAuth()
@Controller("files")
export class FilesController {
  constructor(@Inject(Db) private db: Db) {}

  /**
   * Convenience upload through the API (≤20 MB). The bytes go to the same
   * object storage, validation and immutable AssetVersion as presigned uploads.
   */
  @Roles("TEACHER", "ADMIN")
  @Post()
  @ApiConsumes("multipart/form-data")
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: FORM_LIMIT, files: 1, fields: 0 } }))
  async upload(@UploadedFile() file: any, @Req() req: any) {
    if (!file) throw new BadRequestException("Chọn tệp để tải lên");
    const bytes = file.buffer as Buffer;
    const fileName = String(file.originalname ?? "").slice(0, 200);
    const type = mediaTypes().find((t) => t.extensions.includes(extname(fileName).toLowerCase()) && t.signature(bytes));
    if (!type)
      throw new BadRequestException({
        code: "ASSET_TYPE_REJECTED",
        message: "Chỉ nhận PDF, PNG, JPEG, MP4, WebVTT hoặc GLB hợp lệ, đúng đuôi tệp",
      });
    const { asset, version } = await startVersion(this.db, req.user, {
      fileName,
      mime: type.mime,
      bytes: bytes.length,
      title: fileName,
      scope: "TEACHER_PRIVATE",
    });
    const stagingKey = objectKeys(asset.id, version.id, fileName, asset.scope).staging;
    await storage().put(stagingKey, bytes, type.mime);
    await this.db.assetVersion.update({ where: { id: version.id }, data: { stagingKey } });
    const ready = await finalizeVersion(this.db, version.id, req.user);
    return { id: ready.id, assetId: asset.id, url: "assetv:" + ready.id, type: type.kind, title: fileName, sha256: ready.sha256 };
  }

  /** Legacy `asset:<uuid>` files are served from disk; versions redirect to a short-lived signed URL. */
  @Get(":id") async get(@Param("id") id: string, @Req() req: any, @Res({ passthrough: true }) res: any) {
    if (/^[a-z0-9]{20,40}$/.test(id)) {
      const version = await this.db.assetVersion.findUnique({ where: { id }, include: { asset: true } });
      if (!version) throw new NotFoundException();
      if (!(await canReadVersion(this.db, req.user, version)) || !version.objectKey)
        throw new ForbiddenException({ code: "ASSET_ACCESS_DENIED", message: "Không có quyền mở tệp này hoặc tệp đang bị cách ly" });
      res.redirect(
        302,
        await storage().presignGet(version.objectKey, readTtl(), { fileName: version.fileName, contentType: version.mime }),
      );
      return;
    }
    if (!/^[0-9a-f-]{36}$/.test(id)) throw new NotFoundException();
    const file = await this.db.assetFile.findUnique({ where: { id } });
    if (!file) throw new NotFoundException();
    // A quarantined file is withheld from everyone but admins, wherever it is referenced (C2-T5).
    if (file.status === "QUARANTINED" && req.user.role !== "ADMIN")
      throw new ForbiddenException({ code: "ASSET_QUARANTINED", message: "Tệp đang bị cách ly" });
    const sharedForStaff = file.scope === "SHARED_LIBRARY" && ["TEACHER", "ADMIN"].includes(req.user.role);
    if (file.ownerId !== req.user.sub && req.user.role !== "ADMIN" && !sharedForStaff) {
      const lesson = await this.db.lesson.findFirst({
        where: { status: "published", materials: { array_contains: [{ url: "asset:" + id }] } },
      });
      const lab = await this.db.lab.findFirst({ where: { status: "published", assets: { array_contains: [{ url: "asset:" + id }] } } });
      if (!lesson && !lab) throw new ForbiddenException("Tệp chưa được xuất bản");
    }
    return new StreamableFile(createReadStream(resolve(root, id)), {
      type: file.mime,
      length: file.size,
      disposition: `inline; filename*=UTF-8''${encodeURIComponent(file.name)}`,
    });
  }
}
