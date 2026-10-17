import { BadRequestException, Body, ConflictException, Controller, ForbiddenException, Get, Inject, NotFoundException, Param, Post, Put, Req } from "@nestjs/common";
import { ApiBearerAuth, ApiBody, ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { access } from "../auth/auth";
import { Roles } from "../common/decorators";
import { applicableAssignmentWhere, assignmentQueueOrder, isOverdue } from "../classes/class-access";
import { Db } from "../infra/db";
import { buildPathwaySteps, quizAttemptRequestSchema, quizConfigSchema, reconcileCardProgress, reconcileVideoProgress, stepProgressActionSchema } from "../lessons/pathway";
import { StudentAccessService } from "../progress/student-access.service";
import { challengeObjective } from "../lessons/lesson-content";
import { ARCHIVED_CONTENT_MESSAGE } from "../lessons/lesson-schema";
import { projectLesson } from "../progress/progress-projection";

@ApiTags("NexaLab")
@ApiBearerAuth()
@Controller()
export class LearningController {
  constructor(@Inject(Db) private db: Db, @Inject(StudentAccessService) private access: StudentAccessService) {}
  private async applicableAssignment(id: string, studentId: string) {
    const assignment = await this.db.assignment.findFirst({
      where: { id, ...applicableAssignmentWhere(studentId) },
      include: { classroom: { select: { id: true, name: true, grade: true } } },
    });
    if (!assignment)
      throw new NotFoundException({ code: "ASSIGNMENT_NOT_FOUND", message: "Không tìm thấy bài được giao" });
    return assignment;
  }
  @Roles("STUDENT") @Get("lessons/:id/pathway") async pathway(
    @Param("id") id: string,
    @Req() req: any,
  ) {
    return this.access.studentPathway(id, req.user.sub);
  }
  @Roles("STUDENT")
  @Get("lessons/:lessonId/quiz")
  @ApiOperation({ summary: "Get the sanitized quiz for an eligible student" })
  @ApiResponse({ status: 200, schema: { $ref: "#/components/schemas/StudentQuiz" } })
  @ApiResponse({ status: 401, schema: { $ref: "#/components/schemas/ApiErrorEnvelope" } })
  @ApiResponse({ status: 403, schema: { $ref: "#/components/schemas/ApiErrorEnvelope" } })
  @ApiResponse({ status: 404, schema: { $ref: "#/components/schemas/ApiErrorEnvelope" } })
  async studentQuiz(
    @Param("lessonId") lessonId: string,
    @Req() req: any,
  ) {
    const pathway = await this.access.studentPathway(lessonId, req.user.sub);
    const step = pathway.steps.find((item: any) => item.type === "QUIZ");
    if (!step || !["IN_PROGRESS", "COMPLETED"].includes(step.state) || !step.resource)
      throw new NotFoundException("Bài kiểm tra chưa khả dụng");
    return { lessonId, stepId: step.id, questions: (step.resource as any).questions };
  }
  @Roles("STUDENT")
  @Get("lessons/:lessonId/quiz-attempts")
  @ApiOperation({ summary: "Get the authenticated student's quiz attempt history" })
  @ApiResponse({ status: 200, schema: { $ref: "#/components/schemas/QuizAttemptHistory" } })
  @ApiResponse({ status: 401, schema: { $ref: "#/components/schemas/ApiErrorEnvelope" } })
  @ApiResponse({ status: 403, schema: { $ref: "#/components/schemas/ApiErrorEnvelope" } })
  @ApiResponse({ status: 404, schema: { $ref: "#/components/schemas/ApiErrorEnvelope" } })
  async studentQuizAttempts(
    @Param("lessonId") lessonId: string,
    @Req() req: any,
  ) {
    const pathway = await this.access.studentPathway(lessonId, req.user.sub);
    const step = pathway.steps.find((item: any) => item.type === "QUIZ");
    if (!step || !["IN_PROGRESS", "COMPLETED"].includes(step.state))
      throw new NotFoundException("Bài kiểm tra chưa khả dụng");
    const attempts = await this.db.quizAttempt.findMany({
      where: { studentId: req.user.sub, lessonId, stepId: step.id },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    });
    const latestId = attempts[0]?.id;
    const bestId = [...attempts].sort((a: any, b: any) => b.score - a.score || b.createdAt.getTime() - a.createdAt.getTime())[0]?.id;
    return {
      attempts: attempts.map((attempt: any) => {
        const snapshot = attempt.questionSnapshot as any[];
        const answers = attempt.answers as Array<{ questionId: string; optionId: string }>;
        const results = snapshot.map((question) => {
          const answer = answers.find((item) => item.questionId === question.id);
          const selected = question.options.find((option: any) => option.id === answer?.optionId);
          return {
            questionId: question.id,
            prompt: question.prompt,
            selectedOptionText: selected?.text ?? "",
            correct: answer?.optionId === question.answerOptionId,
          };
        });
        return {
          id: attempt.id,
          idempotencyKey: attempt.idempotencyKey,
          score: attempt.score,
          passed: attempt.passed,
          correctCount: attempt.correctCount,
          questionCount: attempt.questionCount,
          createdAt: attempt.createdAt.toISOString(),
          latest: attempt.id === latestId,
          best: attempt.id === bestId,
          results,
        };
      }),
    };
  }
  @Roles("STUDENT")
  @Post("lessons/:lessonId/quiz-attempts")
  @ApiOperation({ summary: "Submit one immutable quiz attempt" })
  @ApiBody({ schema: { $ref: "#/components/schemas/QuizAttemptRequest" } })
  @ApiResponse({ status: 201, schema: { $ref: "#/components/schemas/QuizAttemptResponse" } })
  @ApiResponse({ status: 400, schema: { $ref: "#/components/schemas/ApiErrorEnvelope" } })
  @ApiResponse({ status: 401, schema: { $ref: "#/components/schemas/ApiErrorEnvelope" } })
  @ApiResponse({ status: 403, schema: { $ref: "#/components/schemas/ApiErrorEnvelope" } })
  @ApiResponse({ status: 404, schema: { $ref: "#/components/schemas/ApiErrorEnvelope" } })
  @ApiResponse({ status: 409, schema: { $ref: "#/components/schemas/ApiErrorEnvelope" } })
  async submitQuizAttempt(
    @Param("lessonId") lessonId: string,
    @Body() body: unknown,
    @Req() req: any,
  ) {
    const request = quizAttemptRequestSchema.parse(body);
    const studentId = req.user.sub;
    try {
      return await this.db.$transaction(async (tx) => {
      const previous = await tx.quizAttempt.findUnique({
        where: { studentId_idempotencyKey: { studentId, idempotencyKey: request.idempotencyKey } },
      });
      const answers = [...request.answers].sort((a, b) => a.questionId.localeCompare(b.questionId));
      if (previous) {
        const savedAnswers = [...(previous.answers as any[])].sort((a, b) => a.questionId.localeCompare(b.questionId));
        const sameAnswers = savedAnswers.length === answers.length && savedAnswers.every((saved, index) =>
          saved.questionId === answers[index].questionId && saved.optionId === answers[index].optionId,
        );
        if (previous.lessonId !== lessonId || !sameAnswers)
          throw new ConflictException({ code: "IDEMPOTENCY_KEY_REUSED", message: "Khóa gửi lại đã được dùng cho nội dung khác" });
        return {
          attempt: this.quizAttemptSummary(previous),
          pathway: await this.access.studentPathway(lessonId, studentId, tx),
        };
      }
      const pathway = await this.access.studentPathway(lessonId, studentId, tx);
      const currentStep = pathway.steps.find((item: any) => item.type === "QUIZ");
      if (!currentStep || !["IN_PROGRESS", "COMPLETED"].includes(currentStep.state))
        throw new NotFoundException("Bài kiểm tra chưa khả dụng");
      const step = await tx.lessonStep.findUnique({ where: { id: currentStep.id } });
      const config = quizConfigSchema.safeParse(step?.config);
      if (!config.success) throw new NotFoundException("Bài kiểm tra chưa khả dụng");
      const questions = config.data.questions;
      const received = new Set(answers.map((answer) => answer.questionId));
      if (answers.length !== questions.length || questions.some((question) => !received.has(question.id)) ||
          answers.some((answer) => !questions.some((question) => question.id === answer.questionId && question.options.some((option) => option.id === answer.optionId))))
        throw new BadRequestException({ code: "QUIZ_ANSWERS_INVALID", message: "Câu trả lời không khớp với bài kiểm tra" });
      const correctCount = questions.filter((question) => answers.some((answer) => answer.questionId === question.id && answer.optionId === question.answerOptionId)).length;
      const score = (correctCount / questions.length) * 100;
      const passed = score >= 50;
      const assignment = await this.access.applicableLessonAssignment(lessonId, studentId, tx);
      const created = await tx.quizAttempt.create({
        data: {
          studentId,
          lessonId,
          stepId: currentStep.id,
          assignmentId: assignment.id,
          answers: answers as any,
          questionSnapshot: questions as any,
          correctCount,
          questionCount: questions.length,
          score,
          passed,
          idempotencyKey: request.idempotencyKey,
        },
      });
      const priorProgress = await tx.stepProgress.findUnique({ where: { studentId_assignmentId_stepId: { studentId, assignmentId: assignment.id, stepId: currentStep.id } } });
      await tx.stepProgress.upsert({
        where: { studentId_assignmentId_stepId: { studentId, assignmentId: assignment.id, stepId: currentStep.id } },
        create: {
          studentId,
          stepId: currentStep.id,
          assignmentId: assignment.id,
          status: passed ? "COMPLETED" : "IN_PROGRESS",
          progressValue: passed ? 100 : 0,
          startedAt: new Date(),
          completedAt: passed ? new Date() : null,
        },
        update: {
          status: priorProgress?.status === "COMPLETED" || passed ? "COMPLETED" : "IN_PROGRESS",
          progressValue: priorProgress?.status === "COMPLETED" || passed ? 100 : 0,
          startedAt: priorProgress?.startedAt ?? new Date(),
          completedAt: priorProgress?.completedAt ?? (passed ? new Date() : null),
        },
      });
      await projectLesson(tx, studentId, lessonId, assignment.id);
      return {
        attempt: this.quizAttemptSummary(created),
        pathway: await this.access.studentPathway(lessonId, studentId, tx),
      };
      });
    } catch (error) {
      if ((error as any)?.code !== "P2002") throw error;
      const previous = await this.db.quizAttempt.findUnique({
        where: { studentId_idempotencyKey: { studentId, idempotencyKey: request.idempotencyKey } },
      });
      if (!previous) throw error;
      const answers = [...request.answers].sort((a, b) => a.questionId.localeCompare(b.questionId));
      const savedAnswers = [...(previous.answers as any[])].sort((a, b) => a.questionId.localeCompare(b.questionId));
      const sameAnswers = previous.lessonId === lessonId && savedAnswers.length === answers.length &&
        savedAnswers.every((saved, index) => saved.questionId === answers[index].questionId && saved.optionId === answers[index].optionId);
      if (!sameAnswers)
        throw new ConflictException({ code: "IDEMPOTENCY_KEY_REUSED", message: "Khóa gửi lại đã được dùng cho nội dung khác" });
      return {
        attempt: this.quizAttemptSummary(previous),
        pathway: await this.access.studentPathway(lessonId, studentId),
      };
    }
  }
  @Roles("STUDENT")
  @Get("lessons/:lessonId/steps/:stepId/lab")
  @ApiOperation({ summary: "Get the sanitized lab/challenge workspace for an eligible student" })
  async studentLab(
    @Param("lessonId") lessonId: string,
    @Param("stepId") stepId: string,
    @Req() req: any,
  ) {
    const pathway = await this.access.studentPathway(lessonId, req.user.sub);
    const step = pathway.steps.find((item: any) => item.id === stepId && (item.type === "LAB" || item.type === "CHALLENGE"));
    if (!step) throw new NotFoundException("Bước thực hành không tồn tại");
    if (step.state === "LOCKED")
      throw new ForbiddenException({
        code: "STEP_LOCKED",
        message: step.lockReasonCode === "QUIZ_NOT_PASSED" ? "Hoàn thành và vượt qua bài kiểm tra để mở phòng thực hành" : "Bước thực hành chưa khả dụng",
      });
    const stepResource = step.resource as any;
    const challengeId = stepResource?.challengeId ?? (stepResource?.labId ? `${stepResource.labId}_001` : "circuit_001");
    const challenge = challengeId ? await this.db.challenge.findUnique({ where: { id: challengeId }, include: { lab: true } }) : null;
    return {
      lessonId,
      stepId,
      challengeId: challenge?.id ?? challengeId,
      labId: challenge?.labId ?? stepResource?.labId ?? "circuit",
      title: challenge?.lab?.title ?? "Thực hành mạch điện",
      instruction: challenge?.objective ?? "Tạo mạch kín an toàn cho đèn LED",
      targetObjective: (challenge?.constraints as any)?.params
        ? challengeObjective(challenge!.labId, (challenge!.constraints as any).params)
        : ({
            circuit: "Giữ dòng qua mỗi LED từ 1 đến 20 mA.",
            chemistry: "Nhúng quỳ tím vào ba lọ mất nhãn và xác định đúng axit, trung tính, bazơ.",
            eye: "Gọi đúng tên cả 8 bộ phận của mắt.",
          } as Record<string, string>)[challenge?.labId ?? stepResource?.labId ?? "circuit"] ?? null,
      config: stepResource,
    };
  }
  private quizAttemptSummary(attempt: any) {
    const answers = attempt.answers as Array<{ questionId: string; optionId: string }>;
    const questions = attempt.questionSnapshot as Array<{ id: string; answerOptionId: string }>;
    return {
      id: attempt.id,
      score: attempt.score,
      passed: attempt.passed,
      correctCount: attempt.correctCount,
      questionCount: attempt.questionCount,
      createdAt: attempt.createdAt.toISOString(),
      results: questions.map((question) => ({
        questionId: question.id,
        correct: answers.some((answer) => answer.questionId === question.id && answer.optionId === question.answerOptionId),
      })),
    };
  }
  @Roles("STUDENT") @Put("lessons/:lessonId/steps/:stepId/progress") async updateStepProgress(
    @Param("lessonId") lessonId: string,
    @Param("stepId") stepId: string,
    @Body() body: unknown,
    @Req() req: any,
  ) {
    const action = stepProgressActionSchema.parse(body);
    const studentId = req.user.sub;
    const now = new Date();
    return this.db.$transaction(async (tx) => {
      const assignment = await this.access.applicableLessonAssignment(lessonId, studentId, tx);
      if (!assignment)
        throw new NotFoundException({ code: "ASSIGNMENT_NOT_FOUND", message: "Không tìm thấy bài được giao" });
      const lesson = await tx.lesson.findFirst({
        where: { id: lessonId, status: { in: ["published", "archived"] } },
        include: {
          steps: {
            orderBy: { position: "asc" },
            include: { progress: { where: { studentId, assignmentId: assignment.id } } },
          },
        },
      });
      if (!lesson) throw new NotFoundException("Nội dung không còn khả dụng");
      if (lesson.status === "archived" && !(await this.access.lessonStarted(lessonId, studentId, tx, assignment.id)))
        throw new NotFoundException({ code: "CONTENT_ARCHIVED", message: ARCHIVED_CONTENT_MESSAGE });
      let currentPathway;
      try {
        currentPathway = buildPathwaySteps(lesson.steps as any);
      } catch {
        throw new NotFoundException("Nội dung không còn khả dụng");
      }
      const step = lesson.steps.find((item) => item.id === stepId);
      const authorizedStep = currentPathway.steps.find((item) => item.id === stepId);
      if (!step || !["IN_PROGRESS", "COMPLETED"].includes(authorizedStep?.state ?? ""))
        throw new NotFoundException("Bước học không còn khả dụng");

      const saved = step.progress[0];
      if (step.type === "READING") {
        if (action.action !== "complete")
          throw new NotFoundException("Bước học không còn khả dụng");
        await tx.stepProgress.upsert({
          where: { studentId_assignmentId_stepId: { studentId, assignmentId: assignment.id, stepId } },
          create: {
            studentId,
            stepId,
            assignmentId: assignment.id,
            status: "COMPLETED",
            progressValue: 100,
            startedAt: now,
            completedAt: now,
          },
          update: saved?.status === "COMPLETED"
            ? { startedAt: saved.startedAt ?? now }
            : {
                status: "COMPLETED",
                progressValue: 100,
                startedAt: saved?.startedAt ?? now,
                completedAt: now,
              },
        });
      } else if (step.type === "VIDEO") {
        if (action.action === "complete")
          throw new NotFoundException("Bước học không còn khả dụng");
        let evidence;
        try {
          evidence = reconcileVideoProgress(step.config, saved, action as any, now);
        } catch {
          throw new NotFoundException("Bước học không còn khả dụng");
        }
        await tx.stepProgress.upsert({
          where: { studentId_assignmentId_stepId: { studentId, assignmentId: assignment.id, stepId } },
          create: { studentId, stepId, assignmentId: assignment.id, ...evidence },
          update: evidence,
        });
      } else if (step.type === "STUDY_CARDS") {
        if (action.action !== "visit" && !(action.action === "complete" && "cardIndex" in action))
          throw new NotFoundException("Bước học không còn khả dụng");
        let evidence;
        try {
          evidence = reconcileCardProgress(step.config, saved as any, action as any, now);
        } catch (error) {
          throw new BadRequestException(error instanceof Error ? error.message : "Thẻ học không hợp lệ");
        }
        await tx.stepProgress.upsert({
          where: { studentId_assignmentId_stepId: { studentId, assignmentId: assignment.id, stepId } },
          create: { studentId, stepId, assignmentId: assignment.id, ...evidence },
          update: {
            status: evidence.status,
            progressValue: Math.max(saved?.progressValue ?? 0, evidence.progressValue),
            visitedCardIds: evidence.visitedCardIds,
            startedAt: saved?.startedAt ?? now,
            completedAt: evidence.completedAt ?? saved?.completedAt ?? null,
          },
        });
      } else {
        throw new NotFoundException("Bước học không còn khả dụng");
      }
      await projectLesson(tx, studentId, lessonId, assignment.id);
      const pathway = await this.access.studentPathway(lessonId, studentId, tx);
      return { step: pathway.steps.find((item) => item.id === stepId), pathway };
    }, { isolationLevel: "Serializable" });
  }
  @Roles("STUDENT") @Post("lessons/:id/complete") async complete(
    @Param("id") id: string,
  ) {
    // Official completion is derived from step evidence (A5); a bare
    // "mark complete" would create progress without a source record.
    void id;
    throw new ConflictException({
      code: "ASSIGNMENT_PATHWAY_REQUIRED",
      message: "Tiến độ chính thức chỉ được ghi nhận trong lộ trình bài được giao",
    });
  }
  @Roles("STUDENT") @Post("lessons/:id/quiz") async legacyQuiz(
    @Param("id") id: string,
    @Body() b: unknown,
  ) {
    void id; void b;
    throw new ConflictException({
      code: "ASSIGNMENT_QUIZ_REQUIRED",
      message: "Bài kiểm tra chỉ khả dụng trong lộ trình bài được giao",
    });
  }
  /** Availability of assigned content for one student (Q-B1-02, MSG-36). */
  private async contentState(a: { contentType: string; contentId: string }, studentId: string) {
    const content =
      a.contentType === "lesson"
        ? await this.db.lesson.findUnique({ where: { id: a.contentId }, include: { subject: true } })
        : await this.db.lab.findUnique({ where: { id: a.contentId }, include: { subject: true } });
    if (!content || !["published", "archived"].includes(content.status)) return { state: "UNAVAILABLE" as const, content: null };
    if (content.status === "published") return { state: "AVAILABLE" as const, content };
    const started =
      a.contentType === "lesson"
        ? await this.access.lessonStarted(a.contentId, studentId)
        : (await this.db.attempt.count({ where: { studentId, challenge: { labId: a.contentId } } })) > 0;
    return { state: started ? ("ARCHIVED_STARTED" as const) : ("ARCHIVED_NOT_STARTED" as const), content };
  }
  @Roles("STUDENT") @Get("assignments") async assignments(@Req() req: any) {
    const now = new Date();
    const rows = await this.db.assignment.findMany({
      where: applicableAssignmentWhere(req.user.sub),
      include: { classroom: { select: { id: true, name: true } } },
      orderBy: assignmentQueueOrder,
    });
    const items: any[] = [];
    for (const a of rows) {
      const { state } = await this.contentState(a, req.user.sub);
      if (state === "UNAVAILABLE") continue;
      items.push({
        id: a.id,
        title: a.title,
        contentId: a.contentId,
        contentType: a.contentType,
        dueDate: a.dueDate,
        createdAt: a.createdAt,
        overdue: isOverdue(a.dueDate, now),
        classroom: a.classroom,
        contentState: state,
        canOpen: state !== "ARCHIVED_NOT_STARTED",
        notice: state === "AVAILABLE" ? null : ARCHIVED_CONTENT_MESSAGE,
      });
    }
    return items;
  }
  @Roles("STUDENT") @Get("assignments/:id") async assignment(
    @Param("id") id: string,
    @Req() req: any,
  ) {
    const a = await this.applicableAssignment(id, req.user.sub);
    const { state, content } = await this.contentState(a, req.user.sub);
    if (!content) throw new NotFoundException("Nội dung không còn khả dụng");
    if (state === "ARCHIVED_NOT_STARTED")
      throw new NotFoundException({ code: "CONTENT_ARCHIVED", message: ARCHIVED_CONTENT_MESSAGE });
    return {
      id: a.id,
      title: a.title,
      contentType: a.contentType,
      dueDate: a.dueDate,
      overdue: isOverdue(a.dueDate),
      classroom: a.classroom,
      contentState: state,
      content: {
        id: content.id,
        title: content.title,
        subject: { id: content.subject.id, name: content.subject.name },
        grade: content.grade,
        topic: content.topic,
        learningObjective: content.learningObjective,
        prerequisites: "prerequisites" in content ? content.prerequisites : "",
        ...(a.contentType !== "lesson" && "content" in content
          ? { content: content.content }
          : {}),
      },
    };
  }
}
