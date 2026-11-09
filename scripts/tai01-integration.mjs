// TAI-01 real-dependency journey (TAI-T6): the SPEC success signal against the running API and its database.
// The owner teacher generates a 10-question TEST from lesson-circuit, sees validation flags, edits one item, rejects
// one, materializes, then publishes, revises, assigns and a student submits with server scoring unchanged. The outsider
// teacher, a student, a parent and replayed requests are each denied or replayed per contract. Per-job token usage is
// printed for TAI-05.
//
// Needs: the API started with AI_PROVIDER=fake (the deterministic provider; never a live provider) and the AI runner
// enabled, on the isolated local database (npm run test:tai01 runs the isolated-database guard first). Every fixture
// uses a unique prefix and is removed afterwards (including the audit rows of the fixture actors).
//   TEST_API=http://127.0.0.1:4100/api npm run test:tai01
import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import * as argon from "argon2";

const db = new PrismaClient();
const origin = process.env.TEST_API ?? "http://127.0.0.1:4100/api";
const prefix = "tai01-" + Date.now().toString(36);
const password = "Tai01-Journey-Password-2026!";
const createdUsers = [];
const classIds = [];
let passed = 0;

async function req(path, method = "GET", body, auth, headers = {}) {
  const r = await fetch(origin + path, {
    method,
    headers: { "content-type": "application/json", ...(auth ? { authorization: "Bearer " + auth } : {}), ...headers },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  let data = null;
  try {
    data = await r.json();
  } catch {
    data = null;
  }
  return { status: r.status, data };
}
const key = () => ({ "Idempotency-Key": randomUUID() });
function check(name, condition, detail) {
  assert.ok(condition, name + (detail === undefined ? "" : " — " + JSON.stringify(detail)));
  passed++;
  console.log("PASS " + name);
}
const code = (res, status, value) => res.status === status && res.data?.code === value;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const AI_KEYS = ["sourceRefs", "correctOption", "explanation", "NUMERIC_REVIEW", "aiJob", "promptVersion"];
const leaks = (value) => AI_KEYS.filter((k) => JSON.stringify(value ?? null).includes(k));

async function user(label, role, extra = {}) {
  const row = await db.user.create({
    data: {
      ...(role === "STUDENT" ? { username: `${prefix}-${label}` } : { email: `${prefix}-${label}@example.test` }),
      fullName: `TAI01 ${label}`,
      role,
      passwordHash: await argon.hash(password),
      consentAt: new Date(),
      ...extra,
    },
  });
  createdUsers.push(row.id);
  const signIn = () =>
    role === "STUDENT"
      ? req("/auth/student/login", "POST", { username: row.username, password })
      : req("/auth/login", "POST", { email: row.email, password });
  let login = await signIn();
  if (login.status === 429) {
    console.log("     waiting 61 s for the login rate window");
    await sleep(61000);
    login = await signIn();
  }
  assert.equal(login.status, 201, `${label} login ${JSON.stringify(login.data)}`);
  return { id: row.id, token: login.data.accessToken };
}

async function waitForJob(classId, jobId, token) {
  for (let i = 0; i < 60; i++) {
    const res = await req(`/classes/${classId}/ai-jobs/${jobId}`, "GET", undefined, token);
    if (["SUCCEEDED", "FAILED", "CANCELLED"].includes(res.data?.status)) return res;
    await sleep(1000);
  }
  throw new Error(`AI job ${jobId} did not finish in 60 s; is the API running with AI_PROVIDER=fake and the runner enabled?`);
}

try {
  const lesson = await db.lesson.findUnique({ where: { id: "lesson-circuit" }, select: { id: true, scope: true, status: true } });
  assert.ok(lesson && lesson.scope === "SHARED_LIBRARY" && lesson.status === "published", "seeded lesson-circuit is a published library lesson");
  const owner = await user("owner", "TEACHER");
  const outsider = await user("outsider-teacher", "TEACHER");
  const student = await user("student", "STUDENT");
  const outsideStudent = await user("outside-student", "STUDENT");
  const parent = await user("parent", "PARENT", { emailVerifiedAt: new Date() });
  const classA = await db.classroom.create({ data: { teacherId: owner.id, name: `${prefix} pilot A`, grade: 8 } });
  const classB = await db.classroom.create({ data: { teacherId: outsider.id, name: `${prefix} pilot B`, grade: 8 } });
  classIds.push(classA.id, classB.id);
  await db.enrollment.create({ data: { classId: classA.id, studentId: student.id, status: "approved", approved: true } });
  await db.enrollment.create({ data: { classId: classB.id, studentId: outsideStudent.id, status: "approved", approved: true } });
  await db.parentLink.create({ data: { parentId: parent.id, studentId: student.id, status: "approved" } });
  const base = `/classes/${classA.id}/ai-jobs`;
  const body = { purpose: "GENERATE_RESOURCE", targetKind: "TEST", lessonId: "lesson-circuit", itemCount: 10 };

  // ---------- create, replay and denials ----------
  const quotaBefore = await req("/me/ai-quota", "GET", undefined, owner.token);
  check("the owner reads the AI quota", quotaBefore.status === 200 && quotaBefore.data.usedLast24h === 0, quotaBefore.data);
  const createKey = key();
  const created = await req(base, "POST", body, owner.token, createKey);
  check("the owner creates a PENDING job (202)", created.status === 202 && created.data.status === "PENDING" && created.data.promptVersion === "generate-resource@1", created.data);
  const jobId = created.data.id;
  const pinned = await db.aiJob.findUnique({ where: { id: jobId }, select: { provider: true } });
  if (pinned?.provider !== "fake") {
    await req(`${base}/${jobId}/cancel`, "POST", undefined, owner.token);
    throw new Error(`the API is configured with provider ${pinned?.provider}; this journey only runs with AI_PROVIDER=fake (job cancelled)`);
  }
  check("the job is pinned to the fake provider", pinned.provider === "fake" && created.data.model === "fake-model", created.data);
  const replay = await req(base, "POST", body, owner.token, createKey);
  check("the same key and body replay the same job", replay.status === 202 && replay.data.id === jobId, replay.data);
  const reused = await req(base, "POST", { ...body, itemCount: 9 }, owner.token, createKey);
  check("the same key with another body is 409", code(reused, 409, "IDEMPOTENCY_KEY_REUSED"), reused.data);
  const outsiderCreate = await req(base, "POST", body, outsider.token, key());
  const unknownCreate = await req(`/classes/${prefix}-missing/ai-jobs`, "POST", body, outsider.token, key());
  check("the outsider and an unknown class get the same 403 body", code(outsiderCreate, 403, "CLASS_ACCESS_DENIED") && JSON.stringify(outsiderCreate.data) === JSON.stringify(unknownCreate.data), [outsiderCreate.data, unknownCreate.data]);
  for (const [who, token] of [["student", student.token], ["parent", parent.token]]) {
    const denied = await req(base, "POST", body, token, key());
    const list = await req(base, "GET", undefined, token);
    check(`${who} cannot create or list AI jobs (403)`, denied.status === 403 && list.status === 403, [denied.data, list.data]);
  }
  check("exactly one job exists for the class", (await db.aiJob.count({ where: { classId: classA.id } })) === 1);

  // ---------- run, flags and decisions ----------
  const done = await waitForJob(classA.id, jobId, owner.token);
  check("the job succeeds with 10 validated items", done.data.status === "SUCCEEDED" && done.data.items?.length === 10, { status: done.data.status, failureCode: done.data.failureCode });
  check("validation flags are visible on the items", done.data.items.some((item) => item.flags.length > 0), done.data.items.map((i) => i.flags));
  const usage = await db.aiJob.findUnique({ where: { id: jobId }, select: { inputTokens: true, outputTokens: true, attemptCount: true, provider: true, model: true } });
  check("token usage is recorded on the job", usage.inputTokens > 0 && usage.outputTokens > 0, usage);
  const items = done.data.items;
  for (const item of items.slice(0, 8)) {
    const decided = await req(`${base}/${jobId}/items/${item.id}/decisions`, "POST", { decision: "ACCEPTED" }, owner.token);
    assert.equal(decided.status, 200, JSON.stringify(decided.data));
  }
  const editedPayload = { ...items[8].payload, prompt: "Dụng cụ nào dùng để đo cường độ dòng điện trong mạch?", options: ["Vôn kế", "Nhiệt kế", "Ampe kế", "Lực kế"], correctOption: 2 };
  const edited = await req(`${base}/${jobId}/items/${items[8].id}/decisions`, "POST", { decision: "EDITED", editedPayload }, owner.token);
  check("the owner edits one item", edited.status === 200 && edited.data.items[8].decision?.decision === "EDITED", edited.data);
  const rejected = await req(`${base}/${jobId}/items/${items[9].id}/decisions`, "POST", { decision: "REJECTED", reasonCode: "OFF_TOPIC" }, owner.token);
  check("the owner rejects one item", rejected.status === 200 && rejected.data.items[9].decision?.decision === "REJECTED", rejected.data);
  const outsiderDecide = await req(`${base}/${jobId}/items/${items[0].id}/decisions`, "POST", { decision: "REJECTED", reasonCode: "OFF_TOPIC" }, outsider.token);
  const studentDecide = await req(`${base}/${jobId}/items/${items[0].id}/decisions`, "POST", { decision: "REJECTED", reasonCode: "OFF_TOPIC" }, student.token);
  check("the outsider (403 CLASS_ACCESS_DENIED) and a student (403) cannot decide", code(outsiderDecide, 403, "CLASS_ACCESS_DENIED") && studentDecide.status === 403);

  // ---------- materialize ----------
  const materializeKey = key();
  const draft = await req(`${base}/${jobId}/materialize`, "POST", { title: `${prefix} AI test` }, owner.token, materializeKey);
  check("materialize creates one TEST DRAFT with 9 questions", draft.status === 201 && draft.data.status === "DRAFT" && draft.data.kind === "TEST" && draft.data.content.questions.length === 9, draft.data);
  const resourceId = draft.data.id;
  check("the edited key reaches the resource", draft.data.content.questions[8].correctOption === 2 && draft.data.content.questions[8].prompt === editedPayload.prompt);
  const materializeReplay = await req(`${base}/${jobId}/materialize`, "POST", { title: `${prefix} AI test` }, owner.token, materializeKey);
  check("the same materialize key replays the same draft", materializeReplay.data?.id === resourceId, materializeReplay.data);
  const materializeAgain = await req(`${base}/${jobId}/materialize`, "POST", { title: `${prefix} again` }, owner.token, key());
  check("a second materialization is 409", code(materializeAgain, 409, "AI_JOB_ALREADY_MATERIALIZED"), materializeAgain.data);
  const studentBefore = await req(`/classes/${classA.id}/resources`, "GET", undefined, student.token);
  check("the student does not see the DRAFT", studentBefore.status === 200 && !studentBefore.data.some((r) => r.id === resourceId), studentBefore.data);

  // ---------- existing publish, revise, assign ----------
  const due = new Date(Date.now() + 2 * 24 * 3600_000).toISOString();
  const assignDraft = await req(`/classes/${classA.id}/assignments`, "POST", { contentType: "test", contentId: resourceId, dueDate: due }, owner.token, key());
  check("a DRAFT cannot be assigned", code(assignDraft, 400, "CONTENT_NOT_PUBLISHED"), assignDraft.data);
  const published = await req(`/classes/${classA.id}/resources/${resourceId}/publish`, "POST", undefined, owner.token);
  check("the existing publish route publishes the draft", [200, 201].includes(published.status) && published.data.status === "PUBLISHED", published.data);
  const revised = await req(`/classes/${classA.id}/resources/${resourceId}/revise`, "POST", undefined, owner.token);
  check("revise creates version 2 as a DRAFT", [200, 201].includes(revised.status) && revised.data.status === "DRAFT" && revised.data.version === 2, revised.data);
  const assigned = await req(`/classes/${classA.id}/assignments`, "POST", { contentType: "test", contentId: resourceId, dueDate: due }, owner.token, key());
  check("the published test is assigned to the class", assigned.status === 201 && assigned.data.recipientCount === 1, assigned.data);
  const assignmentId = assigned.data.assignment.id;

  // ---------- student takes the test; server scoring unchanged ----------
  const studentView = await req(`/assignments/${assignmentId}`, "GET", undefined, student.token);
  check("the student sees 9 questions without keys or AI data", studentView.status === 200 && studentView.data.content.questionCount === 9 && leaks(studentView.data).length === 0, leaks(studentView.data));
  const resource = await db.classResource.findUnique({ where: { id: resourceId }, select: { content: true } });
  const questions = resource.content.questions;
  const answers = questions.map((q, i) => ({ questionId: q.id, optionId: q.options[i === 0 ? (q.correctOption + 1) % q.options.length : q.correctOption].id }));
  const submitKey = key();
  const submitted = await req(`/assignments/${assignmentId}/submissions`, "POST", { answers }, student.token, submitKey);
  check("the server scores the submission (8 of 9)", submitted.status === 201 && submitted.data.submission.correctCount === 8 && submitted.data.submission.score === Math.round((8 / 9) * 100), submitted.data);
  const resubmit = await req(`/assignments/${assignmentId}/submissions`, "POST", { answers }, student.token, submitKey);
  check("the same submission key replays", resubmit.data?.submission?.id === submitted.data.submission.id, resubmit.data);
  const outsideView = await req(`/assignments/${assignmentId}`, "GET", undefined, outsideStudent.token);
  check("an outside student cannot open the assignment", outsideView.status === 404, outsideView.data);
  const parentAi = await req(`/classes/${classA.id}/ai-jobs/${jobId}`, "GET", undefined, parent.token);
  check("the parent cannot read the AI job", parentAi.status === 403, parentAi.data);

  // ---------- audit reconciliation and token usage for TAI-05 ----------
  const audits = await db.auditLog.findMany({ where: { actorId: { in: [owner.id, student.id] }, outcome: "success" }, orderBy: { createdAt: "asc" }, select: { action: true } });
  const actions = audits.map((a) => a.action);
  for (const action of ["ai_job.create", "ai_job.materialize", "class_resource.publish", "class_resource.revise", "assignment.create", "assignment.submit"])
    check(`audit has ${action} once`, actions.filter((a) => a === action).length === 1, actions);
  check("audit has 10 ai_item.decide rows", actions.filter((a) => a === "ai_item.decide").length === 10, actions);
  const job = await db.aiJob.findUnique({ where: { id: jobId }, select: { inputTokens: true, outputTokens: true, attemptCount: true, provider: true, model: true, materializedResourceId: true } });
  check("the job links the materialized resource", job.materializedResourceId === resourceId, job);
  console.log(`\nToken usage (provider ${job.provider}, model ${job.model}, attempts ${job.attemptCount}): input ${job.inputTokens}, output ${job.outputTokens}.`);
  console.log("Fake-provider counts are characters / 4, not measured provider usage.");
  console.log(`\nTAI-01 journey: ${passed} checks passed`);
} finally {
  const resources = await db.classResource.findMany({ where: { classId: { in: classIds } }, select: { id: true } });
  const jobs = await db.aiJob.findMany({ where: { classId: { in: classIds } }, select: { id: true } });
  // ai_job.complete is written by the runner without an actor; remove it by target.
  await db.auditLog.deleteMany({ where: { targetType: "AiJob", targetId: { in: jobs.map((j) => j.id) } } });
  await db.aiJob.deleteMany({ where: { classId: { in: classIds } } });
  await db.questionFingerprint.deleteMany({ where: { classId: { in: classIds } } });
  await db.notification.deleteMany({ where: { recipientId: { in: createdUsers } } });
  await db.assignment.deleteMany({ where: { classId: { in: classIds } } });
  await db.classResource.deleteMany({ where: { id: { in: resources.map((r) => r.id) } } });
  await db.parentLink.deleteMany({ where: { parentId: { in: createdUsers } } });
  await db.enrollment.deleteMany({ where: { classId: { in: classIds } } });
  await db.classroom.deleteMany({ where: { id: { in: classIds } } });
  await db.idempotencyRecord.deleteMany({ where: { actorId: { in: createdUsers } } });
  await db.auditLog.deleteMany({ where: { actorId: { in: createdUsers } } });
  await db.session.deleteMany({ where: { userId: { in: createdUsers } } });
  await db.user.deleteMany({ where: { id: { in: createdUsers } } });
  await db.$disconnect();
}
