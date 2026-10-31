import { createHash } from "node:crypto";
import { z } from "zod";
import { stableStringify } from "../../../common/idempotency";
import { reactions } from "../../../../packages/sim";

/**
 * Teacher content rules (B1-T4, D1, D7). Teacher-private content is
 * self-reviewed against this checklist before it can be published; shared
 * baseline content is admin-managed and read-only to teachers.
 */
export const LICENSES = ["ORIGINAL", "CC0", "CC_BY", "CC_BY_SA", "SCHOOL_OWNED", "PUBLISHER_PERMISSION"] as const;
export const LICENSE_LABELS: Record<(typeof LICENSES)[number], string> = {
  ORIGINAL: "Tự biên soạn",
  CC0: "CC0",
  CC_BY: "CC BY 4.0",
  CC_BY_SA: "CC BY-SA 4.0",
  SCHOOL_OWNED: "Tài liệu thuộc nhà trường",
  PUBLISHER_PERMISSION: "Được nhà xuất bản cho phép",
};

/** GDPT 2018 KHTN content strands used as library domain tags. */
export const DOMAINS = {
  MATTER: "Chất và sự biến đổi của chất",
  ENERGY: "Năng lượng và sự biến đổi",
  LIVING: "Vật sống",
  EARTH_SKY: "Trái Đất và bầu trời",
} as const;
export type Domain = keyof typeof DOMAINS;
export const domainSchema = z.enum(Object.keys(DOMAINS) as [Domain, ...Domain[]]);

/**
 * Teacher-adjustable challenge parameters per simulation model. Ranges keep the
 * model inside the behaviour its golden cases cover. `rangeReview` stays
 * "pending" until Q-C2-04 names reviewed values; a pending range may be used by
 * self-reviewed teacher-private variants but blocks shared-library release.
 */
type NumberParam = { kind: "number"; label: string; unit: string; min: number; max: number; step: number; default: number };
type ChoiceParam = { kind: "choice"; label: string; options: Array<{ value: string; label: string }>; default: string };
export const CHALLENGE_PARAMETERS: Record<
  string,
  { modelRef: string; rangeReview: "pending" | "approved"; params: Record<string, NumberParam | ChoiceParam> }
> = {
  "mass-conservation": {
    modelRef: "mass-conservation@1.0.0",
    rangeReview: "pending",
    params: {
      fixtureId: { kind: "choice", label: "Bộ phản ứng tham chiếu", options: [{ value: "barium-precipitation-reference-v1", label: "Barium chloride và sodium sulfate" }], default: "barium-precipitation-reference-v1" },
      cup1Milligrams: { kind: "number", label: "Cốc 1 rỗng", unit: "mg", min: 1, max: 1000000, step: 1, default: 100000 },
      cup2Milligrams: { kind: "number", label: "Cốc 2 rỗng", unit: "mg", min: 1, max: 1000000, step: 1, default: 100000 },
      solvent1Milligrams: { kind: "number", label: "Dung môi cốc 1", unit: "mg", min: 0, max: 1000000, step: 1, default: 100000 },
      solvent2Milligrams: { kind: "number", label: "Dung môi cốc 2", unit: "mg", min: 0, max: 1000000, step: 1, default: 100000 },
    },
  },
  circuit: {
    modelRef: "circuit@1.0.0",
    rangeReview: "pending",
    params: {
      maxCurrentMa: { kind: "number", label: "Dòng tối đa qua mỗi nhánh LED", unit: "mA", min: 5, max: 20, step: 1, default: 20 },
      minLitLeds: { kind: "number", label: "Số LED tối thiểu phải sáng", unit: "LED", min: 1, max: 3, step: 1, default: 1 },
    },
  },
  chemistry: {
    modelRef: "chemistry@1.0.0",
    rangeReview: "pending",
    params: {
      experiment: {
        kind: "choice",
        label: "Loại thí nghiệm",
        options: [{ value: "ph", label: "Nhận biết axit, trung tính và bazơ bằng quỳ tím" }],
        default: "ph",
      },
      reactionId: {
        kind: "choice",
        label: "Phản ứng cần làm",
        options: reactions.map((reaction) => ({ value: reaction.id, label: reaction.equation })),
        default: reactions[0].id,
      },
    },
  },
  // FL-03: no learner-tunable parameters. Specimens are pinned per run by the server (density-specimens.ts).
  density: {
    modelRef: "density-bench@1.0.0",
    rangeReview: "pending",
    params: {},
  },
  eye: {
    modelRef: "eye@1.0.0",
    rangeReview: "pending",
    params: {
      minScore: { kind: "number", label: "Điểm tối thiểu để đạt", unit: "%", min: 50, max: 100, step: 10, default: 100 },
    },
  },
  // FL-25 private prototype: observation-only model with a pinned checkpoint rubric; no challenge parameters.
  "em-induction": {
    modelRef: "em-induction@1.0.0",
    rangeReview: "pending",
    params: {},
  },
  // FL-20: observation-only model with a pinned checkpoint rubric; no challenge parameters.
  "ecology-tolerance": {
    modelRef: "ecology-tolerance@1.0.0",
    rangeReview: "pending",
    params: {},
  },
};
export type ChallengeParams = Record<string, number | string>;

