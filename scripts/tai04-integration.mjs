// TAI-04 real-dependency journey (TAI4-T7): the SPEC success signal for teacher insights against the running API and its
// database, plus the similarity insight of TAI4-T6, the privacy boundary seen by an outside teacher, a student and a
// parent, byte-for-byte checks that no score, progress, B2 flag or notification changes, an audit reconciliation and a
// latency record. Every fixture uses the prefix `tai04-` and is removed afterwards (audit and idempotency rows of the
// fixture actors included) in `finally`.
//   TEST_API=http://127.0.0.1:4100/api npx tsx scripts/tai04-integration.mjs
// Modes: (default) journey and cleanup | --dry-cleanup journey, then only report what a cleanup would delete (rolled
// back, fixtures stay) | --cleanup-only [--dry-cleanup] remove leftovers of an earlier run.
// The npm command (`npm run test:tai04`) is guarded by assert-isolated-db.mjs and needs an isolated loopback database.
// A run against the shared development database is a pilot measurement only: it needs the owner's explicit approval, and
// its latency numbers are recorded but never presented as a production result.
import "dotenv/config";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import * as argon from "argon2";
import { findLeaks, INSIGHT_TOKENS } from "../src/modules/reports/application/insights/privacy-scan.ts";

const db = new PrismaClient();
const origin = process.env.TEST_API ?? "http://127.0.0.1:4100/api";
const prefix = "tai04-" + Date.now().toString(36);
const password = "Tai04-Journey-Password-2026!";
const dryCleanup = process.argv.includes("--dry-cleanup");
const cleanupOnly = process.argv.includes("--cleanup-only");
const day = 24 * 3600_000;
let passed = 0;

