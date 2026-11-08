import { BadRequestException, ConflictException, ForbiddenException, HttpException, HttpStatus, NotFoundException, UnauthorizedException } from "@nestjs/common";
import { applicableAssignmentWhere } from "../../classes/application/class-access";
import { projectLab, projectLesson } from "../../progress/application/progress-projection";
import { buildContext } from "./tutor";
import { decideTutorLevel, labDigest, renderTutorTemplate, TUTOR_RULES, tutorKey, variantName } from "./tutor-rules";
import { buildProviderPayload, contextDigest, resolveObservation, studentAiConfig, type ObservationStore, type StudentAiConfig, type StudentTutorProvider } from "./tutor-provider";
import {
  CHECKPOINT_HINT_CATALOGS, CheckpointHintInputError, evaluateOneCheckpoint, hasCheckpointHints, hasRunHints, hasRunReflections, planCheckpointHint, planRunHint, runHintSteps,
  type PreviousCheckpointHint, type PreviousRunHint, type RunHintMoment,
} from "./checkpoint-hint-rules";
import { explainVerdict } from "./verdict-explanation";

type Actor = { sub: string; sid: string };

/**
 * Test-only provider delay (B0P-T4 verification). Honoured only in an explicit
 * development/test environment, never in production.
 */
export function providerDelayMs(env: NodeJS.ProcessEnv = process.env) {
  if (env.NODE_ENV === "production" || !["development", "test"].includes(env.APP_ENV ?? "")) return 0;
  const value = Number(env.HINT_PROVIDER_TEST_DELAY_MS ?? 0);
  return Number.isFinite(value) && value > 0 ? Math.min(value, 30000) : 0;
}

/** Authorization that must still hold when the provider returns. */
async function assertStillAuthorized(db: any, actor: Actor, attempt: { id: string; assignmentId: string | null }) {
  const session = await db.session.findFirst({
    where: { id: actor.sid, userId: actor.sub, kind: "refresh", expiresAt: { gt: new Date() } },
    select: { user: { select: { status: true, role: true } } },
  });
  if (!session || session.user.status !== "active" || session.user.role !== "STUDENT")
    throw new UnauthorizedException({ code: "UNAUTHENTICATED", message: "Phiên đã hết hạn hoặc bị thu hồi" });
  if (attempt.assignmentId) {
    const assignment = await db.assignment.findFirst({
      where: { id: attempt.assignmentId, ...applicableAssignmentWhere(actor.sub) },
      select: { id: true },
    });
    if (!assignment) throw new ForbiddenException({ code: "ASSIGNMENT_ACCESS_REVOKED", message: "Bài này không còn được giao cho em" });
  }
}

/** API shape of a legacy Lab hint: never the snapshot, digests, model or fallback reason (SAI-01 contract). */
export function legacyHintView(hint: any) {
  return {
    id: hint.id,
    attemptId: hint.attemptId,
    level: hint.level,
    content: hint.content,
    escalated: hint.escalated ?? null,
    provider: hint.provider ?? hint.contextSnapshot?.provider ?? "rules",
    createdAt: hint.createdAt,
  };
}

export type HintDeps = { provider: StudentTutorProvider | null; config?: StudentAiConfig; now?: () => Date };
const WINDOW_MS = 10 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** SAI-01 CAP-6: hints per student in a rolling 10 minutes, counted from HintLog so every API instance agrees. */
async function assertHintWindow(db: any, studentId: string, config: StudentAiConfig, now: Date) {
  const rows = await db.hintLog.findMany({
    where: { attempt: { studentId }, ruleVersion: { startsWith: "tutor-rules@" }, createdAt: { gt: new Date(now.getTime() - WINDOW_MS) } },
    select: { createdAt: true },
    orderBy: { createdAt: "asc" },
  });
  if (rows.length < config.hintsPer10Min) return;
  const leaving = rows[rows.length - config.hintsPer10Min].createdAt.getTime() + WINDOW_MS;
  const retryAfterSeconds = Math.max(1, Math.ceil((leaving - now.getTime()) / 1000));
  throw new HttpException({
    code: "HINT_RATE_LIMITED",
    message: `Em đã xin nhiều gợi ý trong ít phút. Hãy thử lại sau ${retryAfterSeconds} giây.`,
    details: { retryAfterSeconds },
  }, HttpStatus.TOO_MANY_REQUESTS);
}