/** Every out-of-range or unknown parameter; empty means valid. */
export function challengeParamErrors(labId: string | null | undefined, params: unknown): string[] {
  if (params == null) return [];
  const spec = labId ? CHALLENGE_PARAMETERS[labId] : undefined;
  if (!spec) return ["Thử thách tùy chỉnh cần gắn một phòng thực hành có tham số được phép"];
  if (typeof params !== "object" || Array.isArray(params)) return ["Tham số thử thách không hợp lệ"];
  const errors: string[] = [];
  for (const [name, value] of Object.entries(params as Record<string, unknown>)) {
    const param = spec.params[name];
    if (!param) errors.push(`Tham số "${name}" không được phép cho mô hình này`);
    else if (param.kind === "number") {
      if (typeof value !== "number" || !Number.isFinite(value) || value < param.min || value > param.max)
        errors.push(`${param.label} phải từ ${param.min} đến ${param.max} ${param.unit}`);
      else if (Math.abs(Math.round((value - param.min) / param.step) * param.step - (value - param.min)) > 1e-9)
        errors.push(`${param.label} phải theo bước ${param.step} ${param.unit}`);
    } else if (!param.options.some((option) => option.value === value)) errors.push(`${param.label} không nằm trong danh sách cho phép`);
  }
  if (!Object.keys(params as object).length) errors.push("Chọn ít nhất một tham số thử thách");
  return errors;
}

/** Student-facing objective sentence generated from the reviewed parameters. */
export function challengeObjective(labId: string, params: ChallengeParams) {
  if (labId === "circuit")
    return `Lắp mạch kín để ít nhất ${params.minLitLeds ?? 1} LED sáng, dòng qua mỗi nhánh LED không vượt quá ${params.maxCurrentMa ?? 20} mA.`;
  if (labId === "chemistry") {
    if (params.experiment === "ph") return "Nhúng quỳ tím vào ba lọ mất nhãn và ghi màu đổi được để nhận biết axit, trung tính và bazơ.";
    const reaction = reactions.find((item) => item.id === params.reactionId);
    return `Chọn lượng chất để phản ứng ${reaction?.equation ?? params.reactionId} xảy ra vừa đủ, không còn chất dư.`;
  }
  return `Gọi đúng tên các bộ phận của mắt, đạt ít nhất ${params.minScore ?? 100}%.`;
}

/**
 * Applies a teacher variant's parameters to the model output. The scientific
 * model itself is unchanged; parameters only tighten what counts as success.
 */
