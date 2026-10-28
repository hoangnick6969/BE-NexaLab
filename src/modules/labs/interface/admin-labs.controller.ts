import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  Inject,
  Param,
  Post,
  Put,
  Req,
  UnprocessableEntityException,
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { z } from "zod";
import { notFound, reason, text } from "../../../common/admin-api";
import { Roles } from "../../../common/decorators";
import { audit, changedFields } from "../../../common/audit";
import { Db } from "../../../db/db";
import { LabReleaseService } from "../application/lab-release.service";
import { storageEnv } from "../../storage/infrastructure/storage";
import { MODEL_REGISTRY, activityDigest, activitySpecSchema, packInputSchema, packValidation, resolveModel } from "../application/sim-packs";
import {
  ENGINE,
  evaluate,
  goldenCaseResults,
  goldenTemplates,
  versionErrors,
  versionInputSchema,
  versionParams,
} from "../application/simulation-versions";
import { CHALLENGE_PARAMETERS } from "../../lessons/application/lesson-content";
import { canonical, digest, evaluateCircuitBulbActivity, evaluateRunV1, executionSchema as labRunExecutionSchema, CIRCUIT_BULB_RUBRIC } from "../application/lab-run";

/** PostgreSQL JSON numbers can round at the last floating-point digits. */
function sameStoredResult(actual: any, expected: any): boolean {
  if (typeof actual === "number" && typeof expected === "number")
    return Number.isFinite(actual) && Number.isFinite(expected) && Math.abs(actual - expected) <= 1e-12 * Math.max(1, Math.abs(actual), Math.abs(expected));
  if (Array.isArray(actual) || Array.isArray(expected))
    return Array.isArray(actual) && Array.isArray(expected) && actual.length === expected.length && actual.every((value, index) => sameStoredResult(value, expected[index]));
  if (actual && expected && typeof actual === "object" && typeof expected === "object") {
    const actualKeys = Object.keys(actual).sort();
    const expectedKeys = Object.keys(expected).sort();
    return actualKeys.length === expectedKeys.length && actualKeys.every((key, index) => key === expectedKeys[index] && sameStoredResult(actual[key], expected[key]));
  }
  return actual === expected;
}

/**
 * Epic C2 admin console API. Every route is ADMIN-only (other roles get 403 from
 * the guard), every mutation and every audit read writes an AuditLog row in the
 * same transaction, and no operation edits evidence or attests a review.
 */
@ApiTags("Admin")
@ApiBearerAuth()
@Roles("ADMIN")
@Controller("admin")
export class AdminLabsController {
  constructor(@Inject(Db) private db: Db, @Inject(LabReleaseService) private releases: LabReleaseService) {}

  @Put("lab-reviewers/:userId")
  @ApiOperation({ summary: "Authorize or revoke a named teacher's Lab release review duty" })
  authorizeLabReviewer(@Param("userId") userId: string, @Req() req: any, @Body() body: unknown) {
    return this.releases.authorizeReviewer(userId, req, body);
  }

  @Get("labs/:id/releases")
  listLabReleases(@Param("id") labId: string) {
    return this.releases.list(labId);
  }

  @Post("labs/:id/releases")
  @ApiOperation({ summary: "Snapshot a validated active Lab tuple into an immutable release draft" })
  createLabRelease(@Param("id") labId: string, @Req() req: any, @Body() body: unknown) {
    return this.releases.createDraft(labId, req, body);
  }

  @Post("labs/:id/releases/:releaseId/activate")
  @ApiOperation({ summary: "Activate a release with complete authenticated approvals for its exact digest" })
  activateLabRelease(@Param("id") labId: string, @Param("releaseId") releaseId: string, @Req() req: any, @Body() body: unknown) {
    return this.releases.activate(labId, releaseId, req, body);
  }

