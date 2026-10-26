export type JourneyEvidence = {
  id: string;
  studentId: string;
  assignmentId: string | null;
  durationSeconds: number;
  watchedRanges: unknown;
  watchedSeconds: number;
  replaySeconds: number;
  coveragePercent: number;
  lastPosition: number;
  completionMethod: string | null;
  startedAt: Date;
  completedAt: Date | null;
  lastObservedAt: Date | null;
  step: { id: string; type: string; position: number; config: unknown; lesson: { id: string; title: string; curriculumOrder: number | null } };
};

const configTitle = (config: unknown) => {
  if (!config || typeof config !== "object") return null;
  const title = (config as Record<string, unknown>).title;
  return typeof title === "string" ? title : null;
};

export function projectJourney(rows: JourneyEvidence[]) {
  return [...rows]
    .sort((a, b) => (a.step.lesson.curriculumOrder ?? Number.MAX_SAFE_INTEGER) - (b.step.lesson.curriculumOrder ?? Number.MAX_SAFE_INTEGER) || a.step.position - b.step.position || a.id.localeCompare(b.id))
    .map((row) => ({
      evidenceId: row.id,
      assignmentId: row.assignmentId,
      lesson: { id: row.step.lesson.id, title: row.step.lesson.title },
      step: { id: row.step.id, type: row.step.type, position: row.step.position, title: configTitle(row.step.config) },
      video: {
        coveragePercent: row.coveragePercent,
        watchedRanges: Array.isArray(row.watchedRanges) ? row.watchedRanges : [],
        watchedSeconds: row.watchedSeconds,
        replaySeconds: row.replaySeconds,
        durationSeconds: row.durationSeconds,
        lastPosition: row.lastPosition,
        completionMethod: row.completionMethod,
      },
      state: row.completedAt ? "COMPLETED" : row.coveragePercent > 0 ? "IN_PROGRESS" : "NOT_STARTED",
      startedAt: row.startedAt,
      completedAt: row.completedAt,
      lastObservedAt: row.lastObservedAt,
    }));
}

