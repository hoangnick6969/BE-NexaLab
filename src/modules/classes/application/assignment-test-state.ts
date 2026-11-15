import { examTotal10, writtenContentType, EXAM_CONTENT_TYPE } from "./exam-contract";
import { studentTestState } from "./assignment-test-contract";
import { studentWrittenState } from "./assignment-written-contract";
import { isGraded, resultVisible, toScale10 } from "./assessment-policy";

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
 * TAI-07 (AD-19): adds the 10-point score to a submission view and, when the result is hidden, removes every result
 * field (score, correctCount, grade) and marks it `resultHidden`. A rejected-zero row of a PRACTICE assignment keeps 0.
 */
function withScale10(view: any, hidden: boolean) {
  if (!view) return view;
  if (hidden) {
    const { score: _s, correctCount: _c, grade: _g, ...rest } = view;
    return { ...rest, score: null, correctCount: null, ...(view.grade !== undefined ? { grade: null } : {}), score10: null, resultHidden: true };
  }
  const grade = view.grade;
  const score10 =
    view.status === "REJECTED_ZERO" ? 0
      : grade ? toScale10(grade.totalPoints, grade.maxPoints)
      : typeof view.correctCount === "number" && view.questionCount ? toScale10(view.correctCount, view.questionCount)
      : null;
  return { ...view, score10, resultHidden: false };
}

function applyVisibility(state: any, hidden: boolean) {
  return {
    ...state,
    current: withScale10(state.current, hidden),
    history: state.history.map((row: any) => withScale10(row, hidden)),
    resultHidden: hidden && !!state.current,
  };
}

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
  options: { withResponses?: boolean; withGrade?: boolean; revealResults?: boolean } = {},
) {
  const [deadlines, submissions, settings] = await Promise.all([
    currentDeadlines(db, assignments),
    db.assignmentSubmission.findMany({
      where: { assignmentId: { in: assignments.map((a) => a.id) }, studentId: { in: studentIds } },
      // TAI2-T3: grades are read newest first; a grade never changes a TEST state (studentTestState ignores it).
      select: {
        ...submissionSelect,
        ...(options.withResponses ? { answers: true } : {}),
        autoSubmitted: true,
        ...(assignments.some((a) => a.contentType === EXAM_CONTENT_TYPE) ? { examComponents: true } : {}),
        gradeDecisions: { orderBy: { createdAt: "desc" }, select: writtenGradeSelect },
      },
    }),
    // TAI-07: visibility is read here, not from the caller, so a caller that forgets it fails closed.
    db.assignment.findMany({ where: { id: { in: assignments.map((a) => a.id) } }, select: { id: true, assessmentType: true, scoresPublishedAt: true } }),
  ]);
  const settingsOf = new Map<string, any>(settings.map((row: any) => [row.id, row]));
  const states = new Map<string, DeadlineState>();
  for (const a of assignments) {
    const deadline = deadlines.get(a.id);
    if (!deadline) continue;
    for (const studentId of studentIds) {
      const rows = submissions.filter((row: any) => row.assignmentId === a.id && row.studentId === studentId);
      const input = { dueAt: deadline.dueAt, revision: deadline.revision, submissions: rows, now };
      const row = settingsOf.get(a.id) ?? {};
      const hidden = options.revealResults !== true && !resultVisible(row);
      const state =
        writtenContentType(a.contentType)
          ? studentWrittenState({ ...input, withResponses: options.withResponses, withGrade: options.withGrade })
          : studentTestState(input);
      const visible: any = applyVisibility(state, hidden);
      // TAI-07: the current submission says whether the server submitted it at expiry (never a result field).
      const addExamResult = (view: any) => {
        if (!view || hidden || a.contentType !== EXAM_CONTENT_TYPE) return view;
        const submission = rows.find((r: any) => r.id === view.id);
        if (!submission?.examComponents) return view;
        const score10 = examTotal10(submission.examComponents, submission.gradeDecisions?.[0]?.totalPoints);
        return { ...view, score10, score: score10 === null ? null : score10 * 10 };
      };
      visible.history = visible.history.map(addExamResult);
      if (visible.current) visible.current = { ...addExamResult(visible.current), autoSubmitted: !!rows.find((r: any) => r.id === visible.current.id)?.autoSubmitted };
      states.set(a.id + ":" + studentId, { ...visible, graded: isGraded(row.assessmentType) } as DeadlineState);
    }
  }
  return { deadlines, states, key: (assignmentId: string, studentId: string) => assignmentId + ":" + studentId };
}
