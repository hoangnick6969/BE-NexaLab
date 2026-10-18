import { buildPathwaySteps, type StoredStep } from "../lessons/pathway";

// Official progress derivation (Epic A5). Source evidence is StepProgress,
// QuizAttempt and practical Attempt; the Progress table is only a projection
// of what these functions return.

export type PracticalVerdict = "passed" | "partial" | "needs_practice";
export type StepEvidenceType = "STEP_PROGRESS" | "QUIZ_ATTEMPT" | "PRACTICAL_ATTEMPT";

export type StepProgressEvidence = {
  stepId: string;
  status: "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED";
  progressValue: number;
  lastPosition: number | null;
  visitedCardIds: unknown;
  startedAt: Date | null;
  completedAt: Date | null;
  updatedAt: Date;
};
export type QuizEvidence = {
  id: string;
  stepId: string;
  lessonId: string;
  assignmentId: string | null;
  score: number;
  passed: boolean;
  createdAt: Date;
};
export type PracticalEvidence = {
  id: string;
  challengeId: string;
  lessonStepId: string | null;
  assignmentId: string | null;
  verdict: string;
  createdAt: Date;
  hintLevel: number;
};
export type LessonEvidence = {
  stepProgress: StepProgressEvidence[];
  quizAttempts: QuizEvidence[];
  attempts: PracticalEvidence[];
};

/** Older attempts stored the simulator's raw `not_passed`; A4 normalized it to `needs_practice`. */
export function normalizeVerdict(verdict: string): PracticalVerdict | null {
  if (verdict === "passed" || verdict === "partial" || verdict === "needs_practice") return verdict;
  if (verdict === "not_passed") return "needs_practice";
  return null;
}
const verdictRank: Record<PracticalVerdict, number> = { needs_practice: 0, partial: 1, passed: 2 };

const newestFirst = <T extends { createdAt: Date; id: string }>(a: T, b: T) =>
  b.createdAt.getTime() - a.createdAt.getTime() || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0);
const oldestFirst = <T extends { createdAt: Date; id: string }>(a: T, b: T) => -newestFirst(a, b);

/** Latest = newest attempt; best = highest score, newest wins ties. */
export function quizSummary(attempts: QuizEvidence[]) {
  if (!attempts.length) return null;
  const ordered = [...attempts].sort(newestFirst);
  const best = [...ordered].sort((a, b) => b.score - a.score)[0];
  const pick = (attempt: QuizEvidence) => ({
    attemptId: attempt.id,
    score: attempt.score,
    passed: attempt.passed,
    createdAt: attempt.createdAt.toISOString(),
  });
  return { attempts: ordered.length, latest: pick(ordered[0]), best: pick(best) };
}

/** Practical history reports verdicts, never an invented percentage. */
export function practicalSummary(attempts: PracticalEvidence[]) {
  if (!attempts.length) return null;
  const ordered = [...attempts].sort(newestFirst);
  const verdicts = ordered.map((attempt) => normalizeVerdict(attempt.verdict) ?? "needs_practice");
  const bestIndex = verdicts.reduce((best, verdict, index) => (verdictRank[verdict] > verdictRank[verdicts[best]] ? index : best), 0);
  const firstPass = [...ordered].sort(oldestFirst).find((attempt) => normalizeVerdict(attempt.verdict) === "passed");
  return {
    attempts: ordered.length,
    latest: { attemptId: ordered[0].id, verdict: verdicts[0], createdAt: ordered[0].createdAt.toISOString() },
    best: { attemptId: ordered[bestIndex].id, verdict: verdicts[bestIndex], createdAt: ordered[bestIndex].createdAt.toISOString() },
    passedAt: firstPass?.createdAt.toISOString() ?? null,
  };
}

/**
 * Per-step completion evidence. READING/VIDEO/STUDY_CARDS complete from
 * StepProgress; QUIZ completes from its first passing QuizAttempt; LAB and
 * CHALLENGE complete from their first passed practical Attempt (a COMPLETED
 * StepProgress written by A4 is accepted as well). The evidence reference is
 * the record that made the step complete, otherwise the latest record.
 */
