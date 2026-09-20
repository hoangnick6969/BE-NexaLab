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
  const tokens = {};
  const users = {};
  for (const role of ["TEACHER", "STUDENT", "PARENT"]) {
    const account = {
      email: `${prefix}-${role.toLowerCase()}@example.test`,
      password: "IntegrationTest2026!",
      fullName: "Integration " + role,
      role,
      grade: 8,
      consent: true,
    };
    const createdUser = await req("/users", "POST", account, adminToken);
    check("create " + role, createdUser.status === 201);
    created.push(createdUser.data.id);
    users[role] = createdUser.data;
    const login = await req("/auth/login", "POST", {
      email: account.email,
      password: account.password,
    });
    tokens[role] = login.data.accessToken;
    check("login " + role, login.status === 201 && !!tokens[role]);
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
  check(
    "pending student absent from teacher analytics",
    (
      await req(
        "/classes/" + classroom.id + "/analytics",
        "GET",
        undefined,
        tokens.TEACHER,
      )
    ).data.length === 0,
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
  const visible = (
    await req("/lessons", "GET", undefined, tokens.STUDENT)
  ).data.find((l) => l.id === lesson.id);
  check(
    "quiz key hidden from student",
    visible && !("answer" in visible.questions[0]),
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
  check(
    "teacher sees traceable hints",
    analytics[0].attempts.some((a) =>
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
  const login = await req("/auth/login", "POST", {
    email: users.STUDENT.email,
    password: "IntegrationTest2026!",
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
