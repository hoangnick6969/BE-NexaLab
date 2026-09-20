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
import { randomUUID } from "node:crypto";
import { mkdir, writeFile, unlink } from "node:fs/promises";
import { createReadStream } from "node:fs";
import { resolve } from "node:path";
import { Db } from "./db";
import { Roles } from "./auth";
const root = resolve(process.env.UPLOAD_DIR ?? "uploads");
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
    const kinds = [
      {
        mime: "application/pdf",
        type: "pdf",
        match: b.subarray(0, 5).toString() === "%PDF-",
      },
      {
        mime: "image/png",
        type: "image",
        match: b
          .subarray(0, 8)
          .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])),
      },
      {
        mime: "image/jpeg",
        type: "image",
        match: b[0] === 255 && b[1] === 216 && b[2] === 255,
      },
      {
        mime: "video/mp4",
        type: "video",
        match: b.subarray(4, 8).toString() === "ftyp",
      },
      {
        mime: "model/gltf-binary",
        type: "model",
        match: b.subarray(0, 4).toString() === "glTF",
      },
    ];
    const kind = kinds.find((k) => k.match);
    if (!kind)
      throw new BadRequestException(
        "Chỉ nhận PDF, PNG, JPEG, MP4 hoặc GLB hợp lệ (tối đa 20 MB)",
      );
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
    if (file.ownerId !== req.user.sub && req.user.role !== "ADMIN") {
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