export function stepEvidence(step: { id: string; type: string; config?: unknown; resource?: unknown }, evidence: LessonEvidence) {
  const saved = evidence.stepProgress.find((item) => item.stepId === step.id) ?? null;
  if (step.type === "QUIZ") {
    const attempts = evidence.quizAttempts.filter((attempt) => attempt.stepId === step.id);
    const firstPass = [...attempts].sort(oldestFirst).find((attempt) => attempt.passed);
    const latest = [...attempts].sort(newestFirst)[0];
    const source = firstPass ?? latest;
    return {
      completed: Boolean(firstPass),
      started: attempts.length > 0 || Boolean(saved && saved.status !== "NOT_STARTED"),
      completedAt: firstPass?.createdAt ?? null,
      evidenceType: source ? ("QUIZ_ATTEMPT" as const) : null,
      evidenceId: source?.id ?? null,
      updatedAt: latest?.createdAt ?? null,
      quiz: quizSummary(attempts),
      practical: null,
      stepProgress: null,
    };
  }
  if (step.type === "LAB" || step.type === "CHALLENGE") {
    const config = (step.config ?? step.resource) as { challengeId?: string; sameAsLab?: boolean } | undefined;
    const ownAttempts = evidence.attempts.filter((attempt) => attempt.lessonStepId === step.id);
    // The pH demo's final challenge repeats its lab. Keep old evidence, but
    // derive this optional legacy step from the lab when no direct attempt exists.
    const attempts = config?.sameAsLab && config.challengeId
      ? evidence.attempts.filter((attempt) => attempt.challengeId === config.challengeId)
      : ownAttempts;
    const firstPass = [...attempts].sort(oldestFirst).find((attempt) => normalizeVerdict(attempt.verdict) === "passed");
    const latest = [...attempts].sort(newestFirst)[0];
    const source = firstPass ?? latest;
    const completed = Boolean(firstPass) || saved?.status === "COMPLETED";
    return {
      completed,
      started: attempts.length > 0 || Boolean(saved && saved.status !== "NOT_STARTED"),
      completedAt: firstPass?.createdAt ?? (saved?.status === "COMPLETED" ? saved.completedAt : null),
      evidenceType: source ? ("PRACTICAL_ATTEMPT" as const) : saved ? ("STEP_PROGRESS" as const) : null,
      evidenceId: source?.id ?? (saved ? step.id : null),
      updatedAt: latest?.createdAt ?? saved?.updatedAt ?? null,
      quiz: null,
      practical: practicalSummary(attempts),
      stepProgress: null,
    };
  }
  return {
    completed: saved?.status === "COMPLETED",
    started: Boolean(saved && saved.status !== "NOT_STARTED"),
    completedAt: saved?.status === "COMPLETED" ? saved.completedAt : null,
    evidenceType: saved ? ("STEP_PROGRESS" as const) : null,
    evidenceId: saved ? step.id : null,
    updatedAt: saved?.updatedAt ?? null,
    quiz: null,
    practical: null,
    stepProgress: saved
      ? {
          status: saved.status,
          progressValue: saved.progressValue,
          lastPosition: saved.lastPosition,
          visitedCards: Array.isArray(saved.visitedCardIds) ? saved.visitedCardIds.length : 0,
          startedAt: saved.startedAt?.toISOString() ?? null,
          completedAt: saved.completedAt?.toISOString() ?? null,
          updatedAt: saved.updatedAt.toISOString(),
        }
      : null,
  };
}

/**
 * Feeds derived completion into the pathway gate so every caller sees one
 * rule. Step progress comes from `evidence`, not from whatever the caller
 * attached to the steps.
 */
export function withDerivedCompletion<T extends StoredStep>(steps: T[], evidence: LessonEvidence): T[] {
  return steps.map((step) => {
    const saved = evidence.stepProgress.filter((item) => item.stepId === step.id);
    if (step.type !== "QUIZ" && step.type !== "LAB" && step.type !== "CHALLENGE") return { ...step, progress: saved } as T;
    const derived = stepEvidence(step, evidence);
    return {
      ...step,
      progress: derived.completed
        ? [{ ...saved[0], status: "COMPLETED", progressValue: 100 }]
        : step.type === "QUIZ"
          ? []
          : saved,
    } as T;
  });
}

export type ProgressStepState = "COMPLETED" | "IN_PROGRESS" | "AVAILABLE" | "LOCKED";

/**
 * Official lesson derivation: numerator/denominator count required published
 * steps; percent is null when nothing is required. Throws when stored steps
 * are invalid (callers treat the lesson as unavailable).
 */
export function deriveLesson(steps: StoredStep[], evidence: LessonEvidence) {
  const pathway = buildPathwaySteps(withDerivedCompletion(steps, evidence));
  const derived = pathway.steps.map((step) => {
    const source = stepEvidence(step, evidence);
    const state: ProgressStepState =
      step.state === "COMPLETED" ? "COMPLETED" : step.state === "LOCKED" ? "LOCKED" : source.started ? "IN_PROGRESS" : "AVAILABLE";
    return {
      stepId: step.id,
      type: step.type,
      position: step.position,
      required: step.required,
      state,
      evidenceType: source.evidenceType as StepEvidenceType | null,
      evidenceId: source.evidenceId,
      completedAt: source.completedAt?.toISOString() ?? null,
      updatedAt: source.updatedAt?.toISOString() ?? null,
      quiz: source.quiz,
      practical: source.practical,
      stepProgress: source.stepProgress,
    };
  });
  const required = derived.filter((step) => step.required);
  const completedRequired = required.filter((step) => step.state === "COMPLETED").length;
  const totalRequired = required.length;
  const timestamps = derived.map((step) => step.updatedAt).filter((value): value is string => Boolean(value)).sort();
  return {
    steps: derived,
    nextStepId: pathway.nextStepId,
    completedRequired,
    totalRequired,
    percent: totalRequired ? Math.round((completedRequired / totalRequired) * 100) : null,
    completed: totalRequired > 0 && completedRequired === totalRequired,
    started: derived.some((step) => step.state === "COMPLETED" || step.state === "IN_PROGRESS"),
    updatedAt: timestamps.at(-1) ?? null,
  };
}