/** PostgreSQL-backed cache and budget reads for resolveObservation. */
function observationStore(db: any, studentId: string): ObservationStore {
  return {
    async cached(key, now) {
      const row = await db.hintObservationCache.findUnique({ where: { key } });
      return row && row.expiresAt > now ? { observation: row.observation, model: row.model, promptVersion: row.promptVersion } : null;
    },
    // A provider call is any row that reached the model (success or fallback after the call); cache hits are free.
    providerCallsLast24h: (now) => db.hintLog.count({
      where: { attempt: { studentId }, model: { not: null }, NOT: { provider: "cache" }, createdAt: { gt: new Date(now.getTime() - DAY_MS) } },
    }),
  };
}

/** The escalation decision for the latest attempt from the challenge history (pure; reused by the recheck). */
function legacyDecision(history: any[], attempt: any) {
  const key = tutorKey(attempt.simulationResult);
  const currentDigest = labDigest(attempt.labState);
  const hinted = history.flatMap((item: any) => item.hints.map((hint: any) => ({ hint, item })))
    .sort((a: any, b: any) => a.hint.createdAt.getTime() - b.hint.createdAt.getTime());
  const last = hinted.at(-1);
  const decision = decideTutorLevel({
    key,
    currentDigest,
    previous: last ? { level: last.hint.level, labDigest: last.hint.labDigest ?? labDigest(last.item.labState) } : null,
    sameLevelRepeats: (level) => hinted.filter(({ hint }: any) => hint.level === level).length,
  });
  return { key, currentDigest, decision };
}

/**
 * SAI-01: a versioned, traceable hint for the student's latest legacy Lab attempt (circuit, chemistry, eye).
 * B0P-T4 boundary kept: context is read first, the optional provider runs with no transaction or lock, then a short
 * transaction rechecks authorization and the whole escalation decision before persisting one HintLog.
 * FR-22: only HintLog and the lastHintLevel projection are written.
 */
