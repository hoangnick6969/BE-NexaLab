import { submissionStatus, TEST_CONTENT_TYPE } from "../../../classes/application/assignment-test-contract";
import { WRITTEN_CONTENT_TYPE } from "../../../classes/application/assignment-written-contract";
import { EXPLANATION_CRITERION_CODES } from "./explanation-rule";
import type { ExplanationFact, InsightEvidence, SimilarityFact } from "./types";

export type ClassMember = { id: string; displayName: string };
export type AckRow = { id: string; studentId: string; fingerprint: string; ruleVersion: string; ruleCode: string; action: string; note: string | null; createdAt: Date };
export type ClassEvidence = {
  members: ClassMember[];
  evidenceByStudent: Map<string, InsightEvidence[]>;
  /** insights@2 inputs: valid matches of the newest similarity run of each written assignment, per student. */
  similarityByStudent: Map<string, SimilarityFact[]>;
  /** insights@3 inputs: teacher-final explanation grades of each student's current graded written submissions. */
  explanationsByStudent: Map<string, ExplanationFact[]>;
  acknowledgements: AckRow[];
};
export type LoadOptions = {
  studentId?: string;
  /** false: members only, no evidence and no acknowledgement queries. */
  withEvidence?: boolean;
  /** false: skip the acknowledgement query (replay reads one row itself). Default true. */
  acknowledgements?: boolean;
  /**
   * Replay: keep only what existed at this instant. Evidence needs `at <= asOf`, a late-submission decision counts only
   * when `createdAt <= asOf` (a later one is treated as absent) and hint levels use `HintLog.createdAt <= asOf`.
   */
  asOf?: Date;
};

const codesOf = (value: unknown): string[] => (Array.isArray(value) ? value.filter((x): x is string => typeof x === "string") : []);

/**
 * Loads normalized evidence for the approved members of one class (or one of them) for the insight engines.
 *
 * Scope (implementation-contract.md, TAI4-T2): every assignment of the class including archived ones, approved
 * members only, never free practice or other classes. TEST rows count only when `gradingMode = AUTO` with a score and
 * a status of SCORED or ACCEPTED_BY_EXTENSION.
 *
 * Cost: stage 1 runs three queries in parallel (members, assignments, acknowledgements), stage 2 runs six in parallel
 * (eleven when the class has a written assignment: its current submissions, its similarity runs, its HIGH matches with
 * review times, the teacher grade decisions and the written task resources), and a lesson lookup follows only for lessons not already known. The count does not depend on the number
 * of students.
 */