export function evaluateChallenge(labId: string, labState: any, result: any, params: ChallengeParams | null | undefined) {
  if (!params) return { verdict: result.verdict as string, check: null };
  const unmet: string[] = [];
  let verdict = result.verdict as string;
  if (labId === "circuit") {
    const maxA = Number(params.maxCurrentMa ?? 20) / 1000;
    const branches: Array<{ current: number | null; leds: number }> = result.branches ?? [];
    const lit = branches.filter((b) => b.leds > 0 && b.current !== null && b.current >= 0.001 && b.current <= 0.02 + 1e-12);
    const litLeds = lit.reduce((sum, b) => sum + b.leds, 0);
    if (branches.some((b) => b.leds > 0 && b.current !== null && b.current > maxA + 1e-12)) unmet.push("maxCurrentMa");
    if (litLeds < Number(params.minLitLeds ?? 1)) unmet.push("minLitLeds");
    if (verdict === "passed" && unmet.length) verdict = "partial";
  } else if (labId === "chemistry") {
    if (params.experiment === "ph") {
      // The litmus model grades each jar itself; the variant only requires that
      // the attempt was the litmus experiment with every jar identified.
      const samples: Array<{ type: string | null }> = result.samples ?? [];
      if (samples.length !== 3 || samples.some((sample) => sample.type == null)) verdict = "not_passed";
    } else if (params.reactionId && labState?.reactionId !== params.reactionId) {
      unmet.push("reactionId");
      verdict = "not_passed";
    }
  } else if (labId === "eye") {
    const score = Number(result.score ?? 0);
    if (score >= Number(params.minScore ?? 100)) verdict = "passed";
    else {
      unmet.push("minScore");
      verdict = score > 0 ? "partial" : "not_passed";
    }
  }
  return { verdict, check: { params, unmet } };
}

/** Named shared-library release reviews (D1); subject and rights reviewers must differ. */
export const RELEASE_REVIEW_KINDS = ["editorial", "subject", "rights", "safety", "model"] as const;
export type ReleaseReviewKind = (typeof RELEASE_REVIEW_KINDS)[number];
export const RELEASE_REVIEW_LABELS: Record<ReleaseReviewKind, string> = {
  editorial: "duyệt biên tập",
  subject: "duyệt chuyên môn",
  rights: "duyệt bản quyền",
  safety: "duyệt an toàn",
  model: "duyệt mô hình khoa học",
};
type ReleaseReview = Partial<Record<ReleaseReviewKind, { reviewerId: string; reviewerName?: string; at: string; note?: string }>>;

export const reviewSchema = z
  .object({
    sources: z.string().trim().min(10).max(2000),
    license: z.enum(LICENSES),
    outcome: z.string().trim().min(3).max(500),
    answerKeyChecked: z.boolean(),
    safetyChecked: z.boolean(),
    accessibilityChecked: z.boolean(),
  })
  .strict();
export type LessonReview = z.infer<typeof reviewSchema>;
/** Drafts may hold a partially filled checklist; publish validates `reviewSchema`. */
export const reviewDraftSchema = z
  .object({
    sources: z.string().trim().max(2000).default(""),
    license: z.enum(LICENSES).default("ORIGINAL"),
    outcome: z.string().trim().max(500).default(""),
    answerKeyChecked: z.boolean().default(false),
    safetyChecked: z.boolean().default(false),
    accessibilityChecked: z.boolean().default(false),
  })
  .strict();

type LessonLike = {
  title: string;
  subjectId: string;
  chapter: string;
  grade: number;
  topic: string;
  learningObjective: string;
  content: string;
  materials: Array<{ type: string; url: string; title: string; transcript?: string }>;
  questions: unknown[];
  labId?: string | null;
  review?: LessonReview | null;
  outcomeCodes?: unknown;
  challengeParams?: unknown;
  releaseReview?: unknown;
};

