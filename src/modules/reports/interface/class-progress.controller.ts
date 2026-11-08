import { BadRequestException, Body, Controller, Delete, Get, Inject, NotFoundException, Param, Put, Query, Req } from "@nestjs/common";
import { z } from "zod";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { Roles } from "../../../common/decorators";
import { ownedClass } from "../../classes/application/class-access";
import { Db } from "../../../db/db";
import { username } from "../../../common/validation";
import { misconceptions } from "../../labs/application/tutor";
import { CHECKPOINT_HINT_CATALOGS, CHECKPOINT_MISCONCEPTION_RULES } from "../../labs/application/checkpoint-hint-rules";
import { MISCONCEPTION_LABELS } from "../../labs/application/misconception-labels";
import { buildHintInsight } from "../application/hint-insight";
import { deriveLesson } from "../../progress/application/progress";
import { TEST_CONTENT_TYPE } from "../../classes/application/assignment-test-contract";
import { testStates } from "../../classes/application/assignment-test-state";

@ApiTags("NexaLab")
@ApiBearerAuth()
@Controller()
export class ClassProgressController {
  constructor(@Inject(Db) private db: Db) {}
  @Roles("TEACHER") @Get("classes/:classId/assignments/:assignmentId/progress") async assignmentProgressBoard(
    @Param("classId") classId: string,
    @Param("assignmentId") assignmentId: string,
    @Req() req: any,
  ) {
    await ownedClass(this.db, classId, req.user);
    const assignment = await this.db.assignment.findFirst({
      where: { id: assignmentId, classId, status: { in: ["ACTIVE", "ARCHIVED"] } },
      include: { targets: { where: { student: { enrollments: { some: { classId, status: "approved" } } } }, include: { student: { select: { id: true, fullName: true, username: true } } } } },
    });
    if (!assignment) throw new NotFoundException({ code: "ASSIGNMENT_NOT_FOUND", message: "Không tìm thấy bài giao" });
    if (assignment.contentType === "lesson") {
      const lesson = await this.db.lesson.findUnique({ where: { id: assignment.contentId }, include: { steps: { orderBy: { position: "asc" } } } });
      if (!lesson) throw new NotFoundException({ code: "ASSIGNMENT_NOT_FOUND", message: "Không tìm thấy nội dung" });
      const stepIds = lesson.steps.map((step) => step.id);
      const studentIds = assignment.targets.map((target) => target.studentId);
      const [progress, quizzes, attempts] = await Promise.all([
        this.db.stepProgress.findMany({ where: { assignmentId, studentId: { in: studentIds }, stepId: { in: stepIds } } }),
        this.db.quizAttempt.findMany({ where: { assignmentId, studentId: { in: studentIds }, stepId: { in: stepIds } }, select: { id: true, studentId: true, stepId: true, score: true, passed: true, createdAt: true } }),
        this.db.attempt.findMany({ where: { assignmentId, studentId: { in: studentIds }, lessonStepId: { in: stepIds } }, select: { id: true, studentId: true, lessonStepId: true, verdict: true, createdAt: true } }),
      ]);
      return assignment.targets.map(({ student }) => {
        const evidence = {
          stepProgress: progress.filter((row) => row.studentId === student.id),
          quizAttempts: quizzes.filter((row) => row.studentId === student.id),
          attempts: attempts.filter((row) => row.studentId === student.id).map((row) => ({ ...row, challengeId: "", assignmentId, hintLevel: 0 })),
        };
        const derived = deriveLesson(lesson.steps as any, evidence as any);
        return { student, completed: derived.completed, completedRequired: derived.completedRequired, totalRequired: derived.totalRequired, percent: derived.percent, steps: derived.steps };
      });
    }
    const studentIds = assignment.targets.map((target) => target.studentId);
    if (assignment.contentType === TEST_CONTENT_TYPE) {
      // Test submissions are not Attempt rows; report the server-derived test state.
      const { states, key } = await testStates(this.db, [assignment], studentIds);
      return assignment.targets.map(({ student }) => {
        const state = states.get(key(assignment.id, student.id));
        return {
          student,
          attempts: state?.history.length ?? 0,
          latestVerdict: null,
          passed: state?.status === "SUBMITTED",
          testStatus: state?.status ?? null,
          score: state?.current?.score ?? null,
        };
      });
    }
    const attempts = await this.db.attempt.findMany({ where: { assignmentId, studentId: { in: studentIds } }, select: { id: true, studentId: true, verdict: true, createdAt: true } });
    return assignment.targets.map(({ student }) => {
      const rows = attempts.filter((attempt) => attempt.studentId === student.id);
      return { student, attempts: rows.length, latestVerdict: rows.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0]?.verdict ?? null, passed: rows.some((attempt) => attempt.verdict === "passed") };
    });
  }
  @Roles("TEACHER") @Get("classes/:id/analytics") async analytics(
    @Param("id") id: string,
    @Req() req: any,
  ) {
    await ownedClass(this.db, id, req.user);
    const students = await this.db.enrollment.findMany({
      where: { classId: id, status: "approved" },
      include: {
        student: {
          include: {
            progress: true,
            attempts: {
              // SAI-01 read-side: level, content, provider and escalated only; no context snapshot.
              include: { hints: { select: { id: true, level: true, content: true, provider: true, escalated: true, createdAt: true }, orderBy: { createdAt: "asc" } } },
              orderBy: { createdAt: "desc" },
              take: 100,
            },
          },
        },
      },
    });
    return students.map(({ student: s }) => ({
      id: s.id,
      fullName: s.fullName,
      progress: s.progress,
      attempts: s.attempts,
      misconceptions: misconceptions(
        s.attempts.filter((a) => a.challengeId === "circuit_001"),
      ),
    }));
  }
  /** The owning teacher's active or archived Lab assignment with its current, still-enrolled targets. */
  private async labAssignment(classId: string, assignmentId: string, user: any) {
    await ownedClass(this.db, classId, user);
    const assignment = await this.db.assignment.findFirst({
      where: { id: assignmentId, classId, contentType: "lab", status: { in: ["ACTIVE", "ARCHIVED"] } },
      include: { targets: { where: { student: { enrollments: { some: { classId, status: "approved" } } } }, select: { studentId: true } } },
    });
    if (!assignment) throw new NotFoundException({ code: "ASSIGNMENT_NOT_FOUND", message: "Không tìm thấy bài giao" });
    return { assignment, studentIds: assignment.targets.map((target) => target.studentId) };
  }
  /** SAI-02A: where the class is stuck on a Lab assignment. Counts and evidence IDs only, no names, no ranking. */
  @Roles("TEACHER") @Get("classes/:classId/assignments/:assignmentId/hint-insight") async hintInsight(
    @Param("classId") classId: string,
    @Param("assignmentId") assignmentId: string,
    @Req() req: any,
  ) {
    const { studentIds } = await this.labAssignment(classId, assignmentId, req.user);
    const [attempts, hints, disagreements] = await Promise.all([
      this.db.attempt.findMany({
        where: { assignmentId, studentId: { in: studentIds } },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        select: { id: true, studentId: true, verdict: true, simulationResult: true, labState: true, labRunId: true, labRun: { select: { execution: true } } },
      }),
      this.db.hintLog.findMany({
        where: { OR: [
          { attempt: { assignmentId, studentId: { in: studentIds } } },
          { attemptId: null, labRun: { assignmentId, studentId: { in: studentIds } } },
        ] },
        select: { level: true, contextSnapshot: true, attempt: { select: { studentId: true } }, labRun: { select: { studentId: true } } },
      }),
      this.db.hintInsightDisagreement.findMany({ where: { assignmentId } }),
    ]);
    const latest = new Map<string, (typeof attempts)[number]>();
    for (const attempt of attempts) if (!latest.has(attempt.studentId)) latest.set(attempt.studentId, attempt);
    // Event Labs keep the learner's answers in run events; load them for the latest attempts only (B8 hypotheses).
    const eventRuns = [...latest.values()].filter((attempt) => attempt.labRunId && CHECKPOINT_HINT_CATALOGS[String((attempt.labRun?.execution as any)?.rubricRef)]?.withEvents)
      .map((attempt) => attempt.labRunId!);
    const events = eventRuns.length
      ? await this.db.labRunEvent.findMany({ where: { runId: { in: eventRuns } }, orderBy: [{ runId: "asc" }, { sequence: "asc" }], select: { runId: true, event: true } })
      : [];
    const eventsOf = (runId: string | null) => events.filter((row) => row.runId === runId).map((row) => row.event);
    return {
      assignmentId,
      ...buildHintInsight({
        targeted: studentIds.length,
        latest: [...latest.values()].map((attempt) => ({
          attemptId: attempt.id, studentId: attempt.studentId, verdict: attempt.verdict,
          rubricRef: String((attempt.labRun?.execution as any)?.rubricRef ?? ""), result: attempt.simulationResult,
          evidence: CHECKPOINT_HINT_CATALOGS[String((attempt.labRun?.execution as any)?.rubricRef)]?.withEvents
            ? { labState: attempt.labState, events: eventsOf(attempt.labRunId) } : attempt.labState,
        })),
        hints: hints.map((hint) => {
          const snapshot = (hint.contextSnapshot ?? {}) as any;
          return {
            studentId: hint.attempt?.studentId ?? hint.labRun?.studentId ?? "",
            rubricRef: typeof snapshot.rubricRef === "string" ? snapshot.rubricRef : "",
            criterion: typeof snapshot.criterion === "string" ? snapshot.criterion : null,
            level: hint.level,
          };
        }),
        disagreements: disagreements.map((row) => ({
          rubricRef: row.rubricRef, criterion: row.criterion, misconception: row.misconception, note: row.note, at: row.createdAt.toISOString(),
        })),
      }),
    };
  }
  private disagreementKey(input: unknown, withNote: boolean) {
    const key = z.object({
      rubricRef: z.string().min(1).max(120),
      criterion: z.string().min(1).max(60),
      misconception: z.string().min(1).max(60),
      ...(withNote ? { note: z.string().trim().max(500).optional() } : {}),
    }).strict().parse(input) as { rubricRef: string; criterion: string; misconception: string; note?: string };
    const catalog = CHECKPOINT_HINT_CATALOGS[key.rubricRef];
    if (!catalog || !catalog.order.includes(key.criterion) || !MISCONCEPTION_LABELS[key.misconception])
      throw new BadRequestException({ code: "INSIGHT_KEY_INVALID", message: "Không có giả thuyết này trong bảng phân tích" });
    return key;
  }
  /** SAI-02A (UC-AI-07): the teacher disagrees with a misconception hypothesis. Rule feedback only; changes nothing students see. */
  @Roles("TEACHER") @Put("classes/:classId/assignments/:assignmentId/hint-insight/disagreements") async disagree(
    @Param("classId") classId: string,
    @Param("assignmentId") assignmentId: string,
    @Req() req: any,
    @Body() body: unknown,
  ) {
    const key = this.disagreementKey(body, true);
    await this.labAssignment(classId, assignmentId, req.user);
    const where = { assignmentId_rubricRef_criterion_misconception: { assignmentId, rubricRef: key.rubricRef, criterion: key.criterion, misconception: key.misconception } };
    const note = key.note ? key.note : null;
    const row = await this.db.hintInsightDisagreement.upsert({
      where,
      create: { assignmentId, teacherId: req.user.sub, rubricRef: key.rubricRef, criterion: key.criterion, misconception: key.misconception, ruleVersion: CHECKPOINT_MISCONCEPTION_RULES, note },
      update: { teacherId: req.user.sub, note },
    });
    return { rubricRef: row.rubricRef, criterion: row.criterion, misconception: row.misconception, ruleVersion: row.ruleVersion, note: row.note, at: row.createdAt.toISOString() };
  }
  @Roles("TEACHER") @Delete("classes/:classId/assignments/:assignmentId/hint-insight/disagreements") async withdrawDisagreement(
    @Param("classId") classId: string,
    @Param("assignmentId") assignmentId: string,
    @Req() req: any,
    @Query() query: unknown,
  ) {
    const key = this.disagreementKey(query, false);
    await this.labAssignment(classId, assignmentId, req.user);
    const result = await this.db.hintInsightDisagreement.deleteMany({ where: { assignmentId, ...key } });
    return { withdrawn: result.count > 0 };
  }
}
