import { Injectable, BadRequestException, Body, ConflictException, Controller, ForbiddenException, Get, Inject, NotFoundException, Param, Post, Put, Req } from "@nestjs/common";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { audit } from "../../../common/audit";
import { idempotent, readIdempotencyKey, TX_LIMITS } from "../../../common/idempotency";
import { Db } from "../../../db/db";
import { ownedClass } from "./class-access";
import { classArchived, lock } from "./class-common";
import { normalizeResourceContent, parseResourceCsv, practiceKind, resourceKindSchema, studentResource, labResourceContentSchema } from "./class-resource-contract";
import { buildLabResource, validateResourceAttachment } from "./class-lab-resource";
import { notify } from "../../notifications/application/notify";

const kindSchema = resourceKindSchema;
const csvKindSchema = z.enum(["DECK", "STUDY_QUIZ", "TEST"]);
const titleSchema = z.string().trim().min(1).max(160);
const bodySchema = z.object({ kind: kindSchema, title: titleSchema, lessonId: z.string().min(1), content: z.unknown() }).strict();
const resourceSelect = { id: true, classId: true, kind: true, title: true, lessonId: true, version: true, status: true, content: true, createdAt: true, publishedAt: true, archivedAt: true } as const;

/** Use cases behind ClassResourcesController (moved from the controller unchanged; repository ports are the next step). */
@Injectable()
export class ClassResourcesService {
  constructor(@Inject(Db) private db: Db) {}

