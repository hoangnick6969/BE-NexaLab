import { BadRequestException, ConflictException, ForbiddenException, NotFoundException, UnauthorizedException } from "@nestjs/common";
import { applicableAssignmentWhere } from "../../classes/application/class-access";
import { explain } from "../infrastructure/llm";
import { projectLab, projectLesson } from "../../progress/application/progress-projection";
import { buildContext } from "./tutor";

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
export async function requestHint(db: any, actor: Actor, attemptId: string, provider: Provider = explain) {
  // 1. Read context (no transaction, no lock).
  const attempt = await db.attempt.findFirst({
    where: { id: attemptId, studentId: actor.sub },
    include: { challenge: true, hints: true },
  });
  if (!attempt) throw new NotFoundException();
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
