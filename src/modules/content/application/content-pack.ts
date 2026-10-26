import { z } from "zod";
import { createHash } from "node:crypto";
import { DOMAINS, domainSchema } from "../../lessons/application/lesson-content";
import { basicExerciseConfigSchema } from "../../lessons/application/pathway";

/**
 * CF-T1 content pack manifest and release gates. A pack is NexaLab-authored
 * Vietnamese material mapped to curriculum outcomes, with item-level sources,
 * claim-to-source links and named reviews. Automation checks completeness;
 * only named human reviewers attest accuracy and rights.
 */
export const SOURCE_LICENSES = [
  "ORIGINAL",
  "CC0",
  "PUBLIC_DOMAIN",
  "CC_BY",
  "CC_BY_SA",
  "SCHOOL_OWNED",
  "REFERENCE_ONLY",
  "CC_BY_NC",
  "CC_BY_ND",
  "CC_BY_NC_SA",
  "UNKNOWN",
] as const;
/** Licences whose material may be adapted into a released pack. REFERENCE_ONLY may back a claim but contributes no copied body. */
export const RELEASABLE_LICENSES = new Set(["ORIGINAL", "CC0", "PUBLIC_DOMAIN", "CC_BY", "CC_BY_SA", "SCHOOL_OWNED"]);
const EVIDENCE_LICENSES = new Set([...RELEASABLE_LICENSES, "REFERENCE_ONLY"]);

const id = z
  .string()
  .trim()
  .regex(/^[a-z0-9][a-z0-9._-]{1,79}$/, "ID ổn định: chữ thường, số, dấu chấm, gạch ngang, gạch dưới");
const videoProvenanceSchema = z.object({
  sourceUrl: z.string().url().max(1000),
  sourceLabel: z.string().trim().min(2).max(300),
  checkedAt: z.string().datetime(),
  availability: z.enum(["AVAILABLE", "UNAVAILABLE", "UNKNOWN"]),
  rightsStatus: z.enum(["APPROVED", "NEEDS_REVIEW", "REJECTED"]).default("NEEDS_REVIEW"),
  accessibilityStatus: z.enum(["APPROVED", "NEEDS_REVIEW", "REJECTED"]).default("NEEDS_REVIEW"),
  transcriptSource: z.enum(["human_vtt", "youtube_auto_caption", "lesson_equivalent_summary"]).optional(),
  reviewedBy: z.string().trim().min(2).max(120).optional(),
  reviewedAt: z.string().datetime().optional(),
}).strict();
export const packVideoSchema = z.object({
  id,
  title: z.string().trim().min(1).max(200),
  url: z.string().url().max(1000),
  provider: z.enum(["YOUTUBE", "DIRECT"]),
  providerVideoId: z.string().trim().min(1).max(200),
  transcript: z.string().trim().min(20).max(50000).optional(),
  equivalentText: z.string().trim().min(20).max(50000).optional(),
  captionUrl: z.string().url().max(1000).nullable().optional(),
  completionThresholdPercent: z.number().int().min(50).max(100).default(90),
  reviewStatus: z.enum(["APPROVED", "REVIEWED", "NEEDS_REVIEW", "REJECTED"]),
  provenance: videoProvenanceSchema,
}).strict().superRefine((video, ctx) => {
  if (!video.transcript && !video.equivalentText)
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["transcript"], message: "Video cần transcript hoặc nội dung tương đương đã duyệt" });
  if (video.transcript && /^video minh họa/i.test(video.transcript))
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["transcript"], message: "Mô tả video không phải transcript" });
  if (video.provider === "YOUTUBE") {
    const parsed = new URL(video.url);
    const host = parsed.hostname.replace(/^www\./, "");
    const fromUrl = host === "youtu.be" ? parsed.pathname.slice(1).split("/")[0] : parsed.searchParams.get("v") ?? (parsed.pathname.startsWith("/embed/") ? parsed.pathname.split("/")[2] : null);
    if (!fromUrl || fromUrl !== video.providerVideoId)
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["providerVideoId"], message: "providerVideoId không khớp URL YouTube" });
  }
});
const sgkReferenceSchema = z.object({
  bookKey: id,
  bookVersion: z.string().trim().min(1).max(100),
  sourceSha256: z.string().regex(/^[a-f0-9]{64}$/),
  sourceLessonId: id,
  chapterId: id,
  pdfPageRange: z.object({ start: z.number().int().positive(), end: z.number().int().positive() }).strict(),
  printedPageRange: z.object({ start: z.union([z.string(), z.number()]), end: z.union([z.string(), z.number()]) }).strict().optional(),
  sourceBlockIds: z.array(id).max(1000).default([]),
}).strict().refine((value) => value.pdfPageRange.end >= value.pdfPageRange.start, { message: "Khoảng trang SGK không hợp lệ", path: ["pdfPageRange"] });
const basicExercises = basicExerciseConfigSchema
  .extend({ id })
  .strict()
  .superRefine((exercise, ctx) => {
    for (const [path, value] of exercise.questions.flatMap((question, questionIndex) => [
      [["questions", questionIndex, "id"], question.id] as const,
      ...question.options.map((option, optionIndex) => [["questions", questionIndex, "options", optionIndex, "id"], option.id] as const),
    ]))
      if (!id.safeParse(value).success)
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: [...path], message: "ID bài tập phải là ID authored ổn định" });
  });
