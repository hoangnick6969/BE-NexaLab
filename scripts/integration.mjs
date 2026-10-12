import "dotenv/config";
import assert from "node:assert/strict";
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
  check("unauthenticated API denied", (await req("/users")).status === 401);
  const admin = await req("/auth/login", "POST", {
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
    { name: prefix, grade: 8 },
    tokens.TEACHER,
  );
  check("teacher creates class", made.status === 201);
  classroom = made.data;
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
        { code: classroom.joinCode },
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
      (a) => a.id === task.data.id,
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
    questions: [
      {
        prompt: "Increasing resistance?",
        options: ["Lower current", "Higher current"],
        answer: 0,
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
    "/assignments/" + lessonTask.data.id,
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
      pathway.data.steps.map((step) => step.type).join(",") === "READING,VIDEO,QUIZ,LAB" &&
      pathway.data.steps.map((step) => step.state).join(",") === "IN_PROGRESS,LOCKED,LOCKED,LOCKED" &&
      pathway.data.nextStepId === pathway.data.steps[0].id,
  );
  check(
    "pathway hides locked quiz answers",
    pathway.data.steps[1].resource === null &&
      !JSON.stringify(pathway.data).includes('"answer"'),
  );
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
    "reading completion is idempotent and survives a pathway reload",
    repeatedCompletion.status === 200 &&
      repeatedEvidence?.completedAt?.toISOString() === firstCompletedAt &&
      evidenceCount === 1 && preservedProjection?.status === "completed" &&
      reloadedPathway.data.steps[0].state === "COMPLETED" &&
      reloadedPathway.data.nextStepId === pathway.data.steps[1].id,
  );
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
  await req(
    "/lessons/" + lesson.id,
    "PUT",
    {
      ...lessonData,
      status: "published",
      materials: [{ type: "pdf", title: "Test", url: file.url }],
    },
    tokens.TEACHER,
  );
  check(
    "published material readable",
    (
      await fetch(origin + "/files/" + file.id, {
        headers: { authorization: "Bearer " + tokens.STUDENT },
      })
    ).status === 200,
  );
  check(
    "quiz graded server-side",
    (
      await req(
        "/lessons/" + lesson.id + "/quiz",
        "POST",
        { answers: [0] },
        tokens.STUDENT,
      )
    ).data.score === 100,
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
      tokens.STUDENT,
    )
  ).data;
  check("chemistry full stack passes", chem.verdict === "passed");
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
      tokens.STUDENT,
    )
  ).data;
  check("eye anatomy server grade", eye.simulationResult.score === 100);
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
  for (const id of uploaded) {
    await db.assetFile.deleteMany({ where: { id } });
    await unlink(resolve("uploads", id));
  }
  await db.user.deleteMany({ where: { id: { in: created } } });
  await db.$disconnect();
}
