import { Body, Controller, Delete, Get, Inject, NotFoundException, Param, Post, Put, Query, Req } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { z } from "zod";
import { Db } from "../../../db/db";

@ApiTags("NexaLab")
@ApiBearerAuth()
@Controller()
export class EbookController {
  constructor(@Inject(Db) private db: Db) {}
  @Get("subjects/:subjectId/ebook-annotations") async ebookAnnotations(
    @Param("subjectId") subjectId: string,
    @Query() query: unknown,
    @Req() req: any,
  ) {
    const q = z.object({
      fingerprint: z.string().trim().min(1).max(200),
      skip: z.coerce.number().int().min(0).max(1_000_000).default(0),
    }).strict().parse(query);
    const subject = await this.db.subject.findUnique({ where: { id: subjectId }, select: { ebookUrl: true, ebookEditions: { select: { id: true }, take: 1 } } });
    if (!subject?.ebookUrl && !subject?.ebookEditions?.length) throw new NotFoundException({ code: "EBOOK_NOT_FOUND", message: "Không tìm thấy sách giáo khoa" });
    return this.db.ebookAnnotation.findMany({
      where: { userId: req.user.sub, subjectId, documentFingerprint: q.fingerprint },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: q.skip,
      take: 500,
    });
  }
  @Post("subjects/:subjectId/ebook-annotations") async createEbookAnnotation(
    @Param("subjectId") subjectId: string,
    @Body() body: unknown,
    @Req() req: any,
  ) {
    const b = z.object({
      documentFingerprint: z.string().trim().min(1).max(200),
      pageNumber: z.number().int().min(1).max(10000),
      kind: z.enum(["HIGHLIGHT", "UNDERLINE", "NOTE"]),
      startOffset: z.number().int().min(0).max(1_000_000),
      endOffset: z.number().int().min(1).max(1_000_000),
      selectedText: z.string().trim().min(1).max(2000),
      prefix: z.string().max(120).nullable().optional(),
      suffix: z.string().max(120).nullable().optional(),
      noteText: z.string().trim().max(2000).nullable().optional(),
    }).strict().refine((value) => value.endOffset > value.startOffset, { path: ["endOffset"], message: "Đoạn được chọn không hợp lệ" }).parse(body);
    const subject = await this.db.subject.findUnique({ where: { id: subjectId }, select: { ebookUrl: true, ebookEditions: { select: { id: true }, take: 1 } } });
    if (!subject?.ebookUrl && !subject?.ebookEditions?.length) throw new NotFoundException({ code: "EBOOK_NOT_FOUND", message: "Không tìm thấy sách giáo khoa" });
    return this.db.ebookAnnotation.create({ data: { ...b, userId: req.user.sub, subjectId } });
  }
  @Put("ebook-annotations/:id") async updateEbookAnnotation(
    @Param("id") id: string,
    @Body() body: unknown,
    @Req() req: any,
  ) {
    const b = z.object({ kind: z.literal("NOTE"), noteText: z.string().trim().min(1).max(2000) }).strict().parse(body);
    const result = await this.db.ebookAnnotation.updateMany({ where: { id, userId: req.user.sub, kind: "NOTE" }, data: { noteText: b.noteText } });
    if (!result.count) throw new NotFoundException({ code: "EBOOK_ANNOTATION_NOT_FOUND", message: "Không tìm thấy ghi chú" });
    return this.db.ebookAnnotation.findFirst({ where: { id, userId: req.user.sub } });
  }
  @Delete("ebook-annotations/:id") async deleteEbookAnnotation(@Param("id") id: string, @Req() req: any) {
    const result = await this.db.ebookAnnotation.deleteMany({ where: { id, userId: req.user.sub } });
    if (!result.count) throw new NotFoundException({ code: "EBOOK_ANNOTATION_NOT_FOUND", message: "Không tìm thấy ghi chú" });
    return { ok: true };
  }
}
