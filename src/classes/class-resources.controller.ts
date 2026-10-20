import { BadRequestException, Body, ConflictException, Controller, ForbiddenException, Get, Inject, NotFoundException, Param, Post, Put, Req } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { Roles } from "../common/decorators";
import { audit } from "../common/audit";
import { idempotent, readIdempotencyKey, TX_LIMITS } from "../common/idempotency";
import { Db } from "../infra/db";
import { ownedClass } from "./class-access";
import { classArchived, lock } from "./class-common";
import { normalizeResourceContent, parseResourceCsv, ResourceKind, studentResource } from "./class-resource-contract";
import { notify } from "../common/notify";

const kindSchema = z.enum(["DECK", "STUDY_QUIZ", "TEST"]);
const titleSchema = z.string().trim().min(1).max(160);
const bodySchema = z.object({ kind: kindSchema, title: titleSchema, lessonId: z.string().min(1), content: z.unknown() }).strict();
const resourceSelect = { id: true, classId: true, kind: true, title: true, lessonId: true, version: true, status: true, content: true, createdAt: true, publishedAt: true, archivedAt: true } as const;

@ApiTags("Class Space Resources")
@ApiBearerAuth()
@Controller()
export class ClassResourcesController {
  constructor(@Inject(Db) private db: Db) {}

