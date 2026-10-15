import { describe, expect, it } from "vitest";
import { materializeLegacySteps } from "./pathway";
import {
  decodeCursor,
  deriveLesson,
  encodeCursor,
  labProjection,
  lessonProjection,
  mergeActivityPage,
  normalizeVerdict,
  practicalSummary,
  projectionDiff,
  quizSummary,
  type LessonEvidence,
} from "./progress";

const steps = materializeLegacySteps({
  content: "<p>Read</p>",
  materials: [{ type: "video", url: "https://example.test/video", title: "Watch" }],
  questions: [{ prompt: "Q1", options: ["A", "B"], answer: 1 }],
  labId: "circuit",
}).map((step) => ({ ...step, id: `s-${step.type.toLowerCase()}`, required: true }));
const [reading, video, quiz, lab] = steps.map((step) => step.id);
const at = (minute: number) => new Date(Date.UTC(2026, 9, 13, 8, minute));
const none: LessonEvidence = { stepProgress: [], quizAttempts: [], attempts: [] };
const done = (stepId: string, minute: number) => ({
  stepId,
  status: "COMPLETED" as const,
  progressValue: 100,
  lastPosition: null,
  visitedCardIds: [],
  startedAt: at(minute),
  completedAt: at(minute),
  updatedAt: at(minute),
});
const quizAttempt = (id: string, score: number, minute: number, assignmentId: string | null = "as-1") => ({
  id, stepId: quiz, lessonId: "lesson-1", assignmentId, score, passed: score >= 50, createdAt: at(minute),
});
const practical = (id: string, verdict: string, minute: number, hintLevel = 0, lessonStepId: string | null = lab) => ({
  id, challengeId: "circuit_001", lessonStepId, assignmentId: "as-1", verdict, createdAt: at(minute), hintLevel,
});

describe("official lesson derivation", () => {
  it("not started: zero of four required, next step is the first step", () => {
    const result = deriveLesson(steps, none);
    expect(result).toMatchObject({ completedRequired: 0, totalRequired: 4, percent: 0, completed: false, started: false, nextStepId: reading });
    expect(result.steps.map((step) => step.state)).toEqual(["AVAILABLE", "LOCKED", "LOCKED", "LOCKED"]);
    expect(result.steps.every((step) => step.evidenceId === null)).toBe(true);
  });

  it("partial: completed reading and a failed quiz keep the lab locked", () => {
    const result = deriveLesson(steps, {
      stepProgress: [done(reading, 1), done(video, 2)],
      quizAttempts: [quizAttempt("q1", 0, 3)],
      attempts: [],
    });
    expect(result).toMatchObject({ completedRequired: 2, percent: 50, nextStepId: quiz });
    expect(result.steps.map((step) => step.state)).toEqual(["COMPLETED", "COMPLETED", "IN_PROGRESS", "LOCKED"]);
    expect(result.steps[2]).toMatchObject({ evidenceType: "QUIZ_ATTEMPT", evidenceId: "q1" });
    expect(result.steps[0]).toMatchObject({ evidenceType: "STEP_PROGRESS", evidenceId: reading, completedAt: at(1).toISOString() });
  });

  it("passed: quiz completion cites the first passing attempt and a failed lab retry does not undo a pass", () => {
    const result = deriveLesson(steps, {
      stepProgress: [done(reading, 1), done(video, 2)],
      quizAttempts: [quizAttempt("q1", 0, 3), quizAttempt("q2", 100, 4), quizAttempt("q3", 0, 5)],
      attempts: [practical("p1", "partial", 6), practical("p2", "passed", 7), practical("p3", "needs_practice", 8)],
    });
    expect(result).toMatchObject({ completedRequired: 4, totalRequired: 4, percent: 100, completed: true, nextStepId: null });
    expect(result.steps[2]).toMatchObject({ evidenceId: "q2", completedAt: at(4).toISOString(), updatedAt: at(5).toISOString() });
    expect(result.steps[2].quiz).toMatchObject({ attempts: 3, latest: { attemptId: "q3", score: 0 }, best: { attemptId: "q2", score: 100 } });
    expect(result.steps[3]).toMatchObject({ state: "COMPLETED", evidenceType: "PRACTICAL_ATTEMPT", evidenceId: "p2" });
    expect(result.steps[3].practical).toMatchObject({ latest: { verdict: "needs_practice" }, best: { attemptId: "p2", verdict: "passed" } });
  });

  it("returns a null percent when nothing is required", () => {
    const optional = steps.map((step) => ({ ...step, required: false }));
    expect(deriveLesson(optional, none)).toMatchObject({ totalRequired: 0, percent: null, completed: false });
  });

  it("ignores practical evidence that is not linked to the lesson step", () => {
    const result = deriveLesson(steps, { ...none, attempts: [practical("legacy", "passed", 1, 0, null)] });
    expect(result.completedRequired).toBe(0);
  });

  it("uses the pH lab pass for its duplicate optional demo challenge without another attempt", () => {
    const pHSteps = [
      ...steps.slice(0, -1),
      { ...steps[3], config: { labId: "chemistry" } },
      { id: "pH-duplicate", type: "CHALLENGE" as const, position: 60, required: false, config: { challengeId: "chemistry_001", sameAsLab: true } },
    ];
    const result = deriveLesson(pHSteps, {
      stepProgress: [done(reading, 1), done(video, 2)],
      quizAttempts: [quizAttempt("q-pass", 100, 3)],
      attempts: [{ ...practical("pH-pass", "passed", 4), challengeId: "chemistry_001" }],
    });
    expect(result).toMatchObject({ completed: true, totalRequired: 4, completedRequired: 4, nextStepId: null });
    expect(result.steps.at(-1)).toMatchObject({ state: "COMPLETED", evidenceId: "pH-pass" });
  });
});

