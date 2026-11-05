import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { afterAll, describe, expect, it } from "vitest";
import { RequestRateLimiter } from "../../../common/request-rate-limiter";
import { StudentAccessService } from "../../progress/application/student-access.service";
import { materializeQuizQuestions } from "../../lessons/application/pathway";
import { LearningController } from "./learning.controller";

// SAI-03A lesson quiz hints: synthetic records in the isolated database only.
const testUrl = process.env.NEXALAB_PINNING_TEST_URL;
if (process.env.CI && !testUrl) throw new Error("CI requires NEXALAB_PINNING_TEST_URL for lesson hint integration");
if (testUrl) {
  const url = new URL(testUrl);
  if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) || url.pathname !== "/nexalab_pinning_test")
    throw new Error("lesson hint integration only accepts the isolated local nexalab_pinning_test database");
}
const db = testUrl ? new PrismaClient({ datasourceUrl: testUrl }) : null;
afterAll(async () => { await db?.$disconnect(); });

describe.skipIf(!db)("isolated lesson quiz hints (SAI-03A)", () => {
  it("climbs 1 → 2, unlocks 3 only after a wrong submission, never reveals the key and never changes the score", async () => {
    const p = db!;
    const suffix = randomUUID().slice(0, 8);
    const teacher = await p.user.create({ data: { email: `teacher-${suffix}@example.test`, fullName: "Fixture teacher", passwordHash: "fixture", role: "TEACHER" } });
    const student = await p.user.create({ data: { username: `student-${suffix}`, fullName: "Fixture student", passwordHash: "fixture", role: "STUDENT" } });
    await p.subject.create({ data: { id: `subject-${suffix}`, name: "Isolated fixture" } });
    const questions = materializeQuizQuestions([
      { prompt: "Khi điện áp không đổi, tăng điện trở thì dòng điện sẽ?", options: ["Giảm", "Tăng", "Không đổi"], answer: 0 },
      { prompt: "Đơn vị của điện trở là gì?", options: ["Ôm", "Vôn"], answer: 0 },
    ], suffix);
    const lesson = await p.lesson.create({ data: {
      subjectId: `subject-${suffix}`, authorId: teacher.id, title: "Fixture Ohm", chapter: "fixture", grade: 9, topic: "fixture",
      learningObjective: "fixture", prerequisites: "", curriculum: "fixture", status: "published", synthetic: true,
      content: "Theo định luật Ôm, khi điện áp giữ nguyên mà điện trở lớn lên thì cường độ dòng điện giảm.",
      steps: { create: [
        { type: "READING", position: 10, required: false, config: { html: "<p>Theo định luật Ôm, khi điện áp giữ nguyên mà điện trở lớn lên thì cường độ dòng điện giảm. Điện trở đo bằng đơn vị ôm.</p>" } },
        { type: "QUIZ", position: 40, required: true, config: { questions } },
      ] },
    } });
    const classroom = await p.classroom.create({ data: { teacherId: teacher.id, name: "Fixture class" } });
    await p.enrollment.create({ data: { classId: classroom.id, studentId: student.id, status: "approved", approved: true } });
    const assignment = await p.assignment.create({ data: { classId: classroom.id, contentId: lesson.id, contentType: "lesson", title: "Fixture lesson", targets: { create: { studentId: student.id } } } });
    const learning = new LearningController(p as any, new StudentAccessService(p as any), new RequestRateLimiter());
    const req = { user: { sub: student.id, role: "STUDENT" } };
    const query = { assignmentId: assignment.id };
    const [q1, q2] = questions;
    const ask = (questionId: string, r: any = req) => learning.quizHint(lesson.id, { questionId }, query, r) as Promise<any>;

    // Before any submission: 1, 2, then 2 again with the other wording (level 3 needs a wrong submission).
    const h1 = await ask(q1.id);
    expect(h1).toMatchObject({ questionId: q1.id, level: 1, maxLevel: 2, escalated: false, repeatReason: null, provider: "rules", ruleVersion: "lesson-hints@1" });
    expect(h1.content).toContain("“điện áp”");
    expect(await ask(q1.id)).toMatchObject({ level: 2, escalated: true });
    expect(await ask(q1.id)).toMatchObject({ level: 2, escalated: false, repeatReason: "NEEDS_ATTEMPT" });
    // Each question has its own ladder.
    expect(await ask(q2.id)).toMatchObject({ questionId: q2.id, level: 1 });

    // One of two right is 50 %, the pass threshold: once passed, no more hints.
    const wrong = await learning.submitQuizAttempt(lesson.id, {
      idempotencyKey: randomUUID(), answers: [{ questionId: q1.id, optionId: q1.options[1].id }, { questionId: q2.id, optionId: q2.options[0].id }],
    }, query, req) as any;
    expect(wrong.attempt).toMatchObject({ score: 50, passed: true });
    await expect(ask(q1.id)).rejects.toMatchObject({ response: { code: "HINT_NOT_NEEDED" } });
  }, 60000);

  it("level 3 after a not-passed submission; stored snapshot has no key and no draft", async () => {
    const p = db!;
    const suffix = randomUUID().slice(0, 8);
    const teacher = await p.user.create({ data: { email: `teacher-${suffix}@example.test`, fullName: "Fixture teacher", passwordHash: "fixture", role: "TEACHER" } });
    const student = await p.user.create({ data: { username: `student-${suffix}`, fullName: "Fixture student", passwordHash: "fixture", role: "STUDENT" } });
    const outsider = await p.user.create({ data: { username: `outsider-${suffix}`, fullName: "Fixture outsider", passwordHash: "fixture", role: "STUDENT" } });
    await p.subject.create({ data: { id: `subject-${suffix}`, name: "Isolated fixture" } });
    const questions = materializeQuizQuestions([
      { prompt: "Khi điện áp không đổi, tăng điện trở thì dòng điện sẽ?", options: ["Giảm", "Tăng", "Không đổi"], answer: 0 },
      { prompt: "Đơn vị của điện trở là gì?", options: ["Ôm", "Vôn"], answer: 0 },
      { prompt: "Dụng cụ đo cường độ dòng điện là gì?", options: ["Ampe kế", "Vôn kế"], answer: 0 },
    ], suffix);
    const lesson = await p.lesson.create({ data: {
      subjectId: `subject-${suffix}`, authorId: teacher.id, title: "Fixture Ohm", chapter: "fixture", grade: 9, topic: "fixture",
      learningObjective: "fixture", prerequisites: "", curriculum: "fixture", status: "published", synthetic: true, content: "fixture",
      steps: { create: [
        { type: "READING", position: 10, required: false, config: { html: "<p>Theo định luật Ôm, khi điện áp giữ nguyên mà điện trở lớn lên thì cường độ dòng điện giảm.</p>" } },
        { type: "QUIZ", position: 40, required: true, config: { questions } },
      ] },
    }, include: { steps: true } });
    const quizStep = lesson.steps.find((step) => step.type === "QUIZ")!;
    const classroom = await p.classroom.create({ data: { teacherId: teacher.id, name: "Fixture class" } });
    await p.enrollment.create({ data: { classId: classroom.id, studentId: student.id, status: "approved", approved: true } });
    const assignment = await p.assignment.create({ data: { classId: classroom.id, contentId: lesson.id, contentType: "lesson", title: "Fixture lesson", targets: { create: { studentId: student.id } } } });
    const learning = new LearningController(p as any, new StudentAccessService(p as any), new RequestRateLimiter());
    const req = { user: { sub: student.id, role: "STUDENT" } };
    const query = { assignmentId: assignment.id };
    const [q1, q2, q3] = questions;
    const ask = (questionId: string, r: any = req) => learning.quizHint(lesson.id, { questionId }, query, r) as Promise<any>;

    await ask(q1.id);
    await ask(q1.id);
    const wrong = await learning.submitQuizAttempt(lesson.id, {
      idempotencyKey: randomUUID(), answers: [
        { questionId: q1.id, optionId: q1.options[1].id }, { questionId: q2.id, optionId: q2.options[1].id }, { questionId: q3.id, optionId: q3.options[0].id },
      ],
    }, query, req) as any;
    expect(wrong.attempt.passed).toBe(false);
    const attemptBefore = await p.quizAttempt.findUniqueOrThrow({ where: { id: wrong.attempt.id } });
    const progressBefore = await p.stepProgress.findMany({ where: { studentId: student.id }, orderBy: { id: "asc" } });

    const h3 = await ask(q1.id);
    expect(h3).toMatchObject({ level: 3, maxLevel: 3, escalated: true });
    expect(h3.content).toContain("cường độ dòng điện ___");
    expect(h3.content).not.toMatch(/(?<![\p{L}])(giảm|tăng|không đổi)(?![\p{L}])/iu);
    expect(await ask(q1.id)).toMatchObject({ level: 3, repeatReason: "TOP_LEVEL" });
    // q3 was answered right: its ladder still stops at 2.
    await ask(q3.id);
    expect(await ask(q3.id)).toMatchObject({ level: 2, maxLevel: 2 });

    const stored = await p.hintLog.findUniqueOrThrow({ where: { id: h3.id } });
    expect(stored).toMatchObject({ studentId: student.id, lessonStepId: quizStep.id, attemptId: null, labRunId: null, level: 3 });
    expect(Object.keys(stored.contextSnapshot as object).sort()).toEqual(
      ["assignmentId", "escalated", "kind", "lessonId", "level", "passage", "provider", "questionId", "repeatReason", "ruleVersion", "stepId", "variant"]);
    expect(JSON.stringify(stored.contextSnapshot)).not.toContain(q1.answerOptionId);

    // FR-22: the attempt and step progress are unchanged by hints.
    expect(await p.quizAttempt.findUniqueOrThrow({ where: { id: wrong.attempt.id } })).toEqual(attemptBefore);
    expect(await p.stepProgress.findMany({ where: { studentId: student.id }, orderBy: { id: "asc" } })).toEqual(progressBefore);

    // Unknown question, another student, not enrolled.
    await expect(ask("question-unknown")).rejects.toMatchObject({ response: { code: "QUESTION_NOT_FOUND" } });
    await expect(ask(q1.id, { user: { sub: outsider.id, role: "STUDENT" } })).rejects.toBeTruthy();
    await expect(learning.quizHint(lesson.id, { questionId: q1.id, draft: "x" }, query, req)).rejects.toBeTruthy();
  }, 60000);
});
