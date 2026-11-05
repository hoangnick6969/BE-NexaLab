import { Inject, Injectable } from "@nestjs/common";
import { audit } from "../../../common/audit";
import { idempotent, readIdempotencyKey } from "../../../common/idempotency";
import { Db } from "../../../db/db";
import { ownedClass } from "../../classes/application/class-access";
import { classArchived, lock } from "../../classes/application/class-common";
import { assertClassLesson, lessonNotAvailable } from "../../classes/application/class-lesson";
import type { AiConfig } from "./ai-config";
import {
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
  type NormalizedAiRequest,
} from "./ai-job-contract";
import { AI_CONFIG, AI_PROVIDER, type AiProvider } from "./ai-provider";
import { GENERATE_RESOURCE_PROMPT_VERSION, RESOURCE_ITEMS_SCHEMA_VERSION } from "./generate-resource-prompt";
import { lessonOutcomeCodes, type LessonSource } from "./input-snapshot";
import { buildSnapshotFor, lessonChangedSince, loadLessonSource } from "./lesson-source";

const DAY_MS = 24 * 3600_000;
const TERMINAL = new Set(["SUCCEEDED", "FAILED", "CANCELLED"]);

/** Daily and concurrency usage for one actor and purpose (job-runtime-and-failure-modes.md, "Quota"). */
export async function quotaUsage(db: any, actorId: string, purpose: string, config: AiConfig, now = new Date()) {
  const since = new Date(now.getTime() - DAY_MS);
  const counted = {
    actorId,
    purpose,
    createdAt: { gt: since },
    NOT: { status: "FAILED", failureCode: { in: [...PROVIDER_SIDE_FAILURES] } },
  };
  const [usedLast24h, activeJobs, oldest] = await Promise.all([
    db.aiJob.count({ where: counted }),
    db.aiJob.count({ where: { actorId, purpose, status: { in: ["PENDING", "RUNNING"] } } }),
    db.aiJob.findFirst({ where: counted, orderBy: { createdAt: "asc" }, select: { createdAt: true } }),
  ]);
  return {
    purpose,
    dailyLimit: config.dailyJobLimit,
    usedLast24h,
    activeJobs,
    concurrencyLimit: config.concurrentJobLimit,
    resetsAt: oldest ? new Date(oldest.createdAt.getTime() + DAY_MS) : null,
  };
}

/**
 * Owner-only Teacher AI job routes (TAI-T2). Class denial follows ownedClass (403 CLASS_ACCESS_DENIED for a missing or
 * foreign class); a missing job inside an owned class is 404. No provider call happens here: the runner does that.
 */
@Injectable()
export class AiJobsService {
  constructor(
    @Inject(Db) private db: Db,
    @Inject(AI_CONFIG) private config: AiConfig,
    @Inject(AI_PROVIDER) private provider: AiProvider | null,
  ) {}

  async create(classId: string, req: any, raw: unknown) {
    const body = createAiJobBody.parse(raw);
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

    const request = normalizeCreateBody(body);
    const { snapshot, digest } = await buildSnapshotFor(this.db, lesson, request);
    const actorId = req.user.sub as string;
    const ctx = { actorId, key, scope: `POST classes/${classId}/ai-jobs`, payload: request };
    return idempotent(this.db, ctx, async (tx) => {
      // Per-actor, per-purpose lock: two concurrent creates at the limit cannot both pass.
      await lock(tx, `ai-quota:${actorId}:${request.purpose}`);
      const usage = await quotaUsage(tx, actorId, request.purpose, this.config);
      if (usage.usedLast24h >= usage.dailyLimit || usage.activeJobs >= usage.concurrencyLimit)
        throw aiQuotaExceeded(request.purpose, usage.resetsAt ?? new Date(Date.now() + DAY_MS));
      const job = await tx.aiJob.create({
        data: {
          classId, actorId, purpose: request.purpose, targetKind: request.targetKind, lessonId: request.lessonId,
          request, inputSnapshot: snapshot, inputDigest: digest,
          promptVersion: GENERATE_RESOURCE_PROMPT_VERSION, outputSchemaVersion: RESOURCE_ITEMS_SCHEMA_VERSION,
          provider: this.config.provider!, model: this.config.model!,
        },
      });
      await audit(tx, {
        actor: req.user, action: "ai_job.create", targetType: "AiJob", targetId: job.id,
        after: { classId, purpose: request.purpose, lessonId: request.lessonId, targetKind: request.targetKind, itemCount: request.itemCount, promptVersion: job.promptVersion, model: job.model },
      });
      return toAiJobView(job, { lessonChangedSinceGeneration: false, itemCount: 0 });
    });
  }

  async list(classId: string, req: any, rawQuery: unknown) {
    const query = listAiJobsQuery.parse(rawQuery ?? {});
    await ownedClass(this.db, classId, req.user);
    if (query.cursor && !(await this.db.aiJob.findFirst({ where: { id: query.cursor, classId }, select: { id: true } })))
      throw aiJobNotFound();
    const rows = await this.db.aiJob.findMany({
      where: { classId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: query.limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      include: { _count: { select: { items: true } } },
    });
    const page = rows.slice(0, query.limit);
    const changed = await this.changedFlags(page);
    return {
      items: page.map((job: any) => toAiJobView(job, { lessonChangedSinceGeneration: changed.get(job.id)!, itemCount: job._count.items })),
      nextCursor: rows.length > query.limit ? page[page.length - 1].id : null,
    };
  }

  async get(classId: string, jobId: string, req: any) {
    await ownedClass(this.db, classId, req.user);
    const job = await this.db.aiJob.findFirst({
      where: { id: jobId, classId },
      include: { items: { orderBy: { position: "asc" }, include: { decisions: { orderBy: { createdAt: "desc" }, take: 1 } } } },
    });
    if (!job) throw aiJobNotFound();
    const changed = await lessonChangedSince(this.db, job.lessonId, job.request as NormalizedAiRequest, job.inputDigest);
    return toAiJobView(job as any, { lessonChangedSinceGeneration: changed, items: job.items as any });
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
        await audit(tx, { actor: req.user, action: "ai_job.cancel", targetType: "AiJob", targetId: jobId, after: { fromStatus: job.status } });
        return true;
      });
      if (cancelled) return this.get(classId, jobId, req);
      // The runner moved the job between our read and update; read again.
    }
    throw aiJobNotCancellable();
  }

  async quota(req: any, rawQuery: unknown) {
    const { purpose } = quotaQuery.parse(rawQuery ?? {});
    const usage = await quotaUsage(this.db, req.user.sub, purpose as AiPurpose, this.config);
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
