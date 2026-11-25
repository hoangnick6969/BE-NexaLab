import { Inject, Injectable, Optional } from "@nestjs/common";
import { createHash } from "node:crypto";
import { stableStringify } from "../../../common/idempotency";
import { audit } from "../../../common/audit";
import { AI_LAB_CHALLENGE_CONFIG, parseAiLabChallengeConfig, type AiLabChallengeConfig } from "../../../config/ai-lab-challenge";
import { idempotent, readIdempotencyKey, TX_LIMITS } from "../../../common/idempotency";
import { Db } from "../../../db/db";
import { ownedClass } from "../../classes/application/class-access";
import { classArchived, lock } from "../../classes/application/class-common";
import { assertClassLesson, lessonNotAvailable } from "../../classes/application/class-lesson";
import { applyLessonChallenge, lessonChallengeBlocker, lessonNotEditable } from "../../lessons/application/lesson-challenge";
import { aiOfferedLabs, challengeObjective } from "../../lessons/application/lesson-content";
import type { AiConfig } from "./ai-config";
import {
  aiJobNotFound,
  aiJobNotReviewable,
  aiProviderNotConfigured,
  aiQuotaExceeded,
  idempotencyKeyRequired,
  toAiJobView,
  type CreateAiJobBody,
} from "./ai-job-contract";
import { AI_CONFIG, AI_PROVIDER, type AiProvider } from "./ai-provider";
import { DAY_MS, quotaUsage } from "./ai-quota";
import { confirmedCreditsRequired } from "./credits-contract";
import { AiCreditsService } from "./credits.service";
import {
  LAB_CHALLENGE_PROMPT_VERSION,
  LAB_CHALLENGE_PURPOSE,
  LAB_CHALLENGE_SCHEMA_VERSION,
  aiDecisionNotAllowed,
  aiJobAlreadyApplied,
  aiNoApprovedModels,
  aiProposalNoLongerValid,
  labChallengeProposalsV1,
  labDecisionBody,
  normalizeLabChallengeBody,
  type LabChallengeBody,
} from "./lab-challenge-contract";
import type { LabChallengeSnapshotV1 } from "./lab-challenge-prompt";
import { buildLabChallengeSnapshot, lessonPartDigest, offeredModels, rangeReasons } from "./lab-challenge-validation";
import { loadLabContexts } from "./lab-reference-states";
import { loadLessonSource, loadOutcomeStatements } from "./lesson-source";

const proposalItem = labChallengeProposalsV1.shape.proposals.element;

/** Offered lab ids (range review approved or team-lead default), the labs whose contexts a job loads. */
const offeredLabIds = () => aiOfferedLabs().map(([labId]) => labId);

/**
 * TAI-06 DRAFT_LAB_CHALLENGE routes behind the TAI-01 job routes (AiJobsService delegates here by purpose). The
 * owner-only denial rules are the TAI-01 ones: 403 CLASS_ACCESS_DENIED for a missing or not-owned class, 404 for a
 * missing job inside an owned class, 400 LESSON_NOT_AVAILABLE for an inaccessible lesson. The apply route is the only
 * writer to the lesson and goes through the lessons application function; nothing here writes Lab, Challenge or
 * simulation rows.
 */
@Injectable()
export class AiLabChallengesService {
  private labConfig: AiLabChallengeConfig;

  constructor(
    @Inject(Db) private db: Db,
    @Inject(AI_CONFIG) private config: AiConfig,
    @Inject(AI_PROVIDER) private provider: AiProvider | null,
    @Optional() @Inject(AI_LAB_CHALLENGE_CONFIG) labConfig?: AiLabChallengeConfig,
    @Optional() @Inject(AiCreditsService) private credits?: AiCreditsService,
  ) {
    this.labConfig = labConfig ?? parseAiLabChallengeConfig({});
  }

  private get creditsOn() {
    return !!this.credits?.enabled;
  }

  get limits() {
    return { daily: this.labConfig.dailyLimit, concurrency: this.labConfig.concurrentLimit };
  }

