import { studentTestState } from "./assignment-test-contract";
import { studentWrittenState, WRITTEN_CONTENT_TYPE } from "./assignment-written-contract";

/** Columns of a grade decision that the written views may read (no actor, no suggestion fields). */
export const writtenGradeSelect = { id: true, kind: true, score: true, totalPoints: true, maxPoints: true, criterionPoints: true, feedback: true, resourceVersion: true, createdAt: true } as const;

const submissionSelect = {
  id: true,
  assignmentId: true,
  studentId: true,
  timing: true,
  score: true,
  correctCount: true,
  gradingMode: true,
  questionCount: true,
  lateReason: true,
  submittedAt: true,
  deadlineRevision: { select: { revision: true } },
  decision: { select: { decision: true, note: true, createdAt: true } },
} as const;

/** Latest deadline revision of each assignment; falls back to `dueDate` for rows without history. */
export async function currentDeadlines(db: any, assignments: Array<{ id: string; dueDate: Date | null }>) {
  const revisions = await db.assignmentDeadlineRevision.findMany({
    where: { assignmentId: { in: assignments.map((a) => a.id) } },
    orderBy: { revision: "desc" },
    select: { id: true, assignmentId: true, revision: true, dueAt: true },
  });
  const map = new Map<string, { id: string | null; revision: number; dueAt: Date }>();
  for (const row of revisions) if (!map.has(row.assignmentId)) map.set(row.assignmentId, row);
  for (const a of assignments) if (!map.has(a.id) && a.dueDate) map.set(a.id, { id: null, revision: 1, dueAt: a.dueDate });
  return map;
}

/**
 * Server-derived test state per (assignment, student) for the given targets.
 * Every role reads through this, so their statuses cannot disagree.
 */
export async function testStates(db: any, assignments: Array<{ id: string; dueDate: Date | null }>, studentIds: string[], now = new Date()) {
  const [deadlines, submissions] = await Promise.all([
    currentDeadlines(db, assignments),
    db.assignmentSubmission.findMany({
      where: { assignmentId: { in: assignments.map((a) => a.id) }, studentId: { in: studentIds } },
      select: submissionSelect,
    }),
  ]);
  const states = new Map<string, ReturnType<typeof studentTestState>>();
  for (const a of assignments) {
    const deadline = deadlines.get(a.id);
    if (!deadline) continue;
    for (const studentId of studentIds)
      states.set(
        a.id + ":" + studentId,
        studentTestState({
          dueAt: deadline.dueAt,
          revision: deadline.revision,
          submissions: submissions.filter((row: any) => row.assignmentId === a.id && row.studentId === studentId),
          now,
        }),
      );
  }
  return { deadlines, states, key: (assignmentId: string, studentId: string) => assignmentId + ":" + studentId };
}

type DeadlineState = ReturnType<typeof studentTestState> | ReturnType<typeof studentWrittenState>;

/**
 * TAI-02: test and written assignments share the deadline lifecycle. Each assignment is derived by
 * its own kind: TEST through studentTestState (unchanged), written through studentWrittenState.
 * `withResponses` adds the student's own written responses (student self-views only).
 */
export async function deadlineStates(
  db: any,
  assignments: Array<{ id: string; dueDate: Date | null; contentType: string }>,
  studentIds: string[],
  now = new Date(),
  options: { withResponses?: boolean; withGrade?: boolean } = {},
) {
  const [deadlines, submissions] = await Promise.all([
    currentDeadlines(db, assignments),
    db.assignmentSubmission.findMany({
      where: { assignmentId: { in: assignments.map((a) => a.id) }, studentId: { in: studentIds } },
      // TAI2-T3: grades are read newest first; a grade never changes a TEST state (studentTestState ignores it).
      select: {
        ...submissionSelect,
        ...(options.withResponses ? { answers: true } : {}),
        gradeDecisions: { orderBy: { createdAt: "desc" }, select: writtenGradeSelect },
      },
    }),
  ]);
  const states = new Map<string, DeadlineState>();
  for (const a of assignments) {
    const deadline = deadlines.get(a.id);
    if (!deadline) continue;
    for (const studentId of studentIds) {
      const rows = submissions.filter((row: any) => row.assignmentId === a.id && row.studentId === studentId);
      const input = { dueAt: deadline.dueAt, revision: deadline.revision, submissions: rows, now };
      states.set(
        a.id + ":" + studentId,
        a.contentType === WRITTEN_CONTENT_TYPE
          ? studentWrittenState({ ...input, withResponses: options.withResponses, withGrade: options.withGrade })
          : studentTestState(input),
      );
    }
  }
  return { deadlines, states, key: (assignmentId: string, studentId: string) => assignmentId + ":" + studentId };
}
