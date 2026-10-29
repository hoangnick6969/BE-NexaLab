import { ConflictException } from "@nestjs/common";
import { canonical, digest } from "./lab-run";

/** Compare the complete current mapping with the immutable reviewed course-version mapping. */
export async function reviewedBindingsMatch(db: any, labId: string, snapshot: any) {
  if (!Array.isArray(snapshot?.lessonBindings) || !snapshot.lessonBindings.length) return false;
  const rows = await db.foundationalCourseLesson.findMany({
    where: { foundationalLabId: labId, courseVersion: { status: "active" }, lesson: { scope: "SHARED_LIBRARY", status: "published" } },
    include: { courseVersion: true, lesson: true },
  });
  const current = rows.map((b: any) => ({
    courseVersionId: b.courseVersion.id, subjectId: b.courseVersion.subjectId,
    grade: b.courseVersion.grade, version: b.courseVersion.version, sourceVersion: b.courseVersion.sourceVersion,
    lessonId: b.lesson.id, lessonTopicCode: b.lesson.curriculumTopicCode, officialOrder: b.officialOrder,
  }));
  const sorted = (items: any[]) => [...items].sort((a, b) => canonical(a).localeCompare(canonical(b)));
  return digest(sorted(current)) === digest(sorted(snapshot.lessonBindings));
}

export async function assertReviewedBindings(db: any, labId: string, snapshot: any) {
  if (!await reviewedBindingsMatch(db, labId, snapshot))
    throw new ConflictException({ code: "LAB_RELEASE_BINDING_MISMATCH" });
}
