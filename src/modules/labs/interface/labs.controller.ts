import { BadRequestException, Body, ConflictException, Controller, Delete, ForbiddenException, Get, Inject, NotFoundException, Param, Post, Req } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { z } from "zod";
import { access } from "../../auth/interface/auth";
import { Roles } from "../../../common/decorators";
import { applicableAssignmentWhere, assignmentQueueOrder } from "../../classes/application/class-access";
import { Db } from "../../../db/db";
import { RequestRateLimiter } from "../../../common/request-rate-limiter";
import { text } from "../../../common/validation";
import { requestHint } from "../application/hint";
import { explain } from "../infrastructure/llm";
import { resolveModel } from "../application/sim-packs";
import { evaluate, packConfigurationErrors, versionParams } from "../application/simulation-versions";
import { canonical, digest, evaluateRunV1, executionSchema, launchSchema, rubricRefForActivity, runSubmissionSchema } from "../application/lab-run";
import { checkpointActivityForModel, checkpointActivityForRubric } from "../application/checkpoint-activities";
import { FL10_RUBRIC } from "../application/lab-run";
import { StudentAccessService } from "../../progress/application/student-access.service";
import { assertLegacyCircuitAssignmentCompatible, resolveFoundationalLabRelease, resolvePinnedAssignmentLab } from "../application/assignment-lab-execution";
import { projectLab, projectLesson } from "../../progress/application/progress-projection";
import { evaluateMassConservation } from "../../../../packages/sim";
import { fl10VisibleReadings, nextFl10Event, type Fl10Event } from "../application/fl-10-events";
import { evaluateFl10Activity } from "../application/fl-10-draft-evidence";

@ApiTags("NexaLab")
@ApiBearerAuth()
@Controller()
export class LabsController {
  constructor(@Inject(Db) private db: Db, @Inject(StudentAccessService) private access: StudentAccessService, @Inject(RequestRateLimiter) private limiter: RequestRateLimiter) {}
  private async fl10Run(tx: any, studentId: string, runId: string) {
    const run = await tx.labRun.findFirst({ where: { id: runId, studentId } });
    if (!run) throw new NotFoundException({ code: "LAB_RUN_NOT_FOUND" });
    if (run.revokedAt || (run.expiresAt && run.expiresAt.getTime() <= Date.now()))
      throw new ConflictException({ code: run.revokedAt ? "RUN_REVOKED" : "RUN_EXPIRED" });
    if (run.assignmentId) {
      const assignment = await tx.assignment.findFirst({ where: {
        ...applicableAssignmentWhere(studentId), id: run.assignmentId, contentId: run.labId, contentType: "lab",
      } });
      if (!assignment) throw new NotFoundException({ code: "LAB_RUN_NOT_FOUND" });
    } else {
      const lab = await tx.lab.findUnique({ where: { id: run.labId } });
      if (!lab || lab.status !== "published" || lab.scope !== "SHARED_LIBRARY" || !lab.releaseCleared || lab.synthetic || !lab.topicCode)
        throw new NotFoundException({ code: "LAB_RUN_NOT_FOUND" });
    }
    const parsed = executionSchema.safeParse(run.execution);
    if (!parsed.success || digest(run.execution) !== run.executionDigest || run.labId !== "mass-conservation" ||
        parsed.data.modelRef !== "mass-conservation@1.0.0" || parsed.data.engineVersion !== "1.0.0" ||
        parsed.data.rubricRef !== FL10_RUBRIC)
      throw new ConflictException({ code: "LAB_TUPLE_INVALID" });
    if (await tx.labPackRevocation.findUnique({ where: { packVersionId: parsed.data.packVersionId } }))
      throw new ConflictException({ code: "RUN_REVOKED" });
    const result = evaluateMassConservation(parsed.data.params);
    if (!result.ok) throw new ConflictException({ code: "LAB_TUPLE_INVALID" });
    return result.value;
  }

  @Roles("STUDENT") @Get("lab-runs/:runId/events") async fl10Events(@Req() req: any, @Param("runId") runId: string) {
    const model = await this.fl10Run(this.db, req.user.sub, runId);
    const rows = await this.db.labRunEvent.findMany({ where: { runId }, orderBy: { sequence: "asc" } });
    const events = rows.map((row) => row.event as Fl10Event);
    const historyCheck = nextFl10Event(events, { type: "READ_AFTER" });
    if (!historyCheck.ok && historyCheck.code === "INVALID_HISTORY")
      throw new ConflictException({ code: "LAB_EVIDENCE_INVALID" });
    return { events, readings: fl10VisibleReadings(events, model) };
  }

