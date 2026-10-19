import { BadRequestException, Body, ConflictException, Controller, Delete, ForbiddenException, Get, Inject, NotFoundException, Param, Post, Req } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { z } from "zod";
import { access } from "../auth/auth";
import { Roles } from "../common/decorators";
import { applicableAssignmentWhere, assignmentQueueOrder } from "../classes/class-access";
import { Db } from "../infra/db";
import { RequestRateLimiter } from "../common/request-rate-limiter";
import { text } from "../common/validation";
import { requestHint } from "./hint";
import { resolveModel } from "./sim-packs";
import { ENGINE as SIMULATION_ENGINE, evaluate, versionParams } from "./simulation-versions";
import { StudentAccessService } from "../progress/student-access.service";
import { projectLab, projectLesson } from "../progress/progress-projection";

@ApiTags("NexaLab")
@ApiBearerAuth()
@Controller()
export class LabsController {
  constructor(@Inject(Db) private db: Db, @Inject(StudentAccessService) private access: StudentAccessService, @Inject(RequestRateLimiter) private limiter: RequestRateLimiter) {}
  /** Standalone lab work counts toward an assignment only when one applies (D3). */
  private async applicableLabAssignment(labId: string, studentId: string, db: any = this.db) {
    return db.assignment.findFirst({
      where: { ...applicableAssignmentWhere(studentId), contentId: labId, contentType: "lab" },
      orderBy: assignmentQueueOrder,
    });
  }
  @Get("tutor/status") tutorStatus() {
    return {
      provider:
        process.env.ANTHROPIC_API_KEY && process.env.ANTHROPIC_MODEL
          ? "anthropic"
          : "rules",
    };
  }
  private async assertPracticalGate(labId: string, studentId: string, db: any) {
    const lessons = await db.lesson.findMany({
      where: { status: "published" },
      include: { steps: { where: { type: { in: ["LAB", "CHALLENGE"] } }, select: { config: true, type: true } } },
    });
    const linked = lessons.filter((lesson: any) =>
      lesson.steps.some((step: any) => (step.config as any)?.labId === labId || (step.config as any)?.challengeId?.startsWith(labId)),
    );
    if (!linked.length) return;
    let hasApplicableAssignment = false;
    for (const lesson of linked) {
      if (!(await this.access.applicableLessonAssignment(lesson.id, studentId, db))) continue;
      hasApplicableAssignment = true;
      try {
        const pathway = await this.access.studentPathway(lesson.id, studentId, db);
        if (pathway.steps.some((step: any) => (step.type === "LAB" || step.type === "CHALLENGE") && step.state !== "LOCKED")) return;
      } catch {
        // An unassigned lesson cannot grant practical access.
      }
    }
    if (!hasApplicableAssignment) return;
    throw new NotFoundException("Hoàn thành và vượt qua bài kiểm tra được giao để mở phòng thực hành");
  }
  @Roles("STUDENT", "TEACHER") @Post("simulate/:labId") async preview(
    @Param("labId") labId: string,
    @Body() body: any,
    @Req() req: any,
  ) {
    // CF-T4: the lab's allowlisted model reference decides the engine; unknown labs fail closed.
    const lab = await this.db.lab.findUnique({ where: { id: labId }, select: { simulationModelRef: true, status: true, scope: true, releaseCleared: true, synthetic: true, topicCode: true } });
    if (!lab) throw new NotFoundException({ code: "LAB_NOT_FOUND", message: "Không tìm thấy phòng thực hành" });
    if (req.user.role === "STUDENT" && !(lab.status === "published" && lab.scope === "SHARED_LIBRARY" && lab.releaseCleared && !lab.synthetic && lab.topicCode))
      throw new NotFoundException({ code: "LAB_NOT_FOUND", message: "Không tìm thấy phòng thực hành" });
    try {
      return resolveModel(lab.simulationModelRef).simulate(body);
    } catch (e: any) {
      throw new BadRequestException(e.message);
    }
  }
  @Roles("STUDENT") @Post("attempts") async attempt(
    @Req() req: any,
    @Body() body: unknown,
  ) {
    this.limiter.rate("attempt:" + req.user.sub, 30);
    const b = z
      .object({
        challengeId: text,
        lessonStepId: text.optional(),
        assignmentId: text.optional(),
        idempotencyKey: z.string().uuid().optional(),
        labState: z.unknown(),
        durationMs: z.number().int().min(0).max(86400000),
      })
      .parse(body);
    const c = await this.db.challenge.findUnique({
      where: { id: b.challengeId },
      include: { lab: true },
    });
    if (!c || c.lab.status !== "published") throw new NotFoundException();
    if (!b.lessonStepId) {
      const applicableStandaloneLab = await this.applicableLabAssignment(c.labId, req.user.sub);
      if (!applicableStandaloneLab && !(c.lab.scope === "SHARED_LIBRARY" && c.lab.releaseCleared && !c.lab.synthetic && c.lab.topicCode))
        throw new NotFoundException({ code: "LAB_NOT_FOUND", message: "Không tìm thấy phòng thực hành" });
    }

    // Idempotency fast-path
    if (b.idempotencyKey) {
      const existing = await this.db.attempt.findUnique({
        where: {
          studentId_idempotencyKey: {
            studentId: req.user.sub,
            idempotencyKey: b.idempotencyKey,
          },
        },
      });
      if (existing) {
        const samePayload =
          existing.challengeId === b.challengeId &&
          JSON.stringify(existing.labState) === JSON.stringify(b.labState) &&
          (!existing.lessonStepId || existing.assignmentId === b.assignmentId);
        if (!samePayload) {
          throw new ConflictException({
            code: "IDEMPOTENCY_KEY_REUSED",
            message: "Khóa gửi lại đã được dùng cho nội dung khác",
          });
        }
        const attemptNumber = await this.db.attempt.count({
          where: {
            studentId: req.user.sub,
            challengeId: existing.challengeId,
            createdAt: { lte: existing.createdAt },
          },
        });
        let pathway: any = undefined;
        if (existing.lessonStepId) {
          const step = await this.db.lessonStep.findUnique({
            where: { id: existing.lessonStepId },
          });
          if (step) {
            pathway = await this.access.studentPathway(step.lessonId, req.user.sub, this.db, existing.assignmentId ?? undefined);
          }
        }
        return {
          ...existing,
          attempt: {
            ...existing,
            attemptNumber,
          },
          pathway,
          retryGuidance: this.access.retryGuidance(
            c.labId,
            existing.verdict,
            existing.simulationResult,
          ),
        };
      }
    }

    // C2-T3: a base challenge is evaluated with the lab's active configuration
    // version, which the attempt pins; a teacher variant keeps its own reviewed
    // parameters. Either way the scientific model is unchanged.
    const isVariant = c.id.includes("_v-");
    const configVersion = isVariant
      ? null
      : await this.db.simulationConfigVersion.findFirst({ where: { labId: c.labId, status: "active" } });
    const params = (isVariant ? null : versionParams(configVersion, c.id)) ?? (c.constraints as any)?.params;
    const activePack = await this.db.simulationPackVersion.findFirst({ where: { labId: c.labId, status: "active" }, select: { id: true } });
    let result: any;
    let normalizedVerdict: string;
    try {
      ({ result, verdict: normalizedVerdict } = evaluate(c.labId, b.labState, params, c.lab.simulationModelRef));
    } catch (e: any) {
      throw new BadRequestException(e.message);
    }

    return this.db.$transaction(async (tx) => {
      // The supplied ID narrows the server-side eligibility check; only the
      // authorized pathway supplies the assignment ID persisted as evidence.
      const link = await this.practicalStepLink(b.lessonStepId, c, req.user.sub, tx, b.assignmentId);
      // D3: a direct attempt counts toward an applicable standalone lab assignment.
      const labAssignment = link ? null : await this.applicableLabAssignment(c.labId, req.user.sub, tx);
      // D-B1-01: an applicable standalone lab assignment opens the lab even when a
      // gated lesson embeds it; the attempt has no lessonStepId, so it never
      // completes the lesson's lab step. Every other direct submission keeps the A3 gate.
      if (!labAssignment) await this.assertPracticalGate(c.labId, req.user.sub, tx);
      const a = await tx.attempt.create({
        data: {
          studentId: req.user.sub,
          challengeId: c.id,
          assignmentId: link?.assignmentId ?? labAssignment?.id ?? null,
          lessonStepId: link?.stepId ?? null,
          simulationModelVersion: SIMULATION_ENGINE,
          configVersionId: configVersion?.id ?? null,
          packVersionId: activePack?.id ?? null,
          idempotencyKey: b.idempotencyKey ?? null,
          labState: b.labState as any,
          simulationResult: result,
          verdict: normalizedVerdict,
          durationMs: b.durationMs,
        },
      });

      const attemptCount = await tx.attempt.count({
        where: { studentId: req.user.sub, challengeId: c.id },
      });

      let pathway: any = undefined;
      if (link) {
        const isCompleted = normalizedVerdict === "passed";
        const now = new Date();
        const saved = await tx.stepProgress.findUnique({
          where: { studentId_assignmentId_stepId: { studentId: req.user.sub, assignmentId: link.assignmentId!, stepId: link.stepId } },
        });
        // High-water evidence: a later failed retry never undoes a pass.
        await tx.stepProgress.upsert({
          where: {
            studentId_assignmentId_stepId: { studentId: req.user.sub, assignmentId: link.assignmentId!, stepId: link.stepId },
          },
          create: {
            studentId: req.user.sub,
            stepId: link.stepId,
            assignmentId: link.assignmentId!,
            status: isCompleted ? "COMPLETED" : "IN_PROGRESS",
            progressValue: isCompleted ? 100 : 50,
            startedAt: now,
            completedAt: isCompleted ? now : null,
          },
          update: saved?.status === "COMPLETED"
            ? { startedAt: saved.startedAt ?? now }
            : {
                status: isCompleted ? "COMPLETED" : "IN_PROGRESS",
                progressValue: isCompleted ? 100 : 50,
                startedAt: saved?.startedAt ?? now,
                completedAt: isCompleted ? now : null,
              },
        });
        await projectLesson(tx, req.user.sub, link.lessonId, link.assignmentId);
        pathway = await this.access.studentPathway(link.lessonId, req.user.sub, tx, link.assignmentId);
      }
      await projectLab(tx, req.user.sub, c.labId);
      return {
        ...a,
        attempt: {
          ...a,
          attemptNumber: attemptCount,
        },
        pathway,
        retryGuidance: this.access.retryGuidance(c.labId, normalizedVerdict, result),
      };
      // Gate, evidence, projections and the pathway reconcile in one transaction; at
      // pooled-database round-trip latency that exceeds Prisma's 5 s default.
    }, { timeout: 20000 });
  }
  private async practicalStepLink(
    lessonStepId: string | undefined,
    challenge: { id: string; labId: string },
    studentId: string,
    db: any,
    assignmentId?: string,
  ) {
    if (!lessonStepId) return null;
    const step = await db.lessonStep.findUnique({ where: { id: lessonStepId } });
    const config = step?.config as any;
    const matches =
      (step?.type === "LAB" && config?.labId === challenge.labId) ||
      (step?.type === "CHALLENGE" && config?.challengeId === challenge.id);
    if (!step || !matches) throw new NotFoundException("Bước thực hành không tồn tại");
    const pathway = await this.access.studentPathway(step.lessonId, studentId, db, assignmentId);
    const current = pathway.steps.find((item: any) => item.id === step.id);
    if (!current || current.state === "LOCKED")
      throw new ForbiddenException({ code: "STEP_LOCKED", message: "Bước thực hành chưa khả dụng" });
    return { stepId: step.id as string, lessonId: step.lessonId as string, assignmentId: pathway.assignment.id as string };
  }
  @Roles("STUDENT") @Get("attempts") attempts(@Req() req: any) {
    return this.db.attempt.findMany({
      where: { studentId: req.user.sub },
      include: { challenge: true, hints: true },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
  }
  @Roles("STUDENT") @Post("attempts/:id/hint") async hint(
    @Param("id") id: string,
    @Req() req: any,
  ) {
    this.limiter.rate("hint:" + req.user.sub, 8);
    // B0P-T4: provider call outside the transaction; authorization rechecked before persisting.
    return requestHint(this.db, req.user, id);
  }
  @Roles("STUDENT") @Post("saved") async save(
    @Req() req: any,
    @Body() body: unknown,
  ) {
    const b = z
      .object({ attemptId: text, note: z.string().max(1000) })
      .parse(body);
    const a = await this.db.attempt.findFirst({
      where: { id: b.attemptId, studentId: req.user.sub },
      include: { challenge: true },
    });
    if (!a) throw new NotFoundException();
    return this.db.savedExperiment.create({
      data: {
        studentId: req.user.sub,
        labId: a.challenge.labId,
        labState: a.labState!,
        simulationResult: a.simulationResult!,
        note: b.note,
      },
    });
  }
  @Roles("STUDENT") @Get("saved") saved(@Req() req: any) {
    return this.db.savedExperiment.findMany({
      where: { studentId: req.user.sub },
      orderBy: { createdAt: "desc" },
    });
  }
  @Roles("STUDENT") @Delete("saved/:id") async deleteSaved(
    @Req() req: any,
    @Param("id") id: string,
  ) {
    return this.db.savedExperiment.deleteMany({
      where: { id, studentId: req.user.sub },
    });
  }
}
