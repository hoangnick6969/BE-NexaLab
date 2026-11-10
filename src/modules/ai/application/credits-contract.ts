import { BadRequestException, ConflictException, HttpException, NotFoundException } from "@nestjs/common";
import { z } from "zod";

/** Upper bound of one grant, adjustment or confirmed value; keeps every balance inside a 32-bit integer. */
export const MAX_CREDITS_PER_OPERATION = 100_000;
export const MAX_BALANCE = 2_000_000_000;

export const confirmedCredits = z.number().int().min(0).max(MAX_CREDITS_PER_OPERATION);

const creditReason = z.string().trim().min(5, "Cần nêu lý do (ít nhất 5 ký tự)").max(500);

export const grantBody = z.object({ credits: z.number().int().min(1).max(MAX_CREDITS_PER_OPERATION), reason: creditReason }).strict();
export const adjustmentBody = z
  .object({ credits: z.number().int().min(-MAX_CREDITS_PER_OPERATION).max(MAX_CREDITS_PER_OPERATION), reason: creditReason })
  .strict()
  .refine((body) => body.credits !== 0, { path: ["credits"], message: "Số tín dụng điều chỉnh phải khác 0" });

export const adminAccountQuery = z
  .object({
    teacherId: z.string().trim().min(1).max(64),
    limit: z.coerce.number().int().min(1).max(100).default(25),
    cursor: z.string().trim().min(1).max(200).optional(),
  })
  .strict();

export const myCreditsQuery = z
  .object({ limit: z.coerce.number().int().min(1).max(50).default(20), cursor: z.string().trim().min(1).max(200).optional() })
  .strict();

const priceInt = z.number().int().min(0).max(MAX_CREDITS_PER_OPERATION);
export const createPricingBody = z
  .object({
    purpose: z.enum(["GENERATE_RESOURCE", "ASSESS_SUBMISSION", "DRAFT_LAB_CHALLENGE"]),
    baseCredits: priceInt,
    perItemCredits: priceInt,
    creditsPer1kInputTokens: priceInt,
    creditsPer1kOutputTokens: priceInt,
    evidenceRef: z.string().trim().min(1, "Cần dẫn chiếu bản ghi bằng chứng giá").max(300),
  })
  .strict();
export const listPricingQuery = z.object({ purpose: z.enum(["GENERATE_RESOURCE", "ASSESS_SUBMISSION", "DRAFT_LAB_CHALLENGE"]).optional() }).strict();

// Error factories. Details carry the numbers because the global filter forwards `details` only.
export const confirmedCreditsRequired = () =>
  new BadRequestException({
    code: "VALIDATION_FAILED",
    message: "Cần xác nhận số tín dụng ước tính (confirmedCredits)",
    details: [{ path: "confirmedCredits", message: "required while credits are enabled" }],
  });
export const aiEstimateChanged = (credits: number, pricingVersion: number) =>
  new ConflictException({ code: "AI_ESTIMATE_CHANGED", message: "Số tín dụng ước tính đã thay đổi, hãy xác nhận lại", details: { credits, pricingVersion } });
export const aiCreditsInsufficient = (available: number, required: number) =>
  new HttpException({ code: "AI_CREDITS_INSUFFICIENT", message: "Không đủ tín dụng cho yêu cầu này", details: { available, required } }, 402);
export const pricingNotActive = (purpose: string) =>
  new ConflictException({ code: "PRICING_NOT_ACTIVE", message: "Chưa có bảng giá đang áp dụng cho thao tác AI này", details: { purpose } });
export const creditBalanceNegative = (available: number) =>
  new ConflictException({ code: "CREDIT_BALANCE_NEGATIVE", message: "Điều chỉnh này sẽ làm số dư âm", details: { available } });
export const pricingNotFound = () => new NotFoundException({ code: "NOT_FOUND", message: "Không tìm thấy bảng giá" });
export const teacherNotFound = () => new NotFoundException({ code: "NOT_FOUND", message: "Không tìm thấy giáo viên" });
export const pricingNotDraft = () => new ConflictException({ code: "PRICING_NOT_DRAFT", message: "Chỉ bảng giá nháp mới kích hoạt được" });
export const pricingNotActiveToRetire = () => new ConflictException({ code: "PRICING_NOT_ACTIVE_VERSION", message: "Chỉ bảng giá đang áp dụng mới ngừng được" });
