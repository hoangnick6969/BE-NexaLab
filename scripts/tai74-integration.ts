import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { goldenTemplates } from "../src/modules/labs/application/simulation-versions";

const url = process.env.NEXALAB_ISOLATED_DATABASE_URL;
if (!url || url !== process.env.DATABASE_URL || url !== process.env.DIRECT_URL ||
    !["127.0.0.1", "localhost", "[::1]"].includes(new URL(url).hostname) || new URL(url).pathname !== "/nexalab_tai74")
  throw new Error("Use the dedicated loopback nexalab_tai74 database for this T4 test");
const db = new PrismaClient({ datasourceUrl: url });
const api = process.env.TEST_API ?? "http://127.0.0.1:4100/api";
if (!["127.0.0.1", "localhost", "[::1]"].includes(new URL(api).hostname))
  throw new Error("The T4 integration test requires a loopback API");
const classId = "class-pilot-a";
const classPath = "/classes/" + classId;
const password = process.env.SEED_FIXTURE_PASSWORD;

async function call(path: string, method = "GET", body?: unknown, token?: string, status?: number) {
  const res = await fetch(api + path, { method, headers: {
    "Content-Type": "application/json", ...(token ? { Authorization: "Bearer " + token } : {}),
    ...(method !== "GET" ? { "Idempotency-Key": randomUUID() } : {}),
  }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const data = await res.json();
  if (status != null) assert.equal(res.status, status, JSON.stringify(data));
  else assert.ok(res.ok, JSON.stringify(data));
  return data;
}

async function main() {
  const teacher = (await call("/auth/login", "POST", { email: "teacher.owner@nexalab.local", password })).accessToken;
  const student = (await call("/auth/student/login", "POST", { username: "student.active", password })).accessToken;
  const primary = await db.user.findUniqueOrThrow({ where: { username: "student.active" } });
  const name = "tai74." + randomUUID().slice(0, 8);
  const second = await db.user.create({ data: { username: name, role: "STUDENT", fullName: "TAI74 Fixture", passwordHash: primary.passwordHash } });
  await db.enrollment.create({ data: { classId, studentId: second.id, status: "approved", approved: true } });
  const other = (await call("/auth/student/login", "POST", { username: name, password })).accessToken;
  const release = await db.labRelease.findFirstOrThrow({ where: { labId: "circuit", status: "ACTIVE" } });
  const task = {
    kind: "EXAM", title: "TAI74 API expiry " + Date.now(), lessonId: "lesson-circuit",
    content: {
      questions: [{ prompt: "Mạch nào có dòng điện?", options: ["Kín", "Hở"], correctOption: 0, points: 4.04, cognitiveLevel: "RECALL" }],
      prompts: [{
        prompt: "Giải thích hoạt động của đèn.", maxChars: 1000, points: 4, cognitiveLevel: "UNDERSTAND", referenceAnswer: "Đáp án nội bộ",
        criteria: [{ code: "NHIET", description: "Nêu tác dụng nhiệt", maxPoints: 4, anchors: [{ points: 0, description: "Chưa giải thích" }, { points: 4, description: "Đúng" }] }],
      }],
      labs: [{ labId: "circuit", releaseId: release.id, challengeId: "circuit_001", points: 1.96, cognitiveLevel: "APPLY", prompt: "Bật LED." }],
    },
  };
  const invalid = structuredClone(task);
  invalid.content.labs[0].points = 1.95;
  assert.equal((await call(classPath + "/resources", "POST", invalid, teacher, 400)).code, "EXAM_POINTS_INVALID");
  const paper = await call(classPath + "/resources", "POST", task, teacher);
  await call(classPath + "/resources/" + paper.id + "/publish", "POST", {}, teacher);
  assert.equal((await call(classPath + "/resources/" + paper.id, "GET", undefined, student)).content, null);
  const assigned = await call(classPath + "/assignments", "POST", {
    contentType: "exam", contentId: paper.id, assessmentType: "REGULAR_15M", dueDate: new Date(Date.now() + 3_600_000).toISOString(),
    audience: "SUBSET", studentIds: [primary.id, second.id],
  }, teacher);
  const id = assigned.assignment.id;
  const assignedPath = "/assignments/" + id;
  const teacherPath = classPath + assignedPath;
  const sessions: Array<{ id: string; start: Date }> = [];
  const text = ("Electron va chạm với các ion kim loại, làm dây tóc nóng lên và phát ra ánh sáng. Điện năng chuyển hóa thành nhiệt năng. ").repeat(3).trim();
  for (const token of [student, other]) {
    const { session } = await call(assignedPath + "/sessions", "POST", {}, token);
    const view = await call(assignedPath, "GET", undefined, token);
    assert.doesNotMatch(JSON.stringify(view.content), /correctOption|referenceAnswer|anchors|executionDigest/);
    const { questions: [q], prompts: [p], labs: [lab] } = view.content;
    const selector = { assignmentId: id, sessionId: session.id, itemId: lab.id };
    if (token === student) {
      await call("/labs/circuit/runs", "POST", { challengeId: lab.challengeId, exam: selector }, other, 400);
      const run = await call("/labs/circuit/runs", "POST", { challengeId: lab.challengeId, exam: selector }, student);
      assert.equal(run.context, "EXAM");
      const simulated = await call("/attempts", "POST", {
        contract: run.contract, runId: run.runId, idempotencyKey: randomUUID(), stateSchemaVersion: 1, evidenceSchemaVersion: 1,
        labState: goldenTemplates("circuit")[2].labState, durationMs: 100,
      }, student);
      assert.equal(simulated.attempt.verdict, undefined);
      assert.equal((await db.attempt.findUniqueOrThrow({ where: { id: simulated.attempt.id } })).verdict, "passed");
      await call("/me/attempts/" + simulated.attempt.id, "GET", undefined, student, 404);
      await call("/attempts/" + simulated.attempt.id + "/explanation", "GET", undefined, student, 404);
      assert.equal((await call(assignedPath, "GET", undefined, student)).assessment.openSession.labAttempts[0].itemId, lab.id);
    }
    await call(assignedPath + "/sessions/" + session.id + "/draft", "PUT", {
      answers: { choices: [{ questionId: q.id, optionId: q.options[0].id }], responses: [{ promptId: p.id, text }] },
    }, token);
    sessions.push({ id: session.id, start: new Date(session.startedAt) });
  }
  // Backdate server timestamps together to force expiry, while retaining their ordering.
  for (const session of sessions) {
    const offset = 60_000;
    await db.$transaction(async (tx) => {
      await tx.assessmentSession.update({ where: { id: session.id }, data: { startedAt: new Date(+session.start - offset), expiresAt: new Date(Date.now() - 31_000) } });
      const runs = await tx.labRun.findMany({ where: { assessmentSessionId: session.id }, select: { id: true } });
      await tx.attempt.updateMany({ where: { labRunId: { in: runs.map((run) => run.id) } }, data: { createdAt: new Date(Date.now() - 45_000) } });
    });
  }
  const expired = await call(assignedPath, "GET", undefined, student);
  assert.equal(expired.state.current.autoSubmitted, true);
  assert.equal(expired.state.current.score10, null);
  assert.equal(expired.state.current.responses[0].text, text);
  const board = await call(teacherPath + "/gradebook", "GET", undefined, teacher);
  const expected = board.rows.find((row: any) => row.student.id === primary.id);
  assert.equal(expected.mcq10, 4);
  assert.equal(expected.lab10, 2);
  assert.equal(expected.total10, null);
  assert.equal(expected.status, "AWAITING_GRADE");
  assert.equal(board.rows.find((row: any) => row.student.id === second.id).lab10, 0);
  assert.equal(await db.assignmentSubmission.count({ where: { assignmentId: id, autoSubmitted: true } }), 2);
  assert.equal((await call(teacherPath + "/gradebook/lock", "POST", {}, teacher, 409)).code, "GRADEBOOK_NOT_READY");
  const similarity = await call(teacherPath + "/similarity-runs", "POST", {}, teacher);
  assert.equal(similarity.run.submissionCount, 2);
  assert.equal(similarity.run.matchCount, 1);
  const flagged = await call(teacherPath + "/gradebook", "GET", undefined, teacher);
  assert.equal(flagged.summary.similarityFlags, 2);
  console.log("TAI7-T4 API passed: invalid weights, paper privacy, session ownership, official Lab, mixed autosave/expiry, lock block and written similarity.");
}
main().finally(() => db.$disconnect());
