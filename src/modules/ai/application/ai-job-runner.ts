import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit, Optional } from "@nestjs/common";
import { audit } from "../../../common/audit";
import { TX_LIMITS } from "../../../common/idempotency";
import { Db } from "../../../db/db";
import type { AiConfig } from "./ai-config";
import { AI_CONFIG, AI_PROVIDER, AiProviderError, RETRYABLE_FAILURE_CODES, type AiProvider } from "./ai-provider";
import { AiCreditsService, type Finalized } from "./credits.service";
import {
  buildGenerateResourceUser,
  GENERATE_RESOURCE_MAX_OUTPUT_TOKENS,
  GENERATE_RESOURCE_SYSTEM,
  RESOURCE_ITEMS_JSON_SCHEMA,
  type InputSnapshotV1,
} from "./generate-resource-prompt";
import { loadQdupCorpus, qdupFlagger } from "./question-fingerprints";
import { processGenerateResourceOutput, type DroppedItem, type ProcessedItem } from "./output-pipeline";
import { buildAssessProviderRequest } from "./assess-submission-prompt";
import { LAB_CHALLENGE_MAX_OUTPUT_TOKENS } from "./lab-challenge-contract";
import { DRAFT_LAB_CHALLENGE_SYSTEM, buildLabChallengeUser, labChallengeResponseSchema, type LabChallengeSnapshotV1 } from "./lab-challenge-prompt";
import { processLabChallengeOutput } from "./lab-challenge-validation";
import { loadLabContexts } from "./lab-reference-states";
import { ASSESSMENT_PURPOSE, GENERATE_ASSESSMENT_MAX_OUTPUT_TOKENS } from "./assessment-blueprint";
import { processGenerateAssessmentOutput } from "./assessment-draft-output";
import { ASSESSMENT_ITEMS_JSON_SCHEMA, buildGenerateAssessmentUser, GENERATE_ASSESSMENT_SYSTEM, type AssessmentSnapshotV1 } from "./generate-assessment-prompt";
import { PRIVACY_GUARD_FAILURE } from "./assessment-contract";
import { PrivacyGuardError } from "./assessment-privacy";
import { loadKnownIdentities } from "./assessment-snapshot";
import {
  detectInjection,
  parseAssessmentOutput,
  suppressedForInjection,
  verifySuggestion,
  type AssessSnapshotV1,
  type CriterionResult,
  type SuggestionStatus,
} from "./assessment-suggestion";

export const RUNNER_TIMINGS = { pollMs: 2_000, sweepMs: 30_000, leaseMs: 90_000, providerTimeoutMs: 60_000 } as const;
export const MAX_ATTEMPTS = 2;
const SUPPORTED_PURPOSES = ["GENERATE_RESOURCE", "ASSESS_SUBMISSION", "DRAFT_LAB_CHALLENGE", ASSESSMENT_PURPOSE];

