// B1 real-dependency journey (B1-T6, B0P-T3): an isolated owner teacher
// creates a class, provisions and enrolls students, a student joins by code
// and is approved, lesson and standalone-lab work is assigned, and every
// access boundary (outsider teacher, pending, removed, archived) is checked
// against the running API and its database. All fixtures are generated with
// a unique prefix and removed afterwards.
//   TEST_API=http://127.0.0.1:4000/api DATABASE_URL=... npm run test:b1
import "dotenv/config";
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { networkInterfaces } from "node:os";
import { PrismaClient } from "@prisma/client";
import * as argon from "argon2";
import { evidenceTier } from "./lib/harness.mjs";


/** Removes uploaded asset versions (rows and stored objects) created by this run. */
async function removeUploadedAssets(db, where) {
  const assets = await db.asset.findMany({ where, include: { versions: true } });
  let store = null;
  try {
    store = (await import("../src/modules/storage/infrastructure/storage.ts")).storage();
  } catch {
    console.log("     (run with tsx to also delete stored objects)");
  }
  for (const a of assets) for (const v of a.versions) for (const key of [v.objectKey, v.stagingKey]) if (key && store) await store.delete(key).catch(() => undefined);
  await db.assetVersion.deleteMany({ where: { assetId: { in: assets.map((a) => a.id) } } });
  await db.asset.deleteMany({ where: { id: { in: assets.map((a) => a.id) } } });
}

const db = new PrismaClient();
const origin = process.env.TEST_API ?? "http://127.0.0.1:4000/api";
const prefix = "b1-" + Date.now().toString(36);
const createdUsers = [];
const createdStudents = [];
let passed = 0;
let setupComplete = false;
const joinLocators = [];
// A non-loopback address of this machine acts as a third source IP (API started with HOST=::).
const lanIp = Object.values(networkInterfaces())
  .flat()
  .find((item) => item && item.family === "IPv4" && !item.internal)?.address;
const sourceIps = ["127.0.0.1", "::1", "::ffff:127.0.0.1", ...(lanIp ? [lanIp, "::ffff:" + lanIp] : [])];

