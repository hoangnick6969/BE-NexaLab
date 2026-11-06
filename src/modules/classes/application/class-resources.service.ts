import { Injectable, BadRequestException, Body, ConflictException, Controller, ForbiddenException, Get, Inject, NotFoundException, Param, Post, Put, Req } from "@nestjs/common";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { audit } from "../../../common/audit";
import { idempotent, readIdempotencyKey, TX_LIMITS } from "../../../common/idempotency";
import { Db } from "../../../db/db";
import { ownedClass } from "./class-access";
import { classArchived, lock } from "./class-common";
import { normalizeResourceContent, parseResourceCsv, practiceKind, ResourceKind, resourceKindSchema, studentResource, labResourceContentSchema, verifyClassLabSnapshot } from "./class-resource-contract";
import { buildLabResource, validateResourceAttachment } from "./class-lab-resource";
import { assertClassLesson } from "./class-lesson";
import { notify } from "../../notifications/application/notify";
import { checkQuestionDuplicates, resourceFingerprintItems, syncClassResourceFingerprints } from "../../ai/application/question-fingerprints";

const additionalAnswersSchema = z.object({
  assignmentId: z.string().trim().min(1).max(100).optional(),
  answers: z.array(z.object({ promptId: z.string().trim().min(1).max(32), answer: z.string().trim().min(1).max(10_000) }).strict()).min(1).max(20),
}).strict();
const gradeResponseSchema = z.object({ score: z.number().int().min(0).max(100), feedback: z.string().trim().max(2_000).optional() }).strict();

