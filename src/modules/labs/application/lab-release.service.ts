import { assertReviewedBindings, directLessonBinding } from "./lab-release-bindings";
import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { z } from "zod";
import { audit } from "../../../common/audit";
import { Db } from "../../../db/db";
import { activitySpecSchema, packInputSchema, packValidation } from "./sim-packs";
import { captureCurrentLabExecution, resolvePinnedAssignmentLab } from "./assignment-lab-execution";
import { digest } from "./lab-run";
import { goldenCaseResults, versionErrors, versionInputSchema } from "./simulation-versions";

export const LAB_REVIEW_KINDS = ["CURRICULUM", "SUBJECT", "MODEL", "SAFETY", "RIGHTS", "RANGE", "OWNER_SIGNOFF"] as const;
const REVIEW_KIND = z.enum(LAB_REVIEW_KINDS);
const delegatedReviewKind = z.enum(["CURRICULUM", "SUBJECT", "MODEL", "SAFETY", "RIGHTS", "RANGE"]);
const ownerEvidence = z.object({
  curriculumMapping: z.string().trim().min(10),
  sourceReferences: z.array(z.string().trim().min(5)).min(1),
  scientificGoldenCases: z.string().trim().min(10),
  rubric: z.string().trim().min(10),
  safetyAssessment: z.string().trim().min(10),
  rightsAssessment: z.string().trim().min(10),
}).strict();
const releaseReason = z.string().trim().min(5).max(500);
const requiredReviewKinds = (_ranges: unknown) => ["OWNER_SIGNOFF"];

function missingReviewKinds(snapshot: any, reviews: Array<{ kind: string; decision: string; releaseDigest: string; reviewerId: string }>) {
  const required: string[] = snapshot.requiredReviewKinds;
  const approved = new Map(reviews.filter((r) => r.decision === "APPROVE" && r.releaseDigest === snapshot.digest)
    .map((r) => [r.kind, r]));
  const missing = required.filter((kind) => !approved.has(kind));
  const coreReviewers = ["CURRICULUM", "SUBJECT", "MODEL"].map((kind) => approved.get(kind)?.reviewerId).filter(Boolean);
  if (required.includes("CURRICULUM") && required.includes("SUBJECT") && required.includes("MODEL") && new Set(coreReviewers).size !== 3)
    missing.push("DISTINCT_REVIEWERS");
  return missing;
}

@Injectable()
export class LabReleaseService {
  constructor(@Inject(Db) private db: Db) {}

  async authorizeReviewer(userId: string, req: any, body: unknown) {
    const b = z.object({ subjectId: z.string().min(1).max(80), kind: delegatedReviewKind, active: z.boolean().default(true), reason: releaseReason }).strict().parse(body);
    const user = await this.db.user.findUnique({ where: { id: userId }, select: { id: true, role: true, status: true, disabledAt: true } });
    if (!user || user.role !== "TEACHER" || user.status !== "active" || user.disabledAt)
      throw new BadRequestException({ code: "LAB_REVIEWER_NOT_ELIGIBLE", message: "Chỉ gán nhiệm vụ duyệt cho tài khoản giáo viên đang hoạt động" });
    const subject = await this.db.subject.findUnique({ where: { id: b.subjectId }, select: { id: true } });
    if (!subject) throw new NotFoundException({ code: "SUBJECT_NOT_FOUND" });
    return this.db.$transaction(async (tx) => {
      const key = { userId, subjectId: b.subjectId, kind: b.kind };
      const before = await tx.labReviewerAuthorization.findUnique({ where: { userId_subjectId_kind: key } });
      const authorization = before
        ? await tx.labReviewerAuthorization.update({ where: { id: before.id }, data: { active: b.active, authorizedById: req.user.sub } })
        : await tx.labReviewerAuthorization.create({ data: { ...key, active: b.active, authorizedById: req.user.sub } });
      await audit(tx, { actor: req.user, action: "lab_reviewer.authorize", targetType: "LabReviewerAuthorization", targetId: authorization.id, reason: b.reason, before: before ? { active: before.active } : null, after: { userId, subjectId: b.subjectId, kind: b.kind, active: authorization.active } });
      return authorization;
    });
  }

