import { ConflictException } from "@nestjs/common";

/**
 * TAI2-T6 assisted grading rules on the classes side (pure). The grade stays a teacher decision: an `*_AI` kind only
 * records which stored suggestion the teacher looked at. AI never writes, finalizes or publishes a grade.
 *
 * Suggestions are read from the AiAssessmentSuggestion table, which the `ai` module writes; this file only projects
 * and checks stored rows, so `classes` does not import the `ai` module (layering: ai sits above classes).
 */
export type SuggestionRow = {
  id: string;
  submissionId: string;
  resourceVersion: number;
  promptVersion: string;
  mode: string;
  status: "VALID" | "PARTIAL" | "SUPPRESSED";
  criterionResults: unknown;
  flags: unknown;
  createdAt: Date;
};

type StoredCriterion = {
  promptId: string;
  criterionCode: string;
  valid: boolean;
  reasonCode: string | null;
  suggestedPoints: number | null;
  rationale: string | null;
  uncertainty: string | null;
  evidence: Array<{ quote: string; start: number; end: number }>;
};

export const suggestionSelect = { id: true, submissionId: true, resourceVersion: true, promptVersion: true, mode: true, status: true, criterionResults: true, flags: true, createdAt: true } as const;

const criteriaOf = (row: SuggestionRow): StoredCriterion[] => (Array.isArray(row.criterionResults) ? (row.criterionResults as StoredCriterion[]) : []);

/**
 * Teacher-only view of one suggestion (assist mode only; the caller decides). Invalid criteria carry no points,
 * rationale or evidence: the UI shows "AI không đưa ra gợi ý hợp lệ". Evidence offsets point into the student's
 * original answer of the same prompt.
 */
export function teacherSuggestionView(row: SuggestionRow) {
  return {
    id: row.id,
    status: row.status,
    promptVersion: row.promptVersion,
    resourceVersion: row.resourceVersion,
    flags: Array.isArray(row.flags) ? (row.flags as string[]) : [],
    createdAt: row.createdAt,
    criteria: criteriaOf(row).map((c) => ({
      promptId: c.promptId,
      criterionCode: c.criterionCode,
      valid: c.valid,
      reasonCode: c.reasonCode,
      suggestedPoints: c.valid ? c.suggestedPoints : null,
      rationale: c.valid ? c.rationale : null,
      uncertainty: c.valid ? c.uncertainty : null,
      evidence: c.valid ? c.evidence.map((e) => ({ start: e.start, end: e.end })) : [],
    })),
  };
}

const mismatch = (message: string) => new ConflictException({ code: "SUGGESTION_MISMATCH", message });

/**
 * Checks an `*_AI` grade against the suggestion it is based on (implementation-contract.md, grade route):
 * - the suggestion belongs to this submission and resource version and was created in assist mode;
 * - ACCEPTED_AI only on a VALID suggestion and with exactly the suggested points for every criterion;
 * - EDITED_AI and REJECTED_AI on VALID or PARTIAL suggestions (a SUPPRESSED one has nothing to accept or reject: grade MANUAL).
 * The stored points are always the teacher's (buildWrittenGrade validated them already).
 */
export function assertGradeMatchesSuggestion(
  kind: "ACCEPTED_AI" | "EDITED_AI" | "REJECTED_AI",
  suggestion: SuggestionRow | null,
  submission: { id: string; resourceVersion: number },
  criterionPoints: Array<{ promptId: string; criterionCode: string; points: number }>,
) {
  if (!suggestion || suggestion.submissionId !== submission.id) throw mismatch("Gợi ý AI không thuộc bài nộp này");
  if (suggestion.mode !== "assist") throw mismatch("Gợi ý này được tạo ở chế độ đánh giá thử, không dùng để chấm");
  if (suggestion.resourceVersion !== submission.resourceVersion) throw mismatch("Gợi ý AI được tạo cho phiên bản biểu điểm khác");
  if (suggestion.status === "SUPPRESSED") throw mismatch("Gợi ý AI không hợp lệ; hãy chấm thủ công");
  if (kind !== "ACCEPTED_AI") return;
  if (suggestion.status !== "VALID") throw mismatch("Chỉ có thể dùng nguyên gợi ý khi mọi tiêu chí đều hợp lệ");
  const suggested = criteriaOf(suggestion);
  const differs = criterionPoints.some((row) => {
    const match = suggested.find((c) => c.promptId === row.promptId && c.criterionCode === row.criterionCode);
    return !match || !match.valid || match.suggestedPoints !== row.points;
  });
  if (differs || suggested.length !== criterionPoints.length) throw mismatch("Điểm khác với gợi ý AI; hãy lưu dưới dạng đã sửa");
}
