// Epic A5 live verification: a fresh provisioned student walks a freshly
// published lesson pathway (reading → video → quiz → circuit lab), then official progress, history pagination,
// ownership, tampering and projection rebuild are checked against the API
// and database. Requires a running seeded API (TEST_API) and DATABASE_URL.
import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { PrismaClient } from "@prisma/client";
import * as argon from "argon2";
import jwt from "jsonwebtoken";

const db = new PrismaClient();
const origin = process.env.TEST_API ?? "http://127.0.0.1:4000/api";
const prefix = "a5-" + Date.now();
let lessonId;
let passed = 0;
let classroomId;
const createdUsers = [];

async function req(path, method = "GET", body, auth) {
  const r = await fetch(origin + path, {
    method,
    headers: { "content-type": "application/json", ...(auth ? { authorization: "Bearer " + auth } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { status: r.status, data: await r.json() };
}
function check(name, condition, detail) {
  assert.ok(condition, name + (detail === undefined ? "" : " — " + JSON.stringify(detail)));
  passed++;
  console.log("PASS " + name);
}
const circuit = (resistance = 350, closed = true) => ({
  nodes: [
    { id: "b", type: "battery", value: 9 },
    { id: "r", type: "resistor", value: resistance },
    { id: "l", type: "led" },
    { id: "s", type: "switch", closed },
  ],
  edges: [
    { source: "b", target: "r" },
    { source: "r", target: "l" },
    { source: "l", target: "s" },
    { source: "s", target: "b" },
  ],
});
function projection(args) {
  const run = spawnSync("npx", ["tsx", "scripts/progress-projection.ts", ...args], { encoding: "utf8" });
  return JSON.parse(run.stdout);
}

try {
  // Isolated teacher so the run does not depend on seed passwords.
  const teacherPassword = "A5-Teacher-Password-2026!";
  const teacherUser = await db.user.create({
    data: { email: `${prefix}-teacher@example.test`, fullName: "A5 Teacher", role: "TEACHER", passwordHash: await argon.hash(teacherPassword), consentAt: new Date() },
  });
  createdUsers.push(teacherUser.id);
  const teacher = await req("/auth/login", "POST", { email: teacherUser.email, password: teacherPassword });
  check("isolated teacher login", teacher.status === 201);
  const teacherToken = teacher.data.accessToken;
  const lesson = await req("/lessons", "POST", {
    title: prefix + " Mạch điện",
    subjectId: "physics",
    chapter: "Điện học",
    grade: 8,
    topic: "Mạch điện kín",
    learningObjective: "Lắp mạch kín an toàn cho LED",
    prerequisites: "Không",
    curriculum: "KHTN 8",
    content: "<p>Dòng điện chạy trong mạch kín.</p>",
    labId: "circuit",
    status: "published",
    materials: [],
    questions: [
      { prompt: prefix + " Tăng điện trở thì dòng điện?", options: ["Giảm", "Tăng"], answer: 0 },
      { prompt: prefix + " LED cần mạch gì để sáng?", options: ["Hở", "Kín"], answer: 1 },
    ],
  }, teacherToken);
  check("teacher publishes an isolated reading → video → quiz → lab lesson", lesson.status === 201, lesson.data);
  lessonId = lesson.data.id;
  const S = (type) => `step-${lessonId}-${type}`;
  const klass = await req("/classes", "POST", { name: prefix + " class", grade: 8 }, teacherToken);
  check("teacher creates an isolated class", klass.status === 201);
  classroomId = klass.data.id;

  async function provision(suffix) {
    const username = `${prefix}-${suffix}`;
    const made = await req(`/classes/${classroomId}/students`, "POST", { username, fullName: "A5 " + suffix, grade: 8, consent: true }, teacherToken);
    assert.equal(made.status, 201, "provision " + suffix);
    createdUsers.push(made.data.user.id);
    const first = await req("/auth/student/login", "POST", { username, password: made.data.credentials.temporaryPassword });
    const password = "A5-Private-Password-2026!";
    await req("/auth/password", "POST", { currentPassword: made.data.credentials.temporaryPassword, password }, first.data.accessToken);
    const login = await req("/auth/student/login", "POST", { username, password });
    assert.equal(login.status, 201, "login " + suffix);
    return { id: made.data.user.id, token: login.data.accessToken, username, password };
  }
  const student = await provision("student");
  const peer = await provision("peer");
  check("two provisioned students sign in with private passwords", Boolean(student.token && peer.token));

  const unassigned = await req("/me/progress", "GET", undefined, student.token);
  check("progress before assignment is empty, not fabricated", unassigned.status === 200 && unassigned.data.assignments.length === 0 && unassigned.data.summary.activeAssignments === 0);
  const due = new Date(Date.now() + 7 * 86400000).toISOString();
  const assignment = await req(`/classes/${classroomId}/assignments`, "POST", { contentId: lessonId, contentType: "lesson", title: prefix + " Mạch điện", dueDate: due, studentIds: [student.id] }, teacherToken);
  check("teacher assigns the lesson to one student", assignment.status === 201);
  const assignmentId = assignment.data.id;

  check("teacher role cannot read /me/progress", (await req("/me/progress", "GET", undefined, teacherToken)).status === 403);
  check("anonymous request to /me/activity is rejected", (await req("/me/activity")).status === 401);

  // A5-T1: not started
  let progress = (await req("/me/progress", "GET", undefined, student.token)).data;
  let item = progress.assignments.find((entry) => entry.assignmentId === assignmentId);
  check("not started: 0 of 4 required steps, next step is reading", item && item.completedRequired === 0 && item.totalRequired === 4 && item.percent === 0 && item.nextStepId === S("reading"), item);
  check("not started: no step cites evidence", item.steps.every((step) => step.evidenceId === null));
  check("peer outside the assignment sees no assignment", (await req("/me/progress", "GET", undefined, peer.token)).data.assignments.every((entry) => entry.assignmentId !== assignmentId));

  // Learning evidence through the real API
  const stepUrl = (stepId) => `/lessons/${lessonId}/steps/${stepId}/progress`;
  check("reading completes", (await req(stepUrl(S("reading")), "PUT", { action: "complete" }, student.token)).status === 200);
  check("video completes via approved equivalent", (await req(stepUrl(S("video")), "PUT", { action: "complete-fallback" }, student.token)).status === 200);

  progress = (await req("/me/progress", "GET", undefined, student.token)).data;
  item = progress.assignments.find((entry) => entry.assignmentId === assignmentId);
  const reading = item.steps.find((step) => step.stepId === S("reading"));
  const direct = await db.stepProgress.findUnique({ where: { studentId_stepId: { studentId: student.id, stepId: reading.stepId } } });
  check("partial: 2 of 4 with percent 50 and next step quiz", item.completedRequired === 2 && item.percent === 50 && item.nextStepId === S("quiz"), item);
  check("partial: lab is locked behind the quiz", item.steps.find((step) => step.type === "LAB").state === "LOCKED");
  check("reading evidence timestamp equals the StepProgress row", reading.evidenceType === "STEP_PROGRESS" && reading.completedAt === direct.completedAt.toISOString());

  // A3 evidence: fail then pass
  const quiz = await req(`/lessons/${lessonId}/quiz`, "GET", undefined, student.token);
  const quizStep = await db.lessonStep.findUnique({ where: { id: quiz.data.stepId } });
  const key = quizStep.config.questions;
  const wrong = key.map((question) => ({ questionId: question.id, optionId: question.options.find((option) => option.id !== question.answerOptionId).id }));
  const right = key.map((question) => ({ questionId: question.id, optionId: question.answerOptionId }));
  const failedQuiz = await req(`/lessons/${lessonId}/quiz-attempts`, "POST", { answers: wrong, idempotencyKey: randomUUID() }, student.token);
  const passedQuiz = await req(`/lessons/${lessonId}/quiz-attempts`, "POST", { answers: right, idempotencyKey: randomUUID() }, student.token);
  check("quiz fails then passes", failedQuiz.status === 201 && !failedQuiz.data.attempt.passed && passedQuiz.status === 201 && passedQuiz.data.attempt.passed);

  // A5-T0: server-derived practical linkage
  const readingTamper = await req("/attempts", "POST", { challengeId: "circuit_001", lessonStepId: S("reading"), labState: circuit(), durationMs: 100 }, student.token);
  check("practical attempt cannot target a reading step", readingTamper.status === 404);
  const peerTamper = await req("/attempts", "POST", { challengeId: "circuit_001", lessonStepId: S("lab"), labState: circuit(), durationMs: 100 }, peer.token);
  check("unassigned student cannot attach evidence to the lesson step", peerTamper.status === 404);
  const partial = await req("/attempts", "POST", { challengeId: "circuit_001", lessonStepId: S("lab"), assignmentId: "forged-assignment", labState: circuit(100), durationMs: 100, idempotencyKey: randomUUID() }, student.token);
  check("partial lab attempt stores the server assignment, not the forged one", partial.status === 201 && partial.data.verdict === "partial" && partial.data.assignmentId === assignmentId, partial.data.assignmentId);
  const labPass = await req("/attempts", "POST", { challengeId: "circuit_001", lessonStepId: S("lab"), labState: circuit(), durationMs: 100, idempotencyKey: randomUUID() }, student.token);
  const labRetryFail = await req("/attempts", "POST", { challengeId: "circuit_001", lessonStepId: S("lab"), labState: circuit(350, false), durationMs: 100, idempotencyKey: randomUUID() }, student.token);
  check("lab passes, then a failed retry is recorded", labPass.data.verdict === "passed" && labRetryFail.status === 201 && labRetryFail.data.verdict !== "passed");
  const labRow = await db.stepProgress.findUnique({ where: { studentId_stepId: { studentId: student.id, stepId: S("lab") } } });
  check("failed retry does not downgrade the passed lab step", labRow.status === "COMPLETED" && labRow.completedAt !== null);

  // A5-T1/T2: completed and traceable
  progress = (await req("/me/progress", "GET", undefined, student.token)).data;
  item = progress.assignments.find((entry) => entry.assignmentId === assignmentId);
  const quizEvidence = item.steps.find((step) => step.type === "QUIZ");
  const labEvidence = item.steps.find((step) => step.type === "LAB");
  check("completed: 4 of 4, percent 100, no next step", item.completed && item.completedRequired === 4 && item.percent === 100 && item.nextStepId === null, item);
  check("quiz step cites the first passing attempt; latest/best labelled", quizEvidence.evidenceId === passedQuiz.data.attempt.id && item.quiz.latest.attemptId === passedQuiz.data.attempt.id && item.quiz.best.score === 100);
  check("lab step cites the passing attempt; latest verdict is the failed retry", labEvidence.evidenceId === labPass.data.id && labEvidence.practical.latest.attemptId === labRetryFail.data.id && labEvidence.practical.best.verdict === "passed");
  const pathway = await req(`/lessons/${lessonId}/pathway`, "GET", undefined, student.token);
  check("progress next step matches the authoritative pathway", pathway.data.nextStepId === item.nextStepId && pathway.data.steps.every((step) => step.state === "COMPLETED"));
  check("summary counts match source rows", progress.summary.practicalAttempts === await db.attempt.count({ where: { studentId: student.id } }) && progress.summary.quizAttempts === 2 && progress.summary.completedAssignments === 1);

  // A5-T3: pagination
  const seen = [];
  let cursor = null;
  let pages = 0;
  do {
    const page = await req("/me/activity?limit=2" + (cursor ? "&cursor=" + encodeURIComponent(cursor) : ""), "GET", undefined, student.token);
    assert.equal(page.status, 200);
    seen.push(...page.data.items);
    cursor = page.data.nextCursor;
    pages++;
  } while (cursor && pages < 20);
  const sourceCount = (await db.attempt.count({ where: { studentId: student.id } })) + (await db.quizAttempt.count({ where: { studentId: student.id } }));
  const ordered = [...seen].every((entry, index, all) => index === 0 || all[index - 1].occurredAt > entry.occurredAt || (all[index - 1].occurredAt === entry.occurredAt && all[index - 1].id > entry.id));
  check("activity pages of 2 cover every attempt once, newest first", seen.length === sourceCount && new Set(seen.map((entry) => entry.id)).size === sourceCount && ordered && pages === Math.ceil(sourceCount / 2), { seen: seen.length, sourceCount, pages });
  check("practical rows show verdicts, quiz rows labelled score/pass", seen.filter((entry) => entry.kind === "PRACTICAL").every((entry) => entry.verdict && entry.score === null) && seen.filter((entry) => entry.kind === "QUIZ").every((entry) => typeof entry.score === "number" && entry.verdict === null));
  check("rows link back to lesson step and assignment", seen.every((entry) => entry.lessonId === lessonId && entry.stepId && entry.assignmentId === assignmentId && !entry.legacy));
  check("tampered cursor is rejected", (await req("/me/activity?cursor=bogus", "GET", undefined, student.token)).status === 400);
  check("page size is bounded", (await req("/me/activity?limit=500", "GET", undefined, student.token)).status === 400);
  const stepHistory = await req("/me/activity?kind=QUIZ&stepId=" + quizEvidence.stepId, "GET", undefined, student.token);
  check("step drill-down lists exactly that step's quiz attempts", stepHistory.data.items.length === 2 && stepHistory.data.items.every((entry) => entry.stepId === quizEvidence.stepId));

  // A5-T2: detail and ownership
  const quizDetail = await req("/me/quiz-attempts/" + passedQuiz.data.attempt.id, "GET", undefined, student.token);
  const serialized = JSON.stringify(quizDetail.data);
  check("quiz detail labels latest/best and score inputs", quizDetail.status === 200 && quizDetail.data.latest && quizDetail.data.best && quizDetail.data.correctCount === key.length && quizDetail.data.passThreshold === 50);
  check("quiz detail never exposes the answer key", !serialized.includes("answerOptionId") && !serialized.includes("questionSnapshot"));
  const practicalDetail = await req("/me/attempts/" + labRetryFail.data.id, "GET", undefined, student.token);
  check("practical detail shows verdict and linked step", practicalDetail.status === 200 && practicalDetail.data.stepId === S("lab") && practicalDetail.data.attemptNumber >= 3 && practicalDetail.data.verdict !== "passed");
  const foreign = await req("/me/attempts/" + labPass.data.id, "GET", undefined, peer.token);
  const missing = await req("/me/attempts/does-not-exist", "GET", undefined, peer.token);
  const foreignQuiz = await req("/me/quiz-attempts/" + passedQuiz.data.attempt.id, "GET", undefined, peer.token);
  check("another student's attempt is indistinguishable from a missing one", foreign.status === 404 && missing.status === 404 && JSON.stringify(foreign.data) === JSON.stringify(missing.data) && foreignQuiz.status === 404);
  check("legacy mark-complete endpoint no longer writes progress", (await req(`/lessons/${lessonId}/complete`, "POST", undefined, student.token)).status === 409);

  // A5-T4: projection drift detection and repair
  const row = await db.progress.findUnique({ where: { studentId_contentId: { studentId: student.id, contentId: lessonId } } });
  check("lesson projection written transactionally with evidence", row?.status === "completed" && row.score === 100 && row.attemptsCount === 2 + 3);
  const before = { quiz: await db.quizAttempt.count({ where: { studentId: student.id } }), attempts: await db.attempt.count({ where: { studentId: student.id } }), steps: await db.stepProgress.count({ where: { studentId: student.id } }) };
  await db.progress.update({ where: { studentId_contentId: { studentId: student.id, contentId: lessonId } }, data: { status: "in_progress", score: 7 } });
  await db.progress.create({ data: { studentId: student.id, contentId: "lesson-orphan-" + prefix, status: "completed", score: 100 } });
  await db.progress.delete({ where: { studentId_contentId: { studentId: student.id, contentId: "circuit" } } });
  const dry = projection(["--student", student.id]);
  check("dry-run reports mismatch, orphan and missing rows", dry.mode === "dry-run" && dry.byKind.mismatch === 1 && dry.byKind.orphan === 1 && dry.byKind.missing === 1, dry.byKind);
  check("dry-run leaves the drifted row untouched", (await db.progress.findUnique({ where: { studentId_contentId: { studentId: student.id, contentId: lessonId } } })).score === 7);
  const applied = projection(["--apply", "--student", student.id]);
  const second = projection(["--apply", "--student", student.id]);
  const repaired = await db.progress.findUnique({ where: { studentId_contentId: { studentId: student.id, contentId: lessonId } } });
  check("apply repairs the projection and a second run is a no-op", applied.driftCount === 3 && second.driftCount === 0 && repaired.status === "completed" && repaired.score === 100);
  const after = { quiz: await db.quizAttempt.count({ where: { studentId: student.id } }), attempts: await db.attempt.count({ where: { studentId: student.id } }), steps: await db.stepProgress.count({ where: { studentId: student.id } }) };
  check("rebuild never changes source evidence", JSON.stringify(before) === JSON.stringify(after), { before, after });
  check("rebuild output carries no answers or secrets", !JSON.stringify(applied).match(/answer|password|token/i));

  // A5-T5 negative cases
  const forgedVerdict = await req("/attempts", "POST", { challengeId: "circuit_001", lessonStepId: S("lab"), labState: circuit(350, false), verdict: "passed", simulationResult: { verdict: "passed" }, durationMs: 100, idempotencyKey: randomUUID() }, student.token);
  check("client-sent verdict is ignored; the server recomputes", forgedVerdict.status === 201 && forgedVerdict.data.verdict !== "passed");
  const duplicateKey = randomUUID();
  const countBeforeDuplicate = await db.attempt.count({ where: { studentId: student.id } });
  const [dupA, dupB] = await Promise.all([0, 1].map(() => req("/attempts", "POST", { challengeId: "circuit_001", lessonStepId: S("lab"), labState: circuit(), durationMs: 100, idempotencyKey: duplicateKey }, student.token)));
  const countAfterDuplicate = await db.attempt.count({ where: { studentId: student.id } });
  check("duplicate mutation with one idempotency key records one attempt", [dupA.status, dupB.status].includes(201) && countAfterDuplicate === countBeforeDuplicate + 1, { statuses: [dupA.status, dupB.status], countBeforeDuplicate, countAfterDuplicate });
  const session = jwt.decode(student.token);
  const expired = jwt.sign({ sub: session.sub, role: session.role, sid: session.sid, exp: Math.floor(Date.now() / 1000) - 60 }, process.env.JWT_SECRET);
  check("expired session cannot read progress or history", (await req("/me/progress", "GET", undefined, expired)).status === 401 && (await req("/me/activity", "GET", undefined, expired)).status === 401);
  const reloaded = (await req("/me/progress", "GET", undefined, student.token)).data.assignments.find((entry) => entry.assignmentId === assignmentId);
  check("reload returns the same official status", reloaded.completed && reloaded.completedRequired === 4);

  // Pilot latency targets (PRD QR-09): reads p95 <= 500 ms. Measured and reported, never assumed.
  async function p95(path, samples = 20) {
    const times = [];
    for (let i = 0; i < samples; i++) {
      const started = performance.now();
      const response = await req(path, "GET", undefined, student.token);
      assert.equal(response.status, 200);
      times.push(performance.now() - started);
    }
    return Math.round(times.sort((a, b) => a - b)[Math.ceil(samples * 0.95) - 1]);
  }
  const latency = { "/me/progress": await p95("/me/progress"), "/me/activity": await p95("/me/activity?limit=20") };
  for (const [path, value] of Object.entries(latency))
    console.log(`${value <= 500 ? "TARGET MET" : "TARGET MISSED"} ${path} p95 ${value} ms (target 500 ms, development Supabase)`);

  // Regression: standalone lab practice, hints and the Teacher/Parent progress route.
  const standalone = await req("/attempts", "POST", { challengeId: "circuit_001", labState: circuit(100), durationMs: 100 }, peer.token);
  check("standalone lab attempt without a lesson step still records", standalone.status === 201 && standalone.data.lessonStepId === null && standalone.data.assignmentId === null);
  const hint = await req(`/attempts/${standalone.data.id}/hint`, "POST", undefined, peer.token);
  const peerLab = await db.progress.findUnique({ where: { studentId_contentId: { studentId: peer.id, contentId: "circuit" } } });
  check("hint request still works and projects lastHintLevel", hint.status === 201 && peerLab?.lastHintLevel === hint.data.level && peerLab.status === "in_progress" && peerLab.attemptsCount === 1);
  const legacyRoute = await req("/progress/" + student.id, "GET", undefined, student.token);
  check("legacy /progress/:id still serves projection rows", legacyRoute.status === 200 && legacyRoute.data.progress.some((entry) => entry.contentId === lessonId && entry.status === "completed"));
  const peerActivity = await req("/me/activity", "GET", undefined, peer.token);
  check("legacy-shaped practical row (no lesson link) is labelled", peerActivity.data.items.length === 1 && peerActivity.data.items[0].legacy && peerActivity.data.items[0].lessonId === null);

  // Runs last: the browser takes long enough for idle keep-alive sockets in
  // this script's fetch pool to be closed by the server.
  if (process.env.RUN_A5_BROWSER_E2E === "true") {
    const frontendRoot = process.env.FRONTEND_ROOT ?? [resolve("..", "nexalab-fe"), resolve("..", "FE-NexaLab")].find((path) => existsSync(path));
    const run = spawnSync("npx", ["playwright", "test", "tests/progress-live.spec.ts", "--reporter=list"], {
      cwd: frontendRoot,
      encoding: "utf8",
      env: {
        ...process.env,
        TEST_ASSIGNMENT_ID: assignmentId,
        TEST_STUDENT_USERNAME: student.username,
        TEST_STUDENT_PASSWORD: student.password,
        TEST_WEB: process.env.TEST_WEB ?? "http://127.0.0.1:5173",
      },
    });
    if (run.stdout) process.stdout.write(run.stdout);
    if (run.stderr) process.stderr.write(run.stderr);
    check("real FE/API/database progress browser journey passes", run.status === 0);
  }

  console.log(`\n${passed} A5 assertions passed.`);
} finally {
  if (classroomId) await db.classroom.deleteMany({ where: { id: classroomId } });
  if (lessonId) await db.lesson.deleteMany({ where: { id: lessonId } });
  if (createdUsers.length) await db.user.deleteMany({ where: { id: { in: createdUsers } } });
  await db.$disconnect();
}
