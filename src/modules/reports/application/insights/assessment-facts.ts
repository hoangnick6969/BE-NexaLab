import { submissionStatus, TEST_CONTENT_TYPE } from "../../../classes/application/assignment-test-contract";
import { WRITTEN_CONTENT_TYPE } from "../../../classes/application/assignment-written-contract";
import { toScale10 } from "../../../classes/application/assessment-policy";
import type { AssessmentFact } from "./types";

const GRADED = new Set(["REGULAR_15M", "MIDTERM_45M"]);
const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
const byTime = <T extends { id: string }>(at: (row: T) => Date) => (a: T, b: T) => at(a).getTime() - at(b).getTime() || cmp(a.id, b.id);
const before = (date: Date | null | undefined, asOf?: Date) => !!date && (!asOf || date.getTime() <= asOf.getTime());

/** Rows the evidence loader already read (insights-loader.ts stage 1 and 2); no extra query is issued for insights@4. */
export type FactSources = {
  studentIds: string[];
  /** Class assignments with `targets` (student ids), assessment settings, due date and creation time. */
  assignments: any[];
  /** classResource id -> lessonId for test and written resources. */
  resourceLesson: Map<string, string | null>;
  testSubmissions: any[];
  writtenSubmissions: any[];
  writtenGrades: any[];
  quizzes: any[];
  asOf?: Date;
};

/**
 * insights@4 inputs (TAI7-T2): one representative result per (assignment, target student) of the class. The rules are in
 * `AssessmentFact` (types.ts). Pure: it only regroups rows the loader has read, already filtered by `asOf`; score
 * publication and late decisions after `asOf` are ignored here.
 */
export function buildAssessmentFacts(src: FactSources): Map<string, AssessmentFact[]> {
  const out = new Map<string, AssessmentFact[]>(src.studentIds.map((id) => [id, []]));
  const asOf = src.asOf;
  const newestGrade = new Map<string, any>();
  for (const g of src.writtenGrades) {
    const prev = newestGrade.get(g.submissionId);
    if (!prev || g.createdAt.getTime() > prev.createdAt.getTime() || (g.createdAt.getTime() === prev.createdAt.getTime() && g.id > prev.id)) newestGrade.set(g.submissionId, g);
  }
  const statusOf = (s: any) => submissionStatus({ timing: s.timing, decision: s.decision && before(s.decision.createdAt, asOf) ? s.decision : null });

  for (const a of src.assignments) {
    if (![TEST_CONTENT_TYPE, WRITTEN_CONTENT_TYPE, "lesson"].includes(a.contentType)) continue;
    if (!Array.isArray(a.targets) || !a.createdAt || (asOf && a.createdAt.getTime() > asOf.getTime())) continue;
    const type: string = a.assessmentType ?? "PRACTICE";
    const published = GRADED.has(type) ? before(a.scoresPublishedAt, asOf) : true;
    const base = {
      assignmentId: a.id,
      title: a.title ?? "",
      contentType: a.contentType,
      assessmentType: type,
      lessonId: a.contentType === "lesson" ? a.contentId : src.resourceLesson.get(a.contentId) ?? null,
      createdAt: a.createdAt,
      dueAt: a.dueDate ?? null,
    };
    const targetIds = new Set<string>(a.targets.map((t: any) => t.studentId));
    for (const studentId of src.studentIds) {
      if (!targetIds.has(studentId)) continue;
      const push = (fact: Pick<AssessmentFact, "status" | "score10" | "ref">) => out.get(studentId)!.push({ ...base, ...fact });
      if (a.contentType === "lesson") {
        const first = src.quizzes.filter((q: any) => q.assignmentId === a.id && q.studentId === studentId).sort(byTime((q: any) => q.createdAt))[0];
        if (first) push({ status: "SCORED", score10: toScale10(first.score, 100), ref: { kind: "QUIZ", id: first.id, at: first.createdAt } });
        continue;
      }
      const pool = a.contentType === TEST_CONTENT_TYPE ? src.testSubmissions : src.writtenSubmissions;
      const rows = pool.filter((s: any) => s.assignmentId === a.id && s.studentId === studentId).sort(byTime((s: any) => s.submittedAt));
      if (!rows.length) {
        // Archived work is no longer asked of the student, so it is never "not done".
        if (a.status === "ACTIVE") push({ status: "NOT_DONE", score10: null, ref: null });
        continue;
      }
      if (a.contentType === TEST_CONTENT_TYPE) {
        // Graded: the current (latest) submission once published. Practice: the first counted submission, never a retake.
        const pick = GRADED.has(type) ? rows.at(-1) : rows.find((s: any) => ["SCORED", "ACCEPTED_BY_EXTENSION", "REJECTED_ZERO"].includes(statusOf(s)));
        const st = pick ? statusOf(pick) : null;
        if (!pick || !published || st === "LATE_REVIEW_PENDING") push({ status: "PENDING", score10: null, ref: null });
        else
          push({
            status: "SCORED",
            score10: st === "REJECTED_ZERO" ? 0 : typeof pick.correctCount === "number" && pick.questionCount ? toScale10(pick.correctCount, pick.questionCount) : toScale10(pick.score ?? 0, 100),
            ref: { kind: "TEST", id: pick.id, at: pick.submittedAt },
          });
        continue;
      }
      // Written: only the current submission is gradeable, so its newest teacher grade is the representative result.
      const current = rows.at(-1);
      const st = statusOf(current);
      const grade = newestGrade.get(current.id);
      if (st === "REJECTED_ZERO") push({ status: "SCORED", score10: 0, ref: { kind: "WRITTEN", id: current.id, at: current.submittedAt } });
      else if (!grade || !published || st === "LATE_REVIEW_PENDING" || !(grade.maxPoints > 0)) push({ status: "PENDING", score10: null, ref: null });
      else push({ status: "SCORED", score10: toScale10(grade.totalPoints, grade.maxPoints), ref: { kind: "WRITTEN", id: current.id, at: current.submittedAt } });
    }
  }
  return out;
}
