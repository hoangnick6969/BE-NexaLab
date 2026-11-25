import { BadRequestException, Inject, Injectable, Optional } from "@nestjs/common";
import { createHash } from "node:crypto";
import { audit } from "../../../common/audit";
import { idempotent, readIdempotencyKey, stableStringify } from "../../../common/idempotency";
import { Db } from "../../../db/db";
import { ownedClass } from "../../classes/application/class-access";
import { classArchived, lock } from "../../classes/application/class-common";
import { assertClassLesson, lessonNotAvailable } from "../../classes/application/class-lesson";
import { eligibleLabs } from "../../classes/application/eligible-labs";
import type { AiConfig } from "./ai-config";
import {
  aiJobNotFound,
  aiProviderNotConfigured,
  aiQuotaExceeded,
  idempotencyKeyRequired,
  toAiJobView,
} from "./ai-job-contract";
import { AI_CONFIG, AI_PROVIDER, type AiProvider } from "./ai-provider";
import { DAY_MS, quotaUsage } from "./ai-quota";
import {
  ASSESSMENT_ITEMS_SCHEMA_VERSION,
  ASSESSMENT_PURPOSE,
  GENERATE_ASSESSMENT_PROMPT_VERSION,
  normalizeAssessmentBody,
  type AssessmentDraftBody,
} from "./assessment-blueprint";
import { buildAssessmentSnapshot, type AssessmentLab } from "./assessment-draft-output";
import { confirmedCreditsRequired } from "./credits-contract";
import { AiCreditsService } from "./credits.service";
import { loadLessonSource, loadOutcomeStatements } from "./lesson-source";

export const examLabUnavailable = () =>
  new BadRequestException({ code: "EXAM_LAB_UNAVAILABLE", message: "Lab đã chọn không còn đủ điều kiện để đưa vào đề kiểm tra" });
/** Item decisions and materialization belong to GENERATE_RESOURCE; an AI exam draft is edited in the exam editor instead. */
export const assessmentDraftNoDecisions = () =>
  new BadRequestException({
    code: "VALIDATION_FAILED",
    message: "Đề nháp do AI soạn được chỉnh sửa trong trình soạn đề, không duyệt từng mục",
    details: [{ path: "purpose", message: "GENERATE_ASSESSMENT has no item decisions" }],
  });

/**
 * TAI7-T5 GENERATE_ASSESSMENT routes behind the TAI-01 job routes (AiJobsService delegates here by purpose, like TAI-06).
 * Owner-only denial rules are the TAI-01 ones. The job never writes a ClassResource: its single item carries the draft paper
 * (already accepted by `normalizeExam`), the teacher loads it into the EXAM editor, edits it and saves it through the normal
 * resources route, so AI content enters the class only through that human step (AD-17).
 */
@Injectable()
export class AiAssessmentDraftsService {
  constructor(
    @Inject(Db) private db: Db,
    @Inject(AI_CONFIG) private config: AiConfig,
    @Inject(AI_PROVIDER) private provider: AiProvider | null,
    @Optional() @Inject(AiCreditsService) private credits?: AiCreditsService,
  ) {}

  private get creditsOn() {
    return !!this.credits?.enabled;
  }

