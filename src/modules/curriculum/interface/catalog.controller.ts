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
          chapters: [
            ...chapters
            .filter((chapter: any) => chapter.subjectId === subject.id && chapter.grade === grade)
            .map((chapter: any) => {
              const chapterLessons = lessons.filter((l: any) => l.subjectId === subject.id && l.grade === grade && l.curriculumChapterCode === chapter.code).sort((a: any, b: any) => (a.curriculumOrder ?? Number.MAX_SAFE_INTEGER) - (b.curriculumOrder ?? Number.MAX_SAFE_INTEGER) || a.id.localeCompare(b.id));
              const topics = chapter.topics
                .map((topic: any) => ({ id: topic.code, title: topic.title, officialOrder: topic.officialOrder, lessons: chapterLessons.filter((l: any) => l.curriculumTopicCode === topic.code) }))
                .filter((topic: any) => topic.lessons.length);
              const chapterLevel = chapterLessons.filter((l: any) => !l.curriculumTopicCode);
              return {
                id: chapter.code,
                title: chapter.title,
                officialOrder: chapter.officialOrder,
                // Lessons under an archived topic are not listed, so they are not counted either.
                lessonCount: chapterLevel.length + topics.reduce((sum: number, topic: any) => sum + topic.lessons.length, 0),
                topics,
                lessons: chapterLevel,
              };
            })
            .filter((chapter: any) => chapter.lessonCount > 0),
            // Textbook source chapters can be published before an official curriculum
            // crosswalk exists. Keep them visible under their source title without
            // presenting a textbook locator as an official curriculum code.
            ...(() => {
              const officialCodes = new Set(chapters.filter((chapter: any) => chapter.subjectId === subject.id && chapter.grade === grade).map((chapter: any) => chapter.code));
              const sourceGroups = new Map<string, any[]>();
              for (const lesson of lessons.filter((item: any) => item.subjectId === subject.id && item.grade === grade && (!item.curriculumChapterCode || !officialCodes.has(item.curriculumChapterCode)))) {
                const title = lesson.chapter?.trim() || "Nội dung theo sách giáo khoa";
                sourceGroups.set(title, [...(sourceGroups.get(title) ?? []), lesson]);
              }
              return [...sourceGroups.entries()].map(([title, sourceLessons]) => ({
                id: `source:${title}`,
                title,
                displayOrder: Math.min(...sourceLessons.map((lesson: any) => lesson.curriculumOrder ?? Number.MAX_SAFE_INTEGER)),
                lessonCount: sourceLessons.length,
                topics: [],
                lessons: sourceLessons.sort((a: any, b: any) => (a.curriculumOrder ?? Number.MAX_SAFE_INTEGER) - (b.curriculumOrder ?? Number.MAX_SAFE_INTEGER) || a.id.localeCompare(b.id)),
              }));
            })(),
          ].sort((a: any, b: any) => {
            const aOrder = a.officialOrder ?? a.displayOrder ?? Number.MAX_SAFE_INTEGER;
            const bOrder = b.officialOrder ?? b.displayOrder ?? Number.MAX_SAFE_INTEGER;
            return aOrder - bOrder || a.title.localeCompare(b.title, "vi");
          }),
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
