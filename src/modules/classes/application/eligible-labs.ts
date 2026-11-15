import { digest as labExecutionDigest } from "../../labs/application/lab-run";

/**
 * Shared Labs that may be assigned or pinned into an EXAM (shared from `AssignmentsService.assignableContent`
 * so the editor's Lab list and the AI draft (TAI7-T5) use one rule): published, shared-library, release-cleared, not
 * synthetic, with a topic and an ACTIVE release whose stored snapshot still matches its digest, whose simulation pack is
 * not revoked, and that offers at least one challenge. `lessons` only maps each Lab to the lessons that point at it.
 */
export async function eligibleLabs(db: any, lessons: Array<{ id: string; labId: string | null }>, grade?: number) {
  const labs = await db.lab.findMany({
    where: {
      status: "published", scope: "SHARED_LIBRARY", releaseCleared: true, synthetic: false,
      grade, topicCode: { not: null }, releases: { some: { status: "ACTIVE" } },
    },
    select: {
      id: true,
      title: true,
      grade: true,
      topic: true,
      topicCode: true,
      subject: { select: { id: true, name: true } },
      challenges: { where: { NOT: { id: { contains: "_v-" } } }, select: { id: true, objective: true }, orderBy: { id: "asc" } },
      releases: { where: { status: "ACTIVE" }, select: { id: true, version: true, digest: true, snapshot: true }, take: 1 },
    },
    orderBy: { title: "asc" },
  });
  const releaseRows = labs.flatMap((lab: any) => {
    const release = lab.releases?.[0];
    const snapshot = release?.snapshot as any;
    const execution = snapshot?.execution;
    const challengeIds = execution && typeof execution.effectiveParams === "object" ? Object.keys(execution.effectiveParams) : [];
    if (!release || !snapshot?.lab || snapshot.lab.id !== lab.id || labExecutionDigest(snapshot) !== release.digest || !challengeIds.length)
      return [];
    return [{ lab, release, challengeIds }];
  });
  const revokedIds = releaseRows.length ? new Set((await db.labPackRevocation.findMany({
    where: { packVersionId: { in: releaseRows.map(({ release }: any) => (release.snapshot as any).execution.packVersionId) } },
    select: { packVersionId: true },
  })).map((entry: any) => entry.packVersionId)) : new Set<string>();
  return releaseRows.flatMap(({ lab, release, challengeIds }: any) => {
    const execution = (release.snapshot as any).execution;
    if (revokedIds.has(execution.packVersionId)) return [];
    return [{
      id: lab.id, title: lab.title, grade: lab.grade, topic: lab.topic, topicCode: lab.topicCode, subject: lab.subject,
      release: { id: release.id, version: release.version, digest: release.digest },
      ranges: (execution.template as any)?.ranges ?? {},
      previewConfig: (execution.template as any)?.buoyancy ?? null,
      effectiveParams: execution.effectiveParams,
      lessonIds: lessons.filter((lesson) => lesson.labId === lab.id).map((lesson) => lesson.id),
      challenges: lab.challenges.filter((challenge: any) => challengeIds.includes(challenge.id)),
    }].filter((entry: any) => entry.challenges.length > 0);
  });
}

export type EligibleLab = Awaited<ReturnType<typeof eligibleLabs>>[number];
