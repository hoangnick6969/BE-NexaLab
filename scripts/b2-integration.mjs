import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import * as argon from "argon2";

const db = new PrismaClient();
const api = process.env.TEST_API ?? "http://127.0.0.1:4100/api";
const prefix = process.env.B2_FIXTURE_PREFIX ?? "b2-" + Date.now().toString(36);
const password = "B2-Local-Test-2026!";
const ids = { teacher: `${prefix}-teacher`, outsider: `${prefix}-outsider`, student: `${prefix}-student`, class: `${prefix}-class`, lesson: `${prefix}-lesson`, assignment: `${prefix}-assignment` };
let passed = 0;
const check = (name, condition, detail) => { assert.ok(condition, `${name}${detail ? ` — ${JSON.stringify(detail)}` : ""}`); passed++; console.log("PASS " + name); };
async function req(path, method = "GET", body, token, headers = {}) {
  const response = await fetch(api + path, { method, headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}), ...headers }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  let data = null; try { data = await response.json(); } catch {}
  return { status: response.status, data };
}

try {
  const passwordHash = await argon.hash(password);
  await db.user.createMany({ data: [
    { id: ids.teacher, email: `${prefix}@teacher.local`, passwordHash, fullName: "Giáo viên B2", role: "TEACHER", consentAt: new Date() },
    { id: ids.outsider, email: `${prefix}@outsider.local`, passwordHash, fullName: "Giáo viên ngoài lớp", role: "TEACHER", consentAt: new Date() },
    { id: ids.student, username: `${prefix}.student`, passwordHash, fullName: "Học sinh B2", role: "STUDENT", consentAt: new Date() },
  ] });
  await db.classroom.create({ data: { id: ids.class, teacherId: ids.teacher, name: `B2 ${prefix}`, grade: 8, joinCodeEnabled: false } });
  await db.enrollment.create({ data: { classId: ids.class, studentId: ids.student, status: "approved", approved: true } });
  const subject = await db.subject.findFirst();
  assert.ok(subject, "seeded subject required");
  await db.lesson.create({ data: {
    id: ids.lesson, subjectId: subject.id, authorId: ids.teacher, title: "B2 evidence fixture", chapter: "B2", grade: 8, topic: "Evidence", learningObjective: "Test assignment-scoped evidence", prerequisites: "None", curriculum: "Synthetic", content: "Synthetic", status: "published", synthetic: true,
    steps: { create: [
      { id: `${prefix}-read`, type: "READING", position: 1, required: true, config: { html: "<p>Read</p>" } },
      { id: `${prefix}-quiz`, type: "QUIZ", position: 2, required: true, config: { questions: [{ id: "q1", prompt: "1?", options: [{ id: "a", text: "A" }, { id: "b", text: "B" }], answerOptionId: "a" }] } },
      { id: `${prefix}-lab`, type: "LAB", position: 3, required: true, config: { labId: "circuit", challengeId: "circuit_001" } },
      { id: `${prefix}-after`, type: "READING", position: 4, required: true, config: { html: "<p>After lab</p>" } },
    ] },
  } });
  await db.assignment.create({ data: { id: ids.assignment, classId: ids.class, contentId: ids.lesson, contentType: "lesson", title: "B2 assignment", audience: "CLASS", status: "ACTIVE", createdById: ids.teacher, dueDate: new Date(Date.now() - 1000), targets: { create: { studentId: ids.student } } } });
  await db.stepProgress.create({ data: { studentId: ids.student, assignmentId: ids.assignment, stepId: `${prefix}-read`, status: "COMPLETED", progressValue: 100, startedAt: new Date(), completedAt: new Date() } });
  for (let index = 0; index < 2; index++) await db.quizAttempt.create({ data: { studentId: ids.student, assignmentId: ids.assignment, lessonId: ids.lesson, stepId: `${prefix}-quiz`, answers: [{ questionId: "q1", optionId: "b" }], questionSnapshot: [{ id: "q1", answerOptionId: "a" }], correctCount: 0, questionCount: 1, score: 0, passed: false, idempotencyKey: `${prefix}-quiz-${index}` } });

  const login = await req("/auth/login", "POST", { email: `${prefix}@teacher.local`, password });
  const studentLogin = await req("/auth/student/login", "POST", { username: `${prefix}.student`, password });
  const outsiderLogin = await req("/auth/login", "POST", { email: `${prefix}@outsider.local`, password });
  check("teacher, outsider and student authenticate", login.status === 201 && studentLogin.status === 201 && outsiderLogin.status === 201);
  const teacherToken = login.data.accessToken;
  const studentToken = studentLogin.data.accessToken;
  const outsiderToken = outsiderLogin.data.accessToken;
  const board = await req(`/classes/${ids.class}/assignments/${ids.assignment}/progress`, "GET", undefined, teacherToken);
  check("assignment board is scoped to its target", board.status === 200 && board.data.length === 1 && board.data[0].student.id === ids.student, board);
  const timings = [];
  for (let index = 0; index < 20; index++) {
    const started = performance.now();
    const measured = await req(`/classes/${ids.class}/assignments/${ids.assignment}/progress`, "GET", undefined, teacherToken);
    assert.equal(measured.status, 200);
    timings.push(performance.now() - started);
  }
  timings.sort((a, b) => a - b);
  const p95 = timings[Math.ceil(timings.length * 0.95) - 1];
  const databaseHost = new URL(process.env.DATABASE_URL).hostname;
  const localPerformance = ["127.0.0.1", "localhost"].includes(databaseHost);
  check("assignment board p95 is within the 500 ms read target", !localPerformance || p95 <= 500, { p95Ms: Math.round(p95 * 10) / 10, environment: localPerformance ? "local-postgresql" : "shared-development", performanceEnforced: localPerformance });
  const support = await req(`/classes/${ids.class}/assignments/${ids.assignment}/support`, "GET", undefined, teacherToken);
  const codes = support.data?.[0]?.flags?.map((flag) => flag.code) ?? [];
  check("support rules report overdue and two quiz failures", support.status === 200 && codes.includes("OVERDUE_INCOMPLETE") && codes.includes("QUIZ_FAILED_TWICE"), support);
  const evidence = await req(`/classes/${ids.class}/students/${ids.student}/evidence?assignmentId=${ids.assignment}`, "GET", undefined, teacherToken);
  check("evidence sheet reconciles exact quiz rows", evidence.status === 200 && evidence.data.quizAttempts.length === 2, evidence);
  const outsiderEvidence = await req(`/classes/${ids.class}/students/${ids.student}/evidence?assignmentId=${ids.assignment}`, "GET", undefined, outsiderToken);
  check("outsider receives the same evidence-not-found contract", outsiderEvidence.status === 404 && outsiderEvidence.data?.code === "EVIDENCE_NOT_FOUND", outsiderEvidence);
  await db.enrollment.update({ where: { classId_studentId: { classId: ids.class, studentId: ids.student } }, data: { status: "removed", approved: false } });
  const removedEvidence = await req(`/classes/${ids.class}/students/${ids.student}/evidence?assignmentId=${ids.assignment}`, "GET", undefined, teacherToken);
  check("removed student evidence is hidden from former teacher", removedEvidence.status === 404 && removedEvidence.data?.code === "EVIDENCE_NOT_FOUND", removedEvidence);
  await db.enrollment.update({ where: { classId_studentId: { classId: ids.class, studentId: ids.student } }, data: { status: "approved", approved: true } });
  const grant = await req(`/classes/${ids.class}/assignments/${ids.assignment}/students/${ids.student}/overrides`, "POST", { stepId: `${prefix}-lab`, reason: "Hỗ trợ học sinh tiếp tục thực hành" }, teacherToken, { "Idempotency-Key": `${prefix}-grant` });
  check("teacher grants a scoped persistent override", grant.status === 201 && grant.data.active === true, grant);
  const grantReplay = await req(`/classes/${ids.class}/assignments/${ids.assignment}/students/${ids.student}/overrides`, "POST", { stepId: `${prefix}-lab`, reason: "Hỗ trợ học sinh tiếp tục thực hành" }, teacherToken, { "Idempotency-Key": `${prefix}-grant` });
  check("override retry replays without broadening scope", grantReplay.status === 201 && grantReplay.data.id === grant.data.id, grantReplay);
  const pathway = await req(`/lessons/${ids.lesson}/pathway`, "GET", undefined, studentToken);
  const lab = pathway.data?.steps?.find((step) => step.id === `${prefix}-lab`);
  check("student pathway explicitly shows teacher unlock", pathway.status === 200 && lab?.state === "IN_PROGRESS" && lab?.teacherUnlocked === true, pathway);
  const revoke = await req(`/classes/${ids.class}/assignments/${ids.assignment}/students/${ids.student}/overrides/${prefix}-lab`, "DELETE", undefined, teacherToken, { "Idempotency-Key": `${prefix}-revoke` });
  check("unused override revokes and relocks", revoke.status === 200 && revoke.data.active === false, revoke);
  const relocked = await req(`/lessons/${ids.lesson}/pathway`, "GET", undefined, studentToken);
  check("revocation is visible on the next read", relocked.data?.steps?.find((step) => step.id === `${prefix}-lab`)?.state === "LOCKED", relocked);
  await req(`/classes/${ids.class}/assignments/${ids.assignment}/students/${ids.student}/overrides`, "POST", { stepId: `${prefix}-lab`, reason: "Mở lại để kiểm tra bằng chứng phía sau" }, teacherToken, { "Idempotency-Key": `${prefix}-grant-2` });
  await db.stepProgress.create({ data: { studentId: ids.student, assignmentId: ids.assignment, stepId: `${prefix}-after`, status: "IN_PROGRESS", progressValue: 10, startedAt: new Date() } });
  const inUse = await req(`/classes/${ids.class}/assignments/${ids.assignment}/students/${ids.student}/overrides/${prefix}-lab`, "DELETE", undefined, teacherToken, { "Idempotency-Key": `${prefix}-revoke-in-use` });
  check("override in use remains active and returns OVERRIDE_IN_USE", inUse.status === 409 && inUse.data?.code === "OVERRIDE_IN_USE", inUse);
  console.log(`B2 integration passed ${passed}/${passed}`);
} finally {
  if (process.env.B2_KEEP_FIXTURE !== "true") {
    await db.classroom.deleteMany({ where: { id: ids.class } });
    await db.lesson.deleteMany({ where: { id: ids.lesson } });
    await db.user.deleteMany({ where: { id: { in: [ids.teacher, ids.outsider, ids.student] } } });
  }
  await db.$disconnect();
}