export async function loadClassEvidence(db: any, classId: string, options: LoadOptions = {}): Promise<ClassEvidence> {
  const wantAcks = options.withEvidence !== false && options.acknowledgements !== false;
  const [enrollments, assignments, acknowledgements] = await Promise.all([
    // Always every approved member: a similarity pair is valid only when both students are approved, even when the
    // caller asks about one student. `members` below is narrowed to that student.
    db.enrollment.findMany({
      where: { classId, status: "approved" },
      select: { studentId: true, student: { select: { id: true, fullName: true } } },
    }),
    db.assignment.findMany({ where: { classId }, select: { id: true, title: true, contentType: true, contentId: true } }),
    wantAcks
      ? db.insightAcknowledgement.findMany({
          where: { classId, ...(options.studentId ? { studentId: options.studentId } : {}) },
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
          select: { id: true, studentId: true, fingerprint: true, ruleVersion: true, ruleCode: true, action: true, note: true, createdAt: true },
        })
      : Promise.resolve([]),
  ]);
  const approvedIds: string[] = enrollments.map((row: any) => row.student.id);
  const members: ClassMember[] = enrollments
    .filter((row: any) => !options.studentId || row.student.id === options.studentId)
    .map((row: any) => ({ id: row.student.id, displayName: row.student.fullName }));
  const evidenceByStudent = new Map<string, InsightEvidence[]>(members.map((m) => [m.id, []]));
  const similarityByStudent = new Map<string, SimilarityFact[]>(members.map((m) => [m.id, []]));
  const explanationsByStudent = new Map<string, ExplanationFact[]>(members.map((m) => [m.id, []]));
  if (options.withEvidence === false || !members.length || !assignments.length) return { members, evidenceByStudent, similarityByStudent, explanationsByStudent, acknowledgements };

  const studentIds = members.map((m) => m.id);
  const assignmentIds: string[] = assignments.map((a: any) => a.id);
  const testAssignments = assignments.filter((a: any) => a.contentType === TEST_CONTENT_TYPE);
  const writtenAssignments = assignments.filter((a: any) => a.contentType === WRITTEN_CONTENT_TYPE);
  const writtenIds: string[] = writtenAssignments.map((a: any) => a.id);
  const lessonAssignmentIds: string[] = assignments.filter((a: any) => a.contentType === "lesson").map((a: any) => a.contentId);
  const asOf = options.asOf;
  const attemptWhere = { assignmentId: { in: assignmentIds }, studentId: { in: studentIds }, ...(asOf ? { createdAt: { lte: asOf } } : {}) };

  const [quizzes, attempts, submissions, hints, steps, resources, writtenSubs, simRuns, simMatches, writtenGrades, writtenResources] = await Promise.all([
    db.quizAttempt.findMany({ where: attemptWhere, select: { id: true, studentId: true, lessonId: true, score: true, passed: true, createdAt: true } }),
    db.attempt.findMany({ where: attemptWhere, select: { id: true, studentId: true, lessonStepId: true, verdict: true, createdAt: true } }),
    testAssignments.length
      ? db.assignmentSubmission.findMany({
          where: { assignmentId: { in: testAssignments.map((a: any) => a.id) }, studentId: { in: studentIds }, gradingMode: "AUTO", score: { not: null }, ...(asOf ? { submittedAt: { lte: asOf } } : {}) },
          select: { id: true, assignmentId: true, studentId: true, score: true, timing: true, submittedAt: true, decision: { select: { decision: true, createdAt: true } } },
        })
      : Promise.resolve([]),
    db.hintLog.groupBy({ by: ["attemptId"], _max: { level: true }, where: { attempt: attemptWhere, ...(asOf ? { createdAt: { lte: asOf } } : {}) } }),
    lessonAssignmentIds.length ? db.lessonStep.findMany({ where: { lessonId: { in: lessonAssignmentIds } }, select: { id: true, lessonId: true } }) : Promise.resolve([]),
    testAssignments.length
      ? db.classResource.findMany({ where: { id: { in: testAssignments.map((a: any) => a.contentId) } }, select: { id: true, lessonId: true } })
      : Promise.resolve([]),
    writtenIds.length
      ? db.assignmentSubmission.findMany({
          where: { assignmentId: { in: writtenIds }, studentId: { in: approvedIds }, ...(asOf ? { submittedAt: { lte: asOf } } : {}) },
          select: { id: true, assignmentId: true, studentId: true, submittedAt: true, timing: true, decision: { select: { decision: true, createdAt: true } } },
        })
      : Promise.resolve([]),
    writtenIds.length
      ? db.submissionSimilarityRun.findMany({ where: { assignmentId: { in: writtenIds }, ...(asOf ? { createdAt: { lte: asOf } } : {}) }, select: { id: true, assignmentId: true, createdAt: true } })
      : Promise.resolve([]),
    writtenIds.length
      ? db.submissionSimilarityMatch.findMany({
          where: { level: "HIGH", run: { assignmentId: { in: writtenIds }, ...(asOf ? { createdAt: { lte: asOf } } : {}) } },
          select: { id: true, runId: true, level: true, submissionAId: true, submissionBId: true, reviews: { select: { createdAt: true } } },
        })
      : Promise.resolve([]),
    // insights@3: teacher grades only (WrittenGradeDecision); the AI suggestion table is never read here.
    writtenIds.length
      ? db.writtenGradeDecision.findMany({
          where: { submission: { assignmentId: { in: writtenIds }, studentId: { in: studentIds } }, ...(asOf ? { createdAt: { lte: asOf } } : {}) },
          select: { id: true, submissionId: true, criterionPoints: true, createdAt: true },
        })
      : Promise.resolve([]),
    writtenIds.length
      ? db.classResource.findMany({ where: { id: { in: writtenAssignments.map((a: any) => a.contentId) } }, select: { id: true, lessonId: true, content: true } })
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
    push(q.studentId, { kind: "QUIZ", id: q.id, at: q.createdAt, score: q.score, passed: q.passed, outcomeCodes: outcomesOf(q.lessonId), lessonId: q.lessonId ?? null });
  for (const a of attempts)
    push(a.studentId, { kind: "PRACTICAL", id: a.id, at: a.createdAt, verdict: a.verdict, maxHintLevel: maxHint.get(a.id) ?? 0, outcomeCodes: outcomesOf(a.lessonStepId ? stepLesson.get(a.lessonStepId) : null), lessonId: (a.lessonStepId ? stepLesson.get(a.lessonStepId) : null) ?? null });
  for (const s of submissions) {
    const decision = s.decision && (!asOf || s.decision.createdAt.getTime() <= asOf.getTime()) ? s.decision : null;
    const status = submissionStatus({ timing: s.timing, decision });
    if (status !== "SCORED" && status !== "ACCEPTED_BY_EXTENSION") continue;
    const lessonId = resourceLesson.get(assignmentResource.get(s.assignmentId) ?? "") ?? null;
    push(s.studentId, { kind: "TEST", id: s.id, at: s.submittedAt, score: s.score, outcomeCodes: outcomesOf(lessonId), lessonId });
  }

  if (writtenIds.length) {
    // Newest run per written assignment; a match is valid while both submissions are still the current ones of their
    // students (both students are approved because only approved members' submissions were read). A stale run is not
    // dropped as a whole.
    const later = (a: any, b: any) => a.submittedAt.getTime() > b.submittedAt.getTime() || (a.submittedAt.getTime() === b.submittedAt.getTime() && a.id > b.id);
    const current = new Map<string, any>();
    for (const s of writtenSubs) {
      const key = s.assignmentId + ":" + s.studentId;
      const previous = current.get(key);
      if (!previous || later(s, previous)) current.set(key, s);
    }
    const currentById = new Map<string, any>([...current.values()].map((s) => [s.id, s]));
    const newest = new Map<string, any>();
    for (const run of simRuns) {
      const previous = newest.get(run.assignmentId);
      if (!previous || run.createdAt.getTime() > previous.createdAt.getTime() || (run.createdAt.getTime() === previous.createdAt.getTime() && run.id > previous.id)) newest.set(run.assignmentId, run);
    }
    const newestIds = new Set<string>([...newest.values()].map((r) => r.id));
    const runById = new Map<string, any>(simRuns.map((r: any) => [r.id, r]));
    const titles = new Map<string, string>(writtenAssignments.map((a: any) => [a.id, a.title]));
    for (const match of simMatches) {
      if (!newestIds.has(match.runId)) continue;
      const a = currentById.get(match.submissionAId);
      const b = currentById.get(match.submissionBId);
      const runAssignment = runById.get(match.runId).assignmentId;
      // Both submissions must belong to the assignment of the run: a pair never crosses assignments.
      if (!a || !b || a.studentId === b.studentId || a.assignmentId !== runAssignment || b.assignmentId !== runAssignment) continue;
      const reviewed = match.reviews.some((r: any) => !asOf || r.createdAt.getTime() <= asOf.getTime());
      for (const own of [a, b])
        similarityByStudent.get(own.studentId)?.push({
          assignmentId: own.assignmentId,
          assignmentTitle: titles.get(own.assignmentId) ?? "",
          submissionId: own.id,
          submittedAt: own.submittedAt,
          matchId: match.id,
          runAt: runById.get(match.runId).createdAt,
          level: match.level,
          reviewed,
        });
    }

    // insights@3: the teacher-final explanation score of each student's current written submission. The newest grade
    // decision of that submission counts; a current submission that is late-pending or rejected has no fact, and an older
    // submission never stands in for it.
    const gradeOf = new Map<string, any>();
    for (const g of writtenGrades) {
      const previous = gradeOf.get(g.submissionId);
      if (!previous || g.createdAt.getTime() > previous.createdAt.getTime() || (g.createdAt.getTime() === previous.createdAt.getTime() && g.id > previous.id)) gradeOf.set(g.submissionId, g);
    }
    const resourceOf = new Map<string, any>(writtenResources.map((r: any) => [r.id, r]));
    const resourceIdOf = new Map<string, string>(writtenAssignments.map((a: any) => [a.id, a.contentId]));
    const explanationCodes = new Set<string>(EXPLANATION_CRITERION_CODES);
    for (const sub of current.values()) {
      const target = explanationsByStudent.get(sub.studentId);
      const grade = gradeOf.get(sub.id);
      const resource = resourceOf.get(resourceIdOf.get(sub.assignmentId) ?? "");
      if (!target || !grade || !resource?.lessonId) continue;
      const decision = sub.decision && (!asOf || sub.decision.createdAt.getTime() <= asOf.getTime()) ? sub.decision : null;
      const status = submissionStatus({ timing: sub.timing, decision });
      if (status !== "SCORED" && status !== "ACCEPTED_BY_EXTENSION") continue;
      const given = new Map<string, number>((Array.isArray(grade.criterionPoints) ? grade.criterionPoints : []).map((c: any) => [`${c.promptId}|${c.criterionCode}`, Number(c.points)]));
      let points = 0;
      let max = 0;
      let complete = true;
      for (const prompt of Array.isArray(resource.content?.prompts) ? resource.content.prompts : [])
        for (const criterion of Array.isArray(prompt?.criteria) ? prompt.criteria : []) {
          if (!explanationCodes.has(criterion?.code)) continue;
          const value = given.get(`${prompt.id}|${criterion.code}`);
          if (value === undefined || !Number.isFinite(value) || !Number.isFinite(Number(criterion.maxPoints))) complete = false;
          else {
            points += value;
            max += Number(criterion.maxPoints);
          }
        }
      if (!complete || max <= 0) continue;
      target.push({
        assignmentId: sub.assignmentId,
        assignmentTitle: titles.get(sub.assignmentId) ?? "",
        lessonId: resource.lessonId,
        submissionId: sub.id,
        submittedAt: sub.submittedAt,
        gradeId: grade.id,
        gradedAt: grade.createdAt,
        explanationPoints: points,
        explanationMaxPoints: max,
      });
    }
  }
  return { members, evidenceByStudent, similarityByStudent, explanationsByStudent, acknowledgements };
}