  async list(labId: string) {
    const lab = await this.db.lab.findUnique({ where: { id: labId }, select: { id: true } });
    if (!lab) throw new NotFoundException({ code: "LAB_NOT_FOUND" });
    return this.db.labRelease.findMany({ where: { labId }, include: { reviews: true }, orderBy: { version: "desc" } });
  }

  async createDraft(labId: string, req: any, body: unknown) {
    const b = z.object({ reason: releaseReason, lessonId: z.string().min(1).max(200).optional() }).strict().parse(body);
    return this.db.$transaction(async (tx) => {
      await tx.$executeRawUnsafe("SELECT pg_advisory_xact_lock(hashtext($1))", "nexalab:lab-release:" + labId);
      const lab = await tx.lab.findUnique({ where: { id: labId } });
      if (!lab) throw new NotFoundException({ code: "LAB_NOT_FOUND" });
      if (lab.synthetic || lab.status === "archived") throw new ConflictException({ code: "LAB_NOT_RELEASE_ELIGIBLE" });
      const execution = await captureCurrentLabExecution(tx, labId);
      const directLessons = await tx.lesson.findMany({
        where: {
          ...(b.lessonId ? { id: b.lessonId } : { labId }),
          status: "published", scope: "SHARED_LIBRARY", synthetic: false,
          packVersion: { status: "released", synthetic: false },
        },
        include: { packVersion: true },
        orderBy: [{ curriculumOrder: "asc" }, { id: "asc" }],
      });
      if (b.lessonId && directLessons.length !== 1)
        throw new ConflictException({ code: "LAB_LESSON_BINDING_REQUIRED" });
      const directTopicCodes = [...new Set(directLessons.map((lesson: any) => lesson.curriculumTopicCode).filter(Boolean))];
      if (directLessons.some((lesson: any) => lesson.subjectId !== lab.subjectId || lesson.grade !== lab.grade) || directTopicCodes.length > 1)
        throw new ConflictException({ code: "LAB_LESSON_BINDING_INVALID" });
      const topicCode = lab.topicCode ?? directTopicCodes[0];
      if (!topicCode || (lab.topicCode && directTopicCodes.length && directTopicCodes[0] !== lab.topicCode))
        throw new ConflictException({ code: "LAB_TOPIC_MAPPING_REQUIRED" });
      const topic = await tx.curriculumTopic.findUnique({ where: { code: topicCode }, include: { chapter: true } });
      if (!topic || topic.status !== "active" || topic.chapter.status !== "active")
        throw new ConflictException({ code: "LAB_TOPIC_MAPPING_REQUIRED" });

      const [config, pack, activity] = await Promise.all([
        tx.simulationConfigVersion.findUnique({ where: { id: execution.configVersionId } }),
        tx.simulationPackVersion.findUnique({ where: { id: execution.packVersionId } }),
        tx.practicalActivityVersion.findUnique({ where: { id: execution.activityVersionId } }),
      ]);
      if (!config || !pack || !activity) throw new ConflictException({ code: "LAB_TUPLE_INCOMPLETE" });
      const parsedActivity = activitySpecSchema.omit({ reviews: true }).safeParse(activity.spec);
      if (!parsedActivity.success) throw new ConflictException({ code: "LAB_ACTIVITY_INVALID" });
      const outcomes = await tx.curriculumOutcome.findMany({
        where: { code: { in: parsedActivity.data.outcomeCodes }, status: "active", synthetic: false }, select: { code: true },
      });
      const topicOutcomes = Array.isArray(topic.outcomeCodes) ? topic.outcomeCodes as string[] : [];
      if (outcomes.length !== parsedActivity.data.outcomeCodes.length || parsedActivity.data.outcomeCodes.some((code) => !topicOutcomes.includes(code)))
        throw new ConflictException({ code: "LAB_OUTCOME_MAPPING_REQUIRED" });
      if (directLessons.some((lesson: any) => {
        const lessonOutcomes = Array.isArray(lesson.outcomeCodes) ? lesson.outcomeCodes as string[] : [];
        const packOutcomes = Array.isArray(lesson.packVersion?.outcomeCodes) ? lesson.packVersion.outcomeCodes as string[] : [];
        return parsedActivity.data.outcomeCodes.some((code) => !lessonOutcomes.includes(code) || !packOutcomes.includes(code));
      })) throw new ConflictException({ code: "LAB_OUTCOME_MAPPING_REQUIRED" });

      const legacyLessonBindings = directLessons.length ? [] : await tx.foundationalCourseLesson.findMany({
        where: { foundationalLabId: labId, courseVersion: { status: "active" }, lesson: { scope: "SHARED_LIBRARY", status: "published" } },
        include: { courseVersion: { select: { id: true, subjectId: true, grade: true, version: true, sourceVersion: true } }, lesson: { select: { id: true, curriculumTopicCode: true } } },
        orderBy: [{ officialOrder: "asc" }, { lessonId: "asc" }],
      });
      if (!directLessons.length && !legacyLessonBindings.length) throw new ConflictException({ code: "LAB_LESSON_BINDING_REQUIRED" });

      const configInput = versionInputSchema.safeParse({
        challengeParams: config.challengeParams,
        goldenCases: ((config.goldenCases as any[]) ?? []).map(({ actual: _actual, ...golden }) => golden),
        reason: config.reason,
      });
      const challengeIds = (await tx.challenge.findMany({ where: { labId, NOT: { id: { contains: "_v-" } } }, select: { id: true } })).map((c) => c.id);
      if (!configInput.success || versionErrors(labId, challengeIds, configInput.data).length || goldenCaseResults(labId, configInput.data, config.modelRef).some((g) => !g.ok))
        throw new ConflictException({ code: "LAB_CONFIG_VALIDATION_FAILED" });

      const packInput = packInputSchema.safeParse({
        key: pack.key, labId, modelRef: pack.modelRef,
        activityVersionId: pack.activityVersionId, template: pack.template, visualAssetVersionId: pack.visualAssetVersionId,
        semanticMap: pack.semanticMap, bindings: pack.bindings, challengeTemplates: pack.challengeTemplates,
        reviews: pack.reviews, reason: pack.reason,
      });
      if (!packInput.success) throw new ConflictException({ code: "LAB_PACK_VALIDATION_FAILED" });
      const visual = pack.visualAssetVersionId
        ? await tx.assetVersion.findUnique({ where: { id: pack.visualAssetVersionId }, include: { asset: true } })
        : null;
      const glb = (visual?.validation as any)?.glb ?? null;
      const visualReady = Boolean(visual && visual.status === "READY" && visual.asset.kind === "model" && visual.asset.status === "ACTIVE" && glb?.ok);
      const packCheck = packValidation(packInput.data, { labModelRef: execution.modelRef, activity: { spec: activity.spec }, glb, visualReady });
      if (packCheck.errors.length) throw new ConflictException({ code: "LAB_PACK_VALIDATION_FAILED", details: { errors: packCheck.errors } });

      const required = requiredReviewKinds((pack.template as any)?.ranges);
      const snapshot = {
        lab: { id: lab.id, subjectId: lab.subjectId, grade: lab.grade, title: lab.title, topic: lab.topic, topicCode, learningObjective: lab.learningObjective },
        execution,
        activity: { id: activity.id, key: activity.key, version: activity.version, digest: activity.digest, spec: parsedActivity.data },
        outcomes: outcomes.map((outcome) => outcome.code).sort(),
        lessonBindings: directLessons.length ? directLessons.map(directLessonBinding) : legacyLessonBindings.map((binding) => ({
          courseVersionId: binding.courseVersion.id, subjectId: binding.courseVersion.subjectId,
          grade: binding.courseVersion.grade, version: binding.courseVersion.version, sourceVersion: binding.courseVersion.sourceVersion,
          lessonId: binding.lesson.id, lessonTopicCode: binding.lesson.curriculumTopicCode, officialOrder: binding.officialOrder,
        })),
        reviewPolicy: "OWNER_SIGNOFF_V1",
        requiredReviewKinds: required,
      };
      const releaseDigest = digest(snapshot);
      const existing = await tx.labRelease.findUnique({ where: { labId_digest: { labId, digest: releaseDigest } }, include: { reviews: true } });
      if (existing) return { ...existing, unchanged: true };
      const last = await tx.labRelease.findFirst({ where: { labId }, orderBy: { version: "desc" }, select: { version: true } });
      const release = await tx.labRelease.create({ data: {
        labId, version: (last?.version ?? 0) + 1, digest: releaseDigest, snapshot: snapshot as any,
        status: "DRAFT", reason: b.reason, createdById: req.user.sub,
      } });
      await audit(tx, { actor: req.user, action: "lab_release.create", targetType: "LabRelease", targetId: release.id, reason: b.reason, after: { labId, version: release.version, digest: release.digest, requiredReviewKinds: required } });
      return { ...release, reviews: [], missingReviewKinds: required };
    }, { timeout: 20000 });
  }