  async create(classId: string, req: any, body: Extract<CreateAiJobBody, { purpose: "DRAFT_LAB_CHALLENGE" }>) {
    const key = readIdempotencyKey(req);
    if (!key) throw idempotencyKeyRequired();
    const classroom = await ownedClass(this.db, classId, req.user);
    if (classroom.status !== "ACTIVE") throw classArchived();
    await assertClassLesson(this.db, body.lessonId, req.user.sub);
    const blocker = await lessonChallengeBlocker(this.db, body.lessonId, req.user.sub);
    if (blocker === "NOT_FOUND") throw lessonNotAvailable();
    if (blocker === "NOT_EDITABLE") throw lessonNotEditable();
    const lesson = await loadLessonSource(this.db, body.lessonId);
    if (!lesson) throw lessonNotAvailable();
    if (!this.provider || !this.config.provider || !this.config.model) throw aiProviderNotConfigured();
    const credits = this.creditsOn ? this.credits! : null;
    if (credits && body.confirmedCredits === undefined) throw confirmedCreditsRequired();

    const models = offeredModels(await loadLabContexts(this.db, offeredLabIds()));
    if (models.length === 0) throw aiNoApprovedModels();
    const request = normalizeLabChallengeBody(body as LabChallengeBody);
    const snapshot = buildLabChallengeSnapshot(lesson, await loadOutcomeStatements(this.db, lesson, null), models, request);
    const digest = createHash("sha256").update(stableStringify(snapshot)).digest("hex");
    const actorId = req.user.sub as string;
    const ctx = { actorId, key, scope: `POST classes/${classId}/ai-jobs`, payload: { ...request, confirmedCredits: credits ? body.confirmedCredits : undefined } };
    if (credits) await credits.ensureStarter(actorId);
    return idempotent(this.db, ctx, async (tx) => {
      await lock(tx, `ai-quota:${actorId}:${request.purpose}`);
      const usage = await quotaUsage(tx, actorId, request.purpose, this.config, new Date(), this.limits);
      if (usage.usedLast24h >= usage.dailyLimit || (usage.concurrencyLimit !== null && usage.activeJobs >= usage.concurrencyLimit))
        throw aiQuotaExceeded(request.purpose, usage.resetsAt ?? new Date(Date.now() + DAY_MS));
      const quote = credits ? await credits.confirm(tx, request.purpose, request.itemCount, body.confirmedCredits!) : null;
      const job = await tx.aiJob.create({
        data: {
          classId, actorId, purpose: request.purpose, targetKind: null, lessonId: request.lessonId,
          request, inputSnapshot: snapshot, inputDigest: digest,
          promptVersion: LAB_CHALLENGE_PROMPT_VERSION, outputSchemaVersion: LAB_CHALLENGE_SCHEMA_VERSION,
          provider: this.config.provider!, model: this.config.model!,
          ...(quote ? { pricingVersionId: quote.price.id, estimatedCredits: quote.credits } : {}),
        },
      });
      if (quote) await credits!.reserve(tx, { jobId: job.id, actorId, credits: quote.credits, pricingVersionId: quote.price.id });
      await audit(tx, {
        actor: req.user, action: "ai_job.create", targetType: "AiJob", targetId: job.id,
        after: { classId, purpose: request.purpose, lessonId: request.lessonId, itemCount: request.itemCount, promptVersion: job.promptVersion, model: job.model },
      });
      return this.view(job, { lessonChanged: false, itemCount: 0 });
    });
  }

  async list(classId: string, req: any, query: { limit: number; cursor?: string }) {
    await ownedClass(this.db, classId, req.user);
    if (query.cursor && !(await this.db.aiJob.findFirst({ where: { id: query.cursor, classId }, select: { id: true } }))) throw aiJobNotFound();
    const rows = await this.db.aiJob.findMany({
      where: { classId, purpose: LAB_CHALLENGE_PURPOSE },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: query.limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      include: { _count: { select: { items: true } } },
    });
    const page = rows.slice(0, query.limit);
    return {
      items: page.map((job: any) => this.view(job, { lessonChanged: false, itemCount: job._count.items })),
      nextCursor: rows.length > query.limit ? page[page.length - 1].id : null,
    };
  }

