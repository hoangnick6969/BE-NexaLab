import { BadRequestException, ConflictException, HttpException, NotFoundException, ServiceUnavailableException } from "@nestjs/common";
import { z } from "zod";
import { labChallengeBody } from "./lab-challenge-contract";

/**
 * Purposes known to the runtime. ASSESS_SUBMISSION (TAI-02) is created through its own route, not the create body below.
 * DRAFT_LAB_CHALLENGE (TAI-06) is the second branch of the create body.
 */
export const AI_PURPOSES = ["GENERATE_RESOURCE", "ASSESS_SUBMISSION", "DRAFT_LAB_CHALLENGE"] as const;

/** duplicateOf entry on the job detail view (computed on read from qdup@1; never stored). */
export type DuplicateMatch = {
  sourceKind: "CLASS_RESOURCE" | "LIBRARY_LESSON";
  resourceId?: string;
  lessonId?: string;
  resourceTitle: string;
  className?: string;
  match: "EXACT" | "NEAR";
  similarity: number;
  flag: string;
};
export type AiPurpose = (typeof AI_PURPOSES)[number];

export const MAX_QUESTIONS_PER_JOB = 20;
export const MAX_CARDS_PER_JOB = 30;

const difficulty = z.enum(["FOUNDATION", "STANDARD", "ADVANCED"]);

const generateResourceBody = z
  .object({
    purpose: z.literal("GENERATE_RESOURCE"),
    targetKind: z.enum(["DECK", "STUDY_QUIZ", "TEST"]),
    lessonId: z.string().trim().min(1).max(64),
    itemCount: z.number().int().min(1).max(MAX_CARDS_PER_JOB),
    difficulty: difficulty.optional(),
    outcomeCodes: z.array(z.string().trim().min(1).max(64)).max(10).optional(),
    instruction: z.string().trim().max(1000).optional(),
    /** TAI-05: the estimate the teacher confirmed. Required while AI_CREDITS_ENABLED=true, ignored otherwise. */
    confirmedCredits: z.number().int().min(0).max(100_000).optional(),
  })
  .strict();

/**
 * Create body: a strict discriminated union on the required `purpose` (implementation-contract.md). TAI-01 ships only
 * GENERATE_RESOURCE; later purposes (TAI-06 DRAFT_LAB_CHALLENGE) add branches without changing this one.
 */
export const createAiJobBody = z.discriminatedUnion("purpose", [generateResourceBody, labChallengeBody]).superRefine((body, ctx) => {
  if (body.purpose !== "GENERATE_RESOURCE") return;
  if (body.targetKind !== "DECK" && body.itemCount > MAX_QUESTIONS_PER_JOB)
    ctx.addIssue({ code: z.ZodIssueCode.too_big, maximum: MAX_QUESTIONS_PER_JOB, inclusive: true, type: "number", path: ["itemCount"], message: `Tối đa ${MAX_QUESTIONS_PER_JOB} câu hỏi mỗi lần tạo` });
  if (body.outcomeCodes && new Set(body.outcomeCodes).size !== body.outcomeCodes.length)
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["outcomeCodes"], message: "Mã chuẩn đầu ra bị trùng" });
});
export type CreateAiJobBody = z.infer<typeof createAiJobBody>;

/** Normalized request stored on AiJob.request and hashed for idempotency: empty optionals become null. */
export function normalizeCreateBody(body: Extract<CreateAiJobBody, { purpose: "GENERATE_RESOURCE" }>) {
  return {
    purpose: body.purpose,
    targetKind: body.targetKind,
    lessonId: body.lessonId,
    itemCount: body.itemCount,
    difficulty: body.difficulty ?? null,
    outcomeCodes: body.outcomeCodes && body.outcomeCodes.length > 0 ? body.outcomeCodes : null,
    instruction: body.instruction ? body.instruction : null,
  };
}
export type NormalizedAiRequest = ReturnType<typeof normalizeCreateBody>;

