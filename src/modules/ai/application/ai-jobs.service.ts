import { Inject, Injectable, Optional } from "@nestjs/common";
import { AI_ASSESSMENT_CONFIG, assistActive, parseAiAssessmentConfig, type AiAssessmentConfig } from "../../../config/ai-assessment";
import { audit } from "../../../common/audit";
import { suggestionSelect, teacherSuggestionView } from "../../classes/application/assignment-written-ai";
import { idempotent, readIdempotencyKey, TX_LIMITS } from "../../../common/idempotency";
import { Db } from "../../../db/db";
import { ownedClass } from "../../classes/application/class-access";
import { classArchived, lock } from "../../classes/application/class-common";
import { assertClassLesson, lessonNotAvailable } from "../../classes/application/class-lesson";
import { normalizeResourceContent, type ResourceKind } from "../../classes/application/class-resource-contract";
import type { AiConfig } from "./ai-config";
import {
  aiEditInvalid,
  aiJobAlreadyMaterialized,
  aiJobNotReviewable,
  aiReviewIncomplete,
  decisionBody,
  materializeBody,
  aiJobNotCancellable,
  aiJobNotFound,
  aiProviderNotConfigured,
  aiQuotaExceeded,
  createAiJobBody,
  idempotencyKeyRequired,
  listAiJobsQuery,
  normalizeCreateBody,
  outcomeNotInLesson,
  PROVIDER_SIDE_FAILURES,
  quotaQuery,
  toAiJobView,
  type AiPurpose,
  type DuplicateMatch,
  type NormalizedAiRequest,
} from "./ai-job-contract";
import { AI_CONFIG, AI_PROVIDER, type AiProvider } from "./ai-provider";
import { quotaUsage } from "./ai-quota";
import { confirmedCreditsRequired } from "./credits-contract";
import { AiCreditsService } from "./credits.service";
import { AiLabChallengesService } from "./ai-lab-challenges.service";
import { LAB_CHALLENGE_PURPOSE } from "./lab-challenge-contract";
import { GENERATE_RESOURCE_PROMPT_VERSION, RESOURCE_ITEMS_SCHEMA_VERSION } from "./generate-resource-prompt";
import { lessonOutcomeCodes, type LessonSource } from "./input-snapshot";
import { checkQuestionDuplicates, loadQdupCorpus, qdupFlagger, syncClassResourceFingerprints } from "./question-fingerprints";
import { resourceItemSchema, type ResourceItem } from "./resource-items";
import { contentFlags, structuralDropReasons, type DropReason } from "./validate-items";
import { buildSnapshotFor, lessonChangedSince, loadLessonSource } from "./lesson-source";

const DAY_MS = 24 * 3600_000;
const resourceSelect = { id: true, classId: true, kind: true, title: true, lessonId: true, version: true, status: true, content: true, createdAt: true, publishedAt: true, archivedAt: true } as const;
/** Rule ids returned in AI_EDIT_INVALID details (validation-rules.md). */
const RULE_ID: Partial<Record<DropReason, string>> = {
  ITEM_TYPE_MISMATCH: "VR-01", LENGTH_INVALID: "VR-02", ANSWER_KEY_INVALID: "VR-03", OPTIONS_NOT_DISTINCT: "VR-04",
  OPTION_PATTERN_FORBIDDEN: "VR-05", SAFETY_REJECTED: "VR-08",
};
const keyText = (item: ResourceItem) => (item.type === "CARD" ? item.front : item.prompt);
const DUPLICATE_FLAGS = new Set(["EXACT_DUPLICATE", "NEAR_DUPLICATE", "EXACT_DUPLICATE_ELSEWHERE", "NEAR_DUPLICATE_ELSEWHERE"]);