  @Post("labs/:id/releases/:releaseId/quarantine")
  @ApiOperation({ summary: "Quarantine a release and revoke new evaluations using its pinned pack" })
  quarantineLabRelease(@Param("id") labId: string, @Param("releaseId") releaseId: string, @Req() req: any, @Body() body: unknown) {
    return this.releases.quarantine(labId, releaseId, req, body);
  }

  // ───────────────────────── C2-T3 simulation versions ─────────────────────────
  @Get("labs")
  @ApiOperation({ summary: "Labs with challenges, active configuration version and model allowlist" })
  async labs() {
    const [labs, versions] = await Promise.all([
      this.db.lab.findMany({ include: { challenges: { where: { NOT: { id: { contains: "_v-" } } } } }, orderBy: { id: "asc" } }),
      this.db.simulationConfigVersion.findMany({ orderBy: [{ labId: "asc" }, { version: "desc" }] }),
    ]);
    return labs.map((lab) => ({
      ...lab,
      model: CHALLENGE_PARAMETERS[lab.id] ?? null,
      engineVersion: ENGINE,
      activeVersion: versions.find((v) => v.labId === lab.id && v.status === "active") ?? null,
      versionCount: versions.filter((v) => v.labId === lab.id).length,
    }));
  }
  @Put("labs/:id")
  @ApiOperation({ summary: "Technical availability and labels; scientific configuration changes only through new versions" })
  async updateLab(@Param("id") id: string, @Req() req: any, @Body() body: unknown) {
    const b = z
      .object({ title: text, topic: text, learningObjective: text, status: z.enum(["draft", "published", "archived"]), reason })
      .strict()
      .parse(body);
    return this.db.$transaction(async (tx) => {
      const before = await tx.lab.findUnique({ where: { id } });
      if (!before) throw notFound("phòng thực hành");
      const [activeRelease, anyRelease] = await Promise.all([
        tx.labRelease.findFirst({ where: { labId: id, status: "ACTIVE" }, select: { id: true } }),
        tx.labRelease.findFirst({ where: { labId: id }, select: { id: true } }),
      ]);
      if (activeRelease || (anyRelease && b.status === "published"))
        throw new ConflictException({ code: "LAB_RELEASE_REQUIRED", message: "Lab có hồ sơ release; hãy dùng quy trình review, activate hoặc quarantine để thay đổi trạng thái công khai" });
      const { reason: why, ...data } = b;
      const lab = await tx.lab.update({ where: { id }, data });
      const diff = changedFields(before, lab);
      await audit(tx, { actor: req.user, action: "lab.update", targetType: "Lab", targetId: id, reason: why, ...diff });
      return lab;
    });
  }
  @Get("labs/:id/versions")
  async versions(@Param("id") labId: string) {
    const lab = await this.db.lab.findUnique({
      where: { id: labId },
      include: { challenges: { where: { NOT: { id: { contains: "_v-" } } } } },
    });
    if (!lab) throw notFound("phòng thực hành");
    const versions = await this.db.simulationConfigVersion.findMany({ where: { labId }, orderBy: { version: "desc" } });
    const pinned = await this.db.attempt.groupBy({
      by: ["configVersionId"],
      where: { configVersionId: { in: versions.map((v) => v.id) } },
      _count: { _all: true },
    });
    return {
      lab: {
        id: lab.id,
        title: lab.title,
        status: lab.status,
        challenges: lab.challenges.map((c) => ({ id: c.id, objective: c.objective })),
      },
      model: CHALLENGE_PARAMETERS[labId] ?? null,
      templates: goldenTemplates(labId),
      versions: versions.map((v) => ({ ...v, attempts: pinned.find((p) => p.configVersionId === v.id)?._count._all ?? 0 })),
    };
  }
  @Post("labs/:id/versions")
  @ApiOperation({ summary: "Store a new draft configuration version after validation and golden cases pass" })
  async createVersion(@Param("id") labId: string, @Req() req: any, @Body() body: unknown) {
    const input = versionInputSchema.parse(body);
    const lab = await this.db.lab.findUnique({
      where: { id: labId },
      include: { challenges: { where: { NOT: { id: { contains: "_v-" } } } } },
    });
    if (!lab) throw notFound("phòng thực hành");
    const spec = CHALLENGE_PARAMETERS[labId];
    const errors = versionErrors(
      labId,
      lab.challenges.map((c) => c.id),
      input,
    );
    if (spec && lab.simulationModelRef && !spec.modelRef.startsWith(lab.simulationModelRef.split("@")[0]))
      errors.push(`Mô hình của phòng (${lab.simulationModelRef}) không khớp danh sách cho phép (${spec.modelRef})`);
    try {
      if (resolveModel(lab.simulationModelRef).labId !== labId) errors.push("Mô hình không thuộc phòng thực hành");
    } catch {
      errors.push("Mô hình của phòng không nằm trong danh sách cho phép");
    }
    if (errors.length)
      throw new UnprocessableEntityException({ code: "INVALID_SIMULATION_CONFIG", message: errors.join("; "), details: { errors } });
    const golden = goldenCaseResults(labId, input, lab.simulationModelRef);
    if (golden.some((g) => !g.ok))
      throw new UnprocessableEntityException({
        code: "GOLDEN_CASE_MISMATCH",
        message: "Có ca mẫu không cho kết quả như mong đợi trên máy chủ",
        details: { golden },
      });
    return this.db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"nexalab:sim-version:" + labId}))`;
      const last = await tx.simulationConfigVersion.findFirst({
        where: { labId },
        orderBy: { version: "desc" },
        select: { version: true },
      });
      const version = await tx.simulationConfigVersion.create({
        data: {
          labId,
          version: (last?.version ?? 0) + 1,
          modelRef: lab.simulationModelRef,
          challengeParams: input.challengeParams,
          goldenCases: input.goldenCases.map((g, i) => ({ ...g, actual: golden[i].actual })) as any,
          reason: input.reason,
          createdById: req.user.sub,
        },
      });
      await audit(tx, {
        actor: req.user,
        action: "simulation.version.create",
        targetType: "SimulationConfigVersion",
        targetId: version.id,
        reason: input.reason,
        after: { labId, version: version.version, modelRef: version.modelRef, status: "draft", goldenCases: golden.length },
      });
      return { ...version, golden };
    });
  }
  @Post("labs/:id/versions/:version/activate")
  @ApiOperation({ summary: "Activate a draft version for future attempts; the previous active version is retired, never rewritten" })
  async activateVersion(@Param("id") labId: string, @Param("version") versionParam: string, @Req() req: any, @Body() body: unknown) {
    const b = z
      .object({ reason })
      .strict()
      .parse(body ?? {});
    const number = z.coerce.number().int().min(1).parse(versionParam);
    return this.db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"nexalab:sim-version:" + labId}))`;
      const version = await tx.simulationConfigVersion.findUnique({ where: { labId_version: { labId, version: number } } });
      if (!version) throw notFound("phiên bản cấu hình");
      if (version.status !== "draft")
        throw new ConflictException({
          code: "VERSION_NOT_DRAFT",
          message: "Chỉ kích hoạt được phiên bản nháp; phiên bản đã dùng là bất biến",
        });
      const now = new Date();
      const previous = await tx.simulationConfigVersion.findFirst({ where: { labId, status: "active" } });
      if (previous) await tx.simulationConfigVersion.update({ where: { id: previous.id }, data: { status: "retired", retiredAt: now } });
      const active = await tx.simulationConfigVersion.update({ where: { id: version.id }, data: { status: "active", activatedAt: now } });
      await audit(tx, {
        actor: req.user,
        action: "simulation.version.activate",
        targetType: "SimulationConfigVersion",
        targetId: version.id,
        reason: b.reason,
        before: { version: previous?.version ?? null },
        after: { labId, version: active.version, status: "active" },
      });
      return active;
    });
  }
  /** Emergency block: serialized with pack selection and run submission. */
  @Post("labs/:id/packs/:packId/revoke-runs")
  async revokePackRuns(@Param("id") labId: string, @Param("packId") packId: string, @Req() req: any, @Body() body: unknown) {
    const b = z.object({ reason }).strict().parse(body);
    return this.db.$transaction(async (tx) => {
      await tx.$executeRawUnsafe("SELECT pg_advisory_xact_lock(hashtext($1))", "nexalab:sim-pack-lab:" + labId);
      const pack = await tx.simulationPackVersion.findUnique({ where: { id: packId } });
      if (!pack || pack.labId !== labId) throw notFound("gói mô phỏng");
      const existing = await tx.labPackRevocation.findUnique({ where: { packVersionId: packId } });
      if (existing) return existing;
      const revoked = await tx.labPackRevocation.create({ data: { packVersionId: packId, labId, reason: b.reason, revokedById: req.user.sub } });
      const activeRelease = await tx.labRelease.findFirst({ where: { labId, status: "ACTIVE" } });
      const activeSnapshot = activeRelease?.snapshot as any;
      if (activeRelease && activeSnapshot?.execution?.packVersionId === packId) {
        await tx.labRelease.update({ where: { id: activeRelease.id }, data: { status: "QUARANTINED", quarantinedAt: new Date() } });
        await tx.lab.update({ where: { id: labId }, data: { releaseCleared: false } });
        await audit(tx, { actor: req.user, action: "lab_release.quarantine_dependency", targetType: "LabRelease", targetId: activeRelease.id, reason: b.reason, before: { status: "ACTIVE" }, after: { status: "QUARANTINED", packVersionId: packId } });
      }
      await audit(tx, { actor: req.user, action: "lab.pack.revoke_runs", targetType: "SimulationPackVersion", targetId: packId, reason: b.reason, after: { labId, packVersionId: packId } });
      return revoked;
    });
  }
  @Get("attempts/:id/reproduce")
  @ApiOperation({ summary: "Re-evaluate a historical attempt with the version it pinned" })
  async reproduce(@Param("id") id: string) {
    const attempt = await this.db.attempt.findUnique({ where: { id }, include: { challenge: true } });
    if (!attempt) throw notFound("lần thực hành");
    const version = attempt.configVersionId
      ? await this.db.simulationConfigVersion.findUnique({ where: { id: attempt.configVersionId } })
      : null;
    const pack = attempt.packVersionId
      ? await this.db.simulationPackVersion.findUnique({ where: { id: attempt.packVersionId } })
      : null;
    if ((attempt.configVersionId && !version) || (attempt.packVersionId && !pack))
      throw new ConflictException({ code: "PINNED_VERSION_MISSING", message: "Không tìm thấy phiên bản đã ghi trong lần thực hành" });
    if ((version && version.labId !== attempt.challenge.labId) || (pack && pack.labId !== attempt.challenge.labId))
      throw new ConflictException({ code: "PINNED_EVIDENCE_INVALID", message: "Phiên bản đã ghi không thuộc phòng thực hành" });
    let runBinding: string | null = null;
    if (attempt.labRunId) {
      const run = await this.db.labRun.findUnique({ where: { id: attempt.labRunId } });
      const parsed = run ? labRunExecutionSchema.safeParse(run.execution) : null;
      if (!run || run.studentId !== attempt.studentId || run.challengeId !== attempt.challengeId ||
          !parsed?.success || digest(run.execution) !== run.executionDigest ||
          parsed.data.packVersionId !== attempt.packVersionId || parsed.data.configVersionId !== attempt.configVersionId ||
          parsed.data.engineVersion !== attempt.simulationModelVersion)
        throw new ConflictException({ code: "PINNED_EVIDENCE_INVALID", message: "Bằng chứng phiên chạy không nhất quán" });
      runBinding = parsed.data.binding ?? null;
      const resultExecution = (attempt.simulationResult as any)?._execution;
      if (!resultExecution || resultExecution.modelRef !== parsed.data.modelRef ||
          canonical(resultExecution.params) !== canonical(parsed.data.params))
        throw new ConflictException({ code: "PINNED_EVIDENCE_INVALID", message: "Kết quả không khớp phiên chạy" });
    }    const originalResult = attempt.simulationResult as any;
    const rawExecution = originalResult?._execution;
    const executionSchema = z.object({
      modelRef: z.string().min(1),
      packVersionId: z.string().nullable(),
      configVersionId: z.string().nullable(),
      params: z.record(z.string(), z.union([z.number(), z.string()])).nullable(),
      rubricRef: z.enum(["legacy-challenge@1.0.0", CIRCUIT_BULB_RUBRIC]).optional(),
    }).strict();
    const execution = rawExecution == null ? null : executionSchema.safeParse(rawExecution);
    if (execution && (!execution.success || execution.data.packVersionId !== attempt.packVersionId || execution.data.configVersionId !== attempt.configVersionId ||
      (pack && execution.data.modelRef !== pack.modelRef) || (version && execution.data.modelRef !== version.modelRef)))
      throw new ConflictException({ code: "PINNED_EVIDENCE_INVALID", message: "Bằng chứng phiên bản của lần thực hành không nhất quán" });
    const modelRef = execution?.success ? execution.data.modelRef : pack?.modelRef ?? version?.modelRef;
    if (execution?.success) {
      let availableEngine: string;
      try { availableEngine = resolveModel(execution.data.modelRef).engineVersion; }
      catch { throw new ConflictException({ code: "PINNED_MODEL_UNAVAILABLE", message: "Mô hình đã ghi không còn khả dụng để tái lập" }); }
      if (availableEngine !== attempt.simulationModelVersion || (pack && pack.engineVersion !== availableEngine))
        throw new ConflictException({ code: "PINNED_MODEL_UNAVAILABLE", message: "Phiên bản engine đã ghi không còn khả dụng để tái lập" });
    }
    const params = execution?.success
      ? execution.data.params
      : originalResult?.challengeCheck?.params ??
        (attempt.challenge.id.includes("_v-") ? null : versionParams(version, attempt.challengeId)) ??
        (attempt.challenge.constraints as any)?.params;
    let reproduced: string;
    let reproducedResult: any = null;
    try {
      const evaluated = execution?.success && execution.data.rubricRef === CIRCUIT_BULB_RUBRIC
        ? evaluateCircuitBulbActivity((attempt.labState as any).checkpoints, (attempt.labState as any).explanation)
        : attempt.labRunId || (execution?.success && execution.data.rubricRef === "legacy-challenge@1.0.0")
          ? evaluateRunV1(attempt.challenge.labId, attempt.labState, params ?? null, modelRef!)
          : evaluate(attempt.challenge.labId, attempt.labState, params, modelRef);
      reproduced = evaluated.verdict;
      reproducedResult = evaluated.result;
    } catch {
      reproduced = "invalid";
    }
    const { _execution, ...originalOutput } = originalResult && typeof originalResult === "object" ? originalResult : {};
    const verdictMatches = reproducedResult !== null && reproduced === attempt.verdict;
    const resultMatches = reproducedResult !== null && sameStoredResult(JSON.parse(JSON.stringify(reproducedResult)), originalOutput);
    return {
      attemptId: id,
      challengeId: attempt.challengeId,
      engineVersion: attempt.simulationModelVersion,
      configVersion: version ? { id: version.id, version: version.version, status: version.status } : null,
      packVersionId: attempt.packVersionId,
      modelRef: modelRef ?? null,
      reproductionBasis: execution?.success ? "pinned_execution" : "legacy_unverified",
      assignmentVersionBinding: attempt.assignmentId
        ? runBinding ?? (execution?.success && execution.data.rubricRef ? "ASSIGNMENT_PINNED" : "LEGACY_UNPINNED")
        : null,
      originalVerdict: attempt.verdict,
      reproducedVerdict: reproduced,
      matches: verdictMatches && (execution?.success ? resultMatches : true),
      verdictMatches,
      resultMatches,
    };
  }

  // ───────────────────────── C2-T3 practical activities and simulation packs (CF-T4) ─────────────────────────
  @Get("practicals")
  async practicals() {
    return this.db.practicalActivityVersion.findMany({ orderBy: [{ key: "asc" }, { version: "desc" }] });
  }
  @Post("practicals")
  @ApiOperation({ summary: "Store an immutable reviewed practical activity version (same content → same version)" })
  async createPractical(@Req() req: any, @Body() body: unknown) {
    const spec = activitySpecSchema.parse(body);
    const digest = activityDigest(spec);
    return this.db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"nexalab:practical:" + spec.key}))`;
      const same = await tx.practicalActivityVersion.findUnique({ where: { key_digest: { key: spec.key, digest } } });
      if (same) return { ...same, unchanged: true };
      const outcomes = await tx.curriculumOutcome.findMany({ where: { code: { in: spec.outcomeCodes } } });
      if (outcomes.length !== spec.outcomeCodes.length)
        throw new BadRequestException({ code: "INVALID_OUTCOME", message: "Hoạt động gắn yêu cầu cần đạt không có trong bản đồ chương trình" });
      const last = await tx.practicalActivityVersion.findFirst({ where: { key: spec.key }, orderBy: { version: "desc" }, select: { version: true } });
      const { reviews, ...rest } = spec;
      const created = await tx.practicalActivityVersion.create({
        data: { key: spec.key, version: (last?.version ?? 0) + 1, digest, spec: rest as any, reviews: reviews as any, createdById: req.user.sub },
      });
      await audit(tx, { actor: req.user, action: "practical.version.create", targetType: "PracticalActivityVersion", targetId: created.id, after: { version: created.version } });
      return created;
    });
  }
  @Get("labs/:id/packs")
  async labPacks(@Param("id") labId: string) {
    const [lab, packs] = await Promise.all([
      this.db.lab.findUnique({ where: { id: labId }, select: { id: true, title: true, simulationModelRef: true } }),
      this.db.simulationPackVersion.findMany({ where: { labId }, orderBy: [{ key: "asc" }, { version: "desc" }] }),
    ]);
    if (!lab) throw notFound("phòng thực hành");
    const pinned = await this.db.attempt.groupBy({ by: ["packVersionId"], where: { packVersionId: { in: packs.map((p) => p.id) } }, _count: { _all: true } });
    return {
      lab,
      model: MODEL_REGISTRY[lab.simulationModelRef] ? { modelRef: lab.simulationModelRef, ...MODEL_REGISTRY[lab.simulationModelRef], simulate: undefined } : null,
      packs: packs.map((p) => ({ ...p, attempts: pinned.find((x) => x.packVersionId === p.id)?._count._all ?? 0 })),
    };
  }
  @Post("sim-packs")
  @ApiOperation({ summary: "Validate and store a draft topic simulation pack version; golden cases run before any visual check" })
  async createSimPack(@Req() req: any, @Body() body: unknown) {
    const input = packInputSchema.parse(body);
    const [lab, activity, visual] = await Promise.all([
      this.db.lab.findUnique({ where: { id: input.labId } }),
      this.db.practicalActivityVersion.findUnique({ where: { id: input.activityVersionId } }),
      input.visualAssetVersionId ? this.db.assetVersion.findUnique({ where: { id: input.visualAssetVersionId }, include: { asset: true } }) : null,
    ]);
    if (!lab) throw notFound("phòng thực hành");
    const glb = (visual?.validation as any)?.glb ?? null;
    const visualReady = Boolean(visual && visual.status === "READY" && visual.asset.kind === "model" && visual.asset.status === "ACTIVE" && glb?.ok);
    const { errors, golden } = packValidation(input, { labModelRef: lab.simulationModelRef, activity: activity ? { spec: activity.spec } : null, glb, visualReady });
    if (errors.length) throw new UnprocessableEntityException({ code: "SIM_PACK_INVALID", message: errors.join("; "), details: { errors, golden } });
    return this.db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"nexalab:sim-pack:" + input.key}))`;
      const last = await tx.simulationPackVersion.findFirst({ where: { key: input.key }, orderBy: { version: "desc" }, select: { version: true } });
      const model = resolveModel(input.modelRef);
      const created = await tx.simulationPackVersion.create({
        data: {
          key: input.key,
          version: (last?.version ?? 0) + 1,
          labId: input.labId,
          modelRef: input.modelRef,
          engineVersion: model.engineVersion,
          activityVersionId: input.activityVersionId,
          template: input.template as any,
          visualAssetVersionId: input.visualAssetVersionId,
          semanticMap: input.semanticMap,
          bindings: input.bindings as any,
          challengeTemplates: input.challengeTemplates as any,
          reviews: { ...input.reviews, ...(input.rangeApproval ? { rangeApproval: input.rangeApproval } : {}) } as any,
          validation: { golden, glbNodes: glb?.nodes ?? null } as any,
          reason: input.reason,
          createdById: req.user.sub,
        },
      });
      await audit(tx, {
        actor: req.user,
        action: "simulation.pack.create",
        targetType: "SimulationPackVersion",
        targetId: created.id,
        reason: input.reason,
        after: { labId: input.labId, version: created.version, modelRef: input.modelRef, goldenCases: golden.length, status: "draft" },
      });
      return { ...created, golden };
    });
  }
  @Post("sim-packs/:id/activate")
  @ApiOperation({ summary: "Activate a draft pack for future attempts; the previous active pack retires, never rewritten" })
  async activateSimPack(@Param("id") id: string, @Req() req: any, @Body() body: unknown) {
    const b = z.object({ reason }).strict().parse(body ?? {});
    return this.db.$transaction(async (tx) => {
      const found = await tx.simulationPackVersion.findUnique({ where: { id }, select: { labId: true } });
      if (!found) throw notFound("gói mô phỏng");
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"nexalab:sim-pack-lab:" + found.labId}))`;
      // Read the status under the lock so two concurrent activations cannot both pass the draft check.
      const pack = (await tx.simulationPackVersion.findUnique({ where: { id } }))!;
      if (pack.status !== "draft") throw new ConflictException({ code: "PACK_NOT_DRAFT", message: "Chỉ kích hoạt được gói ở trạng thái nháp; gói đã dùng là bất biến" });
      if (["pilot", "production"].includes(storageEnv()) && !(pack.reviews as any)?.rangeApproval)
        throw new ConflictException({ code: "RANGE_APPROVAL_REQUIRED", message: "Khoảng tham số của mô hình chưa được duyệt (Q-C2-04)" });
      const previous = await tx.simulationPackVersion.findFirst({ where: { labId: pack.labId, status: "active" } });
      const now = new Date();
      if (previous) await tx.simulationPackVersion.update({ where: { id: previous.id }, data: { status: "retired", retiredAt: now } });
      const active = await tx.simulationPackVersion.update({ where: { id }, data: { status: "active", activatedAt: now } });
      await audit(tx, {
        actor: req.user,
        action: "simulation.pack.activate",
        targetType: "SimulationPackVersion",
        targetId: id,
        reason: b.reason,
        before: { version: previous?.version ?? null },
        after: { labId: pack.labId, version: pack.version, status: "active" },
      });
      return active;
    });
  }
}