export const listAiJobsQuery = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20),
  /** TAI-06: DRAFT_LAB_CHALLENGE lists proposal jobs; the default keeps the TAI-01 list unchanged. */
  purpose: z.enum(["GENERATE_RESOURCE", "DRAFT_LAB_CHALLENGE"]).default("GENERATE_RESOURCE"),
  cursor: z.string().trim().min(1).max(64).optional(),
});

export const quotaQuery = z.object({ purpose: z.enum(AI_PURPOSES).default("GENERATE_RESOURCE") });

/**
 * Per-item decision. EDITED needs editedPayload (re-validated by structural rules), REJECTED needs reasonCode, and
 * neither field is allowed otherwise. reasonCode is an UPPER_SNAKE code chosen by the client.
 */
export const decisionBody = z
  .object({
    decision: z.enum(["ACCEPTED", "EDITED", "REJECTED"]),
    editedPayload: z.unknown().optional(),
    reasonCode: z.string().trim().regex(/^[A-Z][A-Z0-9_]{1,47}$/).optional(),
  })
  .strict()
  .superRefine((body, ctx) => {
    if (body.decision === "EDITED" && body.editedPayload === undefined)
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["editedPayload"], message: "Bắt buộc khi sửa" });
    if (body.decision !== "EDITED" && body.editedPayload !== undefined)
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["editedPayload"], message: "Chỉ dùng khi sửa" });
    if (body.decision === "REJECTED" && !body.reasonCode)
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["reasonCode"], message: "Bắt buộc khi bỏ" });
    if (body.decision !== "REJECTED" && body.reasonCode !== undefined)
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["reasonCode"], message: "Chỉ dùng khi bỏ" });
  });

export const materializeBody = z.object({ title: z.string().trim().min(1).max(160) }).strict();

// Error factories. Messages are Vietnamese, following the existing envelope.
export const idempotencyKeyRequired = () =>
  new BadRequestException({ code: "IDEMPOTENCY_KEY_REQUIRED", message: "Cần Idempotency-Key cho thao tác này" });
export const outcomeNotInLesson = () =>
  new BadRequestException({ code: "VALIDATION_FAILED", message: "Mã chuẩn đầu ra không thuộc bài học đã chọn", details: [{ path: "outcomeCodes", message: "not in lesson" }] });
export const aiJobNotFound = () => new NotFoundException({ code: "NOT_FOUND", message: "Không tìm thấy yêu cầu AI" });
export const aiJobNotReviewable = () =>
  new ConflictException({ code: "AI_JOB_NOT_REVIEWABLE", message: "Yêu cầu AI chưa hoàn tất, chưa thể duyệt" });
export const aiJobAlreadyMaterialized = () =>
  new ConflictException({ code: "AI_JOB_ALREADY_MATERIALIZED", message: "Bản nháp đã được tạo từ yêu cầu AI này" });
export const aiReviewIncomplete = () =>
  new ConflictException({ code: "AI_REVIEW_INCOMPLETE", message: "Cần quyết định mọi mục và giữ ít nhất một mục" });
export const aiEditInvalid = (rules: string[]) =>
  new BadRequestException({ code: "AI_EDIT_INVALID", message: "Nội dung đã sửa không hợp lệ", details: rules.map((rule) => ({ rule })) });
export const aiJobNotCancellable = () =>
  new ConflictException({ code: "AI_JOB_NOT_CANCELLABLE", message: "Yêu cầu AI đã kết thúc, không thể hủy" });
export const aiProviderNotConfigured = () =>
  new ServiceUnavailableException({ code: "AI_PROVIDER_NOT_CONFIGURED", message: "Dịch vụ AI chưa được cấu hình" });
export const aiQuotaExceeded = (purpose: string, resetsAt: Date | null) =>
  new HttpException({ code: "AI_QUOTA_EXCEEDED", message: "Đã đạt giới hạn sử dụng AI, thử lại sau", purpose, resetsAt: resetsAt?.toISOString() ?? null }, 429);