/** qdup@1 matches -> the view's duplicateOf: one entry per source, best first, similarity rounded to 2 decimals. */
function toDuplicateMatches(matches: Array<{ level: "EXACT" | "NEAR"; score: number; flag: string; source: any }>): DuplicateMatch[] {
  const seen = new Set<string>();
  const out: DuplicateMatch[] = [];
  for (const match of matches) {
    const sourceId = match.source.resourceId ?? match.source.lessonId;
    if (seen.has(sourceId)) continue;
    seen.add(sourceId);
    out.push({
      sourceKind: match.source.kind,
      ...(match.source.resourceId ? { resourceId: match.source.resourceId } : { lessonId: match.source.lessonId }),
      resourceTitle: match.source.title,
      ...(match.source.className ? { className: match.source.className } : {}),
      match: match.level,
      similarity: Math.round(match.score * 100) / 100,
      flag: match.flag,
    });
  }
  return out;
}

/** Accepted/edited items -> the existing content contract's input for the job's target kind (validation-rules.md, "Mapping"). */
export function mapItemsToContent(kind: ResourceKind, items: ResourceItem[]) {
  if (kind === "DECK") return { cards: items.flatMap((item) => (item.type === "CARD" ? [{ front: item.front, back: item.back }] : [])) };
  const questions = items.flatMap((item) => (item.type === "SINGLE_CHOICE" ? [item] : []));
  return {
    // STUDY_QUIZ keeps the answer key as TEST does: the student sees right/wrong and the explanation (not scored).
    questions: questions.map((item) => ({ prompt: item.prompt, options: item.options, correctOption: item.correctOption, explanation: item.explanation })),
  };
}
const TERMINAL = new Set(["SUCCEEDED", "FAILED", "CANCELLED"]);

export { quotaUsage };

/**
 * Owner-only Teacher AI job routes (TAI-T2). Class denial follows ownedClass (403 CLASS_ACCESS_DENIED for a missing or
 * foreign class); a missing job inside an owned class is 404. No provider call happens here: the runner does that.
 */
@Injectable()
export class AiJobsService {
  private assessment: AiAssessmentConfig;

  constructor(
    @Inject(Db) private db: Db,
    @Inject(AI_CONFIG) private config: AiConfig,
    @Inject(AI_PROVIDER) private provider: AiProvider | null,
    @Optional() @Inject(AI_ASSESSMENT_CONFIG) assessment?: AiAssessmentConfig,
    @Optional() @Inject(AiCreditsService) private credits?: AiCreditsService,
    @Optional() @Inject(AiLabChallengesService) lab?: AiLabChallengesService,
  ) {
    this.assessment = assessment ?? parseAiAssessmentConfig({});
    // TAI-06: DRAFT_LAB_CHALLENGE jobs are handled by their own service behind these same routes.
    this.lab = lab ?? new AiLabChallengesService(db, config, provider, undefined, credits);
  }
  private lab: AiLabChallengesService;

  /** TAI-05: credits apply to this service only while AI_CREDITS_ENABLED=true. */
  private get creditsOn() {
    return !!this.credits?.enabled;
  }