export async function requestHint(db: any, actor: Actor, attemptId: string, deps: HintDeps) {
  const config = deps.config ?? studentAiConfig();
  const now = () => deps.now?.() ?? new Date();
  // 1. Read context (no transaction, no lock).
  const attempt = await db.attempt.findFirst({
    where: { id: attemptId, studentId: actor.sub },
    include: { challenge: true, hints: true },
  });
  if (!attempt) throw new NotFoundException();
  const rubricRef = attempt.labRunId
    ? ((await db.labRun.findUnique({ where: { id: attempt.labRunId }, select: { execution: true } }))?.execution as any)?.rubricRef
    : null;
  if (hasCheckpointHints(rubricRef)) return requestCheckpointHint(db, actor, attempt, rubricRef);
  if (attempt.hints.length) return legacyHintView(attempt.hints[0]);
  const history = await db.attempt.findMany({
    where: { studentId: actor.sub, challengeId: attempt.challengeId },
    include: { hints: true },
    orderBy: { createdAt: "asc" },
  });
  if (history.at(-1)?.id !== attemptId)
    throw new BadRequestException({ code: "HINT_NOT_LATEST_ATTEMPT", message: "Hãy yêu cầu gợi ý cho lần thử mới nhất" });
  if (attempt.verdict === "passed")
    throw new ConflictException({ code: "HINT_NOT_NEEDED", message: "Em đã đạt thử thách này nên không cần gợi ý" });
  await assertHintWindow(db, actor.sub, config, now());
  const { key, currentDigest, decision } = legacyDecision(history, attempt);
  await assertStillAuthorized(db, actor, attempt);
  const user = await db.user.findUniqueOrThrow({ where: { id: actor.sub } });
  const template = renderTutorTemplate(key, decision.level, decision.variant, attempt.simulationResult);
  const context = {
    ...buildContext(user, attempt, history, decision.level),
    labDigest: currentDigest,
    ruleVersion: TUTOR_RULES,
    tutorKey: key,
    variant: variantName(decision.variant),
    escalated: decision.escalated,
  };

  // 2. Provider call outside any transaction; every failure falls back to the template.
  const delay = providerDelayMs();
  if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
  const outcome = await resolveObservation({
    provider: deps.provider,
    config,
    store: observationStore(db, actor.sub),
    payload: buildProviderPayload({ objective: attempt.challenge.objective, labState: attempt.labState, simulation: attempt.simulationResult, level: decision.level, templateHint: template }),
    cacheKeyInput: { challengeId: attempt.challengeId, labDigest: currentDigest, key, level: decision.level },
    now: now(),
  });

  // 3. Short transaction: recheck authorization, window and the escalation decision, then persist.
  const hint = await db.$transaction(
    async (tx: any) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${actor.sub}))`;
      await assertStillAuthorized(tx, actor, attempt);
      const current = await tx.attempt.findFirst({
        where: { id: attemptId, studentId: actor.sub },
        include: { hints: true },
      });
      if (!current) throw new NotFoundException();
      // A parallel request already stored this attempt's hint: return it, never a second one.
      if (current.hints.length) return { row: current.hints[0], stored: true };
      const latest = await tx.attempt.findMany({
        where: { studentId: actor.sub, challengeId: attempt.challengeId },
        include: { hints: true },
        orderBy: { createdAt: "asc" },
      });
      const recheck = latest.at(-1)?.id === attemptId ? legacyDecision(latest, attempt).decision : null;
      if (!recheck || recheck.level !== decision.level || recheck.variant !== decision.variant || recheck.escalated !== decision.escalated)
        throw new ConflictException({ code: "HINT_CONTEXT_CHANGED", message: "Lần thử đã thay đổi; hãy yêu cầu gợi ý lại" });
      await assertHintWindow(tx, actor.sub, config, now());
      const snapshot = { ...context, provider: outcome.provider };
      const row = await tx.hintLog.create({
        data: {
          attemptId,
          level: decision.level,
          content: outcome.content,
          contextSnapshot: snapshot,
          contextDigest: contextDigest(snapshot),
          labDigest: currentDigest,
          ruleVersion: TUTOR_RULES,
          promptVersion: outcome.promptVersion,
          provider: outcome.provider,
          model: outcome.model,
          fallbackReason: outcome.fallbackReason,
          escalated: decision.escalated,
          variant: variantName(decision.variant),
        },
      });
      await projectLab(tx, actor.sub, attempt.challenge.labId);
      if (attempt.lessonStepId) {
        const step = await tx.lessonStep.findUnique({ where: { id: attempt.lessonStepId }, select: { lessonId: true } });
        if (step) await projectLesson(tx, actor.sub, step.lessonId);
      }
      return { row, stored: false };
    },
    { timeout: 20000 },
  );
  // The cache holds no student data; a failed write only costs a later provider call.
  if (!hint.stored && outcome.cacheWrite) {
    const expiresAt = new Date(now().getTime() + config.cacheTtlDays * DAY_MS);
    await db.hintObservationCache.upsert({
      where: { key: outcome.cacheWrite.key },
      create: { key: outcome.cacheWrite.key, observation: outcome.cacheWrite.observation, promptVersion: outcome.promptVersion!, model: outcome.model!, expiresAt },
      update: {},
    }).catch(() => undefined);
  }
  return legacyHintView(hint.row);
}

const CHECKPOINT_HINT_KIND = "checkpoint-hint";
const RUN_HINT_KIND = "checkpoint-run-hint";
/** In-run hints per LabRun; a learner who needs more submits and gets the after-submit ladder. */
export const RUN_HINT_LIMIT = 24;

/** API shape of a SAI-01A hint: the HintLog row plus the fields the student UI needs. */
function checkpointHintView(hint: any) {
  const snapshot = hint.contextSnapshot ?? {};
  return {
    ...hint,
    criterion: snapshot.criterion,
    checkpointId: snapshot.checkpointId,
    label: snapshot.label,
    moment: snapshot.moment ?? "AFTER_SUBMIT",
    escalated: snapshot.escalated,
    repeatReason: snapshot.repeatReason,
    provider: snapshot.provider,
    ruleVersion: snapshot.ruleVersion,
    contextSnapshot: undefined,
  };
}

/**
 * SAI-01A rules-only hint for a checkpoint Foundational Lab attempt. No provider is called, so the
 * whole decision runs in one short transaction under the student's lock. FR-22: only HintLog and the
 * lastHintLevel projection are written.
 */
async function requestCheckpointHint(db: any, actor: Actor, attempt: any, rubricRef: string) {
  return db.$transaction(
    async (tx: any) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${actor.sub}))`;
      await assertStillAuthorized(tx, actor, attempt);
      const stored = await tx.hintLog.findFirst({ where: { attemptId: attempt.id }, orderBy: { createdAt: "asc" } });
      if (stored) return checkpointHintView(stored);
      if (attempt.verdict === "passed")
        throw new ConflictException({ code: "HINT_NOT_NEEDED", message: "Em đã hoàn thành bài này nên không cần gợi ý" });
      const history = await tx.attempt.findMany({
        where: { studentId: actor.sub, challengeId: attempt.challengeId },
        include: { hints: true },
        orderBy: { createdAt: "asc" },
      });
      if (history.at(-1)?.id !== attempt.id)
        throw new BadRequestException({ code: "HINT_NOT_LATEST_ATTEMPT", message: "Hãy yêu cầu gợi ý cho lần làm mới nhất" });
      // In-run moment-A hints (levels 1–2) count as earlier hints on their criterion, so the first hint
      // after submitting continues from them instead of repeating level 1.
      const inRun = await tx.hintLog.findMany({
        where: { attemptId: null, labRun: { studentId: actor.sub, challengeId: attempt.challengeId } },
      });
      const previous: PreviousCheckpointHint[] = [...history.flatMap((item: any) => item.hints), ...inRun]
        .sort((a: any, b: any) => a.createdAt.getTime() - b.createdAt.getTime())
        .map((hint: any) => ({ id: hint.id, snapshot: hint.contextSnapshot }))
        .filter(({ snapshot }: any) => snapshot?.rubricRef === rubricRef &&
          (snapshot.kind === CHECKPOINT_HINT_KIND || (snapshot.kind === RUN_HINT_KIND && snapshot.moment === "BEFORE_PREDICTION")))
        .map(({ id, snapshot }: any) => snapshot.kind === CHECKPOINT_HINT_KIND ? snapshot
          : { criterion: snapshot.criterion, level: snapshot.level, variant: snapshot.variant, answerDigest: "run:" + id });
      // Event-scored Labs (FL-06/07/10) keep the learner's answers in the run's server events.
      const evidence = CHECKPOINT_HINT_CATALOGS[rubricRef].withEvents && attempt.labRunId
        ? { labState: attempt.labState, events: (await tx.labRunEvent.findMany({ where: { runId: attempt.labRunId }, orderBy: { sequence: "asc" } })).map((row: any) => row.event) }
        : attempt.labState;
      const plan = planCheckpointHint({ rubricRef, evidence, result: attempt.simulationResult, previous });
      if (!plan) throw new ConflictException({ code: "HINT_NOT_NEEDED", message: "Không còn tiêu chí nào cần gợi ý" });
      const hint = await tx.hintLog.create({
        data: {
          attemptId: attempt.id,
          labRunId: attempt.labRunId,
          level: plan.level,
          content: plan.content,
          // Rule decision only: no user, class, studentLevel or free text (SAI-01A CAP-6).
          contextSnapshot: {
            kind: CHECKPOINT_HINT_KIND,
            ruleVersion: plan.ruleVersion,
            misconceptionRules: plan.misconceptionRules,
            rubricRef,
            criterion: plan.criterion,
            checkpointId: plan.checkpointId,
            label: plan.label,
            misconception: plan.misconception,
            answerDigest: plan.answerDigest,
            level: plan.level,
            variant: plan.variant,
            escalated: plan.escalated,
            repeatReason: plan.repeatReason,
            provider: "rules",
          },
        },
      });
      await projectLab(tx, actor.sub, attempt.challenge.labId);
      return checkpointHintView(hint);
    },
    { timeout: 20000 },
  );
}

