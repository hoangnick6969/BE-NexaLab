import { Body, ConflictException, Controller, Get, Inject, NotFoundException, Param, Post, Delete, Query, Req } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { z } from "zod";
import { Db } from "../../../db/db";
import { Roles } from "../../../common/decorators";
import { ownedClass } from "../../classes/application/class-access";
import { deriveLesson } from "../../progress/application/progress";
import { audit } from "../../../common/audit";
import { idempotent, readIdempotencyKey } from "../../../common/idempotency";
import { supportFlags } from "../application/evidence-support";
import { TEST_CONTENT_TYPE } from "../../classes/application/assignment-test-contract";
import { deadlineStates } from "../../classes/application/assignment-test-state";
import { writtenContentType } from "../../classes/application/exam-contract";

const reasonSchema = z.object({ reason: z.string().trim().min(3).max(500), stepId: z.string().min(1).max(200) }).strict();
const notFound = () => new NotFoundException({ code: "EVIDENCE_NOT_FOUND", message: "Không tìm thấy bằng chứng học tập" });

@ApiTags("teacher-evidence")
@ApiBearerAuth()
@Controller()
export class ClassEvidenceController {
  constructor(@Inject(Db) private readonly db: Db) {}

  private async assignment(classId: string, assignmentId: string, actor: any) {
    await ownedClass(this.db, classId, actor);
    const assignment = await this.db.assignment.findFirst({
      where: { id: assignmentId, classId },
      include: { classroom: true, targets: { where: { student: { enrollments: { some: { classId, status: "approved" } } } }, include: { student: { select: { id: true, fullName: true, username: true } } } } },
    });
    if (!assignment) throw notFound();
    return assignment;
  }

  private async authorizedStudent(classId: string, studentId: string, actor: any) {
    const classroom = await this.db.classroom.findUnique({ where: { id: classId } });
    const enrollment = classroom?.teacherId === actor.sub
      ? await this.db.enrollment.findFirst({ where: { classId, studentId, status: "approved" } })
      : null;
    if (!enrollment) {
      if (classroom) await audit(this.db, { actor, action: "teacher_evidence.access", targetType: "StudentEvidence", targetId: studentId, outcome: "denied", reason: "missing_owner_or_approved_enrollment" });
      throw notFound();
    }
    return enrollment;
  }