  @Roles("STUDENT") @Post("lab-runs/:runId/events") async recordFl10Event(
    @Req() req: any, @Param("runId") runId: string, @Body() body: unknown,
  ) {
    const input = z.object({ idempotencyKey: z.string().uuid(), event: z.unknown() }).strict().parse(body);
    this.limiter.rate("fl10-event:" + req.user.sub, 30);
    return this.db.$transaction(async (tx) => {
      await tx.$executeRawUnsafe("SELECT pg_advisory_xact_lock(hashtext($1))", "nexalab:lab-run:" + runId);
      const model = await this.fl10Run(tx, req.user.sub, runId);
      const rows = await tx.labRunEvent.findMany({ where: { runId }, orderBy: { sequence: "asc" } });
      const events = rows.map((row: any) => row.event as Fl10Event);
      const existing = rows.find((row: any) => row.idempotencyKey === input.idempotencyKey);
      if (existing && canonical(existing.event) !== canonical(input.event))
        throw new ConflictException({ code: "IDEMPOTENCY_KEY_REUSED" });
      if (!existing) {
        const transition = nextFl10Event(events, input.event);
        if (!transition.ok) throw new ConflictException({ code: transition.code });
        await tx.labRunEvent.create({ data: {
          runId, sequence: transition.sequence, idempotencyKey: input.idempotencyKey, event: transition.event,
        } });
        events.push(transition.event);
      }
      return { events, readings: fl10VisibleReadings(events, model) };
    });
  }
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
    throw new NotFoundException({ code: "LAB_LOCKED", message: "Hoàn thành và vượt qua bài kiểm tra được giao để mở phòng thực hành" });
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
    if (lab.simulationModelRef === "mass-conservation@1.0.0")
      throw new BadRequestException({ code: "FL10_USE_LAB_RUN_EVENTS" });
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
    if (body && typeof body === "object" && "runId" in body) return this.submitRun(req, body);
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
    if (c.labId === "mass-conservation" || c.lab.simulationModelRef === "mass-conservation@1.0.0")
      throw new BadRequestException({ code: "FL10_REQUIRES_LAB_RUN" });
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
          !existing.labRunId && existing.challengeId === b.challengeId &&
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

