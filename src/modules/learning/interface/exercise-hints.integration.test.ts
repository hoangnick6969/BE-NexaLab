import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { afterAll, describe, expect, it } from "vitest";
import { RequestRateLimiter } from "../../../common/request-rate-limiter";
import { StudentAccessService } from "../../progress/application/student-access.service";
import { LearningController } from "./learning.controller";
import type { StudentAiProvider } from "../../student-ai/application/student-llm";

// SAI-03-T3 basic exercise hints: synthetic records in the isolated database only.
const testUrl = process.env.NEXALAB_PINNING_TEST_URL;
if (process.env.CI && !testUrl) throw new Error("CI requires NEXALAB_PINNING_TEST_URL for exercise hint integration");
if (testUrl) {
  const url = new URL(testUrl);
  if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) || url.pathname !== "/nexalab_pinning_test")
    throw new Error("exercise hint integration only accepts the isolated local nexalab_pinning_test database");
}
const db = testUrl ? new PrismaClient({ datasourceUrl: testUrl }) : null;
afterAll(async () => { await db?.$disconnect(); });

async function releasedLesson(p: PrismaClient, suffix: string, options: { synthetic?: boolean; packStatus?: string } = {}) {
  const teacher = await p.user.create({ data: { email: `teacher-${suffix}@example.test`, fullName: "Fixture teacher", passwordHash: "fixture", role: "TEACHER" } });
  await p.subject.create({ data: { id: `subject-${suffix}`, name: "Isolated fixture" } });
  // Raw insert: migration 20261025150000 made ContentPack.subjectId NOT NULL, but schema.prisma has no such field.
  await p.$executeRaw`INSERT INTO "ContentPack" ("key", "grade", "domain", "title", "namespace", "subjectId") VALUES (${`pack-${suffix}`}, 9, 'ENERGY', 'Fixture pack', 'fixture', ${`subject-${suffix}`})`;
  const pack = await p.contentPackVersion.create({ data: {
    packKey: `pack-${suffix}`, version: 1, digest: `digest-${suffix}`, manifest: {}, status: options.packStatus ?? "released", synthetic: false,
  } });
  const config = {
    passThreshold: 100,
    questions: [
      { id: "q1", prompt: "Khi điện áp không đổi, tăng điện trở thì dòng điện sẽ?", options: [{ id: "a", text: "Giảm" }, { id: "b", text: "Tăng" }, { id: "c", text: "Không đổi" }], correctOptionId: "a" },
      { id: "q2", prompt: "Đơn vị của điện trở là gì?", options: [{ id: "d", text: "Ôm" }, { id: "e", text: "Vôn" }], correctOptionId: "d" },
    ],
  };
  return p.lesson.create({ data: {
    subjectId: `subject-${suffix}`, authorId: teacher.id, title: `Fixture Ohm ${suffix}`, chapter: "fixture", grade: 9, topic: "fixture",
    learningObjective: "fixture", prerequisites: "", curriculum: "fixture", status: "published", scope: "SHARED_LIBRARY",
    synthetic: options.synthetic ?? false, packVersionId: pack.id, content: "fixture",
    steps: { create: [
      { type: "READING", position: 10, required: true, config: { html: "<p>Theo định luật Ôm, khi điện áp giữ nguyên mà điện trở lớn lên thì cường độ dòng điện giảm. Điện trở đo bằng đơn vị ôm.</p>" } },
      { id: `exercise-${suffix}`, type: "BASIC_EXERCISE", position: 30, required: true, config },
    ] },
  }, include: { steps: true } });
}