  /** Detail view for a lab job already loaded with items and their latest decision. */
  async detail(job: any) {
    return this.view(job, { lessonChanged: await this.lessonChanged(job), items: job.items ?? [] });
  }

  /** True when the lesson text, passages or outcomes sent to the provider differ from the lesson now (a deleted lesson counts). */
  private async lessonChanged(job: any) {
    const stored = job.inputSnapshot as LabChallengeSnapshotV1 | null;
    const lesson = await loadLessonSource(this.db, job.lessonId);
    if (!lesson || !stored?.lesson) return true;
    const statements = await loadOutcomeStatements(this.db, lesson, null);
    const rebuilt = buildLabChallengeSnapshot(lesson, statements, [], { instruction: null, proposalCount: 1 });
    return lessonPartDigest(rebuilt) !== lessonPartDigest(stored);
  }

  /** TAI-06 job view: the TAI-01 fields plus the proposals with engine evidence (teacher-only; never a student read model). */
  private view(job: any, options: { lessonChanged: boolean; items?: any[]; itemCount?: number }) {
    const base = toAiJobView(job, { lessonChangedSinceGeneration: options.lessonChanged, itemCount: options.items?.length ?? options.itemCount, credits: this.creditsOn });
    const dropped = Array.isArray(job.droppedItems) ? job.droppedItems : [];
    return {
      ...base,
      purpose: job.purpose as string,
      requestedCount: Number((job.request as { proposalCount?: unknown })?.proposalCount ?? base.requestedCount),
      appliedLessonId: (job.appliedLessonId ?? null) as string | null,
      appliedItemId: (job.appliedItemId ?? null) as string | null,
      dropped: (job.status === "SUCCEEDED" || job.failureCode === "OUTPUT_VALIDATION_FAILED") ? dropped : [],
      ...(options.items
        ? {
            proposals: options.items.map((item: any) => {
              const latest = item.decisions?.[0];
              const flags = (item.flags && !Array.isArray(item.flags) ? item.flags : {}) as Record<string, unknown>;
              return {
                id: item.id,
                position: item.position,
                proposal: item.payload as object,
                objectivePreview: (flags.objectivePreview as string | undefined) ?? null,
                engineResults: (flags.engineResults as unknown[] | undefined) ?? [],
                engineVersion: (flags.engineVersion as string | undefined) ?? null,
                modelRef: (flags.modelRef as string | undefined) ?? null,
                referenceSource: (flags.referenceSource as string | undefined) ?? null,
                decision: latest ? { decision: latest.decision as string, reasonCode: latest.reasonCode as string | null, at: (latest.createdAt as Date).toISOString() } : null,
              };
            }),
          }
        : {}),
    };
  }

  /** `{ decision: "REJECTED", reasonCode }` only (append-only, latest wins). Accepting is the apply route. */
  async reject(classId: string, jobId: string, itemId: string, req: any, raw: unknown) {
    const parsed = labDecisionBody.safeParse(raw);
    if (!parsed.success) throw aiDecisionNotAllowed();
    const classroom = await ownedClass(this.db, classId, req.user);
    if (classroom.status !== "ACTIVE") throw classArchived();
    await this.db.$transaction(async (tx: any) => {
      await lock(tx, `ai-job:${jobId}`);
      const job = await tx.aiJob.findFirst({ where: { id: jobId, classId, purpose: LAB_CHALLENGE_PURPOSE }, select: { status: true, appliedItemId: true } });
      if (!job) throw aiJobNotFound();
      if (job.appliedItemId) throw aiJobAlreadyApplied();
      if (job.status !== "SUCCEEDED") throw aiJobNotReviewable();
      const item = await tx.aiJobItem.findFirst({ where: { id: itemId, jobId }, select: { id: true, position: true } });
      if (!item) throw aiJobNotFound();
      await tx.aiItemDecision.create({ data: { itemId, actorId: req.user.sub, decision: "REJECTED", reasonCode: parsed.data.reasonCode } });
      await audit(tx, {
        actor: req.user, action: "ai_item.decide", targetType: "AiJobItem", targetId: itemId,
        after: { jobId, position: item.position, decision: "REJECTED", reasonCode: parsed.data.reasonCode },
      });
    }, TX_LIMITS);
  }

