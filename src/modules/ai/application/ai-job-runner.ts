import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { audit } from "../../../common/audit";
import { TX_LIMITS } from "../../../common/idempotency";
import { Db } from "../../../db/db";
import type { AiConfig } from "./ai-config";
import { AI_CONFIG, AI_PROVIDER, AiProviderError, RETRYABLE_FAILURE_CODES, type AiProvider } from "./ai-provider";
import {
  buildGenerateResourceUser,
  GENERATE_RESOURCE_SYSTEM,
  RESOURCE_ITEMS_JSON_SCHEMA,
  type InputSnapshotV1,
} from "./generate-resource-prompt";
import { loadDuplicateCorpus } from "./duplicate-corpus";
import { processGenerateResourceOutput, type DroppedItem, type ProcessedItem } from "./output-pipeline";

export const RUNNER_TIMINGS = { pollMs: 2_000, sweepMs: 30_000, leaseMs: 90_000, providerTimeoutMs: 60_000 } as const;
export const MAX_ATTEMPTS = 2;
const MAX_OUTPUT_TOKENS = 8_192;
const SUPPORTED_PURPOSES = ["GENERATE_RESOURCE"];

type FailureCode = "PROVIDER_UNAVAILABLE" | "PROVIDER_TIMEOUT" | "OUTPUT_SCHEMA_INVALID" | "OUTPUT_VALIDATION_FAILED" | "LESSON_UNAVAILABLE" | "INTERNAL_ERROR";
type Claimed = { id: string; attempt: number };
type Usage = { inputTokens: number; outputTokens: number } | null;

/** Retry decision of the state machine: retryable failures go back to PENDING while attempts remain. */
export function nextStatusAfterFailure(code: FailureCode, attempt: number): "PENDING" | "FAILED" {
  return RETRYABLE_FAILURE_CODES.has(code as any) && attempt < MAX_ATTEMPTS ? "PENDING" : "FAILED";
}

/**
 * In-process lease runner (job-runtime-and-failure-modes.md). Each step is a short transaction and the provider call
 * runs outside any transaction: claim (conditional update) -> lesson existence check -> prompt from the stored
 * snapshot -> provider -> output pipeline -> conditional persist on the claimed attemptCount. A persist that finds the
 * job cancelled or reclaimed writes nothing except token usage on a cancelled job, so items are written at most once.
 * Correct with several API instances: every transition is a compare-and-set on status and attemptCount.
 */
