import { z } from "zod";
import { materializeLegacySteps } from "../../lessons/application/pathway";
import { khtn9Curriculum, normalizeLessonHtml } from "./lesson-html";
import { audit } from "../../../common/audit";
import { storageEnv } from "../../storage/infrastructure/storage";
import { sourcePolicySchema } from "./ingestion";
import { GateContext, PackManifest, digestOf, lessonFromPack, packGateErrors, packManifestSchema } from "./content-pack";
import { structuredLessonSchema } from "./structured-lesson-import";

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
    db.assetVersion.findMany({
      where: { status: "READY" },
      include: { asset: true },
    }),
    db.user.findMany({
      where: {
        status: "active",
        role: { in: ["TEACHER", "ADMIN"] },
        email: { not: null },
      },
      select: { email: true },
    }),
    db.lab.findMany({ where: { status: "published" }, select: { id: true } }),
  ]);
  return {
    namespace,
    outcomes: new Map(outcomes.map((o: any) => [o.code, o])),
    assetVersions: new Map(
      versions.map((v: any) => [
        v.id,
        {
          kind: v.asset.kind,
          scope: v.asset.scope,
          assetStatus: v.asset.status,
          status: v.status,
        },
      ]),
    ),
    reviewers: new Set(reviewers.map((u: any) => u.email)),
    labs: new Set(labs.map((l: any) => l.id)),
  };
}