/** Every reason the lesson cannot be published yet (MSG-28 "Missing: {items}"). */
export function publishBlockers(lesson: LessonLike, scope: string) {
  const missing: string[] = [];
  for (const [field, label] of [
    ["title", "tiêu đề"],
    ["subjectId", "môn học"],
    ["chapter", "chương"],
    ["topic", "chủ đề"],
    ["learningObjective", "mục tiêu học tập"],
  ] as const)
    if (!String(lesson[field] ?? "").trim()) missing.push(label);
  if (!lesson.content.replace(/<[^>]*>/g, "").trim()) missing.push("nội dung bài đọc");
  lesson.materials
    .filter((item) => item.type === "video")
    .forEach((item) => {
      if (!item.transcript?.trim()) missing.push(`bản chép lời cho video "${item.title}"`);
    });
  const review = reviewSchema.safeParse(lesson.review);
  if (!review.success) missing.push("phiếu kiểm duyệt (nguồn, giấy phép, yêu cầu cần đạt)");
  else {
    if (lesson.questions.length && !review.data.answerKeyChecked) missing.push("xác nhận đã kiểm tra đáp án");
    if (!review.data.safetyChecked) missing.push("xác nhận an toàn");
    if (!review.data.accessibilityChecked) missing.push("xác nhận khả năng tiếp cận");
  }
  if (lesson.challengeParams != null) {
    for (const error of challengeParamErrors(lesson.labId, lesson.challengeParams)) missing.push(error);
    if (!lesson.labId) missing.push("phòng thực hành cho thử thách tùy chỉnh");
  }
  if (scope === "SHARED_LIBRARY") {
    if (!Array.isArray(lesson.outcomeCodes) || !lesson.outcomeCodes.length) missing.push("yêu cầu cần đạt trong bản đồ chương trình");
    const reviews = (lesson.releaseReview ?? {}) as ReleaseReview;
    const required: ReleaseReviewKind[] = ["editorial", "subject", "rights", "safety", ...(lesson.labId ? (["model"] as const) : [])];
    for (const kind of required) if (!reviews[kind]?.reviewerId) missing.push(RELEASE_REVIEW_LABELS[kind]);
    if (reviews.subject?.reviewerId && reviews.subject.reviewerId === reviews.rights?.reviewerId)
      missing.push("người duyệt chuyên môn và người duyệt bản quyền phải khác nhau");
    if (lesson.challengeParams != null && lesson.labId && CHALLENGE_PARAMETERS[lesson.labId]?.rangeReview !== "approved")
      missing.push("khoảng tham số của mô hình chưa được duyệt (Q-C2-04)");
  }
  return missing;
}

/** Fields whose change alters the learning pathway, quiz or evidence meaning. */
export function structureFingerprint(lesson: Pick<LessonLike, "content" | "materials" | "questions" | "labId" | "challengeParams">) {
  return stableStringify({
    content: lesson.content,
    materials: lesson.materials.map(({ type, url, title, transcript }) => ({ type, url, title, transcript: transcript ?? null })),
    questions: lesson.questions,
    labId: lesson.labId ?? null,
    challengeParams: lesson.challengeParams ?? null,
  });
}

/** Immutable content version used by the active-duplicate assignment rule. */
export const lessonVersion = (lesson: Parameters<typeof structureFingerprint>[0]) =>
  "lesson:" + createHash("sha256").update(structureFingerprint(lesson)).digest("hex").slice(0, 16);
export const labVersion = (lab: { simulationModelRef: string; config: unknown }) =>
  "lab:" +
  createHash("sha256")
    .update(stableStringify({ model: lab.simulationModelRef, config: lab.config ?? {} }))
    .digest("hex")
    .slice(0, 16);

/** Challenge row owned by a lesson variant; keeps the `${labId}_` prefix the practical gate matches on. */
export const variantChallengeId = (labId: string, lessonId: string) => `${labId}_v-${lessonId}`;

/** Attribution rendered wherever released or private content is shown. */
export function attribution(lesson: { review?: unknown; synthetic?: boolean; scope?: string }) {
  const review = lesson.review as Partial<LessonReview> | null | undefined;
  return {
    sources: review?.sources?.trim() || null,
    license: review?.license ?? null,
    licenseLabel: review?.license ? LICENSE_LABELS[review.license] : null,
    synthetic: Boolean(lesson.synthetic),
    note: lesson.synthetic ? "Nội dung minh họa phục vụ phát triển, không phải học liệu đã phát hành." : null,
  };
}

export const isStructureChange = (before: Parameters<typeof structureFingerprint>[0], after: Parameters<typeof structureFingerprint>[0]) =>
  structureFingerprint(before) !== structureFingerprint(after);

/** Asset IDs referenced by `asset:<uuid>` materials. */
export const assetIds = (materials: Array<{ url: string }>) =>
  materials.map((item) => item.url.match(/^asset:([0-9a-f-]{36})$/)?.[1]).filter((value): value is string => Boolean(value));

/** Immutable asset version IDs pinned by `assetv:<versionId>` materials (CF-T2). */
export const materialVersionIds = (materials: Array<{ url: string }>) =>
  materials.map((item) => item.url.match(/^assetv:([a-z0-9]{20,40})$/)?.[1]).filter((value): value is string => Boolean(value));