const kindSchema = resourceKindSchema;
const csvKindSchema = z.enum(["DECK", "STUDY_QUIZ", "TEST"]);
const titleSchema = z.string().trim().min(1).max(160);
const bodySchema = z.object({ kind: kindSchema, title: titleSchema, lessonId: z.string().min(1), content: z.unknown() }).strict();
/** TAI3-T2 duplicate-check body; `title` optionally excludes the resource's own revise lineage. */
const duplicateCheckSchema = z.object({
  kind: kindSchema,
  items: z.array(z.object({ text: z.string().trim().min(1).max(500) }).strict()).min(1).max(100),
  title: titleSchema.optional(),
}).strict();
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
    // Read-only qdup@1 warnings, computed before the write; they never block (TAI3-T2).
    const duplicateWarnings = await this.duplicateWarnings(classId, req.user.sub, b.kind, content, b.title);
    const ctx = { actorId: req.user.sub, key: readIdempotencyKey(req), scope: `POST classes/${classId}/resources`, payload: { ...b, content } };
    return idempotent(this.db, ctx, async (tx) => {
      const created = await tx.classResource.create({ data: { classId, kind: b.kind, title: b.title, lessonId: b.lessonId, content, createdById: req.user.sub }, select: resourceSelect });
      await syncClassResourceFingerprints(tx, created.id);
      await audit(tx, { actor: req.user, action: "class_resource.create", targetType: "ClassResource", targetId: created.id, after: { classId, resourceKind: b.kind, resourceVersion: 1, itemCount: this.itemCount(created) } });
      return { ...created, duplicateWarnings };
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
    const duplicateWarnings = await this.duplicateWarnings(classId, req.user.sub, b.kind, content, b.title, existing.title);
    return this.db.$transaction(async (tx) => {
      const changed = await tx.classResource.updateMany({ where: { id: resourceId, classId, status: "DRAFT" }, data: { kind: b.kind, title: b.title, lessonId: b.lessonId, content } });
      if (!changed.count) throw new ConflictException({ code: "RESOURCE_VERSION_IMMUTABLE", message: "Bản đã xuất bản hoặc lưu trữ không thể sửa" });
      const updated = await tx.classResource.findUnique({ where: { id: resourceId }, select: resourceSelect });
      await syncClassResourceFingerprints(tx, resourceId);
      await audit(tx, { actor: req.user, action: "class_resource.update_draft", targetType: "ClassResource", targetId: resourceId, before: { resourceKind: existing.kind, resourceVersion: existing.version }, after: { resourceKind: b.kind, resourceVersion: existing.version, itemCount: this.itemCount(updated) } });
      return { ...updated, duplicateWarnings };
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
        const current = await buildLabResource(tx, { source: content.source, learningObjective: content.learningObjective, instructions: content.instructions, reportPrompts: content.reportPrompts, customParams: content.customParams });
        if (current.executionDigest !== content.executionDigest) throw new ConflictException({ code: "LAB_SOURCE_CHANGED" });
      }
      if (existing.kind === "DOCUMENT" || existing.kind === "REPORT_TEMPLATE") await validateResourceAttachment(tx, existing.content, req.user.sub);
      const changed = await tx.classResource.updateMany({ where: { id: resourceId, classId, status: "DRAFT" }, data: { status: "PUBLISHED", publishedAt: new Date() } });
      if (!changed.count) throw new ConflictException({ code: "RESOURCE_NOT_DRAFT", message: "Chỉ có thể xuất bản bản nháp" });
      const updated = await tx.classResource.findUnique({ where: { id: resourceId }, select: resourceSelect });
      await syncClassResourceFingerprints(tx, resourceId);
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
      const source = await tx.classResource.findFirst({ where: { id: resourceId, classId, status: { in: ["PUBLISHED", "ARCHIVED"] } } });
      if (!source) throw this.denied();
      const version = await tx.classResource.aggregate({ where: { classId, kind: source.kind, title: source.title }, _max: { version: true } });
      const draft = await tx.classResource.create({ data: { classId, kind: source.kind, title: source.title, lessonId: source.lessonId, version: (version._max.version ?? source.version) + 1, content: source.content as Prisma.InputJsonValue, createdById: req.user.sub }, select: resourceSelect });
      await syncClassResourceFingerprints(tx, draft.id);
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
      await syncClassResourceFingerprints(tx, resourceId);
      await audit(tx, { actor: req.user, action: "class_resource.archive", targetType: "ClassResource", targetId: resourceId, after: { classId, resourceKind: source.kind, resourceVersion: source.version } });
      return updated;
    });
  }

  async deleteDraft(classId: string, resourceId: string, req: any) {
    const c = await ownedClass(this.db, classId, req.user);
    if (c.status !== "ACTIVE") throw classArchived();
    return this.db.$transaction(async (tx) => {
      const resource = await tx.classResource.findFirst({ where: { id: resourceId, classId } });
      if (!resource) throw this.denied();
      if (resource.status !== "DRAFT") throw new ConflictException({ code: "RESOURCE_VERSION_IMMUTABLE" });
      const deleted = await tx.classResource.deleteMany({ where: { id: resourceId, classId, status: "DRAFT" } });
      if (!deleted.count) throw new ConflictException({ code: "RESOURCE_VERSION_IMMUTABLE" });
      await audit(tx, { actor: req.user, action: "class_resource.delete_draft", targetType: "ClassResource", targetId: resourceId, before: { classId, resourceKind: resource.kind, resourceVersion: resource.version } });
      return { deleted: true };
    });
  }

  async previewImport(classId: string, req: any, body: unknown) {
    const b = z.object({ kind: csvKindSchema, filename: z.string().trim().min(1).max(200), csv: z.string().max(1_000_000) }).strict().parse(body);
    const c = await ownedClass(this.db, classId, req.user);
    if (c.status !== "ACTIVE") throw classArchived();
    if (!b.filename.toLowerCase().endsWith(".csv")) throw new BadRequestException({ code: "IMPORT_FORMAT_UNSUPPORTED", message: "Increment này chỉ hỗ trợ CSV UTF-8" });
    const result = parseResourceCsv(b.kind, b.csv);
    const duplicateWarnings = result.data ? await this.duplicateWarnings(classId, req.user.sub, b.kind, result.data) : [];
    return { valid: result.errors.length === 0, itemCount: result.data ? this.itemCount({ kind: b.kind, content: result.data }) : 0, errors: result.errors, draft: null, duplicateWarnings };
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
      await syncClassResourceFingerprints(tx, created.id);
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

  async submitAdditionalResponse(classId: string, resourceId: string, req: any, body: unknown) {
    const b = additionalAnswersSchema.parse(body);
    const classroom = await this.db.classroom.findUnique({ where: { id: classId }, select: { status: true } });
    const resource = await this.db.classResource.findFirst({ where: { id: resourceId, classId, kind: "LAB", status: "PUBLISHED" } });
    if (!classroom || classroom.status !== "ACTIVE" || !resource) throw this.denied();
    await this.assertMember(classId, req.user.sub);
    const content = labResourceContentSchema.parse(resource.content);
    const prompts = content.reportPrompts.map((prompt, index) => ({ promptId: `prompt-${index + 1}`, prompt }));
    if (!prompts.length) throw new BadRequestException({ code: "CLASS_LAB_HAS_NO_ADDITIONAL_PROMPTS" });
    let assignment: any = null;
    if (b.assignmentId) {
      assignment = await this.db.assignment.findFirst({
        where: { id: b.assignmentId, classId, contentType: "lab", contentId: content.source.labId, status: "ACTIVE", classroom: { status: "ACTIVE" }, targets: { some: { studentId: req.user.sub } } },
      });
      if (!assignment || !assignment.classLabSnapshot) throw this.denied();
      const snapshot = verifyClassLabSnapshot(assignment.classLabSnapshot);
      if (snapshot.resourceId !== resource.id || snapshot.version !== resource.version) throw this.denied();
    }
    const answerIds = b.answers.map(({ promptId }) => promptId);
    if (new Set(answerIds).size !== answerIds.length || answerIds.length !== prompts.length || prompts.some(({ promptId }) => !answerIds.includes(promptId)))
      throw new BadRequestException({ code: "CLASS_LAB_ANSWERS_INVALID", message: "Cần trả lời đúng một lần cho mỗi câu hỏi bổ sung" });
    const orderedAnswers = prompts.map(({ promptId, prompt }) => {
      const answer = b.answers.find((item) => item.promptId === promptId)!;
      return { promptId, prompt, answer: answer.answer };
    });
    const key = readIdempotencyKey(req);
    const ctx = { actorId: req.user.sub, key, scope: `POST class-lab-additional-response:${resourceId}:${b.assignmentId ?? "practice"}`, payload: { answers: orderedAnswers } };
    return idempotent(this.db, ctx, async (tx) => {
      await lock(tx, `class-lab-response:${resourceId}:${b.assignmentId ?? "practice"}:${req.user.sub}`);
      const prior = await tx.classLabAdditionalResponse.findFirst({ where: { resourceId, assignmentId: b.assignmentId ?? null, studentId: req.user.sub }, orderBy: { attempt: "desc" }, select: { attempt: true } });
      const result = await tx.classLabAdditionalResponse.create({ data: {
        resourceId, assignmentId: b.assignmentId ?? null, studentId: req.user.sub, resourceVersion: resource.version,
        promptSnapshot: prompts, answers: orderedAnswers, attempt: (prior?.attempt ?? 0) + 1, idempotencyKey: key,
      }, include: { student: { select: { id: true, fullName: true, username: true } } } });
      await audit(tx, { actor: req.user, action: "class_lab.additional_response.submit", targetType: "ClassLabAdditionalResponse", targetId: result.id, after: { classId, resourceId, resourceVersion: resource.version, assignmentId: b.assignmentId ?? null, attempt: result.attempt } });
      return this.additionalResponseView(result);
    }, { isolationLevel: "Serializable" });
  }

  async myAdditionalResponses(classId: string, resourceId: string, req: any, assignmentId?: string) {
    await this.assertMember(classId, req.user.sub);
    const rows = await this.db.classLabAdditionalResponse.findMany({
      where: { resourceId, resource: { classId, kind: "LAB" }, studentId: req.user.sub, assignmentId: assignmentId ?? null },
      include: { student: { select: { id: true, fullName: true, username: true } } },
      orderBy: [{ attempt: "desc" }],
    });
    return rows.map((row: any) => this.additionalResponseView(row));
  }

  async listAdditionalResponses(classId: string, resourceId: string, req: any, assignmentId?: string) {
    const classroom = await this.db.classroom.findUnique({ where: { id: classId } });
    if (!classroom || classroom.teacherId !== req.user.sub) throw this.denied();
    const resource = await this.db.classResource.findFirst({ where: { id: resourceId, classId, kind: "LAB" } });
    if (!resource) throw this.denied();
    if (assignmentId) {
      const assignment = await this.db.assignment.findFirst({ where: { id: assignmentId, classId, contentType: "lab" } });
      if (!assignment?.classLabSnapshot || verifyClassLabSnapshot(assignment.classLabSnapshot).resourceId !== resourceId) throw this.denied();
    }
    const rows = await this.db.classLabAdditionalResponse.findMany({
      where: { resourceId, ...(assignmentId ? { assignmentId } : { assignmentId: null }) },
      include: { student: { select: { id: true, fullName: true, username: true } } },
      orderBy: [{ studentId: "asc" }, { attempt: "asc" }],
    });
    return rows.map((row: any) => this.additionalResponseView(row));
  }

  async gradeAdditionalResponse(classId: string, resourceId: string, responseId: string, req: any, body: unknown) {
    const b = gradeResponseSchema.parse(body);
    const classroom = await this.db.classroom.findUnique({ where: { id: classId } });
    if (!classroom || classroom.teacherId !== req.user.sub) throw this.denied();
    const response = await this.db.classLabAdditionalResponse.findFirst({ where: { id: responseId, resourceId, resource: { classId, kind: "LAB" } } });
    if (!response) throw this.denied();
    const saved = await this.db.$transaction(async (tx: any) => {
      const updated = await tx.classLabAdditionalResponse.update({ where: { id: responseId }, data: { score: b.score, feedback: b.feedback ?? null, gradedById: req.user.sub, gradedAt: new Date() }, include: { student: { select: { id: true, fullName: true, username: true } } } });
      await audit(tx, { actor: req.user, action: "class_lab.additional_response.grade", targetType: "ClassLabAdditionalResponse", targetId: responseId, before: { score: response.score, feedback: response.feedback }, after: { score: updated.score, feedback: updated.feedback } });
      return updated;
    }, TX_LIMITS);
    return this.additionalResponseView(saved);
  }

  private additionalResponseView(row: any) {
    return { id: row.id, resourceId: row.resourceId, assignmentId: row.assignmentId, resourceVersion: row.resourceVersion, attempt: row.attempt, promptSnapshot: row.promptSnapshot, answers: row.answers, submittedAt: row.submittedAt, student: row.student, grade: row.score === null ? null : { score: row.score, feedback: row.feedback, gradedAt: row.gradedAt } };
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

  private async assertLesson(_classId: string, lessonId: string | null, teacherId: string) {
    if (!lessonId) return;
    await assertClassLesson(this.db, lessonId, teacherId);
  }

  private async prepareContent(kind: z.infer<typeof kindSchema>, raw: unknown, ownerId: string): Promise<any> {
    if (kind === "LAB") return this.db.$transaction((tx) => buildLabResource(tx, raw), TX_LIMITS);
    const content = normalizeResourceContent(kind, raw);
    if (kind === "DOCUMENT" || kind === "REPORT_TEMPLATE") await validateResourceAttachment(this.db, content, ownerId);
    return content;
  }

  /** POST classes/:id/resources/duplicate-check (TAI3-T2): read-only, unaudited, never blocks. */
  async duplicateCheck(classId: string, req: any, body: unknown) {
    const b = duplicateCheckSchema.parse(body);
    await ownedClass(this.db, classId, req.user);
    const { warnings, truncated } = await checkQuestionDuplicates(this.db, {
      teacherId: req.user.sub,
      classId,
      texts: b.items.map((item) => item.text),
      lineage: b.title ? { kind: b.kind, title: b.title } : null,
    });
    return { algorithm: "qdup@1", warnings, ...(truncated ? { code: "CORPUS_TRUNCATED" } : {}) };
  }

  /** Warnings for normalized content; the resource's own lineage (same kind and title, plus its previous title) is excluded. */
  private async duplicateWarnings(classId: string, teacherId: string, kind: ResourceKind, content: unknown, title?: string, previousTitle?: string) {
    const texts = resourceFingerprintItems(kind, content).map((item) => item.text);
    if (!texts.length) return [];
    const { warnings } = await checkQuestionDuplicates(this.db, { teacherId, classId, texts, lineage: title ? { kind, title } : null });
    if (!previousTitle || previousTitle === title) return warnings;
    // A renamed draft still ignores rows of its own previous title in this class.
    const ownPrevious = (m: { source: { kind: string; classId?: string; title: string } }) =>
      m.source.kind === "CLASS_RESOURCE" && m.source.classId === classId && m.source.title === previousTitle;
    return warnings.map((w) => ({ ...w, matches: w.matches.filter((m) => !ownPrevious(m)) })).filter((w) => w.matches.length > 0);
  }

  private itemCount(resource: any) { return resource.kind === "DECK" ? resource.content.cards.length : ["TEST", "STUDY_QUIZ"].includes(resource.kind) ? resource.content.questions.length : 1; }

  private denied() { return new ForbiddenException({ code: "CLASS_RESOURCE_ACCESS_DENIED", message: "Không có quyền truy cập tài nguyên lớp này" }); }
}
