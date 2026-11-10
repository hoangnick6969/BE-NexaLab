import { Inject, Injectable, Optional } from "@nestjs/common";
import { z } from "zod";
import { AI_ASSESSMENT_CONFIG, ASSESSMENT_EVALUATION_GATE, type AiAssessmentConfig } from "../../../config/ai-assessment";
import { evaluateShadow, loadShadowRows } from "./assessment-evaluation";
import { audit } from "../../../common/audit";
import { idempotent, readIdempotencyKey } from "../../../common/idempotency";
import { Db } from "../../../db/db";
import { ownedClass } from "../../classes/application/class-access";
import { classArchived, lock } from "../../classes/application/class-common";
import { latestSubmission, submissionStatus } from "../../classes/application/assignment-test-contract";
import type { AiConfig } from "./ai-config";
import { aiProviderNotConfigured, aiQuotaExceeded, idempotencyKeyRequired, toAiJobView } from "./ai-job-contract";
import { AI_CONFIG, AI_PROVIDER, type AiProvider } from "./ai-provider";
import { quotaUsage } from "./ai-jobs.service";
import { ASSESSMENT_SUGGESTION_SCHEMA_VERSION } from "./assess-submission-prompt";
import {
  aiAssessmentDisabled,
  aiAssessmentRequestBody,
  ASSESS_PURPOSE,
  assignmentNotFound,
  BLOCKING_JOB_STATUSES,
  submissionNotFound,
  type SkipReason,
} from "./assessment-contract";
import { buildAssessSnapshot, loadKnownIdentities } from "./assessment-snapshot";
import { aiEstimateChanged, confirmedCreditsRequired } from "./credits-contract";
import { AiCreditsService } from "./credits.service";

const DAY_MS = 24 * 3600_000;

/** Consent path for a policy with consentRequired = true: a linked parent with an active `ai-assessment` consent. */
async function hasAssessmentConsent(tx: any, studentId: string) {
  const links = await tx.parentLink.findMany({ where: { studentId, status: "approved" }, select: { parentId: true } });
  if (!links.length) return false;
  const consent = await tx.parentConsent.findFirst({
    where: { userId: { in: links.map((l: { parentId: string }) => l.parentId) }, purpose: "ai-assessment", withdrawnAt: null },
    select: { id: true },
  });
  return !!consent;
}

/**
 * TAI2-T4 request route. Creates one ASSESS_SUBMISSION job per eligible submission on the TAI-01 runtime; no provider
 * call happens here (the runner does it from the stored snapshot). Owner only (403 CLASS_ACCESS_DENIED via ownedClass);
 * a missing assignment or a submission outside it is 404. Idempotent per key; at most one blocking job per submission
 * and prompt version (ALREADY_SUGGESTED), so retries and replays never duplicate work. A failed or cancelled job does
 * not block a new request: after a provider outage the teacher may retry, or simply grade by hand.
 */
@Injectable()
export class AiAssessmentsService {
  constructor(
    @Inject(Db) private db: Db,
    @Inject(AI_CONFIG) private config: AiConfig,
    @Inject(AI_PROVIDER) private provider: AiProvider | null,
    @Inject(AI_ASSESSMENT_CONFIG) private assessment: AiAssessmentConfig,
    @Optional() @Inject(AiCreditsService) private credits?: AiCreditsService,
  ) {}

