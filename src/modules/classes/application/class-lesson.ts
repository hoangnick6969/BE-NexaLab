import { BadRequestException } from "@nestjs/common";

export const lessonNotAvailable = () =>
  new BadRequestException({ code: "LESSON_NOT_AVAILABLE", message: "Bài học liên kết không khả dụng" });

/**
 * Shared lesson check for teacher Class Space writes (class resources and Teacher AI jobs): the lesson is a
 * published SHARED_LIBRARY lesson or one the teacher authored. Otherwise 400 LESSON_NOT_AVAILABLE.
 * Extracted unchanged from ClassResourcesService.assertLesson (TAI-T2).
 */
export async function assertClassLesson(db: any, lessonId: string, teacherId: string) {
  const lesson = await db.lesson.findFirst({
    where: { id: lessonId, OR: [{ scope: "SHARED_LIBRARY", status: "published" }, { authorId: teacherId }] },
    select: { id: true },
  });
  if (!lesson) throw lessonNotAvailable();
}
