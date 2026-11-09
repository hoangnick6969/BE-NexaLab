import { ConflictException, NotFoundException } from "@nestjs/common";
import { z } from "zod";

/** TAI2-T4 request contract: POST classes/:id/assignments/:aid/ai-assessments (implementation-contract.md). */
export const ASSESS_PURPOSE = "ASSESS_SUBMISSION" as const;
export const MAX_SUBMISSIONS_PER_REQUEST = 50;

export const aiAssessmentRequestBody = z
  .object({
    submissionIds: z.array(z.string().trim().min(1).max(64)).min(1).max(MAX_SUBMISSIONS_PER_REQUEST),
    /** TAI-05: unit price x requested submissions. Required while AI_CREDITS_ENABLED=true, ignored otherwise. */
    confirmedCredits: z.number().int().min(0).max(100_000).optional(),
  })
  .strict();

/**
 * Skip reasons (TAI2-T0 decision 2026-11-09 under policy g2-pii-scrub@1). AI_POLICY_INELIGIBLE carries a `detail`:
 * IDENTIFIER_IN_PAYLOAD (the fail-closed guard found an identifier in a teacher-authored field), REDACTION_DOMINANT
 * (more than half of a response is personal data) or RESPONSE_MISSING. CONSENT_REQUIRED is used only by a policy with
 * consentRequired = true (g2-pii-scrub@1 has false). LESSON_UNAVAILABLE: the written task has no lesson any more.
 */
export type SkipReason = "NOT_GRADEABLE" | "NOT_CURRENT" | "AI_POLICY_INELIGIBLE" | "CONSENT_REQUIRED" | "ALREADY_SUGGESTED" | "LESSON_UNAVAILABLE";

/** Job states that block a second job for the same submission and prompt version; FAILED and CANCELLED do not. */
export const BLOCKING_JOB_STATUSES = ["PENDING", "RUNNING", "SUCCEEDED"] as const;

export const aiAssessmentDisabled = () =>
  new ConflictException({ code: "AI_ASSESSMENT_DISABLED", message: "Gợi ý chấm bằng AI đang tắt cho hệ thống này" });
export const assignmentNotFound = () =>
  new NotFoundException({ code: "ASSIGNMENT_NOT_FOUND", message: "Không tìm thấy bài tự luận đã giao" });
export const submissionNotFound = () => new NotFoundException({ code: "SUBMISSION_NOT_FOUND", message: "Không tìm thấy bài nộp" });

/** Failure code of a job whose stored payload failed the privacy guard at run time (non-retryable, nothing sent). */
export const PRIVACY_GUARD_FAILURE = "PRIVACY_GUARD_REJECTED" as const;
