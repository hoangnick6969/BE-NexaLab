// TAI-03 real-dependency journey (TAI3-T6): question duplicate warnings (qdup@1, Part A) and submission
// similarity evidence (subsim@1, Part B) against the running API and its database, with an outsider probe,
// student and parent isolation, negative fixtures and an audit reconciliation. Every fixture uses a unique
// prefix and is removed afterwards (including the audit rows of the fixture actors).
//   TEST_API=http://127.0.0.1:4100/api npx tsx scripts/tai03-integration.mjs
import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import * as argon from "argon2";
import { computeSubmissionSimilarity } from "../src/modules/ai/application/submission-similarity.ts";

const db = new PrismaClient();
const origin = process.env.TEST_API ?? "http://127.0.0.1:4100/api";
const prefix = "tai03-" + Date.now().toString(36);
const password = "Tai03-Journey-Password-2026!";
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
const SIMILARITY_KEYS = ["similarity", "containment", "maxContainment", "spansA", "spansB", "perPrompt", "inputDigest", "algorithmVersion", "matchCount"];
const leaks = (value) => SIMILARITY_KEYS.filter((k) => JSON.stringify(value ?? null).includes(`"${k}"`));

async function user(label, role, extra = {}) {
  const row = await db.user.create({
    data: {
      ...(role === "STUDENT" ? { username: `${prefix}-${label}` } : { email: `${prefix}-${label}@example.test` }),
      fullName: `TAI03 ${label}`,
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

/** Letter-only pseudo words: no digits, never a unit token, unique per index. */
const L = "abcdefghijklmnopqrstuvwxyz";
const word = (i) => "xy" + L[i % 26] + L[Math.floor(i / 26) % 26] + L[Math.floor(i / 676) % 26];
const words = (from, count) => Array.from({ length: count }, (_, i) => word(from + i)).join(" ");

const VN_A =
  "Khi có dòng điện chạy qua, các electron tự do trong dây tóc bóng đèn va chạm liên tục với các ion của kim loại vonfram. Mỗi lần va chạm làm năng lượng của dòng điện chuyển hóa thành nhiệt năng, vì vậy dây tóc nóng lên rất nhanh. Khi nhiệt độ đạt khoảng hai nghìn độ thì dây tóc phát ra ánh sáng trắng, đây chính là tác dụng nhiệt và tác dụng phát sáng của dòng điện trong đời sống hằng ngày.";
const VN_B = VN_A.replace("liên tục", "liên hồi").replace("rất nhanh", "khá nhanh");
const VN_B_NEW =
  "Dây tóc bóng đèn được làm từ vonfram có điện trở suất lớn và tiết diện rất nhỏ nên điện trở của nó cao. Dòng điện qua dây tóc tỏa nhiệt theo định luật Jun Len xơ, nhiệt độ tăng dần cho đến khi dây tóc nóng sáng. Người ta đặt dây tóc trong bóng thủy tinh chứa khí trơ để hạn chế sự oxi hóa và kéo dài tuổi thọ của bóng đèn trong quá trình sử dụng.";
const PROMPT = words(1000, 150); // a long prompt that students copy
const FORMULAS = "U = I.R và Q = I^2.R.t";
const SHARED_BLOCKS = [0, 1, 2, 3].map((i) => words(4000 + i * 25, 25)); // one declared common passage of 100 words
const textC = `${PROMPT} ${FORMULAS} ${words(2000, 45)}`;
const textD = `${PROMPT} ${FORMULAS} ${words(3000, 45)}`;
const textE = `${SHARED_BLOCKS.join(" ")} ${words(5000, 45)}`;
const textF = `${SHARED_BLOCKS.join(" ")} ${words(6000, 45)}`;
const day = 24 * 3600_000;

try {
  const owner = await user("owner", "TEACHER");
  const outsider = await user("outsider-teacher", "TEACHER");
  const students = {};
  for (const label of ["a", "b", "c", "d", "e", "f"]) students[label] = await user(label, "STUDENT");
  const parent = await user("parent", "PARENT", { emailVerifiedAt: new Date() });
  const lesson = await db.lesson.findFirst({ where: { scope: "SHARED_LIBRARY", status: "published" }, select: { id: true } });
  assert.ok(lesson, "a published shared lesson exists for the resource link");

  const classA = await db.classroom.create({ data: { teacherId: owner.id, name: `${prefix} class A`, grade: 8 } });
  const classB = await db.classroom.create({ data: { teacherId: owner.id, name: `${prefix} class B`, grade: 8 } });
  const classO = await db.classroom.create({ data: { teacherId: outsider.id, name: `${prefix} outsider class`, grade: 8 } });
  classIds.push(classA.id, classB.id, classO.id);
  for (const label of Object.keys(students)) await db.enrollment.create({ data: { classId: classA.id, studentId: students[label].id, status: "approved", approved: true } });
  await db.parentLink.create({ data: { parentId: parent.id, studentId: students.a.id, status: "approved" } });

  // ---------- Part A: qdup@1 (TAI3-T1, TAI3-T2) ----------
  const question = "Đơn vị đo điện trở trong hệ SI là gì và ký hiệu của nó như thế nào?";
  const quiz = (title, text) => ({ kind: "STUDY_QUIZ", title, lessonId: lesson.id, content: { questions: [{ prompt: text, options: ["Vôn", "Ôm"], correctOption: 1, explanation: "Điện trở đo bằng ôm" }] } });
  const quizA = await req(`/classes/${classA.id}/resources`, "POST", quiz(`${prefix} Quiz A`, question), owner.token, key());
  check("owner creates a quiz in class A", quizA.status === 201, quizA.data);
  const quizAId = quizA.data.id;
  check("a first question has no duplicate warning", (quizA.data.duplicateWarnings ?? []).length === 0, quizA.data.duplicateWarnings);
  const quizO = await req(`/classes/${classO.id}/resources`, "POST", quiz(`${prefix} Outsider quiz`, question), outsider.token, key());
  check("the outsider teacher creates the identical question in their own class", quizO.status === 201, quizO.data);
  check("qdup fingerprints exist for both classes", (await db.questionFingerprint.count({ where: { classId: { in: [classA.id, classO.id] } } })) === 2);

  const variant = "  " + question.toUpperCase() + "  ";
  const direct = await req(`/classes/${classB.id}/resources`, "POST", { kind: "TEST", title: `${prefix} copied test`, lessonId: lesson.id, content: { questions: [{ prompt: variant, options: ["Vôn", "Ôm"], correctOption: 1 }] } }, owner.token, key());
  check("a copied question is saved, never blocked", direct.status === 201, direct.data);
  const warning = direct.data.duplicateWarnings?.[0]?.matches?.[0];
  check("the copy warns EXACT_DUPLICATE_ELSEWHERE with the source title and class", warning?.flag === "EXACT_DUPLICATE_ELSEWHERE" && warning.level === "EXACT" && warning.source.title === `${prefix} Quiz A` && warning.source.className === `${prefix} class A`, direct.data.duplicateWarnings);
  check("the outsider's identical question never appears", !JSON.stringify(direct.data.duplicateWarnings).includes(`${prefix} Outsider`) && direct.data.duplicateWarnings[0].matches.length === 1);
  const dupCheck = await req(`/classes/${classB.id}/resources/duplicate-check`, "POST", { kind: "TEST", items: [{ text: question }] }, owner.token);
  check("duplicate-check is read-only and returns the same single match", dupCheck.status === 200 && dupCheck.data.warnings?.[0]?.matches?.length === 1, dupCheck.data);
  const dupForeign = await req(`/classes/${classA.id}/resources/duplicate-check`, "POST", { kind: "TEST", items: [{ text: question }] }, outsider.token);
  check("another teacher cannot check against a class they do not own", code(dupForeign, 403, "CLASS_ACCESS_DENIED"), dupForeign.data);
  const dupOutsider = await req(`/classes/${classO.id}/resources/duplicate-check`, "POST", { kind: "TEST", items: [{ text: question }] }, outsider.token);
  check("the outsider's own check never shows the owner's content", !JSON.stringify(dupOutsider.data).includes(`${prefix} Quiz A`) && !JSON.stringify(dupOutsider.data).includes(`${prefix} class A`), dupOutsider.data);
  for (const [who, token] of [["student", students.a.token], ["parent", parent.token]]) {
    const denied = await req(`/classes/${classB.id}/resources/duplicate-check`, "POST", { kind: "TEST", items: [{ text: question }] }, token);
    check(`${who} cannot call duplicate-check`, denied.status === 403, denied.data);
  }

  // ---------- Part B: a written assignment with the rubric commonPhrases ----------
  const rubric = { code: "GIAI_THICH", description: "Giải thích đúng", maxPoints: 2, anchors: [{ points: 0, description: "Không giải thích" }, { points: 2, description: "Giải thích đầy đủ" }] };
  const written = await req(`/classes/${classA.id}/resources`, "POST", { kind: "WRITTEN_TASK", title: `${prefix} written`, lessonId: lesson.id, content: { prompts: [{ prompt: PROMPT, maxChars: 3000, commonPhrases: SHARED_BLOCKS, criteria: [rubric] }] } }, owner.token, key());
  check("owner creates the written task with commonPhrases", written.status === 201, written.data);
  const resourceId = written.data.id;
  check("a written task never creates question fingerprints", (await db.questionFingerprint.count({ where: { sourceId: resourceId } })) === 0);
  const publish = await req(`/classes/${classA.id}/resources/${resourceId}/publish`, "POST", undefined, owner.token);
  check("owner publishes the written task", publish.status === 201, publish.data);
  const assign = async (due, studentIds = []) => req(`/classes/${classA.id}/assignments`, "POST", { contentType: "written", contentId: resourceId, dueDate: new Date(Date.now() + due).toISOString(), studentIds }, owner.token, key());
  const w1 = await assign(5 * day);
  const w2 = await assign(6 * day);
  const w3 = await assign(7 * day, [students.a.id]);
  check("owner assigns three written assignments", [w1, w2, w3].every((a) => a.status === 201), [w1.data, w2.data, w3.data]);
  const [W1, W2, W3] = [w1, w2, w3].map((a) => a.data.assignment.id);
  const lessonAssignment = await req(`/classes/${classA.id}/assignments`, "POST", { contentType: "lesson", contentId: lesson.id, dueDate: null, studentIds: [] }, owner.token, key());
  check("owner assigns a lesson to prove the written-only rule", lessonAssignment.status === 201, lessonAssignment.data);
  const LESSON_A = lessonAssignment.data.assignment.id;

  const submit = async (label, assignmentId, text) => {
    const detail = await req(`/assignments/${assignmentId}`, "GET", undefined, students[label].token);
    assert.equal(detail.status, 200, `${label} opens ${assignmentId}`);
    const result = await req(`/assignments/${assignmentId}/submissions`, "POST", { responses: [{ promptId: detail.data.content.prompts[0].id, text }] }, students[label].token, key());
    assert.equal(result.status, 201, `${label} submits ${JSON.stringify(result.data)}`);
    return result.data.submission.id;
  };
  const sub = {};
  sub.a = await submit("a", W1, VN_A);
  sub.b = await submit("b", W1, VN_B);
  sub.c = await submit("c", W1, textC);
  sub.d = await submit("d", W1, textD);
  sub.e = await submit("e", W1, textE);
  sub.f = await submit("f", W1, textF);
  check("six answers are submitted and await the teacher grade", (await db.assignmentSubmission.count({ where: { assignmentId: W1 } })) === 6);

  // W2: student a repeats the same text as in W1; it must never be compared with W1 submissions.
  await submit("a", W2, VN_A);
  await submit("c", W2, words(7000, 80));
  await submit("e", W2, words(8000, 80));
  // W3: a single submission.
  await submit("a", W3, VN_A);

  // The fixture proves itself: without the prompt and the commonPhrases the negative pairs would be reported.
  const asInput = (map) => Object.entries(map).map(([label, text]) => ({ id: label, studentId: label, responses: [{ promptId: "p1", text }] }));
  const all = { a: VN_A, b: VN_B, c: textC, d: textD, e: textE, f: textF };
  const withRules = computeSubmissionSimilarity({ prompts: [{ id: "p1", text: PROMPT, commonPhrases: SHARED_BLOCKS }], submissions: asInput(all) });
  const withoutRules = computeSubmissionSimilarity({ prompts: [{ id: "p1", text: "" }], submissions: asInput(all) });
  const pairs = (r) => r.matches.map((m) => m.submissionAId + m.submissionBId).sort();
  check("the pure function flags only the copied pair with the exclusions", JSON.stringify(pairs(withRules)) === JSON.stringify(["ab"]), pairs(withRules));
  check("control: without the exclusions the prompt-copy and common-phrase pairs would be flagged", ["ab", "cd", "ef"].every((p) => pairs(withoutRules).includes(p)), pairs(withoutRules));

  // ---------- access probes before any run ----------
  const base = (assignmentId) => `/classes/${classA.id}/assignments/${assignmentId}/similarity-runs`;
  for (const [who, token] of [["outsider teacher", outsider.token], ["student", students.a.token], ["parent", parent.token]]) {
    const post = await req(base(W1), "POST", {}, token, key());
    const list = await req(base(W1), "GET", undefined, token);
    check(`${who} cannot run or list similarity`, (post.status === 403) && (list.status === 403), [post.data, list.data]);
  }
  check("no run exists after the denied attempts", (await db.submissionSimilarityRun.count({ where: { assignmentId: W1 } })) === 0);
  const lessonRun = await req(base(LESSON_A), "POST", {}, owner.token, key());
  check("a lesson assignment cannot be checked", code(lessonRun, 409, "NOT_A_WRITTEN_ASSIGNMENT"), lessonRun.data);
  const smallRun = await req(base(W3), "POST", {}, owner.token, key());
  check("fewer than 2 submissions return SIMILARITY_INPUT_TOO_SMALL", code(smallRun, 409, "SIMILARITY_INPUT_TOO_SMALL"), smallRun.data);
  const foreignRun = await req(`/classes/${classO.id}/assignments/${W1}/similarity-runs`, "POST", {}, outsider.token, key());
  check("an assignment of another class is not found even for its class owner", code(foreignRun, 404, "ASSIGNMENT_NOT_FOUND"), foreignRun.data);

  // ---------- snapshot, then the owner's similarity journey ----------
  const snapshot = async () => JSON.stringify([
    await db.assignmentSubmission.findMany({ where: { assignmentId: { in: [W1, W2, W3] } }, orderBy: { id: "asc" } }),
    await db.assignment.findMany({ where: { classId: classA.id }, orderBy: { id: "asc" } }),
    await db.notification.count({ where: { recipientId: { in: createdUsers } } }),
    await db.writtenGradeDecision.count({ where: { submission: { assignmentId: { in: [W1, W2, W3] } } } }),
  ]);
  const before = await snapshot();

  const runKey = key();
  const run1 = await req(base(W1), "POST", {}, owner.token, runKey);
  check("run 1 returns 201 and is not a replay", run1.status === 201 && run1.data.replayed === false && run1.data.run.submissionCount === 6, run1.data);
  check("run 1 reports exactly one pair", run1.data.run.matchCount === 1 && run1.data.run.skipped.length === 0, run1.data.run);
  const runId = run1.data.run.id;
  const detail1 = await req(`${base(W1)}/${runId}`, "GET", undefined, owner.token);
  const [match] = detail1.data.matches;
  check("only the copied pair is flagged (prompt, formula and commonPhrases pairs are not)", detail1.data.matches.length === 1 && [match.submissionA.id, match.submissionB.id].sort().join() === [sub.a, sub.b].sort().join() && match.level === "HIGH", detail1.data.matches);
  const prompt1 = match.perPrompt[0];
  check("the detail carries the prompt text and both responses", prompt1.promptText === PROMPT && [prompt1.textA, prompt1.textB].sort().join("|") === [VN_A, VN_B].sort().join("|"));
  check("spans slice the exact Vietnamese text on both sides", [prompt1.spansA, prompt1.spansB].every((spans, i) => spans.length > 0 && spans.length <= 10 && spans.every((s) => (i === 0 ? prompt1.textA : prompt1.textB).slice(s.start, s.end).length > 0)));
  check("student names are shown to the owner", match.submissionA.student?.fullName?.startsWith("TAI03"));

  const replay = await req(base(W1), "POST", {}, owner.token, key());
  check("running again with an unchanged set returns 200 replayed with the same run", replay.status === 200 && replay.data.replayed === true && replay.data.run.id === runId, replay.data);
  const sameKey = await req(base(W1), "POST", {}, owner.token, runKey);
  check("the same Idempotency-Key returns the stored response", sameKey.data?.run?.id === runId, sameKey.data);
  check("a single run exists for the digest", (await db.submissionSimilarityRun.count({ where: { assignmentId: W1 } })) === 1);
  const list1 = await req(base(W1), "GET", undefined, owner.token);
  check("the list shows the run as current", list1.data.items.length === 1 && list1.data.items[0].stale === false, list1.data);

  const noted = await req(`${base(W1)}/${runId}/matches/${match.id}/reviews`, "POST", { status: "NOTED", note: "Cần hỏi lại học sinh" }, owner.token, key());
  const dismissed = await req(`${base(W1)}/${runId}/matches/${match.id}/reviews`, "POST", { status: "DISMISSED" }, owner.token, key());
  check("reviews are appended", noted.status === 201 && dismissed.status === 201, [noted.data, dismissed.data]);
  const badReview = await req(`${base(W1)}/${runId}/matches/${match.id}/reviews`, "POST", { status: "MAYBE" }, owner.token, key());
  check("an invalid review status is rejected", badReview.status === 400, badReview.data);
  const outsiderReview = await req(`${base(W1)}/${runId}/matches/${match.id}/reviews`, "POST", { status: "NOTED" }, outsider.token, key());
  check("another teacher cannot review", code(outsiderReview, 403, "CLASS_ACCESS_DENIED"), outsiderReview.data);
  const detail2 = await req(`${base(W1)}/${runId}`, "GET", undefined, owner.token);
  check("the newest review is current and the history is kept", detail2.data.matches[0].review.status === "DISMISSED" && detail2.data.matches[0].reviewCount === 2);
  check("two review rows exist", (await db.similarityMatchReview.count({ where: { matchId: match.id } })) === 2);
  check("the run, the review and the replay changed no score, grade, status or notification", (await snapshot()) === before);

  // ---------- no cross-assignment comparison ----------
  const runW2 = await req(base(W2), "POST", {}, owner.token, key());
  const detailW2 = await req(`${base(W2)}/${runW2.data.run.id}`, "GET", undefined, owner.token);
  const w2Ids = (await db.assignmentSubmission.findMany({ where: { assignmentId: W2 }, select: { id: true } })).map((s) => s.id);
  check("a run covers one assignment only: W2 text equal to a W1 answer matches nothing", runW2.status === 201 && runW2.data.run.submissionCount === 3 && runW2.data.run.matchCount === 0, runW2.data);
  check("W2 matches never name a W1 submission", detailW2.data.matches.every((m) => w2Ids.includes(m.submissionA.id) && w2Ids.includes(m.submissionB.id)));
  check("the W1 run is unchanged by the W2 run", (await db.submissionSimilarityMatch.count({ where: { runId } })) === 1);

  // ---------- student and parent isolation ----------
  const studentViews = [
    await req(`/assignments/${W1}`, "GET", undefined, students.a.token),
    await req(`/assignments/${W1}`, "GET", undefined, students.b.token),
    await req("/assignments", "GET", undefined, students.a.token),
  ];
  check("student views carry no similarity key", studentViews.every((v) => v.status === 200 && leaks(v.data).length === 0), studentViews.map((v) => leaks(v.data)));
  check("a student's status and score are unchanged by the run", studentViews[0].data.state.status === "AWAITING_GRADE" && studentViews[0].data.state.current.score === null, studentViews[0].data.state);
  const parentView = await req(`/children/${students.a.id}/assignments/${W1}`, "GET", undefined, parent.token);
  check("the parent sees the status only, no similarity", parentView.status === 200 && parentView.data.status === "AWAITING_GRADE" && leaks(parentView.data).length === 0, parentView.data);
  const studentNotes = await req("/me/notifications", "GET", undefined, students.a.token);
  check("notifications never mention similarity", leaks(studentNotes.data).length === 0 && !JSON.stringify(studentNotes.data).toLowerCase().includes("tương đồng"));
  for (const [who, token] of [["student", students.a.token], ["parent", parent.token]]) {
    const detailDenied = await req(`${base(W1)}/${runId}`, "GET", undefined, token);
    const reviewDenied = await req(`${base(W1)}/${runId}/matches/${match.id}/reviews`, "POST", { status: "NOTED" }, token, key());
    check(`${who} cannot read a run or review a pair`, detailDenied.status === 403 && reviewDenied.status === 403);
  }

  // ---------- a resubmission makes the run stale; a rerun is a new run ----------
  const bAgain = await submit("b", W1, VN_B_NEW);
  const staleList = await req(base(W1), "GET", undefined, owner.token);
  check("after a resubmission the old run is stale", staleList.data.items[0].id === runId && staleList.data.items[0].stale === true, staleList.data);
  const staleDetail = await req(`${base(W1)}/${runId}`, "GET", undefined, owner.token);
  check("the stale run is still readable and reviewable", staleDetail.status === 200 && staleDetail.data.run.stale === true);
  const run2 = await req(base(W1), "POST", {}, owner.token, key());
  check("a rerun creates a new run (201) without the former pair", run2.status === 201 && run2.data.replayed === false && run2.data.run.id !== runId && run2.data.run.matchCount === 0, run2.data);
  check("the superseded submission is not used", (await db.submissionSimilarityMatch.count({ where: { OR: [{ submissionAId: bAgain }, { submissionBId: bAgain }] } })) === 0);
  const listAfter = await req(base(W1), "GET", undefined, owner.token);
  check("the list is newest first with one stale run left", listAfter.data.items.map((r) => r.stale).join() === "false,true");

  // ---------- audit reconciliation ----------
  const runAudits = await db.auditLog.findMany({ where: { action: "similarity_run.create", actorId: owner.id } });
  const reviewAudits = await db.auditLog.findMany({ where: { action: "similarity_match.review", actorId: owner.id } });
  const runRows = await db.submissionSimilarityRun.count({ where: { assignmentId: { in: [W1, W2, W3] } } });
  check("every created run has one audit row with replayed false", runAudits.filter((a) => a.after?.replayed === false).length === runRows && runRows === 3, runAudits.map((a) => a.after));
  check("the digest replay is audited once with replayed true", runAudits.filter((a) => a.after?.replayed === true).length === 1);
  check("both reviews are audited with their status and no note", reviewAudits.length === 2 && reviewAudits.every((a) => Object.keys(a.after).sort().join() === "matchId,runId,status") && !JSON.stringify(reviewAudits).includes("Cần hỏi lại"));
  check("run audits carry counts and no response text", runAudits.every((a) => !JSON.stringify(a).includes("dây tóc")) && runAudits.find((a) => a.targetId === runId && a.after.replayed === false)?.after.matchCount === 1);
  const foreignSimilarityAudits = await db.auditLog.count({ where: { action: { startsWith: "similarity_" }, actorId: { in: [outsider.id, parent.id, ...Object.values(students).map((s) => s.id)] } } });
  check("no similarity audit row exists for the denied actors", foreignSimilarityAudits === 0);

  console.log(`\nTAI-03 journey: ${passed} checks passed`);
} finally {
  const assignments = await db.assignment.findMany({ where: { classId: { in: classIds } }, select: { id: true } });
  await db.submissionSimilarityRun.deleteMany({ where: { assignmentId: { in: assignments.map((a) => a.id) } } });
  await db.questionFingerprint.deleteMany({ where: { classId: { in: classIds } } });
  await db.notification.deleteMany({ where: { recipientId: { in: createdUsers } } });
  await db.assignment.deleteMany({ where: { classId: { in: classIds } } });
  await db.classResource.deleteMany({ where: { classId: { in: classIds } } });
  await db.enrollment.deleteMany({ where: { classId: { in: classIds } } });
  await db.classroom.deleteMany({ where: { id: { in: classIds } } });
  await db.idempotencyRecord.deleteMany({ where: { actorId: { in: createdUsers } } });
  await db.auditLog.deleteMany({ where: { actorId: { in: createdUsers } } });
  await db.session.deleteMany({ where: { userId: { in: createdUsers } } });
  await db.user.deleteMany({ where: { id: { in: createdUsers } } });
  await db.$disconnect();
}
