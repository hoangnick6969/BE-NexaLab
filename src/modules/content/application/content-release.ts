import { z } from "zod";
import { materializeLegacySteps } from "../../lessons/application/pathway";
import { audit } from "../../../common/audit";
import { storageEnv } from "../../storage/infrastructure/storage";
import { sourcePolicySchema } from "./ingestion";
import { GateContext, PackManifest, digestOf, lessonFromPack, packGateErrors, packManifestSchema } from "./content-pack";

/**
 * Content Release Importer (CF-T3). The only path for baseline content and
 * source policies into an environment: dry-run plan with exact changes,
 * approved apply in one transaction with a receipt, idempotent reruns, and
 * retire that restores the previous pack versions. Fixtures never reach
 * pilot/production.
 */
export const IMPORTER_VERSION = "content-release@1";
export const releaseManifestSchema = z
  .object({
    name: z.string().trim().min(3).max(120),
    namespace: z.enum(["fixture", "baseline"]),
    sources: z
      .array(
        z
          .object({
            key: z.string().regex(/^[a-z0-9][a-z0-9-]{1,59}$/),
            title: z.string().trim().min(3).max(200),
            policy: sourcePolicySchema,
          })
          .strict(),
      )
      .max(50)
      .default([]),
    packs: z.array(packManifestSchema).max(200).default([]),
  })
  .strict();
export type ReleaseManifest = z.infer<typeof releaseManifestSchema>;

async function gateContext(db: any, namespace: "fixture" | "baseline"): Promise<GateContext> {
  const [outcomes, versions, reviewers, labs] = await Promise.all([
    db.curriculumOutcome.findMany(),
    db.assetVersion.findMany({ where: { status: "READY" }, include: { asset: true } }),
    db.user.findMany({ where: { status: "active", role: { in: ["TEACHER", "ADMIN"] }, email: { not: null } }, select: { email: true } }),
    db.lab.findMany({ where: { status: "published" }, select: { id: true } }),
  ]);
  return {
    namespace,
    outcomes: new Map(outcomes.map((o: any) => [o.code, o])),
    assetVersions: new Map(
      versions.map((v: any) => [v.id, { kind: v.asset.kind, scope: v.asset.scope, assetStatus: v.asset.status, status: v.status }]),
    ),
    reviewers: new Set(reviewers.map((u: any) => u.email)),
    labs: new Set(labs.map((l: any) => l.id)),
  };
}

export async function planRelease(db: any, raw: unknown, target: string) {
  const manifest = releaseManifestSchema.parse(raw);
  const digest = digestOf(manifest);
  const environment = storageEnv();
  const blockers: string[] = [];
  if (target !== environment) blockers.push(`đích ${target} khác môi trường đang chạy ${environment}`);
  if (manifest.namespace === "fixture" && ["pilot", "production"].includes(target))
    blockers.push("gói minh họa (fixture) không được đưa vào pilot/production");
  const existing = await db.contentRelease.findUnique({ where: { environment_digest: { environment, digest } } });
  const sources = [];
  for (const s of manifest.sources) {
    const current = await db.sourcePolicy.findUnique({
      where: { key: s.key },
      include: { versions: { orderBy: { version: "desc" }, take: 1 } },
    });
    const same = current && digestOf(current.versions[0]?.policy) === digestOf(s.policy);
    sources.push({
      key: s.key,
      action: !current ? "create" : same ? "unchanged" : "new-version",
      version: !current ? 1 : same ? current.currentVersion : current.currentVersion + 1,
    });
  }
  const ctx = await gateContext(db, manifest.namespace);
  const packs = [];
  for (const m of manifest.packs) {
    const packDigest = digestOf(m);
    const errors = packGateErrors(m, ctx);
    const pack = await db.contentPack.findUnique({ where: { key: m.key }, include: { versions: { orderBy: { version: "desc" } } } });
    if (pack && pack.namespace !== manifest.namespace) errors.push(`gói ${m.key} thuộc namespace ${pack.namespace}`);
    const same = pack?.versions.find((v: any) => v.digest === packDigest);
    const released = pack?.versions.find((v: any) => v.status === "released");
    packs.push({
      key: m.key,
      digest: packDigest,
      action: same ? (same.status === "released" ? "unchanged" : "re-release") : "new-version",
      version: same ? same.version : (pack?.versions[0]?.version ?? 0) + 1,
      supersedes: !same || same.status !== "released" ? (released?.version ?? null) : null,
      errors,
    });
  }
  const blocked = blockers.length > 0 || packs.some((p) => p.errors.length > 0);
  return {
    name: manifest.name,
    namespace: manifest.namespace,
    environment,
    target,
    digest,
    alreadyApplied: existing?.status === "APPLIED" ? existing.id : null,
    blockers,
    blocked,
    sources,
    packs,
  };
}

