import { BadRequestException, Body, ConflictException, Controller, ForbiddenException, Get, Inject, NotFoundException, Param, Post, Put, Query, Req } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { z } from "zod";
import { Roles } from "../../../common/decorators";
import { applicableAssignmentWhere } from "../../classes/application/class-access";
import { audit, changedFields } from "../../../common/audit";
import { Db } from "../../../db/db";
import { idempotent, readIdempotencyKey } from "../../../common/idempotency";
import { text } from "../../../common/validation";
import { materializeLegacySteps } from "../application/pathway";
import { CHALLENGE_PARAMETERS, DOMAINS, RELEASE_REVIEW_KINDS, RELEASE_REVIEW_LABELS, assetIds, attribution, challengeObjective, challengeParamErrors, domainSchema, isStructureChange, materialVersionIds, publishBlockers, variantChallengeId } from "../application/lesson-content";
import { lessonSchema, publishedSteps } from "./lesson-schema";

@ApiTags("NexaLab")
@ApiBearerAuth()
@Controller()
export class LessonsController {
  constructor(@Inject(Db) private db: Db) {}
  private async validatePublishedResources(lesson: z.infer<typeof lessonSchema>, actor: { sub: string; role: string }, clonedFromId?: string | null) {
    if (lesson.status !== "published") return;
    if (lesson.labId) {
      const lab = await this.db.lab.findFirst({
        where: { id: lesson.labId, status: "published" },
        select: { id: true },
      });
      if (!lab)
        throw new BadRequestException({
          code: "INVALID_LESSON_PATHWAY",
          message: "Phòng lab tham chiếu chưa được xuất bản",
        });
    }
    const referenced = assetIds(lesson.materials);
    if (referenced.length) {
      const assets = await this.db.assetFile.findMany({
        where: { id: { in: referenced } },
        select: { id: true, ownerId: true, scope: true, status: true },
      });
      if (assets.some((asset) => asset.status === "QUARANTINED"))
        throw new BadRequestException({
          code: "ASSET_QUARANTINED",
          message: "Bài học tham chiếu tệp đang bị cách ly",
        });
      // A clone intentionally reuses the asset references of its source (D7).
      const inherited = new Set<string>();
      if (clonedFromId) {
        const source = await this.db.lesson.findUnique({
          where: { id: clonedFromId },
          select: { materials: true },
        });
        for (const id of assetIds((source?.materials as any[]) ?? [])) inherited.add(id);
      }
      if (assets.length !== new Set(referenced).size || (actor.role !== "ADMIN" && assets.some((asset) => asset.ownerId !== actor.sub && asset.scope !== "SHARED_LIBRARY" && !inherited.has(asset.id))))
        throw new BadRequestException({
          code: "INVALID_LESSON_PATHWAY",
          message: "Tài nguyên bài học không tồn tại hoặc không thuộc quyền sử dụng",
        });
    }
    // CF-T2: published content pins READY immutable versions of active assets.
    const pinned = materialVersionIds(lesson.materials);
    if (pinned.length) {
      const versions = await this.db.assetVersion.findMany({
        where: { id: { in: pinned } },
        include: { asset: true },
      });
      if (versions.some((v) => v.asset.status === "QUARANTINED" || v.status === "QUARANTINED"))
        throw new BadRequestException({
          code: "ASSET_QUARANTINED",
          message: "Bài học tham chiếu tệp đang bị cách ly",
        });
      const inherited = new Set<string>();
      if (clonedFromId) {
        const source = await this.db.lesson.findUnique({
          where: { id: clonedFromId },
          select: { materials: true },
        });
        for (const id of materialVersionIds((source?.materials as any[]) ?? [])) inherited.add(id);
      }
      if (versions.length !== new Set(pinned).size || versions.some((v) => v.status !== "READY" || v.asset.status !== "ACTIVE") || (actor.role !== "ADMIN" && versions.some((v) => v.asset.ownerId !== actor.sub && v.asset.scope !== "SHARED_LIBRARY" && !inherited.has(v.id))))
        throw new BadRequestException({
          code: "INVALID_LESSON_PATHWAY",
          message: "Tệp bài học chưa sẵn sàng, không tồn tại hoặc không thuộc quyền sử dụng",
        });
    }
  }
  // Parents read linked-child progress only (QR-03); class-private lessons must not reach them.
  @Roles("STUDENT", "TEACHER", "ADMIN") @Get("lessons") async lessons(@Req() req: any) {
    let assignedLessonIds: string[] | undefined;
    if (req.user.role === "STUDENT") {
      const assignments = await this.db.assignment.findMany({
        where: {
          ...applicableAssignmentWhere(req.user.sub),
          contentType: "lesson",
        },
        select: { contentId: true },
      });
      assignedLessonIds = assignments.map((assignment) => assignment.contentId);
    }
    const list = await this.db.lesson.findMany({
      where:
        req.user.role === "ADMIN"
          ? {}
          : req.user.role === "TEACHER"
            ? {
                OR: [{ status: "published", scope: "SHARED_LIBRARY" }, { authorId: req.user.sub }],
              }
            : {
                status: "published",
                synthetic: false,
                curriculumChapterCode: { not: null },
                curriculumTopicCode: { not: null },
                packVersion: {
                  status: "released",
                  synthetic: false,
                  pack: {
                    namespace: "baseline",
                    key: { not: { contains: "-pilot" } },
                  },
                },
                ...(assignedLessonIds ? { id: { in: assignedLessonIds } } : {}),
              },
      include: { subject: true },
      orderBy: { createdAt: "desc" },
    });
    return list.map((l) => ({
      ...l,
      questions: req.user.role === "STUDENT" ? (l.questions as any[]).map(({ answer, ...q }) => q) : l.questions,
    }));
  }
  private assertPublishable(data: z.infer<typeof lessonSchema>, scope: string) {
    if (data.status !== "published") return;
    const missing = publishBlockers(data as any, scope);
    if (missing.length)
      throw new BadRequestException({
        code: "PUBLISH_BLOCKED",
        message: "Chưa thể xuất bản. Còn thiếu: " + missing.join("; "),
        details: { missing },
      });
  }
  /** D7: a published lesson with an active assignment or any evidence keeps its structure. */
  private async structureLocked(lessonId: string, db: any = this.db) {
    const stepIds = (
      await db.lessonStep.findMany({
        where: { lessonId },
        select: { id: true },
      })
    ).map((step: any) => step.id);
    const [assignments, progress, quiz, practical] = await Promise.all([
      db.assignment.count({
        where: { contentType: "lesson", contentId: lessonId, status: "ACTIVE" },
      }),
      db.stepProgress.count({ where: { stepId: { in: stepIds } } }),
      db.quizAttempt.count({ where: { lessonId } }),
      db.attempt.count({ where: { lessonStepId: { in: stepIds } } }),
    ]);
    return assignments + progress + quiz + practical > 0;
  }
  /** structureLocked for many lessons in a fixed number of queries (the library lists every own lesson). */
  private async structureLockedIds(lessonIds: string[]) {
    if (!lessonIds.length) return new Set<string>();
    const steps = await this.db.lessonStep.findMany({
      where: { lessonId: { in: lessonIds } },
      select: { id: true, lessonId: true },
    });
    const lessonOfStep = new Map(steps.map((step: any) => [step.id, step.lessonId as string]));
    const stepIds = [...lessonOfStep.keys()];
    const [assignments, progress, quiz, practical] = await Promise.all([
      this.db.assignment.groupBy({
        by: ["contentId"],
        where: {
          contentType: "lesson",
          contentId: { in: lessonIds },
          status: "ACTIVE",
        },
      }),
      this.db.stepProgress.groupBy({
        by: ["stepId"],
        where: { stepId: { in: stepIds } },
      }),
      this.db.quizAttempt.groupBy({
        by: ["lessonId"],
        where: { lessonId: { in: lessonIds } },
      }),
      this.db.attempt.groupBy({
        by: ["lessonStepId"],
        where: { lessonStepId: { in: stepIds } },
      }),
    ]);
    return new Set<string>([...assignments.map((row: any) => row.contentId), ...quiz.map((row: any) => row.lessonId), ...[...progress.map((row: any) => row.stepId), ...practical.map((row: any) => row.lessonStepId)].map((stepId) => lessonOfStep.get(stepId)!)]);
  }
  private lessonAuditFields(lesson: any) {
    return {
      title: lesson.title,
      status: lesson.status,
      scope: lesson.scope,
      grade: lesson.grade,
      clonedFromId: lesson.clonedFromId,
      reviewChecklist: Boolean(lesson.review),
      domain: lesson.domain ?? null,
      outcomeCodes: lesson.outcomeCodes ?? [],
      challengeParams: lesson.challengeParams ?? null,
    };
  }
  /** Outcome codes must exist in the map for the lesson's grade; challenge parameters must be in range. */
  private async assertTaxonomy(data: z.infer<typeof lessonSchema>, alreadyMapped: string[] = []) {
    const errors = challengeParamErrors(data.labId, data.challengeParams);
    if (errors.length)
      throw new BadRequestException({
        code: "INVALID_CHALLENGE_PARAMS",
        message: errors.join("; "),
        details: { errors },
      });
    const codes = [...new Set(data.outcomeCodes)];
    if (codes.length !== data.outcomeCodes.length)
      throw new BadRequestException({
        code: "INVALID_OUTCOME",
        message: "Yêu cầu cần đạt bị trùng",
      });
    if (!codes.length) return;
    const outcomes = await this.db.curriculumOutcome.findMany({
      where: { code: { in: codes } },
    });
    const invalid = codes.filter((code) => {
      const outcome = outcomes.find((item) => item.code === code);
      // An archived outcome stays on lessons that already map it but cannot be newly mapped (C2-T2).
      return !outcome || outcome.grade !== data.grade || (data.domain && outcome.domain !== data.domain) || (outcome.status !== "active" && !alreadyMapped.includes(code));
    });
    if (invalid.length)
      throw new BadRequestException({
        code: "INVALID_OUTCOME",
        message: "Yêu cầu cần đạt không thuộc khối lớp hoặc mạch nội dung đã chọn: " + invalid.join(", "),
        details: { invalid },
      });
  }
  private async writeSteps(
    tx: any,
    lessonId: string,
    steps: ReturnType<typeof publishedSteps>,
    variant?: {
      labId?: string | null;
      challengeParams?: Record<string, number | string> | null;
    },
  ) {
    if (steps.length && variant?.labId && variant.challengeParams) {
      // A teacher variant gets its own challenge row; the shared model is untouched.
      const challengeId = variantChallengeId(variant.labId, lessonId);
      const challenge = {
        objective: challengeObjective(variant.labId, variant.challengeParams),
        constraints: {
          params: variant.challengeParams,
          modelRef: CHALLENGE_PARAMETERS[variant.labId].modelRef,
        } as any,
      };
      await tx.challenge.upsert({
        where: { id: challengeId },
        create: { id: challengeId, labId: variant.labId, ...challenge },
        update: challenge,
      });
      steps = [
        ...steps,
        {
          type: "CHALLENGE",
          position: 60,
          required: true,
          config: { challengeId },
        },
      ] as typeof steps;
    }
    const stepRows = steps.map((step) => ({
      ...step,
      id: `step-${lessonId}-${step.type.toLowerCase().replace("_", "-")}`,
      lessonId,
      config: step.config as any,
    }));
    if (!stepRows.length) return;
    await tx.lessonStep.deleteMany({
      where: { lessonId, id: { notIn: stepRows.map((step) => step.id) } },
    });
    for (const step of stepRows)
      await tx.lessonStep.upsert({
        where: { id: step.id },
        create: step,
        update: {
          type: step.type,
          position: step.position,
          required: step.required,
          config: step.config,
        },
      });
  }
  @Roles("TEACHER", "ADMIN") @Post("lessons") async createLesson(@Body() b: unknown, @Req() req: any) {
    const { scope: requestedScope, ...data } = lessonSchema.parse(b);
    if (requestedScope === "SHARED_LIBRARY" && req.user.role !== "ADMIN")
      throw new ForbiddenException({
        code: "BASELINE_READ_ONLY",
        message: "Chỉ quản trị viên tạo bài cho thư viện chung",
      });
    const scope = requestedScope ?? "TEACHER_PRIVATE";
    await this.assertTaxonomy(data);
    this.assertPublishable(data, scope);
    const steps = publishedSteps(data);
    await this.validatePublishedResources(data, req.user);
    return this.db.$transaction(async (tx) => {
      const lesson = await tx.lesson.create({
        data: {
          ...data,
          review: (data.review ?? undefined) as any,
          challengeParams: (data.challengeParams ?? undefined) as any,
          authorId: req.user.sub,
          scope,
          publishedAt: data.status === "published" ? new Date() : null,
        },
      });
      await this.writeSteps(tx, lesson.id, steps, data);
      await audit(tx, {
        actor: req.user,
        action: "lesson.create",
        targetType: "Lesson",
        targetId: lesson.id,
        after: this.lessonAuditFields(lesson),
      });
      return lesson;
    });
  }
  @Roles("TEACHER", "ADMIN") @Put("lessons/:id") async updateLesson(@Param("id") id: string, @Body() b: unknown, @Req() req: any) {
    const l = await this.db.lesson.findUnique({ where: { id } });
    if (!l || (l.authorId !== req.user.sub && req.user.role !== "ADMIN"))
      throw new ForbiddenException({
        code: "LESSON_ACCESS_DENIED",
        message: "Bạn chỉ sửa được bài học của mình",
      });
    // C2-T2: an admin operates another teacher's private content (inspect, quarantine,
    // archive, reassign) but never rewrites its body.
    if (req.user.role === "ADMIN" && l.scope !== "SHARED_LIBRARY" && l.authorId !== req.user.sub)
      throw new ForbiddenException({
        code: "PRIVATE_CONTENT_READ_ONLY",
        message: "Quản trị viên không sửa nội dung riêng của giáo viên; hãy dùng thao tác quản trị có lý do",
      });
    if (l.status === "quarantined")
      throw new ConflictException({
        code: "CONTENT_QUARANTINED",
        message: "Bài học đang bị cách ly; quản trị viên cần gỡ cách ly trước",
      });
    if (l.scope === "SHARED_LIBRARY" && req.user.role !== "ADMIN")
      throw new ForbiddenException({
        code: "BASELINE_READ_ONLY",
        message: "Bài nền dùng chung không sửa trực tiếp; hãy tạo bản riêng để tùy biến",
      });
    const { scope: _ignoredScope, ...parsed } = lessonSchema.parse(b);
    await this.assertTaxonomy(parsed, (l.outcomeCodes as string[]) ?? []);
    // Structural edits invalidate earlier shared-library release reviews.
    const reviewsStale = l.scope === "SHARED_LIBRARY" && isStructureChange(l as any, parsed as any);
    const data = {
      ...parsed,
      releaseReview: reviewsStale ? null : l.releaseReview,
    };
    this.assertPublishable(data as any, l.scope);
    const locked = l.status !== "draft" && (await this.structureLocked(id));
    if (locked) {
      if (isStructureChange(l as any, data as any))
        throw new ConflictException({
          code: "LESSON_STRUCTURE_LOCKED",
          message: "Bài đã được giao hoặc đã có kết quả học tập; hãy tạo bản sao để thay đổi nội dung, câu hỏi hoặc phòng thực hành",
        });
      if (data.status === "draft")
        throw new ConflictException({
          code: "LESSON_STRUCTURE_LOCKED",
          message: "Bài đang được dùng; chỉ có thể lưu trữ chứ không thể chuyển về bản nháp",
        });
    }
    const steps = publishedSteps(parsed, l.clonedFromId ? id : undefined);
    await this.validatePublishedResources(parsed, req.user, l.clonedFromId);
    return this.db.$transaction(async (tx) => {
      const lesson = await tx.lesson.update({
        where: { id },
        data: {
          ...parsed,
          review: (parsed.review ?? undefined) as any,
          challengeParams: (parsed.challengeParams ?? null) as any,
          releaseReview: (data.releaseReview ?? null) as any,
          publishedAt: data.status === "published" ? (l.publishedAt ?? new Date()) : l.publishedAt,
        },
      });
      // A locked structure is unchanged by definition; never rewrite its steps.
      if (!locked) await this.writeSteps(tx, id, steps, parsed);
      const action = l.status !== data.status ? (data.status === "published" ? "lesson.publish" : data.status === "archived" ? "lesson.archive" : "lesson.unpublish") : "lesson.update";
      const diff = changedFields(this.lessonAuditFields(l), this.lessonAuditFields(lesson));
      await audit(tx, {
        actor: req.user,
        action,
        targetType: "Lesson",
        targetId: id,
        before: diff.before,
        after: {
          ...(diff.after ?? {}),
          structureLocked: locked,
          ...(reviewsStale && l.releaseReview ? { releaseReviewsReset: true } : {}),
        },
      });
      return lesson;
    });
  }
  @Roles("TEACHER", "ADMIN")
  @Post("lessons/:id/clone")
  @ApiOperation({
    summary: "Create a private draft copy with new lesson/step/question IDs and reused asset references",
  })
  async cloneLesson(@Param("id") id: string, @Req() req: any) {
    const ctx = {
      actorId: req.user.sub,
      key: readIdempotencyKey(req),
      scope: "POST lessons/:id/clone",
      payload: { id },
    };
    return idempotent(this.db, ctx, async (tx) => {
      const source = await tx.lesson.findFirst({
        where:
          req.user.role === "ADMIN"
            ? { id }
            : {
                id,
                OR: [{ status: "published", scope: "SHARED_LIBRARY" }, { authorId: req.user.sub }],
              },
      });
      if (!source)
        throw new NotFoundException({
          code: "LESSON_NOT_FOUND",
          message: "Không tìm thấy bài học",
        });
      const clone = await tx.lesson.create({
        data: {
          subjectId: source.subjectId,
          authorId: req.user.sub,
          title: source.title + " (bản riêng)",
          chapter: source.chapter,
          grade: source.grade,
          topic: source.topic,
          learningObjective: source.learningObjective,
          prerequisites: source.prerequisites,
          curriculum: source.curriculum,
          content: source.content,
          labId: source.labId,
          materials: source.materials as any,
          questions: source.questions as any,
          domain: source.domain,
          outcomeCodes: source.outcomeCodes as any,
          challengeParams: (source.challengeParams ?? undefined) as any,
          status: "draft",
          scope: "TEACHER_PRIVATE",
          synthetic: source.synthetic,
          clonedFromId: source.id,
        },
      });
      await audit(tx, {
        actor: req.user,
        action: "lesson.clone",
        targetType: "Lesson",
        targetId: clone.id,
        after: {
          clonedFromId: source.id,
          scope: "TEACHER_PRIVATE",
          status: "draft",
          title: clone.title,
        },
      });
      return clone;
    });
  }
  @Roles("TEACHER", "ADMIN")
  @Get("teacher/content")
  @ApiOperation({
    summary: "Content library: shared baseline plus own content, with readiness and coverage by grade",
  })
  async teacherContent(@Req() req: any, @Query() query: unknown) {
    const q = z
      .object({
        grade: z.coerce.number().int().min(6).max(9).optional(),
        subjectId: z.string().max(100).optional(),
        chapter: z.string().max(200).optional(),
        topic: z.string().max(200).optional(),
        domain: domainSchema.optional(),
        outcome: z.string().max(40).optional(),
        q: z.string().max(200).optional(),
        scope: z.enum(["SHARED_LIBRARY", "TEACHER_PRIVATE", "ALL"]).default("ALL"),
        status: z.enum(["draft", "published", "archived", "ALL"]).default("ALL"),
      })
      .strict()
      .parse(query);
    const visible = {
      OR: [{ status: "published", scope: "SHARED_LIBRARY" }, { authorId: req.user.sub }],
    };
    const rows = await this.db.lesson.findMany({
      where: {
        AND: [
          visible,
          q.grade ? { grade: q.grade } : {},
          q.subjectId ? { subjectId: q.subjectId } : {},
          q.chapter ? { chapter: { contains: q.chapter, mode: "insensitive" } } : {},
          q.topic ? { topic: { contains: q.topic, mode: "insensitive" } } : {},
          q.domain ? { domain: q.domain } : {},
          q.outcome ? { outcomeCodes: { array_contains: [q.outcome] } } : {},
          q.q
            ? {
                OR: [{ title: { contains: q.q, mode: "insensitive" } }, { learningObjective: { contains: q.q, mode: "insensitive" } }],
              }
            : {},
          q.scope === "ALL" ? {} : { scope: q.scope },
          q.status === "ALL" ? {} : { status: q.status },
        ],
      },
      include: { subject: { select: { id: true, name: true } } },
      orderBy: [{ grade: "asc" }, { chapter: "asc" }, { title: "asc" }],
    });
    const locked = await this.structureLockedIds(rows.filter((lesson) => lesson.authorId === req.user.sub && lesson.status !== "draft").map((lesson) => lesson.id));
    const items: any[] = [];
    for (const lesson of rows) {
      const own = lesson.authorId === req.user.sub;
      items.push({
        id: lesson.id,
        title: lesson.title,
        subject: lesson.subject,
        grade: lesson.grade,
        chapter: lesson.chapter,
        topic: lesson.topic,
        learningObjective: lesson.learningObjective,
        domain: lesson.domain,
        outcomeCodes: lesson.outcomeCodes,
        hasChallengeVariant: lesson.challengeParams != null,
        attribution: attribution(lesson),
        status: lesson.status,
        scope: lesson.scope,
        synthetic: lesson.synthetic,
        own,
        editable: own && lesson.scope === "TEACHER_PRIVATE",
        clonedFromId: lesson.clonedFromId,
        structureLocked: locked.has(lesson.id),
        publishBlockers: (own || req.user.role === "ADMIN") && lesson.status === "draft" ? publishBlockers(lesson as any, lesson.scope) : [],
        releaseReview: lesson.scope === "SHARED_LIBRARY" ? this.releaseReviewView(lesson.releaseReview) : null,
        updatedAt: lesson.updatedAt,
      });
    }
    return {
      items,
      ...(await this.libraryCoverage(req.user.sub)),
      taxonomy: this.taxonomy(),
    };
  }
  private taxonomy() {
    return {
      domains: Object.entries(DOMAINS).map(([id, label]) => ({ id, label })),
      challengeParameters: CHALLENGE_PARAMETERS,
    };
  }
  private releaseReviewView(value: unknown) {
    const reviews = (value ?? {}) as Record<string, any>;
    return RELEASE_REVIEW_KINDS.map((kind) => ({
      kind,
      label: RELEASE_REVIEW_LABELS[kind],
      reviewerName: reviews[kind]?.reviewerName ?? null,
      at: reviews[kind]?.at ?? null,
    }));
  }
  /**
   * Coverage per grade × domain over the outcome map. Released numbers use only
   * the released (non-synthetic) map and released baseline lessons; when no
   * released map exists the denominator is null and the fixture map is shown
   * separately, so a fixture is never reported as corpus coverage (CF-T5).
   */
  private async libraryCoverage(teacherId: string) {
    const [outcomes, lessons] = await Promise.all([
      this.db.curriculumOutcome.findMany({
        where: { grade: { in: [8, 9] } },
        orderBy: { code: "asc" },
      }),
      this.db.lesson.findMany({
        where: {
          grade: { in: [8, 9] },
          OR: [{ status: "published", scope: "SHARED_LIBRARY" }, { authorId: teacherId }],
        },
        select: {
          grade: true,
          status: true,
          scope: true,
          synthetic: true,
          authorId: true,
          outcomeCodes: true,
        },
      }),
    ]);
    const covered = (filter: (lesson: (typeof lessons)[number]) => boolean) => new Set(lessons.filter(filter).flatMap((lesson) => (lesson.outcomeCodes as string[]) ?? []));
    const released = covered((l) => l.scope === "SHARED_LIBRARY" && l.status === "published" && !l.synthetic);
    const fixture = covered((l) => l.scope === "SHARED_LIBRARY" && l.status === "published");
    const own = covered((l) => l.authorId === teacherId && l.status === "published");
    const metric = (map: typeof outcomes, set: Set<string>) =>
      map.length
        ? {
            covered: map.filter((o) => set.has(o.code)).length,
            total: map.length,
            gaps: map.filter((o) => !set.has(o.code)).map((o) => o.code),
          }
        : null;
    const coverage = [8, 9].flatMap((grade) =>
      (Object.keys(DOMAINS) as Array<keyof typeof DOMAINS>).map((domain) => {
        const cell = outcomes.filter((o) => o.grade === grade && o.domain === domain);
        const releasedMap = cell.filter((o) => !o.synthetic);
        const fixtureMap = cell.filter((o) => o.synthetic);
        const ofGrade = lessons.filter((l) => l.grade === grade);
        return {
          grade,
          domain,
          domainLabel: DOMAINS[domain],
          releasedBaseline: metric(releasedMap, released),
          ownPublished: metric(releasedMap, own),
          fixture: metric(fixtureMap, fixture),
          releasedLessons: ofGrade.filter((l) => l.scope === "SHARED_LIBRARY" && l.status === "published" && !l.synthetic).length,
        };
      }),
    );
    const releasedMapSize = outcomes.filter((o) => !o.synthetic).length;
    return {
      coverage,
      outcomes: outcomes.map(({ code, grade, domain, chapter, statement, synthetic }) => ({
        code,
        grade,
        domain,
        chapter,
        statement,
        synthetic,
      })),
      coverageNote: releasedMapSize ? "Mỗi ô là số yêu cầu cần đạt có bài đã phát hành trên tổng số yêu cầu của mạch nội dung; danh sách còn thiếu hiển thị riêng." : "Chưa có bản đồ yêu cầu cần đạt lớp 8–9 được phát hành (Content Foundation CF-T5); số liệu bản đồ mẫu chỉ phục vụ phát triển, không phải tỉ lệ bao phủ.",
    };
  }
  /** Readable lesson for the library: shared published baseline or own content (admin: any). */
  private async libraryLesson(id: string, user: { sub: string; role: string }) {
    const lesson = await this.db.lesson.findFirst({
      where:
        user.role === "ADMIN"
          ? { id }
          : {
              id,
              OR: [{ status: "published", scope: "SHARED_LIBRARY" }, { authorId: user.sub }],
            },
      include: { subject: { select: { id: true, name: true } } },
    });
    if (!lesson)
      throw new NotFoundException({
        code: "LESSON_NOT_FOUND",
        message: "Không tìm thấy bài học",
      });
    return lesson;
  }
  @Roles("TEACHER", "ADMIN")
  @Get("teacher/content/:id/preview")
  @ApiOperation({
    summary: "Student-view preview with text alternatives for every step, attribution and readiness blockers",
  })
  async previewLesson(@Param("id") id: string, @Req() req: any) {
    const lesson = await this.libraryLesson(id, req.user);
    let steps: any[] = [];
    let pathwayError: string | null = null;
    try {
      steps = materializeLegacySteps(lesson as any);
    } catch {
      pathwayError = "Bài chưa đủ tài nguyên hợp lệ cho từng bước";
    }
    const lab = lesson.labId ? await this.db.lab.findUnique({ where: { id: lesson.labId } }) : null;
    const params = lesson.challengeParams as Record<string, number | string> | null;
    if (lab && params)
      steps.push({
        type: "CHALLENGE",
        position: 60,
        required: true,
        config: { challengeId: variantChallengeId(lab.id, lesson.id) },
      });
    const textOf = (html: string) =>
      html
        .replace(/<[^>]*>/g, " ")
        .replace(/\s+/g, " ")
        .trim();
    return {
      lesson: {
        id: lesson.id,
        title: lesson.title,
        subject: lesson.subject,
        grade: lesson.grade,
        chapter: lesson.chapter,
        topic: lesson.topic,
        learningObjective: lesson.learningObjective,
        domain: lesson.domain,
        domainLabel: lesson.domain ? (DOMAINS[lesson.domain as keyof typeof DOMAINS] ?? null) : null,
        outcomeCodes: lesson.outcomeCodes,
        status: lesson.status,
        scope: lesson.scope,
      },
      attribution: attribution(lesson),
      readiness: {
        ready: !publishBlockers(lesson as any, lesson.scope).length,
        blockers: publishBlockers(lesson as any, lesson.scope),
      },
      pathwayError,
      steps: steps.map((step) => {
        const config = step.config as any;
        const textAlternative = step.type === "READING" ? textOf(config.html ?? "") : step.type === "VIDEO" ? config.transcript || config.equivalentText || null : step.type === "QUIZ" ? `${config.questions?.length ?? 0} câu hỏi trắc nghiệm, đọc được bằng trình đọc màn hình.` : step.type === "LAB" ? `${lab?.title ?? "Phòng thực hành"}: ${lab?.learningObjective ?? ""}` : params && lab ? challengeObjective(lab.id, params) : null;
        return {
          type: step.type,
          position: step.position,
          title: step.type === "VIDEO" ? config.title : step.type === "LAB" ? (lab?.title ?? null) : step.type === "CHALLENGE" ? "Thử thách tùy chỉnh" : null,
          textAlternative,
          missingAlternative: !textAlternative,
        };
      }),
      materials: (lesson.materials as any[]).map(({ type, title, url, transcript }) => ({
        type,
        title,
        url,
        hasTranscript: Boolean(transcript?.trim()),
      })),
    };
  }
  @Roles("ADMIN")
  @Post("lessons/:id/release-reviews")
  @ApiOperation({
    summary: "Record one named shared-library release review (editorial/subject/rights/safety/model)",
  })
  async releaseReview(@Param("id") id: string, @Req() req: any, @Body() body: unknown) {
    const b = z
      .object({
        kind: z.enum(RELEASE_REVIEW_KINDS),
        note: z.string().trim().max(500).optional(),
      })
      .strict()
      .parse(body);
    return this.db.$transaction(async (tx) => {
      const lesson = await tx.lesson.findUnique({ where: { id } });
      if (!lesson)
        throw new NotFoundException({
          code: "LESSON_NOT_FOUND",
          message: "Không tìm thấy bài học",
        });
      if (lesson.scope !== "SHARED_LIBRARY")
        throw new BadRequestException({
          code: "NOT_SHARED_LIBRARY",
          message: "Bài riêng của giáo viên dùng phiếu tự kiểm duyệt",
        });
      if (b.kind === "model" && !lesson.labId)
        throw new BadRequestException({
          code: "NO_MODEL_TO_REVIEW",
          message: "Bài không có phòng thực hành để duyệt mô hình",
        });
      const reviewer = await tx.user.findUniqueOrThrow({
        where: { id: req.user.sub },
        select: { fullName: true },
      });
      const reviews = {
        ...((lesson.releaseReview ?? {}) as Record<string, unknown>),
      };
      reviews[b.kind] = {
        reviewerId: req.user.sub,
        reviewerName: reviewer.fullName,
        at: new Date().toISOString(),
        ...(b.note ? { note: b.note } : {}),
      };
      const updated = await tx.lesson.update({
        where: { id },
        data: { releaseReview: reviews as any },
      });
      await audit(tx, {
        actor: req.user,
        action: "lesson.release_review",
        targetType: "Lesson",
        targetId: id,
        after: { reviewKind: b.kind, scope: lesson.scope },
      });
      return {
        releaseReview: this.releaseReviewView(updated.releaseReview),
        publishBlockers: publishBlockers(updated as any, updated.scope),
      };
    });
  }
}