  async create(classId: string, req: any, raw: unknown) {
    const body = createAiJobBody.parse(raw);
    if (body.purpose === LAB_CHALLENGE_PURPOSE) return this.lab.create(classId, req, body);
    const key = readIdempotencyKey(req);
    if (!key) throw idempotencyKeyRequired();
    const classroom = await ownedClass(this.db, classId, req.user);
    if (classroom.status !== "ACTIVE") throw classArchived();
    await assertClassLesson(this.db, body.lessonId, req.user.sub);
    const lesson = await loadLessonSource(this.db, body.lessonId);
    if (!lesson) throw lessonNotAvailable();
    const allowed = new Set(lessonOutcomeCodes(lesson));
    if (body.outcomeCodes?.some((code) => !allowed.has(code))) throw outcomeNotInLesson();
    if (!this.provider || !this.config.provider || !this.config.model) throw aiProviderNotConfigured();
    const credits = this.creditsOn ? this.credits! : null;
    if (credits && body.confirmedCredits === undefined) throw confirmedCreditsRequired();

    const request = normalizeCreateBody(body);
    const { snapshot, digest } = await buildSnapshotFor(this.db, lesson, request);
    const actorId = req.user.sub as string;
    // confirmedCredits is part of the replay hash only when it was sent, so existing credit-free requests hash as before.
    const ctx = { actorId, key, scope: `POST classes/${classId}/ai-jobs`, payload: { ...request, confirmedCredits: credits ? body.confirmedCredits : undefined } };
    return idempotent(this.db, ctx, async (tx) => {
      // Per-actor, per-purpose lock: two concurrent creates at the limit cannot both pass.
      await lock(tx, `ai-quota:${actorId}:${request.purpose}`);
      const usage = await quotaUsage(tx, actorId, request.purpose, this.config);
      if (usage.usedLast24h >= usage.dailyLimit || (usage.concurrencyLimit !== null && usage.activeJobs >= usage.concurrencyLimit))
        throw aiQuotaExceeded(request.purpose, usage.resetsAt ?? new Date(Date.now() + DAY_MS));
      // TAI-05: same per-actor lock as the quota. Recompute the estimate under the active price and compare it with the
      // confirmed value (409 AI_ESTIMATE_CHANGED); the balance check and RESERVE follow the job insert (402 rolls it back).
      const quote = credits ? await credits.confirm(tx, request.purpose, request.itemCount, body.confirmedCredits!) : null;
      const job = await tx.aiJob.create({
        data: {
          classId, actorId, purpose: request.purpose, targetKind: request.targetKind, lessonId: request.lessonId,
          request, inputSnapshot: snapshot, inputDigest: digest,
          promptVersion: GENERATE_RESOURCE_PROMPT_VERSION, outputSchemaVersion: RESOURCE_ITEMS_SCHEMA_VERSION,
          provider: this.config.provider!, model: this.config.model!,
          ...(quote ? { pricingVersionId: quote.price.id, estimatedCredits: quote.credits } : {}),
        },
      });
      if (quote) await credits!.reserve(tx, { jobId: job.id, actorId, credits: quote.credits, pricingVersionId: quote.price.id });
      await audit(tx, {
        actor: req.user, action: "ai_job.create", targetType: "AiJob", targetId: job.id,
        after: { classId, purpose: request.purpose, lessonId: request.lessonId, targetKind: request.targetKind, itemCount: request.itemCount, promptVersion: job.promptVersion, model: job.model },
      });
      return toAiJobView(job, { lessonChangedSinceGeneration: false, itemCount: 0, credits: this.creditsOn });
    });
  }

  async list(classId: string, req: any, rawQuery: unknown) {
    const query = listAiJobsQuery.parse(rawQuery ?? {});
    if (query.purpose === LAB_CHALLENGE_PURPOSE) return this.lab.list(classId, req, query);
    await ownedClass(this.db, classId, req.user);
    if (query.cursor && !(await this.db.aiJob.findFirst({ where: { id: query.cursor, classId }, select: { id: true } })))
      throw aiJobNotFound();
    const rows = await this.db.aiJob.findMany({
      // TAI-02: ASSESS_SUBMISSION jobs are read through the written grading views, never in the authoring list.
      where: { classId, purpose: "GENERATE_RESOURCE" },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: query.limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      include: { _count: { select: { items: true } } },
    });
    const page = rows.slice(0, query.limit);
    const changed = await this.changedFlags(page);
    return {
      items: page.map((job: any) => toAiJobView(job, { lessonChangedSinceGeneration: changed.get(job.id)!, itemCount: job._count.items, credits: this.creditsOn })),
      nextCursor: rows.length > query.limit ? page[page.length - 1].id : null,
    };
  }