const lessonIdFor = (key: string, version: number) => `pack-${key}-v${version}`;
async function materialize(
  tx: any,
  m: PackManifest,
  version: number,
  packVersionId: string,
  authorId: string,
  reviewerIds: Record<string, string>,
) {
  const lessonId = lessonIdFor(m.key, version);
  const body = lessonFromPack(m);
  const releasable = m.sources.filter((s) => s.license !== "REFERENCE_ONLY");
  await tx.lesson.create({
    data: {
      id: lessonId,
      subjectId: m.subjectId,
      authorId,
      title: m.title,
      chapter: m.chapter,
      grade: m.grade,
      topic: m.topic,
      learningObjective: m.lesson.learningObjective,
      prerequisites: m.lesson.prerequisites,
      curriculum: "GDPT 2018 – Khoa học tự nhiên",
      content: body.content,
      labId: body.labId,
      status: "published",
      scope: "SHARED_LIBRARY",
      synthetic: m.synthetic,
      domain: m.domain,
      outcomeCodes: m.outcomeCodes,
      materials: body.materials,
      questions: body.questions,
      packVersionId,
      review: {
        sources: m.sources.map((s) => s.attribution).join("; "),
        license: ["CC0", "CC_BY", "CC_BY_SA", "SCHOOL_OWNED"].includes(releasable[0]?.license ?? "") ? releasable[0].license : "ORIGINAL",
      },
      releaseReview: Object.fromEntries(
        Object.entries(m.reviews).map(([kind, r]) => [kind, { reviewerId: reviewerIds[r!.email] ?? r!.email, at: r!.at, note: r!.name }]),
      ),
      publishedAt: new Date(),
    },
  });
  const steps = materializeLegacySteps(body as any, lessonId);
  for (const step of steps)
    await tx.lessonStep.create({
      data: { ...step, id: `step-${lessonId}-${step.type.toLowerCase().replace("_", "-")}`, lessonId, config: step.config as any },
    });
  return lessonId;
}