describe.skipIf(!db)("isolated basic exercise hints (SAI-03-T3)", () => {
  it("climbs 1 → 2, unlocks 3 only after a wrong submission, never reveals the key and never changes the attempt", async () => {
    const p = db!;
    const suffix = randomUUID().slice(0, 8);
    const lesson = await releasedLesson(p, suffix);
    const step = lesson.steps.find((item) => item.type === "BASIC_EXERCISE")!;
    const student = await p.user.create({ data: { username: `student-${suffix}`, fullName: "Fixture student", passwordHash: "fixture", role: "STUDENT" } });
    const learning = new LearningController(p as any, new StudentAccessService(p as any), new RequestRateLimiter());
    const req = { user: { sub: student.id, role: "STUDENT" } };
    const ask = (questionId: string, body: any = { questionId }) => learning.basicExerciseHint(lesson.id, step.id, body, req) as Promise<any>;

    // Before any submission: 1, 2, then 2 again with the other wording.
    const h1 = await ask("q1");
    expect(h1).toMatchObject({ questionId: "q1", level: 1, maxLevel: 2, escalated: false, repeatReason: null, provider: "rules", ruleVersion: "lesson-hints@1" });
    expect(h1.content).toContain("“điện áp”");
    expect(await ask("q1")).toMatchObject({ level: 2, escalated: true });
    expect(await ask("q1")).toMatchObject({ level: 2, escalated: false, repeatReason: "NEEDS_ATTEMPT" });

    // q1 wrong, q2 right: 50 % < 100 % threshold.
    const wrong = await learning.submitBasicExercise(lesson.id, step.id, {
      idempotencyKey: randomUUID(), answers: [{ questionId: "q1", optionId: "b" }, { questionId: "q2", optionId: "d" }],
    }, req) as any;
    expect(wrong).toMatchObject({ score: 50, passed: false });
    const attemptBefore = await p.basicExerciseAttempt.findUniqueOrThrow({ where: { id: wrong.id } });
    const progressBefore = await p.stepProgress.findMany({ where: { studentId: student.id }, orderBy: { id: "asc" } });

    const h3 = await ask("q1");
    expect(h3).toMatchObject({ level: 3, maxLevel: 3, escalated: true });
    expect(h3.content).toContain("cường độ dòng điện ___");
    expect(h3.content).not.toMatch(/(?<![\p{L}])(giảm|tăng|không đổi)(?![\p{L}])/iu);
    expect(await ask("q1")).toMatchObject({ level: 3, repeatReason: "TOP_LEVEL" });
    // q2 was answered right: its ladder still stops at 2.
    await ask("q2");
    expect(await ask("q2")).toMatchObject({ level: 2, maxLevel: 2 });

    const stored = await p.hintLog.findUniqueOrThrow({ where: { id: h3.id } });
    expect(stored).toMatchObject({ studentId: student.id, lessonStepId: step.id, attemptId: null, labRunId: null, level: 3 });
    expect(stored.contextSnapshot).toMatchObject({ kind: "exercise-question-hint", assignmentId: null, questionId: "q1" });
    expect(Object.keys(stored.contextSnapshot as object).sort()).toEqual(
      ["assignmentId", "escalated", "kind", "lessonId", "level", "passage", "provider", "questionId", "repeatReason", "ruleHint", "ruleVersion", "stepId", "variant"]);
    expect(JSON.stringify(stored.contextSnapshot)).not.toContain("correctOptionId");

    // FR-22: the attempt and step progress are unchanged by hints.
    expect(await p.basicExerciseAttempt.findUniqueOrThrow({ where: { id: wrong.id } })).toEqual(attemptBefore);
    expect(await p.stepProgress.findMany({ where: { studentId: student.id }, orderBy: { id: "asc" } })).toEqual(progressBefore);

    // Unknown question, extra body fields (no draft accepted), wrong step.
    await expect(ask("q-unknown")).rejects.toMatchObject({ response: { code: "QUESTION_NOT_FOUND" } });
    await expect(ask("q1", { questionId: "q1", optionId: "a" })).rejects.toBeTruthy();
    await expect(learning.basicExerciseHint(lesson.id, lesson.steps[0].id, { questionId: "q1" }, req))
      .rejects.toMatchObject({ response: { code: "CURRICULUM_EXERCISE_NOT_FOUND" } });

    // Passing the exercise ends hints.
    await learning.submitBasicExercise(lesson.id, step.id, {
      idempotencyKey: randomUUID(), answers: [{ questionId: "q1", optionId: "a" }, { questionId: "q2", optionId: "d" }],
    }, req);
    await expect(ask("q2")).rejects.toMatchObject({ response: { code: "HINT_NOT_NEEDED" } });
  }, 60000);

  it("refuses unreleased or synthetic lessons and keeps each student's ladder apart", async () => {
    const p = db!;
    const retired = await releasedLesson(p, randomUUID().slice(0, 8), { packStatus: "retired" });
    const synthetic = await releasedLesson(p, randomUUID().slice(0, 8), { synthetic: true });
    const live = await releasedLesson(p, randomUUID().slice(0, 8));
    const suffix = randomUUID().slice(0, 8);
    const [a, b] = await Promise.all(["a", "b"].map((name) =>
      p.user.create({ data: { username: `student-${name}-${suffix}`, fullName: "Fixture student", passwordHash: "fixture", role: "STUDENT" } })));
    const learning = new LearningController(p as any, new StudentAccessService(p as any), new RequestRateLimiter());
    const exercise = (lesson: any) => lesson.steps.find((item: any) => item.type === "BASIC_EXERCISE").id;
    for (const lesson of [retired, synthetic])
      await expect(learning.basicExerciseHint(lesson.id, exercise(lesson), { questionId: "q1" }, { user: { sub: a.id } }))
        .rejects.toMatchObject({ response: { code: "CURRICULUM_EXERCISE_NOT_FOUND" } });
    await learning.basicExerciseHint(live.id, exercise(live), { questionId: "q1" }, { user: { sub: a.id } });
    expect(await learning.basicExerciseHint(live.id, exercise(live), { questionId: "q1" }, { user: { sub: b.id } })).toMatchObject({ level: 1 });
  }, 60000);

  it("LLM-first: the LLM words the hint; naming an option falls back to the answer-blind rule text", async () => {
    const p = db!;
    const suffix = randomUUID().slice(0, 8);
    const lesson = await releasedLesson(p, suffix);
    const step = lesson.steps.find((item) => item.type === "BASIC_EXERCISE")!;
    const student = await p.user.create({ data: { username: `llm-${suffix}`, fullName: "Fixture student", passwordHash: "fixture", role: "STUDENT" } });
    let reply = "Câu hỏi đang nói về điện áp và điện trở; em cần tìm điều gì?";
    const sent: string[] = [];
    const provider: StudentAiProvider = { name: "fake", model: "fake-student@1", complete: async ({ user }) => { sent.push(user); return JSON.stringify({ hint: reply }); } };
    const learning = new LearningController(p as any, new StudentAccessService(p as any), new RequestRateLimiter(), provider);
    const env = { APP_ENV: process.env.APP_ENV, STUDENT_AI_LLM_ENABLED: process.env.STUDENT_AI_LLM_ENABLED };
    Object.assign(process.env, { APP_ENV: "test", STUDENT_AI_LLM_ENABLED: "true" });
    try {
      const req = { user: { sub: student.id, role: "STUDENT" } };
      const h1: any = await learning.basicExerciseHint(lesson.id, step.id, { questionId: "q1" }, req);
      expect(h1).toMatchObject({ level: 1, provider: "fake", content: reply });
      // The payload has the prompt and option texts, never the key or an ID.
      expect(JSON.parse(sent[0])).toMatchObject({ surface: "basic-exercise", question: { prompt: expect.any(String), options: ["Giảm", "Tăng", "Không đổi"] } });
      expect(sent[0]).not.toMatch(/correctOptionId|"a"|q1|exercise-|lesson/);
      reply = "Dòng điện sẽ Giảm, đúng không?";
      const h2: any = await learning.basicExerciseHint(lesson.id, step.id, { questionId: "q1" }, req);
      expect(h2.provider).toBe("rules-fallback");
      expect(h2.content).not.toMatch(/(?<![\p{L}])giảm(?![\p{L}])/iu);
      expect(await p.hintLog.findUniqueOrThrow({ where: { id: h2.id } })).toMatchObject({ fallbackReason: "GUARD:OPTION_NAMED", promptVersion: "student-hint@1" });
    } finally {
      Object.assign(process.env, env);
      for (const [key, value] of Object.entries(env)) if (value === undefined) delete process.env[key];
    }
  }, 60000);
});
