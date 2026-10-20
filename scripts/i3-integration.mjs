// I3 real-dependency journey (Stories 3.1-3.6): an isolated owner teacher
// assigns a published class test with a due date to a subset, students submit
// on time and late, the teacher rejects and revises the deadline, and student,
// teacher and linked-parent views are checked against the running API and its
// database. Every fixture is generated with a unique prefix and removed afterwards.
//   TEST_API=http://127.0.0.1:4100/api npx tsx scripts/i3-integration.mjs
import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import * as argon from "argon2";

const db = new PrismaClient();
const origin = process.env.TEST_API ?? "http://127.0.0.1:4100/api";
const prefix = "i3-accept-" + Date.now().toString(36);
const password = "I3-Accept-Password-2026!";
const createdUsers = [];
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

async function user(label, role, extra = {}) {
  const row = await db.user.create({
    data: {
      ...(role === "STUDENT" ? { username: `${prefix}-${label}` } : { email: `${prefix}-${label}@example.test` }),
      fullName: `I3 ${label}`,
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
    // The API keeps a 10/minute in-memory student-login limit per IP; wait out the window.
    console.log("     waiting 61 s for the login rate window");
    await sleep(61000);
    login = await signIn();
  }
  assert.equal(login.status, 201, `${label} login ${JSON.stringify(login.data)}`);
  return { id: row.id, token: login.data.accessToken };
}

try {
  const owner = await user("owner", "TEACHER");
  const outsiderTeacher = await user("outsider-teacher", "TEACHER");
  const students = {};
  for (const label of ["s1", "s2", "s3", "nontarget", "pending", "outsider"]) students[label] = await user(label, "STUDENT");
  const parent = await user("parent", "PARENT", { emailVerifiedAt: new Date() });
  const pendingParent = await user("pending-parent", "PARENT", { emailVerifiedAt: new Date() });

  const classroom = await db.classroom.create({ data: { teacherId: owner.id, name: `${prefix} class`, grade: 8 } });
  for (const label of ["s1", "s2", "s3", "nontarget"])
    await db.enrollment.create({ data: { classId: classroom.id, studentId: students[label].id, status: "approved", approved: true } });
  await db.enrollment.create({ data: { classId: classroom.id, studentId: students.pending.id, status: "pending" } });
  await db.parentLink.create({ data: { parentId: parent.id, studentId: students.s1.id, status: "approved" } });
  await db.parentLink.create({ data: { parentId: pendingParent.id, studentId: students.s1.id, status: "pending" } });
  const lesson = await db.lesson.findFirst({ where: { scope: "SHARED_LIBRARY", status: "published" }, select: { id: true } });
  assert.ok(lesson, "a published shared lesson exists for the resource link");

  // ---------- 3.1 assign a test ----------
  const content = {
    questions: [
      { prompt: "Đơn vị đo điện trở?", options: ["Vôn", "Ôm"], correctOption: 1, explanation: "Điện trở đo bằng ôm" },
      { prompt: "Dòng điện đo bằng?", options: ["Ampe kế", "Vôn kế"], correctOption: 0 },
    ],
  };
  const created = await req(`/classes/${classroom.id}/resources`, "POST", { kind: "TEST", title: `${prefix} test`, lessonId: lesson.id, content }, owner.token, key());
  check("teacher creates a draft class test", created.status === 201, created.data);
  const testId = created.data.id;
  const draftAssign = await req(`/classes/${classroom.id}/assignments`, "POST", { contentType: "test", contentId: testId, dueDate: new Date(Date.now() + 3600_000).toISOString(), studentIds: [] }, owner.token, key());
  check("draft test cannot be assigned", code(draftAssign, 400, "CONTENT_NOT_PUBLISHED"), draftAssign.data);
  const published = await req(`/classes/${classroom.id}/resources/${testId}/publish`, "POST", undefined, owner.token);
  check("teacher publishes the test", published.status === 201, published.data);
  const beforeAssign = await db.assignment.count({ where: { classId: classroom.id } });
  check("sharing a published test creates no assignment", beforeAssign === 0);
  const memberView = await req(`/classes/${classroom.id}/resources/${testId}`, "GET", undefined, students.s1.token);
  check("class member sees no test content through sharing", memberView.status === 200 && memberView.data.content === null, memberView.data);

  const assignable = await req(`/classes/${classroom.id}/assignable-content`, "GET", undefined, owner.token);
  check("assignable content lists the published test", assignable.data?.tests?.some((t) => t.id === testId && t.questionCount === 2), assignable.data?.tests);

  const noDue = await req(`/classes/${classroom.id}/assignments`, "POST", { contentType: "test", contentId: testId, studentIds: [] }, owner.token, key());
  check("missing due date is rejected", code(noDue, 400, "DUE_DATE_REQUIRED"), noDue.data);
  const badTarget = await req(`/classes/${classroom.id}/assignments`, "POST", { contentType: "test", contentId: testId, dueDate: new Date(Date.now() + 3600_000).toISOString(), studentIds: [students.s1.id, students.pending.id] }, owner.token, key());
  check("non-approved target rejects the whole request", code(badTarget, 400, "INVALID_TARGETS"), badTarget.data);
  check("no partial targets were written", (await db.assignment.count({ where: { classId: classroom.id } })) === 0);
  const foreign = await req(`/classes/${classroom.id}/assignments`, "POST", { contentType: "test", contentId: testId, dueDate: new Date(Date.now() + 3600_000).toISOString(), studentIds: [] }, outsiderTeacher.token, key());
  check("non-owner teacher cannot assign", code(foreign, 403, "CLASS_ACCESS_DENIED"), foreign.data);

  // A short deadline lets the run cross it; the API accepts due dates up to 60 s in the past.
  const shortDue = new Date(Date.now() + 25000);
  const assignKey = key();
  const assignBody = { contentType: "test", contentId: testId, dueDate: shortDue.toISOString(), studentIds: [students.s1.id, students.s2.id, students.s3.id] };
  const assigned = await req(`/classes/${classroom.id}/assignments`, "POST", assignBody, owner.token, assignKey);
  check("owner assigns the test to an approved subset", assigned.status === 201 && assigned.data.recipientCount === 3, assigned.data);
  const aid = assigned.data.assignment.id;
  const replay = await req(`/classes/${classroom.id}/assignments`, "POST", assignBody, owner.token, assignKey);
  check("assignment retry with the same key replays", replay.status === 201 && replay.data.assignment.id === aid, replay.data);
  const revisions = await db.assignmentDeadlineRevision.findMany({ where: { assignmentId: aid } });
  check("creation writes deadline revision 1 in UTC", revisions.length === 1 && revisions[0].revision === 1 && revisions[0].dueAt.getTime() === shortDue.getTime(), revisions);
  const immutable = await req(`/classes/${classroom.id}/assignments/${aid}`, "PUT", { studentIds: [students.s1.id] }, owner.token);
  check("test targets cannot be edited", code(immutable, 409, "TEST_ASSIGNMENT_IMMUTABLE"), immutable.data);
  const moveDue = await req(`/classes/${classroom.id}/assignments/${aid}`, "PUT", { dueDate: new Date(Date.now() + 7200_000).toISOString() }, owner.token);
  check("test due date cannot move through the general update", code(moveDue, 409, "TEST_ASSIGNMENT_IMMUTABLE"), moveDue.data);

  const detail = await req(`/assignments/${aid}`, "GET", undefined, students.s1.token);
  check("target student opens the same assignment", detail.status === 200 && detail.data.id === aid && detail.data.deadline.revision === 1, detail.data);
  const leaked = JSON.stringify(detail.data);
  check("student copy has no answer key or explanation", !leaked.includes("correctOption") && !leaked.includes("Điện trở đo bằng ôm"));
  check("student sees due-soon before the deadline", detail.data.state.status === "DUE_SOON" && detail.data.state.dueSoon === true, detail.data.state);
  const list = await req("/assignments", "GET", undefined, students.s1.token);
  check("student list carries the server test status", list.data?.find((a) => a.id === aid)?.testStatus?.dueSoon === true, list.data);
  for (const label of ["nontarget", "outsider"]) {
    const denied = await req(`/assignments/${aid}`, "GET", undefined, students[label].token);
    check(`${label} student cannot open the assignment`, code(denied, 404, "ASSIGNMENT_NOT_FOUND"), denied.data);
  }

  // ---------- 3.2 submit ----------
  const questions = detail.data.content.questions;
  const answers = (picks) => questions.map((q, i) => ({ questionId: q.id, optionId: q.options[picks[i]].id }));
  const submitKey = key();
  const onTime = await req(`/assignments/${aid}/submissions`, "POST", { answers: answers([1, 0]) }, students.s1.token, submitKey);
  check("on-time submission is scored on the server", onTime.status === 201 && onTime.data.submission.status === "SCORED" && onTime.data.submission.score === 100, onTime.data);
  const onTimeReplay = await req(`/assignments/${aid}/submissions`, "POST", { answers: answers([1, 0]) }, students.s1.token, submitKey);
  check("submission retry replays without a second attempt", onTimeReplay.status === 201 && onTimeReplay.data.submission.id === onTime.data.submission.id, onTimeReplay.data);
  const reused = await req(`/assignments/${aid}/submissions`, "POST", { answers: answers([0, 0]) }, students.s1.token, submitKey);
  check("same key with a different payload is a stable conflict", code(reused, 409, "IDEMPOTENCY_KEY_REUSED"), reused.data);
  const partial = await req(`/assignments/${aid}/submissions`, "POST", { answers: answers([1, 0]).slice(0, 1) }, students.s2.token, key());
  check("incomplete answers are rejected", code(partial, 400, "TEST_ANSWERS_INVALID"), partial.data);
  const nonTargetSubmit = await req(`/assignments/${aid}/submissions`, "POST", { answers: answers([1, 0]) }, students.nontarget.token, key());
  check("non-target cannot submit", code(nonTargetSubmit, 404, "ASSIGNMENT_NOT_FOUND"), nonTargetSubmit.data);
  check("s1 has exactly one stored attempt", (await db.assignmentSubmission.count({ where: { assignmentId: aid, studentId: students.s1.id } })) === 1);

  const wait = shortDue.getTime() - Date.now() + 1500;
  if (wait > 0) await sleep(wait);

  const overdue = await req(`/assignments/${aid}`, "GET", undefined, students.s3.token);
  check("expired unsubmitted student is overdue without a score", overdue.data.state.status === "OVERDUE_UNSUBMITTED" && overdue.data.state.current === null && overdue.data.state.lateReasonRequired, overdue.data.state);
  check("expiry created no submission or zero", (await db.assignmentSubmission.count({ where: { assignmentId: aid, studentId: students.s3.id } })) === 0);
  const noReason = await req(`/assignments/${aid}/submissions`, "POST", { answers: answers([1, 0]) }, students.s2.token, key());
  check("late submission without a reason is rejected", code(noReason, 400, "LATE_REASON_REQUIRED"), noReason.data);
  check("rejected late request stored nothing", (await db.assignmentSubmission.count({ where: { assignmentId: aid, studentId: students.s2.id } })) === 0);
  const lateS2 = await req(`/assignments/${aid}/submissions`, "POST", { answers: answers([1, 1]), lateReason: "Em bị ốm" }, students.s2.token, key());
  check("late submission with a reason is pending without a score", lateS2.status === 201 && lateS2.data.submission.status === "LATE_REVIEW_PENDING" && lateS2.data.submission.score === null, lateS2.data);
  const lateS1 = await req(`/assignments/${aid}/submissions`, "POST", { answers: answers([1, 1]), lateReason: "Em muốn làm lại" }, students.s1.token, key());
  check("a newer late attempt becomes current and pending", lateS1.data.state.status === "LATE_REVIEW_PENDING" && lateS1.data.state.history.length === 2, lateS1.data.state);

  // ---------- 3.6 parent notice (before extension) ----------
  const s3Notices = await req(`/children/${students.s1.id}/assignment-notices`, "GET", undefined, parent.token);
  check("linked parent sees no overdue notice for a child with a pending submission", s3Notices.status === 200 && s3Notices.data.length === 0, s3Notices.data);
  await db.parentLink.create({ data: { parentId: parent.id, studentId: students.s3.id, status: "approved" } });
  const notices = await req(`/children/${students.s3.id}/assignment-notices`, "GET", undefined, parent.token);
  check("linked parent sees one overdue notice for the unsubmitted child", notices.data?.length === 1 && notices.data[0].assignmentId === aid && notices.data[0].revision === 1, notices.data);
  const bell = await req("/me/notifications", "GET", undefined, parent.token);
  check("the panel notice is the stored notification the bell shows (acc-3)", bell.data?.items?.some((n) => n.id === notices.data?.[0]?.id && n.type === "ASSIGNMENT_OVERDUE"), bell.data);
  check("parent notice holds no answers or scores", !JSON.stringify(notices.data).match(/score|answers|questions|lateReason/));
  const parentDetail = await req(`/children/${students.s3.id}/assignments/${aid}`, "GET", undefined, parent.token);
  check("parent detail is status and deadline only", parentDetail.status === 200 && parentDetail.data.status === "OVERDUE_UNSUBMITTED" && !("state" in parentDetail.data), parentDetail.data);
  const pendingParentDenied = await req(`/children/${students.s1.id}/assignment-notices`, "GET", undefined, pendingParent.token);
  check("pending parent link is denied", pendingParentDenied.status === 403, pendingParentDenied.data);
  const otherChild = await req(`/children/${students.s2.id}/assignment-notices`, "GET", undefined, parent.token);
  check("parent cannot read an unlinked child", otherChild.status === 403, otherChild.data);

  // ---------- 3.5 teacher queue and status ----------
  const queue = await req(`/classes/${classroom.id}/late-queue`, "GET", undefined, owner.token);
  check("late queue lists both current pending submissions with reasons", queue.data?.length === 2 && queue.data.every((q) => q.lateReason && q.permittedDecisions.includes("REVISE_DEADLINE_FOR_CLASS")), queue.data);
  const foreignQueue = await req(`/classes/${classroom.id}/late-queue`, "GET", undefined, outsiderTeacher.token);
  check("non-owner cannot read the late queue", code(foreignQueue, 403, "CLASS_ACCESS_DENIED"), foreignQueue.data);
  const foreignStatus = await req(`/classes/${classroom.id}/assignments/${aid}/test-status`, "GET", undefined, outsiderTeacher.token);
  check("non-owner cannot read test status", code(foreignStatus, 403, "CLASS_ACCESS_DENIED"), foreignStatus.data);
  const status = await req(`/classes/${classroom.id}/assignments/${aid}/test-status`, "GET", undefined, owner.token);
  const byId = Object.fromEntries((status.data?.students ?? []).map((row) => [row.student.id, row.status]));
  check(
    "teacher status matches student states",
    byId[students.s1.id] === "LATE_REVIEW_PENDING" && byId[students.s2.id] === "LATE_REVIEW_PENDING" && byId[students.s3.id] === "OVERDUE_UNSUBMITTED" && status.data.students.length === 3,
    byId,
  );
  const summary = (await req(`/classes/${classroom.id}/assignments`, "GET", undefined, owner.token)).data.find((a) => a.id === aid);
  check("teacher list summary counts states", summary.testSummary.counts.LATE_REVIEW_PENDING === 2 && summary.testSummary.counts.OVERDUE_UNSUBMITTED === 1, summary.testSummary);

  // ---------- 3.3 reject and revise ----------
  const s1Older = onTime.data.submission.id;
  const superseded = await req(`/classes/${classroom.id}/assignments/${aid}/late-submissions/${s1Older}/reject`, "POST", {}, owner.token, key());
  check("an on-time submission cannot be rejected", code(superseded, 409, "LATE_SUBMISSION_NOT_PENDING"), superseded.data);
  const foreignReject = await req(`/classes/${classroom.id}/assignments/${aid}/late-submissions/${lateS2.data.submission.id}/reject`, "POST", {}, outsiderTeacher.token, key());
  check("non-owner cannot reject", code(foreignReject, 403, "CLASS_ACCESS_DENIED"), foreignReject.data);
  const reject = await req(`/classes/${classroom.id}/assignments/${aid}/late-submissions/${lateS2.data.submission.id}/reject`, "POST", { note: "Không đủ căn cứ" }, owner.token, key());
  check("owner rejects s2's late submission with zero", reject.status === 201 && reject.data.score === 0, reject.data);
  const again = await req(`/classes/${classroom.id}/assignments/${aid}/late-submissions/${lateS2.data.submission.id}/reject`, "POST", {}, owner.token, key());
  check("a decided submission cannot be decided again", code(again, 409, "LATE_SUBMISSION_NOT_PENDING"), again.data);
  const s2View = await req(`/assignments/${aid}`, "GET", undefined, students.s2.token);
  check("student sees the rejection as zero with reason kept", s2View.data.state.status === "REJECTED" && s2View.data.state.current.score === 0 && s2View.data.state.current.lateReason === "Em bị ốm", s2View.data.state);

  const newDue = new Date(Date.now() + 2 * 86400_000);
  const stale = await req(`/classes/${classroom.id}/assignments/${aid}/deadline-revisions`, "POST", { dueAt: newDue.toISOString(), expectedRevision: 2 }, owner.token, key());
  check("stale expected revision is a conflict", code(stale, 409, "DEADLINE_REVISION_STALE"), stale.data);
  const notLater = await req(`/classes/${classroom.id}/assignments/${aid}/deadline-revisions`, "POST", { dueAt: new Date(Date.now() - 60_000).toISOString(), expectedRevision: 1 }, owner.token, key());
  check("a deadline in the past is rejected", code(notLater, 400, "DUE_DATE_NOT_LATER"), notLater.data);
  const foreignRevise = await req(`/classes/${classroom.id}/assignments/${aid}/deadline-revisions`, "POST", { dueAt: newDue.toISOString(), expectedRevision: 1 }, outsiderTeacher.token, key());
  check("non-owner cannot revise the deadline", code(foreignRevise, 403, "CLASS_ACCESS_DENIED"), foreignRevise.data);
  const reviseKey = key();
  const reviseBody = { dueAt: newDue.toISOString(), expectedRevision: 1, note: "Dời hạn cho cả nhóm", submissionId: lateS1.data.submission.id };
  const revised = await req(`/classes/${classroom.id}/assignments/${aid}/deadline-revisions`, "POST", reviseBody, owner.token, reviseKey);
  check("owner revises the same assignment for all three recipients", revised.status === 201 && revised.data.deadline.revision === 2 && revised.data.recipientCount === 3 && revised.data.acceptedSubmissions === 1, revised.data);
  const reviseReplay = await req(`/classes/${classroom.id}/assignments/${aid}/deadline-revisions`, "POST", reviseBody, owner.token, reviseKey);
  check("revision retry replays without a third revision", reviseReplay.status === 201 && (await db.assignmentDeadlineRevision.count({ where: { assignmentId: aid } })) === 2, reviseReplay.data);
  check("no second assignment was created", (await db.assignment.count({ where: { classId: classroom.id } })) === 1);

  const s1After = await req(`/assignments/${aid}`, "GET", undefined, students.s1.token);
  check("pending late work is accepted by the extension and scored", s1After.data.state.status === "SUBMITTED" && s1After.data.state.current.status === "ACCEPTED_BY_EXTENSION" && s1After.data.state.current.score === 50, s1After.data.state.current);
  check("student sees the new deadline and extension", s1After.data.state.extended && new Date(s1After.data.state.dueAt).getTime() === newDue.getTime(), s1After.data.state);
  check("earlier attempts remain in history", s1After.data.state.history.length === 2 && s1After.data.state.history[1].status === "SCORED");
  const s3After = await req(`/assignments/${aid}`, "GET", undefined, students.s3.token);
  check("unsubmitted recipient is back to upcoming under the new deadline", s3After.data.state.status === "UPCOMING" && !s3After.data.state.lateReasonRequired, s3After.data.state);
  const noticesAfter = await req(`/children/${students.s3.id}/assignment-notices`, "GET", undefined, parent.token);
  check("extension clears the parent overdue notice", noticesAfter.data?.length === 0, noticesAfter.data);
  const nonTargetAfter = await req(`/assignments/${aid}`, "GET", undefined, students.nontarget.token);
  check("extension grants no access to a non-target", code(nonTargetAfter, 404, "ASSIGNMENT_NOT_FOUND"), nonTargetAfter.data);

  const resubmit = await req(`/assignments/${aid}/submissions`, "POST", { answers: answers([1, 0]) }, students.s2.token, key());
  check("a rejected student may resubmit on time against the new deadline", resubmit.status === 201 && resubmit.data.submission.status === "SCORED" && resubmit.data.state.status === "SUBMITTED", resubmit.data);
  const s2History = resubmit.data.state.history.map((h) => h.status);
  check("the rejected attempt stays immutable in history", s2History.length === 2 && s2History[1] === "REJECTED_ZERO", s2History);
  const queueAfter = await req(`/classes/${classroom.id}/late-queue`, "GET", undefined, owner.token);
  check("late queue is empty after the decisions", queueAfter.data?.length === 0, queueAfter.data);
  const audits = await db.auditLog.findMany({ where: { targetId: { in: [aid, lateS2.data.submission.id] } }, select: { action: true } });
  check("decisions and revisions are audited", ["assignment.create", "assignment.late_reject", "assignment.deadline_revise"].every((a) => audits.some((row) => row.action === a)), audits);

  console.log(`\nI3 integration: ${passed} checks passed`);
} finally {
  const classes = await db.classroom.findMany({ where: { teacherId: { in: createdUsers } }, select: { id: true } });
  const classIds = classes.map((c) => c.id);
  await db.assignment.deleteMany({ where: { classId: { in: classIds } } });
  await db.classResource.deleteMany({ where: { classId: { in: classIds } } });
  await db.classroom.deleteMany({ where: { id: { in: classIds } } });
  await db.idempotencyRecord.deleteMany({ where: { actorId: { in: createdUsers } } });
  await db.auditLog.deleteMany({ where: { actorId: { in: createdUsers } } });
  await db.session.deleteMany({ where: { userId: { in: createdUsers } } });
  await db.user.deleteMany({ where: { id: { in: createdUsers } } });
  await db.$disconnect();
}