  async review(releaseId: string, req: any, body: unknown) {
    const b = z.object({ kind: REVIEW_KIND, decision: z.enum(["APPROVE", "REQUEST_CHANGES"]), releaseDigest: z.string().regex(/^[a-f0-9]{64}$/), note: z.string().trim().min(5).max(1000), evidence: ownerEvidence.optional() }).strict().parse(body);
    return this.db.$transaction(async (tx) => {
      const release = await tx.labRelease.findUnique({ where: { id: releaseId }, include: { lab: true, reviews: true } });
      if (!release) throw new NotFoundException({ code: "LAB_RELEASE_NOT_FOUND" });
      const snapshot = release.snapshot as any;
      if (digest(snapshot) !== release.digest || b.releaseDigest !== release.digest)
        throw new ConflictException({ code: "LAB_RELEASE_DIGEST_MISMATCH" });
      if (release.status !== "DRAFT") throw new ConflictException({ code: "LAB_RELEASE_NOT_REVIEWABLE" });
      if (!snapshot.requiredReviewKinds.includes(b.kind)) throw new BadRequestException({ code: "LAB_REVIEW_KIND_NOT_REQUIRED" });
      if (b.kind === "OWNER_SIGNOFF") {
        const owner = await tx.user.findUnique({ where: { id: req.user.sub }, select: { role: true, status: true, disabledAt: true } });
        if (!owner || owner.role !== "ADMIN" || owner.status !== "active" || owner.disabledAt)
          throw new ForbiddenException({ code: "LAB_OWNER_SIGNOFF_NOT_AUTHORIZED" });
        if (b.decision === "APPROVE" && !b.evidence)
          throw new BadRequestException({ code: "LAB_OWNER_SIGNOFF_EVIDENCE_REQUIRED" });
      } else {
        const authorization = await tx.labReviewerAuthorization.findFirst({
          where: { userId: req.user.sub, subjectId: release.lab.subjectId, kind: b.kind, active: true },
          include: { user: { select: { role: true, status: true, disabledAt: true } } },
        });
        if (!authorization || authorization.user.role !== "TEACHER" || authorization.user.status !== "active" || authorization.user.disabledAt)
          throw new ForbiddenException({ code: "LAB_REVIEW_NOT_AUTHORIZED" });
        const [config, pack, activity] = await Promise.all([
          tx.simulationConfigVersion.findUnique({ where: { id: snapshot.execution.configVersionId }, select: { createdById: true } }),
          tx.simulationPackVersion.findUnique({ where: { id: snapshot.execution.packVersionId }, select: { createdById: true } }),
          tx.practicalActivityVersion.findUnique({ where: { id: snapshot.execution.activityVersionId }, select: { createdById: true } }),
        ]);
        if ([release.createdById, config?.createdById, pack?.createdById, activity?.createdById].includes(req.user.sub))
          throw new ForbiddenException({ code: "LAB_REVIEW_INDEPENDENCE_REQUIRED" });
      }
      const review = await tx.labReleaseReview.create({ data: {
        releaseId, reviewerId: req.user.sub, kind: b.kind, decision: b.decision, releaseDigest: release.digest, note: b.note,
        evidence: b.kind === "OWNER_SIGNOFF" ? b.evidence ?? undefined : undefined,
      } });
      const allReviews = [...release.reviews, review];
      const missing = missingReviewKinds({ ...snapshot, digest: release.digest }, allReviews);
      const nextStatus = b.decision === "REQUEST_CHANGES" ? "CHANGES_REQUESTED" : missing.length ? "DRAFT" : "APPROVED";
      await tx.labRelease.update({ where: { id: releaseId }, data: { status: nextStatus } });
      await audit(tx, { actor: req.user, action: "lab_release.review", targetType: "LabRelease", targetId: releaseId, reason: b.note, after: { kind: b.kind, decision: b.decision, digest: release.digest, status: nextStatus } });
      return { review, status: nextStatus, missingReviewKinds: missing };
    }, { timeout: 15000 });
  }

