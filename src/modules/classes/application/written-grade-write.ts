import { ConflictException } from "@nestjs/common";
import { audit } from "../../../common/audit";
import { writtenGradeSelect } from "./assignment-test-state";
import { buildWrittenGrade } from "./assignment-written-contract";
import { assertGradeMatchesSuggestion, type SuggestionRow } from "./assignment-written-ai";

/** TAI-07 (TAI7-T3): grade writes, quick-approve and retake grants are refused while the column is locked. */
export function assertGradebookUnlocked(assignment: { gradebookLockedAt?: Date | null }) {
  if (assignment.gradebookLockedAt)
    throw new ConflictException({ code: "GRADEBOOK_LOCKED", message: "Sổ điểm của bài này đã chốt; hãy mở khóa sổ trước khi thay đổi điểm" });
}

/**
 * The single writer of WrittenGradeDecision (TAI2-T3/T6, reused by TAI7-T3 quick-approve): validates the points against the
 * answered rubric (`buildWrittenGrade`), checks an `*_AI` kind against its stored suggestion (`assertGradeMatchesSuggestion`),
 * appends the row and writes the audit row. The caller holds the assignment lock and has checked gradeability.
 */
export async function appendWrittenGrade(
  tx: any,
  input: {
    actor: { sub: string; role: string };
    submission: { id: string; resourceVersion: number };
    rubricContent: unknown;
    kind: "MANUAL" | "ACCEPTED_AI" | "EDITED_AI" | "REJECTED_AI";
    criterionPoints: Array<{ promptId: string; criterionCode: string; points: number }>;
    feedback: string | null;
    basedOnSuggestionId?: string | null;
    suggestion?: SuggestionRow | null;
  },
) {
  const grade = buildWrittenGrade(input.rubricContent, input.criterionPoints);
  if (input.kind !== "MANUAL") assertGradeMatchesSuggestion(input.kind, input.suggestion ?? null, input.submission, grade.criterionPoints);
  const row = await tx.writtenGradeDecision.create({
    data: {
      submissionId: input.submission.id,
      actorId: input.actor.sub,
      kind: input.kind,
      basedOnSuggestionId: input.kind === "MANUAL" ? null : input.basedOnSuggestionId ?? null,
      criterionPoints: grade.criterionPoints,
      totalPoints: grade.totalPoints,
      maxPoints: grade.maxPoints,
      score: grade.score,
      feedback: input.feedback,
      resourceVersion: input.submission.resourceVersion,
    },
    select: writtenGradeSelect,
  });
  await audit(tx, {
    actor: input.actor,
    action: "written_grade.create",
    targetType: "AssignmentSubmission",
    targetId: input.submission.id,
    after: {
      submissionId: input.submission.id,
      kind: input.kind,
      score: grade.score,
      resourceVersion: input.submission.resourceVersion,
      basedOnSuggestionId: input.kind === "MANUAL" ? null : input.basedOnSuggestionId ?? null,
    },
  });
  return { row, grade };
}