export type RunHintRequest = { criterion: string; moment: RunHintMoment; state?: unknown; prediction?: unknown };

/**
 * SAI-01A moments A and B: a hint during a LabRun, before it is submitted. A (before predicting) gives
 * level 1 then 2 and never reads the learner's draft. B (after the observation) scores that one checkpoint
 * with the activity's evaluator and answers only when the prediction did not match. Writes HintLog only.
 */
/** The student's own live checkpoint run and its rubric, or the reason it cannot give hints. */
async function hintableRun(db: any, actor: Actor, runId: string) {
  const run = await db.labRun.findFirst({ where: { id: runId, studentId: actor.sub } });
  if (!run) throw new NotFoundException();
  if (run.revokedAt) throw new ConflictException({ code: "RUN_REVOKED", message: "Lượt làm này đã bị thu hồi" });
  if (run.expiresAt && run.expiresAt < new Date()) throw new ConflictException({ code: "RUN_EXPIRED", message: "Lượt làm này đã hết hạn" });
  const rubricRef = (run.execution as any)?.rubricRef;
  if (!hasRunHints(rubricRef)) throw new ConflictException({ code: "HINT_UNAVAILABLE", message: "Bài này chưa có gợi ý trong lúc làm" });
  return { run, rubricRef: rubricRef as string };
}

