// TAI-06 real-dependency proof (TAI6-T3, T5): the SPEC success-signal journey against the running API and its database:
// request proposals for a draft private lesson, engine-verified review, reject, apply (key required, replay, second
// apply 409), the existing publish and assign path, a student attempt evaluated by the server with the applied
// parameters, plus the denials (outsider, student, parent, not-owned/shared/published lessons) and cancel.
//
// WRITTEN, NOT RUN: no isolated loopback database exists on the machine where it was written. Run it only against an
// isolated local PostgreSQL that has the TAI-06 migration (20261109170000_tai06_lab_challenge_job) applied and the
// seed loaded (it needs the seeded subject and the published `circuit` lab). The npm script is guarded by
// assert-isolated-db, and this file refuses a non-loopback database. The API under test must run with the fake provider:
//   AI_PROVIDER=fake AI_RUNNER_ENABLED=true AI_PROVIDER_MIN_INTERVAL_MS=0 AI_LAB_CHALLENGE_DAILY_LIMIT=100 AI_LAB_CHALLENGE_CONCURRENT_LIMIT=20
//   NEXALAB_ISOLATED_DATABASE_URL=... DATABASE_URL=... DIRECT_URL=...  (same loopback database)
//   TEST_API=http://127.0.0.1:4100/api npm run test:tai06
// Every fixture uses a unique prefix and is removed afterwards.
import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import * as argon from "argon2";
import { stableStringify } from "../src/common/idempotency.ts";

const loopback = (value) => {
  try {
    const url = new URL(value);
    return ["localhost", "127.0.0.1", "::1", "[::1]"].includes(url.hostname.toLowerCase()) ? `${url.hostname}:${url.port || "5432"}${url.pathname}` : null;
  } catch {
    return null;
  }
};
const isolated = loopback(process.env.NEXALAB_ISOLATED_DATABASE_URL ?? "");
if (!isolated || loopback(process.env.DATABASE_URL ?? "") !== isolated) {
  console.error("tai06-integration: refusing to run: DATABASE_URL must equal an isolated loopback NEXALAB_ISOLATED_DATABASE_URL.");
  process.exit(1);
}

const db = new PrismaClient();
const origin = process.env.TEST_API ?? "http://127.0.0.1:4100/api";
const prefix = "tai06-" + Date.now().toString(36);
const password = "Tai06-Journey-Password-2026!";
const createdUsers = [];
const classIds = [];
const lessonIds = [];
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
  assert.ok(condition, name + (detail === undefined ? "" : " - " + JSON.stringify(detail)));
  passed++;
  console.log("PASS " + name);
}
const code = (res, status, value) => res.status === status && res.data?.code === value;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function user(label, role, extra = {}) {
  const row = await db.user.create({
    data: {
      ...(role === "STUDENT" ? { username: `${prefix}-${label}` } : { email: `${prefix}-${label}@example.test` }),
      fullName: `TAI06 ${label}`, role, passwordHash: await argon.hash(password), consentAt: new Date(), ...extra,
    },
  });
  createdUsers.push(row.id);
  const signIn = () => (role === "STUDENT" ? req("/auth/student/login", "POST", { username: row.username, password }) : req("/auth/login", "POST", { email: row.email, password }));
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
  for (let i = 0; i < 40; i++) {
    const res = await req(`/classes/${classId}/ai-jobs/${jobId}`, "GET", undefined, token);
    if (["SUCCEEDED", "FAILED", "CANCELLED"].includes(res.data?.status)) return res.data;
    await sleep(1000);
  }
  throw new Error(`job ${jobId} did not finish in 40 s (is the runner enabled with AI_PROVIDER=fake?)`);
}

async function lesson(authorId, patch = {}) {
  const subject = await db.subject.findFirst({ select: { id: true } });
  assert.ok(subject, "the seed has at least one subject");
  const row = await db.lesson.create({
    data: {
      subjectId: subject.id, authorId, title: `${prefix} mạch điện`, chapter: "Điện", grade: 8, topic: "Dòng điện",
      learningObjective: "Mô tả mạch điện đơn giản", prerequisites: "Không", curriculum: "KHTN 8",
      content: "<p>Dòng điện là dòng các hạt mang điện dịch chuyển có hướng.</p><p>LED sáng khi dòng điện đủ lớn nhưng không vượt giới hạn.</p>",
      status: "draft", scope: "TEACHER_PRIVATE", outcomeCodes: [], ...patch,
    },
  });
  lessonIds.push(row.id);
  return row;
}

