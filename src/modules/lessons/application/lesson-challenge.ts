import { BadRequestException, ConflictException } from "@nestjs/common";
import { audit, changedFields } from "../../../common/audit";
import { CHALLENGE_PARAMETERS, challengeObjective, challengeParamErrors, variantChallengeId, type ChallengeParams } from "./lesson-content";

/**
 * Lesson challenge-variant application functions (TAI6-T1). Extracted unchanged from `LessonsController` so the
 * `ai` module can reuse the exact validation, structure-lock and write rules without importing a controller. The
 * lesson routes call these same functions, so their behavior is identical.
 */

/** 400 INVALID_CHALLENGE_PARAMS unless `challengeParamErrors` is empty for (labId, params). */
export function assertChallengeParams(labId: string | null | undefined, params: unknown) {
  const errors = challengeParamErrors(labId, params);
  if (errors.length)
    throw new BadRequestException({ code: "INVALID_CHALLENGE_PARAMS", message: errors.join("; "), details: { errors } });
}

/** D7: a published lesson with an active assignment or any evidence keeps its structure. */
export async function lessonStructureLocked(db: any, lessonId: string) {
  const stepIds = (await db.lessonStep.findMany({ where: { lessonId }, select: { id: true } })).map((step: any) => step.id);
  const [assignments, progress, quiz, practical] = await Promise.all([
    db.assignment.count({ where: { contentType: "lesson", contentId: lessonId, status: "ACTIVE" } }),
    db.stepProgress.count({ where: { stepId: { in: stepIds } } }),
    db.quizAttempt.count({ where: { lessonId } }),
    db.attempt.count({ where: { lessonStepId: { in: stepIds } } }),
  ]);
  return assignments + progress + quiz + practical > 0;
}

/** lessonStructureLocked for many lessons in a fixed number of queries (the library lists every own lesson). */
export async function lessonStructureLockedIds(db: any, lessonIds: string[]) {
  if (!lessonIds.length) return new Set<string>();
  const steps = await db.lessonStep.findMany({ where: { lessonId: { in: lessonIds } }, select: { id: true, lessonId: true } });
  const lessonOfStep = new Map(steps.map((step: any) => [step.id, step.lessonId as string]));
  const stepIds = [...lessonOfStep.keys()];
  const [assignments, progress, quiz, practical] = await Promise.all([
    db.assignment.groupBy({ by: ["contentId"], where: { contentType: "lesson", contentId: { in: lessonIds }, status: "ACTIVE" } }),
    db.stepProgress.groupBy({ by: ["stepId"], where: { stepId: { in: stepIds } } }),
    db.quizAttempt.groupBy({ by: ["lessonId"], where: { lessonId: { in: lessonIds } } }),
    db.attempt.groupBy({ by: ["lessonStepId"], where: { lessonStepId: { in: stepIds } } }),
  ]);
  return new Set<string>([
    ...assignments.map((row: any) => row.contentId),
    ...quiz.map((row: any) => row.lessonId),
    ...[...progress.map((row: any) => row.stepId), ...practical.map((row: any) => row.lessonStepId)].map((stepId) => lessonOfStep.get(stepId)!),
  ]);
}

/** Allowlisted, field-level view of a lesson for audit diffs. */
export function lessonAuditFields(lesson: any) {
  return {
    title: lesson.title,
    status: lesson.status,
    scope: lesson.scope,
    grade: lesson.grade,
    clonedFromId: lesson.clonedFromId,
    reviewChecklist: Boolean(lesson.review),
    domain: lesson.domain ?? null,
    outcomeCodes: lesson.outcomeCodes ?? [],
    challengeParams: lesson.challengeParams ?? null,
  };
}

/**
 * Writes the lesson's pathway steps. A teacher variant (labId + params) gets its own `Challenge` row and a CHALLENGE
 * step; the shared model is untouched. Draft lessons have no published steps, so nothing is written for them.
 */
export async function writeLessonSteps(
  tx: any,
  lessonId: string,
  steps: Array<{ type: string; position: number; required: boolean; config: unknown }>,
  variant?: { labId?: string | null; challengeParams?: Record<string, number | string> | null },
) {
  if (steps.length && variant?.labId && variant.challengeParams) {
    const challengeId = variantChallengeId(variant.labId, lessonId);
    const challenge = {
      objective: challengeObjective(variant.labId, variant.challengeParams),
      constraints: { params: variant.challengeParams, modelRef: CHALLENGE_PARAMETERS[variant.labId].modelRef } as any,
    };
    await tx.challenge.upsert({ where: { id: challengeId }, create: { id: challengeId, labId: variant.labId, ...challenge }, update: challenge });
    steps = [...steps, { type: "CHALLENGE", position: 60, required: true, config: { challengeId } }];
  }
  const stepRows = steps.map((step) => ({
    ...step,
    id: `step-${lessonId}-${step.type.toLowerCase().replace("_", "-")}`,
    lessonId,
    config: step.config as any,
  }));
  if (!stepRows.length) return;
  await tx.lessonStep.deleteMany({
    where: { lessonId, id: { notIn: stepRows.map((step) => step.id) } },
  });
  for (const step of stepRows)
    await tx.lessonStep.upsert({
      where: { id: step.id },
      create: step,
      update: { type: step.type, position: step.position, required: step.required, config: step.config },
    });
}

export const lessonNotEditable = () =>
  new ConflictException({ code: "LESSON_NOT_EDITABLE", message: "Bài học không còn ở trạng thái chỉnh sửa được (cần là bản nháp riêng của bạn, chưa có bài làm)" });

/** Why a lesson cannot take a challenge variant from the AI module, or null when it can (draft, own, private, unlocked). */
export async function lessonChallengeBlocker(db: any, lessonId: string, teacherId: string): Promise<"NOT_FOUND" | "NOT_EDITABLE" | null> {
  const lesson = await db.lesson.findUnique({ where: { id: lessonId }, select: { id: true, authorId: true, scope: true, status: true } });
  if (!lesson) return "NOT_FOUND";
  if (lesson.authorId !== teacherId || lesson.scope !== "TEACHER_PRIVATE" || lesson.status !== "draft") return "NOT_EDITABLE";
  return (await lessonStructureLocked(db, lessonId)) ? "NOT_EDITABLE" : null;
}

/**
 * Sets a draft private lesson's lab and challenge parameters (TAI6-T3 apply path). The caller has checked the
 * lesson with `lessonChallengeBlocker` inside the same transaction. Parameters are validated again here
 * (INVALID_CHALLENGE_PARAMS), the lesson row is updated and `lesson.update` is audited exactly as the lesson route
 * does. No `Lab`, `Challenge` or simulation row is written: a draft has no published steps.
 */
export async function applyLessonChallenge(tx: any, actor: { sub: string; role: string }, lessonId: string, variant: { labId: string; challengeParams: ChallengeParams }) {
  assertChallengeParams(variant.labId, variant.challengeParams);
  const before = await tx.lesson.findUnique({ where: { id: lessonId } });
  if (!before) throw lessonNotEditable();
  const lesson = await tx.lesson.update({ where: { id: lessonId }, data: { labId: variant.labId, challengeParams: variant.challengeParams as any } });
  await writeLessonSteps(tx, lessonId, [], variant);
  const diff = changedFields(lessonAuditFields(before), lessonAuditFields(lesson));
  await audit(tx, {
    actor,
    action: "lesson.update",
    targetType: "Lesson",
    targetId: lessonId,
    before: { ...(diff.before ?? {}), labId: before.labId ?? null },
    after: { ...(diff.after ?? {}), labId: lesson.labId, structureLocked: false },
  });
  return lesson;
}
