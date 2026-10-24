// Student learning journey against the running API and its database:
//   flow 8 — Open Curriculum (I1 stories 1.1, 1.2, 1.5): catalog order and
//            eligibility, direct-link non-disclosure, assignment-free reading,
//            video and basic-exercise evidence, foundational progress;
//   flow 9 — assigned lesson pathway: lock reasons, quiz gate, lab step,
//            completion reflected in /me/progress and /assignments.
// All fixtures use a unique prefix and are removed afterwards.
//   TEST_API=http://127.0.0.1:4000/api npm run test:learning
import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import * as argon from "argon2";

const db = new PrismaClient();
const origin = process.env.TEST_API ?? "http://127.0.0.1:4100/api";
const prefix = "lrn-" + Date.now().toString(36);
const password = "Learning-Fixture-2026!";
const createdUsers = [];
const created = { chapters: [], packs: [], lessons: [], courseVersions: [] };
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

async function user(label, role, extra = {}) {
  const row = await db.user.create({
    data: {
      ...(role === "STUDENT" ? { username: `${prefix}-${label}` } : { email: `${prefix}-${label}@example.test` }),
      fullName: `LRN ${label}`,
      role,
      passwordHash: await argon.hash(password),
      consentAt: new Date(),
      ...extra,
    },
  });
  createdUsers.push(row.id);
  const path = role === "STUDENT" ? "/auth/student/login" : role === "ADMIN" ? "/auth/admin/login" : "/auth/login";
  const body = role === "STUDENT" ? { username: row.username, password } : { email: row.email, password };
  let login = await req(path, "POST", body);
  if (login.status === 429) {
    // The API keeps a 10/minute in-memory student-login limit per IP; wait out the window.
    console.log("     waiting 61 s for the login rate window");
    await sleep(61000);
    login = await req(path, "POST", body);
  }
  assert.equal(login.status, 201, `${label} login ${JSON.stringify(login.data)}`);
  return { id: row.id, token: login.data.accessToken };
}

const exercise = {
  passThreshold: 50,
  questions: [
    { id: "q1", prompt: "Đơn vị đo điện trở là gì?", options: [{ id: "a", text: "Ôm" }, { id: "b", text: "Vôn" }], correctOptionId: "a" },
    { id: "q2", prompt: "Dụng cụ đo cường độ dòng điện?", options: [{ id: "a", text: "Vôn kế" }, { id: "b", text: "Ampe kế" }], correctOptionId: "b" },
  ],
};