  @Roles("TEACHER")
  @Get("classes/:classId/assignments/:assignmentId/support")
  async support(@Param("classId") classId: string, @Param("assignmentId") assignmentId: string, @Req() req: any) {
    const assignment = await this.assignment(classId, assignmentId, req.user);
    if (assignment.status !== "ACTIVE" || assignment.classroom.status !== "ACTIVE") return [];
    const now = new Date();
    const studentIds = assignment.targets.map((target) => target.studentId);
    if (assignment.contentType === TEST_CONTENT_TYPE || writtenContentType(assignment.contentType)) {
      // Test and written (TAI2-T2) submissions are not Attempt rows; derive state from the deadline lifecycle.
      const { deadlines, states, key } = await deadlineStates(this.db, [assignment], studentIds, now, { revealResults: true });
      const dueAt = deadlines.get(assignment.id)?.dueAt ?? assignment.dueDate;
      return assignment.targets.map(({ student }) => {
        const state = states.get(key(assignment.id, student.id));
        const flags = supportFlags({
          now,
          dueDate: dueAt,
          // A written submission awaiting the teacher grade counts as submitted (TAI2-T2).
          completed: state?.status === "SUBMITTED" || state?.status === "AWAITING_GRADE" || state?.status === "GRADED",
          assignmentCreatedAt: assignment.createdAt,
          progressAt: (state?.history ?? []).map((row) => row.submittedAt),
          quizzes: [],
          practicals: [],
        });
        return { student, flags };
      }).filter((row) => row.flags.length);
    }
    const [steps, progress, quizzes, attempts] = await Promise.all([
      assignment.contentType === "lesson"
        ? this.db.lessonStep.findMany({ where: { lessonId: assignment.contentId }, orderBy: { position: "asc" } })
        : Promise.resolve([]),
      this.db.stepProgress.findMany({ where: { assignmentId, studentId: { in: studentIds } } }),
      this.db.quizAttempt.findMany({ where: { assignmentId, studentId: { in: studentIds } }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] }),
      this.db.attempt.findMany({ where: { assignmentId, studentId: { in: studentIds } }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] }),
    ]);
    return assignment.targets.map(({ student }) => {
      const sp = progress.filter((row) => row.studentId === student.id);
      const qa = quizzes.filter((row) => row.studentId === student.id);
      const pa = attempts.filter((row) => row.studentId === student.id);
      let incomplete = true;
      if (steps.length) {
        try { incomplete = !deriveLesson(steps as any, { stepProgress: sp as any, quizAttempts: qa as any, attempts: pa.map((row) => ({ ...row, hintLevel: 0 })) as any }).completed; } catch { incomplete = true; }
      } else incomplete = !pa.some((row) => row.verdict === "passed");
      const flags = supportFlags({
        now,
        dueDate: assignment.dueDate,
        completed: !incomplete,
        assignmentCreatedAt: assignment.createdAt,
        progressAt: sp.map((row) => row.updatedAt),
        quizzes: qa.map((row) => ({ id: row.id, at: row.createdAt, passed: row.passed })),
        practicals: pa.map((row) => ({ id: row.id, at: row.createdAt, verdict: row.verdict })),
      });
      return { student, flags };
    }).filter((row) => row.flags.length);
  }

  @Roles("TEACHER")
  @Get("classes/:classId/students/:studentId/evidence")
  async evidence(@Param("classId") classId: string, @Param("studentId") studentId: string, @Query("assignmentId") rawAssignmentId: unknown, @Req() req: any) {
    // Without this, a missing assignmentId becomes `undefined`, which Prisma
    // ignores, and every query below would return the student's evidence from all classes.
    const assignmentId = z.string().trim().min(1).max(200).parse(rawAssignmentId);
    await this.authorizedStudent(classId, studentId, req.user);
    const assignment = await this.db.assignment.findFirst({ where: { id: assignmentId, classId, targets: { some: { studentId } } } });
    if (!assignment) throw notFound();
    const [stepProgress, quizAttempts, practicalAttempts] = await Promise.all([
      this.db.stepProgress.findMany({ where: { assignmentId, studentId }, orderBy: { updatedAt: "desc" } }),
      this.db.quizAttempt.findMany({ where: { assignmentId, studentId }, select: { id: true, stepId: true, score: true, passed: true, createdAt: true }, orderBy: { createdAt: "desc" } }),
      this.db.attempt.findMany({ where: { assignmentId, studentId }, select: { id: true, lessonStepId: true, verdict: true, durationMs: true, createdAt: true }, orderBy: { createdAt: "desc" } }),
    ]);
    return { assignmentId, studentId, stepProgress, quizAttempts, practicalAttempts };
  }

  @Roles("TEACHER")
  @Get("classes/:classId/students/:studentId/quiz-attempts/:attemptId")
  async quiz(@Param("classId") classId: string, @Param("studentId") studentId: string, @Param("attemptId") attemptId: string, @Req() req: any) {
    await this.authorizedStudent(classId, studentId, req.user);
    const row = await this.db.quizAttempt.findFirst({ where: { id: attemptId, studentId } });
    if (!row) throw notFound();
    const assignment = row.assignmentId ? await this.db.assignment.findFirst({ where: { id: row.assignmentId, classId, targets: { some: { studentId } } } }) : null;
    if (!assignment) throw notFound();
    return row;
  }

  @Roles("TEACHER")
  @Get("classes/:classId/students/:studentId/attempts/:attemptId")
  async practical(@Param("classId") classId: string, @Param("studentId") studentId: string, @Param("attemptId") attemptId: string, @Req() req: any) {
    await this.authorizedStudent(classId, studentId, req.user);
    const row = await this.db.attempt.findFirst({ where: { id: attemptId, studentId }, include: { hints: { select: { id: true, level: true, content: true, provider: true, escalated: true, createdAt: true }, orderBy: { createdAt: "asc" } } } });
    const assignment = row?.assignmentId ? await this.db.assignment.findFirst({ where: { id: row.assignmentId, classId, targets: { some: { studentId } } } }) : null;
    if (!row || !assignment) throw notFound();
    return row;
  }

  @Roles("TEACHER")
  @Post("classes/:classId/assignments/:assignmentId/students/:studentId/overrides")
  async grant(@Param("classId") classId: string, @Param("assignmentId") assignmentId: string, @Param("studentId") studentId: string, @Body() body: unknown, @Req() req: any) {
    const input = reasonSchema.parse(body);
    const assignment = await this.assignment(classId, assignmentId, req.user);
    if (!assignment.targets.some((target) => target.studentId === studentId)) throw notFound();
    const step = await this.db.lessonStep.findFirst({ where: { id: input.stepId, lessonId: assignment.contentId, type: { in: ["LAB", "CHALLENGE"] } } });
    if (!step) throw notFound();
    return idempotent(this.db, { actorId: req.user.sub, key: readIdempotencyKey(req), scope: `b2:override:${assignmentId}:${studentId}`, payload: input }, async (tx) => {
      const row = await tx.teacherGateOverride.upsert({
        where: { studentId_assignmentId_stepId: { studentId, assignmentId, stepId: input.stepId } },
        create: { studentId, assignmentId, stepId: input.stepId, actorId: req.user.sub, reason: input.reason },
        update: { actorId: req.user.sub, reason: input.reason, createdAt: new Date(), revokedAt: null, revokedById: null },
      });
      await audit(tx, { actor: req.user, action: "teacher_gate_override.grant", targetType: "TeacherGateOverride", targetId: row.id, after: { studentId, assignmentId, reason: input.reason } });
      return { id: row.id, studentId, assignmentId, stepId: row.stepId, reason: row.reason, active: true, createdAt: row.createdAt };
    });
  }

  @Roles("TEACHER")
  @Delete("classes/:classId/assignments/:assignmentId/students/:studentId/overrides/:stepId")
  async revoke(@Param("classId") classId: string, @Param("assignmentId") assignmentId: string, @Param("studentId") studentId: string, @Param("stepId") stepId: string, @Req() req: any) {
    await this.assignment(classId, assignmentId, req.user);
    return idempotent(this.db, { actorId: req.user.sub, key: readIdempotencyKey(req), scope: `b2:override-revoke:${assignmentId}:${studentId}:${stepId}`, payload: {} }, async (tx) => {
      const row = await tx.teacherGateOverride.findUnique({ where: { studentId_assignmentId_stepId: { studentId, assignmentId, stepId } } });
      if (!row || row.revokedAt) throw notFound();
      const target = await tx.lessonStep.findUnique({ where: { id: stepId } });
      const later = target ? await tx.lessonStep.findMany({ where: { lessonId: target.lessonId, position: { gt: target.position } }, select: { id: true } }) : [];
      const laterIds = later.map((item: { id: string }) => item.id);
      const inUse = laterIds.length && ((await tx.stepProgress.count({ where: { studentId, assignmentId, stepId: { in: laterIds }, status: { not: "NOT_STARTED" } } })) > 0 ||
        (await tx.quizAttempt.count({ where: { studentId, assignmentId, stepId: { in: laterIds } } })) > 0 ||
        (await tx.attempt.count({ where: { studentId, assignmentId, lessonStepId: { in: laterIds } } })) > 0);
      if (inUse) throw new ConflictException({ code: "OVERRIDE_IN_USE", message: "Không thể thu hồi vì đã có bằng chứng ở bước phía sau" });
      const updated = await tx.teacherGateOverride.update({ where: { id: row.id }, data: { revokedAt: new Date(), revokedById: req.user.sub } });
      await audit(tx, { actor: req.user, action: "teacher_gate_override.revoke", targetType: "TeacherGateOverride", targetId: row.id, after: { studentId, assignmentId, status: "revoked" } });
      return { id: updated.id, active: false, revokedAt: updated.revokedAt };
    });
  }
}
