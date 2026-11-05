import { ConflictException } from "@nestjs/common";
import { canonical, digest } from "./lab-run";

const sorted = (items: any[]) => [...items].sort((a, b) => canonical(a).localeCompare(canonical(b)));

/** KHTN Lessons are stored under the umbrella subject while the legacy Circuit Lab is filed under Physics. */
export function lessonSubjectMatchesLab(labSubjectId: string, lessonSubjectId: string) {
  return labSubjectId === lessonSubjectId || (labSubjectId === "physics" && lessonSubjectId === "khtn");
}

export function directLessonBinding(lesson: any) {
  return {
    bindingType: "DIRECT_LESSON",
    lessonId: lesson.id,
    subjectId: lesson.subjectId,
    grade: lesson.grade,
    lessonChapterCode: lesson.curriculumChapterCode,
    lessonTopicCode: lesson.curriculumTopicCode,
    lessonOutcomeCodes: [...((lesson.outcomeCodes as string[]) ?? [])].sort(),
    curriculumOrder: lesson.curriculumOrder,
    contentPackVersionId: lesson.packVersion.id,
    contentPackVersionDigest: lesson.packVersion.digest,
    contentPackReleaseId: lesson.packVersion.releaseId,
  };
}

const directOnly = (snapshot: any) =>
  Array.isArray(snapshot?.lessonBindings) && snapshot.lessonBindings.length > 0 &&
  snapshot.lessonBindings.every((binding: any) => binding.bindingType === "DIRECT_LESSON");

const reviewedLessonWhere = (ids: string[]) => ({
  id: { in: ids }, status: "published", scope: "SHARED_LIBRARY", synthetic: false,
  packVersion: { status: "released", synthetic: false },
});

function directBindingsMatch(snapshot: any, lessonById: Map<string, any>) {
  const lessonIds: string[] = snapshot.lessonBindings.map((binding: any) => binding.lessonId);
  const lessons = [...new Set(lessonIds)].map((id) => lessonById.get(id)).filter(Boolean);
  if (lessons.length !== lessonIds.length) return false;
  return digest(sorted(lessons.map(directLessonBinding))) === digest(sorted(snapshot.lessonBindings));
}

/**
 * reviewedBindingsMatch for many releases at once: the DIRECT_LESSON releases share one Lesson query;
 * the others fall back to the per-Lab check. Results are in input order.
 */
export async function reviewedBindingsMatchMany(db: any, items: { labId: string; snapshot: any }[]): Promise<boolean[]> {
  const ids = [...new Set(items.filter((item) => directOnly(item.snapshot))
    .flatMap((item) => item.snapshot.lessonBindings.map((binding: any) => binding.lessonId as string)))];
  const lessons = ids.length ? await db.lesson.findMany({ where: reviewedLessonWhere(ids), include: { packVersion: true } }) : [];
  const lessonById = new Map<string, any>(lessons.map((lesson: any) => [lesson.id, lesson]));
  return Promise.all(items.map((item) =>
    directOnly(item.snapshot) ? directBindingsMatch(item.snapshot, lessonById) : reviewedBindingsMatch(db, item.labId, item.snapshot)));
}

/** Compare current Lesson/content-pack mapping with the immutable reviewed snapshot. */
export async function reviewedBindingsMatch(db: any, labId: string, snapshot: any) {
  if (!Array.isArray(snapshot?.lessonBindings) || !snapshot.lessonBindings.length) return false;
  if (directOnly(snapshot)) {
    const lessonIds: string[] = snapshot.lessonBindings.map((binding: any) => binding.lessonId);
    const lessons = await db.lesson.findMany({ where: reviewedLessonWhere(lessonIds), include: { packVersion: true } });
    return directBindingsMatch(snapshot, new Map(lessons.map((lesson: any) => [lesson.id, lesson])));
  }
  const rows = await db.foundationalCourseLesson.findMany({
    where: { foundationalLabId: labId, courseVersion: { status: "active" }, lesson: { scope: "SHARED_LIBRARY", status: "published" } },
    include: { courseVersion: true, lesson: true },
  });
  const current = rows.map((b: any) => ({
    courseVersionId: b.courseVersion.id, subjectId: b.courseVersion.subjectId,
    grade: b.courseVersion.grade, version: b.courseVersion.version, sourceVersion: b.courseVersion.sourceVersion,
    lessonId: b.lesson.id, lessonTopicCode: b.lesson.curriculumTopicCode, officialOrder: b.officialOrder,
  }));
  return digest(sorted(current)) === digest(sorted(snapshot.lessonBindings));
}

export async function assertReviewedBindings(db: any, labId: string, snapshot: any) {
  if (!await reviewedBindingsMatch(db, labId, snapshot))
    throw new ConflictException({ code: "LAB_RELEASE_BINDING_MISMATCH" });
}
