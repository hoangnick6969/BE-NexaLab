import type { PrismaClient } from "@prisma/client";
import {
  labProjection,
  lessonProjection,
  projectionDiff,
  type LessonEvidence,
  type PracticalEvidence,
  type ProjectionRow,
} from "./progress";

type Client = Pick<PrismaClient, "lesson" | "lessonStep" | "stepProgress" | "quizAttempt" | "attempt" | "progress" | "challenge">;

const attemptSelect = {
  id: true,
  challengeId: true,
  lessonStepId: true,
  assignmentId: true,
  verdict: true,
  createdAt: true,
  hints: { select: { level: true } },
} as const;

function toPractical(attempt: any): PracticalEvidence {
  return {
    id: attempt.id,
    challengeId: attempt.challengeId,
    lessonStepId: attempt.lessonStepId,
    assignmentId: attempt.assignmentId,
    verdict: attempt.verdict,
    createdAt: attempt.createdAt,
    hintLevel: Math.max(0, ...(attempt.hints ?? []).map((hint: any) => hint.level)),
  };
}

/** Loads a student's source evidence for one lesson's current steps. */
export async function loadLessonEvidence(db: Client, studentId: string, lessonId: string, stepIds: string[], assignmentId?: string | null): Promise<LessonEvidence> {
  const scope = assignmentId === undefined ? {} : { assignmentId };
  const [stepProgress, quizAttempts, attempts] = await Promise.all([
    db.stepProgress.findMany({ where: { studentId, stepId: { in: stepIds }, ...scope } }),
    db.quizAttempt.findMany({
      where: { studentId, lessonId, ...(assignmentId === undefined ? {} : { assignmentId }) },
      select: { id: true, stepId: true, lessonId: true, assignmentId: true, score: true, passed: true, createdAt: true },
    }),
    db.attempt.findMany({ where: { studentId, lessonStepId: { in: stepIds }, ...(assignmentId === undefined ? {} : { assignmentId }) }, select: attemptSelect }),
  ]);
  return { stepProgress: stepProgress as any, quizAttempts, attempts: attempts.map(toPractical) };
}

async function expectedLessonRow(db: Client, studentId: string, lessonId: string, assignmentId?: string | null) {
  const lesson = await db.lesson.findUnique({
    where: { id: lessonId },
    select: { status: true, steps: { orderBy: { position: "asc" }, select: { id: true, type: true, position: true, required: true, config: true } } },
  });
  const steps = lesson?.steps ?? [];
  const evidence = await loadLessonEvidence(db, studentId, lessonId, steps.map((step) => step.id), assignmentId);
  // Only a published lesson can be officially completed.
  return lessonProjection(studentId, lessonId, steps as any[], evidence, lesson?.status === "published");
}

async function expectedLabRow(db: Client, studentId: string, labId: string) {
  const attempts = await db.attempt.findMany({ where: { studentId, challenge: { labId }, OR: [{ labRunId: null }, { labRun: { context: { notIn: ["CLASS_PRACTICE", "EXAM"] } } }] }, select: attemptSelect });
  return labProjection(studentId, labId, attempts.map(toPractical));
}

async function writeRow(db: Client, studentId: string, contentId: string, expected: ProjectionRow | null) {
  if (!expected) {
    await db.progress.deleteMany({ where: { studentId, contentId } });
    return;
  }
  const { studentId: _s, contentId: _c, ...data } = expected;
  await db.progress.upsert({
    where: { studentId_contentId: { studentId, contentId } },
    create: expected,
    update: data,
  });
}

/** Recomputes one lesson projection row; call inside the evidence-writing transaction. */
export async function projectLesson(db: Client, studentId: string, lessonId: string, assignmentId?: string | null) {
  const expected = await expectedLessonRow(db, studentId, lessonId, assignmentId);
  await writeRow(db, studentId, lessonId, expected);
  return expected;
}

/** Recomputes one standalone lab projection row; call inside the evidence-writing transaction. */
export async function projectLab(db: Client, studentId: string, labId: string) {
  const expected = await expectedLabRow(db, studentId, labId);
  await writeRow(db, studentId, labId, expected);
  return expected;
}

export type DriftEntry = {
  studentId: string;
  contentId: string;
  scope: "lesson" | "lab" | "unknown";
  kind: "missing" | "mismatch" | "orphan";
  fields: string[];
};

/**
 * Compares every Progress row with the documented derivation. With
 * `apply`, rewrites only the Progress projection; source evidence is read-only.
 */
export async function checkProjection(db: Client, options: { apply?: boolean; studentId?: string } = {}) {
  const studentFilter = options.studentId ? { studentId: options.studentId } : {};
  const [progressRows, stepRows, quizRows, attemptRows, steps] = await Promise.all([
    db.progress.findMany({ where: studentFilter }),
    db.stepProgress.findMany({ where: studentFilter, select: { studentId: true, stepId: true } }),
    db.quizAttempt.findMany({ where: studentFilter, select: { studentId: true, lessonId: true } }),
    db.attempt.findMany({ where: studentFilter, select: { studentId: true, lessonStepId: true, challenge: { select: { labId: true } } } }),
    db.lessonStep.findMany({ select: { id: true, lessonId: true } }),
  ]);
  const lessonOfStep = new Map(steps.map((step) => [step.id, step.lessonId]));
  const lessonIds = new Set(steps.map((step) => step.lessonId));
  const lessonKeys = new Set<string>();
  const labKeys = new Set<string>();
  for (const row of stepRows) {
    const lessonId = lessonOfStep.get(row.stepId);
    if (lessonId) lessonKeys.add(`${row.studentId}\u0000${lessonId}`);
  }
  for (const row of quizRows) lessonKeys.add(`${row.studentId}\u0000${row.lessonId}`);
  for (const row of attemptRows) {
    labKeys.add(`${row.studentId}\u0000${row.challenge.labId}`);
    const lessonId = row.lessonStepId ? lessonOfStep.get(row.lessonStepId) : undefined;
    if (lessonId) lessonKeys.add(`${row.studentId}\u0000${lessonId}`);
  }
  const actual = new Map(progressRows.map((row) => [`${row.studentId}\u0000${row.contentId}`, row]));
  const keys = new Set([...lessonKeys, ...labKeys, ...actual.keys()]);
  const drift: DriftEntry[] = [];
  let checked = 0;
  for (const key of [...keys].sort()) {
    const [studentId, contentId] = key.split("\u0000");
    const scope = lessonKeys.has(key) || lessonIds.has(contentId) ? "lesson" : labKeys.has(key) ? "lab" : "unknown";
    const expected =
      scope === "lesson"
        ? await expectedLessonRow(db, studentId, contentId)
        : scope === "lab"
          ? await expectedLabRow(db, studentId, contentId)
          : null;
    checked++;
    const diff = projectionDiff(expected, actual.get(key) ?? null);
    if (!diff) continue;
    drift.push({ studentId, contentId, scope, ...diff });
    if (options.apply) await writeRow(db, studentId, contentId, expected);
  }
  return {
    mode: options.apply ? ("apply" as const) : ("dry-run" as const),
    checked,
    driftCount: drift.length,
    byKind: {
      missing: drift.filter((entry) => entry.kind === "missing").length,
      mismatch: drift.filter((entry) => entry.kind === "mismatch").length,
      orphan: drift.filter((entry) => entry.kind === "orphan").length,
    },
    drift,
    evidenceCounts: { stepProgress: stepRows.length, quizAttempts: quizRows.length, attempts: attemptRows.length },
  };
}