try {
  const circuitLab = await db.lab.findUnique({ where: { id: "circuit" }, select: { status: true } });
  assert.ok(circuitLab?.status === "published", "the seeded circuit lab is published");
  const owner = await user("owner", "TEACHER");
  const outsider = await user("outsider-teacher", "TEACHER");
  const student = await user("student", "STUDENT");
  const parent = await user("parent", "PARENT", { emailVerifiedAt: new Date() });
  const classA = await db.classroom.create({ data: { teacherId: owner.id, name: `${prefix} pilot A`, grade: 8 } });
  const classB = await db.classroom.create({ data: { teacherId: outsider.id, name: `${prefix} pilot B`, grade: 8 } });
  classIds.push(classA.id, classB.id);
  await db.enrollment.create({ data: { classId: classA.id, studentId: student.id, status: "approved", approved: true } });
  await db.parentLink.create({ data: { parentId: parent.id, studentId: student.id, status: "approved" } });
  const draft = await lesson(owner.id);
  const published = await lesson(owner.id, { status: "published", publishedAt: new Date() });
  const others = await lesson(outsider.id);
  const base = `/classes/${classA.id}/ai-jobs`;
  const body = { purpose: "DRAFT_LAB_CHALLENGE", lessonId: draft.id, proposalCount: 3 };

  // ---------- create, replay and denials ----------
  const createKey = key();
  const created = await req(base, "POST", body, owner.token, createKey);
  check("the owner creates a PENDING lab-challenge job (202)", created.status === 202 && created.data.status === "PENDING" && created.data.purpose === "DRAFT_LAB_CHALLENGE" && created.data.targetKind === null, created.data);
  const jobId = created.data.id;
  const pinned = await db.aiJob.findUnique({ where: { id: jobId }, select: { provider: true } });
  if (pinned?.provider !== "fake") {
    await req(`${base}/${jobId}/cancel`, "POST", undefined, owner.token);
    throw new Error(`the API is configured with provider ${pinned?.provider}; this journey only runs with AI_PROVIDER=fake (job cancelled)`);
  }
  const replay = await req(base, "POST", body, owner.token, createKey);
  check("the same key and body replay the same job", replay.status === 202 && replay.data.id === jobId, replay.data);
  const reused = await req(base, "POST", { ...body, proposalCount: 2 }, owner.token, createKey);
  check("the same key with another body is 409", code(reused, 409, "IDEMPOTENCY_KEY_REUSED"), reused.data);
  const outsiderCreate = await req(base, "POST", body, outsider.token, key());
  check("the outsider teacher gets 403 CLASS_ACCESS_DENIED", code(outsiderCreate, 403, "CLASS_ACCESS_DENIED"), outsiderCreate.data);
  for (const [who, token] of [["student", student.token], ["parent", parent.token]]) {
    const denied = await req(base, "POST", body, token, key());
    const read = await req(`${base}/${jobId}`, "GET", undefined, token);
    check(`${who} cannot create or read lab-challenge jobs (403)`, denied.status === 403 && read.status === 403, [denied.data, read.data]);
  }
  const notOwned = await req(base, "POST", { ...body, lessonId: others.id }, owner.token, key());
  check("another teacher's private lesson is 400 LESSON_NOT_AVAILABLE", code(notOwned, 400, "LESSON_NOT_AVAILABLE"), notOwned.data);
  const shared = await req(base, "POST", { ...body, lessonId: "lesson-circuit" }, owner.token, key());
  check("a shared-library lesson is 409 LESSON_NOT_EDITABLE", code(shared, 409, "LESSON_NOT_EDITABLE"), shared.data);
  const pub = await req(base, "POST", { ...body, lessonId: published.id }, owner.token, key());
  check("a published lesson is 409 LESSON_NOT_EDITABLE", code(pub, 409, "LESSON_NOT_EDITABLE"), pub.data);
  const bad = await req(base, "POST", { ...body, proposalCount: 4 }, owner.token, key());
  check("proposalCount 4 is rejected (400)", bad.status === 400, bad.data);
  check("exactly one job exists for the class", (await db.aiJob.count({ where: { classId: classA.id } })) === 1);

  // ---------- run, engine evidence, reject ----------
  const done = await waitForJob(classA.id, jobId, owner.token);
  check("the job succeeds with engine-verified proposals", done.status === "SUCCEEDED" && done.proposals?.length >= 1, { status: done.status, failureCode: done.failureCode });
  for (const p of done.proposals) {
    check(`proposal ${p.position} has a passing and a failing reference state and a deterministic objective`, p.engineResults.some((r) => r.verdict === "passed") && p.engineResults.some((r) => r.verdict !== "passed") && typeof p.objectivePreview === "string", p);
  }
  const circuit = done.proposals.find((p) => p.proposal.labId === "circuit");
  assert.ok(circuit, "the fake provider proposes a circuit challenge first");
  const other = done.proposals.find((p) => p !== circuit);
  const rejected = await req(`${base}/${jobId}/items/${other.id}/decisions`, "POST", { decision: "REJECTED", reasonCode: "NOT_RELEVANT" }, owner.token);
  check("the owner rejects one proposal", rejected.status === 200 && rejected.data.proposals.find((p) => p.id === other.id).decision?.decision === "REJECTED", rejected.data);
  const accepted = await req(`${base}/${jobId}/items/${circuit.id}/decisions`, "POST", { decision: "ACCEPTED" }, owner.token);
  check("ACCEPTED is not a decision on this route (400)", accepted.status === 400, accepted.data);
  const outsiderApply = await req(`${base}/${jobId}/items/${circuit.id}/apply`, "POST", undefined, outsider.token, key());
  const studentApply = await req(`${base}/${jobId}/items/${circuit.id}/apply`, "POST", undefined, student.token, key());
  check("the outsider (403 CLASS_ACCESS_DENIED) and a student (403) cannot apply", code(outsiderApply, 403, "CLASS_ACCESS_DENIED") && studentApply.status === 403);

  // ---------- apply ----------
  const noKey = await req(`${base}/${jobId}/items/${circuit.id}/apply`, "POST", undefined, owner.token);
  check("apply needs an Idempotency-Key (400)", code(noKey, 400, "IDEMPOTENCY_KEY_REQUIRED"), noKey.data);
  const applyKey = key();
  const applied = await req(`${base}/${jobId}/items/${circuit.id}/apply`, "POST", undefined, owner.token, applyKey);
  check("apply sets the lesson's lab and parameters", applied.status === 200 && applied.data.lesson.labId === "circuit" && stableStringify(applied.data.lesson.challengeParams) === stableStringify(circuit.proposal.challengeParams) && applied.data.objectivePreview === circuit.objectivePreview, applied.data);
  const replayed = await req(`${base}/${jobId}/items/${circuit.id}/apply`, "POST", undefined, owner.token, applyKey);
  check("the same apply key replays", replayed.status === 200 && stableStringify(replayed.data) === stableStringify(applied.data), replayed.data);
  const second = await req(`${base}/${jobId}/items/${circuit.id}/apply`, "POST", undefined, owner.token, key());
  check("a second apply is 409 AI_JOB_ALREADY_APPLIED", code(second, 409, "AI_JOB_ALREADY_APPLIED"), second.data);
  const row = await db.lesson.findUnique({ where: { id: draft.id }, select: { labId: true, challengeParams: true, status: true } });
  check("the database lesson carries the applied variant and is still a draft", row.labId === "circuit" && row.status === "draft" && stableStringify(row.challengeParams) === stableStringify(circuit.proposal.challengeParams), row);
  check("the AI module wrote no Challenge row (a draft has none)", (await db.challenge.count({ where: { id: { startsWith: `circuit_v-${draft.id}` } } })) === 0);
  const job = await db.aiJob.findUnique({ where: { id: jobId }, select: { appliedLessonId: true, appliedItemId: true } });
  check("the job records the single apply", job.appliedLessonId === draft.id && job.appliedItemId === circuit.id, job);

  // ---------- existing preview, publish, assign; student attempt evaluated by the server ----------
  const preview = await req(`/teacher/content/${draft.id}/preview`, "GET", undefined, owner.token);
  check("the existing teacher preview shows the deterministic objective", preview.status === 200 && JSON.stringify(preview.data).includes(applied.data.objectivePreview), preview.data);
  const lessonBody = await db.lesson.findUnique({ where: { id: draft.id } });
  const publish = await req(`/lessons/${draft.id}`, "PUT", {
    title: lessonBody.title, subjectId: lessonBody.subjectId, chapter: lessonBody.chapter, grade: lessonBody.grade, topic: lessonBody.topic,
    learningObjective: lessonBody.learningObjective, prerequisites: lessonBody.prerequisites, curriculum: lessonBody.curriculum, content: lessonBody.content,
    labId: "circuit", challengeParams: row.challengeParams, status: "published", materials: [], questions: [], outcomeCodes: [],
    review: { sources: "Tự biên soạn", license: "ORIGINAL", outcome: "Mô tả mạch điện đơn giản", answerKeyChecked: true, safetyChecked: true, accessibilityChecked: true },
  }, owner.token);
  check("the existing lesson route publishes the variant", publish.status === 200 && publish.data.status === "published", publish.data);
  const challenge = await db.challenge.findUnique({ where: { id: `circuit_v-${draft.id}` } });
  check("publish wrote the variant Challenge with the deterministic objective", challenge?.objective === applied.data.objectivePreview && stableStringify(challenge.constraints.params) === stableStringify(circuit.proposal.challengeParams), challenge);
  const due = new Date(Date.now() + 2 * 24 * 3600_000).toISOString();
  const assigned = await req(`/classes/${classA.id}/assignments`, "POST", { contentType: "lesson", contentId: draft.id, dueDate: due }, owner.token, key());
  check("the lesson is assigned through the existing route", assigned.status === 201, assigned.data);
  // Fixture setup: this journey targets the applied challenge, so complete its prerequisite steps first.
  const prerequisiteSteps = await db.lessonStep.findMany({ where: { lessonId: draft.id, position: { lt: 60 } }, select: { id: true } });
  for (const step of prerequisiteSteps) await db.stepProgress.create({ data: { studentId: student.id, stepId: step.id, assignmentId: assigned.data.assignment.id, status: "COMPLETED", progressValue: 100, startedAt: new Date(), completedAt: new Date() } });
  const circuitState = { nodes: [{ id: "b", type: "battery", value: 9 }, { id: "r", type: "resistor", value: 470 }, { id: "l", type: "led" }], edges: [{ source: "b", target: "r" }, { source: "r", target: "l" }, { source: "l", target: "b" }] };
  const attempt = await req("/attempts", "POST", { challengeId: challenge.id, lessonStepId: `step-${draft.id}-challenge`, assignmentId: assigned.data.assignment?.id, labState: circuitState, durationMs: 1000, idempotencyKey: randomUUID() }, student.token);
  check("the student attempt is evaluated by the server with the applied parameters", attempt.status === 201 && (attempt.data.attempt?.verdict ?? attempt.data.verdict) === "passed", attempt.data);
  const studentView = await req(`/lessons/${draft.id}`, "GET", undefined, student.token);
  check("nothing the student reads carries the AI rationale", !JSON.stringify(studentView.data).includes(circuit.proposal.rationale), studentView.data);

  // ---------- cancel ----------
  const next = await lesson(owner.id);
  const pending = await req(base, "POST", { ...body, lessonId: next.id }, owner.token, key());
  const cancelled = await req(`${base}/${pending.data.id}/cancel`, "POST", undefined, owner.token);
  check("a PENDING or RUNNING job can be cancelled", cancelled.status === 200 && cancelled.data.status === "CANCELLED", cancelled.data);

  // ---------- audit ----------
  const audits = await db.auditLog.findMany({ where: { actorId: owner.id, outcome: "success" }, select: { action: true } });
  const actions = audits.map((a) => a.action);
  for (const action of ["ai_job.create", "ai_item.decide", "ai_proposal.apply", "lesson.update"]) check(`audit has ${action}`, actions.includes(action), actions);
  console.log(`\nTAI-06 journey: ${passed} checks passed`);
} finally {
  const jobs = await db.aiJob.findMany({ where: { classId: { in: classIds } }, select: { id: true } });
  await db.auditLog.deleteMany({ where: { targetType: "AiJob", targetId: { in: jobs.map((j) => j.id) } } });
  await db.aiJob.deleteMany({ where: { classId: { in: classIds } } });
  await db.assignment.deleteMany({ where: { classId: { in: classIds } } });
  await db.attempt.deleteMany({ where: { studentId: { in: createdUsers } } });
  await db.stepProgress.deleteMany({ where: { step: { lessonId: { in: lessonIds } } } });
  await db.lessonStep.deleteMany({ where: { lessonId: { in: lessonIds } } });
  await db.challenge.deleteMany({ where: { id: { in: lessonIds.map((id) => `circuit_v-${id}`) } } });
  await db.notification.deleteMany({ where: { recipientId: { in: createdUsers } } });
  await db.parentLink.deleteMany({ where: { parentId: { in: createdUsers } } });
  await db.enrollment.deleteMany({ where: { classId: { in: classIds } } });
  await db.classroom.deleteMany({ where: { id: { in: classIds } } });
  await db.idempotencyRecord.deleteMany({ where: { actorId: { in: createdUsers } } });
  await db.auditLog.deleteMany({ where: { actorId: { in: createdUsers } } });
  await db.lesson.deleteMany({ where: { id: { in: lessonIds } } });
  await db.session.deleteMany({ where: { userId: { in: createdUsers } } });
  await db.user.deleteMany({ where: { id: { in: createdUsers } } });
  await db.$disconnect();
}