  async get(classId: string, jobId: string, req: any) {
    await ownedClass(this.db, classId, req.user);
    const job = await this.db.aiJob.findFirst({
      where: { id: jobId, classId },
      include: { items: { orderBy: { position: "asc" }, include: { decisions: { orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 1 } } } },
    });
    if (!job) throw aiJobNotFound();
    if (job.purpose === "ASSESS_SUBMISSION") return this.assessmentJobView(job);
    if (job.purpose === LAB_CHALLENGE_PURPOSE) return this.lab.detail(job);
    const changed = await lessonChangedSince(this.db, job.lessonId, job.request as NormalizedAiRequest, job.inputDigest);
    return toAiJobView(job as any, { lessonChangedSinceGeneration: changed, items: await this.enrichItems(job), credits: this.creditsOn });
  }

  /**
   * TAI-02 job view: status and failure only. The suggestion is added in assist mode only; in shadow mode no suggestion
   * field is returned (the evaluation report is the only reader). The redacted snapshot is never returned.
   */
  private async assessmentJobView(job: any) {
    const view = { ...toAiJobView(job, { lessonChangedSinceGeneration: false, itemCount: 0, credits: this.creditsOn }), purpose: job.purpose as string, submissionId: job.submissionId as string | null };
    if (!assistActive(this.assessment)) return view;
    const suggestion = await this.db.aiAssessmentSuggestion.findFirst({ where: { jobId: job.id, mode: "assist" }, select: suggestionSelect });
    return { ...view, suggestion: suggestion ? teacherSuggestionView(suggestion as any) : null };
  }

  /** Computed on read: duplicateOf for flagged items and VW flags of edited payloads. Nothing is stored. */
  private async enrichItems(job: any) {
    const items: any[] = job.items ?? [];
    const flagged = (item: any) => Array.isArray(item.flags) && item.flags.some((flag: string) => DUPLICATE_FLAGS.has(flag));
    if (!items.some((item) => flagged(item) || item.decisions?.[0]?.decision === "EDITED")) return items;
    const { corpus, truncated } = await loadQdupCorpus(this.db, job.actorId);
    const flagger = qdupFlagger(corpus, job.classId, truncated);
    const difficulty = (job.request as NormalizedAiRequest)?.difficulty ?? null;
    const flaggedItems = items.filter(flagged);
    const parsedTexts = flaggedItems.map((item) => {
      const parsed = resourceItemSchema.safeParse(item.payload);
      return parsed.success ? keyText(parsed.data) : "";
    });
    const { warnings } = await checkQuestionDuplicates(this.db, { teacherId: job.actorId, classId: job.classId, texts: parsedTexts });
    const byItem = new Map<string, DuplicateMatch[]>();
    for (const warning of warnings) byItem.set(flaggedItems[warning.index].id, toDuplicateMatches(warning.matches));
    return items.map((item) => {
      const latest = item.decisions?.[0];
      const edited = latest?.decision === "EDITED" ? resourceItemSchema.safeParse(latest.editedPayload) : null;
      const decisionFlags = edited?.success ? [...flagger(keyText(edited.data)), ...contentFlags(edited.data, difficulty)] : [];
      return { ...item, duplicateOf: byItem.get(item.id) ?? [], decisionFlags };
    });
  }