  async activate(labId: string, releaseId: string, req: any, body: unknown) {
    const b = z.object({ reason: releaseReason }).strict().parse(body);
    return this.db.$transaction(async (tx) => {
      await tx.$executeRawUnsafe("SELECT pg_advisory_xact_lock(hashtext($1))", "nexalab:lab-release:" + labId);
      await tx.$executeRawUnsafe("SELECT pg_advisory_xact_lock(hashtext($1))", "nexalab:sim-pack-lab:" + labId);
      const release = await tx.labRelease.findFirst({ where: { id: releaseId, labId }, include: { lab: true, reviews: true } });
      if (!release) throw new NotFoundException({ code: "LAB_RELEASE_NOT_FOUND" });
      if (!(release.status === "APPROVED" || release.status === "SUPERSEDED"))
        throw new ConflictException({ code: "LAB_RELEASE_NOT_APPROVED" });
      const snapshot = release.snapshot as any;
      if (digest(snapshot) !== release.digest || missingReviewKinds({ ...snapshot, digest: release.digest }, release.reviews).length)
        throw new ConflictException({ code: "LAB_RELEASE_REVIEWS_MISSING" });
      await assertReviewedBindings(tx, labId, snapshot);
      const execution = snapshot.execution;
      if (await tx.labPackRevocation.findUnique({ where: { packVersionId: execution.packVersionId } }))
        throw new ConflictException({ code: "RUN_REVOKED" });
      const challengeIds = Object.keys(execution.effectiveParams ?? {});
      if (!challengeIds.length) throw new ConflictException({ code: "LAB_TUPLE_INCOMPLETE" });
      for (const challengeId of challengeIds) {
        await resolvePinnedAssignmentLab(tx, {
          labExecution: execution,
          labExecutionDigest: digest(execution),
        }, labId, challengeId);
      }
      if (release.lab.synthetic || release.lab.status === "archived") throw new ConflictException({ code: "LAB_NOT_RELEASE_ELIGIBLE" });
      if (release.status === "APPROVED" && (
        release.lab.title !== snapshot.lab.title || release.lab.subjectId !== snapshot.lab.subjectId ||
        release.lab.grade !== snapshot.lab.grade || release.lab.topic !== snapshot.lab.topic ||
        (release.lab.topicCode !== null && release.lab.topicCode !== snapshot.lab.topicCode) || release.lab.learningObjective !== snapshot.lab.learningObjective
      )) throw new ConflictException({ code: "LAB_RELEASE_STALE" });

      const previous = await tx.labRelease.findFirst({ where: { labId, status: "ACTIVE" } });
      if (previous && previous.id !== release.id)
        await tx.labRelease.update({ where: { id: previous.id }, data: { status: "SUPERSEDED" } });
      const active = await tx.labRelease.update({ where: { id: release.id }, data: { status: "ACTIVE", activatedAt: release.activatedAt ?? new Date(), quarantinedAt: null } });
      await tx.lab.update({ where: { id: labId }, data: {
        title: snapshot.lab.title, subjectId: snapshot.lab.subjectId, grade: snapshot.lab.grade, topic: snapshot.lab.topic,
        topicCode: snapshot.lab.topicCode, learningObjective: snapshot.lab.learningObjective,
        simulationModelRef: execution.modelRef, status: "published", scope: "SHARED_LIBRARY", releaseCleared: true,
      } });
      await audit(tx, { actor: req.user, action: "lab_release.activate", targetType: "LabRelease", targetId: release.id, reason: b.reason, before: { activeReleaseId: previous?.id ?? null }, after: { labId, version: active.version, digest: release.digest, rollback: release.status === "SUPERSEDED" } });
      return active;
    }, { timeout: 15000 });
  }