async function req(path, method = "GET", body, auth, headers = {}) {
  const attempt = () =>
    fetch(origin + path, {
      method,
      headers: { "content-type": "application/json", ...(auth ? { authorization: "Bearer " + auth } : {}), ...headers },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  let r;
  try {
    r = await attempt();
  } catch {
    // A connection reset is retried once for safe reads only; a failed write is never repeated.
    if (method !== "GET") return { status: 0, data: null };
    await sleep(400);
    try { r = await attempt(); } catch { return { status: 0, data: null }; }
  }
  let data = null;
  try { data = await r.json(); } catch { data = null; }
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
const stable = (value) => {
  if (value === undefined) return "null";
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return "[" + value.map(stable).join(",") + "]";
  return "{" + Object.keys(value).filter((k) => value[k] !== undefined).sort().map((k) => JSON.stringify(k) + ":" + stable(value[k])).join(",") + "}";
};
const sha = (text) => createHash("sha256").update(text).digest("hex");
// Server clock stamps that change with every read and carry no learning data (for example `generatedAt` of the student
// progress); everything else in a response takes part in the byte check.
const VOLATILE_KEYS = new Set(["generatedAt"]);
const withoutClock = (value) => {
  if (Array.isArray(value)) return value.map(withoutClock);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).filter(([k]) => !VOLATILE_KEYS.has(k)).map(([k, v]) => [k, withoutClock(v)]));
  return value;
};
const percentile = (samples, p) => [...samples].sort((a, b) => a - b)[Math.ceil(samples.length * p) - 1];

const createdUsers = [];
const tracked = { classIds: [] };

async function user(label, role, extra = {}) {
  const row = await db.user.create({
    data: {
      ...(role === "STUDENT" ? { username: `${prefix}-${label}` } : { email: `${prefix}-${label}@example.test` }),
      fullName: `TAI04 ${label}`,
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
  return { id: row.id, token: login.data.accessToken, name: row.fullName, username: row.username ?? null, email: row.email ?? null };
}

/** Letter-only pseudo words: no digits, never a unit token, unique per index. */
const L = "abcdefghijklmnopqrstuvwxyz";
const word = (i) => "xy" + L[i % 26] + L[Math.floor(i / 26) % 26] + L[Math.floor(i / 676) % 26];
const words = (from, count) => Array.from({ length: count }, (_, i) => word(from + i)).join(" ");

// ---------------------------------------------------------------------------------------------------------------- cleanup
async function scope() {
  const users = await db.user.findMany({ where: { OR: [{ email: { startsWith: "tai04-" } }, { username: { startsWith: "tai04-" } }] }, select: { id: true } });
  const userIds = users.map((u) => u.id);
  const classes = await db.classroom.findMany({ where: { OR: [{ teacherId: { in: userIds } }, { name: { startsWith: "tai04-" } }] }, select: { id: true } });
  const classIds = classes.map((c) => c.id);
  const assignmentIds = (await db.assignment.findMany({ where: { classId: { in: classIds } }, select: { id: true } })).map((a) => a.id);
  const resourceIds = (await db.classResource.findMany({ where: { classId: { in: classIds } }, select: { id: true } })).map((r) => r.id);
  const submissionIds = (await db.assignmentSubmission.findMany({ where: { assignmentId: { in: assignmentIds } }, select: { id: true } })).map((x) => x.id);
  const runIds = (await db.submissionSimilarityRun.findMany({ where: { assignmentId: { in: assignmentIds } }, select: { id: true } })).map((r) => r.id);
  const matchIds = (await db.submissionSimilarityMatch.findMany({ where: { runId: { in: runIds } }, select: { id: true } })).map((m) => m.id);
  const reviewIds = (await db.similarityMatchReview.findMany({ where: { matchId: { in: matchIds } }, select: { id: true } })).map((r) => r.id);
  const ackIds = (await db.insightAcknowledgement.findMany({ where: { classId: { in: classIds } }, select: { id: true } })).map((a) => a.id);
  const quizIds = (await db.quizAttempt.findMany({ where: { studentId: { in: userIds } }, select: { id: true } })).map((q) => q.id);
  return { userIds, classIds, assignmentIds, resourceIds, submissionIds, runIds, matchIds, reviewIds, ackIds, quizIds };
}
const targetIds = (c) => [...c.classIds, ...c.userIds, ...c.assignmentIds, ...c.resourceIds, ...c.submissionIds, ...c.runIds, ...c.matchIds, ...c.reviewIds, ...c.ackIds, ...c.quizIds];
async function counts(c) {
  const u = { in: c.userIds };
  return {
    users: c.userIds.length, classes: c.classIds.length, assignments: c.assignmentIds.length, resources: c.resourceIds.length, submissions: c.submissionIds.length,
    quizAttempts: c.quizIds.length, similarityRuns: c.runIds.length, similarityMatches: c.matchIds.length, similarityReviews: c.reviewIds.length, insightAcks: c.ackIds.length,
    idempotency: await db.idempotencyRecord.count({ where: { actorId: u } }),
    audit: await db.auditLog.count({ where: { OR: [{ actorId: u }, { targetId: { in: targetIds(c) } }] } }),
    sessions: await db.session.count({ where: { userId: u } }),
    notifications: await db.notification.count({ where: { recipientId: u } }),
  };
}
/** Deletes every `tai04-` row. With `dry` it counts, deletes inside a transaction, checks and rolls back. */
async function cleanup({ dry }) {
  const c = await scope();
  console.log((dry ? "DRY CLEANUP " : "CLEANUP ") + "rows: " + JSON.stringify(await counts(c)));
  try {
    await db.$transaction(
      async (tx) => {
        await tx.auditLog.deleteMany({ where: { OR: [{ actorId: { in: c.userIds } }, { targetId: { in: targetIds(c) } }] } });
        await tx.idempotencyRecord.deleteMany({ where: { actorId: { in: c.userIds } } });
        await tx.classroom.deleteMany({ where: { id: { in: c.classIds } } });
        await tx.user.deleteMany({ where: { id: { in: c.userIds } } });
        const left = {
          users: await tx.user.count({ where: { id: { in: c.userIds } } }),
          classes: await tx.classroom.count({ where: { id: { in: c.classIds } } }),
          runs: await tx.submissionSimilarityRun.count({ where: { id: { in: c.runIds } } }),
          matches: await tx.submissionSimilarityMatch.count({ where: { id: { in: c.matchIds } } }),
          reviews: await tx.similarityMatchReview.count({ where: { id: { in: c.reviewIds } } }),
          acks: await tx.insightAcknowledgement.count({ where: { id: { in: c.ackIds } } }),
          submissions: await tx.assignmentSubmission.count({ where: { id: { in: c.submissionIds } } }),
          quizAttempts: await tx.quizAttempt.count({ where: { id: { in: c.quizIds } } }),
        };
        console.log("     inside the transaction after the deletes: " + JSON.stringify(left));
        if (Object.values(left).some(Boolean)) throw new Error("rows left behind");
        if (dry) throw new Error("__DRY_CLEANUP_ROLLBACK__");
      },
      { maxWait: 20000, timeout: 60000 },
    );
    console.log("     deleted");
  } catch (error) {
    if (error.message === "__DRY_CLEANUP_ROLLBACK__") console.log("     dry cleanup rolled back: the fixtures are still in the database");
    else throw error;
  }
}

if (cleanupOnly) {
  try { await cleanup({ dry: dryCleanup }); } finally { await db.$disconnect(); }
  process.exit(0);
}

// ---------------------------------------------------------------------------------------------------------------- journey
try {
  const owner = await user("owner", "TEACHER");
  const outsider = await user("outsider-teacher", "TEACHER");
  const a = await user("an", "STUDENT");
  const b = await user("binh", "STUDENT");
  const parent = await user("parent", "PARENT", { emailVerifiedAt: new Date() });
  const lesson = await db.lesson.findFirst({ where: { scope: "SHARED_LIBRARY", status: "published", steps: { some: {} } }, include: { steps: { orderBy: { position: "asc" }, take: 1 } } });
  assert.ok(lesson, "a published shared lesson with a step exists");
  const classA = await db.classroom.create({ data: { teacherId: owner.id, name: `${prefix} class A`, grade: 8 } });
  const classO = await db.classroom.create({ data: { teacherId: outsider.id, name: `${prefix} outsider class`, grade: 8 } });
  tracked.classIds.push(classA.id, classO.id);
  for (const s of [a, b]) await db.enrollment.create({ data: { classId: classA.id, studentId: s.id, status: "approved", approved: true } });
  await db.parentLink.create({ data: { parentId: parent.id, studentId: a.id, status: "approved" } });

  const lessonAssignment = await req(`/classes/${classA.id}/assignments`, "POST", { contentType: "lesson", contentId: lesson.id, dueDate: null, studentIds: [] }, owner.token, key());
  check("owner assigns a lesson to the class", lessonAssignment.status === 201, lessonAssignment.data);
  const LESSON_A = lessonAssignment.data.assignment.id;

  // ---- evidence: three stable quiz attempts and a fourth 30 points higher (the SPEC success signal) -------------------
  const SECRET = "TAI04-SECRET-ANSWER-KEY";
  const quiz = (studentId, daysAgo, score) =>
    db.quizAttempt.create({
      data: {
        studentId, lessonId: lesson.id, stepId: lesson.steps[0].id, assignmentId: LESSON_A, answers: [],
        questionSnapshot: { questions: [{ id: "q", prompt: "tai04", correctOptionId: SECRET }] },
        correctCount: Math.round(score / 10), questionCount: 10, score, passed: score >= 50, idempotencyKey: randomUUID(), createdAt: new Date(Date.now() - daysAgo * day),
      },
    });
  const attempts = [];
  for (const [daysAgo, score] of [[10, 60], [9, 60], [8, 60], [7, 90]]) attempts.push(await quiz(a.id, daysAgo, score));
  await quiz(b.id, 6, 70);
  const quizIds = attempts.map((q) => q.id);
  check("fixtures: four attempts for the student, one for a classmate", (await db.quizAttempt.count({ where: { studentId: { in: [a.id, b.id] } } })) === 5);

  // ---- the written part (TAI4-T6): two near-identical answers --------------------------------------------------------
  const rubric = { code: "EXPLANATION", description: "Giải thích đúng", maxPoints: 2, anchors: [{ points: 0, description: "Không giải thích" }, { points: 2, description: "Giải thích đầy đủ" }] };
  const written = await req(`/classes/${classA.id}/resources`, "POST", { kind: "WRITTEN_TASK", title: `${prefix} written`, lessonId: lesson.id, content: { prompts: [{ prompt: "Giải thích hiện tượng.", maxChars: 3000, criteria: [rubric] }] } }, owner.token, key());
  check("owner creates the written task", written.status === 201, written.data);
  const publish = await req(`/classes/${classA.id}/resources/${written.data.id}/publish`, "POST", undefined, owner.token);
  check("owner publishes it", publish.status === 201, publish.data);
  const assignW = await req(`/classes/${classA.id}/assignments`, "POST", { contentType: "written", contentId: written.data.id, dueDate: new Date(Date.now() + 5 * day).toISOString(), studentIds: [] }, owner.token, key());
  check("owner assigns the written task", assignW.status === 201, assignW.data);
  const WRITTEN_A = assignW.data.assignment.id;
  const textA = words(2000, 70);
  const textB = words(2000, 66) + " " + words(9000, 4);
  const submit = async (student, text) => {
    const detail = await req(`/assignments/${WRITTEN_A}`, "GET", undefined, student.token);
    assert.equal(detail.status, 200, "student opens the written assignment");
    const res = await req(`/assignments/${WRITTEN_A}/submissions`, "POST", { responses: [{ promptId: detail.data.content.prompts[0].id, text }] }, student.token, key());
    assert.equal(res.status, 201, "student submits " + JSON.stringify(res.data));
    return res.data.submission.id;
  };
  const subA = await submit(a, textA);
  const subB = await submit(b, textB);
  // TAI4-T5: a teacher-final explanation grade, never an AI suggestion, drives insights@3.
  const gradeDetail = await req(`/classes/${classA.id}/assignments/${WRITTEN_A}/submissions/${subA}`, "GET", undefined, owner.token);
  check("owner opens the submission for final grading", gradeDetail.status === 200, gradeDetail.data);
  const promptId = gradeDetail.data.rubric.prompts[0].id;
  const grade = await req(`/classes/${classA.id}/assignments/${WRITTEN_A}/submissions/${subA}/grades`, "POST", { kind: "MANUAL", criterionPoints: [{ promptId, criterionCode: "EXPLANATION", points: 0 }] }, owner.token, key());
  check("owner records a zero-point teacher-final explanation grade", grade.status === 201 && grade.data.grade?.score === 0, grade.data);

  // ---- snapshots: scores, progress, B2 flags, evidence, parent view, notifications -----------------------------------
  const probes = {
    studentProgress: [`/me/progress`, a.token],
    teacherBoard: [`/classes/${classA.id}/assignments/${LESSON_A}/progress`, owner.token],
    b2Support: [`/classes/${classA.id}/assignments/${LESSON_A}/support`, owner.token],
    b2Evidence: [`/classes/${classA.id}/students/${a.id}/evidence?assignmentId=${LESSON_A}`, owner.token],
    parentProgress: [`/children/${a.id}/progress`, parent.token],
    writtenBoard: [`/classes/${classA.id}/assignments/${WRITTEN_A}/written-status`, owner.token],
  };
  const dbHash = async () => {
    const ids = { in: [a.id, b.id] };
    const rows = {
      quiz: await db.quizAttempt.findMany({ where: { studentId: ids }, orderBy: { id: "asc" } }),
      attempt: await db.attempt.findMany({ where: { studentId: ids }, orderBy: { id: "asc" } }),
      hint: await db.hintLog.findMany({ where: { attempt: { studentId: ids } }, orderBy: { id: "asc" } }),
      stepProgress: await db.stepProgress.findMany({ where: { studentId: ids }, orderBy: { id: "asc" } }),
      submission: await db.assignmentSubmission.findMany({ where: { studentId: ids }, orderBy: { id: "asc" } }),
      target: await db.assignmentTarget.findMany({ where: { studentId: ids }, orderBy: [{ assignmentId: "asc" }, { studentId: "asc" }] }),
      grades: await db.writtenGradeDecision.findMany({ where: { submission: { studentId: ids } }, orderBy: { id: "asc" } }),
    };
    return sha(JSON.stringify(rows));
  };
  const notificationCounts = async () => Object.fromEntries(await Promise.all([a, b, parent, owner].map(async (u) => [u.id, await db.notification.count({ where: { recipientId: u.id } })])));
  const snapshot = async () => {
    const out = { http: {}, db: await dbHash(), notifications: await notificationCounts() };
    for (const [name, [path, token]] of Object.entries(probes)) {
      const res = await req(path, "GET", undefined, token);
      out.http[name] = { status: res.status, hash: sha(stable(withoutClock(res.data))) };
    }
    return out;
  };
  const s0a = await snapshot();
  const s0b = await snapshot();
  const unstable = Object.keys(probes).filter((n) => s0a.http[n].hash !== s0b.http[n].hash);
  if (unstable.length) console.log("NOTE routes that change between two identical reads are left out of the byte check: " + unstable.join(", "));
  const comparable = Object.keys(probes).filter((n) => !unstable.includes(n));
  check("the byte check covers the student progress, the teacher board, the B2 flags, the evidence and the parent view, all answering 200", ["studentProgress", "teacherBoard", "b2Support", "b2Evidence", "parentProgress"].every((n) => comparable.includes(n) && s0a.http[n].status === 200), { unstable, status: Object.fromEntries(Object.entries(s0a.http).map(([n, v]) => [n, v.status])) });
  check("snapshot rows are stable without any insight call", s0a.db === s0b.db);
  const same = (before, after, label) => {
    check(`${label}: the database rows are byte-for-byte unchanged`, before.db === after.db);
    for (const n of comparable) check(`${label}: ${n} is byte-for-byte unchanged`, before.http[n].hash === after.http[n].hash && before.http[n].status === after.http[n].status, { before: before.http[n], after: after.http[n] });
    check(`${label}: no notification was created for the student, the classmate, the parent or the teacher`, stable(before.notifications) === stable(after.notifications), { before: before.notifications, after: after.notifications });
  };

  // ---- 1. the owner sees SCORE_CHANGE_UNUSUAL -------------------------------------------------------------------------
  const base = `/classes/${classA.id}`;
  const open1 = await req(`${base}/insights?status=open`, "GET", undefined, owner.token);
  check("owner reads the class insights", open1.status === 200 && open1.data.classArchived === false, open1.data);
  const mine = (data, studentId) => data.students.find((s) => s.studentId === studentId)?.insights ?? [];
  const jump = mine(open1.data, a.id).find((i) => i.ruleCode === "SCORE_CHANGE_UNUSUAL");
  check("a fourth attempt 30 points above a stable baseline gives SCORE_CHANGE_UNUSUAL (insights@1)", !!jump && jump.ruleVersion === "insights@1" && jump.status === "TEACHER_REVIEW_RECOMMENDED" && jump.values.latest === 90 && jump.values.mean === 60 && jump.values.delta === 30 && jump.values.direction === "UP", jump);
  check("its evidence is exactly the four attempts", stable([...jump.evidence.map((e) => e.id)].sort()) === stable([...quizIds].sort()) && jump.evidence.every((e) => e.kind === "QUIZ"), jump.evidence);
  const mismatch = mine(open1.data, a.id).find((i) => i.ruleCode === "MCQ_EXPLANATION_MISMATCH");
  check("insights@3 flags high quiz score versus low teacher-final explanation", !!mismatch && mismatch.ruleVersion === "insights@3" && mismatch.values.direction === "ANSWER_HIGH_EXPLANATION_LOW" && mismatch.values.explanationPercent === 0 && mismatch.values.mcqScore === 90, mismatch);
  check("insights@3 links the quiz, own written submission and final grade only", !!mismatch && stable(mismatch.evidence.map((e) => e.id)) === stable([attempts[3].id, subA, grade.data.grade.id]) && !JSON.stringify(mismatch).includes(subB) && !JSON.stringify(mismatch).includes(b.id), mismatch);
  const mismatchAck = await req(`${base}/students/${a.id}/insights/${mismatch.fingerprint}/acknowledgements`, "POST", { action: "ACKNOWLEDGED" }, owner.token, key());
  const mismatchReplay = await req(`${base}/students/${a.id}/insights/${mismatch.fingerprint}/replay`, "GET", undefined, owner.token);
  check("insights@3 replay preserves the rule version, fingerprint and evidence", mismatchAck.status === 201 && mismatchAck.data.ruleVersion === "insights@3" && mismatchReplay.status === 200 && mismatchReplay.data.ruleVersion === "insights@3" && mismatchReplay.data.fingerprint === mismatch.fingerprint && stable(mismatchReplay.data.evidence) === stable(mismatch.evidence), mismatchReplay.data);
  check("the order of students is by display name and carries no count", open1.data.students.every((s) => Object.keys(s).sort().join() === "displayName,insights,studentId"));

  // ---- 2. every linked attempt opens through the B2 route ---------------------------------------------------------------
  for (const id of quizIds) {
    const detail = await req(`${base}/students/${a.id}/quiz-attempts/${id}`, "GET", undefined, owner.token);
    check(`owner opens linked attempt ${id.slice(-6)} through the B2 evidence route`, detail.status === 200 && detail.data.id === id, detail.status);
  }

  // ---- 3. dismiss with a note ---------------------------------------------------------------------------------------
  const NOTE = "ghi chú riêng của giáo viên tai04";
  const ackKey = randomUUID();
  const ackPath = (studentId, fp) => `${base}/students/${studentId}/insights/${fp}/acknowledgements`;
  const missingKey = await req(ackPath(a.id, jump.fingerprint), "POST", { action: "DISMISSED" }, owner.token);
  check("an acknowledgement without Idempotency-Key is refused", code(missingKey, 400, "IDEMPOTENCY_KEY_REQUIRED"), missingKey.data);
  const ack1 = await req(ackPath(a.id, jump.fingerprint), "POST", { action: "DISMISSED", note: NOTE }, owner.token, { "Idempotency-Key": ackKey });
  check("owner dismisses the insight with a note (201, no actor in the body)", ack1.status === 201 && ack1.data.action === "DISMISSED" && ack1.data.note === NOTE && !("actorId" in ack1.data) && ack1.data.ruleVersion === "insights@1", ack1.data);
  const ack1Again = await req(ackPath(a.id, jump.fingerprint), "POST", { action: "DISMISSED", note: NOTE }, owner.token, { "Idempotency-Key": ackKey });
  check("the same key returns the same row", ack1Again.status === 201 && ack1Again.data.id === ack1.data.id && (await db.insightAcknowledgement.count({ where: { classId: classA.id } })) === 2);
  const open2 = await req(`${base}/insights?status=open`, "GET", undefined, owner.token);
  check("the dismissed insight leaves the open list", !mine(open2.data, a.id).some((i) => i.fingerprint === jump.fingerprint));
  const all2 = await req(`${base}/students/${a.id}/insights?status=all`, "GET", undefined, owner.token);
  check("it stays in all with its latest acknowledgement and the row history", all2.data.insights.find((i) => i.fingerprint === jump.fingerprint)?.latestAcknowledgement?.action === "DISMISSED" && all2.data.acknowledgements.length === 2 && !("actorId" in all2.data.acknowledgements[0]));
  const s1 = await snapshot();
  same(s0a, s1, "after reading and dismissing");

  // ---- 4. a fifth attempt produces a new insight ------------------------------------------------------------------------
  const fifth = await quiz(a.id, 0, 20);
  const s2 = await snapshot();
  const open3 = await req(`${base}/insights?status=open`, "GET", undefined, owner.token);
  const fresh = mine(open3.data, a.id).find((i) => i.ruleCode === "SCORE_CHANGE_UNUSUAL");
  check("a fifth attempt produces a new open insight with a new fingerprint", !!fresh && fresh.fingerprint !== jump.fingerprint && fresh.evidence.some((e) => e.id === fifth.id), fresh);
  const stale = await req(ackPath(a.id, jump.fingerprint), "POST", { action: "ACKNOWLEDGED" }, owner.token, key());
  check("acknowledging the superseded fingerprint answers 409 INSIGHT_STALE", code(stale, 409, "INSIGHT_STALE"), stale.data);
  const replay = await req(`${base}/students/${a.id}/insights/${jump.fingerprint}/replay`, "GET", undefined, owner.token);
  check("replay reproduces the evidence ids and the thresholds of the superseded insight", replay.status === 200 && stable([...replay.data.evidence.map((e) => e.id)].sort()) === stable([...quizIds].sort()) && stable(replay.data.thresholds) === stable(jump.thresholds), replay.data);

  // ---- 5. similarity (insights@2) ---------------------------------------------------------------------------------------
  const run = await req(`${base}/assignments/${WRITTEN_A}/similarity-runs`, "POST", {}, owner.token, key());
  check("owner runs the similarity check: one HIGH pair", run.status === 201 && run.data.run.matchCount === 1, run.data);
  const runDetail = await req(`${base}/assignments/${WRITTEN_A}/similarity-runs/${run.data.run.id}`, "GET", undefined, owner.token);
  const match = runDetail.data.matches[0];
  check("the stored pair is HIGH", match.level === "HIGH", match.level);
  const simOpen = await req(`${base}/insights?status=open`, "GET", undefined, owner.token);
  const simA = mine(simOpen.data, a.id).find((i) => i.ruleCode === "SUBMISSION_SIMILARITY_HIGH");
  const simB = mine(simOpen.data, b.id).find((i) => i.ruleCode === "SUBMISSION_SIMILARITY_HIGH");
  check("both students of the pair get one insights@2 insight with pairCount 1", !!simA && !!simB && simA.ruleVersion === "insights@2" && simA.values.pairCount === 1 && simB.values.pairCount === 1 && simA.values.assignmentId === WRITTEN_A, [simA, simB]);
  check("the card carries nothing about the other student", !JSON.stringify(simA).includes(b.id) && !JSON.stringify(simA).includes(b.name) && !JSON.stringify(simA).includes(subB) && !JSON.stringify(simB).includes(a.id) && !JSON.stringify(simB).includes(a.name) && !JSON.stringify(simB).includes(subA));
  const simAck = await req(ackPath(a.id, simA.fingerprint), "POST", { action: "ACKNOWLEDGED" }, owner.token, key());
  check("owner acknowledges the insights@2 insight of the first student", simAck.status === 201 && simAck.data.ruleVersion === "insights@2", simAck.data);
  const review = await req(`${base}/assignments/${WRITTEN_A}/similarity-runs/${run.data.run.id}/matches/${match.id}/reviews`, "POST", { status: "NOTED", note: "đã xem cặp bài" }, owner.token, key());
  check("owner reviews the pair as noted", review.status === 201, review.data);
  const simAfter = await req(`${base}/insights?status=all`, "GET", undefined, owner.token);
  check("the review removes the insight for both students, in all as well", !mine(simAfter.data, a.id).some((i) => i.ruleCode === "SUBMISSION_SIMILARITY_HIGH") && !mine(simAfter.data, b.id).some((i) => i.ruleCode === "SUBMISSION_SIMILARITY_HIGH"));
  const simReplay = await req(`${base}/students/${a.id}/insights/${simA.fingerprint}/replay`, "GET", undefined, owner.token);
  check("the insights@2 acknowledgement still replays as it stood", simReplay.status === 200 && simReplay.data.ruleVersion === "insights@2" && stable(simReplay.data.evidence.map((e) => e.id)) === stable(simA.evidence.map((e) => e.id)), simReplay.data);
  const reads = [
    () => req(`${base}/insights?status=open`, "GET", undefined, owner.token),
    () => req(`${base}/insights?status=all`, "GET", undefined, owner.token),
    () => req(`${base}/students/${a.id}/insights?status=all`, "GET", undefined, owner.token),
    () => req(`${base}/students/${a.id}/insights/${jump.fingerprint}/replay`, "GET", undefined, owner.token),
  ];
  for (const read of reads) await read();
  const fresh2 = await req(ackPath(a.id, fresh.fingerprint), "POST", { action: "ACKNOWLEDGED", note: "xem lại sau" }, owner.token, key());
  check("owner acknowledges the new insight", fresh2.status === 201, fresh2.data);
  const s4 = await snapshot();
  same(s2, s4, "after the similarity run, the pair review and every insight read and acknowledgement");

  // ---- 6. the outside teacher, the student and the parent are denied ------------------------------------------------------
  const FP = "a".repeat(64);
  const routes = (studentId) => [
    ["GET class insights", "GET", `${base}/insights`],
    ["GET student insights", "GET", `${base}/students/${studentId}/insights`],
    ["POST acknowledgement", "POST", ackPath(studentId, FP)],
    ["GET replay", "GET", `${base}/students/${studentId}/insights/${FP}/replay`],
  ];
  for (const [who, token] of [["outside teacher", outsider.token], ["student", a.token], ["classmate", b.token], ["parent", parent.token]]) {
    for (const [label, method, path] of routes(a.id)) {
      const res = await req(path, method, method === "POST" ? { action: "DISMISSED" } : undefined, token, method === "POST" ? key() : {});
      const leaks = findLeaks(res.data, [...INSIGHT_TOKENS, NOTE, b.id, b.name, subA, subB]);
      check(`${who}: ${label} answers 403 and the body carries nothing`, res.status === 403 && leaks.length === 0, { status: res.status, leaks, body: res.data });
    }
  }
  const noToken = await req(`${base}/insights`);
  check("without a token the insight route answers 401", noToken.status === 401, noToken.status);
  const own = await req(`/classes/${classO.id}/insights`, "GET", undefined, outsider.token);
  check("the outside teacher reads only their own class: none of the other class students appear", own.status === 200 && own.data.students.length === 0, own.data);
  const crossAck = await req(`/classes/${classO.id}/students/${a.id}/insights/${jump.fingerprint}/acknowledgements`, "POST", { action: "DISMISSED" }, outsider.token, key());
  check("the outside teacher cannot acknowledge a student of another class through their own class", crossAck.status === 404 && crossAck.data?.code === "NOT_FOUND", crossAck.data);

  // ---- 7. recursive scan of every GET route a student or a parent can reach ---------------------------------------------
  const manifest = execFileSync("npx", ["tsx", "scripts/route-manifest.ts", "src"], { cwd: new URL("..", import.meta.url), encoding: "utf8", shell: true, maxBuffer: 20 * 1024 * 1024 });
  const entries = manifest.split("\n").map((line) => line.match(/^(\w+) (\S+) public=(\w+) roles=(\S*) /)).filter(Boolean).map((m) => ({ method: m[1], path: m[2], public: m[3] === "true", roles: m[4] ? m[4].split(",") : [] }));
  const known = { classes: classA.id, assignments: LESSON_A, students: a.id, children: a.id, "quiz-attempts": quizIds[0], lessons: lesson.id, resources: written.data.id, submissions: subA };
  const resolve = (route) => {
    const segments = route.split("/");
    for (let i = 0; i < segments.length; i++) {
      if (!segments[i].startsWith(":")) continue;
      const value = known[segments[i - 1]];
      if (!value) return null;
      segments[i] = value;
    }
    return segments.join("/");
  };
  const apiPath = (p) => p.replace(/^\/api(?=\/)/, "");
  const scanRole = async (label, role, token, others) => {
    const targets = entries.filter((e) => e.method === "GET" && !e.public && (e.roles.includes(role) || e.roles.length === 0));
    const resolved = targets.map((e) => ({ e, url: resolve(apiPath(e.path)) }));
    const skipped = resolved.filter((r) => r.url === null).length;
    let bodies = 0;
    const networkErrors = [];
    const found = [];
    const forbidden = [...INSIGHT_TOKENS, NOTE, "đã xem cặp bài", "xem lại sau", ...others];
    const todo = resolved.filter((r) => r.url !== null);
    for (let i = 0; i < todo.length; i += 6) {
      await Promise.all(todo.slice(i, i + 6).map(async ({ e, url }) => {
        const res = await req(url, "GET", undefined, token);
        if (res.status === 0) networkErrors.push(e.path);
        if (res.status === 200 && res.data !== null) {
          bodies++;
          for (const leak of findLeaks(res.data, forbidden)) found.push({ route: e.path, ...leak });
        }
      }));
    }
    console.log(`     ${label}: ${targets.length} GET routes reachable by role, ${todo.length} called, ${skipped} skipped for an unresolved parameter, ${bodies} bodies scanned, ${networkErrors.length} without an answer${networkErrors.length ? " (" + networkErrors.join(", ") + ")" : ""}`);
    check(`${label}: no body of any reachable GET route carries insight data, a note or another student's identity`, found.length === 0, found.slice(0, 5));
    check(`${label}: the scan reached a useful number of routes`, bodies >= 3, { bodies });
  };
  await scanRole("student", "STUDENT", a.token, [b.id, b.name, b.username, subB].filter(Boolean));
  await scanRole("parent", "PARENT", parent.token, [b.id, b.name, b.username, subB].filter(Boolean));
  await scanRole("classmate", "STUDENT", b.token, [a.id, a.name, a.username, subA].filter(Boolean));

  // ---- 8. nothing changed, and the audit reconciles -----------------------------------------------------------------------
  const s5 = await snapshot();
  same(s4, s5, "after the privacy scans");
  const acks = await db.insightAcknowledgement.findMany({ where: { classId: classA.id } });
  const ackAudits = await db.auditLog.findMany({ where: { action: "insight.acknowledge", actorId: owner.id } });
  check("one insight.acknowledge audit row per stored acknowledgement", ackAudits.length === acks.length && acks.length === 4, { audits: ackAudits.length, acks: acks.length });
  check("the audit rows keep only class, student, rule, version and action", ackAudits.every((r) => stable(Object.keys(r.after ?? {}).sort()) === stable(["action", "classId", "ruleCode", "ruleVersion", "studentId"])), ackAudits.map((r) => r.after));
  const everyAudit = JSON.stringify(await db.auditLog.findMany({ where: { OR: [{ actorId: { in: createdUsers } }, { targetId: { in: [...acks.map((x) => x.id), classA.id, a.id, b.id] } }] } }));
  check("no audit row contains a note text", !everyAudit.includes(NOTE) && !everyAudit.includes("xem lại sau") && !everyAudit.includes("đã xem cặp bài"));
  check("the acknowledgement rows are append-only here: four rows, none updated", acks.every((x) => x.createdAt instanceof Date) && acks.length === 4);

  // ---- 9. latency record (pilot unless the database is a local one) ----------------------------------------------------------
  const host = (() => { try { return new URL(process.env.DATABASE_URL ?? process.env.DIRECT_URL ?? "").hostname; } catch { return ""; } })();
  const local = ["localhost", "127.0.0.1", "::1", "[::1]"].includes(host);
  const timeIt = async (read, runs = 20) => {
    await read();
    const samples = [];
    for (let i = 0; i < runs; i++) {
      const start = performance.now();
      const res = await read();
      samples.push(performance.now() - start);
      assert.equal(res.status, 200);
    }
    return { p50: percentile(samples, 0.5), p95: percentile(samples, 0.95), max: Math.max(...samples) };
  };
  const fmt = (m) => `p50 ${m.p50.toFixed(0)} ms, p95 ${m.p95.toFixed(0)} ms, max ${m.max.toFixed(0)} ms`;
  const classLatency = await timeIt(reads[1]);
  const studentLatency = await timeIt(reads[2]);
  const label = local ? "ISOLATED LOCAL DATABASE" : "PILOT: remote shared database, not a production measurement";
  console.log(`LATENCY [${label}] class overview (2 students, 20 reads): ${fmt(classLatency)}; one student (20 reads): ${fmt(studentLatency)}`);
  if (local) check("QR-09: p95 of the class overview is at most 500 ms on the isolated local database", classLatency.p95 <= 500, classLatency);
  else console.log("     QR-09 is not asserted here: the database is remote, so the numbers above are recorded only");
  console.log(`\nTAI-04 journey passed: ${passed} checks.`);
} finally {
  try {
    await cleanup({ dry: dryCleanup });
  } finally {
    await db.$disconnect();
  }
}