  /**
   * Appends one decision (latest wins). EDITED payloads must parse as resource-items@1, keep the original item type and
   * pass VR-02..VR-05 and VR-08, else 400 AI_EDIT_INVALID. Duplicate flags never block ACCEPTED.
   */
  async decide(classId: string, jobId: string, itemId: string, req: any, raw: unknown) {
    const body = decisionBody.parse(raw);
    const classroom = await ownedClass(this.db, classId, req.user);
    if (classroom.status !== "ACTIVE") throw classArchived();
    const target = await this.db.aiJob.findFirst({ where: { id: jobId, classId }, select: { purpose: true } });
    if (target?.purpose === LAB_CHALLENGE_PURPOSE) {
      await this.lab.reject(classId, jobId, itemId, req, raw);
      return this.get(classId, jobId, req);
    }
    let editedPayload: ResourceItem | null = null;
    if (body.decision === "EDITED") {
      const parsed = resourceItemSchema.safeParse(body.editedPayload);
      if (!parsed.success) throw aiEditInvalid(["resource-items@1"]);
      editedPayload = parsed.data;
    }
    await this.db.$transaction(async (tx: any) => {
      await lock(tx, `ai-job:${jobId}`);
      const job = await tx.aiJob.findFirst({ where: { id: jobId, classId, purpose: "GENERATE_RESOURCE" }, select: { status: true, materializedResourceId: true } });
      if (!job) throw aiJobNotFound();
      if (job.materializedResourceId) throw aiJobAlreadyMaterialized();
      if (job.status !== "SUCCEEDED") throw aiJobNotReviewable();
      const item = await tx.aiJobItem.findFirst({ where: { id: itemId, jobId }, select: { id: true, position: true, payload: true } });
      if (!item) throw aiJobNotFound();
      if (editedPayload) {
        const original = resourceItemSchema.safeParse(item.payload);
        const reasons: DropReason[] = original.success && original.data.type !== editedPayload.type ? ["ITEM_TYPE_MISMATCH"] : structuralDropReasons(editedPayload);
        if (reasons.length > 0) throw aiEditInvalid(reasons.map((reason) => RULE_ID[reason] ?? reason));
      }
      await tx.aiItemDecision.create({
        data: { itemId, actorId: req.user.sub, decision: body.decision, editedPayload: editedPayload ?? undefined, reasonCode: body.reasonCode ?? null },
      });
      await audit(tx, {
        actor: req.user, action: "ai_item.decide", targetType: "AiJobItem", targetId: itemId,
        after: { jobId, position: item.position, decision: body.decision, reasonCode: body.reasonCode ?? null },
      });
    }, TX_LIMITS);
    return this.get(classId, jobId, req);
  }

  /**
   * Accepted and edited items -> one ClassResource DRAFT through normalizeResourceContent, once per job. Requires every
   * item decided and at least one kept. Students see nothing until the existing publish step.
   */
  async materialize(classId: string, jobId: string, req: any, raw: unknown) {
    const body = materializeBody.parse(raw);
    const key = readIdempotencyKey(req);
    if (!key) throw idempotencyKeyRequired();
    const classroom = await ownedClass(this.db, classId, req.user);
    if (classroom.status !== "ACTIVE") throw classArchived();
    const ctx = { actorId: req.user.sub, key, scope: `POST classes/${classId}/ai-jobs/${jobId}/materialize`, payload: body };
    return idempotent(this.db, ctx, async (tx) => {
      await lock(tx, `ai-job:${jobId}`);
      const job = await tx.aiJob.findFirst({
        where: { id: jobId, classId, purpose: "GENERATE_RESOURCE" },
        include: { items: { orderBy: { position: "asc" }, include: { decisions: { orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 1 } } } },
      });
      if (!job) throw aiJobNotFound();
      if (job.materializedResourceId) throw aiJobAlreadyMaterialized();
      if (job.status !== "SUCCEEDED") throw aiJobNotReviewable();
      const latest = job.items.map((item: any) => ({ item, decision: item.decisions[0] ?? null }));
      if (latest.some((entry: any) => !entry.decision)) throw aiReviewIncomplete();
      const kept = latest.filter((entry: any) => entry.decision.decision !== "REJECTED");
      if (kept.length === 0) throw aiReviewIncomplete();
      const payloads = kept.map((entry: any) => resourceItemSchema.parse(entry.decision.decision === "EDITED" ? entry.decision.editedPayload : entry.item.payload));
      const kind = job.targetKind as ResourceKind;
      const content = normalizeResourceContent(kind, mapItemsToContent(kind, payloads));
      const resource = await tx.classResource.create({
        data: { classId, kind, title: body.title, lessonId: job.lessonId, content, createdById: req.user.sub },
        select: resourceSelect,
      });
      const linked = await tx.aiJob.updateMany({ where: { id: jobId, materializedResourceId: null }, data: { materializedResourceId: resource.id } });
      if (linked.count !== 1) throw aiJobAlreadyMaterialized();
      await syncClassResourceFingerprints(tx, resource.id);
      const count = (decision: string) => latest.filter((entry: any) => entry.decision.decision === decision).length;
      await audit(tx, {
        actor: req.user, action: "ai_job.materialize", targetType: "AiJob", targetId: jobId,
        after: { resourceId: resource.id, resourceKind: kind, acceptedCount: count("ACCEPTED"), editedCount: count("EDITED"), rejectedCount: count("REJECTED") },
      });
      const lessonChangedSinceGeneration = await lessonChangedSince(tx, job.lessonId, job.request as NormalizedAiRequest, job.inputDigest);
      return { ...resource, lessonChangedSinceGeneration };
    });
  }