@Injectable()
export class AiJobRunner implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger("AiJobRunner");
  private timers: NodeJS.Timeout[] = [];
  private busy = false;
  private lastProviderCallAt = 0;

  constructor(
    @Inject(Db) private db: Db,
    @Inject(AI_CONFIG) private config: AiConfig,
    @Inject(AI_PROVIDER) private provider: AiProvider | null,
  ) {}

  /** Starts only when a provider is configured and AI_RUNNER_ENABLED is not false; otherwise jobs stay PENDING. */
  onModuleInit() {
    if (!this.provider || !this.config.runnerEnabled) return;
    void this.sweep().catch((error) => this.logger.warn(`sweep failed: ${(error as Error).name}`));
    this.timers.push(setInterval(() => void this.tick(), RUNNER_TIMINGS.pollMs).unref());
    this.timers.push(setInterval(() => void this.sweep().catch((error) => this.logger.warn(`sweep failed: ${(error as Error).name}`)), RUNNER_TIMINGS.sweepMs).unref());
  }

  onModuleDestroy() {
    for (const timer of this.timers) clearInterval(timer);
    this.timers = [];
  }

  private async tick() {
    try {
      await this.runOnce();
    } catch (error) {
      this.logger.warn(`tick failed: ${(error as Error).name}`);
    }
  }

  /** Processes at most one job; returns its id, or null when nothing was claimed. Exposed for tests. */
  async runOnce(now = () => new Date()): Promise<string | null> {
    if (this.busy || !this.provider) return null;
    this.busy = true;
    try {
      const claimed = await this.claim(now());
      if (!claimed) return null;
      await this.process(claimed, now);
      return claimed.id;
    } finally {
      this.busy = false;
    }
  }

  /** PENDING -> RUNNING for the oldest job; update count 1 means this instance won the claim. */
  async claim(at: Date): Promise<Claimed | null> {
    const candidate = await this.db.aiJob.findFirst({
      where: { status: "PENDING", purpose: { in: SUPPORTED_PURPOSES } },
      orderBy: { createdAt: "asc" },
      select: { id: true, attemptCount: true, startedAt: true },
    });
    if (!candidate) return null;
    const result = await this.db.aiJob.updateMany({
      where: { id: candidate.id, status: "PENDING", attemptCount: candidate.attemptCount },
      data: { status: "RUNNING", leaseUntil: new Date(at.getTime() + RUNNER_TIMINGS.leaseMs), attemptCount: { increment: 1 }, startedAt: candidate.startedAt ?? at },
    });
    return result.count === 1 ? { id: candidate.id, attempt: candidate.attemptCount + 1 } : null;
  }

  private async process(claimed: Claimed, now: () => Date) {
    const job = await this.db.aiJob.findUnique({ where: { id: claimed.id } });
    if (!job) return;
    const lesson = await this.db.lesson.findUnique({ where: { id: job.lessonId }, select: { id: true } });
    if (!lesson) return this.fail(claimed, "LESSON_UNAVAILABLE", null, [], now());

    const snapshot = job.inputSnapshot as unknown as InputSnapshotV1;
    let text: string;
    let usage: Usage = null;
    try {
      await this.respectMinInterval();
      const result = await this.provider!.generate({
        system: GENERATE_RESOURCE_SYSTEM,
        user: buildGenerateResourceUser(snapshot),
        maxTokens: MAX_OUTPUT_TOKENS,
        timeoutMs: RUNNER_TIMINGS.providerTimeoutMs,
        responseSchema: RESOURCE_ITEMS_JSON_SCHEMA as unknown as Record<string, unknown>,
      });
      text = result.text;
      usage = { inputTokens: result.inputTokens, outputTokens: result.outputTokens };
      this.logger.log(`job ${job.id} attempt ${claimed.attempt}: provider ok, request ${result.requestId ?? "-"}, tokens ${result.inputTokens}/${result.outputTokens}`);
    } catch (error) {
      const code: FailureCode = error instanceof AiProviderError ? error.code : "INTERNAL_ERROR";
      this.logger.warn(`job ${job.id} attempt ${claimed.attempt}: ${code}`);
      return this.fail(claimed, code, null, [], now());
    }

    let corpus: string[];
    try {
      corpus = await loadDuplicateCorpus(this.db, job.classId);
    } catch {
      return this.fail(claimed, "INTERNAL_ERROR", usage, [], now());
    }
    const output = processGenerateResourceOutput(snapshot, text, corpus);
    if (!output.ok) return this.fail(claimed, output.code, usage, output.dropped, now());
    return this.succeed(claimed, output.items, output.dropped, usage, now());
  }

  private async respectMinInterval() {
    const wait = this.lastProviderCallAt + this.config.providerMinIntervalMs - Date.now();
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
    this.lastProviderCallAt = Date.now();
  }

  /** Token totals accumulate across attempts; a cancelled job still records the tokens it spent. */
  private async tokens(tx: any, id: string, usage: Usage) {
    if (!usage) return {};
    const current = await tx.aiJob.findUnique({ where: { id }, select: { inputTokens: true, outputTokens: true } });
    return { inputTokens: (current?.inputTokens ?? 0) + usage.inputTokens, outputTokens: (current?.outputTokens ?? 0) + usage.outputTokens };
  }

  private async recordCancelledUsage(tx: any, claimed: Claimed, usage: Usage) {
    if (!usage) return;
    await tx.aiJob.updateMany({ where: { id: claimed.id, status: "CANCELLED", attemptCount: claimed.attempt }, data: await this.tokens(tx, claimed.id, usage) });
  }

  async succeed(claimed: Claimed, items: ProcessedItem[], dropped: DroppedItem[], usage: Usage, at: Date) {
    await this.db.$transaction(async (tx: any) => {
      const tokenData = await this.tokens(tx, claimed.id, usage);
      const result = await tx.aiJob.updateMany({
        where: { id: claimed.id, status: "RUNNING", attemptCount: claimed.attempt },
        data: { status: "SUCCEEDED", completedAt: at, leaseUntil: null, failureCode: null, droppedItems: dropped, ...tokenData },
      });
      if (result.count !== 1) return this.recordCancelledUsage(tx, claimed, usage);
      await tx.aiJobItem.createMany({ data: items.map((item, position) => ({ jobId: claimed.id, position, payload: item.payload, flags: item.flags })) });
      await audit(tx, {
        actor: null, action: "ai_job.complete", targetType: "AiJob", targetId: claimed.id,
        after: { status: "SUCCEEDED", failureCode: null, validCount: items.length, droppedCount: dropped.length, ...tokenData },
      });
    }, TX_LIMITS);
  }

  async fail(claimed: Claimed, code: FailureCode, usage: Usage, dropped: DroppedItem[], at: Date) {
    const next = nextStatusAfterFailure(code, claimed.attempt);
    await this.db.$transaction(async (tx: any) => {
      const tokenData = await this.tokens(tx, claimed.id, usage);
      const data = next === "PENDING"
        ? { status: "PENDING", leaseUntil: null, ...tokenData }
        : { status: "FAILED", failureCode: code, completedAt: at, leaseUntil: null, droppedItems: dropped, ...tokenData };
      const result = await tx.aiJob.updateMany({ where: { id: claimed.id, status: "RUNNING", attemptCount: claimed.attempt }, data });
      if (result.count !== 1) return this.recordCancelledUsage(tx, claimed, usage);
      if (next === "FAILED")
        await audit(tx, {
          actor: null, action: "ai_job.complete", targetType: "AiJob", targetId: claimed.id,
          after: { status: "FAILED", failureCode: code, validCount: 0, droppedCount: dropped.length, ...tokenData },
        });
    }, TX_LIMITS);
  }

  /**
   * Lease expiry (instance died mid-call): requeue while attempts remain, otherwise FAILED. The lease-expired failure
   * uses INTERNAL_ERROR because no provider answer was observed. Conditional on the same attemptCount, so a late
   * result from the dead attempt can no longer persist.
   */
  async sweep(at = new Date()) {
    const expired = await this.db.aiJob.findMany({
      where: { status: "RUNNING", leaseUntil: { lt: at } },
      select: { id: true, attemptCount: true },
      take: 100,
    });
    for (const job of expired) {
      const requeue = job.attemptCount < MAX_ATTEMPTS;
      await this.db.$transaction(async (tx: any) => {
        const result = await tx.aiJob.updateMany({
          where: { id: job.id, status: "RUNNING", attemptCount: job.attemptCount, leaseUntil: { lt: at } },
          data: requeue ? { status: "PENDING", leaseUntil: null } : { status: "FAILED", failureCode: "INTERNAL_ERROR", completedAt: at, leaseUntil: null },
        });
        if (result.count === 1 && !requeue)
          await audit(tx, { actor: null, action: "ai_job.complete", targetType: "AiJob", targetId: job.id, after: { status: "FAILED", failureCode: "INTERNAL_ERROR", validCount: 0, droppedCount: 0 } });
      }, TX_LIMITS);
    }
    return expired.length;
  }
}