/** Scores the observed checkpoint with the activity evaluator; 400 when the input is not valid for it. */
function observedCheckpoint(rubricRef: string, request: { criterion: string; state?: unknown; prediction?: unknown }) {
  if (!hasRunReflections(rubricRef))
    throw new BadRequestException({ code: "INVALID_CHECKPOINT", message: "Bài này không có suy ngẫm sau quan sát" });
  const checkpointId = request.criterion.startsWith("prediction:") ? request.criterion.slice("prediction:".length) : null;
  if (!checkpointId) throw new BadRequestException({ code: "INVALID_CHECKPOINT", message: "Bước này không có kết quả quan sát" });
  try {
    return evaluateOneCheckpoint(rubricRef, { id: checkpointId, state: request.state, prediction: request.prediction });
  } catch {
    throw new BadRequestException({ code: "INVALID_CHECKPOINT", message: "Trạng thái hoặc dự đoán không hợp lệ cho bước này" });
  }
}

/**
 * Whether the prediction of an already observed step differs from the observation, so the UI offers
 * "Vì sao…" only after a wrong prediction. Writes nothing; the screen already shows the observation.
 */
export async function checkRunPrediction(db: any, actor: Actor, runId: string, request: { criterion: string; state?: unknown; prediction?: unknown }) {
  const { rubricRef } = await hintableRun(db, actor, runId);
  const observation = observedCheckpoint(rubricRef, request);
  return { criterion: request.criterion, mismatch: !observation?.predictionCorrect };
}