const person = z
  .object({
    name: z.string().trim().min(2).max(120),
    email: z
      .string()
      .email()
      .transform((v) => v.toLowerCase()),
    at: z.string().datetime(),
  })
  .strict();
export const packManifestSchema = z
  .object({
    key: id,
    title: z.string().trim().min(3).max(200),
    grade: z.union([z.literal(8), z.literal(9)]),
    domain: domainSchema,
    chapter: z.string().trim().min(1).max(200),
    topic: z.string().trim().min(1).max(200),
    subjectId: z.string().trim().min(1).max(60),
    outcomeCodes: z.array(z.string().trim().min(1).max(40)).min(1).max(30),
    synthetic: z.boolean().default(false),
    sources: z
      .array(
        z
          .object({
            id,
            title: z.string().trim().min(2).max(300),
            author: z.string().trim().min(2).max(200),
            url: z.string().url().max(500).optional(),
            accessedAt: z.string().date(),
            license: z.enum(SOURCE_LICENSES),
            attribution: z.string().trim().min(2).max(500),
            /** An appropriate scientific/educational authority (one per important claim is required). */
            authoritative: z.boolean().default(false),
            modificationNote: z.string().trim().max(300).optional(),
            artifactVersionId: z.string().max(40).optional(),
          })
          .strict(),
      )
      .min(1)
      .max(60),
    knowledgeUnits: z
      .array(
        z
          .object({
            id,
            outcomeCodes: z.array(z.string().trim().min(1).max(40)).min(1),
            claims: z
              .array(
                z
                  .object({
                    id,
                    text: z.string().trim().min(5).max(1000),
                    important: z.boolean().default(false),
                    sourceIds: z.array(id).min(1),
                  })
                  .strict(),
              )
              .min(1)
              .max(80),
            terms: z.array(z.string().trim().min(1).max(120)).max(40).default([]),
            misconceptions: z.array(z.string().trim().min(3).max(300)).max(20).default([]),
          })
          .strict(),
      )
      .min(1)
      .max(40),
    lesson: z
      .object({
        learningObjective: z.string().trim().min(5).max(500),
        prerequisites: z.string().trim().max(500).default(""),
        content: z.string().trim().min(20).max(100000),
        videos: z.array(packVideoSchema).max(20).optional(),
        sections: z.array(z.object({ id, videos: z.array(packVideoSchema).max(20) }).strict()).max(100).optional(),
        sgkReference: sgkReferenceSchema.optional(),
        materials: z
          .array(
            z
              .object({
                type: z.enum(["video", "pdf", "image"]),
                url: z.string().regex(/^assetv:[a-z0-9]{20,40}$/, "Học liệu của gói phải ghim một phiên bản tệp (assetv:)"),
                title: z.string().trim().min(1).max(200),
                transcript: z.string().trim().max(50000).optional(),
                captionUrl: z
                  .string()
                  .regex(/^assetv:[a-z0-9]{20,40}$/)
                  .optional(),
              })
              .strict(),
          )
          .max(20)
          .default([]),
        questions: z
          .array(
            z
              .object({
                id,
                prompt: z.string().trim().min(3).max(500),
                options: z
                  .array(z.object({ id, text: z.string().trim().min(1).max(300) }).strict())
                  .min(2)
                  .max(6),
                answerId: id,
                rationale: z.string().trim().min(3).max(1000),
                sourceIds: z.array(id).min(1),
              })
              .strict(),
          )
          .max(30)
          .default([]),
        basicExercises: basicExercises.optional(),
        labId: z.string().max(40).nullable().default(null),
      })
      .strict(),
    reviews: z
      .object({
        editorial: person.optional(),
        subject: person.optional(),
        rights: person.optional(),
        accessibility: person.optional(),
      })
      .strict(),
  })
  .strict();
