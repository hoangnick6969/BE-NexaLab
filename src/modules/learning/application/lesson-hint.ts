import { BadRequestException, ConflictException, HttpException, HttpStatus, NotFoundException } from "@nestjs/common";
import { basicExerciseConfigSchema, quizConfigSchema } from "../../lessons/application/pathway";
import { EXERCISE_HINT_KIND, LESSON_HINT_KIND, LESSON_HINT_RULES, lessonSources, planQuestionHint, type HintQuestion, type HintSource } from "./lesson-question-hints";

/** In-quiz hints per quiz step and assignment, all questions together. */
export const LESSON_HINT_LIMIT = 60;
/** SAI-03-T3: hints per basic exercise step and student, all questions together. */
export const EXERCISE_HINT_LIMIT = 60;

type Access = { studentPathway(id: string, studentId: string, db?: any, assignmentId?: string): Promise<any> };

/**
 * SAI-03A: one rules-only hint on one question of the student's lesson quiz.
 * Level 1 → 2 on asking again; level 3 only once a submitted attempt answered this question wrong (BR-06).
 * Never reads the student's unsent draft. Writes one HintLog (BR-13); no score, progress or pathway change (FR-22).
 */
export async function requestLessonQuestionHint(db: any, access: Access, input: { studentId: string; lessonId: string; assignmentId?: string; questionId: string }) {
  const pathway = await access.studentPathway(input.lessonId, input.studentId, db, input.assignmentId);
  const step = pathway.steps.find((item: any) => item.type === "QUIZ");
  if (!step || !["IN_PROGRESS", "COMPLETED"].includes(step.state))
    throw new NotFoundException({ code: "QUIZ_UNAVAILABLE", message: "Bài kiểm tra chưa khả dụng" });
  const assignmentId: string = pathway.assignment.id;
  const [raw, lessonSteps, attempts] = await Promise.all([
    db.lessonStep.findUnique({ where: { id: step.id }, select: { config: true } }),
    db.lessonStep.findMany({ where: { lessonId: input.lessonId }, orderBy: { position: "asc" }, select: { id: true, type: true, config: true } }),
    db.quizAttempt.findMany({ where: { studentId: input.studentId, lessonId: input.lessonId, stepId: step.id, assignmentId }, select: { passed: true, answers: true, questionSnapshot: true } }),
  ]);
  const config = quizConfigSchema.safeParse(raw?.config);
  const question = config.success ? config.data.questions.find((item) => item.id === input.questionId) : undefined;
  if (!question) throw new BadRequestException({ code: "QUESTION_NOT_FOUND", message: "Không tìm thấy câu hỏi trong bài kiểm tra" });
  if (attempts.some((attempt: any) => attempt.passed))
    throw new ConflictException({ code: "HINT_NOT_NEEDED", message: "Em đã đạt bài kiểm tra này nên không cần gợi ý" });
  // Gate only: whether a submitted attempt got this question wrong, which the result screen already shows.
  const wrongBefore = attempts.some((attempt: any) => {
    const asked = (attempt.questionSnapshot as any[]).find((item) => item.id === question.id);
    const answer = (attempt.answers as any[]).find((item) => item.questionId === question.id);
    return asked && answer?.optionId !== asked.answerOptionId;
  });
  const maxLevel = wrongBefore ? 3 : 2;
  return issueLadderHint(db, {
    studentId: input.studentId, stepId: step.id, kind: LESSON_HINT_KIND, limit: LESSON_HINT_LIMIT, limitCode: "LESSON_HINT_LIMIT",
    limitMessage: "Em đã dùng hết lượt gợi ý cho bài kiểm tra này", scope: { assignmentId }, maxLevel,
    // The planner gets the prompt and option texts only, never answerOptionId.
    question: { id: question.id, prompt: question.prompt, options: question.options.map(({ id, text }) => ({ id, text })) },
    sources: lessonSources(lessonSteps), snapshot: { lessonId: input.lessonId, stepId: step.id, assignmentId },
  });
}

/**
 * SAI-03-T3: the same answer-blind ladder on one question of an Open Curriculum basic exercise (released shared
 * lesson, no assignment). Level 3 opens only after a submitted attempt answered this question wrong (BR-06); a passed
 * exercise refuses (409). The planner never receives `correctOptionId`; the key is read only for that gate, which
 * the result screen already implies. No attempt, score or step progress changes (FR-22).
 */