/** Steps of the run's Lab a learner can ask a moment-A hint about (labels only, no hint text). */
export async function listRunHintSteps(db: any, actor: Actor, runId: string) {
  const { rubricRef } = await hintableRun(db, actor, runId);
  return { steps: runHintSteps(rubricRef), reflections: hasRunReflections(rubricRef), maxLevel: 2 };
}

export async function requestRunHint(db: any, actor: Actor, runId: string, request: RunHintRequest) {
  const { run, rubricRef } = await hintableRun(db, actor, runId);
  let observation: any = null;
  if (request.moment === "AFTER_OBSERVATION") {
    observation = observedCheckpoint(rubricRef, request);
    if (observation?.predictionCorrect)
      throw new ConflictException({ code: "HINT_NOT_NEEDED", message: "Dự đoán của em ở bước này đã khớp với kết quả" });
  }
  return db.$transaction(
    async (tx: any) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${actor.sub}))`;
      await assertStillAuthorized(tx, actor, { id: run.id, assignmentId: run.assignmentId });
      const earlier = await tx.hintLog.findMany({ where: { labRunId: run.id, attemptId: null }, orderBy: { createdAt: "asc" } });
      if (earlier.length >= RUN_HINT_LIMIT)
        throw new HttpException({ code: "RUN_HINT_LIMIT", message: "Em đã dùng hết gợi ý của lượt này; hãy nộp bài để nhận gợi ý tiếp" }, HttpStatus.TOO_MANY_REQUESTS);
      const previous: PreviousRunHint[] = earlier
        .map((hint: any) => hint.contextSnapshot)
        .filter((snapshot: any) => snapshot?.kind === RUN_HINT_KIND);
      let plan;
      try {
        plan = planRunHint({ rubricRef, criterion: request.criterion, moment: request.moment, observation, previous });
      } catch (error) {
        if (error instanceof CheckpointHintInputError)
          throw new BadRequestException({ code: "INVALID_CHECKPOINT", message: "Bước này không có gợi ý phù hợp" });
        throw error;
      }
      const hint = await tx.hintLog.create({
        data: {
          labRunId: run.id,
          level: plan.level,
          content: plan.content,
          contextSnapshot: {
            kind: RUN_HINT_KIND,
            moment: plan.moment,
            ruleVersion: plan.ruleVersion,
            misconceptionRules: plan.misconceptionRules,
            rubricRef,
            criterion: plan.criterion,
            checkpointId: plan.checkpointId,
            label: plan.label,
            misconception: plan.misconception,
            level: plan.level,
            variant: plan.variant,
            escalated: plan.escalated,
            repeatReason: plan.repeatReason,
            provider: "rules",
          },
        },
      });
      return checkpointHintView(hint);
    },
    { timeout: 20000 },
  );
}

/**
 * B2: why the attempt passed or not, from the stored evaluator result only. Read-only (FR-22): no HintLog,
 * no projection. 404 for another student's attempt; 409 EXPLANATION_UNAVAILABLE for Labs without a catalog.
 */
export async function explainAttempt(db: any, actor: Actor, attemptId: string) {
  const attempt = await db.attempt.findFirst({
    where: { id: attemptId, studentId: actor.sub },
    select: { id: true, verdict: true, simulationResult: true, labRun: { select: { execution: true } } },
  });
  if (!attempt) throw new NotFoundException();
  const rubricRef = (attempt.labRun?.execution as any)?.rubricRef;
  const explanation = hasCheckpointHints(rubricRef)
    ? explainVerdict({ rubricRef, verdict: attempt.verdict, result: attempt.simulationResult })
    : null;
  if (!explanation)
    throw new ConflictException({ code: "EXPLANATION_UNAVAILABLE", message: "Bài này chưa có phần giải thích kết quả" });
  return { attemptId: attempt.id, ...explanation };
}