export type PackManifest = z.infer<typeof packManifestSchema>;

/** Canonical JSON (sorted keys) so the digest only changes when content changes. */
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  if (value && typeof value === "object")
    return (
      "{" +
      Object.keys(value as object)
        .sort()
        .filter((k) => (value as any)[k] !== undefined)
        .map((k) => JSON.stringify(k) + ":" + canonical((value as any)[k]))
        .join(",") +
      "}"
    );
  return JSON.stringify(value);
}
export const digestOf = (value: unknown) => createHash("sha256").update(canonical(value)).digest("hex");

export type GateContext = {
  namespace: "fixture" | "baseline";
  outcomes: Map<string, { grade: number; domain: string; status: string; synthetic: boolean }>;
  /** READY versions of active assets keyed by version id. */
  assetVersions: Map<string, { kind: string; scope: string; assetStatus: string; status: string }>;
  /** Active TEACHER/ADMIN accounts by email (named reviewers must be accountable users for baseline packs). */
  reviewers: Set<string>;
  labs: Set<string>;
};

/** Every reason the pack cannot be released; empty means every hard gate passes. */
export function packGateErrors(m: PackManifest, ctx: GateContext, options: { devSeed?: boolean } = {}) {
  const devSeed = options.devSeed === true;
  const errors: string[] = [];
  const sources = new Map(m.sources.map((s) => [s.id, s]));
  const dup = (list: string[], label: string) => {
    const seen = new Set<string>();
    for (const item of list) {
      if (seen.has(item)) errors.push(`${label} trùng ID: ${item}`);
      seen.add(item);
    }
  };
  dup(
    m.sources.map((s) => s.id),
    "nguồn",
  );
  dup(
    m.knowledgeUnits.map((u) => u.id),
    "đơn vị kiến thức",
  );
  dup(
    m.lesson.questions.map((q) => q.id),
    "câu hỏi",
  );
  const videos = [...(m.lesson.videos ?? []), ...(m.lesson.sections ?? []).flatMap((section) => section.videos)];
  dup(videos.map((video) => video.id), "video");
  for (const video of videos) {
    if (!devSeed && !["APPROVED", "REVIEWED"].includes(video.reviewStatus)) errors.push(`video "${video.title}" chưa được duyệt`);
    if (!devSeed && video.provenance.availability !== "AVAILABLE") errors.push(`video "${video.title}" chưa xác nhận khả dụng`);
    if (!devSeed && video.provenance.rightsStatus !== "APPROVED") errors.push(`video "${video.title}" chưa duyệt bản quyền`);
    if (!devSeed && video.provenance.accessibilityStatus !== "APPROVED") errors.push(`video "${video.title}" chưa duyệt khả năng tiếp cận`);
  }
  if (m.synthetic && ctx.namespace !== "fixture") errors.push("gói minh họa (synthetic) chỉ được nằm trong namespace fixture");
  if (!m.synthetic && ctx.namespace === "fixture") errors.push("namespace fixture chỉ chứa gói minh họa");
  // Curriculum mapping
  for (const code of m.outcomeCodes) {
    const outcome = ctx.outcomes.get(code);
    if (!outcome) errors.push(`yêu cầu cần đạt ${code} không có trong bản đồ chương trình`);
    else {
      if (outcome.grade !== m.grade || outcome.domain !== m.domain) errors.push(`yêu cầu cần đạt ${code} khác khối/mạch của gói`);
      if (outcome.status !== "active") errors.push(`yêu cầu cần đạt ${code} đã lưu trữ`);
      if (outcome.synthetic && ctx.namespace === "baseline")
        errors.push(`yêu cầu cần đạt ${code} là dữ liệu mẫu, không dùng cho gói phát hành`);
    }
  }
  // Rights
  if (!devSeed)
    for (const s of m.sources) {
      if (!EVIDENCE_LICENSES.has(s.license)) errors.push(`nguồn ${s.id} có giấy phép ${s.license} không được phép trong kho phát hành`);
      if (s.license !== "ORIGINAL" && s.license !== "SCHOOL_OWNED" && !s.url) errors.push(`nguồn ${s.id} cần đường dẫn gốc`);
    }
  // Accuracy: claim-to-source links
  for (const unit of m.knowledgeUnits) {
    for (const code of unit.outcomeCodes)
      if (!m.outcomeCodes.includes(code)) errors.push(`đơn vị ${unit.id} gắn ${code} ngoài phạm vi gói`);
    for (const claim of unit.claims) {
      const linked = claim.sourceIds.map((sid) => sources.get(sid));
      if (linked.some((s) => !s)) errors.push(`khẳng định ${claim.id} trích nguồn không tồn tại`);
      if (claim.important && !devSeed) {
        const distinct = new Set(linked.filter(Boolean).map((s) => s!.id));
        if (distinct.size < 2) errors.push(`khẳng định quan trọng ${claim.id} cần ít nhất hai nguồn độc lập`);
        if (!linked.some((s) => s?.authoritative)) errors.push(`khẳng định quan trọng ${claim.id} cần một nguồn có thẩm quyền`);
      }
    }
  }
  // Assessment: answer key and rationale grounded in sources
  for (const q of m.lesson.questions) {
    if (!q.options.some((o) => o.id === q.answerId)) errors.push(`câu ${q.id}: đáp án không nằm trong lựa chọn`);
    dup(
      q.options.map((o) => o.id),
      `lựa chọn của câu ${q.id}`,
    );
    if (q.sourceIds.some((sid) => !sources.has(sid))) errors.push(`câu ${q.id} trích nguồn không tồn tại`);
  }
  // Media: pinned READY versions; video needs transcript and caption
  for (const mat of m.lesson.materials) {
    const versionId = mat.url.slice("assetv:".length);
    const v = ctx.assetVersions.get(versionId);
    if (!v || v.status !== "READY" || v.assetStatus !== "ACTIVE")
      errors.push(`học liệu "${mat.title}" không trỏ tới phiên bản tệp sẵn sàng`);
    else if (ctx.namespace === "baseline" && v.scope !== "SHARED_LIBRARY") errors.push(`học liệu "${mat.title}" phải thuộc thư viện chung`);
    if (mat.type === "video") {
      if (!mat.transcript?.trim()) errors.push(`video "${mat.title}" thiếu bản chép lời`);
      const caption = mat.captionUrl ? ctx.assetVersions.get(mat.captionUrl.slice("assetv:".length)) : null;
      if (!caption || caption.kind !== "caption" || caption.status !== "READY")
        errors.push(`video "${mat.title}" thiếu phụ đề WebVTT đã kiểm tra`);
    }
  }
  if (m.lesson.labId && !ctx.labs.has(m.lesson.labId)) errors.push(`phòng thực hành ${m.lesson.labId} chưa xuất bản`);
  // Named reviews: editorial, subject, rights, accessibility; subject ≠ rights
  for (const kind of (devSeed ? [] : ["editorial", "subject", "rights", "accessibility"] as const)) {
    const r = m.reviews[kind];
    if (!r) errors.push(`thiếu duyệt ${kind}`);
    else if (ctx.namespace === "baseline" && !ctx.reviewers.has(r.email))
      errors.push(`người duyệt ${kind} (${r.email}) không phải tài khoản giáo viên/quản trị đang hoạt động`);
  }
  if (!devSeed && m.reviews.subject && m.reviews.rights && m.reviews.subject.email === m.reviews.rights.email)
    errors.push("người duyệt chuyên môn và người duyệt bản quyền phải khác nhau");
  return errors;
}