  /**
   * Applies one proposal to the draft lesson in one transaction (contract "apply"): the lesson must still be an
   * editable draft, LV-01..LV-03 run again against the current allowlist and pack ranges, the lesson is updated through
   * the lessons application function, an ACCEPTED decision is recorded and the single apply is linked on the job.
   */
  async apply(classId: string, jobId: string, itemId: string, req: any) {
    const key = readIdempotencyKey(req);
    if (!key) throw idempotencyKeyRequired();
    const classroom = await ownedClass(this.db, classId, req.user);
    if (classroom.status !== "ACTIVE") throw classArchived();
    const ctx = { actorId: req.user.sub as string, key, scope: `POST classes/${classId}/ai-jobs/${jobId}/items/${itemId}/apply`, payload: { jobId, itemId } };
    return idempotent(this.db, ctx, async (tx) => {
      await lock(tx, `ai-job:${jobId}`);
      const job = await tx.aiJob.findFirst({ where: { id: jobId, classId, purpose: LAB_CHALLENGE_PURPOSE }, select: { id: true, status: true, lessonId: true, appliedItemId: true } });
      if (!job) throw aiJobNotFound();
      if (job.appliedItemId) throw aiJobAlreadyApplied();
      if (job.status !== "SUCCEEDED") throw aiJobNotReviewable();
      const item = await tx.aiJobItem.findFirst({ where: { id: itemId, jobId }, select: { id: true, position: true, payload: true, flags: true } });
      if (!item) throw aiJobNotFound();
      const blocker = await lessonChallengeBlocker(tx, job.lessonId, req.user.sub);
      if (blocker === "NOT_FOUND") throw lessonNotAvailable();
      if (blocker === "NOT_EDITABLE") throw lessonNotEditable();
      const proposal = proposalItem.safeParse(item.payload);
      if (!proposal.success) throw aiProposalNoLongerValid();
      const { labId, challengeParams } = proposal.data;
      const models = offeredModels(await loadLabContexts(tx, offeredLabIds()));
      if (rangeReasons(labId, challengeParams, models).length > 0) throw aiProposalNoLongerValid();

      const lesson = await applyLessonChallenge(tx, req.user, job.lessonId, { labId, challengeParams });
      await tx.aiItemDecision.create({ data: { itemId, actorId: req.user.sub, decision: "ACCEPTED" } });
      const linked = await tx.aiJob.updateMany({ where: { id: jobId, appliedItemId: null }, data: { appliedLessonId: lesson.id, appliedItemId: itemId } });
      if (linked.count !== 1) throw aiJobAlreadyApplied();
      const flags = (item.flags && !Array.isArray(item.flags) ? item.flags : {}) as { modelRef?: string; engineVersion?: string };
      await audit(tx, {
        actor: req.user, action: "ai_proposal.apply", targetType: "AiJob", targetId: jobId,
        after: {
          jobId, lessonId: lesson.id, labId,
          challengeParams: Object.entries(challengeParams).map(([name, value]) => `${name}=${value}`),
          modelRef: flags.modelRef ?? null, engineVersion: flags.engineVersion ?? null,
        },
      });
      return {
        jobId,
        itemId,
        lesson: { id: lesson.id, labId: lesson.labId as string | null, challengeParams: lesson.challengeParams as Record<string, number | string> | null, status: lesson.status as string },
        objectivePreview: challengeObjective(labId, challengeParams),
      };
    });
  }
}
