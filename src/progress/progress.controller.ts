import { BadRequestException, Controller, Get, Inject, NotFoundException, Param, Query, Req } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { z } from "zod";
import { access } from "../auth/auth";
import { Roles } from "../common/decorators";
import { applicableAssignmentWhere, assignmentQueueOrder, isOverdue } from "../classes/class-access";
import { Db } from "../infra/db";
import { StudentAccessService } from "./student-access.service";
import { FoundationalProgressService } from "./foundational-progress.service";
import { challengeObjective } from "../lessons/lesson-content";
import { decodeCursor, deriveLesson, mergeActivityPage, normalizeVerdict, practicalSummary, quizSummary } from "./progress";

@ApiTags("NexaLab")
@ApiBearerAuth()
@Controller()
export class ProgressController {
  constructor(
    @Inject(Db) private db: Db,
    @Inject(StudentAccessService) private access: StudentAccessService,
    @Inject(FoundationalProgressService) private foundational: FoundationalProgressService,
  ) {}
  @Roles("STUDENT")
  @Get("me/foundational-progress")
  @ApiOperation({ summary: "Foundational evidence against the student's active official course version" })
  foundationalProgress(@Req() req: any) {
    return this.foundational.forStudent(req.user.sub, req.user.grade);
  }
  @Get("progress/:studentId") async progress(
    @Param("studentId") studentId: string,
    @Req() req: any,
  ) {
    await this.access.readableStudent(studentId, req);
    const [progress, attempts] = await Promise.all([
      this.db.progress.findMany({ where: { studentId } }),
      this.db.attempt.findMany({
        where: { studentId },
        select: {
          id: true,
          verdict: true,
          durationMs: true,
          createdAt: true,
          challengeId: true,
        },
        orderBy: { createdAt: "desc" },
        take: 100,
      }),
    ]);
    return { progress, attempts };
  }
  @Roles("STUDENT")
  @Get("me/progress")
  @ApiOperation({ summary: "Official progress for the authenticated student, derived from source evidence" })
  async myProgress(@Req() req: any) {
    const studentId = req.user.sub;
    const now = new Date();
    const applicable = await this.db.assignment.findMany({
      where: applicableAssignmentWhere(studentId),
      orderBy: assignmentQueueOrder,
    });
    const assignments = applicable.filter((item) => item.contentType === "lesson");
    const labAssignments = applicable.filter((item) => item.contentType === "lab");
    const lessonIds = [...new Set(assignments.map((item) => item.contentId))];
    // One parallel batch: each sequential round trip to the database costs the most here.
    const [lessons, stepProgress, quizEvidence, practicalEvidence, quizAttempts, practicalAttempts, passedPracticals, latestQuiz, latestPractical] = await Promise.all([
      this.db.lesson.findMany({
        where: { id: { in: lessonIds }, status: { in: ["published", "archived"] } },
        include: { subject: true, steps: { orderBy: { position: "asc" } } },
      }),
      this.db.stepProgress.findMany({ where: { studentId, step: { lessonId: { in: lessonIds } } } }),
      this.db.quizAttempt.findMany({
        where: { studentId, lessonId: { in: lessonIds } },
        select: { id: true, stepId: true, lessonId: true, assignmentId: true, score: true, passed: true, createdAt: true },
      }),
      this.db.attempt.findMany({
        where: { studentId, lessonStepId: { not: null } },
        select: { id: true, challengeId: true, lessonStepId: true, assignmentId: true, verdict: true, createdAt: true },
      }),
      this.db.quizAttempt.count({ where: { studentId } }),
      this.db.attempt.count({ where: { studentId } }),
      this.db.attempt.count({ where: { studentId, verdict: "passed" } }),
      this.db.quizAttempt.findFirst({ where: { studentId }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], select: { createdAt: true } }),
      this.db.attempt.findFirst({ where: { studentId }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], select: { createdAt: true } }),
    ]);
    const derivedByAssignment = new Map<string, ReturnType<typeof deriveLesson> | null>();
    for (const assignment of assignments) {
      const lesson = lessons.find((item) => item.id === assignment.contentId);
      if (!lesson) continue;
      const stepIds = new Set(lesson.steps.map((step) => step.id));
      const evidence = {
        stepProgress: stepProgress.filter((item) => item.assignmentId === assignment.id && stepIds.has(item.stepId)) as any,
        quizAttempts: quizEvidence.filter((item) => item.assignmentId === assignment.id && item.lessonId === lesson.id),
        attempts: practicalEvidence.filter((item) => item.assignmentId === assignment.id && stepIds.has(item.lessonStepId!)).map((item) => ({ ...item, hintLevel: 0 })),
      };
      try {
        derivedByAssignment.set(assignment.id, deriveLesson(lesson.steps as any, evidence));
      } catch {
        derivedByAssignment.set(assignment.id, null);
      }
    }
    const items = assignments.flatMap((assignment) => {
      const lesson = lessons.find((item) => item.id === assignment.contentId);
      const derived = lesson ? derivedByAssignment.get(assignment.id) : null;
      if (!lesson || !derived) return [];
      // Archived content stays visible only once the student has started it (Q-B1-02).
      if (lesson.status === "archived" && !derived.steps.some((step) => step.evidenceId || step.stepProgress)) return [];
      const quizStep = derived.steps.find((step) => step.type === "QUIZ");
      const practicalStep = derived.steps.find((step) => step.type === "LAB") ?? derived.steps.find((step) => step.type === "CHALLENGE");
      return [{
        kind: "LESSON" as const,
        assignmentId: assignment.id,
        lessonId: lesson.id,
        labId: null,
        title: assignment.title,
        lessonTitle: lesson.title,
        subject: { id: lesson.subject.id, name: lesson.subject.name },
        chapter: lesson.chapter,
        contentArchived: lesson.status === "archived",
        dueDate: assignment.dueDate?.toISOString() ?? null,
        overdue: isOverdue(assignment.dueDate, now),
        completed: derived.completed,
        completedRequired: derived.completedRequired,
        totalRequired: derived.totalRequired,
        percent: derived.percent,
        nextStepId: derived.nextStepId,
        quiz: quizStep?.quiz ?? null,
        practical: practicalStep?.practical ?? null,
        updatedAt: derived.updatedAt,
        steps: derived.steps,
      }];
    });
    // D3: a standalone lab assignment completes on a passed attempt carrying its assignmentId.
    const [labs, labAttempts] = labAssignments.length
      ? await Promise.all([
          this.db.lab.findMany({
            where: { id: { in: [...new Set(labAssignments.map((item) => item.contentId))] }, status: { in: ["published", "archived"] } },
            include: { subject: true },
          }),
          this.db.attempt.findMany({
            where: { studentId, assignmentId: { in: labAssignments.map((item) => item.id) } },
            select: { id: true, challengeId: true, lessonStepId: true, assignmentId: true, verdict: true, createdAt: true },
          }),
        ])
      : [[], []];
    const labItems = labAssignments.flatMap((assignment) => {
      const lab = labs.find((item) => item.id === assignment.contentId);
      if (!lab) return [];
      const attempts = labAttempts.filter((item) => item.assignmentId === assignment.id);
      if (lab.status === "archived" && !attempts.length) return [];
      const practical = practicalSummary(attempts.map((item) => ({ ...item, hintLevel: 0 })));
      const completed = Boolean(practical?.passedAt);
      return [{
        kind: "LAB" as const,
        assignmentId: assignment.id,
        lessonId: null,
        labId: lab.id,
        title: assignment.title,
        lessonTitle: lab.title,
        subject: { id: lab.subject.id, name: lab.subject.name },
        chapter: lab.topic,
        contentArchived: lab.status === "archived",
        dueDate: assignment.dueDate?.toISOString() ?? null,
        overdue: isOverdue(assignment.dueDate, now),
        completed,
        completedRequired: completed ? 1 : 0,
        totalRequired: 1,
        percent: completed ? 100 : 0,
        nextStepId: null,
        quiz: null,
        practical,
        updatedAt: practical?.latest.createdAt ?? null,
        steps: [],
      }];
    });
    items.push(...(labItems as any[]));
    const timestamps = [
      ...items.map((item) => item.updatedAt),
      latestQuiz?.createdAt.toISOString(),
      latestPractical?.createdAt.toISOString(),
    ].filter((value): value is string => Boolean(value)).sort();
    return {
      assignments: items,
      summary: {
        activeAssignments: items.length,
        completedAssignments: items.filter((item) => item.completed).length,
        remainingRequiredSteps: items.reduce((sum, item) => sum + item.totalRequired - item.completedRequired, 0),
        quizAttempts,
        practicalAttempts,
        passedPracticals,
        updatedAt: timestamps.at(-1) ?? null,
      },
      generatedAt: now.toISOString(),
    };
  }
  @Roles("STUDENT")
  @Get("me/activity")
  @ApiOperation({ summary: "Newest-first page of the authenticated student's quiz and practical attempts" })
  async myActivity(@Req() req: any, @Query() query: unknown) {
    const studentId = req.user.sub;
    const q = z
      .object({
        cursor: z.string().max(200).optional(),
        limit: z.coerce.number().int().min(1).max(50).default(20),
        stepId: z.string().min(1).max(200).optional(),
        kind: z.enum(["QUIZ", "PRACTICAL"]).optional(),
      })
      .strict()
      .parse(query);
    let cursor;
    try {
      cursor = decodeCursor(q.cursor);
    } catch {
      throw new BadRequestException({ code: "INVALID_CURSOR", message: "Con trỏ phân trang không hợp lệ" });
    }
    const before = cursor
      ? { OR: [{ createdAt: { lt: new Date(cursor.t) } }, { createdAt: new Date(cursor.t), id: { lt: cursor.id } }] }
      : {};
    const orderBy = [{ createdAt: "desc" as const }, { id: "desc" as const }];
    const [quiz, practical] = await Promise.all([
      q.kind === "PRACTICAL"
        ? []
        : this.db.quizAttempt.findMany({
            where: { studentId, ...(q.stepId ? { stepId: q.stepId } : {}), ...before },
            orderBy,
            take: q.limit + 1,
            select: { id: true, lessonId: true, stepId: true, assignmentId: true, score: true, passed: true, createdAt: true },
          }),
      q.kind === "QUIZ"
        ? []
        : this.db.attempt.findMany({
            where: { studentId, ...(q.stepId ? { lessonStepId: q.stepId } : {}), ...before },
            orderBy,
            take: q.limit + 1,
            select: {
              id: true,
              challengeId: true,
              lessonStepId: true,
              assignmentId: true,
              verdict: true,
              createdAt: true,
              challenge: { select: { lab: { select: { id: true, title: true } } } },
            },
          }),
    ]);
    const page = mergeActivityPage<any>(
      [quiz.map((item) => ({ ...item, kind: "QUIZ" })), practical.map((item) => ({ ...item, kind: "PRACTICAL" }))],
      q.limit,
    );
    const stepIds = [...new Set(page.items.map((item: any) => item.stepId ?? item.lessonStepId).filter(Boolean))] as string[];
    const quizLessonIds = [...new Set(page.items.map((item: any) => item.lessonId).filter(Boolean))] as string[];
    const [steps, quizLessons] = await Promise.all([
      this.db.lessonStep.findMany({
        where: { id: { in: stepIds } },
        select: { id: true, lessonId: true, type: true, lesson: { select: { id: true, title: true, status: true } } },
      }),
      this.db.lesson.findMany({ where: { id: { in: quizLessonIds } }, select: { id: true, title: true, status: true } }),
    ]);
    const lessons = [...quizLessons, ...steps.map((step) => step.lesson)];
    return {
      items: page.items.map((item: any) => {
        if (item.kind === "QUIZ") {
          const step = steps.find((entry) => entry.id === item.stepId);
          const lesson = lessons.find((entry) => entry.id === item.lessonId);
          return {
            id: item.id,
            kind: "QUIZ" as const,
            lessonId: item.lessonId,
            stepId: item.stepId,
            stepType: step?.type ?? "QUIZ",
            assignmentId: item.assignmentId,
            title: lesson?.title ?? "Bài học không còn khả dụng",
            occurredAt: item.createdAt.toISOString(),
            score: item.score,
            passed: item.passed,
            verdict: null,
            sourceAvailable: Boolean(step && lesson?.status === "published"),
            legacy: !item.assignmentId,
          };
        }
        const step = steps.find((entry) => entry.id === item.lessonStepId);
        const lesson = step ? lessons.find((entry) => entry.id === step.lessonId) : undefined;
        const verdict = normalizeVerdict(item.verdict);
        return {
          id: item.id,
          kind: "PRACTICAL" as const,
          lessonId: step?.lessonId ?? null,
          stepId: item.lessonStepId,
          stepType: step?.type ?? null,
          assignmentId: item.assignmentId,
          challengeId: item.challengeId,
          title: lesson?.title ?? item.challenge.lab.title,
          labTitle: item.challenge.lab.title,
          occurredAt: item.createdAt.toISOString(),
          score: null,
          passed: verdict === "passed",
          verdict,
          sourceAvailable: Boolean(step && lesson?.status === "published"),
          legacy: !item.lessonStepId || !step || verdict !== item.verdict,
        };
      }),
      nextCursor: page.nextCursor,
    };
  }
  /** Unknown and foreign IDs share one response; probing another student's record is logged without exposing it. */
  private async evidenceNotFound(kind: "quiz_attempt" | "attempt", id: string, actorId: string): Promise<never> {
    const exists =
      kind === "quiz_attempt"
        ? await this.db.quizAttempt.count({ where: { id } })
        : await this.db.attempt.count({ where: { id } });
    if (exists)
      console.warn(JSON.stringify({ event: "evidence_access_denied", resource: kind, actorId, at: new Date().toISOString() }));
    throw new NotFoundException({ code: "EVIDENCE_NOT_FOUND", message: "Không tìm thấy bản ghi" });
  }
  @Roles("STUDENT")
  @Get("me/quiz-attempts/:id")
  @ApiOperation({ summary: "One quiz attempt of the authenticated student" })
  async myQuizAttempt(@Param("id") id: string, @Req() req: any) {
    const studentId = req.user.sub;
    const attempt = await this.db.quizAttempt.findFirst({ where: { id, studentId } });
    if (!attempt) return this.evidenceNotFound("quiz_attempt", id, studentId);
    const [siblings, lesson, step] = await Promise.all([
      this.db.quizAttempt.findMany({
        where: { studentId, stepId: attempt.stepId },
        select: { id: true, stepId: true, lessonId: true, assignmentId: true, score: true, passed: true, createdAt: true },
      }),
      this.db.lesson.findUnique({ where: { id: attempt.lessonId }, select: { id: true, title: true, status: true } }),
      this.db.lessonStep.findUnique({ where: { id: attempt.stepId }, select: { id: true } }),
    ]);
    const summary = quizSummary(siblings)!;
    const ordered = [...siblings].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || (a.id < b.id ? -1 : 1));
    const snapshot = attempt.questionSnapshot as any[];
    const answers = attempt.answers as Array<{ questionId: string; optionId: string }>;
    return {
      id: attempt.id,
      kind: "QUIZ" as const,
      lessonId: attempt.lessonId,
      lessonTitle: lesson?.title ?? "Bài học không còn khả dụng",
      stepId: attempt.stepId,
      assignmentId: attempt.assignmentId,
      sourceAvailable: Boolean(step && lesson?.status === "published"),
      createdAt: attempt.createdAt.toISOString(),
      attemptNumber: ordered.findIndex((item) => item.id === attempt.id) + 1,
      totalAttempts: ordered.length,
      latest: summary.latest.attemptId === attempt.id,
      best: summary.best.attemptId === attempt.id,
      score: attempt.score,
      passed: attempt.passed,
      passThreshold: 50,
      correctCount: attempt.correctCount,
      questionCount: attempt.questionCount,
      // Allowed feedback only: the student's own choice and correctness, never the answer key.
      results: snapshot.map((question) => {
        const answer = answers.find((item) => item.questionId === question.id);
        const selected = question.options.find((option: any) => option.id === answer?.optionId);
        return {
          questionId: question.id,
          prompt: question.prompt,
          selectedOptionText: selected?.text ?? "",
          correct: answer?.optionId === question.answerOptionId,
        };
      }),
    };
  }
  @Roles("STUDENT")
  @Get("me/attempts/:id")
  @ApiOperation({ summary: "One practical attempt of the authenticated student" })
  async myAttempt(@Param("id") id: string, @Req() req: any) {
    const studentId = req.user.sub;
    const attempt = await this.db.attempt.findFirst({
      where: { id, studentId },
      include: { challenge: { include: { lab: true } }, hints: { select: { level: true, createdAt: true }, orderBy: { level: "asc" } } },
    });
    if (!attempt) return this.evidenceNotFound("attempt", id, studentId);
    const step = attempt.lessonStepId
      ? await this.db.lessonStep.findUnique({ where: { id: attempt.lessonStepId }, select: { id: true, type: true, lessonId: true } })
      : null;
    const lesson = step ? await this.db.lesson.findUnique({ where: { id: step.lessonId }, select: { id: true, title: true, status: true } }) : null;
    const attemptNumber = await this.db.attempt.count({
      where: {
        studentId,
        challengeId: attempt.challengeId,
        OR: [{ createdAt: { lt: attempt.createdAt } }, { createdAt: attempt.createdAt, id: { lte: attempt.id } }],
      },
    });
    const verdict = normalizeVerdict(attempt.verdict);
    const result = attempt.simulationResult as any;
    return {
      id: attempt.id,
      kind: "PRACTICAL" as const,
      challengeId: attempt.challengeId,
      challengeObjective: attempt.challenge.objective,
      labId: attempt.challenge.labId,
      labTitle: attempt.challenge.lab.title,
      lessonId: step?.lessonId ?? null,
      lessonTitle: lesson?.title ?? null,
      stepId: attempt.lessonStepId,
      stepType: step?.type ?? null,
      assignmentId: attempt.assignmentId,
      sourceAvailable: Boolean(step && lesson?.status === "published"),
      legacy: !attempt.lessonStepId || !step || verdict !== attempt.verdict,
      createdAt: attempt.createdAt.toISOString(),
      attemptNumber,
      verdict,
      durationMs: attempt.durationMs,
      simulationModelVersion: attempt.simulationModelVersion,
      // Server-recomputed outcome context; the verdict is the official result.
      outcome: {
        status: typeof result?.status === "string" ? result.status : null,
        currentMa: typeof result?.currentMa === "number" ? result.currentMa : null,
        ledState: typeof result?.ledState === "string" ? result.ledState : null,
      },
      retryGuidance: this.access.retryGuidance(attempt.challenge.labId, verdict ?? "needs_practice", result),
      hintLevels: attempt.hints.map((hint) => hint.level),
    };
  }
}