export async function requestBasicExerciseHint(db: any, input: { studentId: string; lessonId: string; stepId: string; questionId: string }) {
  const step = await db.lessonStep.findFirst({
    where: { id: input.stepId, lessonId: input.lessonId, type: "BASIC_EXERCISE", lesson: { status: "published", scope: "SHARED_LIBRARY", synthetic: false, packVersion: { status: "released", synthetic: false } } },
    select: { id: true, config: true },
  });
  if (!step) throw new NotFoundException({ code: "CURRICULUM_EXERCISE_NOT_FOUND", message: "Không tìm thấy bài tập" });
  const config = basicExerciseConfigSchema.safeParse(step.config);
  const question = config.success ? config.data.questions.find((item) => item.id === input.questionId) : undefined;
  if (!question) throw new BadRequestException({ code: "QUESTION_NOT_FOUND", message: "Không tìm thấy câu hỏi trong bài tập" });
  const [lessonSteps, attempts] = await Promise.all([
    db.lessonStep.findMany({ where: { lessonId: input.lessonId }, orderBy: { position: "asc" }, select: { id: true, type: true, config: true } }),
    db.basicExerciseAttempt.findMany({ where: { studentId: input.studentId, lessonId: input.lessonId, stepId: step.id }, select: { passed: true, answers: true } }),
  ]);
  if (attempts.some((attempt: any) => attempt.passed))
    throw new ConflictException({ code: "HINT_NOT_NEEDED", message: "Em đã đạt bài tập này nên không cần gợi ý" });
  const wrongBefore = attempts.some((attempt: any) => {
    const answer = (attempt.answers as any[]).find((item) => item.questionId === question.id);
    return answer && answer.optionId !== question.correctOptionId;
  });
  return issueLadderHint(db, {
    studentId: input.studentId, stepId: step.id, kind: EXERCISE_HINT_KIND, limit: EXERCISE_HINT_LIMIT, limitCode: "EXERCISE_HINT_LIMIT",
    limitMessage: "Em đã dùng hết lượt gợi ý cho bài tập này", scope: {}, maxLevel: wrongBefore ? 3 : 2,
    // Only id, prompt and option texts reach the planner.
    question: { id: question.id, prompt: question.prompt, options: question.options.map(({ id, text }) => ({ id, text })) },
    sources: lessonSources(lessonSteps), snapshot: { lessonId: input.lessonId, stepId: step.id, assignmentId: null },
  });
}

/**
 * One rung of the per-question ladder: level 1 → 2 → (3 when `maxLevel` allows), then the other wording at the top.
 * Serialised per student; one HintLog per hint (BR-13) with no key and no draft in its snapshot.
 */
async function issueLadderHint(db: any, input: {
  studentId: string; stepId: string; kind: string; limit: number; limitCode: string; limitMessage: string;
  scope: Record<string, string>; maxLevel: 2 | 3; question: HintQuestion; sources: HintSource[];
  snapshot: { lessonId: string; stepId: string; assignmentId: string | null };
}) {
  const { question } = input;
  return db.$transaction(async (tx: any) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"lesson-hint:" + input.studentId}))`;
    const rows = await tx.hintLog.findMany({ where: { studentId: input.studentId, lessonStepId: input.stepId }, orderBy: { createdAt: "asc" } });
    const mine = rows.filter((row: any) => row.contextSnapshot?.kind === input.kind
      && Object.entries(input.scope).every(([key, value]) => row.contextSnapshot?.[key] === value));
    if (mine.length >= input.limit)
      throw new HttpException({ code: input.limitCode, message: input.limitMessage }, HttpStatus.TOO_MANY_REQUESTS);
    const last = mine.filter((row: any) => row.contextSnapshot.questionId === question.id).at(-1)?.contextSnapshot;
    let level: 1 | 2 | 3, variant: "a" | "b", escalated = false, repeatReason: "TOP_LEVEL" | "NEEDS_ATTEMPT" | null = null;
    if (!last) [level, variant] = [1, "a"];
    else if (last.level < input.maxLevel) [level, variant, escalated] = [last.level + 1, "a", true];
    else {
      [level, variant] = [last.level, last.variant === "a" ? "b" : "a"];
      repeatReason = last.level >= 3 ? "TOP_LEVEL" : "NEEDS_ATTEMPT";
    }
    const plan = planQuestionHint({ question, sources: input.sources, level, variant });
    const hint = await tx.hintLog.create({
      data: {
        studentId: input.studentId,
        lessonStepId: input.stepId,
        level,
        content: plan.content,
        contextSnapshot: {
          kind: input.kind, ruleVersion: LESSON_HINT_RULES, ...input.snapshot,
          questionId: question.id, level, variant, escalated, repeatReason, passage: plan.passage, provider: "rules",
        },
      },
    });
    return { id: hint.id, questionId: question.id, level, maxLevel: input.maxLevel, content: hint.content, escalated, repeatReason, provider: "rules", ruleVersion: LESSON_HINT_RULES, createdAt: hint.createdAt };
  });
}
