import { Inject, Injectable } from "@nestjs/common";
import { Db } from "../../../db/db";

@Injectable()
export class FoundationalProgressService {
  constructor(@Inject(Db) private readonly db: Db) {}

  async forStudent(studentId: string, grade: number | null | undefined) {
    if (grade == null)
      return { courses: [], generatedAt: new Date().toISOString(), courseVersionConfigured: false };

    const versions: any[] = await this.db.foundationalCourseVersion.findMany({
      where: { grade, status: "active" },
      include: {
        subject: { select: { id: true, name: true } },
        lessons: {
          orderBy: { officialOrder: "asc" },
          where: { lesson: { status: "published", scope: "SHARED_LIBRARY", synthetic: false, packVersion: { status: "released", synthetic: false } } },
          include: {
            lesson: {
              include: {
                steps: {
                  where: { type: { in: ["READING", "VIDEO", "BASIC_EXERCISE"] }, required: true },
                  orderBy: { position: "asc" },
                  include: {
                    basicExerciseAttempts: {
                      where: { studentId },
                      orderBy: { createdAt: "desc" },
                      take: 1,
                    },
                  },
                },
              },
            },
          },
        },
      },
      orderBy: [{ subjectId: "asc" }, { version: "desc" }],
    });

    const stepIds = versions.flatMap((version) =>
      version.lessons.flatMap((item: any) => item.lesson.steps.map((step: any) => step.id)),
    );
    const labIds = [...new Set(versions.flatMap((version) =>
      version.lessons.map((item: any) => item.foundationalLabId).filter((id: unknown): id is string => typeof id === "string"),
    ))];
    const [evidence, labEvidence] = await Promise.all([
      stepIds.length
        ? this.db.stepProgress.findMany({ where: { studentId, assignmentId: null, stepId: { in: stepIds } } })
        : Promise.resolve([]),
      labIds.length
        ? this.db.attempt.findMany({
            where: { studentId, assignmentId: null, lessonStepId: null, challenge: { labId: { in: labIds } }, OR: [{ labRunId: null }, { labRun: { context: "FOUNDATIONAL" } }] },
            select: { id: true, challenge: { select: { labId: true } }, verdict: true, createdAt: true },
            orderBy: { createdAt: "desc" },
          })
        : Promise.resolve([]),
    ]);
    const evidenceByStep = new Map(evidence.map((row: any) => [row.stepId, row]));
    const labEvidenceByLab = new Map<string, any[]>();
    for (const row of labEvidence as any[]) {
      const labId = row.challenge.labId as string;
      const rows = labEvidenceByLab.get(labId) ?? [];
      rows.push(row);
      labEvidenceByLab.set(labId, rows);
    }

    const courses = versions.map((version) => {
      const lessons = version.lessons.map((item: any) => ({
        id: item.lesson.id,
        title: item.lesson.title,
        officialOrder: item.officialOrder,
        evidence: item.lesson.steps.map((step: any) => {
          const saved = evidenceByStep.get(step.id) as any;
          const exercise = step.basicExerciseAttempts?.[0];
          return {
            stepId: step.id,
            kind: step.type === "READING" ? "content" : step.type === "VIDEO" ? "video" : "basicExercise",
            state: exercise?.passed ? "COMPLETED" : exercise ? "IN_PROGRESS" : saved?.status ?? "NOT_STARTED",
            progressValue: exercise?.score ?? saved?.progressValue ?? 0,
            score: exercise?.score ?? null,
            passThreshold: exercise?.passThreshold ?? null,
            passed: exercise?.passed ?? null,
            sourceId: exercise?.id ?? saved?.id ?? null,
            updatedAt: exercise?.createdAt?.toISOString() ?? saved?.updatedAt?.toISOString() ?? null,
          };
        }),
        requiredLabId: item.foundationalLabId,
        labEvidence: item.foundationalLabId
          ? (labEvidenceByLab.get(item.foundationalLabId) ?? []).map((row: any) => ({
              id: row.id,
              verdict: row.verdict,
              createdAt: row.createdAt.toISOString(),
            }))
          : [],
      }));
      const items = lessons.flatMap((lesson: any) => lesson.evidence);
      const requiredLabs = lessons.filter((lesson: any) => lesson.requiredLabId);
      const completedLabs = requiredLabs.filter((lesson: any) => lesson.labEvidence.some((attempt: any) => attempt.verdict === "passed"));
      const totalEvidenceItems = items.length + requiredLabs.length;
      const completedEvidenceItems = items.filter((item: any) => item.state === "COMPLETED").length + completedLabs.length;
      return {
        id: version.id,
        version: version.version,
        sourceVersion: version.sourceVersion,
        subject: version.subject,
        grade: version.grade,
        lessons,
        summary: {
          totalEvidenceItems,
          completedEvidenceItems,
          content: items.filter((item: any) => item.kind === "content" && item.state === "COMPLETED").length,
          video: items.filter((item: any) => item.kind === "video" && item.state === "COMPLETED").length,
          basicExercise: items.filter((item: any) => item.kind === "basicExercise" && item.state === "COMPLETED").length,
          requiredLabs: completedLabs.length,
          percent: totalEvidenceItems ? Math.floor(completedEvidenceItems * 100 / totalEvidenceItems) : null,
        },
      };
    });
    return { courses, generatedAt: new Date().toISOString(), courseVersionConfigured: courses.length > 0 };
  }
}