    const isVariant = c.id.includes("_v-");
    return this.db.$transaction(async (tx) => {
      // The supplied ID narrows the server-side eligibility check; only the
      // authorized pathway supplies the assignment ID persisted as evidence.
      const link = await this.practicalStepLink(b.lessonStepId, c, req.user.sub, tx, b.assignmentId);
      // D3: a direct attempt counts toward an applicable standalone lab assignment.
      const labAssignment = link ? null : await this.applicableLabAssignment(c.labId, req.user.sub, tx);
      // D-B1-01: an applicable standalone lab assignment opens the lab even when a
      // gated lesson embeds it; the attempt has no lessonStepId, so it never
      // completes the lesson's lab step. Every other direct submission keeps the A3 gate.
      // A released foundational Lab opened outside a lesson step is open curriculum
      // and is never gated by an assignment's quiz (spec §2b, FR-13).
      const openFoundational = !b.lessonStepId && c.lab.scope === "SHARED_LIBRARY" && c.lab.releaseCleared && !c.lab.synthetic && Boolean(c.lab.topicCode);
      if (!labAssignment && !openFoundational) await this.assertPracticalGate(c.labId, req.user.sub, tx);
      // Share activation locks so both selected versions were active together.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"nexalab:sim-version:" + c.labId}))`;
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"nexalab:sim-pack-lab:" + c.labId}))`;
      const pinnedAssignment = labAssignment?.labExecution != null
        ? await resolvePinnedAssignmentLab(tx, labAssignment, c.labId, c.id) : null;
      const configVersion = pinnedAssignment
        ? await tx.simulationConfigVersion.findUnique({ where: { id: pinnedAssignment.configVersionId } })
        : isVariant ? null
        : await tx.simulationConfigVersion.findFirst({ where: { labId: c.labId, status: "active" } });
      const params = pinnedAssignment ? pinnedAssignment.params
        : (isVariant ? null : versionParams(configVersion, c.id)) ?? (c.constraints as any)?.params;
      const activePack = pinnedAssignment
        ? await tx.simulationPackVersion.findUnique({ where: { id: pinnedAssignment.packVersionId } })
        : await tx.simulationPackVersion.findFirst({ where: { labId: c.labId, status: "active" } });
      if (activePack) {
        if (await tx.labPackRevocation.findUnique({ where: { packVersionId: activePack.id } }))
          throw new ConflictException({ code: "RUN_REVOKED" });
        const errors = pinnedAssignment ? [] : packConfigurationErrors(c.labId, activePack, configVersion, params);
        if (errors.length) throw new ConflictException({ code: "SIM_PACK_CONFIG_INCOMPATIBLE", message: errors.join("; ") });
      }
      const modelRef = pinnedAssignment?.modelRef ?? activePack?.modelRef ?? configVersion?.modelRef ?? c.lab.simulationModelRef;
      assertLegacyCircuitAssignmentCompatible(c.labId, labAssignment, modelRef);
      let result: any;
      let normalizedVerdict: string;
      let engineVersion: string;
      try {
        engineVersion = resolveModel(modelRef).engineVersion;
        ({ result, verdict: normalizedVerdict } = pinnedAssignment
          ? evaluateRunV1(c.labId, b.labState, params, modelRef)
          : evaluate(c.labId, b.labState, params, modelRef));
        result = { ...result, _execution: { modelRef, packVersionId: activePack?.id ?? null, configVersionId: configVersion?.id ?? null, params: params ?? null, ...(pinnedAssignment ? { rubricRef: pinnedAssignment.rubricRef } : {}) } };
      } catch (e: any) {
        throw new BadRequestException(e.message);
      }
      const a = await tx.attempt.create({
        data: {
          studentId: req.user.sub,
          challengeId: c.id,
          assignmentId: link?.assignmentId ?? labAssignment?.id ?? null,
          lessonStepId: link?.stepId ?? null,
          simulationModelVersion: engineVersion,
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
  /** P3.2a: resolve a complete tuple under the same locks as version activation. */
  @Roles("STUDENT") @Post("labs/:labId/runs")
  async launchRun(@Param("labId") labId: string, @Req() req: any, @Body() body: unknown) {
    const b = launchSchema.parse(body);
    return this.db.$transaction(async (tx) => {
      const challenge = await tx.challenge.findUnique({ where: { id: b.challengeId }, include: { lab: true } });
      if (!challenge || challenge.labId !== labId || challenge.lab.status !== "published" || challenge.id.includes("_v-"))
        throw new NotFoundException({ code: "LAB_NOT_FOUND" });
      const isOpen = challenge.lab.scope === "SHARED_LIBRARY" && challenge.lab.releaseCleared && !challenge.lab.synthetic && Boolean(challenge.lab.topicCode);
      // Circuit library practice must not inherit an unrelated legacy LED assignment.
      const assignment = labId === "circuit" && !b.assignmentId && isOpen ? null : await tx.assignment.findFirst({
        where: { ...applicableAssignmentWhere(req.user.sub), contentId: labId, contentType: "lab", ...(b.assignmentId ? { id: b.assignmentId } : {}) },
        orderBy: assignmentQueueOrder,
      });
      if (b.releaseId && assignment) throw new ConflictException({ code: "LAB_RELEASE_CONTEXT_MISMATCH" });
      if ((b.assignmentId && !assignment) || (!assignment && !isOpen))
        throw new NotFoundException({ code: "LAB_NOT_FOUND" });
      await tx.$executeRawUnsafe("SELECT pg_advisory_xact_lock(hashtext($1))", "nexalab:sim-version:" + labId);
      await tx.$executeRawUnsafe("SELECT pg_advisory_xact_lock(hashtext($1))", "nexalab:sim-pack-lab:" + labId);
      let execution: any;
      if (assignment?.labExecution !== null && assignment?.labExecution !== undefined) {
        execution = await resolvePinnedAssignmentLab(tx, assignment, labId, challenge.id);
      } else if (!assignment) {
        const activeRelease = await tx.labRelease.findFirst({ where: { labId, status: "ACTIVE" } });
        if (b.releaseId && activeRelease?.id !== b.releaseId) throw new ConflictException({ code: "LAB_RELEASE_CHANGED" });
        if (activeRelease) execution = await resolveFoundationalLabRelease(tx, activeRelease, labId, challenge.id);
      }
      if (!execution) {
        // Old assignments remain usable, without claiming a publication-time pin.
        const config = await tx.simulationConfigVersion.findFirst({ where: { labId, status: "active" } });
        const pack = await tx.simulationPackVersion.findFirst({ where: { labId, status: "active" } });
        if (!config || !pack) throw new ConflictException({ code: "LAB_TUPLE_INCOMPLETE" });
        const configured = config.challengeParams as Record<string, unknown>;
        if (!configured || !Object.prototype.hasOwnProperty.call(configured, challenge.id))
          throw new ConflictException({ code: "LAB_TUPLE_INCOMPLETE" });
        const activity = await tx.practicalActivityVersion.findUnique({ where: { id: pack.activityVersionId } });
        if (!activity) throw new ConflictException({ code: "LAB_TUPLE_INCOMPLETE" });
        const params = versionParams(config, challenge.id);
        const errors = packConfigurationErrors(labId, pack, config, params);
        if (errors.length) throw new ConflictException({ code: "SIM_PACK_CONFIG_INCOMPATIBLE", message: errors.join("; ") });
        let rubricRef: string;
        try { rubricRef = rubricRefForActivity(activity.key, activity.version, pack.modelRef); }
        catch { throw new ConflictException({ code: "LAB_TUPLE_INCOMPATIBLE", message: "Activity và scientific model không khớp phiên bản" }); }
        execution = {
          modelRef: pack.modelRef, engineVersion: pack.engineVersion, packVersionId: pack.id,
          configVersionId: config.id, activityVersionId: activity.id, activityDigest: activity.digest,
          activityKey: activity.key, activityVersion: activity.version,
          rubricRef,
          params, stateSchemaVersion: 1, evidenceSchemaVersion: 1, template: pack.template,
          binding: assignment ? "LEGACY_UNPINNED_LAUNCH" : "FOUNDATIONAL_LAUNCH",
        };
      }
      assertLegacyCircuitAssignmentCompatible(labId, assignment, execution.modelRef);
      if (await tx.labPackRevocation.findUnique({ where: { packVersionId: execution.packVersionId } }))
        throw new ConflictException({ code: "RUN_REVOKED" });
      const now = new Date();
      const run = await tx.labRun.create({ data: {
        studentId: req.user.sub, labId, challengeId: challenge.id, assignmentId: assignment?.id ?? null,
        context: assignment ? "ASSIGNMENT" : "FOUNDATIONAL", execution: execution as any,
        executionDigest: digest(execution), expiresAt: assignment ? null : new Date(now.getTime() + 86400000),
      } });
      const template = execution.template as any;
      return {
        contract: "lab-contract/1", runId: run.id, labId, challengeId: challenge.id,
        modelRef: execution.modelRef, engineVersion: execution.engineVersion, activityVersionId: execution.activityVersionId,
        activityVersion: execution.activityVersion, rubricVersion: execution.rubricRef, stateSchemaVersion: 1,
        evidenceSchemaVersion: 1,
        constraints: execution.modelRef === "mass-conservation@1.0.0" ? {} : template?.ranges ?? {},
        initialState: execution.modelRef === "mass-conservation@1.0.0" ? null : template?.initialState ?? null,
        rendererKey: checkpointActivityForModel(execution.modelRef)?.rendererKey
          ?? (execution.modelRef === "mass-conservation@1.0.0" ? "mass-conservation" : null),
        expiresAt: run.expiresAt, context: run.context, assignmentId: run.assignmentId,
        versionBinding: execution.binding,
      };
    }, { timeout: 20000 });
  }

  private async submitRun(req: any, body: unknown) {
    const b = runSubmissionSchema.parse(body);
    const evidence = "checkpoints" in b ? { checkpoints: b.checkpoints, explanation: b.explanation } : b.labState;
    return this.db.$transaction(async (tx) => {
      // One key and one run lock serialize retries and revocation with submission.
      await tx.$executeRawUnsafe("SELECT pg_advisory_xact_lock(hashtext($1))", "nexalab:attempt-key:" + req.user.sub + ":" + b.idempotencyKey);
      const existing = await tx.attempt.findUnique({ where: { studentId_idempotencyKey: { studentId: req.user.sub, idempotencyKey: b.idempotencyKey } } });
      if (existing) {
        if (existing.labRunId !== b.runId || canonical(existing.labState) !== canonical(evidence))
          throw new ConflictException({ code: "IDEMPOTENCY_KEY_REUSED" });
        return { ...existing, attempt: existing, retryGuidance: this.access.retryGuidance((await tx.labRun.findUniqueOrThrow({ where: { id: b.runId } })).labId, existing.verdict, existing.simulationResult) };
      }
      const run = await tx.labRun.findFirst({ where: { id: b.runId, studentId: req.user.sub } });
      if (!run) throw new NotFoundException({ code: "LAB_RUN_NOT_FOUND" });
      await tx.$executeRawUnsafe("SELECT pg_advisory_xact_lock(hashtext($1))", "nexalab:sim-pack-lab:" + run.labId);
      await tx.$executeRawUnsafe("SELECT pg_advisory_xact_lock(hashtext($1))", "nexalab:lab-run:" + run.id);
      const locked = await tx.labRun.findUniqueOrThrow({ where: { id: run.id } });
      if (locked.revokedAt) throw new ConflictException({ code: "RUN_REVOKED" });
      if (locked.expiresAt && locked.expiresAt.getTime() <= Date.now()) throw new ConflictException({ code: "RUN_EXPIRED" });
      let assignment: any = null;
      if (locked.assignmentId) {
        assignment = await tx.assignment.findFirst({ where: {
          ...applicableAssignmentWhere(req.user.sub), id: locked.assignmentId, contentId: locked.labId, contentType: "lab",
        } });
        if (!assignment) throw new NotFoundException({ code: "LAB_RUN_NOT_FOUND" });
      } else {
        const lab = await tx.lab.findUnique({ where: { id: locked.labId } });
        if (!lab || lab.status !== "published" || lab.scope !== "SHARED_LIBRARY" || !lab.releaseCleared || lab.synthetic || !lab.topicCode)
          throw new NotFoundException({ code: "LAB_RUN_NOT_FOUND" });
      }
      const parsed = executionSchema.safeParse(locked.execution);
      if (!parsed.success || digest(locked.execution) !== locked.executionDigest)
        throw new ConflictException({ code: "LAB_TUPLE_INVALID" });
      const execution = parsed.data;
      if (await tx.labPackRevocation.findUnique({ where: { packVersionId: execution.packVersionId } }))
        throw new ConflictException({ code: "RUN_REVOKED" });
      assertLegacyCircuitAssignmentCompatible(locked.labId, assignment, execution.modelRef);
      let result: any;
      let verdict: string;
      try {
        if (execution.rubricRef === FL10_RUBRIC) {
          if (locked.labId !== "mass-conservation" || execution.engineVersion !== "1.0.0" || !("labState" in b)) throw new Error("FL-10 execution is incompatible");
          const modelResult = evaluateMassConservation(execution.params);
          if (!modelResult.ok) throw new Error("Invalid pinned FL-10 parameters");
          const rows = await tx.labRunEvent.findMany({ where: { runId: locked.id }, orderBy: { sequence: "asc" } });
          ({ result, verdict } = evaluateFl10Activity(b.labState, modelResult.value, rows.map((row) => row.event as Fl10Event)));
        } else {
          const model = resolveModel(execution.modelRef);
          if (model.labId !== locked.labId || model.engineVersion !== execution.engineVersion) throw new Error("Pinned model is unavailable");
          const activity = checkpointActivityForRubric(execution.rubricRef);
          if (activity) {
            if (!("checkpoints" in b)) throw new Error("Thiếu bằng chứng checkpoint");
            ({ result, verdict } = activity.evaluate(b.checkpoints, b.explanation));
          } else {
          if (!("labState" in b)) throw new Error("Thiếu trạng thái Lab");
          ({ result, verdict } = evaluateRunV1(locked.labId, b.labState, execution.params, execution.modelRef));
          }
        }
      } catch (e: any) { throw new BadRequestException(e.message); }
      result = { ...result, _execution: {
        modelRef: execution.modelRef, packVersionId: execution.packVersionId,
        configVersionId: execution.configVersionId, params: execution.params, rubricRef: execution.rubricRef,
      } };
      const attempt = await tx.attempt.create({ data: {
        studentId: req.user.sub, challengeId: locked.challengeId, assignmentId: locked.assignmentId,
        labRunId: locked.id, idempotencyKey: b.idempotencyKey, labState: evidence as any,
        simulationResult: result, verdict, durationMs: b.durationMs, simulationModelVersion: execution.engineVersion,
        configVersionId: execution.configVersionId, packVersionId: execution.packVersionId,
      } });
      await projectLab(tx, req.user.sub, locked.labId);
      return { ...attempt, attempt, retryGuidance: this.access.retryGuidance(locked.labId, verdict, result) };
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
    return requestHint(this.db, req.user, id, explain);
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