  async create(classId: string, req: any, body: AssessmentDraftBody) {
    const key = readIdempotencyKey(req);
    if (!key) throw idempotencyKeyRequired();
    const classroom = await ownedClass(this.db, classId, req.user);
    if (classroom.status !== "ACTIVE") throw classArchived();
    await assertClassLesson(this.db, body.lessonId, req.user.sub);
    const lesson = await loadLessonSource(this.db, body.lessonId);
    if (!lesson) throw lessonNotAvailable();
    if (!this.provider || !this.config.provider || !this.config.model) throw aiProviderNotConfigured();
    const credits = this.creditsOn ? this.credits! : null;
    if (credits && body.confirmedCredits === undefined) throw confirmedCreditsRequired();

    // The Lab is the teacher's pick, checked against the same eligibility rule as the exam editor and the publisher.
    let lab: AssessmentLab | null = null;
    if (body.sections.lab) {
      const wanted = body.sections.lab;
      const found = (await eligibleLabs(this.db, [])).find((entry: any) => entry.id === wanted.labId && entry.release.id === wanted.releaseId);
      const challenge = found?.challenges.find((entry: any) => entry.id === wanted.challengeId);
      if (!found || !challenge) throw examLabUnavailable();
      lab = { ...wanted, labTitle: found.title, objective: (challenge.objective || found.title).trim() };
    }

    const request = normalizeAssessmentBody(body);
    const snapshot = buildAssessmentSnapshot(lesson, await loadOutcomeStatements(this.db, lesson, null), request, lab);
    const digest = createHash("sha256").update(stableStringify(snapshot)).digest("hex");
    const actorId = req.user.sub as string;
    const ctx = { actorId, key, scope: `POST classes/${classId}/ai-jobs`, payload: { ...request, confirmedCredits: credits ? body.confirmedCredits : undefined } };
    if (credits) await credits.ensureStarter(actorId);
    return idempotent(this.db, ctx, async (tx) => {
      await lock(tx, `ai-quota:${actorId}:${request.purpose}`);
      const usage = await quotaUsage(tx, actorId, request.purpose, this.config);
      if (usage.usedLast24h >= usage.dailyLimit || (usage.concurrencyLimit !== null && usage.activeJobs >= usage.concurrencyLimit))
        throw aiQuotaExceeded(request.purpose, usage.resetsAt ?? new Date(Date.now() + DAY_MS));
      const quote = credits ? await credits.confirm(tx, request.purpose, request.itemCount, body.confirmedCredits!) : null;
      const job = await tx.aiJob.create({
        data: {
          classId, actorId, purpose: ASSESSMENT_PURPOSE, targetKind: null, lessonId: request.lessonId,
          request, inputSnapshot: snapshot, inputDigest: digest,
          promptVersion: GENERATE_ASSESSMENT_PROMPT_VERSION, outputSchemaVersion: ASSESSMENT_ITEMS_SCHEMA_VERSION,
          provider: this.config.provider!, model: this.config.model!,
          ...(quote ? { pricingVersionId: quote.price.id, estimatedCredits: quote.credits } : {}),
        },
      });
      if (quote) await credits!.reserve(tx, { jobId: job.id, actorId, credits: quote.credits, pricingVersionId: quote.price.id });
      await audit(tx, {
        actor: req.user, action: "ai_job.create", targetType: "AiJob", targetId: job.id,
        after: { classId, purpose: request.purpose, lessonId: request.lessonId, assessmentType: request.assessmentType, itemCount: request.itemCount, promptVersion: job.promptVersion, model: job.model },
      });
      return this.view(job, { itemCount: 0 });
    });
  }

  async list(classId: string, req: any, query: { limit: number; cursor?: string }) {
    await ownedClass(this.db, classId, req.user);
    if (query.cursor && !(await this.db.aiJob.findFirst({ where: { id: query.cursor, classId }, select: { id: true } }))) throw aiJobNotFound();
    const rows = await this.db.aiJob.findMany({
      where: { classId, purpose: ASSESSMENT_PURPOSE },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: query.limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      include: { _count: { select: { items: true } } },
    });
    const page = rows.slice(0, query.limit);
    return {
      items: page.map((job: any) => this.view(job, { itemCount: job._count.items })),
      nextCursor: rows.length > query.limit ? page[page.length - 1].id : null,
    };
  }

  /** Detail with the single draft item; `validCount` counts surviving slots, not items. */
  detail(job: any) {
    return this.view(job, { items: job.items ?? [] });
  }

  private view(job: any, options: { itemCount?: number; items?: any[] }) {
    const base = toAiJobView(job, {
      lessonChangedSinceGeneration: false,
      ...(options.items ? { items: options.items } : { itemCount: options.itemCount ?? 0 }),
      credits: this.creditsOn,
    });
    const slots = (item: any) => (Array.isArray(item?.payload?.review?.items) ? item.payload.review.items.length : 0);
    const kept = options.items ? slots(options.items[0]) : null;
    return {
      ...base,
      purpose: job.purpose as string,
      assessmentType: (job.request as { assessmentType?: string } | null)?.assessmentType ?? null,
      validCount: kept !== null && job.status === "SUCCEEDED" ? kept : base.validCount,
    };
  }
}