export async function applyRelease(db: any, raw: unknown, options: { target: string; initiatedById: string; approvedByEmail: string }) {
  const plan = await planRelease(db, raw, options.target);
  if (plan.blocked) throw Object.assign(new Error("RELEASE_BLOCKED"), { plan });
  if (plan.alreadyApplied)
    return {
      receipt: await db.contentRelease.findUnique({ where: { id: plan.alreadyApplied }, include: { items: true } }),
      plan,
      idempotent: true,
    };
  const manifest = releaseManifestSchema.parse(raw);
  const approver = await db.user.findUnique({ where: { email: options.approvedByEmail.toLowerCase() } });
  if (!approver || approver.role !== "ADMIN" || approver.status !== "active") throw new Error("APPROVER_NOT_ACTIVE_ADMIN");
  if (manifest.namespace === "baseline" && approver.id === options.initiatedById) throw new Error("APPROVER_MUST_DIFFER_FROM_INITIATOR");
  const reviewerIds = Object.fromEntries(
    (
      await db.user.findMany({
        where: { email: { in: manifest.packs.flatMap((p) => Object.values(p.reviews).map((r) => r!.email)) } },
        select: { id: true, email: true },
      })
    ).map((u: any) => [u.email, u.id]),
  );
  const receipt = await db.$transaction(
    async (tx: any) => {
      const release = await tx.contentRelease.create({
        data: {
          environment: plan.environment,
          name: manifest.name,
          digest: plan.digest,
          importerVersion: IMPORTER_VERSION,
          status: "APPLIED",
          initiatedById: options.initiatedById,
          approvedById: approver.id,
          summary: { sources: plan.sources, packs: plan.packs.map(({ errors: _e, ...p }) => p) },
        },
      });
      const item = (kind: string, refId: string, action: string) =>
        tx.contentReleaseItem.create({ data: { releaseId: release.id, kind, refId, action } });
      for (const [i, s] of manifest.sources.entries()) {
        const step = plan.sources[i];
        if (step.action === "create")
          await tx.sourcePolicy.create({ data: { key: s.key, title: s.title, enabled: false, currentVersion: 1 } });
        if (step.action !== "unchanged") {
          await tx.sourcePolicy.update({ where: { key: s.key }, data: { title: s.title, currentVersion: step.version } });
          const v = await tx.sourcePolicyVersion.create({
            data: { key: s.key, version: step.version, policy: s.policy, reason: `release ${manifest.name}`, createdById: approver.id },
          });
          await item("source-policy", v.id, "created");
        } else await item("source-policy", s.key, "unchanged");
      }
      for (const [i, m] of manifest.packs.entries()) {
        const step = plan.packs[i];
        if (step.action === "unchanged") {
          await item("pack-version", `${m.key}@${step.version}`, "unchanged");
          continue;
        }
        await tx.contentPack.upsert({
          where: { key: m.key },
          create: { key: m.key, grade: m.grade, domain: m.domain, title: m.title, namespace: manifest.namespace },
          update: { title: m.title },
        });
        const previous = await tx.contentPackVersion.findFirst({ where: { packKey: m.key, status: "released" } });
        if (previous) {
          await tx.contentPackVersion.update({ where: { id: previous.id }, data: { status: "retired", retiredAt: new Date() } });
          if (previous.lessonId) await tx.lesson.update({ where: { id: previous.lessonId }, data: { status: "archived" } });
          await item("pack-version", previous.id, "superseded");
        }
        let version = await tx.contentPackVersion.findUnique({ where: { packKey_digest: { packKey: m.key, digest: step.digest } } });
        if (version) {
          version = await tx.contentPackVersion.update({
            where: { id: version.id },
            data: { status: "released", retiredAt: null, releasedAt: new Date(), releaseId: release.id },
          });
          if (version.lessonId) await tx.lesson.update({ where: { id: version.lessonId }, data: { status: "published" } });
        } else {
          version = await tx.contentPackVersion.create({
            data: {
              packKey: m.key,
              version: step.version,
              digest: step.digest,
              manifest: m as any,
              status: "released",
              synthetic: m.synthetic,
              outcomeCodes: m.outcomeCodes,
              releaseId: release.id,
              releasedAt: new Date(),
            },
          });
          const lessonId = await materialize(tx, m, step.version, version.id, approver.id, reviewerIds);
          await tx.contentPackVersion.update({ where: { id: version.id }, data: { lessonId } });
          await item("lesson", lessonId, "created");
        }
        await item("pack-version", version.id, "created");
      }
      await audit(tx, {
        actor: { sub: approver.id, role: "ADMIN" },
        action: "content.release.apply",
        targetType: "ContentRelease",
        targetId: release.id,
        reason: manifest.name,
        after: { status: "APPLIED", references: manifest.packs.length },
      });
      return tx.contentRelease.findUnique({ where: { id: release.id }, include: { items: true } });
    },
    { timeout: 60000 },
  );
  return { receipt, plan, idempotent: false };
}

/** Retire a release: its pack versions retire (lessons archived, evidence kept) and the versions it superseded return. */
export async function retireRelease(db: any, releaseId: string, actor: { sub: string }, reason: string) {
  return db.$transaction(async (tx: any) => {
    const release = await tx.contentRelease.findUnique({ where: { id: releaseId }, include: { items: true } });
    if (!release) throw new Error("RELEASE_NOT_FOUND");
    if (release.status !== "APPLIED") throw new Error("RELEASE_NOT_APPLIED");
    const created = release.items.filter((i: any) => i.kind === "pack-version" && i.action === "created").map((i: any) => i.refId);
    const superseded = release.items.filter((i: any) => i.kind === "pack-version" && i.action === "superseded").map((i: any) => i.refId);
    for (const id of created) {
      const v = await tx.contentPackVersion.update({ where: { id }, data: { status: "retired", retiredAt: new Date() } });
      if (v.lessonId) await tx.lesson.update({ where: { id: v.lessonId }, data: { status: "archived" } });
    }
    for (const id of superseded) {
      const v = await tx.contentPackVersion.update({ where: { id }, data: { status: "released", retiredAt: null } });
      if (v.lessonId) await tx.lesson.update({ where: { id: v.lessonId }, data: { status: "published" } });
    }
    const retired = await tx.contentRelease.update({ where: { id: releaseId }, data: { status: "RETIRED", retiredAt: new Date() } });
    await audit(tx, {
      actor: { sub: actor.sub, role: "ADMIN" },
      action: "content.release.retire",
      targetType: "ContentRelease",
      targetId: releaseId,
      reason,
      before: { status: "APPLIED" },
      after: { status: "RETIRED", references: created.length },
    });
    return { release: retired, retiredVersions: created.length, restoredVersions: superseded.length };
  });
}
