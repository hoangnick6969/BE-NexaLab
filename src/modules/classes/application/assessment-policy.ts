import { BadRequestException } from "@nestjs/common";
import { z } from "zod";

/**
 * TAI-07 (TAI7-T1, AD-19): pure assessment-mode policy. PRACTICE keeps the I3/TAI-02 lifecycle unchanged;
 * REGULAR_15M (thường xuyên, hệ số 1) and MIDTERM_45M (giữa kỳ, hệ số 2) are graded: one server-timed attempt per
 * student (plus one per teacher retake grant), results hidden from students and parents until the teacher publishes.
 */
export const ASSESSMENT_TYPES = ["PRACTICE", "REGULAR_15M", "MIDTERM_45M"] as const;
export type AssessmentType = (typeof ASSESSMENT_TYPES)[number];
export const assessmentTypeSchema = z.enum(ASSESSMENT_TYPES);

export const ASSESSMENT_POLICY: Record<AssessmentType, { coefficient: number | null; defaultMinutes: number | null; minMinutes: number; maxMinutes: number }> = {
  PRACTICE: { coefficient: null, defaultMinutes: null, minMinutes: 0, maxMinutes: 0 },
  REGULAR_15M: { coefficient: 1, defaultMinutes: 15, minMinutes: 5, maxMinutes: 60 },
  MIDTERM_45M: { coefficient: 2, defaultMinutes: 45, minMinutes: 15, maxMinutes: 120 },
};

/** Content types that may be graded. T4 adds "exam". */
export const GRADED_CONTENT_TYPES = ["test", "written"] as const;

/** Network grace after `expiresAt` for drafts and submissions already in flight (AM-G1). */
export const SESSION_GRACE_MS = 30_000;
/** Client autosave cadence (AM-G1); the server does not enforce it, it is part of the FE contract. */
export const DRAFT_AUTOSAVE_MS = 20_000;

export const isGraded = (type: string | null | undefined): boolean => type === "REGULAR_15M" || type === "MIDTERM_45M";

/**
 * Validates and completes the assessment settings of a new assignment. A graded type without a duration takes the
 * policy default; PRACTICE never carries a duration.
 */
export function resolveAssessmentConfig(contentType: string, assessmentType: AssessmentType | undefined, durationMinutes: number | null | undefined) {
  const type: AssessmentType = assessmentType ?? "PRACTICE";
  if (type === "PRACTICE") {
    if (durationMinutes !== undefined && durationMinutes !== null)
      throw new BadRequestException({ code: "ASSESSMENT_DURATION_INVALID", message: "Bài luyện tập không có thời gian làm bài" });
    return { assessmentType: type, durationMinutes: null };
  }
  if (!(GRADED_CONTENT_TYPES as readonly string[]).includes(contentType))
    throw new BadRequestException({ code: "ASSESSMENT_TYPE_UNSUPPORTED", message: "Chỉ bài kiểm tra trắc nghiệm hoặc tự luận mới giao được dưới dạng bài kiểm tra lấy điểm" });
  const policy = ASSESSMENT_POLICY[type];
  const minutes = durationMinutes ?? policy.defaultMinutes!;
  if (!Number.isInteger(minutes) || minutes < policy.minMinutes || minutes > policy.maxMinutes)
    throw new BadRequestException({
      code: "ASSESSMENT_DURATION_INVALID",
      message: `Thời gian làm bài phải từ ${policy.minMinutes} đến ${policy.maxMinutes} phút`,
    });
  return { assessmentType: type, durationMinutes: minutes };
}

/** expiresAt = min(startedAt + duration, dueAt). */
export function sessionExpiry(startedAt: Date, durationMinutes: number, dueAt: Date): Date {
  return new Date(Math.min(startedAt.getTime() + durationMinutes * 60_000, dueAt.getTime()));
}

/** Results are visible to students and parents for PRACTICE, and for graded work only after publication. */
export function resultVisible(assignment: { assessmentType?: string | null; scoresPublishedAt?: Date | null }): boolean {
  return !isGraded(assignment.assessmentType) || !!assignment.scoresPublishedAt;
}

/**
 * 10-point scale from raw points: raw / max × 10, rounded half-up to one decimal (Vietnamese gradebook). The epsilon
 * absorbs binary representation error on exact halves (0.25 → 2.5, 0.85 → 8.5). Null when there is no maximum.
 */
export function toScale10(raw: number, max: number): number | null {
  if (!Number.isFinite(raw) || !Number.isFinite(max) || max <= 0) return null;
  return Math.round((raw / max) * 100 + 1e-9) / 10;
}

/** Student/parent-facing summary of the assessment settings and this student's attempts. */
export function assessmentSummary(
  assignment: { assessmentType?: string | null; durationMinutes?: number | null; scoresPublishedAt?: Date | null },
  attempts: { used: number; grants: number; openSession: null | { id: string; attemptNo: number; startedAt: Date; expiresAt: Date } } = { used: 0, grants: 0, openSession: null },
) {
  const type = (assignment.assessmentType ?? "PRACTICE") as AssessmentType;
  const graded = isGraded(type);
  return {
    type,
    graded,
    coefficient: ASSESSMENT_POLICY[type].coefficient,
    durationMinutes: graded ? assignment.durationMinutes ?? null : null,
    attemptsAllowed: graded ? 1 + attempts.grants : null,
    attemptsUsed: attempts.used,
    openSession: graded ? attempts.openSession : null,
    resultPublished: resultVisible(assignment),
  };
}
