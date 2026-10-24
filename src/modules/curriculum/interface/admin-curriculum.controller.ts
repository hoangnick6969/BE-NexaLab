import { BadRequestException, Body, ConflictException, Controller, Delete, Get, Inject, Param, Post, Put, Req } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { z } from "zod";
import { code, notFound, reason, text } from "../../../common/admin-api";
import { Roles } from "../../../common/decorators";
import { audit, changedFields } from "../../../common/audit";
import { Db } from "../../../db/db";
import { DOMAINS, domainSchema } from "../../lessons/application/lesson-content";

const ebookUrl = z.string().url().refine((value) => new URL(value).protocol === "https:", "Liên kết ebook phải dùng HTTPS").nullable().optional();

export function curriculumTargetInfo(env: NodeJS.ProcessEnv = process.env) {
  const environment = env.APP_ENV ?? "";
  const values = [env.DATABASE_URL, env.DIRECT_URL];
  const connections = values.map((value) => {
    if (!value) return null;
    try {
      const url = new URL(value);
      if (!["postgres:", "postgresql:"].includes(url.protocol)) return null;
      const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
      const username = decodeURIComponent(url.username);
      const projectRef = host.match(/^db\.([a-z0-9]+)\.supabase\.co$/)?.[1] ?? username.match(/^postgres\.([a-z0-9]+)$/)?.[1] ?? null;
      return { host, projectRef };
    } catch {
      return null;
    }
  });
  const loopback = new Set(["localhost", "127.0.0.1", "::1"]);
  const projectRefs = connections.map((item) => item?.projectRef).filter((item): item is string => Boolean(item));
  const projectRef = projectRefs.length === 2 && projectRefs[0] === projectRefs[1] ? projectRefs[0] : null;
  const allowlistedRefs = new Set((env.CURRICULUM_REMOTE_DEVELOPMENT_PROJECT_REFS ?? "").split(",").map((item) => item.trim()).filter(Boolean));
  return {
    environment,
    configuredConnections: connections.filter(Boolean).length,
    localDevelopmentTarget: environment === "development" && connections.length === 2 && connections.every((item) => item !== null && loopback.has(item.host)),
    remoteDevelopmentTarget: environment === "development" && projectRef !== null && allowlistedRefs.has(projectRef),
    projectRef,
  };
}

/**
 * Epic C2 admin console API. Every route is ADMIN-only (other roles get 403 from
 * the guard), every mutation and every audit read writes an AuditLog row in the
 * same transaction, and no operation edits evidence or attests a review.
 */
@ApiTags("Admin")
@ApiBearerAuth()
@Roles("ADMIN")
@Controller("admin")
export class AdminCurriculumController {
  constructor(@Inject(Db) private db: Db) {}

