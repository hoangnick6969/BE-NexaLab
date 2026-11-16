import { digest } from "../../labs/application/lab-run";
import { reviewedBindingsMatch, reviewedBindingsMatchMany } from "../../labs/application/lab-release-bindings";
import { declaredMode, declaredModes, resolveExploreLabs } from "../../labs/application/explore-labs";
import { Controller, Get, Inject, Param, Req } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { Roles } from "../../../common/decorators";
import { Db } from "../../../db/db";
import { sharedCached } from "../../../common/shared-cache";

@ApiTags("NexaLab")
@ApiBearerAuth()
@Controller()
export class CatalogController {
  constructor(@Inject(Db) private db: Db) {}
  // Both responses are identical for every caller, so they are served from the shared cache (perf review item 11).
  @Get("subjects") subjects() {
    return sharedCached("catalog:subjects", () => this.db.subject.findMany({
      include: { ebookEditions: { orderBy: [{ version: "asc" }, { id: "asc" }] } },
    }));
  }
  @Roles("STUDENT")
  @Get("open-curriculum") openCurriculum() {
    return sharedCached("catalog:open-curriculum", () => this.loadOpenCurriculum());
  }
  private async loadOpenCurriculum() {
    const rawLessons = await this.db.lesson.findMany({
      where: {
        status: "published", scope: "SHARED_LIBRARY", synthetic: false,
        packVersion: { status: "released", synthetic: false },
      },
      select: {
        id: true, subjectId: true, grade: true, chapter: true, topic: true, title: true,
        curriculumChapterCode: true, curriculumTopicCode: true, curriculumOrder: true, publishedAt: true,
        review: true,
        ebookLocators: { where: { verificationStatus: "verified" }, select: { physicalPageIndex: true, printedPageLabel: true }, take: 1 },
      },
    });
    if (!rawLessons.length) return { subjects: [] };
    const lessons = rawLessons.map(({ review, ebookLocators, ...lesson }: any) => {
      const locatorPage = Number(ebookLocators?.[0]?.physicalPageIndex);
      const reviewStart = Number((review as any)?.pdfPageRange?.start);
      const pdfPage = Number.isInteger(locatorPage) && locatorPage > 0
        ? locatorPage
        : Number.isInteger(reviewStart) && reviewStart > 0
          ? reviewStart
          : null;
      return { ...lesson, ...(pdfPage ? { pdfPage } : {}) };
    });
    const [subjects, chapters] = await Promise.all([
      this.db.subject.findMany({
        where: { id: { in: [...new Set(lessons.map((l: any) => l.subjectId))] } },
        select: {
          id: true,
          name: true,
          ebookUrl: true,
          ebookEditions: { select: { id: true, version: true, url: true, fallbackPhysicalPage: true, isCurrent: true, coverAssetVersionId: true }, orderBy: [{ version: "asc" }, { id: "asc" }] },
        },
      }),
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
  @Roles("STUDENT", "TEACHER", "ADMIN")
  @Get("lessons/:lessonId/foundational-labs")
  async lessonLabs(@Param("lessonId") lessonId: string, @Req() req: any) {
    const lesson = await this.db.lesson.findFirst({ where: { id: lessonId, status: "published", scope: "SHARED_LIBRARY", synthetic: false } });
    if (!lesson) return [];
    const labs = await this.labs(req);
    const candidates = await Promise.all(labs.map(async (lab) => {
      const release = await this.db.labRelease.findFirst({ where: { labId: lab.id, status: "ACTIVE" } });
      if (!release || !(release.snapshot as any).lessonBindings?.some((binding: any) => binding.lessonId === lessonId)) return null;
      if (digest(release.snapshot) !== release.digest || !await reviewedBindingsMatch(this.db, lab.id, release.snapshot)) return null;
      return { labId: lab.id, title: lab.title, objective: (release.snapshot as any).activity?.spec?.objective ?? lab.learningObjective, releaseId: release.id, version: release.version };
    }));
    return candidates.filter((item) => item !== null);
  }
  @Get("labs") async labs(@Req() req: any) {
    const labs = await this.db.lab.findMany({
      where: {
        status: "published",
        ...(req.user.role === "STUDENT" ? { scope: "SHARED_LIBRARY", releaseCleared: true, synthetic: false, topicCode: { not: null } } : {}),
      },
      // Lesson-variant challenges belong to their lesson pathway, not the public lab list.
      include: { challenges: { where: { NOT: { id: { contains: "_v-" } } } } },
    });
    // Batched: one query for all active releases and one for release counts, instead of 2 per Lab.
    const labIds = labs.map((lab) => lab.id);
    const [activeReleases, releaseCounts, explore] = await Promise.all([
      this.db.labRelease.findMany({ where: { labId: { in: labIds }, status: "ACTIVE" } }),
      this.db.labRelease.groupBy({ by: ["labId"], where: { labId: { in: labIds } }, _count: { _all: true } }),
      resolveExploreLabs(this.db, labs),
    ]);
    const releaseOf = new Map(activeReleases.map((release) => [release.labId, release]));
    const hasReleases = new Set(releaseCounts.filter((row) => row._count._all > 0).map((row) => row.labId));
    const boundLessonIds = [...new Set(activeReleases.flatMap((release) =>
      ((release.snapshot as any).lessonBindings ?? []).map((binding: any) => binding.lessonId as string)))];
    // Explore-only Labs have no release snapshot; their curriculum topic (set when the Lab is published or seeded) links the lessons.
    const exploreTopic = (lab: (typeof labs)[number]) =>
      !hasReleases.has(lab.id) && (declaredMode(lab) === "explore" || (lab.config as { rendererKey?: string } | null)?.rendererKey === "wet-bench-explore")
        ? lab.topicCode ?? null
        : null;
    const exploreTopics = [...new Set(labs.map(exploreTopic).filter((code) => code !== null))];
    const [checks, lessons, exploreLessons] = await Promise.all([
      (async () => {
        const intact = labs.map((lab) => releaseOf.get(lab.id)).filter((release) => !!release && digest(release.snapshot) === release.digest);
        const matches = await reviewedBindingsMatchMany(this.db, intact.map((release) => ({ labId: release!.labId, snapshot: release!.snapshot })));
        const ok = new Set(intact.filter((_, i) => matches[i]).map((release) => release!.labId));
        return labs.map((lab) => ok.has(lab.id));
      })(),
      boundLessonIds.length
        ? this.db.lesson.findMany({
          where: { id: { in: boundLessonIds }, status: "published", scope: "SHARED_LIBRARY", synthetic: false },
          select: { id: true, title: true, curriculumTopicCode: true },
        })
        : Promise.resolve([]),
      exploreTopics.length
        ? this.db.lesson.findMany({
          where: {
            curriculumTopicCode: { in: exploreTopics }, status: "published", scope: "SHARED_LIBRARY", synthetic: false,
            packVersion: { status: "released", synthetic: false },
          },
          select: { id: true, title: true, curriculumTopicCode: true },
          orderBy: [{ publishedAt: "desc" }, { id: "asc" }],
        })
        : Promise.resolve([]),
    ]);
    const lessonById = new Map(lessons.map((lesson) => [lesson.id, lesson]));
    const visible = labs.map((lab, index) => {
      const release = releaseOf.get(lab.id);
      // Preserve legacy catalog behavior for Labs without a release lifecycle record.
      if (!release) {
        if (req.user.role === "STUDENT" && hasReleases.has(lab.id)) return null;
        const topicCode = exploreTopic(lab);
        const lesson = topicCode && exploreLessons.find((item) => item.curriculumTopicCode === topicCode);
        return lesson ? { ...lab, lessonLinks: [{ lessonId: lesson.id, title: lesson.title, topicCode }] } : lab;
      }
      if (!checks[index]) return req.user.role === "STUDENT" ? null : lab;
      const lessonIds: string[] = ((release.snapshot as any).lessonBindings ?? []).map((binding: any) => binding.lessonId);
      const lessonLinks = [...new Set(lessonIds)].map((id) => lessonById.get(id)).filter((lesson) => lesson !== undefined);
      return { ...lab, lessonLinks: lessonLinks.map((lesson) => ({ lessonId: lesson.id, title: lesson.title, topicCode: lesson.curriculumTopicCode })) };
    });
    // P0 C1.2 + D-5: every row declares its primary `mode` and all its `modes`; rows with Explore carry the pinned config or an error code
    // (students never get errors: an Explore-only row with an error is hidden, a two-mode row falls back to Guided only).
    const rows = [];
    for (const lab of visible) {
      if (!lab) continue;
      const mode = declaredMode(lab);
      const resolution = explore.get(lab.id);
      const showExplore = !!resolution && (resolution.ok || req.user.role !== "STUDENT");
      if (mode === "explore") { if (showExplore) rows.push({ ...lab, mode, modes: ["explore"], explore: resolution }); else if (!resolution) rows.push({ ...lab, mode, modes: declaredModes(lab) }); }
      else rows.push(showExplore ? { ...lab, mode, modes: ["guided", "explore"], explore: resolution } : { ...lab, mode, modes: ["guided"] });
    }
    return rows;
  }
}
