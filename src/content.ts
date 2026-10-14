import { z } from "zod";
import { stableStringify } from "./idempotency";

/**
 * Teacher content rules (B1-T4, D1, D7). Teacher-private content is
 * self-reviewed against this checklist before it can be published; shared
 * baseline content is admin-managed and read-only to teachers.
 */
export const LICENSES = ["ORIGINAL", "CC0", "CC_BY", "CC_BY_SA", "SCHOOL_OWNED"] as const;

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
  if (scope === "SHARED_LIBRARY") missing.push("duyệt biên tập, chuyên môn và bản quyền cho thư viện chung");
  else {
    const review = reviewSchema.safeParse(lesson.review);
    if (!review.success) missing.push("phiếu tự kiểm duyệt (nguồn, giấy phép, yêu cầu cần đạt)");
    else {
      if (lesson.questions.length && !review.data.answerKeyChecked) missing.push("xác nhận đã kiểm tra đáp án");
      if (!review.data.safetyChecked) missing.push("xác nhận an toàn");
      if (!review.data.accessibilityChecked) missing.push("xác nhận khả năng tiếp cận");
    }
  }
  return missing;
}

/** Fields whose change alters the learning pathway, quiz or evidence meaning. */
export function structureFingerprint(lesson: Pick<LessonLike, "content" | "materials" | "questions" | "labId">) {
  return stableStringify({
    content: lesson.content,
    materials: lesson.materials.map(({ type, url, title, transcript }) => ({ type, url, title, transcript: transcript ?? null })),
    questions: lesson.questions,
    labId: lesson.labId ?? null,
  });
}

export const isStructureChange = (
  before: Parameters<typeof structureFingerprint>[0],
  after: Parameters<typeof structureFingerprint>[0],
) => structureFingerprint(before) !== structureFingerprint(after);

/** Asset IDs referenced by `asset:<uuid>` materials. */
export const assetIds = (materials: Array<{ url: string }>) =>
  materials.map((item) => item.url.match(/^asset:([0-9a-f-]{36})$/)?.[1]).filter((value): value is string => Boolean(value));
