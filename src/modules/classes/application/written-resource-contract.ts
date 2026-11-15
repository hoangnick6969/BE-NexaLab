import { BadRequestException } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { z } from "zod";
const half = (value: number) => Number.isInteger(value * 2);
const anchorSchema = z.object({ points: z.number(), description: z.string().trim().min(1).max(300) }).strict();
const criterionSchema = z
  .object({
    code: z.string().regex(/^[A-Z][A-Z0-9_]{1,31}$/),
    description: z.string().trim().min(1).max(500),
    maxPoints: z.number().min(1).max(10).refine(half, "maxPoints phải là bội số của 0.5"),
    anchors: z.array(anchorSchema).min(2).max(5),
  })
  .strict()
  .superRefine((criterion, ctx) => {
    const points = criterion.anchors.map((anchor) => anchor.points);
    points.forEach((p, i) => {
      if (!half(p) || p < 0 || p > criterion.maxPoints)
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["anchors", i, "points"], message: "Điểm mốc phải là bội số 0.5 trong [0, maxPoints]" });
      if (i > 0 && !(p > points[i - 1]))
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["anchors", i, "points"], message: "Điểm mốc phải tăng dần" });
    });
    if (points[0] !== 0) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["anchors", 0, "points"], message: "Mốc đầu tiên phải là 0 điểm" });
    if (points[points.length - 1] !== criterion.maxPoints)
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["anchors", points.length - 1, "points"], message: "Mốc cuối phải bằng maxPoints" });
  });
export const writtenPromptSchema = z
  .object({
    prompt: z.string().trim().min(1).max(2000),
    maxChars: z.number().int().min(100).max(5000),
    referenceAnswer: z.string().trim().max(2000).optional(),
    commonPhrases: z.array(z.string().trim().min(1).max(200)).max(20).optional(),
    criteria: z.array(criterionSchema).min(1).max(6),
  })
  .strict()
  .superRefine((prompt, ctx) => {
    const seen = new Set<string>();
    prompt.criteria.forEach((criterion, i) => {
      if (seen.has(criterion.code)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["criteria", i, "code"], message: "Mã tiêu chí bị trùng trong câu hỏi" });
      seen.add(criterion.code);
    });
  });
const writtenTaskSchema = z.object({ prompts: z.array(writtenPromptSchema).min(1).max(5) }).strict();

/** WRITTEN_TASK branch: violations are 400 RUBRIC_INVALID with field-level details (TAI2-T1). Ids are server-generated. */
export function normalizeWrittenTask(raw: unknown) {
  const parsed = writtenTaskSchema.safeParse(raw);
  if (!parsed.success)
    throw new BadRequestException({
      code: "RUBRIC_INVALID",
      message: "Bài tự luận hoặc biểu điểm không hợp lệ",
      details: parsed.error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })),
    });
  return {
    prompts: parsed.data.prompts.map((prompt) => ({
      id: randomUUID(),
      prompt: prompt.prompt,
      maxChars: prompt.maxChars,
      ...(prompt.referenceAnswer ? { referenceAnswer: prompt.referenceAnswer } : {}),
      ...(prompt.commonPhrases?.length ? { commonPhrases: prompt.commonPhrases } : {}),
      criteria: prompt.criteria.map((criterion) => ({
        code: criterion.code,
        description: criterion.description,
        maxPoints: criterion.maxPoints,
        anchors: criterion.anchors.map((anchor) => ({ points: anchor.points, description: anchor.description })),
      })),
    })),
  };
}

/**
 * The only student/parent projection of WRITTEN_TASK content (allowlist): prompt text, answer length and criteria
 * without anchors. referenceAnswer, anchors, commonPhrases and any other field never leave through it.
 */
export function studentWrittenTaskContent(content: any) {
  const prompts: unknown[] = Array.isArray(content?.prompts) ? content.prompts : [];
  return {
    prompts: prompts.map((prompt: any) => ({
      id: String(prompt?.id ?? ""),
      prompt: String(prompt?.prompt ?? ""),
      maxChars: Number(prompt?.maxChars ?? 0),
      criteria: (Array.isArray(prompt?.criteria) ? prompt.criteria : []).map((criterion: any) => ({
        code: String(criterion?.code ?? ""),
        description: String(criterion?.description ?? ""),
        maxPoints: Number(criterion?.maxPoints ?? 0),
      })),
    })),
  };
}