  /** TAI-06: apply one proposal of a DRAFT_LAB_CHALLENGE job to its draft lesson (Idempotency-Key required). */
  async applyProposal(classId: string, jobId: string, itemId: string, req: any) {
    return this.lab.apply(classId, jobId, itemId, req);
  }

  /** PENDING/RUNNING -> CANCELLED. Idempotent on an already cancelled job; 409 from any other terminal state. */
  async cancel(classId: string, jobId: string, req: any) {
    await ownedClass(this.db, classId, req.user);
    for (let attempt = 0; attempt < 3; attempt++) {
      const job = await this.db.aiJob.findFirst({ where: { id: jobId, classId }, select: { status: true } });
      if (!job) throw aiJobNotFound();
      if (job.status === "CANCELLED") return this.get(classId, jobId, req);
      if (TERMINAL.has(job.status)) throw aiJobNotCancellable();
      const cancelled = await this.db.$transaction(async (tx: any) => {
        const result = await tx.aiJob.updateMany({
          where: { id: jobId, classId, status: job.status },
          data: { status: "CANCELLED", cancelledAt: new Date(), leaseUntil: null },
        });
        if (result.count !== 1) return false;
        // TAI-05: a cancelled job refunds in full in this same transaction (a late provider result is discarded).
        const settled = this.credits ? await this.credits.finalize(tx, jobId, { kind: "REFUND" }) : {};
        await audit(tx, { actor: req.user, action: "ai_job.cancel", targetType: "AiJob", targetId: jobId, after: { fromStatus: job.status, ...settled } });
        return true;
      });
      if (cancelled) return this.get(classId, jobId, req);
      // The runner moved the job between our read and update; read again.
    }
    throw aiJobNotCancellable();
  }

  async quota(req: any, rawQuery: unknown) {
    const { purpose } = quotaQuery.parse(rawQuery ?? {});
    const limits = purpose === "ASSESS_SUBMISSION" ? { daily: this.assessment.dailyLimit, concurrency: null } : purpose === LAB_CHALLENGE_PURPOSE ? this.lab.limits : undefined;
    const usage = await quotaUsage(this.db, req.user.sub, purpose as AiPurpose, this.config, new Date(), limits);
    return { ...usage, resetsAt: usage.resetsAt?.toISOString() ?? null };
  }

  /** One lesson load per distinct lesson; each job's digest is compared with its own stored request. */
  private async changedFlags(jobs: any[]) {
    const flags = new Map<string, boolean>();
    const lessons = new Map<string, LessonSource | null>();
    for (const job of jobs) {
      if (!lessons.has(job.lessonId)) lessons.set(job.lessonId, await loadLessonSource(this.db, job.lessonId));
      flags.set(job.id, await lessonChangedSince(this.db, job.lessonId, job.request, job.inputDigest, lessons.get(job.lessonId)));
    }
    return flags;
  }
}
