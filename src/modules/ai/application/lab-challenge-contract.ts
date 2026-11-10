import { BadRequestException, ConflictException } from "@nestjs/common";
import { z } from "zod";

/**
 * TAI-06 contract (spec-teacher-ai-lab-drafting/implementation-contract.md): create body branch, proposal output
 * schema `lab-challenge-proposals@1`, error factories and the teacher-facing job view. The AI only ever names an
 * allowlisted lab and parameter values; the engine and `challengeParamErrors` stay authoritative.
 */
export const LAB_CHALLENGE_PURPOSE = "DRAFT_LAB_CHALLENGE" as const;
export const LAB_CHALLENGE_PROMPT_VERSION = "draft-lab-challenge@1";
export const LAB_CHALLENGE_SCHEMA_VERSION = "lab-challenge-proposals@1";
export const LAB_CHALLENGE_INPUT_VERSION = "lab-challenge-input@1";
export const MAX_PROPOSALS_PER_JOB = 3;
export const LAB_CHALLENGE_MAX_OUTPUT_TOKENS = 2_048;

/** Create body branch (a `.strict()` member of the TAI-01 discriminated union on `purpose`). */
export const labChallengeBody = z
  .object({
    purpose: z.literal(LAB_CHALLENGE_PURPOSE),
    lessonId: z.string().trim().min(1).max(64),
    proposalCount: z.number().int().min(1).max(MAX_PROPOSALS_PER_JOB),
    instruction: z.string().trim().max(1000).optional(),
    /** TAI-05: the estimate the teacher confirmed. Required while AI_CREDITS_ENABLED=true, ignored otherwise. */
    confirmedCredits: z.number().int().min(0).max(100_000).optional(),
  })
  .strict();
export type LabChallengeBody = z.infer<typeof labChallengeBody>;

/**
 * Normalized request stored on AiJob.request and hashed for idempotency. `itemCount` mirrors `proposalCount` so the
 * TAI-05 credit lifecycle (estimate and proration read `request.itemCount`) prices this purpose without a special case.
 */
export function normalizeLabChallengeBody(body: LabChallengeBody) {
  return {
    purpose: LAB_CHALLENGE_PURPOSE,
    lessonId: body.lessonId,
    proposalCount: body.proposalCount,
    itemCount: body.proposalCount,
    instruction: body.instruction ? body.instruction : null,
  };
}
export type NormalizedLabChallengeRequest = ReturnType<typeof normalizeLabChallengeBody>;

/** Teacher rejects one proposal; accepting goes through the apply route, EDITED is never allowed. */
export const labDecisionBody = z
  .object({
    decision: z.literal("REJECTED"),
    reasonCode: z.string().trim().regex(/^[A-Z][A-Z0-9_]{1,47}$/),
  })
  .strict();

/** `lab-challenge-proposals@1`: structure and types only; every semantic rule is a per-proposal drop rule (LV-01..LV-09). */
const proposal = z
  .object({
    labId: z.string(),
    challengeParams: z.record(z.union([z.number(), z.string()])),
    rationale: z.string(),
    outcomeCodes: z.array(z.string()),
    sourceRefs: z.array(z.string()),
  })
  .strict();
export const labChallengeProposalsV1 = z.object({ proposals: z.array(proposal).min(1).max(MAX_PROPOSALS_PER_JOB) }).strict();
export type LabChallengeProposal = z.infer<typeof proposal>;

/** Drop reason codes (LV-01..LV-09 plus the two structural ones the contract leaves implicit). */
export type LabDropReason =
  | "MODEL_NOT_ALLOWED"
  | "PARAMS_OUT_OF_RANGE"
  | "PARAMS_OUTSIDE_PACK_RANGE"
  | "GROUNDING_REF_INVALID"
  | "OUTCOME_INVALID"
  | "NO_REFERENCE_STATES"
  | "CHALLENGE_UNSOLVABLE"
  | "CHALLENGE_NOT_DISCRIMINATING"
  | "DUPLICATE_PROPOSAL"
  | "SAFETY_REJECTED"
  | "LENGTH_INVALID"
  | "OVER_COUNT";

/** Engine evidence stored in `AiJobItem.flags` for each kept proposal. */
export type LabChallengeFlags = {
  engineResults: Array<{ label: string; verdict: string }>;
  objectivePreview: string;
  engineVersion: string;
  modelRef: string;
  referenceSource: string | null;
};

// Error factories. Messages are Vietnamese, following the existing envelope.
export const aiNoApprovedModels = () =>
  new ConflictException({ code: "AI_NO_APPROVED_MODELS", message: "Chưa có mô hình thực hành nào được duyệt phạm vi tham số" });
export const aiProposalNoLongerValid = () =>
  new ConflictException({ code: "AI_PROPOSAL_NO_LONGER_VALID", message: "Gợi ý không còn hợp lệ vì phạm vi tham số hoặc danh sách mô hình đã thay đổi" });
export const aiJobAlreadyApplied = () =>
  new ConflictException({ code: "AI_JOB_ALREADY_APPLIED", message: "Một gợi ý của yêu cầu AI này đã được áp dụng" });
export const aiDecisionNotAllowed = () =>
  new BadRequestException({ code: "VALIDATION_FAILED", message: "Gợi ý thử thách chỉ có thể bỏ hoặc áp dụng", details: [{ path: "decision", message: "only REJECTED" }] });
