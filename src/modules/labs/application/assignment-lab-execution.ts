import { ConflictException } from "@nestjs/common";
import { assignmentExecutionSchema, canonical, digest, rubricRefForActivity } from "./lab-run";
import { resolveModel } from "./sim-packs";
import { packConfigurationErrors, versionParams } from "./simulation-versions";

const lockLabVersions = async (tx: any, labId: string) => {
  await tx.$executeRawUnsafe("SELECT pg_advisory_xact_lock(hashtext($1))", "nexalab:sim-version:" + labId);
  await tx.$executeRawUnsafe("SELECT pg_advisory_xact_lock(hashtext($1))", "nexalab:sim-pack-lab:" + labId);
};

async function currentLabExecutionLocked(tx: any, labId: string) {
  const config = await tx.simulationConfigVersion.findFirst({ where: { labId, status: "active" } });
  const pack = await tx.simulationPackVersion.findFirst({ where: { labId, status: "active" } });
  if (!config || !pack) throw new ConflictException({ code: "LAB_TUPLE_INCOMPLETE", message: "Lab chưa có pack và cấu hình tương thích để giao bài mới" });
  if (await tx.labPackRevocation.findUnique({ where: { packVersionId: pack.id } }))
    throw new ConflictException({ code: "RUN_REVOKED" });
  const activity = await tx.practicalActivityVersion.findUnique({ where: { id: pack.activityVersionId } });
  if (!activity) throw new ConflictException({ code: "LAB_TUPLE_INCOMPLETE" });
  // Freeze every existing base challenge's effective parameters, including
  // legacy challenge defaults omitted by the active config. New challenges
  // cannot silently appear in an already published assignment.
  const challenges: Array<{ id: string; constraints: unknown }> = await tx.challenge.findMany({
    where: { labId }, select: { id: true, constraints: true },
  });
  const baseChallenges = challenges.filter((challenge) => !challenge.id.includes("_v-"));
  const rawParams = config.challengeParams as Record<string, unknown>;
  const ids = Object.keys(rawParams ?? {});
  if (ids.some((id) => !baseChallenges.some((challenge) => challenge.id === id)))
    throw new ConflictException({ code: "LAB_TUPLE_INCOMPATIBLE" });
  const effectiveParams = Object.fromEntries(baseChallenges.map((challenge) => [
    challenge.id, versionParams(config, challenge.id) ?? (challenge.constraints as any)?.params ?? null,
  ]));
  let rubricRef: string;
  try { rubricRef = rubricRefForActivity(activity.key, activity.version, pack.modelRef); }
  catch { throw new ConflictException({ code: "LAB_TUPLE_INCOMPATIBLE", message: "Activity và scientific model không khớp phiên bản" }); }
  const parsed = assignmentExecutionSchema.safeParse({
    labId, modelRef: pack.modelRef, engineVersion: pack.engineVersion, packVersionId: pack.id,
    configVersionId: config.id, activityVersionId: activity.id, activityDigest: activity.digest,
    activityKey: activity.key, activityVersion: activity.version,
    rubricRef,
    stateSchemaVersion: 1, evidenceSchemaVersion: 1, template: pack.template,
    challengeParams: config.challengeParams, effectiveParams,
  });
  if (!parsed.success) throw new ConflictException({ code: "LAB_TUPLE_INCOMPLETE" });
  const checks = Object.values(parsed.data.effectiveParams);
  for (const params of checks.length ? checks : [null]) {
    const errors = packConfigurationErrors(labId, pack, config, params as any);
    if (errors.length) throw new ConflictException({ code: "SIM_PACK_CONFIG_INCOMPATIBLE", message: errors.join("; ") });
  }
  return parsed.data;
}

/** Capture the active technical tuple even when a previous public release is active. */
export async function captureCurrentLabExecution(tx: any, labId: string) {
  await lockLabVersions(tx, labId);
  return currentLabExecutionLocked(tx, labId);
}

/**
 * Called inside assignment publication's transaction. New assignments require
 * a complete compatible tuple. Existing unpinned assignments are never
 * backfilled and continue through the legacy compatibility path.
 */
