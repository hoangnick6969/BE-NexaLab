import { describe, expect, it } from "vitest";
import { applyLessonChallenge, assertChallengeParams, lessonChallengeBlocker, lessonStructureLocked, lessonStructureLockedIds, writeLessonSteps } from "./lesson-challenge";
import { challengeObjective, variantChallengeId } from "./lesson-content";

/** TAI6-T1: the extracted lessons application functions keep the lesson route behavior (route manifest identical, checked by script). */
type Row = Record<string, any>;
function fakeTx(initial: { lesson?: Row; counts?: Partial<Record<"assignment" | "stepProgress" | "quizAttempt" | "attempt", number>>; steps?: Row[] } = {}) {
  const calls: string[] = [];
  const lesson = { id: "l1", authorId: "t1", scope: "TEACHER_PRIVATE", status: "draft", labId: null, challengeParams: null, title: "T", grade: 8, review: null, ...(initial.lesson ?? {}) };
  const tx: Row = {
    lesson: {
      findUnique: async ({ where }: Row) => (where.id === lesson.id ? { ...lesson } : null),
      update: async ({ data }: Row) => Object.assign(lesson, data),
    },
    lessonStep: {
      findMany: async () => initial.steps ?? [],
      deleteMany: async () => calls.push("step.deleteMany"),
      upsert: async ({ where }: Row) => calls.push(`step.upsert:${where.id}`),
    },
    challenge: { upsert: async ({ where, create }: Row) => calls.push(`challenge.upsert:${where.id}:${create.objective}`) },
    assignment: { count: async () => initial.counts?.assignment ?? 0 },
    stepProgress: { count: async () => initial.counts?.stepProgress ?? 0 },
    quizAttempt: { count: async () => initial.counts?.quizAttempt ?? 0 },
    attempt: { count: async () => initial.counts?.attempt ?? 0 },
    auditLog: { create: async ({ data }: Row) => calls.push(`audit:${data.action}:${JSON.stringify(data.after)}`) },
  };
  return { tx, calls, lesson };
}

describe("lesson challenge application functions", () => {
  it("assertChallengeParams keeps the 400 INVALID_CHALLENGE_PARAMS envelope of the lesson routes", () => {
    expect(() => assertChallengeParams("circuit", { maxCurrentMa: 10 })).not.toThrow();
    expect(() => assertChallengeParams("circuit", null)).not.toThrow();
    expect(() => assertChallengeParams(null, { maxCurrentMa: 10 })).toThrowError(expect.objectContaining({ status: 400, response: expect.objectContaining({ code: "INVALID_CHALLENGE_PARAMS" }) }));
    try {
      assertChallengeParams("circuit", { maxCurrentMa: 99 });
      expect.unreachable();
    } catch (error: any) {
      expect(error.response.details.errors).toHaveLength(1);
    }
  });

  it("detects a structure lock from any assignment, progress, quiz or practical evidence, and in bulk", async () => {
    expect(await lessonStructureLocked(fakeTx().tx, "l1")).toBe(false);
    for (const key of ["assignment", "stepProgress", "quizAttempt", "attempt"] as const) expect(await lessonStructureLocked(fakeTx({ counts: { [key]: 1 } }).tx, "l1")).toBe(true);
    const bulk = {
      lessonStep: { findMany: async () => [{ id: "s1", lessonId: "a" }, { id: "s2", lessonId: "b" }] },
      assignment: { groupBy: async () => [{ contentId: "a" }] },
      stepProgress: { groupBy: async () => [{ stepId: "s2" }] },
      quizAttempt: { groupBy: async () => [] },
      attempt: { groupBy: async () => [] },
    };
    expect([...(await lessonStructureLockedIds(bulk, ["a", "b", "c"]))].sort()).toEqual(["a", "b"]);
    expect((await lessonStructureLockedIds(bulk, [])).size).toBe(0);
  });

  it("writes a variant Challenge row and CHALLENGE step only for published steps, as the controller did", async () => {
    const draft = fakeTx();
    await writeLessonSteps(draft.tx, "l1", [], { labId: "circuit", challengeParams: { maxCurrentMa: 10 } });
    expect(draft.calls).toEqual([]);
    const published = fakeTx();
    await writeLessonSteps(published.tx, "l1", [{ type: "READING", position: 10, required: true, config: {} }], { labId: "circuit", challengeParams: { maxCurrentMa: 10 } });
    expect(published.calls).toEqual([
      `challenge.upsert:${variantChallengeId("circuit", "l1")}:${challengeObjective("circuit", { maxCurrentMa: 10 })}`,
      "step.deleteMany",
      "step.upsert:step-l1-reading",
      "step.upsert:step-l1-challenge",
    ]);
  });

  it("classifies a lesson for the AI module: own private draft is editable; shared, foreign, published and locked are not", async () => {
    expect(await lessonChallengeBlocker(fakeTx().tx, "l1", "t1")).toBeNull();
    expect(await lessonChallengeBlocker(fakeTx().tx, "missing", "t1")).toBe("NOT_FOUND");
    expect(await lessonChallengeBlocker(fakeTx().tx, "l1", "other")).toBe("NOT_EDITABLE");
    expect(await lessonChallengeBlocker(fakeTx({ lesson: { scope: "SHARED_LIBRARY" } }).tx, "l1", "t1")).toBe("NOT_EDITABLE");
    expect(await lessonChallengeBlocker(fakeTx({ lesson: { status: "published" } }).tx, "l1", "t1")).toBe("NOT_EDITABLE");
    expect(await lessonChallengeBlocker(fakeTx({ lesson: { status: "quarantined" } }).tx, "l1", "t1")).toBe("NOT_EDITABLE");
    expect(await lessonChallengeBlocker(fakeTx({ counts: { attempt: 1 } }).tx, "l1", "t1")).toBe("NOT_EDITABLE");
  });

  it("applyLessonChallenge validates again, updates only the lesson and audits lesson.update", async () => {
    const ok = fakeTx();
    const lesson = await applyLessonChallenge(ok.tx, { sub: "t1", role: "TEACHER" }, "l1", { labId: "circuit", challengeParams: { maxCurrentMa: 12 } });
    expect(lesson).toMatchObject({ labId: "circuit", challengeParams: { maxCurrentMa: 12 } });
    expect(ok.calls).toHaveLength(1);
    expect(ok.calls[0]).toMatch(/^audit:lesson\.update:/);
    expect(ok.calls.some((call) => call.startsWith("challenge") || call.startsWith("step"))).toBe(false);
    const bad = fakeTx();
    await expect(applyLessonChallenge(bad.tx, { sub: "t1", role: "TEACHER" }, "l1", { labId: "circuit", challengeParams: { maxCurrentMa: 99 } })).rejects.toMatchObject({ status: 400 });
    expect(bad.lesson.labId).toBeNull();
  });
});