  async request(classId: string, assignmentId: string, req: any, raw: unknown) {
    const body = aiAssessmentRequestBody.parse(raw);
    const key = readIdempotencyKey(req);
    if (!key) throw idempotencyKeyRequired();
    const classroom = await ownedClass(this.db, classId, req.user);
    if (classroom.status !== "ACTIVE") throw classArchived();
    const policy = this.assessment.policy;
    if (!this.assessment.enabled || this.assessment.mode === "off" || !policy) throw aiAssessmentDisabled();
    if (!this.provider || !this.config.provider || !this.config.model) throw aiProviderNotConfigured();
    // Defence in depth for the boot check: the configured adapter must be covered by the recorded policy.
    if (!policy.allowedProviders.includes(this.config.provider)) throw aiAssessmentDisabled();

    const submissionIds = [...new Set(body.submissionIds)];
    const credits = this.credits?.enabled ? this.credits : null;
    if (credits && body.confirmedCredits === undefined) throw confirmedCreditsRequired();
    const actorId = req.user.sub as string;
    const mode = this.assessment.mode;
    const promptVersion = this.assessment.promptVersion;
    const ctx = { actorId, key, scope: `POST classes/${classId}/assignments/${assignmentId}/ai-assessments`, payload: { submissionIds, confirmedCredits: credits ? body.confirmedCredits : undefined } };
    return idempotent(this.db, ctx, async (tx) => {
      await lock(tx, `ai-quota:${actorId}:${ASSESS_PURPOSE}`);
      // TAI-05: the confirmed value is the ceiling for the whole request (one unit price per requested submission);
      // submissions that end up skipped are not charged, so the reservation can only be smaller.
      const unit = credits ? await credits.quote(tx, ASSESS_PURPOSE, 1) : null;
      if (unit && body.confirmedCredits !== unit.credits * submissionIds.length) throw aiEstimateChanged(unit.credits * submissionIds.length, unit.price.version);
      await lock(tx, `ai-assess:${assignmentId}`);
      const assignment = await tx.assignment.findFirst({ where: { id: assignmentId, classId, contentType: "written" }, select: { id: true, contentId: true } });
      if (!assignment) throw assignmentNotFound();
      const rows = await tx.assignmentSubmission.findMany({
        where: { id: { in: submissionIds }, assignmentId },
        select: { id: true, studentId: true, timing: true, submittedAt: true, resourceVersion: true, answers: true, decision: { select: { decision: true } } },
      });
      if (rows.length !== submissionIds.length) throw submissionNotFound();
      const resource = await tx.classResource.findFirst({ where: { id: assignment.contentId, classId, kind: "WRITTEN_TASK" }, select: { id: true, title: true, lessonId: true, content: true } });
      if (!resource) throw assignmentNotFound();
      const lesson = resource.lessonId ? await tx.lesson.findUnique({ where: { id: resource.lessonId }, select: { id: true, title: true } }) : null;

      const skipped: Array<{ submissionId: string; reason: SkipReason; detail?: string }> = [];
      const toCreate: Array<{ row: any; snapshot: unknown; digest: string }> = [];
      for (const id of submissionIds) {
        const row = rows.find((r: any) => r.id === id)!;
        const status = submissionStatus(row);
        if (status === "LATE_REVIEW_PENDING" || status === "REJECTED_ZERO") {
          skipped.push({ submissionId: id, reason: "NOT_GRADEABLE" });
          continue;
        }
        const siblings = await tx.assignmentSubmission.findMany({ where: { assignmentId, studentId: row.studentId }, select: { id: true, submittedAt: true } });
        if (latestSubmission(siblings)?.id !== id) {
          skipped.push({ submissionId: id, reason: "NOT_CURRENT" });
          continue;
        }
        // One blocking job per submission, prompt version and mode: a shadow job does not block the assist request.
        const existing = await tx.aiJob.findMany({ where: { submissionId: id, promptVersion, status: { in: [...BLOCKING_JOB_STATUSES] } }, select: { request: true } });
        if (existing.some((job: any) => job.request?.mode === mode)) {
          skipped.push({ submissionId: id, reason: "ALREADY_SUGGESTED" });
          continue;
        }
        if (policy.consentRequired && !(await hasAssessmentConsent(tx, row.studentId))) {
          skipped.push({ submissionId: id, reason: "CONSENT_REQUIRED" });
          continue;
        }
        if (!lesson) {
          skipped.push({ submissionId: id, reason: "LESSON_UNAVAILABLE" });
          continue;
        }
        const identities = await loadKnownIdentities(tx, classId, row.studentId);
        const outcome = buildAssessSnapshot({ topic: lesson.title, content: resource.content, answers: row.answers, identities });
        if (!outcome.ok) {
          skipped.push({ submissionId: id, reason: "AI_POLICY_INELIGIBLE", detail: outcome.detail });
          continue;
        }
        toCreate.push({ row, snapshot: outcome.snapshot, digest: outcome.digest });
      }

      if (toCreate.length) {
        const usage = await quotaUsage(tx, actorId, ASSESS_PURPOSE, this.config, new Date(), { daily: this.assessment.dailyLimit, concurrency: null });
        if (usage.usedLast24h + toCreate.length > usage.dailyLimit) throw aiQuotaExceeded(ASSESS_PURPOSE, usage.resetsAt ?? new Date(Date.now() + DAY_MS));
      }
      const created = [];
      for (const { row, snapshot, digest } of toCreate) {
        const job = await tx.aiJob.create({
          data: {
            classId, actorId, purpose: ASSESS_PURPOSE, targetKind: "WRITTEN_TASK", lessonId: lesson!.id, submissionId: row.id,
            request: { purpose: ASSESS_PURPOSE, submissionId: row.id, mode, resourceVersion: row.resourceVersion },
            inputSnapshot: snapshot, inputDigest: digest,
            promptVersion, outputSchemaVersion: ASSESSMENT_SUGGESTION_SCHEMA_VERSION,
            provider: this.config.provider!, model: this.config.model!,
            ...(unit ? { pricingVersionId: unit.price.id, estimatedCredits: unit.credits } : {}),
          },
        });
        // One RESERVE per job; a short balance (402) rolls the whole request back, so nothing is created.
        if (unit) await credits!.reserve(tx, { jobId: job.id, actorId, credits: unit.credits, pricingVersionId: unit.price.id });
        created.push({ ...toAiJobView(job, { lessonChangedSinceGeneration: false, itemCount: 0, credits: !!credits }), purpose: ASSESS_PURPOSE, submissionId: row.id });
      }
      await audit(tx, {
        actor: req.user, action: "ai_assessment.request", targetType: "Assignment", targetId: assignmentId,
        after: { assignmentId, createdCount: created.length, skippedCount: skipped.length, promptVersion, mode },
      });
      return { mode, created, skipped };
    });
  }

  /**
   * TAI2-T5 admin shadow report for one prompt version (and optionally one model): shadow suggestions joined with the
   * latest MANUAL teacher grade of the same rubric version. Read-only; computed on every call.
   */
  async evaluation(rawQuery: unknown) {
    const query = evaluationQuery.parse(rawQuery ?? {});
    const promptVersion = query.promptVersion ?? this.assessment.promptVersion;
    const { rows, models } = await loadShadowRows(this.db, promptVersion, query.model);
    const report = evaluateShadow(rows, { promptVersion, model: query.model ?? (models.length === 1 ? models[0] : null) });
    const recorded = ASSESSMENT_EVALUATION_GATE[promptVersion] ?? null;
    return { ...report, models, recordedGate: recorded ? { source: recorded.source, verdict: recorded.verdict, responses: recorded.responses, recordedOn: recorded.recordedOn } : null };
  }
}

const evaluationQuery = z
  .object({ promptVersion: z.string().trim().regex(/^[a-z0-9-]+@\d+$/).optional(), model: z.string().trim().min(1).max(100).optional() })
  .strict();