  // ───────────────────────── C2-T2 taxonomy ─────────────────────────
  @Get("taxonomy")
  @ApiOperation({ summary: "Subjects, chapters, topics and outcomes with usage counts" })
  async taxonomy() {
    const [frameworks, subjects, chapters, topics, outcomes, lessons] = await Promise.all([
      this.db.curriculumFramework.findMany({ include: { subjects: { select: { subjectId: true, grade: true } } }, orderBy: [{ title: "asc" }, { version: "asc" }] }),
      this.db.subject.findMany({ include: { _count: { select: { lessons: true, labs: true } } }, orderBy: { id: "asc" } }),
      this.db.curriculumChapter.findMany({ orderBy: [{ grade: "asc" }, { code: "asc" }] }),
      this.db.curriculumTopic.findMany({ orderBy: { code: "asc" } }),
      this.db.curriculumOutcome.findMany({ orderBy: [{ grade: "asc" }, { code: "asc" }] }),
      this.db.lesson.findMany({ select: { outcomeCodes: true } }),
    ]);
    const usage = new Map<string, number>();
    for (const lesson of lessons) for (const c of (lesson.outcomeCodes as string[]) ?? []) usage.set(c, (usage.get(c) ?? 0) + 1);
    return {
      domains: DOMAINS,
      frameworks,
      subjects: subjects.map(({ _count, ...s }) => ({ ...s, lessons: _count.lessons, labs: _count.labs })),
      chapters,
      topics,
      outcomes: outcomes.map((o) => ({ ...o, lessons: usage.get(o.code) ?? 0 })),
    };
  }
  @Get("curriculum-target")
  @ApiOperation({ summary: "Return sanitized database target safety for local curriculum sync" })
  curriculumTarget() {
    return curriculumTargetInfo();
  }
  @Post("frameworks")
  @ApiOperation({ summary: "Create an immutable curriculum framework version with verified source provenance" })
  async createFramework(@Req() req: any, @Body() body: unknown) {
    const b = z.object({
      id: code,
      frameworkKey: code,
      title: text,
      version: z.string().trim().min(1).max(40),
      sourceMetadata: z.object({
        authority: z.string().trim().min(2).max(200),
        url: z.string().url().max(500).refine((value) => new URL(value).protocol === "https:", "Curriculum source must use HTTPS"),
        publishedAt: z.string().trim().min(4).max(40),
        accessedAt: z.string().trim().min(4).max(40),
        sha256: z.string().regex(/^[a-fA-F0-9]{64}$/),
      }).strict(),
      subjects: z.array(z.object({ subjectId: text, grade: z.number().int().min(8).max(9) }).strict()).min(1).max(50),
      reason: reason.optional(),
    }).strict().parse(body);
    if (new Set(b.subjects.map((item) => `${item.subjectId}:${item.grade}`)).size !== b.subjects.length)
      throw new BadRequestException({ code: "DUPLICATE_FRAMEWORK_SUBJECT", message: "Framework subject/grade entries must be unique" });
    return this.db.$transaction(async (tx) => {
      if (await tx.curriculumFramework.findUnique({ where: { id: b.id } }) || await tx.curriculumFramework.findFirst({ where: { frameworkKey: b.frameworkKey, version: b.version } }))
        throw new ConflictException({ code: "FRAMEWORK_EXISTS", message: `Mã framework "${b.id}" đã tồn tại; không ghi đè` });
      const available = await tx.subject.findMany({ where: { id: { in: b.subjects.map((item) => item.subjectId) } }, select: { id: true } });
      const missing = b.subjects.map((item) => item.subjectId).filter((id) => !available.some((item) => item.id === id));
      if (missing.length) throw notFound(`môn học: ${missing.join(", ")}`);
      const { reason: why, ...data } = b;
      const framework = await tx.curriculumFramework.create({ data: { ...data, subjects: { create: b.subjects } }, include: { subjects: { select: { subjectId: true, grade: true } } } });
      await audit(tx, {
        actor: req.user,
        action: "curriculumFramework.create",
        targetType: "CurriculumFramework",
        targetId: b.id,
        reason: why,
        after: { title: b.title, version: b.version, sourceMetadata: b.sourceMetadata, subjects: b.subjects },
      });
      return framework;
    });
  }
  @Post("subjects")
  async createSubject(@Req() req: any, @Body() body: unknown) {
    const b = z.object({ id: code, name: text, ebookUrl, reason: reason.optional() }).strict().parse(body);
    return this.db.$transaction(async (tx) => {
      if (await tx.subject.findUnique({ where: { id: b.id } }))
        throw new ConflictException({ code: "SUBJECT_EXISTS", message: `Mã môn "${b.id}" đã tồn tại; không ghi đè` });
      const subject = await tx.subject.create({ data: { id: b.id, name: b.name, ebookUrl: b.ebookUrl ?? null } });
      await audit(tx, {
        actor: req.user,
        action: "subject.create",
        targetType: "Subject",
        targetId: b.id,
        reason: b.reason,
        after: { name: b.name, ebookUrl: b.ebookUrl ?? null },
      });
      return subject;
    });
  }
  @Put("subjects/:id")
  async updateSubject(@Param("id") id: string, @Req() req: any, @Body() body: unknown) {
    const b = z.object({ name: text, ebookUrl, reason: reason.optional() }).strict().parse(body);
    return this.db.$transaction(async (tx) => {
      const before = await tx.subject.findUnique({ where: { id } });
      if (!before) throw notFound("môn học");
      const subject = await tx.subject.update({
        where: { id },
        data: { name: b.name, ...(b.ebookUrl !== undefined ? { ebookUrl: b.ebookUrl } : {}) },
      });
      await audit(tx, {
        actor: req.user,
        action: "subject.update",
        targetType: "Subject",
        targetId: id,
        reason: b.reason,
        before: { name: before.name, ebookUrl: before.ebookUrl },
        after: { name: b.name, ebookUrl: b.ebookUrl !== undefined ? b.ebookUrl : before.ebookUrl },
      });
      return subject;
    });
  }
  @Delete("subjects/:id")
  async deleteSubject(@Param("id") id: string, @Req() req: any, @Body() body: unknown) {
    const b = z
      .object({ reason, confirm: z.literal(true) })
      .strict()
      .parse(body ?? {});
    return this.db.$transaction(async (tx) => {
      const subject = await tx.subject.findUnique({ where: { id } });
      if (!subject) throw notFound("môn học");
      const [lessons, labs, chapters] = await Promise.all([
        tx.lesson.count({ where: { subjectId: id } }),
        tx.lab.count({ where: { subjectId: id } }),
        tx.curriculumChapter.count({ where: { subjectId: id } }),
      ]);
      const frameworks = await tx.curriculumFrameworkSubject.count({ where: { subjectId: id } });
      if (lessons + labs + chapters + frameworks)
        throw new ConflictException({
          code: "SUBJECT_IN_USE",
          message: "Môn học còn bài học, phòng thực hành hoặc chương; không thể xóa",
          details: { lessons, labs, chapters, frameworks },
        });
      await tx.subject.delete({ where: { id } });
      await audit(tx, {
        actor: req.user,
        action: "subject.delete",
        targetType: "Subject",
        targetId: id,
        reason: b.reason,
        before: { name: subject.name },
      });
      return { deleted: true, id };
    });
  }
  @Post("chapters")
  async createChapter(@Req() req: any, @Body() body: unknown) {
    const b = z
      .object({
        code,
        subjectId: text,
        grade: z.number().int().min(8).max(9),
        domain: domainSchema,
        title: text,
        reason: reason.optional(),
      })
      .strict()
      .parse(body);
    return this.db.$transaction(async (tx) => {
      if (await tx.curriculumChapter.findUnique({ where: { code: b.code } }))
        throw new ConflictException({ code: "CHAPTER_EXISTS", message: `Mã chương "${b.code}" đã tồn tại; không ghi đè` });
      if (!(await tx.subject.findUnique({ where: { id: b.subjectId } }))) throw notFound("môn học");
      const { reason: why, ...data } = b;
      const chapter = await tx.curriculumChapter.create({ data });
      await audit(tx, {
        actor: req.user,
        action: "chapter.create",
        targetType: "CurriculumChapter",
        targetId: b.code,
        reason: why,
        after: { title: b.title, grade: b.grade, domain: b.domain },
      });
      return chapter;
    });
  }
  @Put("chapters/:code")
  async updateChapter(@Param("code") chapterCode: string, @Req() req: any, @Body() body: unknown) {
    const b = z
      .object({ title: text, status: z.enum(["active", "archived"]), reason })
      .strict()
      .parse(body);
    return this.db.$transaction(async (tx) => {
      const before = await tx.curriculumChapter.findUnique({ where: { code: chapterCode } });
      if (!before) throw notFound("chương");
      const chapter = await tx.curriculumChapter.update({ where: { code: chapterCode }, data: { title: b.title, status: b.status } });
      const diff = changedFields(before, chapter);
      await audit(tx, {
        actor: req.user,
        action: "chapter.update",
        targetType: "CurriculumChapter",
        targetId: chapterCode,
        reason: b.reason,
        ...diff,
      });
      return chapter;
    });
  }
  @Post("topics")
  async createTopic(@Req() req: any, @Body() body: unknown) {
    const b = z
      .object({ code, chapterCode: code, title: text, outcomeCodes: z.array(code).max(30).default([]), reason: reason.optional() })
      .strict()
      .parse(body);
    return this.db.$transaction(async (tx) => {
      if (await tx.curriculumTopic.findUnique({ where: { code: b.code } }))
        throw new ConflictException({ code: "TOPIC_EXISTS", message: `Mã chủ đề "${b.code}" đã tồn tại; không ghi đè` });
      const chapter = await tx.curriculumChapter.findUnique({ where: { code: b.chapterCode } });
      if (!chapter || chapter.status !== "active")
        throw new BadRequestException({ code: "CHAPTER_UNAVAILABLE", message: "Chương không tồn tại hoặc đã lưu trữ" });
      await this.assertOutcomes(tx, b.outcomeCodes, chapter, []);
      const { reason: why, ...data } = b;
      const topic = await tx.curriculumTopic.create({ data });
      await audit(tx, {
        actor: req.user,
        action: "topic.create",
        targetType: "CurriculumTopic",
        targetId: b.code,
        reason: why,
        after: { title: b.title, outcomeCodes: b.outcomeCodes },
      });
      return topic;
    });
  }
  @Put("topics/:code")
  async updateTopic(@Param("code") topicCode: string, @Req() req: any, @Body() body: unknown) {
    const b = z
      .object({ title: text, outcomeCodes: z.array(code).max(30), status: z.enum(["active", "archived"]), reason })
      .strict()
      .parse(body);
    return this.db.$transaction(async (tx) => {
      const before = await tx.curriculumTopic.findUnique({ where: { code: topicCode }, include: { chapter: true } });
      if (!before) throw notFound("chủ đề");
      await this.assertOutcomes(tx, b.outcomeCodes, before.chapter, (before.outcomeCodes as string[]) ?? []);
      const topic = await tx.curriculumTopic.update({
        where: { code: topicCode },
        data: { title: b.title, outcomeCodes: b.outcomeCodes, status: b.status },
      });
      const diff = changedFields(before, topic);
      await audit(tx, {
        actor: req.user,
        action: "topic.update",
        targetType: "CurriculumTopic",
        targetId: topicCode,
        reason: b.reason,
        ...diff,
      });
      return topic;
    });
  }
  /** Topic → outcome mapping stays traceable: codes exist, match the chapter's grade/domain and are active (unless already mapped). */
  private async assertOutcomes(tx: any, codes: string[], chapter: { grade: number; domain: string }, kept: string[]) {
    if (new Set(codes).size !== codes.length)
      throw new BadRequestException({ code: "INVALID_OUTCOME", message: "Yêu cầu cần đạt bị trùng" });
    const outcomes = await tx.curriculumOutcome.findMany({ where: { code: { in: codes } } });
    const invalid = codes.filter((c) => {
      const o = outcomes.find((item: any) => item.code === c);
      return !o || o.grade !== chapter.grade || o.domain !== chapter.domain || (o.status !== "active" && !kept.includes(c));
    });
    if (invalid.length)
      throw new BadRequestException({
        code: "INVALID_OUTCOME",
        message: "Yêu cầu cần đạt không tồn tại, đã lưu trữ hoặc khác khối/mạch: " + invalid.join(", "),
        details: { invalid },
      });
  }
  @Post("outcomes")
  async createOutcome(@Req() req: any, @Body() body: unknown) {
    const b = z
      .object({
        code,
        grade: z.number().int().min(8).max(9),
        domain: domainSchema,
        chapter: text,
        statement: z.string().trim().min(5).max(1000),
        reason: reason.optional(),
      })
      .strict()
      .parse(body);
    return this.db.$transaction(async (tx) => {
      if (await tx.curriculumOutcome.findUnique({ where: { code: b.code } }))
        throw new ConflictException({ code: "OUTCOME_EXISTS", message: `Mã yêu cầu cần đạt "${b.code}" đã tồn tại; không ghi đè` });
      const { reason: why, ...data } = b;
      const outcome = await tx.curriculumOutcome.create({ data });
      await audit(tx, {
        actor: req.user,
        action: "outcome.create",
        targetType: "CurriculumOutcome",
        targetId: b.code,
        reason: why,
        after: { grade: b.grade, domain: b.domain },
      });
      return outcome;
    });
  }
  @Put("outcomes/:code")
  @ApiOperation({ summary: "Archive/restore an outcome; its statement changes only while no lesson or topic maps it" })
  async updateOutcome(@Param("code") outcomeCode: string, @Req() req: any, @Body() body: unknown) {
    const b = z
      .object({ statement: z.string().trim().min(5).max(1000), status: z.enum(["active", "archived"]), reason })
      .strict()
      .parse(body);
    return this.db.$transaction(async (tx) => {
      const before = await tx.curriculumOutcome.findUnique({ where: { code: outcomeCode } });
      if (!before) throw notFound("yêu cầu cần đạt");
      if (before.statement !== b.statement) {
        const [lessons, topics] = await Promise.all([
          tx.lesson.count({ where: { outcomeCodes: { array_contains: [outcomeCode] } } }),
          tx.curriculumTopic.count({ where: { outcomeCodes: { array_contains: [outcomeCode] } } }),
        ]);
        if (lessons + topics)
          throw new ConflictException({
            code: "OUTCOME_IN_USE",
            message: "Yêu cầu cần đạt đang được bài học hoặc chủ đề tham chiếu; hãy lưu trữ và tạo mã mới thay vì sửa nội dung",
            details: { lessons, topics },
          });
      }
      const outcome = await tx.curriculumOutcome.update({
        where: { code: outcomeCode },
        data: { statement: b.statement, status: b.status },
      });
      await audit(tx, {
        actor: req.user,
        action: "outcome.update",
        targetType: "CurriculumOutcome",
        targetId: outcomeCode,
        reason: b.reason,
        before: { status: before.status },
        after: { status: outcome.status, statementChanged: before.statement !== outcome.statement },
      });
      return outcome;
    });
  }
}
