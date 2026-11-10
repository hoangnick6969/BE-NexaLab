import { buildInputSnapshot, lessonOutcomeCodes, snapshotDigest, type LessonSource } from "./input-snapshot";
import type { NormalizedAiRequest } from "./ai-job-contract";

/** Reads the lesson fields the snapshot needs; READING steps only, so other steps' answer keys are never loaded. */
export async function loadLessonSource(db: any, lessonId: string): Promise<LessonSource | null> {
  const lesson = await db.lesson.findUnique({
    where: { id: lessonId },
    select: {
      id: true, title: true, grade: true, domain: true, topic: true, learningObjective: true, content: true, outcomeCodes: true,
      steps: { where: { type: "READING" }, select: { position: true, config: true } },
    },
  });
  if (!lesson) return null;
  const { steps, ...rest } = lesson;
  return {
    ...rest,
    readingSteps: steps.map((step: { position: number; config: any }) => ({
      position: step.position,
      html: typeof step.config?.html === "string" ? step.config.html : "",
    })),
  };
}

/** CurriculumOutcome statements for the requested codes, or the lesson's own codes when none were requested. */
export async function loadOutcomeStatements(db: any, lesson: LessonSource, requested: string[] | null) {
  const codes = requested && requested.length > 0 ? requested : lessonOutcomeCodes(lesson);
  if (codes.length === 0) return new Map<string, string>();
  const rows = await db.curriculumOutcome.findMany({ where: { code: { in: codes } }, select: { code: true, statement: true } });
  return new Map<string, string>(rows.map((row: { code: string; statement: string }) => [row.code, row.statement]));
}

export async function buildSnapshotFor(db: any, lesson: LessonSource, request: NormalizedAiRequest) {
  const statements = await loadOutcomeStatements(db, lesson, request.outcomeCodes);
  const snapshot = buildInputSnapshot(lesson, request, statements);
  return { snapshot, digest: snapshotDigest(snapshot) };
}

/** Rebuilds the snapshot from the current lesson; a deleted lesson counts as changed. */
export async function lessonChangedSince(
  db: any,
  lessonId: string,
  request: NormalizedAiRequest,
  inputDigest: string,
  preloaded?: LessonSource | null,
) {
  const lesson = preloaded === undefined ? await loadLessonSource(db, lessonId) : preloaded;
  if (!lesson) return true;
  return (await buildSnapshotFor(db, lesson, request)).digest !== inputDigest;
}
