import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";
import { unlink } from "node:fs/promises";
import { resolve } from "node:path";
const db = new PrismaClient();
const origin = process.env.TEST_API ?? "http://127.0.0.1:4000/api";
const prefix = "it-" + Date.now();
const created = [];
const uploaded = [];
let classroom;
let lesson;
let materialLesson;
let passed = 0;
const changedStudentPassword = "StudentChangedPassword2026!";
async function req(path, method = "GET", body, auth) {
  const r = await fetch(origin + path, {
    method,
    headers: {
      "content-type": "application/json",
      ...(auth ? { authorization: "Bearer " + auth } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const data = await r.json();
  return { status: r.status, data, cookie: r.headers.get("set-cookie") };
}
function check(name, condition) {
  assert.ok(condition, name);
  passed++;
  console.log("PASS " + name);
}
function schemaHasProperty(schema, name) {
  if (!schema || typeof schema !== "object") return false;
  if (schema.properties && Object.hasOwn(schema.properties, name)) return true;
  return Object.values(schema).some((value) =>
    Array.isArray(value)
      ? value.some((item) => schemaHasProperty(item, name))
      : schemaHasProperty(value, name),
  );
}
async function verifyQuizContract() {
  const contract = JSON.parse(await readFile(resolve("docs/contracts/student-quiz-v1.json"), "utf8"));
  const response = await fetch(origin + "/docs-json");
  assert.equal(response.status, 200, "OpenAPI JSON is available");
  const document = await response.json();
  for (const [name, fields] of Object.entries(contract.schemas)) {
    const schema = document.components?.schemas?.[name];
    assert.ok(schema, `OpenAPI schema ${name} exists`);
    assert.ok(fields.every((field) => schema.required?.includes(field)), `OpenAPI schema ${name} has the fixture required fields`);
    for (const forbidden of contract.forbiddenResponseProperties)
      assert.equal(schemaHasProperty(schema, forbidden), false, `OpenAPI schema ${name} omits ${forbidden}`);
  }
  for (const [path, methods] of Object.entries(contract.paths)) {
    for (const [method, expectations] of Object.entries(methods)) {
      const operation = document.paths?.[path]?.[method];
      assert.ok(operation, `OpenAPI ${method.toUpperCase()} ${path} exists`);
      for (const [status, schemaName] of Object.entries(expectations)) {
        if (status === "request") continue;
        const ref = operation.responses?.[status]?.content?.["application/json"]?.schema?.$ref;
        assert.equal(ref, `#/components/schemas/${schemaName}`, `OpenAPI ${method.toUpperCase()} ${path} ${status} matches the fixture`);
      }
      if (method === "post")
        assert.equal(operation.requestBody?.content?.["application/json"]?.schema?.$ref, `#/components/schemas/${expectations.request}`);
    }
  }
  return document;
}
async function measureQuizEndpoint(name, targetMs, count, run) {
  const durations = [];
  for (let index = 0; index < count; index++) {
    const started = performance.now();
    const response = await run(index);
    durations.push(performance.now() - started);
    assert.ok(response.status === 200 || response.status === 201, `${name} sample ${index + 1} returned ${response.status}: ${response.data?.message ?? "unknown API error"}`);
  }
  durations.sort((a, b) => a - b);
  const percentile = (value) => Number(durations[Math.ceil(value * count) - 1].toFixed(1));
  const result = { endpoint: name, samples: count, p50Ms: percentile(0.5), p95Ms: percentile(0.95), targetMs, targetMet: percentile(0.95) <= targetMs };
  console.log("QUIZ_LATENCY " + JSON.stringify(result));
  return result;
}
function runLiveQuizBrowser(assignmentId, username, password) {
  if (process.env.RUN_A3_BROWSER_E2E !== "true") return;
  const frontendRoot = resolve("..", "nexalab-fe");
  const npmCli = process.env.npm_execpath;
  assert.ok(npmCli, "npm_execpath is available to launch the frontend Playwright command");
  const run = spawnSync(process.execPath, [npmCli, "run", "test:e2e", "--", "tests/quiz-learning-live.spec.ts"], {
    cwd: frontendRoot,
    encoding: "utf8",
    env: {
      ...process.env,
      TEST_ASSIGNMENT_ID: assignmentId,
      TEST_LESSON_ID: lesson.id,
      TEST_STUDENT_USERNAME: username,
      TEST_STUDENT_PASSWORD: password,
      TEST_API: origin,
      TEST_WEB: process.env.TEST_WEB ?? "http://127.0.0.1:5173",
    },
  });
  if (run.stdout) process.stdout.write(run.stdout);
  if (run.stderr) process.stderr.write(run.stderr);
  assert.equal(run.status, 0, run.error?.message ?? "Real-dependency quiz browser E2E passed");
}
const circuit = (resistance = 350) => ({
  nodes: [
    { id: "b", type: "battery", value: 9 },
    { id: "r", type: "resistor", value: resistance },
    { id: "l", type: "led" },
    { id: "s", type: "switch", closed: true },
  ],
  edges: [
    { source: "b", target: "r" },
    { source: "r", target: "l" },
    { source: "l", target: "s" },
    { source: "s", target: "b" },
  ],
});
try {
  await verifyQuizContract();
  check("OpenAPI quiz paths, success/error envelopes, and schemas match the contract fixture", true);
  check("unauthenticated API denied", (await req("/users")).status === 401);
  const admin = await req("/auth/admin/login", "POST", {
    email: "admin@nexalab.local",
    password: process.env.SEED_PASSWORD,
  });
  check("admin login", !!admin.data.accessToken);
  const adminToken = admin.data.accessToken;
  const fixturePassword =
    process.env.SEED_FIXTURE_PASSWORD ?? process.env.SEED_PASSWORD;
  const outsider = await req("/auth/student/login", "POST", {
    username:
      process.env.SEED_STUDENT_OUTSIDER_USERNAME ?? "student.outsider",
    password: fixturePassword,
  });
  check("seeded outsider login", outsider.status === 201 && !!outsider.data.accessToken);
  const fixtureTeacher = await req("/auth/login", "POST", {
    email:
      process.env.SEED_TEACHER_OWNER_EMAIL ?? "teacher.owner@nexalab.local",
    password: fixturePassword,
  });
  check(
    "seeded teacher owner login",
    fixtureTeacher.status === 201 &&
      fixtureTeacher.data.user.id === "teacher-owner",
  );
  const fixtureStudent = await req("/auth/student/login", "POST", {
    username: process.env.SEED_STUDENT_TEMP_USERNAME ?? "student.temp",
    password: fixturePassword,
  });
  check(
    "seeded temporary student requires password change",
    fixtureStudent.status === 201 &&
      fixtureStudent.data.user.id === "student-temp" &&
      fixtureStudent.data.user.mustChangePassword === true,
  );
  const tokens = {};
  const users = {};
  for (const role of ["TEACHER", "STUDENT", "PARENT"]) {
    const account = {
      password: "IntegrationTest2026!",
      fullName: "Integration " + role,
      role,
      grade: 8,
      consent: true,
      ...(role === "STUDENT"
        ? { username: `${prefix}-${role.toLowerCase()}` }
        : { email: `${prefix}-${role.toLowerCase()}@example.test` }),
    };
    const createdUser = await req("/users", "POST", account, adminToken);
    check("create " + role, createdUser.status === 201);
    created.push(createdUser.data.id);
    users[role] = createdUser.data;
    const login = await req(
      role === "STUDENT" ? "/auth/student/login" : "/auth/login",
      "POST",
      {
        ...(role === "STUDENT"
          ? { username: account.username }
          : { email: account.email }),
        password: account.password,
      },
    );
    check("login " + role, login.status === 201 && !!login.data.accessToken);
    if (role === "STUDENT") {
      check(
        "temporary student session is restricted",
        (await req("/classes", "GET", undefined, login.data.accessToken))
          .status === 403,
      );
      check(
        "student changes temporary password",
        (
          await req(
            "/auth/password",
            "POST",
            {
              currentPassword: account.password,
              password: changedStudentPassword,
            },
            login.data.accessToken,
          )
        ).status === 201,
      );
      const changedLogin = await req("/auth/student/login", "POST", {
        username: account.username,
        password: changedStudentPassword,
      });
      tokens[role] = changedLogin.data.accessToken;
      check(
        "student signs in with private password",
        changedLogin.status === 201 && !!tokens[role],
      );
    } else {
      tokens[role] = login.data.accessToken;
    }
  }
  check(
    "student cannot create users",
    (await req("/users", "POST", {}, tokens.STUDENT)).status === 403,
  );
  check(
    "self-registration cannot grant admin",
    (
      await req("/auth/register", "POST", {
        email: prefix + "@example.test",
        password: "IntegrationTest2026!",
        fullName: "x",
        role: "ADMIN",
        consent: true,
      })
    ).status === 400,
  );
  const made = await req(
    "/classes",
    "POST",
    { name: prefix, grade: 8, requiresApproval: true },
    tokens.TEACHER,
  );
  check("teacher creates class", made.status === 201);
  classroom = made.data.class;
  const joinCode = made.data.joinCode;
  const provisioned = await req(
    `/classes/${classroom.id}/students`,
    "POST",
    {
      username: `${prefix}-provisioned`,
      fullName: "Provisioned Student",
      grade: 8,
      consent: true,
    },
    tokens.TEACHER,
  );
  check(
    "teacher provisions a student without email",
    provisioned.status === 201 &&
      provisioned.data.user.email === null &&
      provisioned.data.credentials.temporaryPassword.length >= 12,
  );
  created.push(provisioned.data.user.id);
  const resetCredential = await req(
    `/classes/${classroom.id}/students/${provisioned.data.user.id}/reset-password`,
    "POST",
    {},
    tokens.TEACHER,
  );
  check(
    "teacher resets only an enrolled student and receives a new temporary credential",
    resetCredential.status === 201 &&
      resetCredential.data.credentials.temporaryPassword !==
        provisioned.data.credentials.temporaryPassword,
  );
  check(
    "parent cannot create class",
    (await req("/classes", "POST", { name: "bad", grade: 8 }, tokens.PARENT))
      .status === 403,
  );
  check(
    "student requests enrollment",
    (
      await req(
        "/classes/join",
        "POST",
        { code: joinCode },
        tokens.STUDENT,
      )
    ).status === 201,
  );
  const analyticsBeforeApproval = (
    await req(
      "/classes/" + classroom.id + "/analytics",
      "GET",
      undefined,
      tokens.TEACHER,
    )
  ).data;
  check(
    "pending student absent from teacher analytics",
    analyticsBeforeApproval.some(
      (student) => student.id === provisioned.data.user.id,
    ) &&
      !analyticsBeforeApproval.some(
        (student) => student.id === users.STUDENT.id,
      ),
  );
  check(
    "teacher approves enrollment",
    (
      await req(
        `/classes/${classroom.id}/students/${users.STUDENT.id}`,
        "PUT",
        {},
        tokens.TEACHER,
      )
    ).status === 200,
  );
  check(
    "teacher cannot view unrelated class",
    (
      await req(
        "/classes/demo-class/analytics",
        "GET",
        undefined,
        tokens.TEACHER,
      )
    ).status === 403,
  );
  const task = await req(
    `/classes/${classroom.id}/assignments`,
    "POST",
    {
      contentId: "circuit",
      contentType: "lab",
      title: "Test task",
      dueDate: new Date(Date.now() + 86400000).toISOString(),
      studentIds: [users.STUDENT.id],
    },
    tokens.TEACHER,
  );
  check("teacher assigns to group", task.status === 201);
  check(
    "student sees assignment",
    (await req("/assignments", "GET", undefined, tokens.STUDENT)).data.some(
      (a) => a.id === task.data.assignment.id,
    ),
  );
  const lessonData = {
    title: prefix,
    subjectId: "physics",
    chapter: "Test",
    grade: 8,
    topic: "Ohm",
    learningObjective: "Test",
    prerequisites: "Test",
    curriculum: "GDPT",
    content: "<p>Ohm</p>",
    status: "draft",
    labId: "circuit",
    materials: [],
    // B1: teacher-private lessons publish only with the self-review checklist (D1).
    review: {
      sources: "Integration fixture authored for automated checks",
      license: "ORIGINAL",
      outcome: "KHTN8 – Ohm",
      answerKeyChecked: true,
      safetyChecked: true,
      accessibilityChecked: true,
    },
    questions: [
      {
        prompt: "Increasing resistance?",
        options: ["Lower current", "Higher current"],
        answer: 0,
      },
      {
        prompt: "Ohm's law relates current to?",
        options: ["Mass and volume", "Voltage and resistance"],
        answer: 1,
      },
      {
        prompt: "What is the unit of resistance?",
        options: ["Ohm", "Watt"],
        answer: 0,
      },
      {
        prompt: "Which quantity is measured in volts?",
        options: ["Current", "Voltage"],
        answer: 1,
      },
    ],
  };
  lesson = (await req("/lessons", "POST", lessonData, tokens.TEACHER)).data;
  check(
    "student cannot read draft",
    !(await req("/lessons", "GET", undefined, tokens.STUDENT)).data.some(
      (l) => l.id === lesson.id,
    ),
  );
  check(
    "invalid published lesson is rejected",
    (
      await req(
        "/lessons/" + lesson.id,
        "PUT",
        { ...lessonData, content: "", status: "published" },
        tokens.TEACHER,
      )
    ).status === 400,
  );
  check(
    "publish lesson",
    (
      await req(
        "/lessons/" + lesson.id,
        "PUT",
        { ...lessonData, status: "published" },
        tokens.TEACHER,
      )
    ).status === 200,
  );
  const disposableVideoStep = await db.lessonStep.findFirstOrThrow({
    where: { lessonId: lesson.id, type: "VIDEO" },
  });
  await db.lessonStep.update({
    where: { id: disposableVideoStep.id },
    data: {
      config: {
        title: "Disposable integration video",
        url: "https://example.test/video.mp4",
        transcript: "Published integration transcript",
        equivalentText: "Published integration equivalent",
      },
    },
  });
  await db.lessonStep.create({
    data: {
      id: `step-${lesson.id}-cards`,
      lessonId: lesson.id,
      type: "STUDY_CARDS",
      position: 30,
      required: true,
      config: {
        cards: [
          { id: "card-objective", front: "Objective", back: "Understand the circuit" },
          { id: "card-safety", front: "Safety", back: "Disconnect power first" },
        ],
      },
    },
  });
  const lessonTask = await req(
    `/classes/${classroom.id}/assignments`,
    "POST",
    {
      contentId: lesson.id,
      contentType: "lesson",
      title: "Pathway task",
      dueDate: new Date(Date.now() + 86400000).toISOString(),
      studentIds: [users.STUDENT.id],
    },
    tokens.TEACHER,
  );
  check("teacher assigns published lesson", lessonTask.status === 201);
  // Now student can see the assigned lesson — verify quiz answer key is stripped
  const visible = (
    await req("/lessons", "GET", undefined, tokens.STUDENT)
  ).data.find((l) => l.id === lesson.id);
  check(
    "quiz key hidden from student",
    visible && !("answer" in visible.questions[0]),
  );
  const assignmentDetail = await req(
    "/assignments/" + lessonTask.data.assignment.id,
    "GET",
    undefined,
    tokens.STUDENT,
  );
  check(
    "assignment summary omits raw lesson content",
    assignmentDetail.status === 200 && !("content" in assignmentDetail.data.content),
  );
  const pathway = await req(
    "/lessons/" + lesson.id + "/pathway",
    "GET",
    undefined,
    tokens.STUDENT,
  );
  check(
    "assigned student receives authoritative ordered pathway",
    pathway.status === 200 &&
      pathway.data.steps.map((step) => step.type).join(",") === "READING,VIDEO,STUDY_CARDS,QUIZ,LAB" &&
      pathway.data.steps.map((step) => step.state).join(",") === "IN_PROGRESS,LOCKED,LOCKED,LOCKED,LOCKED" &&
      pathway.data.nextStepId === pathway.data.steps[0].id,
  );
  check(
    "pathway hides locked quiz answers",
    pathway.data.steps[1].resource === null &&
      !JSON.stringify(pathway.data).includes('"answer"'),
  );
  const prematureQuiz = await req(`/lessons/${lesson.id}/quiz`, "GET", undefined, tokens.STUDENT);
  check("quiz delivery remains unavailable before A2 prerequisites", prematureQuiz.status === 404 && !JSON.stringify(prematureQuiz.data).includes("Increasing resistance"));
  const readingStepId = pathway.data.steps[0].id;
  const invalidReadingBody = await req(
    `/lessons/${lesson.id}/steps/${readingStepId}/progress`,
    "PUT",
    { action: "complete", progressValue: 100 },
    tokens.STUDENT,
  );
  check("reading completion rejects client progress fields", invalidReadingBody.status === 400);
  const wrongStep = await req(
    `/lessons/${lesson.id}/steps/foreign-step/progress`,
    "PUT",
    { action: "complete" },
    tokens.STUDENT,
  );
  check("reading completion rejects a step outside the lesson", wrongStep.status === 404);
  const lockedVideo = await req(
    `/lessons/${lesson.id}/steps/${pathway.data.steps[1].id}/progress`,
    "PUT",
    { action: "complete" },
    tokens.STUDENT,
  );
  check("reading endpoint rejects locked non-reading steps", lockedVideo.status === 404);
  const readingCompletion = await req(
    `/lessons/${lesson.id}/steps/${readingStepId}/progress`,
    "PUT",
    { action: "complete" },
    tokens.STUDENT,
  );
  const readingEvidence = await db.stepProgress.findUnique({
    where: { studentId_stepId: { studentId: users.STUDENT.id, stepId: readingStepId } },
  });
  const lessonProjection = await db.progress.findUnique({
    where: { studentId_contentId: { studentId: users.STUDENT.id, contentId: lesson.id } },
  });
  check(
    "assigned student completes current reading and receives reconciled pathway",
    readingCompletion.status === 200 &&
      readingCompletion.data.step.state === "COMPLETED" &&
      readingCompletion.data.pathway.steps[0].state === "COMPLETED" &&
      readingCompletion.data.pathway.nextStepId === pathway.data.steps[1].id &&
      readingEvidence?.status === "COMPLETED" && readingEvidence.progressValue === 100 &&
      lessonProjection?.status === "in_progress",
  );
  const firstCompletedAt = readingEvidence?.completedAt?.toISOString();
  await db.progress.update({
    where: { studentId_contentId: { studentId: users.STUDENT.id, contentId: lesson.id } },
    data: { status: "completed" },
  });
  const repeatedCompletion = await req(
    `/lessons/${lesson.id}/steps/${readingStepId}/progress`,
    "PUT",
    { action: "complete" },
    tokens.STUDENT,
  );
  const repeatedEvidence = await db.stepProgress.findUnique({
    where: { studentId_stepId: { studentId: users.STUDENT.id, stepId: readingStepId } },
  });
  const evidenceCount = await db.stepProgress.count({
    where: { studentId: users.STUDENT.id, stepId: readingStepId },
  });
  const preservedProjection = await db.progress.findUnique({
    where: { studentId_contentId: { studentId: users.STUDENT.id, contentId: lesson.id } },
  });
  const reloadedPathway = await req(`/lessons/${lesson.id}/pathway`, "GET", undefined, tokens.STUDENT);
  check(
    // A5: Progress is a projection, so a hand-forced "completed" row without
    // evidence is re-derived on the next evidence write.
    "reading completion is idempotent, re-derives the projection and survives a pathway reload",
    repeatedCompletion.status === 200 &&
      repeatedEvidence?.completedAt?.toISOString() === firstCompletedAt &&
      evidenceCount === 1 && preservedProjection?.status === "in_progress" &&
      reloadedPathway.data.steps[0].state === "COMPLETED" &&
      reloadedPathway.data.nextStepId === pathway.data.steps[1].id,
  );
  await db.progress.update({
    where: { studentId_contentId: { studentId: users.STUDENT.id, contentId: lesson.id } },
    data: { status: "in_progress", score: 0, attemptsCount: 0 },
  });
  const videoStepId = pathway.data.steps[1].id;
  const invalidVideoTimings = [
    { action: "heartbeat", positionSeconds: -1, durationSeconds: 100 },
    { action: "heartbeat", positionSeconds: 101, durationSeconds: 100 },
    { action: "heartbeat", positionSeconds: 1.5, durationSeconds: 100 },
    { action: "ended", positionSeconds: 1, durationSeconds: 86401 },
    { action: "heartbeat", positionSeconds: 1, durationSeconds: 100, progressValue: 99 },
  ];
  for (const invalidBody of invalidVideoTimings) {
    check(
      "video progress rejects invalid timing " + JSON.stringify(invalidBody),
      (await req(
        `/lessons/${lesson.id}/steps/${videoStepId}/progress`,
        "PUT",
        invalidBody,
        tokens.STUDENT,
      )).status === 400,
    );
  }
  const firstHeartbeat = await req(
    `/lessons/${lesson.id}/steps/${videoStepId}/progress`,
    "PUT",
    { action: "heartbeat", positionSeconds: 41, durationSeconds: 100 },
    tokens.STUDENT,
  );
  const backwardHeartbeat = await req(
    `/lessons/${lesson.id}/steps/${videoStepId}/progress`,
    "PUT",
    { action: "heartbeat", positionSeconds: 20, durationSeconds: 100 },
    tokens.STUDENT,
  );
  const resumedVideo = await req(`/lessons/${lesson.id}/pathway`, "GET", undefined, tokens.STUDENT);
  check(
    "video heartbeat and backward seek preserve reload-safe high-water evidence",
    firstHeartbeat.status === 200 &&
      backwardHeartbeat.status === 200 &&
      backwardHeartbeat.data.step.state === "IN_PROGRESS" &&
      backwardHeartbeat.data.step.progressValue === 41 &&
      backwardHeartbeat.data.step.lastPosition === 41 &&
      resumedVideo.data.steps[1].lastPosition === 41 &&
      resumedVideo.data.steps[1].resource.transcript === "Published integration transcript",
  );
  const mediaCompletion = await req(
    `/lessons/${lesson.id}/steps/${videoStepId}/progress`,
    "PUT",
    { action: "heartbeat", positionSeconds: 90, durationSeconds: 100 },
    tokens.STUDENT,
  );
  const mediaEvidence = await db.stepProgress.findUnique({
    where: { studentId_stepId: { studentId: users.STUDENT.id, stepId: videoStepId } },
  });
  const mediaCompletedAt = mediaEvidence?.completedAt?.toISOString();
  await req(
    `/lessons/${lesson.id}/steps/${videoStepId}/progress`,
    "PUT",
    { action: "ended", positionSeconds: 80, durationSeconds: 100 },
    tokens.STUDENT,
  );
  const repeatedMediaEvidence = await db.stepProgress.findUnique({
    where: { studentId_stepId: { studentId: users.STUDENT.id, stepId: videoStepId } },
  });
  check(
    "video completes at 90 percent and ended is idempotent without downgrade",
    mediaCompletion.data.step.state === "COMPLETED" &&
      repeatedMediaEvidence?.status === "COMPLETED" &&
      repeatedMediaEvidence.progressValue === 100 &&
      repeatedMediaEvidence.lastPosition === 90 &&
      repeatedMediaEvidence.completedAt?.toISOString() === mediaCompletedAt,
  );

  await db.stepProgress.delete({
    where: { studentId_stepId: { studentId: users.STUDENT.id, stepId: videoStepId } },
  });
  const fallbackCompletion = await req(
    `/lessons/${lesson.id}/steps/${videoStepId}/progress`,
    "PUT",
    { action: "complete-fallback" },
    tokens.STUDENT,
  );
  check(
    "published equivalent explicitly completes video without client timing",
    fallbackCompletion.status === 200 &&
      fallbackCompletion.data.step.state === "COMPLETED" &&
      fallbackCompletion.data.step.progressValue === 100 &&
      fallbackCompletion.data.step.lastPosition === null,
  );
  const cardsStep = (await req(`/lessons/${lesson.id}/pathway`, "GET", undefined, tokens.STUDENT)).data.steps[2];
  const cardsStepId = cardsStep.id;
  const forgedCard = await req(
    `/lessons/${lesson.id}/steps/${cardsStepId}/progress`,
    "PUT",
    { action: "visit", cardIndex: 99 },
    tokens.STUDENT,
  );
  const firstCard = await req(
    `/lessons/${lesson.id}/steps/${cardsStepId}/progress`,
    "PUT",
    { action: "visit", cardIndex: 0 },
    tokens.STUDENT,
  );
  const incompleteCards = await req(
    `/lessons/${lesson.id}/steps/${cardsStepId}/progress`,
    "PUT",
    { action: "complete", cardIndex: 0 },
    tokens.STUDENT,
  );
  const secondCard = await req(
    `/lessons/${lesson.id}/steps/${cardsStepId}/progress`,
    "PUT",
    { action: "visit", cardIndex: 1 },
    tokens.STUDENT,
  );
  const completedCards = await req(
    `/lessons/${lesson.id}/steps/${cardsStepId}/progress`,
    "PUT",
    { action: "complete", cardIndex: 1 },
    tokens.STUDENT,
  );
  const cardEvidence = await db.stepProgress.findUnique({
    where: { studentId_stepId: { studentId: users.STUDENT.id, stepId: cardsStepId } },
  });
  check(
    "study cards reject forged index and premature completion",
    forgedCard.status === 400 && firstCard.status === 200 &&
      incompleteCards.status === 400 && firstCard.data.step.progressValue === 50,
  );
  check(
    "study cards require every published card and unlock Quiz",
    secondCard.status === 200 && completedCards.status === 200 &&
      completedCards.data.step.state === "COMPLETED" &&
      cardEvidence?.visitedCardIds?.length === 2 &&
      completedCards.data.pathway.steps[3].type === "QUIZ" &&
      completedCards.data.pathway.steps[3].state === "IN_PROGRESS" &&
      completedCards.data.pathway.steps[4].state === "LOCKED",
  );
  const quiz = await req(`/lessons/${lesson.id}/quiz`, "GET", undefined, tokens.STUDENT);
  const storedQuiz = (await db.lessonStep.findFirstOrThrow({ where: { lessonId: lesson.id, type: "QUIZ" } })).config.questions;
  const unrelatedQuiz = await req(`/lessons/${lesson.id}/quiz`, "GET", undefined, outsider.data.accessToken);
  const parentQuiz = await req(`/lessons/${lesson.id}/quiz`, "GET", undefined, tokens.PARENT);
  const forgedQuizCompletion = await req(`/lessons/${lesson.id}/steps/${quiz.data.stepId}/progress`, "PUT", { action: "complete" }, tokens.STUDENT);
  check(
    "eligible student receives stable question and option IDs without answer keys",
    quiz.status === 200 && quiz.data.questions.length === 4 &&
      quiz.data.questions.every((question) => question.id && question.options.every((option) => option.id && option.text)) &&
      !/answerOptionId|correctOptionId|\"answer\"/.test(JSON.stringify(quiz.data)),
  );
  check("unassigned student and wrong-role parent receive no quiz content", unrelatedQuiz.status === 404 && parentQuiz.status === 403 && !JSON.stringify(unrelatedQuiz.data).includes("Increasing resistance"));
  check("Quiz progress cannot be forged through the generic step endpoint", forgedQuizCompletion.status === 404);
  const quizBody = { idempotencyKey: randomUUID(), answers: quiz.data.questions.map((question) => ({ questionId: question.id, optionId: question.options[0].id })) };
  const countBeforeInvalid = await db.quizAttempt.count({ where: { lessonId: lesson.id } });
  const partialQuiz = await req(`/lessons/${lesson.id}/quiz-attempts`, "POST", { ...quizBody, answers: quizBody.answers.slice(0, 1) }, tokens.STUDENT);
  const duplicateQuestion = await req(`/lessons/${lesson.id}/quiz-attempts`, "POST", { ...quizBody, answers: [quizBody.answers[0], quizBody.answers[0]] }, tokens.STUDENT);
  const extraQuestion = await req(`/lessons/${lesson.id}/quiz-attempts`, "POST", { ...quizBody, answers: [...quizBody.answers, { questionId: "extra", optionId: "extra" }] }, tokens.STUDENT);
  const secretSentinel = "password=fixture token=fixture postgres://fixture answerOptionId=fixture";
  const invalidKey = await req(`/lessons/${lesson.id}/quiz-attempts`, "POST", { ...quizBody, idempotencyKey: secretSentinel }, tokens.STUDENT);
  check("quiz validation errors return the documented safe message envelope", invalidKey.status === 400 && typeof invalidKey.data.message === "string" && !JSON.stringify(invalidKey.data).includes(secretSentinel) && !/password|token|postgres:|answerOptionId/i.test(JSON.stringify(invalidKey.data)));
  const countAfterInvalid = await db.quizAttempt.count({ where: { lessonId: lesson.id } });
  const invalidAnswersRejected = partialQuiz.status === 400 && duplicateQuestion.status === 400 && extraQuestion.status === 400 && countAfterInvalid === countBeforeInvalid;
  check(`partial, duplicate, and extra quiz answers are rejected atomically ${invalidAnswersRejected ? "" : JSON.stringify({ partialStatus: partialQuiz.status, duplicateStatus: duplicateQuestion.status, extraStatus: extraQuestion.status, countBeforeInvalid, countAfterInvalid })}`, invalidAnswersRejected);
  // D-B1-01: this student also holds a standalone "circuit" lab assignment, so the
  // A3 gate is asserted on the lesson's own lab step (b1-integration covers both paths).
  const gatedLabStep = completedCards.data.pathway.steps.find((step) => step.type === "LAB" || step.type === "CHALLENGE");
  const deniedPractical = await req("/attempts", "POST", { challengeId: "circuit_001", lessonStepId: gatedLabStep.id, labState: circuit(), durationMs: 100 }, tokens.STUDENT);
  check("lesson lab step submission is rejected before a quiz pass", deniedPractical.status === 403 && deniedPractical.data?.code === "STEP_LOCKED");
  const wrongAnswers = storedQuiz.map((question) => ({
    questionId: question.id,
    optionId: question.options.find((option) => option.id !== question.answerOptionId).id,
  }));
  const belowAnswers = storedQuiz.map((question, index) => ({ questionId: question.id, optionId: index === 0 ? question.answerOptionId : question.options.find((option) => option.id !== question.answerOptionId).id }));
  const belowAttempt = await req(`/lessons/${lesson.id}/quiz-attempts`, "POST", { idempotencyKey: randomUUID(), answers: belowAnswers }, tokens.STUDENT);
  check("below 50 percent is recorded as failed", belowAttempt.status === 201 && belowAttempt.data.attempt.score === 25 && belowAttempt.data.attempt.passed === false && belowAttempt.data.pathway.steps[3].state === "IN_PROGRESS");
  const wrongBody = { idempotencyKey: randomUUID(), answers: wrongAnswers };
  const countBeforeDuplicateDelivery = await db.quizAttempt.count({ where: { lessonId: lesson.id } });
  const [failedAttempt, duplicateAttempt] = await Promise.all([
    req(`/lessons/${lesson.id}/quiz-attempts`, "POST", wrongBody, tokens.STUDENT),
    req(`/lessons/${lesson.id}/quiz-attempts`, "POST", wrongBody, tokens.STUDENT),
  ]);
  const countAfterDuplicateDelivery = await db.quizAttempt.count({ where: { lessonId: lesson.id } });
  const duplicateDeliveryValid = failedAttempt.status === 201 && duplicateAttempt.status === 201 && failedAttempt.data.attempt?.id === duplicateAttempt.data.attempt?.id && failedAttempt.data.attempt?.score === 0 && failedAttempt.data.attempt?.passed === false && failedAttempt.data.pathway?.steps[3]?.state === "IN_PROGRESS" && failedAttempt.data.pathway?.steps[4]?.state === "LOCKED" && countAfterDuplicateDelivery === countBeforeDuplicateDelivery + 1;
  check(`concurrent duplicate delivery creates one immutable failing attempt ${duplicateDeliveryValid ? "" : JSON.stringify({ firstStatus: failedAttempt.status, firstData: failedAttempt.data, duplicateStatus: duplicateAttempt.status, duplicateData: duplicateAttempt.data })}`, duplicateDeliveryValid);
  const failedHistory = await req(`/lessons/${lesson.id}/quiz-attempts`, "GET", undefined, tokens.STUDENT);
  const failedProjection = await db.progress.findUnique({ where: { studentId_contentId: { studentId: users.STUDENT.id, contentId: lesson.id } } });
  check("failed retries keep best distinct from latest and retain source evidence", failedHistory.status === 200 && failedHistory.data.attempts.length === 2 && failedHistory.data.attempts[0].score === 0 && failedHistory.data.attempts[0].latest && !failedHistory.data.attempts[0].best && failedHistory.data.attempts[1].score === 25 && failedHistory.data.attempts[1].best && failedHistory.data.attempts[1].results.every((result) => result.prompt && result.selectedOptionText));
  const failedProjectionValid = failedProjection?.status === "in_progress" && failedProjection.attemptsCount === 2 && failedProjection.score === 25;
  check(`failed attempts update progress projection without completing the lesson ${failedProjectionValid ? "" : JSON.stringify(failedProjection)}`, failedProjectionValid);
  const changedPayload = await req(`/lessons/${lesson.id}/quiz-attempts`, "POST", { ...wrongBody, answers: storedQuiz.map((question) => ({ questionId: question.id, optionId: question.answerOptionId })) }, tokens.STUDENT);
  check("reused idempotency key with changed answers conflicts", changedPayload.status === 409 && await db.quizAttempt.count({ where: { lessonId: lesson.id } }) === countBeforeInvalid + 2);
  const passingAnswers = storedQuiz.map((question, index) => ({ questionId: question.id, optionId: index < 2 ? question.answerOptionId : question.options.find((option) => option.id !== question.answerOptionId).id }));
  const passingAttempt = await req(`/lessons/${lesson.id}/quiz-attempts`, "POST", { idempotencyKey: randomUUID(), answers: passingAnswers }, tokens.STUDENT);
  check("exact 50 percent passes and server unlocks LAB", passingAttempt.status === 201 && passingAttempt.data.attempt.score === 50 && passingAttempt.data.attempt.passed === true && passingAttempt.data.attempt.correctCount === 2 && passingAttempt.data.pathway.steps[3].state === "COMPLETED" && passingAttempt.data.pathway.steps[4].state === "IN_PROGRESS");
  const passedProjection = await db.progress.findUnique({ where: { studentId_contentId: { studentId: users.STUDENT.id, contentId: lesson.id } } });
  // A5: the lesson completes only when every required step does; LAB is still open.
  check("passing attempt atomically updates the rebuildable progress projection", passedProjection?.status === "in_progress" && passedProjection.attemptsCount === 3 && passedProjection.score === 50);
  const perfectAttempt = await req(`/lessons/${lesson.id}/quiz-attempts`, "POST", { idempotencyKey: randomUUID(), answers: storedQuiz.map((question) => ({ questionId: question.id, optionId: question.answerOptionId })) }, tokens.STUDENT);
  check("100 percent is recorded correctly", perfectAttempt.status === 201 && perfectAttempt.data.attempt.score === 100 && perfectAttempt.data.attempt.passed === true);
  const history = await req(`/lessons/${lesson.id}/quiz-attempts`, "GET", undefined, tokens.STUDENT);
  check("reload history retains all immutable attempts and question evidence", history.status === 200 && history.data.attempts.length === 4 && history.data.attempts[0].latest && history.data.attempts[0].best && history.data.attempts[0].score === 100 && history.data.attempts.some((attempt) => attempt.score === 0 && attempt.results.every((result) => result.prompt && result.selectedOptionText)));
  const lockedEdit = await req(`/lessons/${lesson.id}`, "PUT", { ...lessonData, status: "published", questions: lessonData.questions.map((question, index) => index === 0 ? { ...question, prompt: "Edited question after saved attempt" } : question) }, tokens.TEACHER);
  check("published quiz with evidence is structure-locked (B1 D7)", lockedEdit.status === 409 && lockedEdit.data.code === "LESSON_STRUCTURE_LOCKED");
  const historicalQuiz = await req(`/lessons/${lesson.id}/quiz-attempts`, "GET", undefined, tokens.STUDENT);
  check("attempt snapshots preserve question evidence after published content edits", historicalQuiz.status === 200 && historicalQuiz.data.attempts[0].results.some((result) => result.prompt === "Increasing resistance?"));
  const latencyQuestions = (await db.lessonStep.findFirstOrThrow({ where: { lessonId: lesson.id, type: "QUIZ" } })).config.questions;
  const latencyAnswers = latencyQuestions.map((question) => ({
    questionId: question.id,
    optionId: question.options.find((option) => option.id !== question.answerOptionId).id,
  }));
  if (process.env.RUN_A3_TIMING_SAMPLES !== "false") {
    await measureQuizEndpoint("GET /lessons/:lessonId/quiz", 500, 20, () => req(`/lessons/${lesson.id}/quiz`, "GET", undefined, tokens.STUDENT));
    await measureQuizEndpoint("GET /lessons/:lessonId/quiz-attempts", 500, 20, () => req(`/lessons/${lesson.id}/quiz-attempts`, "GET", undefined, tokens.STUDENT));
    await measureQuizEndpoint("POST /lessons/:lessonId/quiz-attempts", 1000, 5, () => req(
      `/lessons/${lesson.id}/quiz-attempts`,
      "POST",
      { idempotencyKey: randomUUID(), answers: latencyAnswers },
      tokens.STUDENT,
    ));
  }
  if (process.env.RUN_A3_BROWSER_E2E === "true") {
    await db.quizAttempt.deleteMany({ where: { lessonId: lesson.id, studentId: users.STUDENT.id } });
    await db.stepProgress.deleteMany({ where: { studentId: users.STUDENT.id, stepId: `step-${lesson.id}-quiz` } });
    await db.progress.deleteMany({ where: { studentId: users.STUDENT.id, contentId: lesson.id } });
    runLiveQuizBrowser(lessonTask.data.assignment.id, users.STUDENT.username, changedStudentPassword);
  }
  const allowedPractical = await req("/attempts", "POST", { challengeId: "circuit_001", labState: circuit(), durationMs: 100 }, tokens.STUDENT);
  check("direct practical submission succeeds after the quiz pass", allowedPractical.status === 201);
  await db.lessonStep.update({
    where: { id: videoStepId },
    data: { config: { title: "URL only", url: "https://example.test/video.mp4" } },
  });
  const deniedFallback = await req(
    `/lessons/${lesson.id}/steps/${videoStepId}/progress`,
    "PUT",
    { action: "complete-fallback" },
    tokens.STUDENT,
  );
  check(
    "fallback is undiscoverably denied when no published equivalent exists",
    deniedFallback.status === 404 && !JSON.stringify(deniedFallback.data).includes("equivalent"),
  );
  const outsiderCompletion = await req(
    `/lessons/${lesson.id}/steps/${readingStepId}/progress`,
    "PUT",
    { action: "complete" },
    outsider.data.accessToken,
  );
  check("unassigned student cannot complete reading", outsiderCompletion.status === 404);
  const deniedPathway = await req(
    "/lessons/" + lesson.id + "/pathway",
    "GET",
    undefined,
    outsider.data.accessToken,
  );
  check(
    "unrelated student receives no pathway metadata",
    deniedPathway.status === 404 && !JSON.stringify(deniedPathway.data).includes(prefix),
  );
  check(
    "unassigned student cannot enumerate lesson metadata",
    !(await req("/lessons", "GET", undefined, outsider.data.accessToken)).data.some(
      (item) => item.id === lesson.id,
    ),
  );
  const uploadForm = new FormData();
  uploadForm.append(
    "file",
    new Blob(["%PDF-1.4\n% integration fixture\n%%EOF"], {
      type: "application/pdf",
    }),
    "fixture.pdf",
  );
  const up = await fetch(origin + "/files", {
    method: "POST",
    headers: { authorization: "Bearer " + tokens.TEACHER },
    body: uploadForm,
  });
  const file = await up.json();
  if (file.id) uploaded.push(file.id);
  check(
    "teacher uploads material",
    up.status === 201 && file.url.startsWith("asset:"),
  );
  check(
    "unpublished file denied to student",
    (
      await fetch(origin + "/files/" + file.id, {
        headers: { authorization: "Bearer " + tokens.STUDENT },
      })
    ).status === 403,
  );
  // The assigned lesson is structure-locked (D7), so the material is
  // published through a separate lesson.
  materialLesson = (
    await req(
      "/lessons",
      "POST",
      {
        ...lessonData,
        title: prefix + " material",
        status: "published",
        materials: [{ type: "pdf", title: "Test", url: file.url }],
      },
      tokens.TEACHER,
    )
  ).data;
  check(
    "published material readable",
    (
      await fetch(origin + "/files/" + file.id, {
        headers: { authorization: "Bearer " + tokens.STUDENT },
      })
    ).status === 200,
  );
  check(
    "legacy unassigned quiz submission cannot bypass assignment gates",
    (
      await req(
        "/lessons/" + lesson.id + "/quiz",
        "POST",
        { answers: [0] },
        tokens.STUDENT,
      )
    ).status === 409,
  );
  check(
    "parent cannot submit attempt",
    (
      await req(
        "/attempts",
        "POST",
        { challengeId: "circuit_001", labState: circuit(), durationMs: 100 },
        tokens.PARENT,
      )
    ).status === 403,
  );
  const first = (
    await req(
      "/attempts",
      "POST",
      { challengeId: "circuit_001", labState: circuit(330), durationMs: 100 },
      tokens.STUDENT,
    )
  ).data;
  check("server detects overloaded LED", first.verdict === "partial");
  const h1 = (
    await req("/attempts/" + first.id + "/hint", "POST", {}, tokens.STUDENT)
  ).data;
  check("first hint is level one", h1.level === 1);
  const again = (
    await req("/attempts/" + first.id + "/hint", "POST", {}, tokens.STUDENT)
  ).data;
  check(
    "cannot skip hint without retry",
    again.id === h1.id && again.level === 1,
  );
  const second = (
    await req(
      "/attempts",
      "POST",
      { challengeId: "circuit_001", labState: circuit(330), durationMs: 100 },
      tokens.STUDENT,
    )
  ).data;
  const hints = await Promise.all([
    req("/attempts/" + second.id + "/hint", "POST", {}, tokens.STUDENT),
    req("/attempts/" + second.id + "/hint", "POST", {}, tokens.STUDENT),
  ]);
  check(
    "parallel hint requests cannot skip levels",
    hints.every((h) => h.data.level === 2) &&
      hints[0].data.id === hints[1].data.id,
  );
  const good = (
    await req(
      "/attempts",
      "POST",
      { challengeId: "circuit_001", labState: circuit(), durationMs: 100 },
      tokens.STUDENT,
    )
  ).data;
  check(
    "safe circuit passes",
    good.verdict === "passed" && good.simulationResult.current === 0.02,
  );
  check(
    "experiment saves canonical result",
    (
      await req(
        "/saved",
        "POST",
        { attemptId: good.id, note: "Integration" },
        tokens.STUDENT,
      )
    ).data.simulationResult.current === 0.02,
  );
  const chem = (
    await req(
      "/attempts",
      "POST",
      {
        challengeId: "chemistry_001",
        labState: { reactionId: "mg-hcl", molesA: 0.1, molesB: 0.2 },
        durationMs: 100,
      },
      outsider.data.accessToken,
    )
  ).data;
  check("unassigned student completes chemistry full stack", chem.verdict === "passed");
  const answers = {
    cornea: "Giác mạc",
    aqueous: "Thủy dịch",
    pupil: "Đồng tử",
    lens: "Thể thủy tinh",
    vitreous: "Dịch kính",
    retina: "Võng mạc",
    nerve: "Dây thần kinh thị giác",
    sclera: "Củng mạc",
  };
  const eye = (
    await req(
      "/attempts",
      "POST",
      { challengeId: "eye_001", labState: { answers }, durationMs: 100 },
      outsider.data.accessToken,
    )
  ).data;
  check("unassigned student receives eye anatomy server grade", eye.simulationResult.score === 100);
  check(
    "parent blocked before linking",
    (
      await req(
        "/progress/" + users.STUDENT.id,
        "GET",
        undefined,
        tokens.PARENT,
      )
    ).status === 403,
  );
  const code = (await req("/parent-code", "POST", {}, tokens.STUDENT)).data
    .code;
  check(
    "parent links using one-time code",
    (
      await req(
        "/children/link",
        "POST",
        { code, consent: true },
        tokens.PARENT,
      )
    ).status === 201,
  );
  check(
    "link code cannot be reused",
    (
      await req(
        "/children/link",
        "POST",
        { code, consent: true },
        tokens.PARENT,
      )
    ).status === 400,
  );
  const parentProgress = await req(
    "/progress/" + users.STUDENT.id,
    "GET",
    undefined,
    tokens.PARENT,
  );
  check("parent can read own child", parentProgress.status === 200);
  check(
    "parent cannot see tutor conversation",
    parentProgress.data.attempts.every(
      (a) => !("hints" in a) && !("labState" in a),
    ),
  );
  check(
    "parent cannot read another student",
    (await req("/progress/student", "GET", undefined, tokens.PARENT)).status ===
      403,
  );
  const analytics = (
    await req(
      "/classes/" + classroom.id + "/analytics",
      "GET",
      undefined,
      tokens.TEACHER,
    )
  ).data;
  const integrationStudent = analytics.find(
    (student) => student.id === users.STUDENT.id,
  );
  check(
    "teacher sees traceable hints",
    integrationStudent?.attempts.some((a) =>
      a.hints.some((h) => h.contextSnapshot.simulation),
    ),
  );
  check(
    "forged science result ignored",
    (
      await req(
        "/attempts",
        "POST",
        {
          challengeId: "circuit_001",
          labState: circuit(330),
          durationMs: 100,
          verdict: "passed",
          simulationResult: { current: 0.01 },
        },
        tokens.STUDENT,
      )
    ).data.verdict === "partial",
  );
  const login = await req("/auth/student/login", "POST", {
    username: users.STUDENT.username,
    password: changedStudentPassword,
  });
  const cookie = login.cookie.split(";")[0];
  const refresh = await fetch(origin + "/auth/refresh", {
    method: "POST",
    headers: { cookie },
  });
  const fresh = await refresh.json();
  check(
    "refresh rotates session",
    refresh.status === 201 && !!fresh.accessToken,
  );
  check(
    "old refresh token is single use",
    (
      await fetch(origin + "/auth/refresh", {
        method: "POST",
        headers: { cookie },
      })
    ).status === 401,
  );
  check(
    "rotated access session revoked",
    (await req("/auth/me", "GET", undefined, login.data.accessToken)).status ===
      401,
  );
  const freshCookie = refresh.headers.get("set-cookie").split(";")[0];
  await fetch(origin + "/auth/logout", {
    method: "POST",
    headers: { cookie: freshCookie },
  });
  check(
    "logout revokes access immediately",
    (await req("/auth/me", "GET", undefined, fresh.accessToken)).status === 401,
  );
  console.log(`\n${passed} integration assertions passed.`);
} finally {
  if (classroom?.id)
    await db.classroom.deleteMany({ where: { id: classroom.id } });
  if (lesson?.id) await db.lesson.deleteMany({ where: { id: lesson.id } });
  if (materialLesson?.id) await db.lesson.deleteMany({ where: { id: materialLesson.id } });
  await db.auditLog.deleteMany({ where: { actorId: { in: created } } });
  await db.idempotencyRecord.deleteMany({ where: { actorId: { in: created } } });
  for (const id of uploaded) {
    await db.assetFile.deleteMany({ where: { id } });
    await unlink(resolve(process.env.UPLOAD_DIR ?? "uploads", id)).catch((error) => {
      if (error.code !== "ENOENT") throw error;
    });
  }
  await db.user.deleteMany({ where: { id: { in: created } } });
  await db.$disconnect();
}
