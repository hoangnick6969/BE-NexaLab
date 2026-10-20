import { Controller, Get, Inject, Req } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { Roles } from "../../../common/decorators";
import { Db } from "../../../db/db";

@ApiTags("NexaLab")
@ApiBearerAuth()
@Controller()
export class CatalogController {
  constructor(@Inject(Db) private db: Db) {}
  @Get("subjects") subjects() {
    return this.db.subject.findMany();
  }
  @Roles("STUDENT")
  @Get("open-curriculum") async openCurriculum() {
    const lessons = await this.db.lesson.findMany({
      where: {
        status: "published", scope: "SHARED_LIBRARY", synthetic: false,
        packVersion: { status: "released", synthetic: false },
      },
      select: { id: true, subjectId: true, grade: true, chapter: true, topic: true, title: true, curriculumChapterCode: true, curriculumTopicCode: true, curriculumOrder: true, publishedAt: true },
    });
    if (!lessons.length) return { subjects: [] };
    const [subjects, chapters] = await Promise.all([
      this.db.subject.findMany({ where: { id: { in: [...new Set(lessons.map((l: any) => l.subjectId))] } }, select: { id: true, name: true, ebookUrl: true } }),
      this.db.curriculumChapter.findMany({
        where: { status: "active", synthetic: false, OR: [...new Map(lessons.map((l: any) => [`${l.subjectId}:${l.grade}`, { subjectId: l.subjectId, grade: l.grade }])).values()] },
        include: { topics: { where: { status: "active" }, orderBy: [{ officialOrder: "asc" }, { code: "asc" }] } }, orderBy: [{ officialOrder: "asc" }, { code: "asc" }],
      }),
    ]);
    const subjectData = subjects.map((subject: any) => {
      const grades = [...new Set(lessons.filter((l: any) => l.subjectId === subject.id).map((l: any) => l.grade))].sort((a: number, b: number) => a - b);
      return {
        ...subject,
        grades: grades.map((grade) => ({
          grade,
          chapters: chapters
            .filter((chapter: any) => chapter.subjectId === subject.id && chapter.grade === grade)
            .map((chapter: any) => {
              const chapterLessons = lessons.filter((l: any) => l.subjectId === subject.id && l.grade === grade && l.curriculumChapterCode === chapter.code).sort((a: any, b: any) => (a.curriculumOrder ?? Number.MAX_SAFE_INTEGER) - (b.curriculumOrder ?? Number.MAX_SAFE_INTEGER) || a.id.localeCompare(b.id));
              return {
                id: chapter.code,
                title: chapter.title,
                officialOrder: chapter.officialOrder,
                lessonCount: chapterLessons.length,
                topics: chapter.topics
                  .map((topic: any) => ({ id: topic.code, title: topic.title, officialOrder: topic.officialOrder, lessons: chapterLessons.filter((l: any) => l.curriculumTopicCode === topic.code) }))
                  .filter((topic: any) => topic.lessons.length),
                lessons: chapterLessons.filter((l: any) => !l.curriculumTopicCode),
              };
            })
            .filter((chapter: any) => chapter.lessonCount > 0),
        })),
      };
    });
    return { subjects: subjectData.filter((subject: any) => subject.grades.length) };
  }
  @Get("labs") labs(@Req() req: any) {
    return this.db.lab.findMany({
      where: {
        status: "published",
        ...(req.user.role === "STUDENT" ? { scope: "SHARED_LIBRARY", releaseCleared: true, synthetic: false, topicCode: { not: null } } : {}),
      },
      // Lesson-variant challenges belong to their lesson pathway, not the public lab list.
      include: { challenges: { where: { NOT: { id: { contains: "_v-" } } } } },
    });
  }
}