/** Failure codes raised by the provider side; jobs that fail with them do not consume the daily quota. */
export const PROVIDER_SIDE_FAILURES = ["PROVIDER_UNAVAILABLE", "PROVIDER_TIMEOUT"] as const;

type JobRow = {
  id: string; classId: string; lessonId: string; targetKind: string | null; status: string; failureCode: string | null;
  promptVersion: string; outputSchemaVersion: string; model: string; request: unknown; droppedItems: unknown;
  inputTokens: number | null; outputTokens: number | null; materializedResourceId: string | null;
  createdAt: Date; completedAt: Date | null;
  estimatedCredits?: number | null; chargedCredits?: number | null;
};
type ItemRow = {
  id: string; position: number; payload: unknown; flags: unknown;
  decisions?: Array<{ decision: string; editedPayload: unknown; reasonCode: string | null; createdAt: Date }>;
  duplicateOf?: DuplicateMatch[];
  decisionFlags?: string[];
};

/** AiJobView (implementation-contract.md). `items` is present only on the detail route. */
export function toAiJobView(job: JobRow, options: { lessonChangedSinceGeneration: boolean; items?: ItemRow[]; itemCount?: number; credits?: boolean }) {
  const { lessonChangedSinceGeneration, items } = options;
  const itemCount = items?.length ?? options.itemCount ?? null;
  const dropped = Array.isArray(job.droppedItems) ? job.droppedItems : [];
  const succeeded = job.status === "SUCCEEDED";
  const validated = succeeded || job.failureCode === "OUTPUT_VALIDATION_FAILED";
  return {
    id: job.id,
    classId: job.classId,
    lessonId: job.lessonId,
    targetKind: job.targetKind,
    status: job.status,
    failureCode: job.failureCode,
    promptVersion: job.promptVersion,
    outputSchemaVersion: job.outputSchemaVersion,
    model: options.credits ? "" : job.model,
    requestedCount: Number((job.request as { itemCount?: unknown })?.itemCount ?? 0),
    validCount: succeeded ? itemCount : validated ? 0 : null,
    droppedCount: validated ? dropped.length : null,
    // TAI-05: with credits on, a teacher never sees raw provider tokens or the model name (`usage` is omitted and `model`
    // is blank); cost is shown in credits through `credits`.
    ...(options.credits ? {} : { usage: { inputTokens: job.inputTokens, outputTokens: job.outputTokens } }),
    lessonChangedSinceGeneration,
    materializedResourceId: job.materializedResourceId,
    createdAt: job.createdAt.toISOString(),
    completedAt: job.completedAt?.toISOString() ?? null,
    ...(options.credits ? { credits: jobCredits(job) } : {}),
    ...(items
      ? {
          items: items.map((item) => {
            const latest = item.decisions?.[0];
            return {
              id: item.id,
              position: item.position,
              payload: item.payload as object,
              flags: Array.isArray(item.flags) ? (item.flags as string[]) : [],
              duplicateOf: item.duplicateOf ?? [],
              decision: latest
                ? { decision: latest.decision, editedPayload: (latest.editedPayload as object | null) ?? null, reasonCode: latest.reasonCode, at: latest.createdAt.toISOString(), flags: item.decisionFlags ?? [] }
                : null,
            };
          }),
        }
      : {}),
  };
}

/**
 * Credit view of one job (credits only): `reserved` while it runs, `settled` with the charge and the part returned,
 * `refunded` in full when it failed or was cancelled. Null estimate means the job was created with credits off.
 */
export function jobCredits(job: Pick<JobRow, "status" | "estimatedCredits" | "chargedCredits">) {
  const estimated = job.estimatedCredits ?? null;
  if (estimated === null) return null;
  if (job.status === "PENDING" || job.status === "RUNNING") return { estimated, state: "reserved" as const, charged: null, refunded: null };
  if (job.status === "SUCCEEDED") {
    const charged = job.chargedCredits ?? null;
    return { estimated, state: "settled" as const, charged, refunded: charged === null ? null : estimated - charged };
  }
  return { estimated, state: "refunded" as const, charged: 0, refunded: estimated };
}