  async list(classId: string, req: any) {
    const c = await this.db.classroom.findUnique({ where: { id: classId } });
    if (!c) throw this.denied();
    if (req.user.role === "TEACHER") {
      if (c.teacherId !== req.user.sub) throw this.denied();
      const rows = await this.db.classResource.findMany({ where: { classId }, select: resourceSelect, orderBy: [{ createdAt: "desc" }, { version: "desc" }] });
      return this.withAttachmentMetadataList(rows);
    }
    await this.assertMember(classId, req.user.sub);
    if (c.status !== "ACTIVE") throw this.denied();
    const rows = await this.db.classResource.findMany({ where: { classId, status: "PUBLISHED" }, select: resourceSelect, orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }] });
    const decorated = await this.withAttachmentMetadataList(rows);
    return Promise.all(decorated.map((resource) => this.memberView(resource, req.user.sub, true)));
  }

  async detail(classId: string, resourceId: string, req: any) {
    const c = await this.db.classroom.findUnique({ where: { id: classId } });
    const resource = await this.db.classResource.findFirst({ where: { id: resourceId, classId }, select: resourceSelect });
    if (!c || !resource) throw this.denied();
    if (req.user.role === "TEACHER") {
      if (c.teacherId !== req.user.sub) throw this.denied();
      return this.withAttachmentMetadata(resource);
    }
    await this.assertMember(classId, req.user.sub);
    if (c.status !== "ACTIVE" || resource.status !== "PUBLISHED") throw this.denied();
    return this.memberView(resource, req.user.sub);
  }

  async create(classId: string, req: any, body: unknown) {
    const b = bodySchema.parse(body);
    const c = await ownedClass(this.db, classId, req.user);
    if (c.status !== "ACTIVE") throw classArchived();
    const content = await this.prepareContent(b.kind, b.content, req.user.sub);
    await this.assertLesson(classId, b.lessonId, req.user.sub);
    const ctx = { actorId: req.user.sub, key: readIdempotencyKey(req), scope: `POST classes/${classId}/resources`, payload: { ...b, content } };
    return idempotent(this.db, ctx, async (tx) => {
      const created = await tx.classResource.create({ data: { classId, kind: b.kind, title: b.title, lessonId: b.lessonId, content, createdById: req.user.sub }, select: resourceSelect });
      await audit(tx, { actor: req.user, action: "class_resource.create", targetType: "ClassResource", targetId: created.id, after: { classId, resourceKind: b.kind, resourceVersion: 1, itemCount: this.itemCount(created) } });
      return created;
    });
  }

  async updateDraft(classId: string, resourceId: string, req: any, body: unknown) {
    const b = bodySchema.parse(body);
    const c = await ownedClass(this.db, classId, req.user);
    if (c.status !== "ACTIVE") throw classArchived();
    const existing = await this.db.classResource.findFirst({ where: { id: resourceId, classId } });
    if (!existing) throw this.denied();
    if (existing.status !== "DRAFT") throw new ConflictException({ code: "RESOURCE_VERSION_IMMUTABLE", message: "Bản đã xuất bản không sửa trực tiếp; hãy tạo bản nháp mới" });
    const content = await this.prepareContent(b.kind, b.content, req.user.sub);
    await this.assertLesson(classId, b.lessonId, req.user.sub);
    return this.db.$transaction(async (tx) => {
      const changed = await tx.classResource.updateMany({ where: { id: resourceId, classId, status: "DRAFT" }, data: { kind: b.kind, title: b.title, lessonId: b.lessonId, content } });
      if (!changed.count) throw new ConflictException({ code: "RESOURCE_VERSION_IMMUTABLE", message: "Bản đã xuất bản hoặc lưu trữ không thể sửa" });
      const updated = await tx.classResource.findUnique({ where: { id: resourceId }, select: resourceSelect });
      await audit(tx, { actor: req.user, action: "class_resource.update_draft", targetType: "ClassResource", targetId: resourceId, before: { resourceKind: existing.kind, resourceVersion: existing.version }, after: { resourceKind: b.kind, resourceVersion: existing.version, itemCount: this.itemCount(updated) } });
      return updated;
    });
  }

  async publish(classId: string, resourceId: string, req: any) {
    const c = await ownedClass(this.db, classId, req.user);
    if (c.status !== "ACTIVE") throw classArchived();
    return this.db.$transaction(async (tx) => {
      // Lock before reading so publication validates the exact draft it freezes.
      await tx.$queryRaw`SELECT id FROM "ClassResource" WHERE id = ${resourceId} AND "classId" = ${classId} FOR UPDATE`;
      const existing = await tx.classResource.findFirst({ where: { id: resourceId, classId } });
      if (!existing) throw this.denied();
      if (existing.status !== "DRAFT") throw new ConflictException({ code: "RESOURCE_NOT_DRAFT", message: "Chỉ có thể xuất bản bản nháp" });
      if (existing.kind === "LAB") {
        const content = labResourceContentSchema.parse(existing.content);
        const current = await buildLabResource(tx, { source: content.source, learningObjective: content.learningObjective, instructions: content.instructions, reportPrompts: content.reportPrompts });
        if (current.executionDigest !== content.executionDigest) throw new ConflictException({ code: "LAB_SOURCE_CHANGED" });
      }
      if (existing.kind === "DOCUMENT" || existing.kind === "REPORT_TEMPLATE") await validateResourceAttachment(tx, existing.content, req.user.sub);
      const changed = await tx.classResource.updateMany({ where: { id: resourceId, classId, status: "DRAFT" }, data: { status: "PUBLISHED", publishedAt: new Date() } });
      if (!changed.count) throw new ConflictException({ code: "RESOURCE_NOT_DRAFT", message: "Chỉ có thể xuất bản bản nháp" });
      const updated = await tx.classResource.findUnique({ where: { id: resourceId }, select: resourceSelect });
      await audit(tx, { actor: req.user, action: "class_resource.publish", targetType: "ClassResource", targetId: resourceId, after: { classId, resourceKind: existing.kind, resourceVersion: existing.version } });
      const members = await tx.enrollment.findMany({ where: { classId, status: "approved" }, select: { studentId: true } });
      await notify(tx, members.map((m) => ({ recipientId: m.studentId, type: "RESOURCE_PUBLISHED" as const, title: `Tài liệu mới trong lớp ${c.name}: ${existing.title}`, link: "/classes", dedupKey: `resource:${resourceId}` })));
      return updated;
    }, TX_LIMITS);
  }

  async revise(classId: string, resourceId: string, req: any) {
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

  async archive(classId: string, resourceId: string, req: any) {
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

  async previewImport(classId: string, req: any, body: unknown) {
    const b = z.object({ kind: csvKindSchema, filename: z.string().trim().min(1).max(200), csv: z.string().max(1_000_000) }).strict().parse(body);
    const c = await ownedClass(this.db, classId, req.user);
    if (c.status !== "ACTIVE") throw classArchived();
    if (!b.filename.toLowerCase().endsWith(".csv")) throw new BadRequestException({ code: "IMPORT_FORMAT_UNSUPPORTED", message: "Increment này chỉ hỗ trợ CSV UTF-8" });
    const result = parseResourceCsv(b.kind, b.csv);
    return { valid: result.errors.length === 0, itemCount: result.data ? this.itemCount({ kind: b.kind, content: result.data }) : 0, errors: result.errors, draft: null };
  }

  async importCsv(classId: string, req: any, body: unknown) {
    const b = z.object({ kind: csvKindSchema, title: titleSchema, lessonId: z.string().min(1), filename: z.string().trim().min(1).max(200), csv: z.string().max(1_000_000) }).strict().parse(body);
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

  async savePractice(classId: string, resourceId: string, req: any, body: unknown) {
    const b = z.object({ state: z.record(z.string(), z.unknown()).refine((state) => Buffer.byteLength(JSON.stringify(state)) <= 100_000, "Trạng thái luyện tập vượt quá 100 KB") }).strict().parse(body);
    const c = await this.db.classroom.findUnique({ where: { id: classId } });
    const resource = await this.db.classResource.findFirst({ where: { id: resourceId, classId, status: "PUBLISHED" } });
    if (!c || c.status !== "ACTIVE" || !resource || !practiceKind(resource.kind)) throw this.denied();
    await this.assertMember(classId, req.user.sub);
    const practice = await this.db.classResourcePractice.upsert({ where: { resourceId_studentId: { resourceId, studentId: req.user.sub } }, create: { resourceId, studentId: req.user.sub, state: b.state as Prisma.InputJsonValue }, update: { state: b.state as Prisma.InputJsonValue } });
    return { saved: true, updatedAt: practice.updatedAt, scored: false };
  }

  private async memberView(resource: any, studentId: string, metadataLoaded = false) {
    const practice = !practiceKind(resource.kind) ? null : await this.db.classResourcePractice.findUnique({ where: { resourceId_studentId: { resourceId: resource.id, studentId } }, select: { state: true, updatedAt: true } });
    return { ...(metadataLoaded ? resource : await this.withAttachmentMetadata(resource)), content: resource.kind === "TEST" ? null : studentResource(resource.kind, resource.content), practice: practice ? { ...practice, scored: false } : null };
  }

  private async withAttachmentMetadataList(resources: any[]) {
    const ids = [...new Set(resources.flatMap((resource) => ["DOCUMENT", "REPORT_TEMPLATE"].includes(resource.kind) && resource.content?.source?.type === "upload" ? [resource.content.source.assetVersionId as string] : []))];
    if (!ids.length) return resources;
    const versions = await this.db.assetVersion.findMany({ where: { id: { in: ids } }, select: { id: true, fileName: true, mime: true, bytes: true, status: true } });
    const attachments = new Map(versions.map(({ id, ...metadata }) => [id, metadata]));
    return resources.map((resource) => ["DOCUMENT", "REPORT_TEMPLATE"].includes(resource.kind) && resource.content?.source?.type === "upload" ? { ...resource, attachment: attachments.get(resource.content.source.assetVersionId) ?? null } : resource);
  }

  private async withAttachmentMetadata(resource: any) {
    if (!["DOCUMENT", "REPORT_TEMPLATE"].includes(resource.kind) || resource.content?.source?.type !== "upload") return resource;
    const attachment = await this.db.assetVersion.findUnique({ where: { id: resource.content.source.assetVersionId }, select: { fileName: true, mime: true, bytes: true, status: true } });
    return { ...resource, attachment };
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

  private async prepareContent(kind: z.infer<typeof kindSchema>, raw: unknown, ownerId: string): Promise<any> {
    if (kind === "LAB") return this.db.$transaction((tx) => buildLabResource(tx, raw), TX_LIMITS);
    const content = normalizeResourceContent(kind, raw);
    if (kind === "DOCUMENT" || kind === "REPORT_TEMPLATE") await validateResourceAttachment(this.db, content, ownerId);
    return content;
  }

  private itemCount(resource: any) { return resource.kind === "DECK" ? resource.content.cards.length : ["TEST", "STUDY_QUIZ"].includes(resource.kind) ? resource.content.questions.length : 1; }

  private denied() { return new ForbiddenException({ code: "CLASS_RESOURCE_ACCESS_DENIED", message: "Không có quyền truy cập tài nguyên lớp này" }); }
}