export async function snapshotAssignmentLab(tx: any, labId: string, releaseId: string, selectedChallengeId: string) {
  await lockLabVersions(tx, labId);
  const activeRelease = await tx.labRelease.findFirst({ where: { id: releaseId, labId, status: "ACTIVE" } });
  if (!activeRelease) throw new ConflictException({ code: "LAB_RELEASE_NOT_ACTIVE" });
  const snapshot = activeRelease.snapshot as any;
  const parsed = assignmentExecutionSchema.safeParse(snapshot?.execution);
  if (!snapshot?.lab || snapshot.lab.id !== labId || digest(snapshot) !== activeRelease.digest || !parsed.success)
    throw new ConflictException({ code: "LAB_RELEASE_INVALID" });
  if (!Object.prototype.hasOwnProperty.call(parsed.data.effectiveParams, selectedChallengeId))
    throw new ConflictException({ code: "ASSIGNMENT_CHALLENGE_NOT_PINNED" });
  if (await tx.labPackRevocation.findUnique({ where: { packVersionId: parsed.data.packVersionId } }))
    throw new ConflictException({ code: "RUN_REVOKED" });
  const pinned = {
    ...parsed.data,
    releaseId: activeRelease.id,
    releaseDigest: activeRelease.digest,
    selectedChallengeId,
  };
  await resolvePinnedAssignmentLab(tx, { labExecution: pinned, labExecutionDigest: digest(pinned) }, labId, selectedChallengeId);
  return pinned;
}
/** Resolve only the immutable publication snapshot; active versions are irrelevant. */
export async function resolvePinnedAssignmentLab(tx: any, assignment: { labExecution: unknown; labExecutionDigest: string | null }, labId: string, challengeId: string) {
  const pin = assignmentExecutionSchema.safeParse(assignment.labExecution);
  if (!pin.success || !assignment.labExecutionDigest || digest(assignment.labExecution) !== assignment.labExecutionDigest || pin.data.labId !== labId)
    throw new ConflictException({ code: "PINNED_EVIDENCE_INVALID" });
  const snapshot = pin.data;
  if (snapshot.selectedChallengeId && snapshot.selectedChallengeId !== challengeId)
    throw new ConflictException({ code: "ASSIGNMENT_CHALLENGE_NOT_PINNED" });
  if (snapshot.releaseId) {
    const release = await tx.labRelease.findUnique({ where: { id: snapshot.releaseId } });
    const releaseSnapshot = release?.snapshot as any;
    const releasedExecution = assignmentExecutionSchema.safeParse(releaseSnapshot?.execution);
    if (!release || release.labId !== labId || release.digest !== snapshot.releaseDigest ||
        digest(releaseSnapshot) !== release.digest || !releaseSnapshot?.lab || releaseSnapshot.lab.id !== labId ||
        !releasedExecution.success || release.status === "QUARANTINED" || release.status === "DRAFT" || release.status === "APPROVED")
      throw new ConflictException({ code: release?.status === "QUARANTINED" ? "RUN_REVOKED" : "LAB_RELEASE_INVALID" });
    if (releasedExecution.data.packVersionId !== snapshot.packVersionId ||
        releasedExecution.data.configVersionId !== snapshot.configVersionId ||
        releasedExecution.data.activityVersionId !== snapshot.activityVersionId ||
        releasedExecution.data.modelRef !== snapshot.modelRef ||
        releasedExecution.data.engineVersion !== snapshot.engineVersion ||
        canonical(releasedExecution.data.effectiveParams) !== canonical(snapshot.effectiveParams))
      throw new ConflictException({ code: "LAB_RELEASE_INVALID" });
  }
  const [config, pack, activity] = await Promise.all([
    tx.simulationConfigVersion.findUnique({ where: { id: snapshot.configVersionId } }),
    tx.simulationPackVersion.findUnique({ where: { id: snapshot.packVersionId } }),
    tx.practicalActivityVersion.findUnique({ where: { id: snapshot.activityVersionId } }),
  ]);
  if (!config || !pack || !activity) throw new ConflictException({ code: "PINNED_VERSION_MISSING" });
  if (config.labId !== labId || pack.labId !== labId || config.modelRef !== snapshot.modelRef ||
      pack.modelRef !== snapshot.modelRef || pack.engineVersion !== snapshot.engineVersion ||
      pack.activityVersionId !== snapshot.activityVersionId || activity.digest !== snapshot.activityDigest ||
      activity.key !== snapshot.activityKey || activity.version !== snapshot.activityVersion ||
      canonical(config.challengeParams) !== canonical(snapshot.challengeParams) ||
      canonical(pack.template) !== canonical(snapshot.template))
    throw new ConflictException({ code: "PINNED_EVIDENCE_INVALID" });
  if (!Object.prototype.hasOwnProperty.call(snapshot.effectiveParams, challengeId))
    throw new ConflictException({ code: "ASSIGNMENT_CHALLENGE_NOT_PINNED" });
  let model: ReturnType<typeof resolveModel>;
  try { model = resolveModel(snapshot.modelRef); }
  catch { throw new ConflictException({ code: "PINNED_MODEL_UNAVAILABLE" }); }
  if (model.labId !== labId || model.engineVersion !== snapshot.engineVersion)
    throw new ConflictException({ code: "PINNED_MODEL_UNAVAILABLE" });
  const { labId: _pinnedLab, challengeParams: _allParams, effectiveParams: _effective, ...components } = snapshot;
  return { ...components, params: snapshot.effectiveParams[challengeId], binding: "ASSIGNMENT_PINNED" as const };
}

/** Resolve the current public release's immutable tuple for one open-curriculum launch. */
export async function resolveFoundationalLabRelease(tx: any, release: any, labId: string, challengeId: string) {
  const snapshot = release.snapshot as any;
  const execution = snapshot?.execution;
  if (!snapshot?.lab || snapshot.lab.id !== labId || digest(snapshot) !== release.digest || !execution)
    throw new ConflictException({ code: "LAB_RELEASE_INVALID" });
  const resolved = await resolvePinnedAssignmentLab(
    tx,
    { labExecution: execution, labExecutionDigest: digest(execution) },
    labId,
    challengeId,
  );
  return { ...resolved, binding: "FOUNDATIONAL_RELEASE" as const, releaseId: release.id };
}
