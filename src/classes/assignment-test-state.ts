import { studentTestState } from "./assignment-test-contract";

const submissionSelect = {
  id: true,
  assignmentId: true,
  studentId: true,
  timing: true,
  score: true,
  correctCount: true,
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