  async quarantine(labId: string, releaseId: string, req: any, body: unknown) {
    const b = z.object({ reason: releaseReason }).strict().parse(body);
    return this.db.$transaction(async (tx) => {
      await tx.$executeRawUnsafe("SELECT pg_advisory_xact_lock(hashtext($1))", "nexalab:lab-release:" + labId);
      await tx.$executeRawUnsafe("SELECT pg_advisory_xact_lock(hashtext($1))", "nexalab:sim-pack-lab:" + labId);
      const release = await tx.labRelease.findFirst({ where: { id: releaseId, labId }, include: { lab: true } });
      if (!release) throw new NotFoundException({ code: "LAB_RELEASE_NOT_FOUND" });
      if (["DRAFT", "CHANGES_REQUESTED", "QUARANTINED"].includes(release.status)) {
        if (release.status === "QUARANTINED") return release;
        throw new ConflictException({ code: "LAB_RELEASE_NOT_RELEASABLE" });
      }
      const snapshot = release.snapshot as any;
      if (digest(snapshot) !== release.digest) throw new ConflictException({ code: "LAB_RELEASE_INVALID" });
      const packVersionId = snapshot.execution.packVersionId;
      const activeBeforeQuarantine = await tx.labRelease.findFirst({ where: { labId, status: "ACTIVE" } });
      const activeSnapshot = activeBeforeQuarantine?.snapshot as any;
      const activeDependsOnPack = activeBeforeQuarantine?.id === release.id || activeSnapshot?.execution?.packVersionId === packVersionId;
      await tx.labPackRevocation.upsert({
        where: { packVersionId },
        create: { packVersionId, labId, reason: b.reason, revokedById: req.user.sub },
        update: {},
      });
      const quarantined = await tx.labRelease.update({ where: { id: releaseId }, data: { status: "QUARANTINED", quarantinedAt: new Date() } });
      if (activeDependsOnPack && activeBeforeQuarantine) {
        if (activeBeforeQuarantine.id !== release.id) {
          await tx.labRelease.update({ where: { id: activeBeforeQuarantine.id }, data: { status: "QUARANTINED", quarantinedAt: new Date() } });
          await audit(tx, { actor: req.user, action: "lab_release.quarantine_dependency", targetType: "LabRelease", targetId: activeBeforeQuarantine.id, reason: b.reason, before: { status: "ACTIVE" }, after: { status: "QUARANTINED", packVersionId } });
        }
        await tx.lab.update({ where: { id: labId }, data: { releaseCleared: false } });
      }
      await audit(tx, { actor: req.user, action: "lab_release.quarantine", targetType: "LabRelease", targetId: releaseId, reason: b.reason, before: { status: release.status }, after: { status: quarantined.status, packVersionId } });
      return quarantined;
    }, { timeout: 15000 });
  }
}
