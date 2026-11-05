import { BadRequestException, ConflictException, ForbiddenException, HttpException, HttpStatus, NotFoundException, UnauthorizedException } from "@nestjs/common";
import { applicableAssignmentWhere } from "../../classes/application/class-access";
import { projectLab, projectLesson } from "../../progress/application/progress-projection";
import { buildContext } from "./tutor";
import {
  CheckpointHintInputError, evaluateOneCheckpoint, hasCheckpointHints, hasRunHints, planCheckpointHint, planRunHint,
  type PreviousCheckpointHint, type PreviousRunHint, type RunHintMoment,
} from "./checkpoint-hint-rules";

type Provider = (context: any) => Promise<{ content: string; provider: string }>;
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

/**
 * B0P-T4: the optional provider runs with no database transaction or advisory
 * lock held. Context is read first, the provider is called, then a short
 * transaction rechecks authorization and context before persisting.
 */
/** `provider` is the explanation port; the interface layer passes the LLM adapter (infrastructure/llm.ts). */
export async function requestHint(db: any, actor: Actor, attemptId: string, provider: Provider) {
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
  if (attempt.hints.length) return attempt.hints[0];
  const history = await db.attempt.findMany({
    where: { studentId: actor.sub, challengeId: attempt.challengeId },
    include: { hints: true },
    orderBy: { createdAt: "asc" },
  });
  if (history.at(-1)?.id !== attemptId) throw new BadRequestException("Hãy yêu cầu gợi ý cho lần thử mới nhất");
  const previousLevel = Math.max(0, ...history.flatMap((item: any) => item.hints.map((h: any) => h.level)));
  const level = Math.min(4, 1 + previousLevel);
  await assertStillAuthorized(db, actor, attempt);
  const user = await db.user.findUniqueOrThrow({ where: { id: actor.sub } });
  const context = buildContext(user, attempt, history, level);

  // 2. Provider call outside any transaction; failures fall back to the rules engine.
  const delay = providerDelayMs();
  if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
  const explanation = await provider(context);

  // 3. Short transaction: recheck authorization and context, then persist.
  return db.$transaction(
    async (tx: any) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${actor.sub}))`;
      await assertStillAuthorized(tx, actor, attempt);
      const current = await tx.attempt.findFirst({
        where: { id: attemptId, studentId: actor.sub },
        include: { hints: true },
      });
      if (!current) throw new NotFoundException();
      // A parallel request already stored this attempt's hint: return it, never a second one.
      if (current.hints.length) return current.hints[0];
      const latest = await tx.attempt.findMany({
        where: { studentId: actor.sub, challengeId: attempt.challengeId },
        include: { hints: { select: { level: true } } },
        orderBy: { createdAt: "asc" },
      });
      const latestLevel = Math.max(0, ...latest.flatMap((item: any) => item.hints.map((h: any) => h.level)));
      if (latest.at(-1)?.id !== attemptId || latestLevel !== previousLevel)
        throw new ConflictException({ code: "HINT_CONTEXT_CHANGED", message: "Lần thử đã thay đổi; hãy yêu cầu gợi ý lại" });
      const hint = await tx.hintLog.create({
        data: {
          attemptId,
          level,
          content: explanation.content,
          contextSnapshot: { ...context, provider: explanation.provider },
        },
      });
      await projectLab(tx, actor.sub, attempt.challenge.labId);
      if (attempt.lessonStepId) {
        const step = await tx.lessonStep.findUnique({ where: { id: attempt.lessonStepId }, select: { lessonId: true } });
        if (step) await projectLesson(tx, actor.sub, step.lessonId);
      }
      return hint;
    },
    { timeout: 20000 },
  );
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
      const plan = planCheckpointHint({ rubricRef, evidence: attempt.labState, result: attempt.simulationResult, previous });
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
