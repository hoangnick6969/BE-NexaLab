import { BadRequestException, ConflictException, ForbiddenException } from "@nestjs/common";
import { resolvePinnedAssignmentLab, snapshotAssignmentLab } from "../../labs/application/assignment-lab-execution";
import { digest } from "../../labs/application/lab-run";
import { packConfigurationErrors } from "../../labs/application/simulation-versions";
import { mediaTypeFor } from "../../assets/application/media";
import { classLabSnapshot, labResourceContentSchema, labResourceInputSchema, verifyClassLabSnapshot } from "./class-resource-contract";

const denied = () => new ForbiddenException({ code: "CLASS_RESOURCE_ACCESS_DENIED" });

export function validatedCustomParams(labId: string, pack: any, config: any, base: Record<string, number | string> | null, custom: Record<string, number>) {
  const ranges = (pack?.template as any)?.ranges ?? {};
  const params = { ...(base ?? {}), ...custom };
  if (Object.keys(custom).some((key) => !Object.prototype.hasOwnProperty.call(ranges, key)) ||
      !pack || !config || packConfigurationErrors(labId, pack, config, params).length)
    throw new BadRequestException({ code: "PARAM_OUT_OF_APPROVED_RANGE" });
  return params;
}

export async function buildLabResource(db: any, raw: unknown) {
  const input = labResourceInputSchema.parse(raw);
  const lab = await db.lab.findFirst({ where: { id: input.source.labId, status: "published", scope: "SHARED_LIBRARY", releaseCleared: true, synthetic: false, topicCode: { not: null } } });
  if (!lab) throw new ConflictException({ code: "LAB_SOURCE_NOT_ELIGIBLE" });
  let execution = await snapshotAssignmentLab(db, input.source.labId, input.source.releaseId, input.source.challengeId);
  if (input.customParams && Object.keys(input.customParams).length) {
    const pack = await db.simulationPackVersion.findUnique({ where: { id: execution.packVersionId } });
    const config = await db.simulationConfigVersion.findUnique({ where: { id: execution.configVersionId } });
    const base = execution.effectiveParams[input.source.challengeId] ?? {};
    const params = validatedCustomParams(input.source.labId, pack, config, base, input.customParams);
    execution = { ...execution, customParams: input.customParams, effectiveParams: { ...execution.effectiveParams,
      [input.source.challengeId]: params } };
  }
  return { ...input, execution, executionDigest: digest(execution) };
}

export async function validateResourceAttachment(db: any, content: any, ownerId: string) {
  if (content.source?.type !== "upload") return;
  const version = await db.assetVersion.findUnique({ where: { id: content.source.assetVersionId }, include: { asset: true } });
  const type = version && mediaTypeFor(version.fileName, version.mime);
  if (!version || version.status !== "READY" || version.asset.status !== "ACTIVE" || version.asset.ownerId !== ownerId || !type || !["pdf", "image", "video"].includes(type.kind)) throw denied();
}

export async function resolveClassLabResource(db: any, resourceId: string, studentId?: string, classId?: string) {
  const resource = await db.classResource.findFirst({ where: { id: resourceId, kind: "LAB", status: "PUBLISHED", ...(classId ? { classId } : {}), classroom: { status: "ACTIVE", ...(studentId ? { enrollments: { some: { studentId, status: "approved" } } } : {}) } } });
  if (!resource) throw denied();
  const content = labResourceContentSchema.parse(resource.content);
  if (content.execution.releaseId !== content.source.releaseId || content.execution.selectedChallengeId !== content.source.challengeId) throw new ConflictException({ code: "CLASS_LAB_SOURCE_MISMATCH" });
  const execution = await resolvePinnedAssignmentLab(db, { labExecution: content.execution, labExecutionDigest: content.executionDigest }, content.source.labId, content.source.challengeId);
  if (await db.labPackRevocation.findUnique({ where: { packVersionId: execution.packVersionId } })) throw new ConflictException({ code: "RUN_REVOKED" });
  return { resource, content, execution, snapshot: classLabSnapshot(resource) };
}

export async function assertClassPracticeRun(db: any, run: any, studentId: string) {
  if (run.context !== "CLASS_PRACTICE" || !run.resourceId || run.assignmentId || run.studentId !== studentId) throw denied();
  if (run.revokedAt || !run.expiresAt || run.expiresAt.getTime() <= Date.now()) throw new ConflictException({ code: run.revokedAt ? "RUN_REVOKED" : "RUN_EXPIRED" });
  const resolved = await resolveClassLabResource(db, run.resourceId, studentId);
  const snapshot = verifyClassLabSnapshot(run.classLabSnapshot);
  if (snapshot.contentDigest !== resolved.snapshot.contentDigest || snapshot.source.labId !== run.labId || snapshot.source.challengeId !== run.challengeId) throw denied();
  return resolved;
}

export async function assertAssignedClassLab(db: any, run: any, assignment: any) {
  if (!assignment.classLabSnapshot) return;
  const snapshot = verifyClassLabSnapshot(assignment.classLabSnapshot);
  const runSnapshot = verifyClassLabSnapshot(run.classLabSnapshot);
  const execution = await resolvePinnedAssignmentLab(db, assignment, run.labId, run.challengeId);
  if (run.context !== "ASSIGNMENT" || run.resourceId || runSnapshot.contentDigest !== snapshot.contentDigest || snapshot.source.labId !== run.labId || snapshot.source.challengeId !== run.challengeId || snapshot.source.releaseId !== execution.releaseId) throw denied();
}