export async function planRelease(db: any, raw: unknown, target: string, options: { devSeed?: boolean } = {}) {
  const manifest = releaseManifestSchema.parse(raw);
  const digest = digestOf(manifest);
  const environment = storageEnv();
  const blockers: string[] = [];
  if (target !== environment) blockers.push(`đích ${target} khác môi trường đang chạy ${environment}`);
  if (manifest.namespace === "fixture" && ["pilot", "production"].includes(target)) blockers.push("gói minh họa (fixture) không được đưa vào pilot/production");
  const existing = await db.contentRelease.findUnique({
    where: { environment_digest: { environment, digest } },
  });
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
    const errors = packGateErrors(m, ctx, options);
    const pack = await db.contentPack.findUnique({
      where: { key: m.key },
      include: { versions: { orderBy: { version: "desc" } } },
    });
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
async function materialize(tx: any, m: PackManifest, version: number, packVersionId: string, authorId: string, reviewerIds: Record<string, string>, existingLessonId?: string | null) {
  const lessonId = existingLessonId ?? lessonIdFor(m.key, version);
  const body = lessonFromPack(m);
  const releasable = m.sources.filter((s) => s.license !== "REFERENCE_ONLY");
  const lessonData = {
    subjectId: m.subjectId,
    authorId,
    title: m.title,
    chapter: m.chapter,
    grade: m.grade,
    topic: m.topic,
    learningObjective: m.lesson.learningObjective,
    prerequisites: m.lesson.prerequisites,
    curriculum: "GDPT 2018 – Khoa học tự nhiên",
    content: normalizeLessonHtml(body.content),
    ...khtn9Curriculum(m.key),
    labId: body.labId,
    status: "published",
    scope: "SHARED_LIBRARY",
    synthetic: m.synthetic,
    domain: m.domain,
    outcomeCodes: m.outcomeCodes,
    materials: body.materials,
    videos: body.videos,
    sections: body.sections,
    questions: body.questions,
    packVersionId,
    review: {
      sources: m.sources.map((s) => s.attribution).join("; "),
      license: ["CC0", "CC_BY", "CC_BY_SA", "SCHOOL_OWNED"].includes(releasable[0]?.license ?? "") ? releasable[0].license : "ORIGINAL",
    },
    releaseReview: Object.fromEntries(
      Object.entries(m.reviews).map(([kind, r]) => [
        kind,
        {
          reviewerId: reviewerIds[r!.email] ?? r!.email,
          at: r!.at,
          note: r!.name,
        },
      ]),
    ),
    publishedAt: new Date(),
  };
  if (existingLessonId) await tx.lesson.update({ where: { id: lessonId }, data: lessonData });
  else await tx.lesson.create({ data: { id: lessonId, ...lessonData } });
  const steps = materializeLegacySteps(body as any, lessonId);
  const existingSteps = existingLessonId ? await tx.lessonStep.findMany({ where: { lessonId } }) : [];
  for (const step of steps) {
    const prior = existingSteps.find((item: any) => item.type === step.type);
    if (prior)
      await tx.lessonStep.update({
        where: { id: prior.id },
        data: {
          position: step.position,
          required: step.required,
          config: step.config as any,
        },
      });
    else
      await tx.lessonStep.create({
        data: {
          ...step,
          id: `step-${lessonId}-${step.id ?? step.type.toLowerCase().replace("_", "-")}`,
          lessonId,
          config: step.config as any,
        },
      });
  }
  return lessonId;
}

export async function applyRelease(db: any, raw: unknown, options: { target: string; initiatedById: string; approvedByEmail: string; devSeed?: boolean }) {
  if (options.devSeed && process.env.APP_ENV !== "development") throw new Error("DEV_SEED_REQUIRES_DEVELOPMENT");
  const plan = await planRelease(db, raw, options.target, { devSeed: options.devSeed });
  if (plan.blocked) throw Object.assign(new Error("RELEASE_BLOCKED"), { plan });
  if (plan.alreadyApplied)
    return {
      receipt: await db.contentRelease.findUnique({
        where: { id: plan.alreadyApplied },
        include: { items: true },
      }),
      plan,
      idempotent: true,
    };
  const manifest = releaseManifestSchema.parse(raw);
  const approver = await db.user.findUnique({
    where: { email: options.approvedByEmail.toLowerCase() },
  });
  if (!approver || approver.role !== "ADMIN" || approver.status !== "active") throw new Error("APPROVER_NOT_ACTIVE_ADMIN");
  if (manifest.namespace === "baseline" && approver.id === options.initiatedById) throw new Error("APPROVER_MUST_DIFFER_FROM_INITIATOR");
  const reviewerIds = Object.fromEntries(
    (
      await db.user.findMany({
        where: {
          email: {
            in: manifest.packs.flatMap((p) => Object.values(p.reviews).map((r) => r!.email)),
          },
        },
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
          summary: {
            sources: plan.sources,
            packs: plan.packs.map(({ errors: _e, ...p }) => p),
          },
        },
      });
      const item = (kind: string, refId: string, action: string) =>
        tx.contentReleaseItem.create({
          data: { releaseId: release.id, kind, refId, action },
        });
      for (const [i, s] of manifest.sources.entries()) {
        const step = plan.sources[i];
        if (step.action === "create")
          await tx.sourcePolicy.create({
            data: {
              key: s.key,
              title: s.title,
              enabled: false,
              currentVersion: 1,
            },
          });
        if (step.action !== "unchanged") {
          await tx.sourcePolicy.update({
            where: { key: s.key },
            data: { title: s.title, currentVersion: step.version },
          });
          const v = await tx.sourcePolicyVersion.create({
            data: {
              key: s.key,
              version: step.version,
              policy: s.policy,
              reason: `release ${manifest.name}`,
              createdById: approver.id,
            },
          });
          await item("source-policy", v.id, "created");
        } else await item("source-policy", s.key, "unchanged");
      }
      for (const [i, m] of manifest.packs.entries()) {
        const step = plan.packs[i];
        if (step.action === "unchanged" && !options.devSeed) {
          await item("pack-version", `${m.key}@${step.version}`, "unchanged");
          continue;
        }
        await tx.contentPack.upsert({
          where: { key: m.key },
          create: {
            key: m.key,
            subjectId: m.subjectId,
            grade: m.grade,
            domain: m.domain,
            title: m.title,
            namespace: manifest.namespace,
          },
          update: { title: m.title, subjectId: m.subjectId },
        });
        const previous = await tx.contentPackVersion.findFirst({
          where: { packKey: m.key, status: "released" },
        });
        if (previous) {
          await tx.contentPackVersion.update({
            where: { id: previous.id },
            data: { status: "retired", retiredAt: new Date() },
          });
          if (previous.lessonId)
            await tx.lesson.update({
              where: { id: previous.lessonId },
              data: { status: "archived" },
            });
          await item("pack-version", previous.id, "superseded");
        }
        let version = await tx.contentPackVersion.findUnique({
          where: { packKey_digest: { packKey: m.key, digest: step.digest } },
        });
        if (version) {
          version = await tx.contentPackVersion.update({
            where: { id: version.id },
            data: {
              status: "released",
              retiredAt: null,
              releasedAt: new Date(),
              releaseId: release.id,
            },
          });
          if (version.lessonId)
            await materialize(tx, m, step.version, version.id, approver.id, reviewerIds, version.lessonId);
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
          const lessonId = await materialize(tx, m, step.version, version.id, approver.id, reviewerIds, previous?.lessonId);
          await tx.contentPackVersion.update({
            where: { id: version.id },
            data: { lessonId },
          });
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
      return tx.contentRelease.findUnique({
        where: { id: release.id },
        include: { items: true },
      });
    },
    { timeout: 60000 },
  );
  return { receipt, plan, idempotent: false };
}

/** ADMIN_DIRECT is the development publishing policy for source-grounded Structured Lesson drafts.
 * It keeps the normal release receipt, transaction, audit log and retry semantics while leaving
 * curriculum outcomes and independent review decisions outside this publishing operation.
 */
const adminDirectRequestSchema = z
  .object({
    policy: z.literal("ADMIN_DIRECT"),
    name: z.string().trim().min(3).max(120),
    subjectId: z.string().trim().min(1).max(60),
    draftIds: z.array(z.string().trim().min(1).max(40)).min(1).max(47),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (new Set(value.draftIds).size !== value.draftIds.length)
      ctx.addIssue({
        code: "custom",
        path: ["draftIds"],
        message: "Bản nháp bị lặp",
      });
  });

const directLessonId = (packKey: string, version: number) => lessonIdFor(packKey, version);
const pageNumber = (value: unknown) => {
  if (!value || typeof value !== "object") return Number.MAX_SAFE_INTEGER;
  const start = Number((value as any).start);
  return Number.isFinite(start) && start > 0 ? start : Number.MAX_SAFE_INTEGER;
};
const escapeHtml = (value: unknown) => String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const sourceLabel = (sourceIds: unknown, pages: Map<string, number>) => {
  if (!Array.isArray(sourceIds) || !sourceIds.length) return "";
  const ids = sourceIds.filter((id): id is string => typeof id === "string");
  if (!ids.length) return "";
  const pageLabels = [...new Set(ids.map((id) => pages.get(id)).filter((page): page is number => Number.isFinite(page)))].sort((a, b) => a - b);
  return `<small class="lesson-source-note">Nguồn: ${pageLabels.length ? `trang PDF ${pageLabels.join(", ")} · ` : ""}${ids.map(escapeHtml).join(", ")}</small>`;
};

/** Render only source-backed Structured Lesson fields. The original JSON stays on the version row. */
function structuredLessonHtml(lesson: z.infer<typeof structuredLessonSchema>) {
  const content: any = lesson.learningContent;
  const blockPages = new Map<string, number>();
  for (const block of lesson.sourceBlocks as any[]) {
    if (typeof block?.id === "string") {
      const page = Number(block.pdfPage ?? block.page ?? block.pageNumber);
      if (Number.isFinite(page)) blockPages.set(block.id, page);
    }
  }
  const parts = [`<p>${escapeHtml(content.summary)}</p>`];
  for (const section of content.sections as any[]) {
    const heading = typeof section?.heading === "string" ? section.heading : "";
    const text = typeof section?.content === "string" ? section.content : "";
    parts.push(`<section>${heading ? `<h2>${escapeHtml(heading)}</h2>` : ""}${text ? `<p>${escapeHtml(text).replace(/\\n/g, "<br>")}</p>` : ""}${sourceLabel(section?.sourceBlockIds, blockPages)}</section>`);
  }
  for (const unit of content.knowledgeUnits as any[]) {
    const claims = Array.isArray(unit?.claims) ? unit.claims : [];
    parts.push(`<section><h2>${escapeHtml(unit?.title || "Đơn vị kiến thức")}</h2>${claims.map((claim: any) => `<p>${escapeHtml(claim?.text)}</p>${sourceLabel(claim?.sourceBlockIds ?? unit?.sourceBlockIds, blockPages)}`).join("")}</section>`);
  }
  const definitions = content.definitions as any[];
  if (definitions.length) parts.push(`<section><h2>Khái niệm</h2>${definitions.map((item) => `<p>${escapeHtml(item?.text ?? item)}</p>${sourceLabel(item?.sourceBlockIds, blockPages)}`).join("")}</section>`);
  const formulas = content.formulas as any[];
  if (formulas.length) parts.push(`<section><h2>Công thức</h2>${formulas.map((item) => `<p class="lesson-formula"><code>${escapeHtml(item?.latex ?? item?.text ?? item)}</code></p>${sourceLabel(item?.sourceBlockIds, blockPages)}`).join("")}</section>`);
  const renderTable = (table: any) => {
    const headers = Array.isArray(table?.headers) ? table.headers : Array.isArray(table?.columns) ? table.columns : [];
    const rows = Array.isArray(table?.rows) ? table.rows : [];
    if (headers.length && rows.every((row: any) => Array.isArray(row))) return `<table><thead><tr>${headers.map((cell: unknown) => `<th>${escapeHtml(cell)}</th>`).join("")}</tr></thead><tbody>${rows.map((row: unknown[]) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
    return `<pre>${escapeHtml(JSON.stringify(table, null, 2))}</pre>`;
  };
  const tables = content.tables as any[];
  if (tables.length) parts.push(`<section><h2>Bảng</h2>${tables.map((table) => `${renderTable(table)}${sourceLabel(table?.sourceBlockIds, blockPages)}`).join("")}</section>`);
  const examples = content.examples as any[];
  if (examples.length) parts.push(`<section><h2>Ví dụ</h2>${examples.map((item) => `<p>${escapeHtml(item?.text ?? item?.content ?? item)}</p>${sourceLabel(item?.sourceBlockIds, blockPages)}`).join("")}</section>`);
  const exercises = content.basicExercises as any[];
  if (exercises.length) parts.push(`<section><h2>Luyện tập trong nguồn</h2>${exercises.map((item) => `<p>${escapeHtml(item?.prompt ?? item?.text ?? item)}</p>${sourceLabel(item?.sourceBlockIds, blockPages)}`).join("")}</section>`);
  return parts.join("\n");
}

async function planAdminDirectDrafts(db: any, raw: unknown, target: string) {
  const request = adminDirectRequestSchema.parse(raw);
  const subject = await db.subject.findUnique({
    where: { id: request.subjectId },
    select: { id: true, name: true },
  });
  const rows = await db.contentPackVersion.findMany({
    where: { id: { in: request.draftIds } },
    include: { pack: true },
  });
  const byId = new Map(rows.map((row: any) => [row.id, row]));
  const drafts = request.draftIds.map((id) => byId.get(id)).filter(Boolean) as any[];
  const errors: Array<{ draftId: string | null; errors: string[] }> = [];
  const sourceIds = new Set<string>();
  if (!subject)
    errors.push({
      draftId: null,
      errors: [`subjectId không tồn tại: ${request.subjectId}`],
    });
  if (drafts.length !== request.draftIds.length)
    errors.push({
      draftId: null,
      errors: [`Không tìm thấy đủ bản nháp: nhận ${drafts.length}/${request.draftIds.length}`],
    });
  const ordered = drafts.map((row) => {
    const parsed = structuredLessonSchema.safeParse(row.manifest);
    const itemErrors: string[] = [];
    if (!parsed.success) itemErrors.push("Structured Lesson không khớp schema hiện tại");
    const lesson = parsed.success ? parsed.data : null;
    if (lesson) {
      const identity = `${lesson.book.key}:${lesson.chapter.id}:${lesson.sourceLesson.id}`;
      if (sourceIds.has(identity)) itemErrors.push(`Trùng source identity ${identity}`);
      sourceIds.add(identity);
      if (row.digest !== digestOf(lesson)) itemErrors.push("Digest không khớp nội dung nguồn");
      if (!lesson.learningContent.summary.trim() && !lesson.learningContent.sections.length) itemErrors.push("Lesson không có nội dung đọc được");
      if (!lesson.pdfPageRange || pageNumber(lesson.pdfPageRange) === Number.MAX_SAFE_INTEGER) itemErrors.push("Thiếu trang PDF bắt đầu để sắp thứ tự Lesson");
      const lessonId = directLessonId(row.packKey, row.version);
      return {
        row,
        lesson,
        identity,
        lessonId,
        order: pageNumber(lesson?.pdfPageRange),
        errors: itemErrors,
      };
    }
    return {
      row,
      lesson: null,
      identity: row.id,
      lessonId: directLessonId(row.packKey, row.version),
      order: Number.MAX_SAFE_INTEGER,
      errors: itemErrors,
    };
  });
  const validLessonIds = ordered.map((item) => item.lessonId);
  const collisions = await db.lesson.findMany({
    where: { id: { in: validLessonIds } },
    select: { id: true, packVersionId: true },
  });
  const collisionsById = new Map(collisions.map((row: any) => [row.id, row]));
  for (const item of ordered) {
    const collision: any = collisionsById.get(item.lessonId);
    if (collision && collision.packVersionId !== item.row.id) item.errors.push(`Lesson ID bị chiếm bởi dữ liệu khác: ${item.lessonId}`);
    if (item.errors.length) errors.push({ draftId: item.row.id, errors: item.errors });
  }
  const sorted = ordered.sort((a, b) => a.order - b.order || a.row.id.localeCompare(b.row.id));
  const legacyDigest = digestOf({
    policy: request.policy,
    name: request.name,
    subjectId: request.subjectId,
    drafts: sorted.map(({ row }) => ({ id: row.id, digest: row.digest })),
  });
  const digest = digestOf({
    policy: request.policy,
    name: request.name,
    subjectId: request.subjectId,
    drafts: sorted.map(({ row }) => ({
      id: row.id,
      digest: row.digest,
      subjectId: row.pack?.subjectId ?? null,
      grade: row.pack?.grade ?? null,
      domain: row.pack?.domain ?? null,
      outcomeCodes: row.outcomeCodes,
      curriculumChapterCode: row.curriculumChapterCode,
      curriculumTopicCode: row.curriculumTopicCode,
      curriculumOrder: row.curriculumOrder,
      classificationReview: row.classificationReview,
    })),
  });
  const currentRelease = await db.contentRelease.findUnique({
    where: { environment_digest: { environment: storageEnv(), digest } },
    select: { id: true, status: true },
  });
  const legacyRelease = currentRelease
    ? null
    : await db.contentRelease.findUnique({
        where: {
          environment_digest: {
            environment: storageEnv(),
            digest: legacyDigest,
          },
        },
        select: { id: true, status: true },
      });
  const existingRelease = currentRelease ?? legacyRelease;
  for (const item of sorted) {
    const exactRetry = existingRelease?.status === "APPLIED" && item.row.status === "released" && item.row.synthetic === false && item.row.lessonId === item.lessonId && item.row.releaseId === existingRelease.id && item.row.pack?.namespace === "baseline";
    if (!exactRetry) {
      if (request.subjectId !== "khtn" || item.row.pack?.subjectId !== "khtn") item.errors.push("KHTN phải dùng subjectId khtn");
      if (item.lesson && item.row.pack?.grade !== item.lesson.book.grade) item.errors.push("Grade của pack không khớp grade trong Structured Lesson");
      if (!["ENERGY", "MATTER", "LIVING", "EARTH_SKY"].includes(item.row.pack?.domain)) item.errors.push("Draft chưa có domain KHTN hợp lệ");
      if (!Array.isArray(item.row.outcomeCodes) || item.row.outcomeCodes.length === 0) item.errors.push("Draft chưa mapping chuẩn đầu ra");
      if (!item.row.curriculumChapterCode || !item.row.curriculumTopicCode || !item.row.curriculumOrder) item.errors.push("Draft chưa mapping chapter/topic/order");
      if (!item.row.classificationReview) item.errors.push("Draft chưa có xác nhận review phân loại");
    }
    if (!exactRetry && (item.row.status !== "draft" || !item.row.synthetic || item.row.lessonId || item.row.releaseId)) item.errors.push("Bản nháp không còn ở trạng thái riêng tư chưa phát hành");
    if (item.errors.length) errors.push({ draftId: item.row.id, errors: item.errors });
  }
  return {
    policy: "ADMIN_DIRECT" as const,
    name: request.name,
    namespace: "baseline" as const,
    environment: storageEnv(),
    target,
    subject,
    digest,
    alreadyApplied: existingRelease?.status === "APPLIED" ? existingRelease.id : null,
    draftCount: sorted.length,
    blocked: errors.length > 0 || target !== storageEnv(),
    blockers: [...(target !== storageEnv() ? [`đích ${target} khác môi trường đang chạy ${storageEnv()}`] : []), ...errors.flatMap((entry) => entry.errors.map((message) => `${entry.draftId ?? "request"}: ${message}`))],
    drafts: sorted.map(({ row, lesson, identity, lessonId }) => ({
      id: row.id,
      packKey: row.packKey,
      version: row.version,
      digest: row.digest,
      sourceIdentity: identity,
      sourceLessonId: lesson?.sourceLesson.id ?? null,
      title: lesson?.sourceLesson.title ?? null,
      chapter: lesson?.chapter.title ?? null,
      subjectId: request.subjectId,
      lessonId,
      order: row.curriculumOrder,
      grade: row.pack?.grade,
      domain: row.pack?.domain,
      outcomeCodes: row.outcomeCodes,
      curriculumChapterCode: row.curriculumChapterCode,
      curriculumTopicCode: row.curriculumTopicCode,
      pdfPageRange: lesson?.pdfPageRange ?? null,
      warningCount: lesson?.warnings.length ?? 0,
    })),
  };
}

export async function planAdminDirectDraftRelease(db: any, raw: unknown, target: string) {
  return planAdminDirectDrafts(db, raw, target);
}

export async function applyAdminDirectDraftRelease(db: any, raw: unknown, options: { target: string; adminId: string; confirm: true }) {
  if (options.confirm !== true) throw new Error("ADMIN_DIRECT_CONFIRMATION_REQUIRED");
  const plan = await planAdminDirectDrafts(db, raw, options.target);
  if (plan.blocked) throw Object.assign(new Error("ADMIN_DIRECT_RELEASE_BLOCKED"), { plan });
  const prior = await db.contentRelease.findUnique({
    where: {
      environment_digest: {
        environment: plan.environment,
        digest: plan.digest,
      },
    },
    include: { items: true },
  });
  if (prior?.status === "APPLIED") return { receipt: prior, plan, idempotent: true };
  const admin = await db.user.findUnique({
    where: { id: options.adminId },
    select: { id: true, role: true, status: true },
  });
  if (!admin || admin.role !== "ADMIN" || admin.status !== "active") throw new Error("ADMIN_NOT_ACTIVE");
  const draftIds = new Set(plan.drafts.map((item) => item.id));
  const rows = await db.contentPackVersion.findMany({
    where: { id: { in: [...draftIds] } },
    include: { pack: true },
  });
  const orderedRows = new Map(rows.map((row: any) => [row.id, row]));
  const receipt = await db.$transaction(
    async (tx: any) => {
      const release = await tx.contentRelease.create({
        data: {
          environment: plan.environment,
          name: plan.name,
          digest: plan.digest,
          importerVersion: `${IMPORTER_VERSION}+ADMIN_DIRECT`,
          status: "APPLIED",
          initiatedById: admin.id,
          approvedById: admin.id,
          summary: {
            policy: "ADMIN_DIRECT",
            actorId: admin.id,
            subjectId: plan.subject!.id,
            subjectName: plan.subject!.name,
            drafts: plan.drafts.map((draft) => ({
              id: draft.id,
              sourceIdentity: draft.sourceIdentity,
              digest: draft.digest,
              sourceLessonId: draft.sourceLessonId,
              lessonId: draft.lessonId,
              warningCount: draft.warningCount,
            })),
          },
        },
      });
      for (const planned of plan.drafts) {
        const row: any = orderedRows.get(planned.id);
        if (!row || row.status !== "draft" || !row.synthetic || row.lessonId || row.releaseId) throw new Error(`ADMIN_DIRECT_DRAFT_CHANGED:${planned.id}`);
        const source = structuredLessonSchema.parse(row.manifest);
        const html = structuredLessonHtml(source);
        const createdLesson = await tx.lesson.create({
          data: {
            id: planned.lessonId,
            subjectId: plan.subject!.id,
            authorId: admin.id,
            title: source.sourceLesson.title,
            chapter: source.chapter.title,
            grade: row.pack.grade,
            topic: source.sourceLesson.title,
            learningObjective: source.learningContent.summary.slice(0, 500) || source.sourceLesson.title,
            prerequisites: "",
            curriculum: "GDPT 2018 – Khoa học tự nhiên (nội dung SGK; đối chiếu outcomes riêng)",
            content: html,
            labId: null,
            status: "published",
            scope: "SHARED_LIBRARY",
            synthetic: false,
            domain: row.pack.domain,
            outcomeCodes: row.outcomeCodes,
            materials: [],
            questions: [],
            packVersionId: row.id,
            curriculumChapterCode: row.curriculumChapterCode,
            curriculumTopicCode: row.curriculumTopicCode,
            curriculumOrder: row.curriculumOrder,
            review: {
              publicationPolicy: "ADMIN_DIRECT",
              publishedById: admin.id,
              publisher: source.book.author,
              sourceBookKey: source.book.key,
              sourceBookTitle: source.book.title,
              sourceBookVersion: source.book.version,
              sourceBookSha256: source.book.sha256,
              sourceDigest: row.digest,
              sourceIdentity: planned.sourceIdentity,
              sourceLessonId: source.sourceLesson.id,
              chapterId: source.chapter.id,
              pdfPageRange: source.pdfPageRange,
              printedPageRange: source.printedPageRange,
              sourceBlocks: source.sourceBlocks.map((block: any) => ({
                id: block.id,
                pdfPage: block.pdfPage ?? block.page ?? null,
              })),
              warnings: source.warnings,
            },
            publishedAt: new Date(),
          },
        });
        await tx.lessonStep.create({
          data: {
            id: `step-${createdLesson.id}-reading`,
            lessonId: createdLesson.id,
            type: "READING",
            position: 10,
            required: true,
            config: { html },
          },
        });
        await tx.contentPackVersion.update({
          where: { id: row.id },
          data: {
            status: "released",
            synthetic: false,
            lessonId: createdLesson.id,
            releaseId: release.id,
            releasedAt: new Date(),
            retiredAt: null,
          },
        });
        await tx.contentPack.update({
          where: { key: row.packKey },
          data: { namespace: "baseline" },
        });
        await tx.contentReleaseItem.create({
          data: {
            releaseId: release.id,
            kind: "lesson",
            refId: createdLesson.id,
            action: "created",
          },
        });
        await tx.contentReleaseItem.create({
          data: {
            releaseId: release.id,
            kind: "pack-version",
            refId: row.id,
            action: "created",
          },
        });
      }
      await audit(tx, {
        actor: { sub: admin.id, role: "ADMIN" },
        action: "content.release.apply.admin-direct",
        targetType: "ContentRelease",
        targetId: release.id,
        reason: plan.name,
        after: {
          policy: "ADMIN_DIRECT",
          status: "APPLIED",
          lessons: plan.draftCount,
          digests: plan.drafts.map((draft) => draft.digest),
        },
      });
      return tx.contentRelease.findUnique({
        where: { id: release.id },
        include: { items: true },
      });
    },
    { timeout: 120000 },
  );
  return { receipt, plan, idempotent: false };
}

/** Retire a release: its pack versions retire (lessons archived, evidence kept) and the versions it superseded return. */
export async function retireRelease(db: any, releaseId: string, actor: { sub: string }, reason: string) {
  return db.$transaction(async (tx: any) => {
    const release = await tx.contentRelease.findUnique({
      where: { id: releaseId },
      include: { items: true },
    });
    if (!release) throw new Error("RELEASE_NOT_FOUND");
    if (release.status !== "APPLIED") throw new Error("RELEASE_NOT_APPLIED");
    const created = release.items.filter((i: any) => i.kind === "pack-version" && i.action === "created").map((i: any) => i.refId);
    const superseded = release.items.filter((i: any) => i.kind === "pack-version" && i.action === "superseded").map((i: any) => i.refId);
    for (const id of created) {
      const v = await tx.contentPackVersion.update({
        where: { id },
        data: { status: "retired", retiredAt: new Date() },
      });
      if (v.lessonId)
        await tx.lesson.update({
          where: { id: v.lessonId },
          data: { status: "archived" },
        });
    }
    for (const id of superseded) {
      const v = await tx.contentPackVersion.update({
        where: { id },
        data: { status: "released", retiredAt: null },
      });
      if (v.lessonId)
        await tx.lesson.update({
          where: { id: v.lessonId },
          data: { status: "published" },
        });
    }
    const retired = await tx.contentRelease.update({
      where: { id: releaseId },
      data: { status: "RETIRED", retiredAt: new Date() },
    });
    await audit(tx, {
      actor: { sub: actor.sub, role: "ADMIN" },
      action: "content.release.retire",
      targetType: "ContentRelease",
      targetId: releaseId,
      reason,
      before: { status: "APPLIED" },
      after: { status: "RETIRED", references: created.length },
    });
    return {
      release: retired,
      retiredVersions: created.length,
      restoredVersions: superseded.length,
    };
  });
}