try {
  const admin = await user("admin", "ADMIN");
  const teacher = await user("teacher", "TEACHER");
  const parent = await user("parent", "PARENT", { emailVerifiedAt: new Date() });
  const studentA = await user("a", "STUDENT", { grade: 8 });
  const studentB = await user("b", "STUDENT", { grade: 8 });

  // ---------- flow 8: Open Curriculum fixtures ----------
  const chapter = (suffix, status = "active", officialOrder = 1) => ({
    code: `${prefix}-${suffix}`, subjectId: "physics", grade: 8, domain: "ENERGY", title: `${prefix} chương ${suffix}`, status, officialOrder,
  });
  await db.curriculumChapter.createMany({ data: [chapter("ch1"), chapter("ch2", "archived", 2)] });
  created.chapters.push(`${prefix}-ch1`, `${prefix}-ch2`);
  await db.curriculumTopic.createMany({
    data: [
      { code: `${prefix}-t1`, chapterCode: `${prefix}-ch1`, title: `${prefix} chủ đề 1`, officialOrder: 1 },
      { code: `${prefix}-t2`, chapterCode: `${prefix}-ch1`, title: `${prefix} chủ đề lưu trữ`, officialOrder: 2, status: "archived" },
    ],
  });
  await db.contentPack.create({ data: { key: `${prefix}-pack`, grade: 8, domain: "ENERGY", title: `${prefix} pack`, namespace: "baseline" } });
  created.packs.push(`${prefix}-pack`);
  const pack = (version, status) =>
    db.contentPackVersion.create({ data: { packKey: `${prefix}-pack`, version, digest: `${prefix}-${version}`, manifest: {}, status } });
  const released = await pack(1, "released");
  const retired = await pack(2, "retired");

  const lesson = async (label, data, steps = [{ type: "READING", position: 10, config: { html: `<p>${label}</p>` } }]) => {
    const row = await db.lesson.create({
      data: {
        subjectId: "physics", authorId: admin.id, title: `${prefix} ${label}`, chapter: "Điện", grade: 8, topic: "Dòng điện",
        learningObjective: "Nhận biết dòng điện", prerequisites: "Không", curriculum: "GDPT 2018 – KHTN 8", content: `<p>${label}</p>`,
        status: "published", scope: "SHARED_LIBRARY", packVersionId: released.id, curriculumChapterCode: `${prefix}-ch1`,
        ...data,
        steps: { create: steps.map((step) => ({ required: true, ...step })) },
      },
      include: { steps: { orderBy: { position: "asc" } } },
    });
    created.lessons.push(row.id);
    return row;
  };
  const open = await lesson("bài mở đầy đủ", { curriculumTopicCode: `${prefix}-t1`, curriculumOrder: 2 }, [
    { type: "READING", position: 10, config: { html: "<p>Dòng điện là dòng chuyển dời có hướng của các hạt mang điện.</p>" } },
    { type: "VIDEO", position: 20, config: { title: "Dòng điện", equivalentText: "<p>Bản chữ tương đương của video.</p>" } },
    { type: "BASIC_EXERCISE", position: 30, config: exercise },
    { type: "LAB", position: 50, config: { labId: "circuit" } },
  ]);
  const firstInTopic = await lesson("bài đầu chủ đề", { curriculumTopicCode: `${prefix}-t1`, curriculumOrder: 1 });
  const chapterLevel = await lesson("bài cấp chương", { curriculumOrder: 1 });
  const hidden = {
    draft: await lesson("nháp", { status: "draft" }),
    quarantined: await lesson("cách ly", { status: "quarantined" }),
    synthetic: await lesson("dữ liệu giả", { synthetic: true }),
    retiredPack: await lesson("gói đã thu hồi", { packVersionId: retired.id }),
    noPack: await lesson("chưa phát hành", { packVersionId: null }),
    classPrivate: await lesson("riêng lớp", { scope: "TEACHER_PRIVATE", authorId: teacher.id }),
  };
  const archivedChapter = await lesson("chương lưu trữ", { curriculumChapterCode: `${prefix}-ch2` });
  const archivedTopic = await lesson("chủ đề lưu trữ", { curriculumTopicCode: `${prefix}-t2` });

  // ---------- 1.1 catalog ----------
  const catalog = await req("/open-curriculum", "GET", undefined, studentA.token);
  const physics = catalog.data?.subjects?.find((subject) => subject.id === "physics");
  const grade8 = physics?.grades?.find((grade) => grade.grade === 8);
  const ch1 = grade8?.chapters?.find((item) => item.id === `${prefix}-ch1`);
  check("a student without a class sees released lessons under subject, grade and chapter", catalog.status === 200 && Boolean(ch1), catalog.data);
  check("chapter-level lessons are listed on the chapter", ch1.lessons.map((item) => item.id).join() === chapterLevel.id, ch1.lessons);
  const t1 = ch1.topics.find((topic) => topic.id === `${prefix}-t1`);
  check("topic lessons follow curriculum order", t1?.lessons.map((item) => item.id).join() === [firstInTopic.id, open.id].join(), t1?.lessons);
  const catalogText = JSON.stringify(catalog.data);
  check(
    "draft, quarantined, synthetic, retired, unreleased and class-private lessons are not listed",
    Object.values(hidden).every((item) => !catalogText.includes(item.id) && !catalogText.includes(item.title)),
  );
  check("an archived chapter is not listed", !grade8.chapters.some((item) => item.id === `${prefix}-ch2`) && !catalogText.includes(archivedChapter.id));
  check("an archived topic is not listed", !ch1.topics.some((topic) => topic.id === `${prefix}-t2`));
  const listed = ch1.lessons.length + ch1.topics.reduce((sum, topic) => sum + topic.lessons.length, 0);
  check("the chapter lesson count matches the lessons it lists", ch1.lessonCount === listed, { lessonCount: ch1.lessonCount, listed, archivedTopic: archivedTopic.id });
  for (const [role, actor] of [["teacher", teacher], ["parent", parent], ["admin", admin]]) {
    const denied = await req("/open-curriculum", "GET", undefined, actor.token);
    check(`${role} cannot read the student catalog`, denied.status === 403, denied.status);
  }
  check("an anonymous request is rejected", (await req("/open-curriculum")).status === 401);
  // Teacher-private lessons are published for their classes only; a parent account must not list them (QR-03).
  check("a parent cannot list lessons", (await req("/lessons", "GET", undefined, parent.token)).status === 403);

  // ---------- 1.2 lesson detail ----------
  const detail = await req(`/open-curriculum/lessons/${open.id}`, "GET", undefined, studentA.token);
  check(
    "lesson detail shows objective and only reading, video and basic-exercise steps",
    detail.status === 200 && detail.data.learningObjective === "Nhận biết dòng điện" &&
      detail.data.steps.map((step) => step.type).join() === "READING,VIDEO,BASIC_EXERCISE",
    detail.data,
  );
  const exerciseStep = detail.data.steps.find((step) => step.type === "BASIC_EXERCISE");
  check(
    "the basic exercise has no quiz gate and no answer key",
    exerciseStep.state === "NOT_STARTED" && exerciseStep.resource.questions.length === 2 && !JSON.stringify(detail.data).includes("correctOptionId"),
    exerciseStep,
  );
  const notFound = await req(`/open-curriculum/lessons/${prefix}-missing`, "GET", undefined, studentA.token);
  check("a missing lesson returns CURRICULUM_LESSON_NOT_FOUND", code(notFound, 404, "CURRICULUM_LESSON_NOT_FOUND"), notFound.data);
  for (const [label, item] of Object.entries(hidden)) {
    const direct = await req(`/open-curriculum/lessons/${item.id}`, "GET", undefined, studentA.token);
    check(
      `a ${label} lesson opened by direct link discloses nothing`,
      direct.status === 404 && direct.data?.code === notFound.data.code && direct.data?.message === notFound.data.message && !JSON.stringify(direct.data).includes(item.title),
      direct.data,
    );
  }
  check("a teacher cannot open the student lesson route", (await req(`/open-curriculum/lessons/${open.id}`, "GET", undefined, teacher.token)).status === 403);

  // ---------- 1.2 assignment-free evidence ----------
  const [reading, video] = detail.data.steps;
  const progress = (lessonId, stepId, body, token = studentA.token) => req(`/open-curriculum/lessons/${lessonId}/steps/${stepId}/progress`, "PUT", body, token);
  const read = await progress(open.id, reading.id, { action: "complete" });
  check("reading completes without an assignment", read.status === 200 && read.data.step.state === "COMPLETED" && read.data.step.progressValue === 100, read.data);
  const row = await db.stepProgress.findMany({ where: { studentId: studentA.id, stepId: reading.id } });
  check("reading evidence is stored once, outside any assignment", row.length === 1 && row[0].assignmentId === null, row);
  const wrongAction = await progress(open.id, reading.id, { action: "visit", cardIndex: 0 });
  check("an action the step does not accept is rejected", code(wrongAction, 400, "STEP_ACTION_INVALID"), wrongAction.data);
  const heartbeat = await progress(open.id, video.id, { action: "heartbeat", positionSeconds: 60, durationSeconds: 600 });
  check("a video heartbeat saves partial progress and position", heartbeat.data?.step?.state === "IN_PROGRESS" && heartbeat.data.step.progressValue === 10 && heartbeat.data.step.lastPosition === 60, heartbeat.data);
  const rewind = await progress(open.id, video.id, { action: "heartbeat", positionSeconds: 30, durationSeconds: 600 });
  check("rewinding does not lower saved video progress", rewind.data?.step?.progressValue === 10 && rewind.data.step.lastPosition === 60, rewind.data);
  const fallback = await progress(open.id, video.id, { action: "complete-fallback" });
  check("the approved equivalent text completes the video", fallback.data?.step?.state === "COMPLETED", fallback.data);
  const labStepId = open.steps.find((step) => step.type === "LAB").id;
  const exerciseViaProgress = await progress(open.id, exerciseStep.id, { action: "complete" });
  const labViaProgress = await progress(open.id, labStepId, { action: "complete" });
  check(
    "exercise and lab steps cannot be completed through the progress route",
    code(exerciseViaProgress, 404, "CURRICULUM_STEP_NOT_FOUND") && code(labViaProgress, 404, "CURRICULUM_STEP_NOT_FOUND"),
  );
  const hiddenReading = hidden.draft.steps[0];
  check("progress on an unreleased lesson is rejected", code(await progress(hidden.draft.id, hiddenReading.id, { action: "complete" }), 404, "CURRICULUM_STEP_NOT_FOUND"));

  const attempt = (answers, idempotencyKey = randomUUID(), lessonId = open.id, stepId = exerciseStep.id) =>
    req(`/open-curriculum/lessons/${lessonId}/exercises/${stepId}/attempts`, "POST", { answers, idempotencyKey }, studentA.token);
  const wrong = await attempt([{ questionId: "q1", optionId: "b" }, { questionId: "q2", optionId: "a" }]);
  check("a wrong exercise attempt is scored and not passed", wrong.status === 201 && wrong.data.score === 0 && wrong.data.passed === false, wrong.data);
  const invalid = await attempt([{ questionId: "q1", optionId: "z" }, { questionId: "q2", optionId: "a" }]);
  const partialAnswers = await attempt([{ questionId: "q1", optionId: "a" }]);
  check(
    "unknown options and missing answers are rejected",
    code(invalid, 400, "EXERCISE_ANSWERS_INVALID") && code(partialAnswers, 400, "EXERCISE_ANSWERS_INVALID"),
  );
  const retryKey = randomUUID();
  const right = await attempt([{ questionId: "q1", optionId: "a" }, { questionId: "q2", optionId: "b" }], retryKey);
  const replay = await attempt([{ questionId: "q1", optionId: "a" }, { questionId: "q2", optionId: "b" }], retryKey);
  check("a correct attempt passes and a retry with the same key replays it", right.data?.passed === true && right.data.score === 100 && replay.data?.id === right.data.id, { right: right.data, replay: replay.data });
  check(
    "an exercise on an unreleased lesson is rejected",
    code(await attempt([{ questionId: "q1", optionId: "a" }], randomUUID(), hidden.draft.id, hiddenReading.id), 404, "CURRICULUM_EXERCISE_NOT_FOUND"),
  );
  const after = await req(`/open-curriculum/lessons/${open.id}`, "GET", undefined, studentA.token);
  check(
    "reloading the lesson shows the saved evidence",
    after.data.steps.every((step) => step.state === "COMPLETED") && after.data.steps[2].exercise?.passed === true,
    after.data.steps,
  );
  const otherStudent = await req(`/open-curriculum/lessons/${open.id}`, "GET", undefined, studentB.token);
  check("another student's evidence is separate", otherStudent.data.steps.every((step) => step.state === "NOT_STARTED"), otherStudent.data.steps);

  // Simultaneous writes (two tabs, a retried request) must not duplicate evidence.
  const firstReading = firstInTopic.steps[0].id;
  const burst = await Promise.all(Array.from({ length: 6 }, () => progress(firstInTopic.id, firstReading, { action: "complete" }, studentB.token)));
  const burstRows = await db.stepProgress.count({ where: { studentId: studentB.id, stepId: firstReading } });
  check("parallel progress writes keep one evidence row", burst.every((res) => res.status === 200) && burstRows === 1, { statuses: burst.map((res) => res.status), burstRows });

  // ---------- 1.5 foundational progress ----------
  const courseId = `${prefix}-course`;
  await db.foundationalCourseVersion.create({
    data: {
      id: courseId, subjectId: "physics", grade: 8, version: prefix, status: "active", sourceVersion: "fixture",
      lessons: { create: [{ lessonId: open.id, officialOrder: 1 }, { lessonId: firstInTopic.id, officialOrder: 2 }, { lessonId: hidden.draft.id, officialOrder: 3 }] },
    },
  });
  created.courseVersions.push(courseId);
  const foundational = await req("/me/foundational-progress", "GET", undefined, studentA.token);
  const course = foundational.data?.courses?.find((item) => item.id === courseId);
  check("foundational progress uses the active course version", foundational.status === 200 && Boolean(course), foundational.data);
  check("an unreleased course lesson is not in the denominator", course.lessons.map((item) => item.id).join() === [open.id, firstInTopic.id].join(), course.lessons.map((item) => item.id));
  check(
    "content, video and basic-exercise evidence are counted separately",
    course.summary.content === 1 && course.summary.video === 1 && course.summary.basicExercise === 1 &&
      course.summary.totalEvidenceItems === 4 && course.summary.completedEvidenceItems === 3 && course.summary.percent === 75,
    course.summary,
  );
  const evidence = course.lessons[0].evidence;
  check("each evidence item names its source record and time", evidence.every((item) => item.sourceId && item.updatedAt), evidence);
  const courseB = (await req("/me/foundational-progress", "GET", undefined, studentB.token)).data.courses.find((item) => item.id === courseId);
  check("another student's foundational progress counts only their own evidence", courseB.summary.completedEvidenceItems === 1 && courseB.summary.content === 1, courseB.summary);

  // ---------- flow 9: assigned lesson pathway ----------
  const classroom = await db.classroom.create({ data: { teacherId: teacher.id, name: `${prefix} lớp`, grade: 8 } });
  await db.enrollment.create({ data: { classId: classroom.id, studentId: studentA.id, status: "approved", approved: true } });
  const lessonBody = {
    title: `${prefix} bài được giao`, subjectId: "physics", chapter: "Điện", grade: 8, topic: "Định luật Ohm",
    learningObjective: "Lắp mạch kín an toàn", prerequisites: "Mạch điện", curriculum: "GDPT 2018 – KHTN 8",
    content: "<p>Điện trở hạn chế dòng điện qua LED.</p>", labId: "circuit", status: "published", domain: "ENERGY", outcomeCodes: ["FX8-ENERGY-01"],
    review: {
      sources: "Tài liệu tự biên soạn kiểm thử luồng học", license: "ORIGINAL", outcome: "KHTN8 – Điện: lắp mạch kín an toàn",
      answerKeyChecked: true, safetyChecked: true, accessibilityChecked: true,
    },
  };
  const quizLesson = await req("/lessons", "POST", { ...lessonBody, questions: [{ prompt: `${prefix}: Tăng R thì I?`, options: ["Giảm", "Tăng"], answer: 0 }] }, teacher.token);
  const plainLesson = await req("/lessons", "POST", { ...lessonBody, title: `${prefix} bài không quiz`, questions: [] }, teacher.token);
  check("the teacher publishes lessons with and without a quiz", quizLesson.status === 201 && plainLesson.status === 201, { quiz: quizLesson.data, plain: plainLesson.data });
  created.lessons.push(quizLesson.data.id, plainLesson.data.id);
  const assign = (contentId) => req(`/classes/${classroom.id}/assignments`, "POST", { contentType: "lesson", contentId }, teacher.token, key());
  const quizAssign = await assign(quizLesson.data.id);
  const plainAssign = await assign(plainLesson.data.id);
  check("both lessons are assigned to the class", quizAssign.status === 201 && plainAssign.status === 201, { quiz: quizAssign.data, plain: plainAssign.data });
  const quizAid = quizAssign.data.assignment.id;
  const plainAid = plainAssign.data.assignment.id;
  const pathway = (lessonId, aid, token = studentA.token) => req(`/lessons/${lessonId}/pathway?assignmentId=${aid}`, "GET", undefined, token);
  const stepProgress = (lessonId, aid, stepId, body) => req(`/lessons/${lessonId}/steps/${stepId}/progress?assignmentId=${aid}`, "PUT", body, studentA.token);

  const plainPath = await pathway(plainLesson.data.id, plainAid);
  const plainLab = plainPath.data.steps.find((step) => step.type === "LAB");
  check(
    "without a quiz, a locked lab names the unfinished earlier step, not a quiz",
    plainPath.status === 200 && plainLab.state === "LOCKED" && plainLab.lockReasonCode === "PREREQUISITE_INCOMPLETE",
    plainPath.data?.steps,
  );
  const plainLabView = await req(`/lessons/${plainLesson.data.id}/steps/${plainLab.id}/lab?assignmentId=${plainAid}`, "GET", undefined, studentA.token);
  check("opening the locked lab is refused without mentioning a quiz", code(plainLabView, 403, "STEP_LOCKED") && !/kiểm tra/.test(plainLabView.data.message), plainLabView.data);

  let quizPath = await pathway(quizLesson.data.id, quizAid);
  check("an unassigned student cannot open the pathway", (await pathway(quizLesson.data.id, quizAid, studentB.token)).status === 404);
  const [qReading, qVideo] = quizPath.data.steps;
  check("only the first step is open at the start", quizPath.data.nextStepId === qReading.id && quizPath.data.steps.slice(1).every((step) => step.state === "LOCKED"), quizPath.data.steps);
  const skipped = await stepProgress(quizLesson.data.id, quizAid, qVideo.id, { action: "complete-fallback" });
  check("a later step cannot be completed before the earlier one", skipped.status === 404, skipped.data);
  const readDone = await stepProgress(quizLesson.data.id, quizAid, qReading.id, { action: "complete" });
  check("completing reading opens the next step", readDone.data?.step?.state === "COMPLETED" && readDone.data.pathway.nextStepId === qVideo.id, readDone.data?.pathway);
  const videoDone = await stepProgress(quizLesson.data.id, quizAid, qVideo.id, { action: "complete-fallback" });
  const quizStep = videoDone.data.pathway.steps.find((step) => step.type === "QUIZ");
  const lab = videoDone.data.pathway.steps.find((step) => step.type === "LAB");
  check(
    "after the video, the quiz opens and the lab waits for the quiz",
    quizStep.state === "IN_PROGRESS" && lab.state === "LOCKED" && lab.lockReasonCode === "QUIZ_NOT_PASSED",
    videoDone.data.pathway.steps,
  );
  const earlyLab = await req("/attempts", "POST", { challengeId: "circuit_001", lessonStepId: lab.id, labState: circuit(), durationMs: 500 }, studentA.token);
  check("a lab attempt before the quiz pass is refused", code(earlyLab, 403, "STEP_LOCKED"), earlyLab.data);
  const quiz = await req(`/lessons/${quizLesson.data.id}/quiz?assignmentId=${quizAid}`, "GET", undefined, studentA.token);
  const answer = (index) => ({ idempotencyKey: randomUUID(), answers: quiz.data.questions.map((q) => ({ questionId: q.id, optionId: q.options[index].id })) });
  const failed = await req(`/lessons/${quizLesson.data.id}/quiz-attempts?assignmentId=${quizAid}`, "POST", answer(1), studentA.token);
  check("a failed quiz keeps the lab locked", failed.status === 201 && failed.data.attempt?.passed === false && failed.data.pathway.steps.find((step) => step.type === "LAB").state === "LOCKED", failed.data);
  const passedQuiz = await req(`/lessons/${quizLesson.data.id}/quiz-attempts?assignmentId=${quizAid}`, "POST", answer(0), studentA.token);
  check("passing the quiz opens the lab", passedQuiz.data?.attempt?.passed === true && passedQuiz.data.pathway.steps.find((step) => step.type === "LAB").state === "IN_PROGRESS", passedQuiz.data);

  let progressRead = await req("/me/progress", "GET", undefined, studentA.token);
  let item = progressRead.data.assignments.find((entry) => entry.assignmentId === quizAid);
  check("progress shows the lesson as in progress before the lab", item && item.completed === false && item.completedRequired === 3 && item.nextStepId === lab.id, item);
  const labPass = await req("/attempts", "POST", { challengeId: "circuit_001", lessonStepId: lab.id, labState: circuit(), durationMs: 500 }, studentA.token);
  check("a safe circuit passes the lab step for this assignment", labPass.status === 201 && labPass.data.verdict === "passed" && labPass.data.assignmentId === quizAid, labPass.data);
  quizPath = await pathway(quizLesson.data.id, quizAid);
  const remaining = quizPath.data.steps.filter((step) => step.required && step.state !== "COMPLETED");
  for (const step of remaining) {
    assert.equal(step.type, "CHALLENGE", "only a challenge may follow the lab");
    await req("/attempts", "POST", { challengeId: step.resource.challengeId, lessonStepId: step.id, labState: circuit(), durationMs: 500 }, studentA.token);
  }
  quizPath = await pathway(quizLesson.data.id, quizAid);
  check("every step of the assigned lesson is completed", quizPath.data.steps.every((step) => step.state === "COMPLETED") && quizPath.data.nextStepId === null, quizPath.data.steps);
  progressRead = await req("/me/progress", "GET", undefined, studentA.token);
  item = progressRead.data.assignments.find((entry) => entry.assignmentId === quizAid);
  check("progress marks the assigned lesson completed at 100%", item?.completed === true && item.percent === 100 && item.completedRequired === item.totalRequired, item);
  check("the summary counts the completed assignment", progressRead.data.summary.completedAssignments >= 1 && progressRead.data.summary.activeAssignments === 2, progressRead.data.summary);
  const queue = await req("/assignments", "GET", undefined, studentA.token);
  const queued = queue.data?.find((entry) => entry.id === quizAid);
  check("the assignment list still opens the completed lesson for review", queued?.contentState === "AVAILABLE" && queued.canOpen === true, queued);
  const legacy = await req(`/lessons/${quizLesson.data.id}/complete`, "POST", {}, studentA.token);
  check("a bare mark-complete call is refused", code(legacy, 409, "ASSIGNMENT_PATHWAY_REQUIRED"), legacy.data);
  const openNotTouched = await db.stepProgress.count({ where: { studentId: studentA.id, assignmentId: quizAid, step: { lessonId: open.id } } });
  check("open-curriculum evidence is not attributed to the assignment", openNotTouched === 0);

  console.log(`\nLearning journey: ${passed} checks passed.`);
} catch (error) {
  console.error("FAILURE");
  console.error(error?.message ?? error);
  process.exitCode = 1;
} finally {
  const classes = await db.classroom.findMany({ where: { teacherId: { in: createdUsers } }, select: { id: true } });
  await db.assignment.deleteMany({ where: { classId: { in: classes.map((c) => c.id) } } });
  await db.classroom.deleteMany({ where: { id: { in: classes.map((c) => c.id) } } });
  await db.foundationalCourseVersion.deleteMany({ where: { id: { in: created.courseVersions } } });
  const lessons = await db.lesson.findMany({ where: { OR: [{ id: { in: created.lessons } }, { authorId: { in: createdUsers } }] }, select: { id: true } });
  await db.quizAttempt.deleteMany({ where: { lessonId: { in: lessons.map((l) => l.id) } } });
  await db.lesson.deleteMany({ where: { id: { in: lessons.map((l) => l.id) } } });
  await db.contentPackVersion.deleteMany({ where: { packKey: { in: created.packs } } });
  await db.contentPack.deleteMany({ where: { key: { in: created.packs } } });
  await db.curriculumTopic.deleteMany({ where: { chapterCode: { in: created.chapters } } });
  await db.curriculumChapter.deleteMany({ where: { code: { in: created.chapters } } });
  await db.idempotencyRecord.deleteMany({ where: { actorId: { in: createdUsers } } });
  await db.auditLog.deleteMany({ where: { actorId: { in: createdUsers } } });
  await db.user.deleteMany({ where: { id: { in: createdUsers } } });
  await db.$disconnect();
}
