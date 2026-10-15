import {
  Controller,
  Get,
  Post,
  Param,
  Req,
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
import { createHash, randomUUID } from "node:crypto";
import { mkdir, writeFile, unlink } from "node:fs/promises";
import { createReadStream } from "node:fs";
import { extname, resolve } from "node:path";
import { Db } from "./db";
import { Roles } from "./auth";
const root = resolve(process.env.UPLOAD_DIR ?? "uploads");
const MB = 1024 * 1024;
/**
 * Configuration-driven validation (C2-T5): signature, extension, MIME and size
 * per type. These are development budgets; production limits wait for
 * Q-DATA-01 (video) and Q-C2-03 (other types) and must not be raised here
 * without that approval. The multipart limit below is the largest budget.
 */
export const ASSET_TYPES = [
  { type: "pdf", mime: "application/pdf", extensions: [".pdf"], maxBytes: 20 * MB, signature: (b: Buffer) => b.subarray(0, 5).toString() === "%PDF-" },
  {
    type: "image",
    mime: "image/png",
    extensions: [".png"],
    maxBytes: 10 * MB,
    signature: (b: Buffer) => b.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])),
  },
  { type: "image", mime: "image/jpeg", extensions: [".jpg", ".jpeg"], maxBytes: 10 * MB, signature: (b: Buffer) => b[0] === 255 && b[1] === 216 && b[2] === 255 },
  { type: "video", mime: "video/mp4", extensions: [".mp4"], maxBytes: 20 * MB, signature: (b: Buffer) => b.subarray(4, 8).toString() === "ftyp" },
  { type: "model", mime: "model/gltf-binary", extensions: [".glb"], maxBytes: 20 * MB, signature: (b: Buffer) => b.subarray(0, 4).toString() === "glTF" },
];
@ApiTags("Files")
@ApiBearerAuth()
@Controller("files")
export class FilesController {
  constructor(@Inject(Db) private db: Db) {}
  @Roles("TEACHER", "ADMIN")
  @Post()
  @ApiConsumes("multipart/form-data")
  @UseInterceptors(
    FileInterceptor("file", {
      limits: { fileSize: 20 * 1024 * 1024, files: 1, fields: 0 },
    }),
  )
  async upload(@UploadedFile() file: any, @Req() req: any) {
    if (!file) throw new BadRequestException("Chọn tệp để tải lên");
    const b = file.buffer as Buffer;
    const kind = ASSET_TYPES.find((type) => type.signature(b));
    const extension = extname(String(file.originalname ?? "")).toLowerCase();
    if (!kind || !kind.extensions.includes(extension))
      throw new BadRequestException({
        code: "ASSET_TYPE_REJECTED",
        message: "Chỉ nhận PDF, PNG, JPEG, MP4 hoặc GLB hợp lệ, đúng đuôi tệp",
      });
    if (b.length > kind.maxBytes)
      throw new BadRequestException({
        code: "ASSET_TOO_LARGE",
        message: `Tệp ${kind.type} tối đa ${Math.round(kind.maxBytes / 1048576)} MB`,
      });
    if (kind.type === "model" && req.user.role !== "ADMIN")
      throw new ForbiddenException("Chỉ admin quản lý asset 3D");
    const id = randomUUID();
    await mkdir(root, { recursive: true });
    await writeFile(resolve(root, id), b, { flag: "wx" });
    try {
      await this.db.assetFile.create({
        data: {
          id,
          ownerId: req.user.sub,
          name: String(file.originalname).slice(0, 200),
          mime: kind.mime,
          size: b.length,
          sha256: createHash("sha256").update(b).digest("hex"),
        },
      });
    } catch (e) {
      await unlink(resolve(root, id));
      throw e;
    }
    return {
      id,
      url: "asset:" + id,
      type: kind.type,
      title: file.originalname,
    };
  }
  @Get(":id") async get(@Param("id") id: string, @Req() req: any) {
    if (!/^[0-9a-f-]{36}$/.test(id)) throw new NotFoundException();
    const file = await this.db.assetFile.findUnique({ where: { id } });
    if (!file) throw new NotFoundException();
    // A quarantined file is withheld from everyone but admins, wherever it is referenced (C2-T5).
    if (file.status === "QUARANTINED" && req.user.role !== "ADMIN")
      throw new ForbiddenException({ code: "ASSET_QUARANTINED", message: "Tệp đang bị cách ly" });
    const sharedForStaff = file.scope === "SHARED_LIBRARY" && ["TEACHER", "ADMIN"].includes(req.user.role);
    if (file.ownerId !== req.user.sub && req.user.role !== "ADMIN" && !sharedForStaff) {
      const lesson = await this.db.lesson.findFirst({
        where: {
          status: "published",
          materials: { array_contains: [{ url: "asset:" + id }] },
        },
      });
      const lab = await this.db.lab.findFirst({
        where: {
          status: "published",
          assets: { array_contains: [{ url: "asset:" + id }] },
        },
      });
      if (!lesson && !lab)
        throw new ForbiddenException("Tệp chưa được xuất bản");
    }
    return new StreamableFile(createReadStream(resolve(root, id)), {
      type: file.mime,
      length: file.size,
      disposition: `inline; filename*=UTF-8''${encodeURIComponent(file.name)}`,
    });
  }
}
