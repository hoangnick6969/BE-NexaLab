import { BadRequestException, Body, ConflictException, Controller, ForbiddenException, Get, Inject, NotFoundException, Param, Post, Put, Query, Req } from "@nestjs/common";
import { ApiBearerAuth, ApiBody, ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { access } from "../auth/auth";
import { Roles } from "../common/decorators";
import { applicableAssignmentWhere, assignmentQueueOrder, isOverdue } from "../classes/class-access";
import { Db } from "../infra/db";
import { basicExerciseAttemptRequestSchema, buildPathwaySteps, evaluateBasicExercise, quizAttemptRequestSchema, quizConfigSchema, reconcileCardProgress, reconcileVideoProgress, sanitizeBasicExerciseConfig, stepProgressActionSchema } from "../lessons/pathway";
import { StudentAccessService } from "../progress/student-access.service";
import { challengeObjective } from "../lessons/lesson-content";
import { ARCHIVED_CONTENT_MESSAGE } from "../lessons/lesson-schema";
import { projectLesson } from "../progress/progress-projection";
import { parseAssignmentIdQuery } from "./assignment-query";
import { scoreTest, studentTestContent, TEST_CONTENT_TYPE, testSubmissionSchema } from "../classes/assignment-test-contract";
import { currentDeadlines, testStates } from "../classes/assignment-test-state";
import { lock } from "../classes/class-common";
import { audit } from "../common/audit";
import { idempotent, readIdempotencyKey } from "../common/idempotency";

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
    @Query() rawQuery: unknown,
    @Req() req: any,
  ) {
    const assignmentId = parseAssignmentIdQuery(rawQuery);
    return this.access.studentPathway(id, req.user.sub, this.db, assignmentId);
  }
  @Roles("STUDENT") @Get("open-curriculum/lessons/:id") async openCurriculumLesson(@Param("id") id: string, @Req() req: any) {
    const lesson = await this.db.lesson.findFirst({
      where: { id, status: "published", scope: "SHARED_LIBRARY", synthetic: false, packVersion: { status: "released", synthetic: false } },
      include: {
        subject: { select: { id: true, name: true, ebookUrl: true } },
        steps: { where: { type: { in: ["READING", "VIDEO", "BASIC_EXERCISE"] } }, orderBy: { position: "asc" }, include: { progress: { where: { studentId: req.user.sub, assignmentId: null } }, basicExerciseAttempts: { where: { studentId: req.user.sub }, orderBy: { createdAt: "desc" }, take: 1 } } },
        ebookLocators: { include: { edition: true } },
      },
    });
    if (!lesson) throw new NotFoundException({ code: "CURRICULUM_LESSON_NOT_FOUND", message: "Không tìm thấy bài học" });
    const ebookEditions = lesson.ebookLocators
      .filter((item: any) => item.edition.subjectId === lesson.subjectId && item.edition.isCurrent && item.edition.url.startsWith("https://"))
      .map((item: any) => ({
        url: item.edition.url,
        version: item.edition.version,
        fallbackPhysicalPage: item.edition.fallbackPhysicalPage,
        locator: item.verificationStatus === "verified" ? {
          physicalPageIndex: item.physicalPageIndex,
          printedPageLabel: item.printedPageLabel,
          provenance: item.provenance,
          sourceMapVersion: item.sourceMapVersion,
        } : null,
      }));
    return {
      id: lesson.id,
      subjectId: lesson.subjectId,
      subject: lesson.subject,
      title: lesson.title,
      chapter: lesson.chapter,
      grade: lesson.grade,
      topic: lesson.topic,
      learningObjective: lesson.learningObjective,
      prerequisites: lesson.prerequisites,
      curriculum: lesson.curriculum,
      content: lesson.content,
      materials: lesson.materials,
      steps: lesson.steps.map((step: any) => {
        const progress = step.progress[0];
        const config = step.config as any;
        return {
          id: step.id, type: step.type, position: step.position, required: step.required,
          state: progress?.status === "COMPLETED" || step.basicExerciseAttempts?.[0]?.passed ? "COMPLETED" : progress?.status === "IN_PROGRESS" || step.basicExerciseAttempts?.length ? "IN_PROGRESS" : "NOT_STARTED",
          progressValue: progress?.progressValue ?? 0,
          lastPosition: progress?.lastPosition ?? null,
          resource: step.type === "READING" ? { html: config.html } : step.type === "BASIC_EXERCISE" ? sanitizeBasicExerciseConfig(config) : config,
          exercise: step.basicExerciseAttempts?.[0] ? { score: step.basicExerciseAttempts[0].score, passThreshold: step.basicExerciseAttempts[0].passThreshold, passed: step.basicExerciseAttempts[0].passed, createdAt: step.basicExerciseAttempts[0].createdAt.toISOString() } : null,
        };
      }),
      ebookEditions,
    };
  }
  @Roles("STUDENT")
  @Post("open-curriculum/lessons/:lessonId/exercises/:stepId/attempts")
  @ApiOperation({ summary: "Submit and score an assignment-free foundational exercise attempt" })
  @ApiBody({ schema: { type: "object", required: ["answers", "idempotencyKey"], properties: { answers: { type: "array", items: { type: "object", required: ["questionId", "optionId"], properties: { questionId: { type: "string" }, optionId: { type: "string" } } } }, idempotencyKey: { type: "string", format: "uuid" } } } })
  async submitBasicExercise(
    @Param("lessonId") lessonId: string,
    @Param("stepId") stepId: string,
    @Body() body: unknown,
    @Req() req: any,
  ) {
    const request = basicExerciseAttemptRequestSchema.parse(body);
    const prior = await this.db.basicExerciseAttempt.findUnique({ where: { studentId_idempotencyKey: { studentId: req.user.sub, idempotencyKey: request.idempotencyKey } } });
    if (prior) return { id: prior.id, score: prior.score, passThreshold: prior.passThreshold, passed: prior.passed, createdAt: prior.createdAt.toISOString() };
    const step = await this.db.lessonStep.findFirst({
      where: { id: stepId, lessonId, type: "BASIC_EXERCISE", lesson: { status: "published", scope: "SHARED_LIBRARY", synthetic: false, packVersion: { status: "released", synthetic: false } } },
    });
    if (!step) throw new NotFoundException({ code: "CURRICULUM_EXERCISE_NOT_FOUND", message: "Không tìm thấy bài tập" });
    let result;
    try { result = evaluateBasicExercise(step.config, request); }
    catch { throw new BadRequestException({ code: "EXERCISE_ANSWERS_INVALID", message: "Câu trả lời chưa hợp lệ" }); }
    try {
      const attempt = await this.db.basicExerciseAttempt.create({ data: { studentId: req.user.sub, lessonId, stepId, answers: request.answers as any, idempotencyKey: request.idempotencyKey, ...result } });
      return { id: attempt.id, score: attempt.score, passThreshold: attempt.passThreshold, passed: attempt.passed, createdAt: attempt.createdAt.toISOString() };
    } catch (error: any) {
      if (error?.code !== "P2002") throw error;
      const attempt = await this.db.basicExerciseAttempt.findUniqueOrThrow({ where: { studentId_idempotencyKey: { studentId: req.user.sub, idempotencyKey: request.idempotencyKey } } });
      return { id: attempt.id, score: attempt.score, passThreshold: attempt.passThreshold, passed: attempt.passed, createdAt: attempt.createdAt.toISOString() };
    }
  }
  @Roles("STUDENT")
  @Put("open-curriculum/lessons/:lessonId/steps/:stepId/progress")
  @ApiOperation({ summary: "Persist reading or video evidence for released curriculum outside assignments" })
  @ApiBody({ schema: { oneOf: [{ type: "object", required: ["action"], properties: { action: { type: "string", enum: ["complete"] } } }, { type: "object", required: ["action", "positionSeconds", "durationSeconds"], properties: { action: { type: "string", enum: ["heartbeat", "ended"] }, positionSeconds: { type: "integer" }, durationSeconds: { type: "integer" } } }] } })
  async updateOpenCurriculumProgress(
    @Param("lessonId") lessonId: string,
    @Param("stepId") stepId: string,
    @Body() body: unknown,
    @Req() req: any,
  ) {
    const action = stepProgressActionSchema.parse(body);
    const studentId = req.user.sub;
    return this.db.$transaction(async (tx) => {
      const step = await tx.lessonStep.findFirst({
        where: { id: stepId, lessonId, type: { in: ["READING", "VIDEO"] }, lesson: { status: "published", scope: "SHARED_LIBRARY", synthetic: false, packVersion: { status: "released", synthetic: false } } },
      });
      if (!step) throw new NotFoundException({ code: "CURRICULUM_STEP_NOT_FOUND", message: "Không tìm thấy bước học" });
      const saved = await tx.stepProgress.findFirst({ where: { studentId, stepId, assignmentId: null } });
      const now = new Date();
      let evidence: any;
      if (step.type === "READING" && action.action === "complete") {
        evidence = { status: "COMPLETED", progressValue: 100, startedAt: saved?.startedAt ?? now, completedAt: saved?.completedAt ?? now };
      } else if (step.type === "VIDEO" && ["heartbeat", "ended", "complete-fallback"].includes(action.action)) {
        try { evidence = reconcileVideoProgress(step.config, saved ?? undefined, action as any, now); }
        catch { throw new BadRequestException({ code: "VIDEO_EVIDENCE_INVALID", message: "Không thể xác nhận tiến độ video" }); }
      } else {
        throw new BadRequestException({ code: "STEP_ACTION_INVALID", message: "Thao tác này không áp dụng cho bước học" });
      }
      if (saved) await tx.stepProgress.update({ where: { id: saved.id }, data: evidence });
      else {
        await tx.stepProgress.createMany({ data: [{ studentId, stepId, assignmentId: null, ...evidence }], skipDuplicates: true });
        const current = await tx.stepProgress.findFirst({ where: { studentId, stepId, assignmentId: null } });
        if (current && current.updatedAt < now) await tx.stepProgress.update({ where: { id: current.id }, data: evidence });
      }
      const current = await tx.stepProgress.findFirstOrThrow({ where: { studentId, stepId, assignmentId: null } });
      return { step: { id: stepId, state: current.status, progressValue: current.progressValue, lastPosition: current.lastPosition, completedAt: current.completedAt?.toISOString() ?? null } };
    });
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
    @Query() rawQuery: unknown,
    @Req() req: any,
  ) {
    const assignmentId = parseAssignmentIdQuery(rawQuery);
    const pathway = await this.access.studentPathway(lessonId, req.user.sub, this.db, assignmentId);
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
    @Query() rawQuery: unknown,
    @Req() req: any,
  ) {
    const assignmentId = parseAssignmentIdQuery(rawQuery);
    const pathway = await this.access.studentPathway(lessonId, req.user.sub, this.db, assignmentId);
    const selectedAssignmentId = pathway.assignment.id;
    const step = pathway.steps.find((item: any) => item.type === "QUIZ");
    if (!step || !["IN_PROGRESS", "COMPLETED"].includes(step.state))
      throw new NotFoundException("Bài kiểm tra chưa khả dụng");
    const attempts = await this.db.quizAttempt.findMany({
      where: { studentId: req.user.sub, lessonId, stepId: step.id, assignmentId: selectedAssignmentId },
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
    @Query() rawQuery: unknown,
    @Req() req: any,
  ) {
    const assignmentId = parseAssignmentIdQuery(rawQuery);
    const request = quizAttemptRequestSchema.parse(body);
    const studentId = req.user.sub;
    try {
      return await this.db.$transaction(async (tx) => {
      const assignment = await this.access.applicableLessonAssignment(lessonId, studentId, tx, assignmentId);
      if (!assignment)
        throw new NotFoundException({ code: "ASSIGNMENT_NOT_FOUND", message: "Không tìm thấy bài được giao" });
      const pathway = await this.access.studentPathway(lessonId, studentId, tx, assignment.id);
      const previous = await tx.quizAttempt.findUnique({
        where: { studentId_idempotencyKey: { studentId, idempotencyKey: request.idempotencyKey } },
      });
      const answers = [...request.answers].sort((a, b) => a.questionId.localeCompare(b.questionId));
      if (previous) {
        const savedAnswers = [...(previous.answers as any[])].sort((a, b) => a.questionId.localeCompare(b.questionId));
        const sameAnswers = savedAnswers.length === answers.length && savedAnswers.every((saved, index) =>
          saved.questionId === answers[index].questionId && saved.optionId === answers[index].optionId,
        );
        if (previous.lessonId !== lessonId || previous.assignmentId !== assignment.id || !sameAnswers)
          throw new ConflictException({ code: "IDEMPOTENCY_KEY_REUSED", message: "Khóa gửi lại đã được dùng cho nội dung khác" });
        return {
          attempt: this.quizAttemptSummary(previous),
          pathway,
        };
      }
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
        pathway: await this.access.studentPathway(lessonId, studentId, tx, assignment.id),
      };
      });
    } catch (error) {
      if ((error as any)?.code !== "P2002") throw error;
      const previous = await this.db.quizAttempt.findUnique({
        where: { studentId_idempotencyKey: { studentId, idempotencyKey: request.idempotencyKey } },
      });
      if (!previous) throw error;
      const assignment = await this.access.applicableLessonAssignment(lessonId, studentId, this.db, assignmentId);
      const answers = [...request.answers].sort((a, b) => a.questionId.localeCompare(b.questionId));
      const savedAnswers = [...(previous.answers as any[])].sort((a, b) => a.questionId.localeCompare(b.questionId));
      const sameAnswers = Boolean(assignment) && previous.lessonId === lessonId && previous.assignmentId === assignment.id && savedAnswers.length === answers.length &&
        savedAnswers.every((saved, index) => saved.questionId === answers[index].questionId && saved.optionId === answers[index].optionId);
      if (!sameAnswers)
        throw new ConflictException({ code: "IDEMPOTENCY_KEY_REUSED", message: "Khóa gửi lại đã được dùng cho nội dung khác" });
      return {
        attempt: this.quizAttemptSummary(previous),
        pathway: await this.access.studentPathway(lessonId, studentId, this.db, previous.assignmentId ?? undefined),
      };
    }
  }
  @Roles("STUDENT")
  @Get("lessons/:lessonId/steps/:stepId/lab")
  @ApiOperation({ summary: "Get the sanitized lab/challenge workspace for an eligible student" })
  async studentLab(
    @Param("lessonId") lessonId: string,
    @Param("stepId") stepId: string,
    @Query() rawQuery: unknown,
    @Req() req: any,
  ) {
    const assignmentId = parseAssignmentIdQuery(rawQuery);
    const pathway = await this.access.studentPathway(lessonId, req.user.sub, this.db, assignmentId);
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
    @Query() rawQuery: unknown,
    @Req() req: any,
  ) {
    const assignmentId = parseAssignmentIdQuery(rawQuery);
    const action = stepProgressActionSchema.parse(body);
    const studentId = req.user.sub;
    const now = new Date();
    return this.db.$transaction(async (tx) => {
      const assignment = await this.access.applicableLessonAssignment(lessonId, studentId, tx, assignmentId);
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
      const pathway = await this.access.studentPathway(lessonId, studentId, tx, assignment.id);
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
  private async contentState(
    a: { id: string; contentType: string; contentId: string },
    studentId: string,
    preloadedContent?: any,
    contentWasPreloaded = false,
  ) {
    const content = contentWasPreloaded
      ? preloadedContent ?? null
      : a.contentType === "lesson"
        ? await this.db.lesson.findUnique({ where: { id: a.contentId }, include: { subject: true } })
        : await this.db.lab.findUnique({ where: { id: a.contentId }, include: { subject: true } });
    if (!content || !["published", "archived"].includes(content.status)) return { state: "UNAVAILABLE" as const, content: null };
    if (content.status === "published") return { state: "AVAILABLE" as const, content };
    const started =
      a.contentType === "lesson"
        ? await this.access.lessonStarted(a.contentId, studentId, this.db, a.id)
        : (await this.db.attempt.count({ where: { studentId, assignmentId: a.id, challenge: { labId: a.contentId } } })) > 0;
    return { state: started ? ("ARCHIVED_STARTED" as const) : ("ARCHIVED_NOT_STARTED" as const), content };
  }
  /** A published class test stays readable through its assignment even after the resource is archived. */
  private async testState(a: { contentId: string; classId: string }) {
    const test = await this.db.classResource.findFirst({ where: { id: a.contentId, classId: a.classId, kind: "TEST", status: { not: "DRAFT" } } });
    return test ? { state: "AVAILABLE" as const, test } : { state: "UNAVAILABLE" as const, test: null };
  }
  @Roles("STUDENT") @Get("assignments") async assignments(@Req() req: any) {
    const now = new Date();
    const rows = await this.db.assignment.findMany({
      where: applicableAssignmentWhere(req.user.sub),
      include: { classroom: { select: { id: true, name: true } } },
      orderBy: assignmentQueueOrder,
    });
    // Load each content type in one bounded query. The same rows power the
    // availability check and the catalog summary, avoiding per-assignment
    // detail reads while keeping the existing student authorization query.
    const tests = rows.filter((a) => a.contentType === TEST_CONTENT_TYPE);
    const testResourceIds = [...new Set(tests.map((a) => a.contentId))];
    const labIds = [...new Set(rows.filter((a) => a.contentType === "lab").map((a) => a.contentId))];
    const testResources = testResourceIds.length
      ? await this.db.classResource.findMany({
          where: { id: { in: testResourceIds }, kind: "TEST", status: { not: "DRAFT" } },
          select: { id: true, classId: true, lessonId: true },
        })
      : [];
    const resourceByClassAndId = new Map(testResources.map((resource: any) => [`${resource.classId}:${resource.id}`, resource]));
    const testResourceByAssignment = new Map(tests.map((assignment) => [
      assignment.id,
      resourceByClassAndId.get(`${assignment.classId}:${assignment.contentId}`) ?? null,
    ]));
    const testLessonIds = tests
      .map((assignment) => testResourceByAssignment.get(assignment.id)?.lessonId)
      .filter(Boolean) as string[];
    const lessonIds = [...new Set([
      ...rows.filter((a) => a.contentType === "lesson").map((a) => a.contentId),
      ...testLessonIds,
    ])];
    const [lessons, labs] = await Promise.all([
      lessonIds.length
        ? this.db.lesson.findMany({
            where: { id: { in: lessonIds } },
            include: {
              subject: { select: { id: true, name: true } },
              curriculumChapter: { select: { officialOrder: true } },
              curriculumTopic: { select: { officialOrder: true } },
            },
          })
        : Promise.resolve([]),
      labIds.length
        ? this.db.lab.findMany({
            where: { id: { in: labIds } },
            include: { subject: { select: { id: true, name: true } } },
          })
        : Promise.resolve([]),
    ]);
    const contentByType = {
      lesson: new Map(lessons.map((content: any) => [content.id, content])),
      lab: new Map(labs.map((content: any) => [content.id, content])),
    };
    const testStateByAssignment = new Map<string, any>();
    if (tests.length) {
      const { states, key } = await testStates(this.db, tests, [req.user.sub], now);
      for (const test of tests) testStateByAssignment.set(test.id, states.get(key(test.id, req.user.sub)));
    }
    const items: any[] = [];
    for (const a of rows) {
      const isTest = a.contentType === TEST_CONTENT_TYPE;
      const testResource = isTest ? testResourceByAssignment.get(a.id) : null;
      const content = isTest
        ? (testResource?.lessonId ? contentByType.lesson.get(testResource.lessonId) : null)
        : contentByType[a.contentType as "lesson" | "lab"]?.get(a.contentId) ?? null;
      const state = isTest
        ? (testResource ? "AVAILABLE" as const : "UNAVAILABLE" as const)
        : (await this.contentState(a, req.user.sub, content, true)).state;
      if (state === "UNAVAILABLE") continue;
      const lessonContext = a.contentType === "lesson" || isTest;
      items.push({
        id: a.id,
        title: a.title,
        contentId: a.contentId,
        contentType: a.contentType,
        ...(content ? {
          contentTitle: content.title,
          subject: { id: content.subject.id, name: content.subject.name },
          grade: content.grade,
          chapter: lessonContext ? content.chapter : null,
          topic: content.topic,
          curriculumOrder: lessonContext ? content.curriculumOrder : null,
          chapterOrder: lessonContext ? content.curriculumChapter?.officialOrder ?? null : null,
          topicOrder: lessonContext ? content.curriculumTopic?.officialOrder ?? null : null,
        } : {}),
        dueDate: a.dueDate,
        createdAt: a.createdAt,
        overdue: isOverdue(a.dueDate, now),
        classroom: a.classroom,
        contentState: state,
        canOpen: state !== "ARCHIVED_NOT_STARTED",
        notice: state === "AVAILABLE" ? null : ARCHIVED_CONTENT_MESSAGE,
        ...(isTest ? { testStatus: this.testSummary(testStateByAssignment.get(a.id)) } : {}),
      });
    }
    return items;
  }
  @Roles("STUDENT") @Get("assignments/:id") async assignment(
    @Param("id") id: string,
    @Req() req: any,
  ) {
    const a = await this.applicableAssignment(id, req.user.sub);
    if (a.contentType === TEST_CONTENT_TYPE) return this.testAssignment(a, req.user.sub);
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
  private testSummary(state: any) {
    if (!state) return null;
    return { status: state.status, dueAt: state.dueAt, revision: state.revision, extended: state.extended, dueSoon: state.dueSoon, score: state.current?.score ?? null };
  }
  private async testAssignment(a: any, studentId: string) {
    const [{ test }, { states, key }] = await Promise.all([this.testState(a), testStates(this.db, [a], [studentId])]);
    if (!test) throw new NotFoundException("Nội dung không còn khả dụng");
    const state = states.get(key(a.id, studentId))!;
    const content = studentTestContent(test.content);
    return {
      id: a.id,
      title: a.title,
      contentType: a.contentType,
      dueDate: state.dueAt,
      overdue: isOverdue(state.dueAt),
      classroom: a.classroom,
      contentState: "AVAILABLE" as const,
      deadline: { revision: state.revision, dueAt: state.dueAt },
      state,
      content: { id: test.id, title: test.title, version: test.version, questionCount: content.questions.length, questions: content.questions },
    };
  }
  @Roles("STUDENT") @Post("assignments/:id/submissions")
  @ApiOperation({ summary: "Submit an assigned test; server scores it and decides on-time versus late (late needs a reason)" })
  async submitTest(@Param("id") id: string, @Req() req: any, @Body() body: unknown) {
    const b = testSubmissionSchema.parse(body);
    const studentId = req.user.sub;
    const a = await this.applicableAssignment(id, studentId);
    if (a.contentType !== TEST_CONTENT_TYPE)
      throw new BadRequestException({ code: "NOT_A_TEST_ASSIGNMENT", message: "Bài được giao này không phải bài kiểm tra" });
    const ctx = { actorId: studentId, key: readIdempotencyKey(req), scope: "POST assignments/:id/submissions:" + id, payload: b };
    return idempotent(this.db, ctx, async (tx) => {
      // Same lock as deadline revision and rejection, so a late submission cannot slip past an extension.
      await lock(tx, "assignment-deadline:" + id);
      // Re-check inside the transaction: archive, removal or a new deadline may have landed meanwhile.
      const current = await tx.assignment.findFirst({ where: { id, ...applicableAssignmentWhere(studentId) }, select: { id: true, dueDate: true } });
      if (!current) throw new NotFoundException({ code: "ASSIGNMENT_NOT_FOUND", message: "Không tìm thấy bài được giao" });
      const deadline = (await currentDeadlines(tx, [current])).get(id);
      const test = await tx.classResource.findFirst({ where: { id: a.contentId, classId: a.classId, kind: "TEST", status: { not: "DRAFT" } } });
      if (!deadline?.id || !test) throw new NotFoundException("Nội dung không còn khả dụng");
      const result = scoreTest(test.content, b.answers);
      const submittedAt = new Date();
      const late = submittedAt.getTime() > deadline.dueAt.getTime();
      if (late && !b.lateReason)
        throw new BadRequestException({ code: "LATE_REASON_REQUIRED", message: "Bài nộp sau hạn cần có lý do nộp trễ" });
      const submission = await tx.assignmentSubmission.create({
        data: {
          assignmentId: id,
          studentId,
          deadlineRevisionId: deadline.id,
          resourceVersion: test.version,
          answers: b.answers,
          ...result,
          timing: late ? "LATE" : "ON_TIME",
          lateReason: late ? b.lateReason! : null,
          submittedAt,
        },
      });
      await audit(tx, {
        actor: req.user,
        action: "assignment.submit",
        targetType: "AssignmentSubmission",
        targetId: submission.id,
        after: { assignmentId: id, timing: submission.timing, deadlineRevision: deadline.revision },
      });
      const { states, key } = await testStates(tx, [current], [studentId], submittedAt);
      const state = states.get(key(id, studentId))!;
      return { submission: state.history.find((row) => row.id === submission.id), state };
    });
  }

}
