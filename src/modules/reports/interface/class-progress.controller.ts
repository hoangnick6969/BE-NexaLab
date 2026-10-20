import { Controller, Get, Inject, NotFoundException, Param, Req } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { Roles } from "../../../common/decorators";
import { ownedClass } from "../../classes/application/class-access";
import { Db } from "../../../db/db";
import { username } from "../../../common/validation";
import { misconceptions } from "../../labs/application/tutor";
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
              include: { hints: true },
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
}