describe("summaries", () => {
  it("labels latest and best quiz attempts; newest wins a best-score tie", () => {
    expect(quizSummary([quizAttempt("a", 100, 1), quizAttempt("b", 100, 2), quizAttempt("c", 0, 3)])).toMatchObject({
      latest: { attemptId: "c" },
      best: { attemptId: "b" },
    });
    expect(quizSummary([])).toBeNull();
  });
  it("normalizes legacy not_passed verdicts", () => {
    expect(normalizeVerdict("not_passed")).toBe("needs_practice");
    expect(normalizeVerdict("bogus")).toBeNull();
    expect(practicalSummary([practical("x", "not_passed", 1)])).toMatchObject({ latest: { verdict: "needs_practice" }, passedAt: null });
  });
});

describe("projection", () => {
  it("has no row without evidence and only completes when every required step is complete", () => {
    expect(lessonProjection("st", "lesson-1", steps, none)).toBeNull();
    const partial = lessonProjection("st", "lesson-1", steps, { ...none, quizAttempts: [quizAttempt("q", 100, 1)] });
    expect(partial).toMatchObject({ status: "in_progress", score: 100, attemptsCount: 1 });
  });
  it("is not completed for an unpublished (archived) lesson", () => {
    const evidence = {
      stepProgress: [done(reading, 1), done(video, 2)],
      quizAttempts: [quizAttempt("q", 100, 3)],
      attempts: [practical("p", "passed", 4, 2)],
    };
    expect(lessonProjection("st", "lesson-1", steps, evidence)).toMatchObject({ status: "completed", attemptsCount: 2, lastHintLevel: 2 });
    expect(lessonProjection("st", "lesson-1", steps, evidence, false)).toMatchObject({ status: "in_progress" });
  });
  it("keeps the legacy lab verdict rank and detects drift", () => {
    const expected = labProjection("st", "circuit", [practical("a", "partial", 1, 1), practical("b", "not_passed", 2, 3)])!;
    expect(expected).toMatchObject({ status: "in_progress", score: 50, attemptsCount: 2, lastHintLevel: 3 });
    expect(projectionDiff(expected, { ...expected })).toBeNull();
    expect(projectionDiff(expected, { ...expected, status: "completed", score: 100 })).toEqual({ kind: "mismatch", fields: ["status", "score"] });
    expect(projectionDiff(null, { ...expected })).toMatchObject({ kind: "orphan" });
    expect(projectionDiff(expected, null)).toMatchObject({ kind: "missing" });
  });
});

describe("activity pagination", () => {
  const rows = (prefix: string, minutes: number[]) =>
    minutes.map((minute, index) => ({ id: `${prefix}${index}`, createdAt: at(minute) }));
  const pageOf = (all: Array<{ id: string; createdAt: Date }>[], limit: number, cursor?: string) => {
    const c = decodeCursor(cursor);
    const after = (row: { id: string; createdAt: Date }) =>
      !c || row.createdAt < new Date(c.t) || (row.createdAt.getTime() === new Date(c.t).getTime() && row.id < c.id);
    const sorted = all.map((source) =>
      source.filter(after).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || (a.id < b.id ? 1 : -1)).slice(0, limit + 1),
    );
    return mergeActivityPage(sorted, limit);
  };

  it("pages a two-source union without duplicates or gaps when timestamps collide", () => {
    const quiz = rows("q", [5, 5, 5, 3, 1]);
    const practical = rows("p", [5, 5, 4, 3, 3, 0]);
    const seen: string[] = [];
    let cursor: string | undefined;
    let pages = 0;
    do {
      const page = pageOf([quiz, practical], 3, cursor);
      seen.push(...page.items.map((item) => item.id));
      cursor = page.nextCursor ?? undefined;
      pages++;
    } while (cursor && pages < 20);
    expect(seen).toHaveLength(11);
    expect(new Set(seen).size).toBe(11);
    const all = [...quiz, ...practical].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || (a.id < b.id ? 1 : -1));
    expect(seen).toEqual(all.map((item) => item.id));
  });

  it("returns no cursor on the last page and rejects tampered cursors", () => {
    expect(pageOf([rows("q", [1])], 5).nextCursor).toBeNull();
    expect(decodeCursor(encodeCursor({ t: at(1).toISOString(), id: "x" }))).toEqual({ t: at(1).toISOString(), id: "x" });
    expect(() => decodeCursor("not-a-cursor")).toThrow("INVALID_CURSOR");
    expect(() => decodeCursor(Buffer.from(JSON.stringify({ t: "never", id: "x" })).toString("base64url"))).toThrow("INVALID_CURSOR");
  });
});
