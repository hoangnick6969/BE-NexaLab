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

/** Compare current Lesson/content-pack mapping with the immutable reviewed snapshot. */
export async function reviewedBindingsMatch(db: any, labId: string, snapshot: any) {
  if (!Array.isArray(snapshot?.lessonBindings) || !snapshot.lessonBindings.length) return false;
  if (snapshot.lessonBindings.every((binding: any) => binding.bindingType === "DIRECT_LESSON")) {
    const lessonIds = snapshot.lessonBindings.map((binding: any) => binding.lessonId);
    const lessons = await db.lesson.findMany({
      where: {
        id: { in: lessonIds }, status: "published", scope: "SHARED_LIBRARY", synthetic: false,
        packVersion: { status: "released", synthetic: false },
      },
      include: { packVersion: true },
    });
    if (lessons.length !== lessonIds.length) return false;
    return digest(sorted(lessons.map(directLessonBinding))) === digest(sorted(snapshot.lessonBindings));
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
