import { submissionStatus, TEST_CONTENT_TYPE } from "../../../classes/application/assignment-test-contract";
import type { InsightEvidence } from "./types";

export type ClassMember = { id: string; displayName: string };
export type ClassEvidence = { members: ClassMember[]; evidenceByStudent: Map<string, InsightEvidence[]> };

const codesOf = (value: unknown): string[] => (Array.isArray(value) ? value.filter((x): x is string => typeof x === "string") : []);

/**
 * Loads normalized evidence for the approved members of one class (or one of them) for the `insights@1` engine.
 *
 * Scope (implementation-contract.md, TAI4-T2): every assignment of the class including archived ones, approved
 * members only, never free practice or other classes. TEST rows count only when `gradingMode = AUTO` with a score and
 * a status of SCORED or ACCEPTED_BY_EXTENSION.
 *
 * Cost: stage 1 runs two queries in parallel, stage 2 runs six in parallel, and a lesson lookup follows only for lessons
 * not already known. The count does not depend on the number of students.
 */
export async function loadClassEvidence(db: any, classId: string, options: { studentId?: string; withEvidence?: boolean } = {}): Promise<ClassEvidence> {
  const [enrollments, assignments] = await Promise.all([
    db.enrollment.findMany({
      where: { classId, status: "approved", ...(options.studentId ? { studentId: options.studentId } : {}) },
      select: { studentId: true, student: { select: { id: true, fullName: true } } },
    }),
    db.assignment.findMany({ where: { classId }, select: { id: true, contentType: true, contentId: true } }),
  ]);
  const members: ClassMember[] = enrollments.map((row: any) => ({ id: row.student.id, displayName: row.student.fullName }));
  const evidenceByStudent = new Map<string, InsightEvidence[]>(members.map((m) => [m.id, []]));
  if (options.withEvidence === false || !members.length || !assignments.length) return { members, evidenceByStudent };

  const studentIds = members.map((m) => m.id);
  const assignmentIds: string[] = assignments.map((a: any) => a.id);
  const testAssignments = assignments.filter((a: any) => a.contentType === TEST_CONTENT_TYPE);
  const lessonAssignmentIds: string[] = assignments.filter((a: any) => a.contentType === "lesson").map((a: any) => a.contentId);
  const attemptWhere = { assignmentId: { in: assignmentIds }, studentId: { in: studentIds } };

  const [quizzes, attempts, submissions, hints, steps, resources] = await Promise.all([
    db.quizAttempt.findMany({ where: attemptWhere, select: { id: true, studentId: true, lessonId: true, score: true, passed: true, createdAt: true } }),
    db.attempt.findMany({ where: attemptWhere, select: { id: true, studentId: true, lessonStepId: true, verdict: true, createdAt: true } }),
    testAssignments.length
      ? db.assignmentSubmission.findMany({
          where: { assignmentId: { in: testAssignments.map((a: any) => a.id) }, studentId: { in: studentIds }, gradingMode: "AUTO", score: { not: null } },
          select: { id: true, assignmentId: true, studentId: true, score: true, timing: true, submittedAt: true, decision: { select: { decision: true } } },
        })
      : Promise.resolve([]),
    db.hintLog.groupBy({ by: ["attemptId"], _max: { level: true }, where: { attempt: attemptWhere } }),
    lessonAssignmentIds.length ? db.lessonStep.findMany({ where: { lessonId: { in: lessonAssignmentIds } }, select: { id: true, lessonId: true } }) : Promise.resolve([]),
    testAssignments.length
      ? db.classResource.findMany({ where: { id: { in: testAssignments.map((a: any) => a.contentId) } }, select: { id: true, lessonId: true } })
      : Promise.resolve([]),
  ]);

  const stepLesson = new Map<string, string>(steps.map((s: any) => [s.id, s.lessonId]));
  const resourceLesson = new Map<string, string | null>(resources.map((r: any) => [r.id, r.lessonId]));
  const assignmentResource = new Map<string, string>(testAssignments.map((a: any) => [a.id, a.contentId]));
  const maxHint = new Map<string, number>(hints.map((h: any) => [h.attemptId, h._max?.level ?? 0]));

  const wanted = new Set<string>([...lessonAssignmentIds, ...quizzes.map((q: any) => q.lessonId), ...resources.map((r: any) => r.lessonId).filter(Boolean)]);
  const lessons = wanted.size ? await db.lesson.findMany({ where: { id: { in: [...wanted] } }, select: { id: true, outcomeCodes: true } }) : [];
  const outcomes = new Map<string, string[]>(lessons.map((l: any) => [l.id, codesOf(l.outcomeCodes)]));
  const outcomesOf = (lessonId: string | null | undefined) => (lessonId ? outcomes.get(lessonId) ?? [] : []);

  const push = (studentId: string, item: InsightEvidence) => evidenceByStudent.get(studentId)?.push(item);
  for (const q of quizzes)
    push(q.studentId, { kind: "QUIZ", id: q.id, at: q.createdAt, score: q.score, passed: q.passed, outcomeCodes: outcomesOf(q.lessonId) });
  for (const a of attempts)
    push(a.studentId, { kind: "PRACTICAL", id: a.id, at: a.createdAt, verdict: a.verdict, maxHintLevel: maxHint.get(a.id) ?? 0, outcomeCodes: outcomesOf(a.lessonStepId ? stepLesson.get(a.lessonStepId) : null) });
  for (const s of submissions) {
    const status = submissionStatus({ timing: s.timing, decision: s.decision });
    if (status !== "SCORED" && status !== "ACCEPTED_BY_EXTENSION") continue;
    const lessonId = resourceLesson.get(assignmentResource.get(s.assignmentId) ?? "") ?? null;
    push(s.studentId, { kind: "TEST", id: s.id, at: s.submittedAt, score: s.score, outcomeCodes: outcomesOf(lessonId) });
  }
  return { members, evidenceByStudent };
}
