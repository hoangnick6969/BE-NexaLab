import { BadRequestException } from "@nestjs/common";
import { z } from "zod";
import { text } from "../common/validation";
import { materializeLegacySteps } from "./pathway";
import { domainSchema, reviewDraftSchema } from "./lesson-content";

export const lessonSchema = z.object({
  title: text,
  subjectId: text,
  chapter: text,
  grade: z.number().int().min(6).max(9),
  topic: text,
  learningObjective: text,
  prerequisites: text,
  curriculum: text,
  content: z.string().max(100000),
  labId: z.enum(["circuit", "eye", "chemistry"]).nullable().optional(),
  status: z.enum(["draft", "published", "archived"]),
  materials: z
    .array(
      z.object({
        type: z.enum(["video", "pdf", "image"]),
        url: z
          .string()
          .refine(
            (u) => /^https?:\/\//.test(u) || /^asset:[0-9a-f-]{36}$/.test(u) || /^assetv:[a-z0-9]{20,40}$/.test(u),
          ),
        title: text,
        transcript: z.string().trim().max(50000).optional(),
      }),
    )
    .max(20)
    .default([]),
  questions: z
    .array(
      z
        .object({
          prompt: text,
          options: z.array(text).min(2).max(6),
          answer: z.number().int().min(0).max(5),
        })
        .refine((q) => q.answer < q.options.length),
    )
    .max(30)
    .default([]),
  review: reviewDraftSchema.nullable().optional(),
  domain: domainSchema.nullable().optional(),
  outcomeCodes: z.array(z.string().trim().min(1).max(40)).max(20).default([]),
  challengeParams: z.record(z.union([z.number(), z.string().max(60)])).nullable().optional(),
  /** Only an admin may create shared-library content; ignored on update. */
  scope: z.enum(["TEACHER_PRIVATE", "SHARED_LIBRARY"]).optional(),
});
/** MSG-36: archived content for a student who has not started it. */
export const ARCHIVED_CONTENT_MESSAGE = "Nội dung này không còn được cập nhật.";
export function publishedSteps(lesson: z.infer<typeof lessonSchema>, namespace?: string) {
  if (lesson.status !== "published") return [];
  try {
    return materializeLegacySteps(lesson, namespace);
  } catch {
    throw new BadRequestException({
      code: "INVALID_LESSON_PATHWAY",
      message: "Bài học xuất bản cần tài nguyên hợp lệ cho từng bước",
    });
  }
}