/** Legacy-shaped lesson body for step materialization (questions keep stable IDs in the manifest). */
export function lessonFromPack(m: PackManifest) {
  return {
    content: m.lesson.content,
    materials: m.lesson.materials.map(({ type, url, title, transcript }) => ({ type, url, title, ...(transcript ? { transcript } : {}) })),
    questions: m.lesson.questions.map((q) => ({
      prompt: q.prompt,
      options: q.options.map((o) => o.text),
      answer: q.options.findIndex((o) => o.id === q.answerId),
    })),
    ...(m.lesson.basicExercises ? { basicExercises: m.lesson.basicExercises } : {}),
    labId: m.lesson.labId,
    ...(m.lesson.videos ? { videos: m.lesson.videos } : {}),
    ...(m.lesson.sections ? { sections: m.lesson.sections } : {}),
    ...(m.lesson.sgkReference ? { sgkReference: m.lesson.sgkReference } : {}),
  };
}

/**
 * Five separate coverage dimensions per grade × domain (CF-T5 report). The
 * denominator is the released (non-synthetic, active) outcome map; synthetic
 * fixture coverage is reported separately and never counted as released.
 */
export function coverageReport(
  outcomes: Array<{ code: string; grade: number; domain: string; status: string; synthetic: boolean }>,
  packs: Array<{ manifest: PackManifest; synthetic: boolean }>,
  labsWithSimulation: Set<string>,
) {
  const rows: any[] = [];
  for (const synthetic of [false, true])
    for (const grade of [8, 9])
      for (const domain of Object.keys(DOMAINS)) {
        const map = outcomes
          .filter((o) => o.grade === grade && o.domain === domain && o.status === "active" && o.synthetic === synthetic)
          .map((o) => o.code);
        const relevant = packs.filter((p) => p.synthetic === synthetic && p.manifest.grade === grade && p.manifest.domain === domain);
        const covered = (pick: (m: PackManifest) => string[]) =>
          new Set(relevant.flatMap((p) => pick(p.manifest)).filter((c) => map.includes(c)));
        const units = covered((m) => (m.reviews.subject ? m.knowledgeUnits.flatMap((u) => u.outcomeCodes) : []));
        const lessons = covered((m) => m.outcomeCodes);
        const practicals = covered((m) => (m.lesson.labId ? m.outcomeCodes : []));
        const sims = covered((m) => (m.lesson.labId && labsWithSimulation.has(m.lesson.labId) ? m.outcomeCodes : []));
        const metric = (set: Set<string>) => ({ numerator: set.size, denominator: map.length, gaps: map.filter((c) => !set.has(c)) });
        rows.push({
          grade,
          domain,
          synthetic,
          outcomes_mapped: { numerator: map.length, denominator: synthetic ? map.length : null, gaps: [] },
          knowledge_units_reviewed: metric(units),
          lessons_released: metric(lessons),
          practicals_specified: metric(practicals),
          simulations_available: metric(sims),
        });
      }
  return rows;
}