export type ProjectionRow = {
  studentId: string;
  contentId: string;
  status: "completed" | "in_progress";
  attemptsCount: number;
  lastHintLevel: number;
  score: number;
};

/**
 * Lesson projection row (contentId = lessonId). Exists only when evidence
 * exists. score = best quiz score; attemptsCount = quiz + linked practical
 * attempts; status completed only when every required step is complete.
 */
export function lessonProjection(studentId: string, lessonId: string, steps: StoredStep[], evidence: LessonEvidence, published = true): ProjectionRow | null {
  const quiz = evidence.quizAttempts.filter((attempt) => attempt.lessonId === lessonId);
  const stepIds = new Set(steps.map((step) => step.id));
  const practical = evidence.attempts.filter((attempt) => attempt.lessonStepId && stepIds.has(attempt.lessonStepId));
  const saved = evidence.stepProgress.filter((item) => stepIds.has(item.stepId));
  if (!quiz.length && !practical.length && !saved.length) return null;
  let completed = false;
  if (published && steps.length) {
    try {
      completed = deriveLesson(steps, { stepProgress: saved, quizAttempts: quiz, attempts: practical }).completed;
    } catch {
      completed = false;
    }
  }
  return {
    studentId,
    contentId: lessonId,
    status: completed ? "completed" : "in_progress",
    attemptsCount: quiz.length + practical.length,
    lastHintLevel: Math.max(0, ...practical.map((attempt) => attempt.hintLevel)),
    score: Math.max(0, ...quiz.map((attempt) => attempt.score)),
  };
}

/**
 * Standalone lab projection row (contentId = labId), kept for Teacher/Parent
 * views. score is the legacy verdict rank (passed 100, partial 50, else 0);
 * Student surfaces show verdicts instead.
 */
export function labProjection(studentId: string, labId: string, attempts: PracticalEvidence[]): ProjectionRow | null {
  if (!attempts.length) return null;
  const best = Math.max(...attempts.map((attempt) => verdictRank[normalizeVerdict(attempt.verdict) ?? "needs_practice"]));
  return {
    studentId,
    contentId: labId,
    status: best === 2 ? "completed" : "in_progress",
    attemptsCount: attempts.length,
    lastHintLevel: Math.max(0, ...attempts.map((attempt) => attempt.hintLevel)),
    score: best * 50,
  };
}

export function projectionDiff(expected: ProjectionRow | null, actual: Omit<ProjectionRow, "status"> & { status: string } | null) {
  if (!expected && !actual) return null;
  if (!expected) return { kind: "orphan" as const, fields: [] as string[] };
  if (!actual) return { kind: "missing" as const, fields: [] as string[] };
  const fields = (["status", "attemptsCount", "lastHintLevel", "score"] as const).filter((field) =>
    field === "score" ? Math.abs(expected.score - actual.score) > 1e-9 : expected[field] !== actual[field],
  );
  return fields.length ? { kind: "mismatch" as const, fields: [...fields] } : null;
}

// Activity pagination: newest first by (createdAt, id); the cursor is opaque.
export type ActivityCursor = { t: string; id: string };
export function encodeCursor(cursor: ActivityCursor) {
  return Buffer.from(JSON.stringify(cursor)).toString("base64url");
}
export function decodeCursor(value: string | undefined): ActivityCursor | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
    if (typeof parsed?.t !== "string" || typeof parsed?.id !== "string" || Number.isNaN(Date.parse(parsed.t)) || parsed.id.length > 64)
      throw new Error("bad cursor");
    return { t: parsed.t, id: parsed.id };
  } catch {
    throw new Error("INVALID_CURSOR");
  }
}
/** Merges per-source pages (each already newest-first, limit+1 long) into one page. */
export function mergeActivityPage<T extends { createdAt: Date; id: string }>(sources: T[][], limit: number) {
  const merged = sources.flat().sort(newestFirst);
  const items = merged.slice(0, limit);
  const last = items.at(-1);
  return {
    items,
    nextCursor: merged.length > limit && last ? encodeCursor({ t: last.createdAt.toISOString(), id: last.id }) : null,
  };
}