  @Roles("TEACHER", "STUDENT")
  @Get("classes/:id/resources")
  @ApiOperation({ summary: "List class resources under owner or approved member access" })
  async list(@Param("id") classId: string, @Req() req: any) {
    const c = await this.db.classroom.findUnique({ where: { id: classId } });
    if (!c) throw this.denied();
    if (req.user.role === "TEACHER") {
      if (c.teacherId !== req.user.sub) throw this.denied();
      return this.db.classResource.findMany({ where: { classId }, select: resourceSelect, orderBy: [{ createdAt: "desc" }, { version: "desc" }] });
    }
    await this.assertMember(classId, req.user.sub);
    if (c.status !== "ACTIVE") throw this.denied();
    const rows = await this.db.classResource.findMany({ where: { classId, status: "PUBLISHED" }, select: resourceSelect, orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }] });
    return Promise.all(rows.map((resource) => this.memberView(resource, req.user.sub)));
  }

  @Roles("TEACHER", "STUDENT")
  @Get("classes/:id/resources/:resourceId")
  async detail(@Param("id") classId: string, @Param("resourceId") resourceId: string, @Req() req: any) {
    const c = await this.db.classroom.findUnique({ where: { id: classId } });
    const resource = await this.db.classResource.findFirst({ where: { id: resourceId, classId }, select: resourceSelect });
    if (!c || !resource) throw this.denied();
    if (req.user.role === "TEACHER") {
      if (c.teacherId !== req.user.sub) throw this.denied();
      return resource;
    }
    await this.assertMember(classId, req.user.sub);
    if (c.status !== "ACTIVE" || resource.status !== "PUBLISHED") throw this.denied();
    return this.memberView(resource, req.user.sub);
  }

  @Roles("TEACHER")
  @Post("classes/:id/resources")
  async create(@Param("id") classId: string, @Req() req: any, @Body() body: unknown) {
    const b = bodySchema.parse(body);
    const c = await ownedClass(this.db, classId, req.user);
    if (c.status !== "ACTIVE") throw classArchived();
    const content = normalizeResourceContent(b.kind, b.content);
    await this.assertLesson(classId, b.lessonId, req.user.sub);
    const ctx = { actorId: req.user.sub, key: readIdempotencyKey(req), scope: `POST classes/${classId}/resources`, payload: { ...b, content } };
    return idempotent(this.db, ctx, async (tx) => {
      const created = await tx.classResource.create({ data: { classId, kind: b.kind, title: b.title, lessonId: b.lessonId, content, createdById: req.user.sub }, select: resourceSelect });
      await audit(tx, { actor: req.user, action: "class_resource.create", targetType: "ClassResource", targetId: created.id, after: { classId, resourceKind: b.kind, resourceVersion: 1, itemCount: this.itemCount(created) } });
      return created;
    });
  }

  @Roles("TEACHER")
  @Put("classes/:id/resources/:resourceId")
  async updateDraft(@Param("id") classId: string, @Param("resourceId") resourceId: string, @Req() req: any, @Body() body: unknown) {
    const b = bodySchema.parse(body);
    const c = await ownedClass(this.db, classId, req.user);
    if (c.status !== "ACTIVE") throw classArchived();
    const existing = await this.db.classResource.findFirst({ where: { id: resourceId, classId } });
    if (!existing) throw this.denied();
    if (existing.status !== "DRAFT") throw new ConflictException({ code: "RESOURCE_VERSION_IMMUTABLE", message: "Bản đã xuất bản không sửa trực tiếp; hãy tạo bản nháp mới" });
    const content = normalizeResourceContent(b.kind, b.content);
    await this.assertLesson(classId, b.lessonId, req.user.sub);
    return this.db.$transaction(async (tx) => {
      const changed = await tx.classResource.updateMany({ where: { id: resourceId, classId, status: "DRAFT" }, data: { kind: b.kind, title: b.title, lessonId: b.lessonId, content } });
      if (!changed.count) throw new ConflictException({ code: "RESOURCE_VERSION_IMMUTABLE", message: "Bản đã xuất bản hoặc lưu trữ không thể sửa" });
      const updated = await tx.classResource.findUnique({ where: { id: resourceId }, select: resourceSelect });
      await audit(tx, { actor: req.user, action: "class_resource.update_draft", targetType: "ClassResource", targetId: resourceId, before: { resourceKind: existing.kind, resourceVersion: existing.version }, after: { resourceKind: b.kind, resourceVersion: existing.version, itemCount: this.itemCount(updated) } });
      return updated;
    });
  }

  @Roles("TEACHER")
  @Post("classes/:id/resources/:resourceId/publish")
  async publish(@Param("id") classId: string, @Param("resourceId") resourceId: string, @Req() req: any) {
    const c = await ownedClass(this.db, classId, req.user);
    if (c.status !== "ACTIVE") throw classArchived();
    const existing = await this.db.classResource.findFirst({ where: { id: resourceId, classId } });
    if (!existing) throw this.denied();
    if (existing.status !== "DRAFT") throw new ConflictException({ code: "RESOURCE_NOT_DRAFT", message: "Chỉ có thể xuất bản bản nháp" });
    return this.db.$transaction(async (tx) => {
      const changed = await tx.classResource.updateMany({ where: { id: resourceId, classId, status: "DRAFT" }, data: { status: "PUBLISHED", publishedAt: new Date() } });
      if (!changed.count) throw new ConflictException({ code: "RESOURCE_NOT_DRAFT", message: "Chỉ có thể xuất bản bản nháp" });
      const updated = await tx.classResource.findUnique({ where: { id: resourceId }, select: resourceSelect });
      await audit(tx, { actor: req.user, action: "class_resource.publish", targetType: "ClassResource", targetId: resourceId, after: { classId, resourceKind: existing.kind, resourceVersion: existing.version } });
      const members = await tx.enrollment.findMany({ where: { classId, status: "approved" }, select: { studentId: true } });
      await notify(tx, members.map((m) => ({ recipientId: m.studentId, type: "RESOURCE_PUBLISHED" as const, title: `Tài liệu mới trong lớp ${c.name}: ${existing.title}`, link: "/classes", dedupKey: `resource:${resourceId}` })));
      return updated;
    }, TX_LIMITS);
  }

  @Roles("TEACHER")
  @Post("classes/:id/resources/:resourceId/revise")
  async revise(@Param("id") classId: string, @Param("resourceId") resourceId: string, @Req() req: any) {
    const c = await ownedClass(this.db, classId, req.user);
    if (c.status !== "ACTIVE") throw classArchived();
    return this.db.$transaction(async (tx) => {
      await lock(tx, `class-resource-version:${classId}`);
      const source = await tx.classResource.findFirst({ where: { id: resourceId, classId, status: "PUBLISHED" } });
      if (!source) throw this.denied();
      const version = await tx.classResource.aggregate({ where: { classId, kind: source.kind, title: source.title }, _max: { version: true } });
      const draft = await tx.classResource.create({ data: { classId, kind: source.kind, title: source.title, lessonId: source.lessonId, version: (version._max.version ?? source.version) + 1, content: source.content as Prisma.InputJsonValue, createdById: req.user.sub }, select: resourceSelect });
      await audit(tx, { actor: req.user, action: "class_resource.revise", targetType: "ClassResource", targetId: draft.id, after: { classId, resourceKind: draft.kind, resourceVersion: draft.version } });
      return draft;
    });
  }

  @Roles("TEACHER")
  @Post("classes/:id/resources/:resourceId/archive")
  async archive(@Param("id") classId: string, @Param("resourceId") resourceId: string, @Req() req: any) {
    const c = await ownedClass(this.db, classId, req.user);
    if (c.status !== "ACTIVE") throw classArchived();
    const source = await this.db.classResource.findFirst({ where: { id: resourceId, classId } });
    if (!source) throw this.denied();
    if (source.status === "ARCHIVED") return { archived: true, alreadyArchived: true };
    return this.db.$transaction(async (tx) => {
      const changed = await tx.classResource.updateMany({ where: { id: resourceId, classId, status: { not: "ARCHIVED" } }, data: { status: "ARCHIVED", archivedAt: new Date() } });
      if (!changed.count) return { archived: true, alreadyArchived: true };
      const updated = await tx.classResource.findUnique({ where: { id: resourceId }, select: resourceSelect });
      await audit(tx, { actor: req.user, action: "class_resource.archive", targetType: "ClassResource", targetId: resourceId, after: { classId, resourceKind: source.kind, resourceVersion: source.version } });
      return updated;
    });
  }

  @Roles("TEACHER")
  @Post("classes/:id/resources/import/preview")
  async previewImport(@Param("id") classId: string, @Req() req: any, @Body() body: unknown) {
    const b = z.object({ kind: kindSchema, filename: z.string().trim().min(1).max(200), csv: z.string().max(1_000_000) }).strict().parse(body);
    const c = await ownedClass(this.db, classId, req.user);
    if (c.status !== "ACTIVE") throw classArchived();
    if (!b.filename.toLowerCase().endsWith(".csv")) throw new BadRequestException({ code: "IMPORT_FORMAT_UNSUPPORTED", message: "Increment này chỉ hỗ trợ CSV UTF-8" });
    const result = parseResourceCsv(b.kind, b.csv);
    return { valid: result.errors.length === 0, itemCount: result.data ? this.itemCount({ kind: b.kind, content: result.data }) : 0, errors: result.errors, draft: null };
  }

  @Roles("TEACHER")
  @Post("classes/:id/resources/import")
  async importCsv(@Param("id") classId: string, @Req() req: any, @Body() body: unknown) {
    const b = z.object({ kind: kindSchema, title: titleSchema, lessonId: z.string().min(1), filename: z.string().trim().min(1).max(200), csv: z.string().max(1_000_000) }).strict().parse(body);
    const c = await ownedClass(this.db, classId, req.user);
    if (c.status !== "ACTIVE") throw classArchived();
    if (!b.filename.toLowerCase().endsWith(".csv")) throw new BadRequestException({ code: "IMPORT_FORMAT_UNSUPPORTED", message: "Increment này chỉ hỗ trợ CSV UTF-8" });
    const result = parseResourceCsv(b.kind, b.csv);
    if (result.errors.length || !result.data) throw new BadRequestException({ code: "IMPORT_VALIDATION_FAILED", message: "Tệp có lỗi; không tạo tài nguyên", details: { errors: result.errors } });
    await this.assertLesson(classId, b.lessonId, req.user.sub);
    const ctx = { actorId: req.user.sub, key: readIdempotencyKey(req), scope: `POST classes/${classId}/resources/import`, payload: { ...b, csvBytes: Buffer.byteLength(b.csv) } };
    return idempotent(this.db, ctx, async (tx) => {
      const created = await tx.classResource.create({ data: { classId, kind: b.kind, title: b.title, lessonId: b.lessonId, content: result.data as Prisma.InputJsonValue, createdById: req.user.sub }, select: resourceSelect });
      await audit(tx, { actor: req.user, action: "class_resource.import", targetType: "ClassResource", targetId: created.id, after: { classId, resourceKind: b.kind, resourceVersion: 1, sourceName: b.filename, itemCount: this.itemCount(created) } });
      return { resource: created, imported: true, published: false };
    });
  }

  @Roles("STUDENT")
  @Put("classes/:id/resources/:resourceId/practice")
  async savePractice(@Param("id") classId: string, @Param("resourceId") resourceId: string, @Req() req: any, @Body() body: unknown) {
    const b = z.object({ state: z.record(z.string(), z.unknown()).refine((state) => Buffer.byteLength(JSON.stringify(state)) <= 100_000, "Trạng thái luyện tập vượt quá 100 KB") }).strict().parse(body);
    const c = await this.db.classroom.findUnique({ where: { id: classId } });
    const resource = await this.db.classResource.findFirst({ where: { id: resourceId, classId, status: "PUBLISHED" } });
    if (!c || c.status !== "ACTIVE" || !resource || resource.kind === "TEST") throw this.denied();
    await this.assertMember(classId, req.user.sub);
    const practice = await this.db.classResourcePractice.upsert({ where: { resourceId_studentId: { resourceId, studentId: req.user.sub } }, create: { resourceId, studentId: req.user.sub, state: b.state as Prisma.InputJsonValue }, update: { state: b.state as Prisma.InputJsonValue } });
    return { saved: true, updatedAt: practice.updatedAt, scored: false };
  }

  private async memberView(resource: any, studentId: string) {
    const practice = resource.kind === "TEST" ? null : await this.db.classResourcePractice.findUnique({ where: { resourceId_studentId: { resourceId: resource.id, studentId } }, select: { state: true, updatedAt: true } });
    return { ...resource, content: resource.kind === "TEST" ? null : studentResource(resource.kind, resource.content), practice: practice ? { ...practice, scored: false } : null };
  }

  private async assertMember(classId: string, studentId: string) {
    const enrollment = await this.db.enrollment.findUnique({ where: { classId_studentId: { classId, studentId } }, select: { status: true } });
    if (enrollment?.status !== "approved") throw this.denied();
  }

  private async assertLesson(classId: string, lessonId: string | null, teacherId: string) {
    if (!lessonId) return;
    const lesson = await this.db.lesson.findFirst({ where: { id: lessonId, OR: [{ scope: "SHARED_LIBRARY", status: "published" }, { authorId: teacherId }] }, select: { id: true } });
    if (!lesson) throw new BadRequestException({ code: "LESSON_NOT_AVAILABLE", message: "Bài học liên kết không khả dụng" });
  }

  private itemCount(resource: any) { return resource.kind === "DECK" ? resource.content.cards.length : resource.content.questions.length; }
  private denied() { return new ForbiddenException({ code: "CLASS_RESOURCE_ACCESS_DENIED", message: "Không có quyền truy cập tài nguyên lớp này" }); }
}