// Secrets this run saw; none may appear in the API log (API_LOG_FILE, optional).
const secrets = [];
async function req(path, method = "GET", body, auth, headers = {}, base = origin) {
  const r = await fetch(base + path, {
    method,
    headers: {
      "content-type": "application/json",
      ...(auth ? { authorization: "Bearer " + auth } : {}),
      ...headers,
    },
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
const envelope = (res, status, code) =>
  res.status === status && res.data?.statusCode === status && res.data?.code === code && typeof res.data?.message === "string";
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
const future = (days) => new Date(Date.now() + days * 86400000).toISOString();
const review = {
  sources: "Tài liệu tự biên soạn kiểm thử B1, đối chiếu chương trình KHTN 8",
  license: "ORIGINAL",
  outcome: "KHTN8 – Điện: lắp mạch kín an toàn",
  answerKeyChecked: true,
  safetyChecked: true,
  accessibilityChecked: true,
};

async function teacher(label, role = "TEACHER") {
  const password = `B1-${label}-Password-2026!`;
  const user = await db.user.create({
    data: {
      email: `${prefix}-${label}@example.test`,
      fullName: `B1 ${label}`,
      role,
      passwordHash: await argon.hash(password),
      consentAt: new Date(),
    },
  });
  createdUsers.push(user.id);
  // C2-T4: admins sign in only through the dedicated admin route.
  const login = await req(role === "ADMIN" ? "/auth/admin/login" : "/auth/login", "POST", {
    email: user.email,
    password,
  });
  assert.equal(login.status, 201, `${label} teacher login`);
  return { id: user.id, token: login.data.accessToken };
}
async function activate(credentials) {
  let login = await req("/auth/student/login", "POST", {
    username: credentials.username,
    password: credentials.temporaryPassword,
  });
  if (login.status === 429) {
    // The API keeps a 10/minute in-memory student-login limit per IP; wait out the window.
    console.log("     waiting 61 s for the student-login rate window");
    await new Promise((resolve) => setTimeout(resolve, 61000));
    login = await req("/auth/student/login", "POST", {
      username: credentials.username,
      password: credentials.temporaryPassword,
    });
  }
  assert.equal(login.status, 201, "provisioned student login");
  const changed = await req(
    "/auth/password",
    "POST",
    {
      currentPassword: credentials.temporaryPassword,
      password: "B1-Student-Password-2026!",
    },
    login.data.accessToken,
  );
  assert.equal(changed.status, 201, "temporary password change");
  return {
    id: changed.data.user.id,
    token: changed.data.accessToken,
    username: credentials.username,
  };
}
async function provision(classId, token, label) {
  const res = await req(
    `/classes/${classId}/students`,
    "POST",
    {
      username: `${prefix}-${label}`,
      fullName: `B1 ${label}`,
      grade: 8,
      consent: true,
    },
    token,
    key(),
  );
  assert.equal(res.status, 201, `provision ${label}: ${res.data?.message}`);
  createdStudents.push(res.data.user.id);
  createdUsers.push(res.data.user.id);
  secrets.push(res.data.credentials.temporaryPassword);
  return activate(res.data.credentials);
}

try {
  const dbHost = (() => {
    try {
      return new URL(process.env.DATABASE_URL ?? "").hostname || "unknown";
    } catch {
      return "unknown";
    }
  })();
  console.log(`B1 journey — API ${origin} · database host ${dbHost} · tier ${evidenceTier()}`);
  const health = await req("/health");
  assert.equal(health.status, 200, "API health");

  // ---------- setup ----------
  const owner = await teacher("owner");
  const outsider = await teacher("outsider");
  setupComplete = true;

  // ---------- B0P-T1 error envelope ----------
  check("unauthenticated request returns the stable envelope", envelope(await req("/me/progress"), 401, "UNAUTHENTICATED"));
  const invalid = await req("/classes", "POST", {}, owner.token);
  check(
    "Zod validation returns VALIDATION_FAILED with safe details",
    envelope(invalid, 400, "VALIDATION_FAILED") && Array.isArray(invalid.data.details),
  );

  // ---------- B1-T1 class lifecycle ----------
  const createKey = key();
  const classBody = {
    name: `${prefix} Lớp 8A`,
    grade: 8,
    requiresApproval: false,
  };
  const created = await req("/classes", "POST", classBody, owner.token, createKey);
  check(
    "owner creates a class and sees the join code once",
    created.status === 201 && /^NL-[0-9A-HJKMNP-TV-Z]{6}-[0-9A-HJKMNP-TV-Z]{10}$/.test(created.data.joinCode),
    created.data,
  );
  const classId = created.data.class.id;
  let joinCode = created.data.joinCode;
  joinLocators.push(joinCode.slice(3, 9));
  secrets.push(joinCode);
  const replayed = await req("/classes", "POST", classBody, owner.token, createKey);
  check(
    "same Idempotency-Key replays the class without re-showing the code",
    replayed.status === 201 && replayed.data.class.id === classId && replayed.data.joinCode === null,
  );
  check(
    "key reuse with another payload is rejected",
    envelope(await req("/classes", "POST", { ...classBody, grade: 9 }, owner.token, createKey), 409, "IDEMPOTENCY_KEY_REUSED"),
  );
  check(
    "retry created exactly one class",
    (await db.classroom.count({
      where: { teacherId: owner.id, name: classBody.name },
    })) === 1,
  );
  check(
    "active class names are unique per teacher",
    envelope(await req("/classes", "POST", { name: ` ${classBody.name.toUpperCase()} `, grade: 8 }, owner.token), 409, "CLASS_NAME_TAKEN"),
  );
  const stored = await db.classroom.findUnique({ where: { id: classId } });
  check(
    "join secret is stored only as an HMAC",
    stored.joinSecretHash?.length === 64 && !JSON.stringify(stored).includes(joinCode.slice(10)),
  );
  const second = await req("/classes", "POST", { name: `${prefix} Lớp 8B`, grade: 8 }, owner.token, key());
  const classId2 = second.data.class.id;

  // Outsider and unknown IDs get one non-leaking denial on every class route.
  const foreign = await req(`/classes/${classId}/students`, "GET", undefined, outsider.token);
  const unknown = await req(`/classes/${prefix}-missing/students`, "GET", undefined, outsider.token);
  check(
    "outsider and unknown class IDs share one 403 body",
    envelope(foreign, 403, "CLASS_ACCESS_DENIED") && JSON.stringify(foreign.data) === JSON.stringify(unknown.data),
  );
  const outsiderRoutes = [
    ["GET", `/classes/${classId}`],
    ["PUT", `/classes/${classId}`, { name: "x" }],
    ["POST", `/classes/${classId}/archive`, { confirm: true }],
    ["POST", `/classes/${classId}/join-code/rotate`],
    [
      "POST",
      `/classes/${classId}/students`,
      {
        username: `${prefix}-intruder`,
        fullName: "x",
        grade: 8,
        consent: true,
      },
    ],
    ["POST", `/classes/${classId}/enrollments`, { username: "nobody" }],
    ["GET", `/classes/${classId}/assignments`],
    ["POST", `/classes/${classId}/assignments`, { contentType: "lab", contentId: "circuit" }],
    ["GET", `/classes/${classId}/assignable-content`],
    ["GET", `/classes/${classId}/analytics`],
  ];
  for (const [method, path, body] of outsiderRoutes)
    check(
      `outsider denied: ${method} ${path.replace(classId, ":id")}`,
      envelope(await req(path, method, body, outsider.token), 403, "CLASS_ACCESS_DENIED"),
    );
  check(
    "existing-class ownership probes are audited as denied",
    (await db.auditLog.count({
      where: {
        actorId: outsider.id,
        action: "class.access",
        outcome: "denied",
        targetId: classId,
      },
    })) >= outsiderRoutes.length,
  );

  const updated = await req(`/classes/${classId}`, "PUT", { requiresApproval: true }, owner.token);
  check("owner updates join approval policy", updated.status === 200 && updated.data.requiresApproval === true);

  // ---------- B1-T2 provisioning, enrollment ----------
  const studentA = await provision(classId, owner.token, "a");
  const studentB = await provision(classId2, owner.token, "b");
  const studentC = await provision(classId2, owner.token, "c");
  const studentD = await provision(classId2, owner.token, "d");
  const provisionKey = key();
  const provisionBody = {
    username: `${prefix}-e`,
    fullName: "B1 e",
    grade: 8,
    consent: true,
  };
  const e1 = await req(`/classes/${classId2}/students`, "POST", provisionBody, owner.token, provisionKey);
  createdUsers.push(e1.data.user.id);
  const e2 = await req(`/classes/${classId2}/students`, "POST", provisionBody, owner.token, provisionKey);
  check(
    "provision retry returns the same account without the temporary password",
    e2.status === 201 && e2.data.user.id === e1.data.user.id && e2.data.credentials === null && e1.data.credentials.temporaryPassword,
  );
  check(
    "duplicate username is a USERNAME_TAKEN conflict",
    envelope(await req(`/classes/${classId2}/students`, "POST", provisionBody, owner.token), 409, "USERNAME_TAKEN"),
  );
  check(
    "enrolling a non-student account is refused like a missing one",
    envelope(await req(`/classes/${classId}/enrollments`, "POST", { username: "admin" }, owner.token), 404, "STUDENT_NOT_FOUND"),
  );

  // ---------- B1-T3 join by code ----------
  const joinKey = key();
  const joinB = await req("/classes/join", "POST", { code: joinCode.toLowerCase() }, studentB.token, joinKey);
  check(
    "join to an approval class creates a pending request (MSG-34)",
    joinB.status === 201 && joinB.data.enrollmentStatus === "pending" && joinB.data.changed === true,
  );
  const joinBReplay = await req("/classes/join", "POST", { code: joinCode }, studentB.token, joinKey);
  check("join retry with the same key replays", joinBReplay.status === 201 && joinBReplay.data.enrollmentStatus === "pending");
  const joinBAgain = await req("/classes/join", "POST", { code: joinCode }, studentB.token);
  check(
    "joining again never duplicates the enrollment",
    joinBAgain.data.changed === false &&
      (await db.enrollment.count({
        where: { classId, studentId: studentB.id },
      })) === 1,
  );
  const pendingRoster = await req(`/classes/${classId}/students?status=pending`, "GET", undefined, owner.token);
  check(
    "teacher sees the pending join request",
    pendingRoster.data.some((e) => e.studentId === studentB.id && e.status === "pending"),
  );

  // Non-leaking failures: malformed, unknown, disabled and archived codes look identical.
  const malformed = await req("/classes/join", "POST", { code: "NEXA8A" }, studentD.token);
  const wrongSecret = await req("/classes/join", "POST", { code: joinCode.slice(0, 10) + "0000000000" }, studentD.token);
  check("invalid codes return JOIN_CODE_INVALID (MSG-32)", envelope(malformed, 404, "JOIN_CODE_INVALID"));
  check("malformed and wrong-secret codes share one body", JSON.stringify(malformed.data) === JSON.stringify(wrongSecret.data));

  // Lockout: the 10th failure locks the IP+account pair; a valid code is then refused too.
  for (let i = 0; i < 8; i++) await req("/classes/join", "POST", { code: `NL-${"ZZZZZZ"}-${String(i).padStart(10, "0")}` }, studentC.token);
  const ninth = await req("/classes/join", "POST", { code: "NL-ZZZZZZ-1111111111" }, studentC.token);
  check("9th failure is still a plain invalid code", envelope(ninth, 404, "JOIN_CODE_INVALID"));
  const tenth = await req("/classes/join", "POST", { code: "NL-ZZZZZZ-2222222222" }, studentC.token);
  check("10th failure is reported as invalid", envelope(tenth, 404, "JOIN_CODE_INVALID"));
  const lockedValid = await req("/classes/join", "POST", { code: joinCode }, studentC.token);
  check("after 10 failures the pair is locked even for a valid code (MSG-33)", envelope(lockedValid, 429, "JOIN_RATE_LIMITED"));
  check(
    "another account on the same IP is not locked by that pair",
    (await req("/classes/join", "POST", { code: "NL-ZZZZZZ-3333333333" }, studentD.token)).status === 404,
  );
  check(
    "limiter rows store digests only",
    (await db.rateLimitBucket.findMany()).every((row) => /^[0-9a-f]{64}$/.test(row.key)),
  );

  // ---------- approval and access ----------
  const approve = await req(`/classes/${classId}/students/${studentB.id}`, "PUT", { status: "approved" }, owner.token);
  check("owner approves the pending student", approve.status === 200 && approve.data.enrollment.status === "approved");

  // ---------- B1-T5 assignments ----------
  const assignBody = {
    contentType: "lesson",
    contentId: "lesson-circuit",
    dueDate: future(7),
  };
  const assignKey = key();
  const [assignA, assignB] = await Promise.all([
    req(`/classes/${classId}/assignments`, "POST", assignBody, owner.token, assignKey),
    req(`/classes/${classId}/assignments`, "POST", assignBody, owner.token, assignKey),
  ]);
  check(
    "concurrent retries create one assignment",
    assignA.status === 201 && assignB.status === 201 && assignA.data.assignment.id === assignB.data.assignment.id,
    [assignA.data, assignB.data],
  );
  const lessonAssignmentId = assignA.data.assignment.id;
  check(
    "whole-class assignment reports its recipients (MSG-31)",
    assignA.data.recipientCount === 2 && /2 học sinh/.test(assignA.data.message),
  );
  check(
    "recipient count matches persisted targets",
    (await db.assignmentTarget.count({
      where: { assignmentId: lessonAssignmentId },
    })) === 2,
  );
  check(
    "identical active assignment is a duplicate",
    envelope(await req(`/classes/${classId}/assignments`, "POST", assignBody, owner.token), 409, "ASSIGNMENT_DUPLICATE"),
  );
  check(
    "past due date is rejected (MSG-30)",
    envelope(
      await req(`/classes/${classId}/assignments`, "POST", { ...assignBody, dueDate: future(-1) }, owner.token),
      400,
      "DUE_DATE_IN_PAST",
    ),
  );
  check(
    "subset with a non-member is rejected",
    envelope(
      await req(`/classes/${classId}/assignments`, "POST", { ...assignBody, studentIds: [studentC.id] }, owner.token),
      400,
      "INVALID_TARGETS",
    ),
  );
  const draft = await req(
    "/lessons",
    "POST",
    {
      title: `${prefix} nháp`,
      subjectId: "physics",
      chapter: "Điện",
      grade: 8,
      topic: "Nháp",
      learningObjective: "x",
      prerequisites: "x",
      curriculum: "x",
      content: "<p>x</p>",
      status: "draft",
    },
    owner.token,
  );
  check(
    "draft content cannot be assigned (MSG-29)",
    envelope(
      await req(`/classes/${classId}/assignments`, "POST", { contentType: "lesson", contentId: draft.data.id }, owner.token),
      400,
      "CONTENT_NOT_PUBLISHED",
    ),
  );
  const labAssign = await req(
    `/classes/${classId}/assignments`,
    "POST",
    { contentType: "lab", contentId: "circuit", studentIds: [studentA.id] },
    owner.token,
    key(),
  );
  check(
    "standalone lab assigned to a subset without a due date",
    labAssign.status === 201 && labAssign.data.recipientCount === 1 && labAssign.data.assignment.dueDate === null,
  );
  const labAssignmentId = labAssign.data.assignment.id;

  const queueA = await req("/assignments", "GET", undefined, studentA.token);
  const queueB = await req("/assignments", "GET", undefined, studentB.token);
  check(
    "subset target sees lesson and lab work",
    queueA.data.some((a) => a.id === lessonAssignmentId) && queueA.data.some((a) => a.id === labAssignmentId),
  );
  check(
    "non-target sees only the whole-class work",
    queueB.data.some((a) => a.id === lessonAssignmentId) && !queueB.data.some((a) => a.id === labAssignmentId),
  );
  check(
    "non-member cannot open the assignment",
    envelope(await req(`/assignments/${lessonAssignmentId}`, "GET", undefined, studentC.token), 404, "ASSIGNMENT_NOT_FOUND"),
  );

  // D-B1-01: B has only the gated lesson; A also has a standalone lab assignment.
  const gated = await req("/attempts", "POST", { challengeId: "circuit_001", labState: circuit(), durationMs: 1000 }, studentB.token);
  check("without a lab assignment the lesson's A3 quiz gate still applies to direct lab work", gated.status === 404);
  const standalone = await req(
    "/attempts",
    "POST",
    {
      challengeId: "circuit_001",
      labState: circuit(),
      durationMs: 1000,
      idempotencyKey: randomUUID(),
    },
    studentA.token,
  );
  check(
    "a standalone lab assignment opens the lab despite the gated lesson (D-B1-01)",
    standalone.status === 201 && standalone.data.assignmentId === labAssignmentId && standalone.data.lessonStepId === null,
    standalone.data,
  );
  const forgedStep = (await req("/lessons/lesson-circuit/pathway", "GET", undefined, studentA.token)).data.steps.find(
    (s) => s.type === "LAB" || s.type === "CHALLENGE",
  );
  check(
    "the standalone attempt cannot target the gated lesson step",
    (
      await req(
        "/attempts",
        "POST",
        {
          challengeId: "circuit_001",
          lessonStepId: forgedStep.id,
          labState: circuit(),
          durationMs: 1000,
        },
        studentA.token,
      )
    ).status === 403,
  );
  const pathAfterStandalone = await req("/lessons/lesson-circuit/pathway", "GET", undefined, studentA.token);
  const labStepA = pathAfterStandalone.data.steps.find((s) => s.id === forgedStep.id);
  check(
    "the standalone attempt never completes the lesson lab step",
    labStepA.state === "LOCKED" && !pathAfterStandalone.data.steps.some((s) => s.state === "COMPLETED" && s.id === labStepA.id),
    labStepA,
  );

  // Later enrollment is not added to an existing snapshot.
  const enrollD = await req(`/classes/${classId}/enrollments`, "POST", { username: studentD.username }, owner.token, key());
  check("owner enrolls an existing student account", enrollD.status === 201 && enrollD.data.enrollment.status === "approved");
  check(
    "a later member is not added to an earlier assignment",
    !(await req("/assignments", "GET", undefined, studentD.token)).data.some((a) => a.id === lessonAssignmentId),
  );

  // D3: D has no gated lesson, so a direct attempt counts toward the lab assignment.
  const labBodyD = {
    contentType: "lab",
    contentId: "circuit",
    studentIds: [studentD.id],
    dueDate: future(3),
  };
  const labAssignD = await req(`/classes/${classId}/assignments`, "POST", labBodyD, owner.token, key());
  const labAssignmentD = labAssignD.data.assignment.id;
  const labAttempt = await req(
    "/attempts",
    "POST",
    {
      challengeId: "circuit_001",
      labState: circuit(),
      durationMs: 1000,
      idempotencyKey: randomUUID(),
    },
    studentD.token,
  );
  check(
    "standalone lab attempt carries the lab assignment identity",
    labAttempt.status === 201 && labAttempt.data.assignmentId === labAssignmentD,
    labAttempt.data,
  );
  const progressD = await req("/me/progress", "GET", undefined, studentD.token);
  const labItem = progressD.data.assignments.find((a) => a.assignmentId === labAssignmentD);
  check(
    "/me/progress counts the passed standalone lab assignment (D3)",
    labItem?.kind === "LAB" && labItem.completed === true && labItem.practical?.latest.attemptId === labAttempt.data.id,
  );

  // ---------- B1-T6 outsider and role denial on member/assignment routes ----------
  const memberRoutes = [
    ["GET", `/classes/${classId}/students`],
    ["PUT", `/classes/${classId}/students/${studentA.id}`, { status: "removed", confirm: true }],
    ["DELETE", `/classes/${classId}/students/${studentA.id}?confirm=true`],
    ["POST", `/classes/${classId}/students/${studentA.id}/reset-password`],
    ["PUT", `/classes/${classId}/assignments/${lessonAssignmentId}`, { title: "x" }],
    ["POST", `/classes/${classId}/assignments/${lessonAssignmentId}/archive`, { confirm: true }],
  ];
  for (const [method, path, body] of memberRoutes)
    check(
      `outsider denied: ${method} ${path.replace(classId, ":id").replace(studentA.id, ":sid").replace(lessonAssignmentId, ":aid")}`,
      envelope(await req(path, method, body, outsider.token), 403, "CLASS_ACCESS_DENIED"),
    );
  check(
    "outsider changed no membership or assignment",
    (
      await db.enrollment.findUnique({
        where: { classId_studentId: { classId, studentId: studentA.id } },
      })
    ).status === "approved" && (await db.assignment.findUnique({ where: { id: lessonAssignmentId } })).status === "ACTIVE",
  );
  const studentRoutes = [
    ["GET", `/classes/${classId}/students`],
    ["POST", "/classes", { name: "x", grade: 8 }],
    ["POST", `/classes/${classId}/assignments`, { contentType: "lab", contentId: "circuit" }],
    ["POST", "/lessons/lesson-circuit/clone"],
    ["GET", "/teacher/content"],
  ];
  for (const [method, path, body] of studentRoutes)
    check(
      `student role denied: ${method} ${path.replace(classId, ":id")}`,
      envelope(await req(path, method, body, studentA.token), 403, "FORBIDDEN"),
    );
  check(
    "teachers cannot provision through the admin user API",
    envelope(
      await req(
        "/admin/users",
        "POST",
        {
          username: `${prefix}-legacy`,
          password: "Legacy-Password-2026!",
          fullName: "x",
          role: "STUDENT",
          grade: 8,
          consent: true,
          classId,
        },
        owner.token,
      ),
      403,
      "FORBIDDEN",
    ),
  );

  // ---------- removal keeps evidence and closes access ----------
  const pathwayB = await req("/lessons/lesson-circuit/pathway", "GET", undefined, studentB.token);
  const readingStep = pathwayB.data.steps.find((s) => s.type === "READING");
  await req(`/lessons/lesson-circuit/steps/${readingStep.id}/progress`, "PUT", { action: "complete" }, studentB.token);
  const evidenceBefore = await db.stepProgress.count({
    where: { studentId: studentB.id },
  });
  check(
    "removal requires confirmation (MSG-41)",
    envelope(await req(`/classes/${classId}/students/${studentB.id}`, "DELETE", undefined, owner.token), 400, "CONFIRMATION_REQUIRED"),
  );
  const removed = await req(`/classes/${classId}/students/${studentB.id}?confirm=true`, "DELETE", undefined, owner.token);
  check("owner removes the member (soft)", removed.status === 200 && removed.data.enrollment.status === "removed");
  check(
    "removed student loses the class assignments immediately",
    !(await req("/assignments", "GET", undefined, studentB.token)).data.some((a) => a.id === lessonAssignmentId),
  );
  check(
    "removed student cannot open the pathway",
    (await req("/lessons/lesson-circuit/pathway", "GET", undefined, studentB.token)).status === 404,
  );
  check(
    "removed student's evidence is preserved",
    (await db.stepProgress.count({ where: { studentId: studentB.id } })) === evidenceBefore && evidenceBefore > 0,
  );
  // B is also an approved member of the owner's second class; remove it there too
  // so the read below depends only on removed memberships.
  await req(`/classes/${classId2}/students/${studentB.id}?confirm=true`, "DELETE", undefined, owner.token);
  check(
    "teacher can no longer read the removed student's evidence",
    envelope(await req(`/progress/${studentB.id}`, "GET", undefined, owner.token), 403, "FORBIDDEN"),
  );
  const rejoin = await req("/classes/join", "POST", { code: joinCode }, studentB.token, key());
  check(
    "rejoin reuses the enrollment and returns to pending (Q-B1-01)",
    rejoin.data.enrollmentStatus === "pending" &&
      (await db.enrollment.count({
        where: { classId, studentId: studentB.id },
      })) === 1,
  );

  // ---------- join code rotation ----------
  const rotated = await req(`/classes/${classId}/join-code/rotate`, "POST", undefined, owner.token);
  secrets.push(rotated.data.joinCode);
  check("rotation issues a new code", rotated.status === 201 && rotated.data.joinCode !== joinCode);
  const oldCode = await req("/classes/join", "POST", { code: joinCode }, studentD.token);
  check("the rotated-out code fails like any invalid code", JSON.stringify(oldCode.data) === JSON.stringify(malformed.data));
  joinCode = rotated.data.joinCode;
  await req(`/classes/${classId}`, "PUT", { joinCodeEnabled: false }, owner.token);
  const disabled = await req("/classes/join", "POST", { code: joinCode }, studentD.token);
  check("a disabled code fails like any invalid code", JSON.stringify(disabled.data) === JSON.stringify(malformed.data));
  await req(`/classes/${classId}`, "PUT", { joinCodeEnabled: true }, owner.token);

  // ---------- assignment update and archive ----------
  const retarget = await req(
    `/classes/${classId}/assignments/${labAssignmentId}`,
    "PUT",
    { studentIds: [studentA.id, studentD.id] },
    owner.token,
  );
  check(
    "target change takes effect immediately",
    retarget.status === 200 &&
      retarget.data.recipientCount === 2 &&
      (await req("/assignments", "GET", undefined, studentD.token)).data.some((a) => a.id === labAssignmentId),
  );
  check(
    "archiving an assignment requires confirmation",
    (await req(`/classes/${classId}/assignments/${labAssignmentD}/archive`, "POST", {}, owner.token)).status === 400,
  );
  const archivedAssignment = await req(
    `/classes/${classId}/assignments/${labAssignmentD}/archive`,
    "POST",
    { confirm: true, reason: "kết thúc" },
    owner.token,
  );
  check(
    "archived assignment leaves the queue",
    archivedAssignment.status === 201 &&
      !(await req("/assignments", "GET", undefined, studentD.token)).data.some((a) => a.id === labAssignmentD),
  );
  check("archived assignment keeps its evidence", (await db.attempt.count({ where: { assignmentId: labAssignmentD } })) === 1);
  const reassign = await req(`/classes/${classId}/assignments`, "POST", labBodyD, owner.token);
  check("the same work can be assigned again after archive", reassign.status === 201);

  // ---------- B1-T4 content library and private variants ----------
  const library = await req("/teacher/content?grade=8", "GET", undefined, owner.token);
  const baseline = library.data.items.find((item) => item.id === "lesson-circuit");
  check(
    "library lists the shared baseline as synthetic, not released",
    baseline?.scope === "SHARED_LIBRARY" && baseline.synthetic === true && baseline.editable === false,
  );
  const releasedOutcomes = await db.curriculumOutcome.count({ where: { synthetic: false, grade: { in: [8, 9] } } });
  check(
    "released coverage has no denominator without a released outcome map",
    releasedOutcomes > 0 || library.data.coverage.every((row) => row.releasedBaseline === null),
  );
  const baselineBefore = await db.lesson.findUnique({
    where: { id: "lesson-circuit" },
    include: { steps: true },
  });
  const baselineEdit = await req(
    "/lessons/lesson-circuit",
    "PUT",
    {
      title: "x",
      subjectId: "physics",
      chapter: "x",
      grade: 8,
      topic: "x",
      learningObjective: "x",
      prerequisites: "x",
      curriculum: "x",
      content: "<p>x</p>",
      status: "published",
    },
    owner.token,
  );
  check(
    "teacher cannot edit shared baseline content",
    baselineEdit.status === 403 && ["LESSON_ACCESS_DENIED", "BASELINE_READ_ONLY"].includes(baselineEdit.data.code),
  );
  const clone = await req("/lessons/lesson-circuit/clone", "POST", undefined, owner.token, key());
  check(
    "clone creates a private draft linked to its source",
    clone.status === 201 &&
      clone.data.id !== "lesson-circuit" &&
      clone.data.clonedFromId === "lesson-circuit" &&
      clone.data.status === "draft" &&
      clone.data.scope === "TEACHER_PRIVATE",
  );
  const cloneId = clone.data.id;
  const editable = {
    title: clone.data.title,
    subjectId: clone.data.subjectId,
    chapter: clone.data.chapter,
    grade: clone.data.grade,
    topic: clone.data.topic,
    learningObjective: clone.data.learningObjective,
    prerequisites: clone.data.prerequisites,
    curriculum: clone.data.curriculum,
    content: clone.data.content + "<p>Ghi chú riêng của lớp.</p>",
    labId: clone.data.labId,
    materials: clone.data.materials,
    questions: [
      ...clone.data.questions,
      {
        prompt: `${prefix}: Điện trở lớn hơn thì dòng điện?`,
        options: ["Nhỏ hơn", "Lớn hơn"],
        answer: 0,
      },
    ],
  };
  const blocked = await req(`/lessons/${cloneId}`, "PUT", { ...editable, status: "published" }, owner.token);
  check(
    "publish without the self-review checklist is blocked (MSG-28)",
    envelope(blocked, 400, "PUBLISH_BLOCKED") && blocked.data.details.missing.length > 0,
  );
  check(
    "outsider cannot edit another teacher's draft",
    envelope(await req(`/lessons/${cloneId}`, "PUT", { ...editable, status: "draft" }, outsider.token), 403, "LESSON_ACCESS_DENIED"),
  );
  const published = await req(`/lessons/${cloneId}`, "PUT", { ...editable, status: "published", review }, owner.token);
  check("self-reviewed private variant publishes", published.status === 200 && published.data.status === "published");
  const [cloneSteps, sourceQuiz] = await Promise.all([
    db.lessonStep.findMany({ where: { lessonId: cloneId } }),
    db.lessonStep.findFirst({
      where: { lessonId: "lesson-circuit", type: "QUIZ" },
    }),
  ]);
  const cloneQuiz = cloneSteps.find((s) => s.type === "QUIZ");
  check("clone has new step IDs", cloneSteps.length > 0 && cloneSteps.every((s) => !baselineBefore.steps.some((b) => b.id === s.id)));
  check(
    "clone has new question IDs",
    cloneQuiz.config.questions.every((q) => !sourceQuiz.config.questions.some((sq) => sq.id === q.id)),
  );
  const baselineAfter = await db.lesson.findUnique({
    where: { id: "lesson-circuit" },
    include: { steps: true },
  });
  check(
    "customizing the variant left the baseline unchanged",
    JSON.stringify([baselineBefore.content, baselineBefore.questions, baselineBefore.steps]) ===
      JSON.stringify([baselineAfter.content, baselineAfter.questions, baselineAfter.steps]),
  );
  check(
    "outsider cannot see or assign the private variant",
    envelope(
      await req(
        `/classes/${(await req("/classes", "POST", { name: `${prefix} outsider`, grade: 8 }, outsider.token)).data.class.id}/assignments`,
        "POST",
        { contentType: "lesson", contentId: cloneId },
        outsider.token,
      ),
      400,
      "CONTENT_NOT_PUBLISHED",
    ),
  );

  const assignClone = await req(
    `/classes/${classId}/assignments`,
    "POST",
    { contentType: "lesson", contentId: cloneId, dueDate: future(5) },
    owner.token,
    key(),
  );
  check("private variant assigned to the class", assignClone.status === 201 && assignClone.data.recipientCount === 2);
  const clonePathA = await req(`/lessons/${cloneId}/pathway`, "GET", undefined, studentA.token);
  await req(`/lessons/${cloneId}/steps/${clonePathA.data.steps[0].id}/progress`, "PUT", { action: "complete" }, studentA.token);
  check(
    "structure is locked once assigned with evidence (D7)",
    envelope(
      await req(`/lessons/${cloneId}`, "PUT", { ...editable, content: "<p>đổi</p>", status: "published", review }, owner.token),
      409,
      "LESSON_STRUCTURE_LOCKED",
    ),
  );
  const metadataOnly = await req(
    `/lessons/${cloneId}`,
    "PUT",
    {
      ...editable,
      title: editable.title + " (đã sửa tên)",
      status: "published",
      review,
    },
    owner.token,
  );
  check("metadata stays editable while locked", metadataOnly.status === 200);

  // Content archive: started students continue, not-started see MSG-36.
  await req(
    `/lessons/${cloneId}`,
    "PUT",
    {
      ...editable,
      title: editable.title + " (đã sửa tên)",
      status: "archived",
      review,
    },
    owner.token,
  );
  const startedPath = await req(`/lessons/${cloneId}/pathway`, "GET", undefined, studentA.token);
  check("a started student continues archived content", startedPath.status === 200 && startedPath.data.contentArchived === true);
  const notStarted = await req(`/lessons/${cloneId}/pathway`, "GET", undefined, studentD.token);
  check("a not-started student sees MSG-36", envelope(notStarted, 404, "CONTENT_ARCHIVED"));
  const queueD = await req("/assignments", "GET", undefined, studentD.token);
  check(
    "the queue marks archived not-started work as unopenable",
    queueD.data.some((a) => a.contentId === cloneId && a.canOpen === false && a.notice),
  );

  // ---------- B1-T4 taxonomy, coverage, challenge variants, preview, attribution ----------
  const energy = await req("/teacher/content?domain=ENERGY", "GET", undefined, owner.token);
  check(
    "library filters by KHTN domain",
    energy.status === 200 &&
      energy.data.items.some((i) => i.id === "lesson-circuit") &&
      !energy.data.items.some((i) => i.id === "lesson-eye"),
  );
  const byOutcome = await req("/teacher/content?outcome=FX8-LIVING-01&scope=SHARED_LIBRARY", "GET", undefined, owner.token);
  check("library filters by curriculum outcome", byOutcome.status === 200 && byOutcome.data.items.map((i) => i.id).join() === "lesson-eye");
  const energyMap = await db.curriculumOutcome.findMany({ where: { grade: 8, domain: "ENERGY" } });
  const cell = energy.data.coverage.find((row) => row.grade === 8 && row.domain === "ENERGY");
  const fixtureCell = energyMap.filter((o) => o.synthetic);
  check(
    "coverage has a denominator and gap list per grade and domain",
    cell &&
      (energyMap.some((o) => !o.synthetic)
        ? cell.releasedBaseline?.total === energyMap.filter((o) => !o.synthetic).length
        : cell.releasedBaseline === null) &&
      cell.fixture?.total === fixtureCell.length &&
      cell.fixture.covered + cell.fixture.gaps.length === cell.fixture.total,
    cell,
  );
  check(
    "fixture outcome coverage is reported apart from released coverage",
    cell.fixture.covered >= 1 && cell.fixture.gaps.includes("FX8-ENERGY-02") && typeof energy.data.coverageNote === "string",
  );
  const variantBody = {
    title: `${prefix} thử thách 10 mA`,
    subjectId: "physics",
    chapter: "Điện",
    grade: 8,
    topic: "Định luật Ohm",
    learningObjective: "Giữ dòng điện qua LED dưới mức giáo viên đặt",
    prerequisites: "Mạch điện kín",
    curriculum: "GDPT 2018 – KHTN 8",
    content: "<p>Dòng điện qua LED phụ thuộc điện trở mắc nối tiếp.</p>",
    labId: "circuit",
    status: "published",
    review,
    domain: "ENERGY",
    outcomeCodes: ["FX8-ENERGY-01"],
    questions: [{ prompt: `${prefix}: Tăng R thì I?`, options: ["Giảm", "Tăng"], answer: 0 }],
  };
  check(
    "out-of-range challenge parameters are rejected",
    envelope(
      await req("/lessons", "POST", { ...variantBody, challengeParams: { maxCurrentMa: 25 } }, owner.token),
      400,
      "INVALID_CHALLENGE_PARAMS",
    ),
  );
  check(
    "parameters the model does not allow are rejected",
    envelope(
      await req("/lessons", "POST", { ...variantBody, challengeParams: { voltage: 30 } }, owner.token),
      400,
      "INVALID_CHALLENGE_PARAMS",
    ),
  );
  check(
    "an outcome from another grade is rejected",
    envelope(await req("/lessons", "POST", { ...variantBody, outcomeCodes: ["FX9-ENERGY-01"] }, owner.token), 400, "INVALID_OUTCOME"),
  );
  check(
    "a teacher cannot create shared-library content",
    envelope(await req("/lessons", "POST", { ...variantBody, scope: "SHARED_LIBRARY" }, owner.token), 403, "BASELINE_READ_ONLY"),
  );
  const sharedChallengeBefore = await db.challenge.findUnique({ where: { id: "circuit_001" } });
  const variant = await req("/lessons", "POST", { ...variantBody, challengeParams: { maxCurrentMa: 10, minLitLeds: 1 } }, owner.token);
  check(
    "a private challenge variant with in-range parameters publishes",
    variant.status === 201 && variant.data.status === "published",
    variant.data,
  );
  const variantId = variant.data.id;
  const variantChallenge = await db.challenge.findUnique({ where: { id: `circuit_v-${variantId}` } });
  const variantSteps = await db.lessonStep.findMany({ where: { lessonId: variantId }, orderBy: { position: "asc" } });
  check(
    "the variant owns a new challenge row and the shared challenge is unchanged",
    variantChallenge?.constraints?.params?.maxCurrentMa === 10 &&
      variantSteps.at(-1)?.type === "CHALLENGE" &&
      variantSteps.at(-1).config.challengeId === variantChallenge.id &&
      JSON.stringify((await db.challenge.findUnique({ where: { id: "circuit_001" } })).constraints) ===
        JSON.stringify(sharedChallengeBefore.constraints),
  );
  const publicLabs = await req("/labs", "GET", undefined, studentA.token);
  check(
    "a teacher variant challenge is not listed in the public lab catalog",
    publicLabs.status === 200 && !publicLabs.data.some((lab) => lab.challenges.some((c) => c.id === variantChallenge.id)),
  );
  const preview = await req(`/teacher/content/${variantId}/preview`, "GET", undefined, owner.token);
  check(
    "preview renders every step with a text alternative, attribution and readiness",
    preview.status === 200 &&
      preview.data.steps.length === variantSteps.length &&
      preview.data.steps.every((step) => step.textAlternative && !step.missingAlternative) &&
      preview.data.readiness.ready === true &&
      preview.data.attribution.sources === review.sources &&
      preview.data.attribution.licenseLabel === "Tự biên soạn",
    preview.data,
  );
  const unreviewed = await req(
    "/lessons",
    "POST",
    { ...variantBody, title: `${prefix} nháp chưa duyệt`, status: "draft", review: undefined },
    owner.token,
  );
  const draftPreview = await req(`/teacher/content/${unreviewed.data.id}/preview`, "GET", undefined, owner.token);
  check(
    "preview of an incomplete draft lists its readiness blockers",
    draftPreview.status === 200 &&
      draftPreview.data.readiness.ready === false &&
      draftPreview.data.readiness.blockers.some((b) => /phiếu kiểm duyệt/.test(b)),
  );
  check(
    "another teacher cannot preview a private variant",
    envelope(await req(`/teacher/content/${variantId}/preview`, "GET", undefined, outsider.token), 404, "LESSON_NOT_FOUND"),
  );

  // Private assets: owner-only until published; another teacher cannot attach them.
  const form = new FormData();
  form.append(
    "file",
    new Blob([Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), Buffer.alloc(64)])], { type: "image/png" }),
    "so-do.png",
  );
  const uploaded = await fetch(origin + "/files", { method: "POST", headers: { authorization: "Bearer " + owner.token }, body: form }).then(
    async (r) => ({
      status: r.status,
      data: await r.json(),
    }),
  );
  check("teacher uploads a private asset", uploaded.status === 201 && uploaded.data.url === "assetv:" + uploaded.data.id);
  const readAsset = (token) =>
    fetch(`${origin}/files/${uploaded.data.id}`, { headers: { authorization: "Bearer " + token } }).then((r) => r.status);
  check(
    "the owner reads the unpublished asset and another teacher cannot",
    (await readAsset(owner.token)) === 200 && (await readAsset(outsider.token)) === 403,
  );
  check(
    "another teacher cannot publish with someone else's private asset",
    envelope(
      await req(
        "/lessons",
        "POST",
        { ...variantBody, materials: [{ type: "image", url: uploaded.data.url, title: "Sơ đồ" }] },
        outsider.token,
      ),
      400,
      "INVALID_LESSON_PATHWAY",
    ),
  );

  // T5: the assignment pins the content version; same version/targets/due date is a duplicate.
  const assignVariant = await req(
    `/classes/${classId}/assignments`,
    "POST",
    { contentType: "lesson", contentId: variantId },
    owner.token,
    key(),
  );
  check(
    "a variant assignment records its immutable content version",
    assignVariant.status === 201 &&
      (await db.assignment.findUnique({ where: { id: assignVariant.data.assignment.id } })).contentVersion?.startsWith("lesson:"),
  );
  check(
    "same content version, targets and due date is a duplicate",
    envelope(
      await req(`/classes/${classId}/assignments`, "POST", { contentType: "lesson", contentId: variantId }, owner.token, key()),
      409,
      "ASSIGNMENT_DUPLICATE",
    ),
  );
  const storedQuiz = variantSteps.find((step) => step.type === "QUIZ").config.questions;
  let variantPath = await req(`/lessons/${variantId}/pathway`, "GET", undefined, studentA.token);
  for (const step of variantPath.data.steps) {
    const progress = (body) => req(`/lessons/${variantId}/steps/${step.id}/progress`, "PUT", body, studentA.token);
    if (step.type === "READING") await progress({ action: "complete" });
    if (step.type === "VIDEO") await progress({ action: "complete-fallback" });
    if (step.type === "QUIZ")
      await req(
        `/lessons/${variantId}/quiz-attempts`,
        "POST",
        { idempotencyKey: randomUUID(), answers: storedQuiz.map((q) => ({ questionId: q.id, optionId: q.answerOptionId })) },
        studentA.token,
      );
    if (step.type === "LAB")
      await req(
        "/attempts",
        "POST",
        { challengeId: "circuit_001", lessonStepId: step.id, labState: circuit(470), durationMs: 1000 },
        studentA.token,
      );
  }
  variantPath = await req(`/lessons/${variantId}/pathway`, "GET", undefined, studentA.token);
  check(
    "the student pathway renders the variant's attribution",
    variantPath.data.attribution?.sources === review.sources && variantPath.data.attribution.licenseLabel === "Tự biên soạn",
  );
  const challengeStep = variantPath.data.steps.find((step) => step.type === "CHALLENGE");
  check("the teacher challenge opens after the lab", challengeStep && challengeStep.state !== "LOCKED", variantPath.data.steps);
  const challengeView = await req(`/lessons/${variantId}/steps/${challengeStep.id}/lab`, "GET", undefined, studentA.token);
  check(
    "the student sees the teacher's parameterised objective",
    challengeView.status === 200 &&
      challengeView.data.challengeId === variantChallenge.id &&
      /10 mA/.test(challengeView.data.targetObjective),
  );
  const tooHigh = await req(
    "/attempts",
    "POST",
    { challengeId: variantChallenge.id, lessonStepId: challengeStep.id, labState: circuit(470), durationMs: 1000 },
    studentA.token,
  );
  check(
    "a circuit that passes the base model fails the stricter teacher limit",
    tooHigh.status === 201 &&
      tooHigh.data.verdict === "partial" &&
      tooHigh.data.simulationResult.challengeCheck.unmet.includes("maxCurrentMa") &&
      /10 mA/.test(tooHigh.data.retryGuidance),
    tooHigh.data,
  );
  const within = await req(
    "/attempts",
    "POST",
    { challengeId: variantChallenge.id, lessonStepId: challengeStep.id, labState: circuit(1000), durationMs: 1000 },
    studentA.token,
  );
  check(
    "a circuit within the teacher limit passes, as evidence of this assignment",
    within.status === 201 && within.data.verdict === "passed" && within.data.assignmentId === assignVariant.data.assignment.id,
    within.data,
  );

  // A chemistry variant runs through its own model, objective and guidance.
  const chem = await req(
    "/lessons",
    "POST",
    {
      ...variantBody,
      title: `${prefix} phản ứng trung hòa`,
      subjectId: "chemistry",
      chapter: "Phản ứng hóa học",
      topic: "Tỉ lệ mol",
      labId: "chemistry",
      domain: "MATTER",
      outcomeCodes: ["FX8-MATTER-01"],
      questions: [],
      challengeParams: { reactionId: "naoh-hcl" },
    },
    owner.token,
  );
  check("a chemistry challenge variant publishes", chem.status === 201 && chem.data.status === "published", chem.data);
  const chemAssign = await req(
    `/classes/${classId}/assignments`,
    "POST",
    { contentType: "lesson", contentId: chem.data.id },
    owner.token,
    key(),
  );
  let chemPath = await req(`/lessons/${chem.data.id}/pathway`, "GET", undefined, studentA.token);
  for (const step of chemPath.data.steps) {
    if (step.type === "READING")
      await req(`/lessons/${chem.data.id}/steps/${step.id}/progress`, "PUT", { action: "complete" }, studentA.token);
    if (step.type === "VIDEO")
      await req(`/lessons/${chem.data.id}/steps/${step.id}/progress`, "PUT", { action: "complete-fallback" }, studentA.token);
  }
  chemPath = await req(`/lessons/${chem.data.id}/pathway`, "GET", undefined, studentA.token);
  const chemLab = chemPath.data.steps.find((step) => step.type === "LAB");
  const chemLabView = await req(`/lessons/${chem.data.id}/steps/${chemLab.id}/lab`, "GET", undefined, studentA.token);
  check(
    "the chemistry lab step names its own model and objective",
    chemLabView.data.labId === "chemistry" &&
      chemLabView.data.challengeId === "chemistry_001" &&
      /phản ứng vừa đủ/.test(chemLabView.data.targetObjective),
  );
  const leftover = await req(
    "/attempts",
    "POST",
    {
      challengeId: "chemistry_001",
      lessonStepId: chemLab.id,
      labState: { reactionId: "mg-hcl", molesA: 0.2, molesB: 0.2 },
      durationMs: 1000,
    },
    studentA.token,
  );
  check(
    "an unbalanced chemistry attempt gets chemistry guidance, not circuit guidance",
    leftover.data.verdict === "partial" && /dư/.test(leftover.data.retryGuidance) && !/LED|điện trở/.test(leftover.data.retryGuidance),
    leftover.data.retryGuidance,
  );
  await req(
    "/attempts",
    "POST",
    {
      challengeId: "chemistry_001",
      lessonStepId: chemLab.id,
      labState: { reactionId: "mg-hcl", molesA: 0.1, molesB: 0.2 },
      durationMs: 1000,
    },
    studentA.token,
  );
  chemPath = await req(`/lessons/${chem.data.id}/pathway`, "GET", undefined, studentA.token);
  const chemChallenge = chemPath.data.steps.find((step) => step.type === "CHALLENGE");
  const chemChallengeId = `chemistry_v-${chem.data.id}`;
  const wrongReaction = await req(
    "/attempts",
    "POST",
    {
      challengeId: chemChallengeId,
      lessonStepId: chemChallenge.id,
      labState: { reactionId: "mg-hcl", molesA: 0.1, molesB: 0.2 },
      durationMs: 1000,
    },
    studentA.token,
  );
  check(
    "a balanced but different reaction does not meet the teacher's reaction",
    wrongReaction.data.verdict === "needs_practice" && wrongReaction.data.simulationResult.challengeCheck.unmet.includes("reactionId"),
    wrongReaction.data,
  );
  const rightReaction = await req(
    "/attempts",
    "POST",
    {
      challengeId: chemChallengeId,
      lessonStepId: chemChallenge.id,
      labState: { reactionId: "naoh-hcl", molesA: 0.1, molesB: 0.1 },
      durationMs: 1000,
    },
    studentA.token,
  );
  check(
    "the teacher's reaction, balanced, passes the chemistry challenge for that assignment",
    rightReaction.data.verdict === "passed" && rightReaction.data.assignmentId === chemAssign.data.assignment.id,
    rightReaction.data,
  );

  // Shared library: admin-only, released only with named and independent reviews.
  const reviewerA = await teacher("reviewer-a", "ADMIN");
  const reviewerB = await teacher("reviewer-b", "ADMIN");
  const sharedBody = { ...variantBody, title: `${prefix} bài nền mới` };
  const shared = await req("/lessons", "POST", { ...sharedBody, scope: "SHARED_LIBRARY", status: "draft" }, reviewerA.token);
  check("admin creates a shared-library draft", shared.status === 201 && shared.data.scope === "SHARED_LIBRARY");
  const publishShared = (body = sharedBody) => req(`/lessons/${shared.data.id}`, "PUT", body, reviewerA.token);
  const sharedBlocked = await publishShared();
  check(
    "shared release is blocked until every named review exists",
    envelope(sharedBlocked, 400, "PUBLISH_BLOCKED") &&
      ["duyệt biên tập", "duyệt chuyên môn", "duyệt bản quyền", "duyệt an toàn", "duyệt mô hình khoa học"].every((item) =>
        sharedBlocked.data.details.missing.includes(item),
      ),
    sharedBlocked.data,
  );
  check(
    "a teacher cannot record a release review",
    envelope(await req(`/lessons/${shared.data.id}/release-reviews`, "POST", { kind: "subject" }, owner.token), 403, "FORBIDDEN"),
  );
  check(
    "private content has no release-review workflow",
    envelope(await req(`/lessons/${variantId}/release-reviews`, "POST", { kind: "subject" }, reviewerA.token), 400, "NOT_SHARED_LIBRARY"),
  );
  for (const kind of ["editorial", "subject", "rights", "safety", "model"])
    assert.equal(
      (await req(`/lessons/${shared.data.id}/release-reviews`, "POST", { kind }, reviewerA.token)).status,
      201,
      "review " + kind,
    );
  const sameReviewer = await publishShared();
  check(
    "one person signing both subject and rights review blocks release",
    envelope(sameReviewer, 400, "PUBLISH_BLOCKED") && sameReviewer.data.details.missing.some((item) => /khác nhau/.test(item)),
  );
  await req(`/lessons/${shared.data.id}/release-reviews`, "POST", { kind: "rights" }, reviewerB.token);
  const sharedReleased = await publishShared();
  check(
    "with named, independent reviews the shared lesson releases",
    sharedReleased.status === 200 && sharedReleased.data.status === "published",
  );
  const sharedEdited = await publishShared({ ...sharedBody, content: "<p>Nội dung đã đổi.</p>", status: "draft" });
  check("a structural edit clears earlier release reviews", sharedEdited.status === 200 && sharedEdited.data.releaseReview === null);

  // ---------- class archive ----------
  const countsBefore = {
    enrollments: await db.enrollment.count({ where: { classId } }),
    assignments: await db.assignment.count({ where: { classId } }),
  };
  check("archiving a class requires confirmation", (await req(`/classes/${classId}/archive`, "POST", {}, owner.token)).status === 400);
  const archived = await req(`/classes/${classId}/archive`, "POST", { confirm: true, reason: "hết học kỳ" }, owner.token);
  check(
    "owner archives the class and gets reconciled counts",
    archived.status === 201 &&
      archived.data.retained.enrollments === countsBefore.enrollments &&
      archived.data.retained.assignments === countsBefore.assignments,
  );
  check(
    "archive closes every assignment of the class for students",
    (await req("/assignments", "GET", undefined, studentA.token)).data.every((a) => a.classroom.id !== classId),
  );
  check(
    "archive closes started work too (Q-B1-02)",
    (await req(`/lessons/${cloneId}/pathway`, "GET", undefined, studentA.token)).status === 404,
  );
  check(
    "archived class rejects new assignments",
    envelope(
      await req(`/classes/${classId}/assignments`, "POST", { contentType: "lab", contentId: "circuit" }, owner.token),
      409,
      "CLASS_ARCHIVED",
    ),
  );
  check(
    "archived class rejects new members",
    envelope(await req(`/classes/${classId}/enrollments`, "POST", { username: studentC.username }, owner.token), 409, "CLASS_ARCHIVED"),
  );
  const archivedJoin = await req("/classes/join", "POST", { code: joinCode }, studentD.token);
  check("an archived class's code fails like any invalid code", JSON.stringify(archivedJoin.data) === JSON.stringify(malformed.data));
  check(
    "archive deleted no enrollment, assignment or evidence",
    (await db.enrollment.count({ where: { classId } })) === countsBefore.enrollments &&
      (await db.assignment.count({ where: { classId } })) === countsBefore.assignments &&
      (await db.attempt.count({ where: { studentId: studentD.id } })) === 1,
  );

  // ---------- B1-T3 abuse controls on real dependencies ----------
  const digest = (...parts) => createHash("sha256").update(parts.join("\u0000")).digest("hex");
  const localIps = sourceIps;
  // Tests start each aggregate scenario from a clean endpoint window for this machine only.
  const resetEndpoint = () =>
    db.rateLimitBucket.deleteMany({
      where: {
        key: { in: localIps.map((ip) => digest("join:endpoint-ip", ip)) },
      },
    });
  const randomLocator = () => {
    const alphabet = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
    const value = Array.from({ length: 6 }, () => alphabet[Math.floor(Math.random() * 32)]).join("");
    joinLocators.push(value);
    return value;
  };
  const makeClass = async (name, extra = {}) => {
    const res = await req(
      "/classes",
      "POST",
      {
        name: `${prefix} ${name}`,
        grade: 8,
        requiresApproval: false,
        ...extra,
      },
      owner.token,
      key(),
    );
    joinLocators.push(res.data.joinCode.slice(3, 9));
    secrets.push(res.data.joinCode);
    return { id: res.data.class.id, code: res.data.joinCode };
  };
  const hold = await makeClass("T3 giữ tài khoản");
  const probes = [];
  for (let i = 0; i < 9; i++) probes.push(await provision(hold.id, owner.token, `p${i}`));
  const [concStudent, ...pool] = probes;
  const fail = (account, code, base) => req("/classes/join", "POST", { code }, account.token, {}, base);
  // Each scenario starts with clean counters for its own test accounts only.
  const resetProbes = () =>
    db.rateLimitBucket.deleteMany({
      where: {
        key: {
          in: pool.flatMap((p) => [digest("join:account", p.id), ...localIps.map((ip) => digest("join:pair", ip, p.id))]),
        },
      },
    });
  await resetEndpoint();

  // Concurrency: parallel joins with different keys create one enrollment.
  const conc = await makeClass("T3 đồng thời");
  const parallel = await Promise.all(
    Array.from({ length: 5 }, () => req("/classes/join", "POST", { code: conc.code }, concStudent.token, key())),
  );
  check(
    "concurrent joins all succeed",
    parallel.every((r) => r.status === 201 && r.data.enrollmentStatus === "approved"),
    parallel.map((r) => [r.status, r.data?.code]),
  );
  check(
    "concurrent joins create exactly one enrollment",
    (await db.enrollment.count({
      where: { classId: conc.id, studentId: concStudent.id },
    })) === 1,
  );

  // Timing: unknown, wrong-secret, disabled and archived codes take comparable time.
  const disabledClass = await makeClass("T3 tắt mã");
  await req(`/classes/${disabledClass.id}`, "PUT", { joinCodeEnabled: false }, owner.token);
  const archivedClass = await makeClass("T3 lưu trữ");
  await req(`/classes/${archivedClass.id}/archive`, "POST", { confirm: true }, owner.token);
  const timers = pool.slice(0, 4);
  const categories = {
    unknown: () => `NL-${randomLocator()}-0000000000`,
    wrongSecret: () => conc.code.slice(0, 10) + "0000000000",
    disabled: () => disabledClass.code,
    archived: () => archivedClass.code,
  };
  const medians = {};
  const bodies = new Set();
  for (const [name, code] of Object.entries(categories)) {
    const samples = [];
    for (let i = 0; i < 6; i++) {
      const started = performance.now();
      const res = await fail(timers[i % timers.length], code());
      samples.push(performance.now() - started);
      bodies.add(JSON.stringify([res.status, res.data]));
    }
    samples.sort((a, b) => a - b);
    medians[name] = Math.round(((samples[2] + samples[3]) / 2) * 10) / 10;
  }
  console.log("     join failure medians (ms):", JSON.stringify(medians));
  const spread = Math.max(...Object.values(medians)) - Math.min(...Object.values(medians));
  check("unknown, wrong-secret, disabled and archived codes share one response", bodies.size === 1, [...bodies]);
  check("failure timing is comparable across code states", spread <= Math.max(30, Math.min(...Object.values(medians)) * 0.5), medians);

  // Locator+IP aggregate: switching accounts does not bypass 30 failures per locator.
  const abuse = await makeClass("T3 dò mã");
  await resetEndpoint();
  await resetProbes();
  const switchers = pool.slice(0, 4);
  for (let i = 0; i < 30; i++) {
    const res = await fail(switchers[Math.floor(i / 8)], abuse.code.slice(0, 10) + "0000000000");
    assert.equal(res.status, 404, `locator failure ${i + 1}`);
  }
  const freshA = pool[4];
  check(
    "after 30 failures across 4 accounts the locator is locked for this IP, even for a valid code",
    envelope(await fail(freshA, abuse.code), 429, "JOIN_RATE_LIMITED"),
  );
  const rotatedAbuse = await req(`/classes/${abuse.id}/join-code/rotate`, "POST", undefined, owner.token);
  secrets.push(rotatedAbuse.data?.joinCode);
  joinLocators.push(rotatedAbuse.data?.joinCode?.slice(3, 9));
  check("the locator lock does not lock the whole class (owner can still rotate)", rotatedAbuse.status === 201);
  const v6 = origin.replace("127.0.0.1", "[::1]");
  const v6Reachable = await fetch(v6 + "/health")
    .then((r) => r.ok)
    .catch(() => false);
  if (v6Reachable) {
    check("another IP is not locked by that locator lock", (await fail(freshA, conc.code, v6)).status === 201);
  } else console.log("SKIP another-IP checks: API not listening on [::1] (start it with HOST=::)");

  // Endpoint+IP aggregate: 60 attempts in 10 minutes lock the endpoint for this IP.
  await resetEndpoint();
  await resetProbes();
  const sprayers = pool.slice(0, 7);
  const freshB = pool[7];
  for (let i = 0; i < 60; i++) {
    const res = await fail(sprayers[Math.floor(i / 9)], `NL-${randomLocator()}-0000000000`);
    assert.equal(res.status, 404, `endpoint attempt ${i + 1}`);
  }
  check(
    "after 60 attempts the endpoint is locked for this IP, for any account and code",
    envelope(await fail(freshB, conc.code), 429, "JOIN_RATE_LIMITED"),
  );
  if (v6Reachable) check("the endpoint lock is scoped to the IP", (await fail(freshB, conc.code, v6)).status === 201);
  await resetEndpoint();

  // Account aggregate: 20 failures spread over three source IPs lock the account on every IP.
  const lanBase = lanIp ? origin.replace("127.0.0.1", lanIp) : null;
  const lanReachable =
    lanBase &&
    (await fetch(lanBase + "/health")
      .then((r) => r.ok)
      .catch(() => false));
  if (v6Reachable && lanReachable) {
    await resetProbes();
    const roamer = pool[0];
    const bases = [origin, v6, lanBase];
    for (let i = 0; i < 20; i++) {
      const res = await fail(roamer, `NL-${randomLocator()}-0000000000`, bases[i % 3]);
      assert.equal(res.status, 404, `account failure ${i + 1}`);
    }
    const pairs = await db.rateLimitBucket.findMany({
      where: { key: { in: sourceIps.map((ip) => digest("join:pair", ip, roamer.id)) } },
    });
    check(
      "20 failures over three IPs stay under every per-IP pair limit",
      pairs.length === 3 && pairs.every((bucket) => bucket.count < 10 && !bucket.lockedUntil),
      pairs.map((b) => b.count),
    );
    check(
      "the account aggregate then locks that account on a new IP, even for a valid code",
      envelope(await fail(roamer, conc.code, lanBase), 429, "JOIN_RATE_LIMITED") &&
        envelope(await fail(roamer, conc.code, v6), 429, "JOIN_RATE_LIMITED"),
    );
    check("another account on the same IPs is not locked", (await fail(pool[1], conc.code, lanBase)).status === 201);
    await resetEndpoint();
  } else console.log("SKIP three-IP account check: API not reachable on [::1] and " + (lanIp ?? "a LAN address"));

  // ---------- admin-only legacy provisioning is audited ----------
  const admin = await teacher("admin", "ADMIN");
  const adminMade = await req(
    "/admin/users",
    "POST",
    {
      username: `${prefix}-admin-made`,
      password: "Admin-Made-Password-2026!",
      fullName: "x",
      role: "STUDENT",
      grade: 8,
      consent: true,
      classId: hold.id,
    },
    admin.token,
  );
  createdUsers.push(adminMade.data.id);
  check(
    "admin provisioning through POST /admin/users is audited",
    adminMade.status === 201 &&
      (await db.auditLog.count({
        where: {
          actorId: admin.id,
          action: "user.create",
          targetId: adminMade.data.id,
        },
      })) === 1,
  );

  // ---------- audit coverage and redaction ----------
  const expected = [
    "class.create",
    "class.update",
    "class.join_code.rotate",
    "class.archive",
    "enrollment.provision",
    "enrollment.join_request",
    "enrollment.approve",
    "enrollment.remove",
    "enrollment.enroll",
    "assignment.create",
    "assignment.update",
    "assignment.archive",
    "lesson.create",
    "lesson.clone",
    "lesson.publish",
    "lesson.update",
    "lesson.archive",
    "lesson.release_review",
  ];
  const auditRows = await db.auditLog.findMany({
    where: { actorId: { in: createdUsers } },
  });
  for (const action of expected)
    check(
      `audited: ${action}`,
      auditRows.some((row) => row.action === action && row.outcome === "success"),
    );
  const auditText = JSON.stringify(auditRows);
  check(
    "audit rows contain no join code, temporary password or secret hash",
    !/NL-[0-9A-Z]{6}-|Nexa-|\$argon2/.test(auditText) && !auditText.includes(stored.joinSecretHash),
  );
  if (process.env.API_LOG_FILE) {
    const log = readFileSync(process.env.API_LOG_FILE, "utf8");
    const leaked = secrets.filter((value) => value && log.includes(value));
    check("API log contains no join code or temporary password from this run", leaked.length === 0 && !/\$argon2/.test(log), leaked.length);
  } else console.log("SKIP API log check: set API_LOG_FILE to the API's captured stdout/stderr");

  console.log(
    `\nB1 journey: ${passed} checks passed. Evidence tier: ${evidenceTier()} (real API + database ${dbHost}); browser checks run separately.`,
  );
} catch (error) {
  console.error(setupComplete ? "PRODUCT FAILURE" : "SETUP FAILURE (not a product result)");
  console.error(error?.message ?? error);
  process.exitCode = 1;
} finally {
  // Cleanup only the fixtures this run generated.
  const classes = await db.classroom.findMany({
    where: { teacherId: { in: createdUsers } },
    select: { id: true, joinLocator: true },
  });
  joinLocators.push(...classes.map((c) => c.joinLocator).filter(Boolean));
  await db.assignment.deleteMany({
    where: { classId: { in: classes.map((c) => c.id) } },
  });
  await db.classroom.deleteMany({
    where: { id: { in: classes.map((c) => c.id) } },
  });
  const lessons = await db.lesson.findMany({
    where: { authorId: { in: createdUsers } },
    select: { id: true },
  });
  await db.quizAttempt.deleteMany({
    where: { lessonId: { in: lessons.map((l) => l.id) } },
  });
  await db.lesson.deleteMany({
    where: { id: { in: lessons.map((l) => l.id) } },
  });
  await db.idempotencyRecord.deleteMany({
    where: { actorId: { in: createdUsers } },
  });
  await db.auditLog.deleteMany({ where: { actorId: { in: createdUsers } } });
  const digest = (...parts) => createHash("sha256").update(parts.join("\u0000")).digest("hex");
  const ips = sourceIps;
  const locators = ["ZZZZZZ", "malformed", ...joinLocators];
  await db.rateLimitBucket.deleteMany({
    where: {
      key: {
        in: [
          ...createdStudents.flatMap((id) => [digest("join:account", id), ...ips.map((ip) => digest("join:pair", ip, id))]),
          ...ips.map((ip) => digest("join:endpoint-ip", ip)),
          ...locators.flatMap((locator) => ips.map((ip) => digest("join:locator-ip", locator, ip))),
        ],
      },
    },
  });
  await db.assetFile.deleteMany({ where: { ownerId: { in: createdUsers } } });
  await removeUploadedAssets(db, { ownerId: { in: createdUsers } });
  await db.user.deleteMany({ where: { id: { in: createdUsers } } });
  // Variant challenges outlive their lesson rows until the attempts (cascaded with users) are gone.
  if (lessons.length) await db.challenge.deleteMany({ where: { OR: lessons.map((l) => ({ id: { endsWith: "_v-" + l.id } })) } });
  await db.$disconnect();
}