type FailureCode =
  | "PROVIDER_UNAVAILABLE" | "PROVIDER_TIMEOUT" | "OUTPUT_SCHEMA_INVALID" | "OUTPUT_VALIDATION_FAILED" | "LESSON_UNAVAILABLE" | "INTERNAL_ERROR"
  | "SUBMISSION_UNAVAILABLE" | typeof PRIVACY_GUARD_FAILURE;
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
    @Optional() @Inject(AiCreditsService) private credits?: AiCreditsService,
  ) {}

  /**
   * TAI-05: SETTLE (success) or REFUND (failed) in the transaction that just won the conditional terminal update, so the
   * job state and its ledger posting commit or roll back together. A job created with credits off carries no estimate
   * and is untouched; a replay or a reclaimed attempt can never post twice (job-keyed, unique index).
   */
  private settle(tx: any, jobId: string, outcome: { kind: "SETTLE"; validCount: number } | { kind: "REFUND" }): Promise<Finalized> {
    return this.credits ? this.credits.finalize(tx, jobId, outcome) : Promise.resolve({});
  }

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
    if (job.purpose === "ASSESS_SUBMISSION") return this.processAssessment(claimed, job, now);
    if (job.purpose === "DRAFT_LAB_CHALLENGE") return this.processLabChallenge(claimed, job, now);
    if (job.purpose === ASSESSMENT_PURPOSE) return this.processAssessmentDraft(claimed, job, now);
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
        maxTokens: GENERATE_RESOURCE_MAX_OUTPUT_TOKENS,
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

    let corpus: (text: string) => string[];
    try {
      // qdup@1 over the requesting teacher's classes and the shared library (TAI3-T2); warnings only.
      const loaded = await loadQdupCorpus(this.db, job.actorId);
      corpus = qdupFlagger(loaded.corpus, job.classId, loaded.truncated);
    } catch {
      return this.fail(claimed, "INTERNAL_ERROR", usage, [], now());
    }
    const output = processGenerateResourceOutput(snapshot, text, corpus);
    if (!output.ok) return this.fail(claimed, output.code, usage, output.dropped, now());
    return this.succeed(claimed, output.items, output.dropped, usage, now());
  }

  /**
   * TAI7-T5 GENERATE_ASSESSMENT. Built from the stored snapshot only (lesson passages, server blueprint, the Lab the teacher
   * picked). The pure pipeline fills the blueprint, re-allocates points to exactly 10,00 and gates the paper through the
   * EXAM contract; the single resulting item is the draft the teacher loads into the exam editor.
   */
  private async processAssessmentDraft(claimed: Claimed, job: any, now: () => Date) {
    const lesson = await this.db.lesson.findUnique({ where: { id: job.lessonId }, select: { id: true } });
    if (!lesson) return this.fail(claimed, "LESSON_UNAVAILABLE", null, [], now());
    const snapshot = job.inputSnapshot as unknown as AssessmentSnapshotV1;
    let text: string;
    let usage: Usage = null;
    try {
      await this.respectMinInterval();
      const result = await this.provider!.generate({
        system: GENERATE_ASSESSMENT_SYSTEM,
        user: buildGenerateAssessmentUser(snapshot),
        maxTokens: GENERATE_ASSESSMENT_MAX_OUTPUT_TOKENS,
        timeoutMs: RUNNER_TIMINGS.providerTimeoutMs,
        responseSchema: ASSESSMENT_ITEMS_JSON_SCHEMA as unknown as Record<string, unknown>,
      });
      text = result.text;
      usage = { inputTokens: result.inputTokens, outputTokens: result.outputTokens };
      this.logger.log(`job ${job.id} attempt ${claimed.attempt}: provider ok, request ${result.requestId ?? "-"}, tokens ${result.inputTokens}/${result.outputTokens}`);
    } catch (error) {
      const code: FailureCode = error instanceof AiProviderError ? error.code : "INTERNAL_ERROR";
      this.logger.warn(`job ${job.id} attempt ${claimed.attempt}: ${code}`);
      return this.fail(claimed, code, null, [], now());
    }
    const output = processGenerateAssessmentOutput(snapshot, text);
    if (!output.ok) return this.fail(claimed, output.code, usage, output.dropped as unknown as DroppedItem[], now());
    return this.succeed(
      claimed,
      [{ payload: output.payload as unknown as Record<string, unknown>, flags: output.flags }],
      output.dropped as unknown as DroppedItem[],
      usage,
      now(),
      output.validCount,
    );
  }

  /**
   * TAI6-T3 DRAFT_LAB_CHALLENGE. Built from the stored snapshot only; the provider returns lab and parameter proposals,
   * never code. The pure LV-01..LV-09 pipeline then drops anything outside the allowlist, the validated ranges or the
   * engine's solvable-and-discriminating test. Reference states are read live (read-only) outside any transaction.
   */
  private async processLabChallenge(claimed: Claimed, job: any, now: () => Date) {
    const lesson = await this.db.lesson.findUnique({ where: { id: job.lessonId }, select: { id: true, labId: true, challengeParams: true } });
    if (!lesson) return this.fail(claimed, "LESSON_UNAVAILABLE", null, [], now());
    const snapshot = job.inputSnapshot as unknown as LabChallengeSnapshotV1;
    let text: string;
    let usage: Usage = null;
    try {
      await this.respectMinInterval();
      const result = await this.provider!.generate({
        system: DRAFT_LAB_CHALLENGE_SYSTEM,
        user: buildLabChallengeUser(snapshot),
        maxTokens: LAB_CHALLENGE_MAX_OUTPUT_TOKENS,
        timeoutMs: RUNNER_TIMINGS.providerTimeoutMs,
        responseSchema: labChallengeResponseSchema(snapshot.models),
      });
      text = result.text;
      usage = { inputTokens: result.inputTokens, outputTokens: result.outputTokens };
      this.logger.log(`job ${job.id} attempt ${claimed.attempt}: provider ok, request ${result.requestId ?? "-"}, tokens ${result.inputTokens}/${result.outputTokens}`);
    } catch (error) {
      const code: FailureCode = error instanceof AiProviderError ? error.code : "INTERNAL_ERROR";
      this.logger.warn(`job ${job.id} attempt ${claimed.attempt}: ${code}`);
      return this.fail(claimed, code, null, [], now());
    }
    let contexts;
    try {
      contexts = await loadLabContexts(this.db, snapshot.models.map((model) => model.labId));
    } catch {
      return this.fail(claimed, "INTERNAL_ERROR", usage, [], now());
    }
    const output = processLabChallengeOutput(snapshot, contexts, { labId: lesson.labId ?? null, challengeParams: (lesson.challengeParams as Record<string, number | string> | null) ?? null }, text);
    if (!output.ok) return this.fail(claimed, output.code, usage, output.dropped as DroppedItem[], now());
    return this.succeed(claimed, output.items.map((item) => ({ payload: item.payload as unknown as Record<string, unknown>, flags: item.flags })), output.dropped as unknown as DroppedItem[], usage, now());
  }

  /**
   * TAI2-T4 ASSESS_SUBMISSION. Built from the stored snapshot only: injection@1 first (a match makes no provider call and
   * stores a SUPPRESSED suggestion), then the fail-closed privacy guard with identities re-read server-side (a class
   * member who joined after the snapshot is caught too; on a violation the job FAILS with PRIVACY_GUARD_REJECTED and
   * nothing is sent), then the provider, strict parse + KX-01 (retried once), and VA-01..05 verification.
   */
  private async processAssessment(claimed: Claimed, job: any, now: () => Date) {
    const snapshot = job.inputSnapshot as AssessSnapshotV1;
    const submission = job.submissionId
      ? await this.db.assignmentSubmission.findUnique({ where: { id: job.submissionId }, select: { id: true, studentId: true, resourceVersion: true } })
      : null;
    if (!submission || snapshot?.version !== "assess-snapshot@1") return this.fail(claimed, "SUBMISSION_UNAVAILABLE", null, [], now());
    if (detectInjection(snapshot.payload))
      return this.succeedAssessment(claimed, job, "SUPPRESSED", suppressedForInjection(snapshot), ["INJECTION_SUSPECTED"], null, now());

    let request;
    try {
      const identities = await loadKnownIdentities(this.db, job.classId, submission.studentId);
      request = buildAssessProviderRequest(snapshot.payload, identities, RUNNER_TIMINGS.providerTimeoutMs);
    } catch (error) {
      const code: FailureCode = error instanceof PrivacyGuardError ? PRIVACY_GUARD_FAILURE : "INTERNAL_ERROR";
      this.logger.warn(`job ${job.id} attempt ${claimed.attempt}: ${code}`);
      return this.fail(claimed, code, null, [], now());
    }
    let text: string;
    let usage: Usage = null;
    try {
      await this.respectMinInterval();
      const result = await this.provider!.generate(request);
      text = result.text;
      usage = { inputTokens: result.inputTokens, outputTokens: result.outputTokens };
      this.logger.log(`job ${job.id} attempt ${claimed.attempt}: provider ok, request ${result.requestId ?? "-"}, tokens ${result.inputTokens}/${result.outputTokens}`);
    } catch (error) {
      const code: FailureCode = error instanceof AiProviderError ? error.code : "INTERNAL_ERROR";
      this.logger.warn(`job ${job.id} attempt ${claimed.attempt}: ${code}`);
      return this.fail(claimed, code, null, [], now());
    }
    const parsed = parseAssessmentOutput(text);
    if (!parsed.ok) return this.fail(claimed, parsed.code, usage, [], now());
    const verified = verifySuggestion(snapshot, parsed.value);
    return this.succeedAssessment(claimed, job, verified.status, verified.criterionResults, [], usage, now());
  }

  /** RUNNING -> SUCCEEDED with exactly one immutable suggestion, conditional on the claimed attempt. */
  async succeedAssessment(claimed: Claimed, job: any, status: SuggestionStatus, criterionResults: CriterionResult[], flags: string[], usage: Usage, at: Date) {
    await this.db.$transaction(async (tx: any) => {
      const tokenData = await this.tokens(tx, claimed.id, usage);
      const result = await tx.aiJob.updateMany({
        where: { id: claimed.id, status: "RUNNING", attemptCount: claimed.attempt },
        data: { status: "SUCCEEDED", completedAt: at, leaseUntil: null, failureCode: null, ...tokenData },
      });
      if (result.count !== 1) return this.recordCancelledUsage(tx, claimed, usage);
      const request = (job.request ?? {}) as { mode?: string; resourceVersion?: number };
      await tx.aiAssessmentSuggestion.create({
        data: {
          jobId: claimed.id, submissionId: job.submissionId, resourceVersion: request.resourceVersion ?? 0, promptVersion: job.promptVersion,
          mode: request.mode === "assist" ? "assist" : "shadow", status, criterionResults, flags,
        },
      });
      // One submission is one unit; a suppressed suggestion made no provider call, so it has no tokens and costs nothing.
      const settled = await this.settle(tx, claimed.id, { kind: "SETTLE", validCount: 1 });
      await audit(tx, {
        actor: null, action: "ai_job.complete", targetType: "AiJob", targetId: claimed.id,
        after: { status: "SUCCEEDED", failureCode: null, validCount: criterionResults.filter((c) => c.valid).length, droppedCount: criterionResults.filter((c) => !c.valid).length, suggestionStatus: status, ...tokenData, ...settled },
      });
    }, TX_LIMITS);
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

  /** `validCount` defaults to the item count; GENERATE_ASSESSMENT stores one draft item but settles credits per surviving slot. */
  async succeed(claimed: Claimed, items: Array<{ payload: Record<string, unknown>; flags: unknown }>, dropped: DroppedItem[], usage: Usage, at: Date, validCount = items.length) {
    await this.db.$transaction(async (tx: any) => {
      const tokenData = await this.tokens(tx, claimed.id, usage);
      const result = await tx.aiJob.updateMany({
        where: { id: claimed.id, status: "RUNNING", attemptCount: claimed.attempt },
        data: { status: "SUCCEEDED", completedAt: at, leaseUntil: null, failureCode: null, droppedItems: dropped, ...tokenData },
      });
      if (result.count !== 1) return this.recordCancelledUsage(tx, claimed, usage);
      await tx.aiJobItem.createMany({ data: items.map((item, position) => ({ jobId: claimed.id, position, payload: item.payload, flags: item.flags })) });
      const settled = await this.settle(tx, claimed.id, { kind: "SETTLE", validCount });
      await audit(tx, {
        actor: null, action: "ai_job.complete", targetType: "AiJob", targetId: claimed.id,
        after: { status: "SUCCEEDED", failureCode: null, validCount, droppedCount: dropped.length, ...tokenData, ...settled },
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
      if (next === "FAILED") {
        // Any system or validation failure refunds the whole reservation, whatever tokens were spent.
        const settled = await this.settle(tx, claimed.id, { kind: "REFUND" });
        await audit(tx, {
          actor: null, action: "ai_job.complete", targetType: "AiJob", targetId: claimed.id,
          after: { status: "FAILED", failureCode: code, validCount: 0, droppedCount: dropped.length, ...tokenData, ...settled },
        });
      }
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
        if (result.count === 1 && !requeue) {
          const settled = await this.settle(tx, job.id, { kind: "REFUND" });
          await audit(tx, { actor: null, action: "ai_job.complete", targetType: "AiJob", targetId: job.id, after: { status: "FAILED", failureCode: "INTERNAL_ERROR", validCount: 0, droppedCount: 0, ...settled } });
        }
      }, TX_LIMITS);
    }
    return expired.length;
  }
}
