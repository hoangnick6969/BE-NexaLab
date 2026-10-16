// Epic C2 admin operations on real dependencies (API + PostgreSQL + dev
// mailbox), built on the shared B/C harness. Every fixture is created and
// removed by this run; shared seed rows are only read, and the one shared
// mutation (activating a circuit configuration version) is reverted in cleanup.
//   npm run mailbox                       (SMTP on 127.0.0.1:1025, needed for reset links)
//   TEST_API=http://127.0.0.1:4000/api npm run test:c2
// The API must use the same SMTP host and DATABASE_URL as this script.
import * as argon from "argon2";
import { readdir, readFile, unlink } from "node:fs/promises";
import { resolve } from "node:path";
import { createHarness } from "./lib/harness.mjs";
import { storage } from "../src/storage.ts";

const h = createHarness("C2 admin operations");
const { db, req, check, skip, envelope, key } = h;
const prefix = "c2-" + Date.now().toString(36);
const mailbox = resolve(process.env.MAILBOX_DIR ?? ".local/mailbox");
const created = { users: [], classes: [], lessons: [], assets: [], subjects: [], chapters: [], topics: [], outcomes: [], versions: [] };
let restoreVersion = null;
const timings = { read: [], mutation: [] };

const circuitState = (resistance) => ({
  nodes: [
    { id: "b", type: "battery", value: 9 },
    { id: "r", type: "resistor", value: resistance },
    { id: "l", type: "led" },
  ],
  edges: [
    { source: "b", target: "r" },
    { source: "r", target: "l" },
    { source: "l", target: "b" },
  ],
});
const png = () => Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), Buffer.from(prefix + Math.random())]);
async function upload(token, name, bytes) {
  const form = new FormData();
  form.append("file", new Blob([bytes]), name);
  const res = await fetch(h.origin + "/files", { method: "POST", headers: { authorization: "Bearer " + token }, body: form });
  return { status: res.status, data: await res.json().catch(() => null) };
}
const fileStatus = (id, token) => fetch(`${h.origin}/files/${id}`, { headers: { authorization: "Bearer " + token } }).then((r) => r.status);
async function timed(bucket, call) {
  const started = performance.now();
  const result = await call();
  timings[bucket].push(performance.now() - started);
  return result;
}
const p95 = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted.length ? Math.round(sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1)]) : null;
};

/** Adult/admin sign-in; waits out the 10/min per-IP login window instead of failing on 429. */
async function signIn(path, body) {
  let res = await req(path, "POST", body);
  if (res.status === 429) {
    console.log("     waiting 61 s for the login rate window");
    await new Promise((r) => setTimeout(r, 61000));
    res = await req(path, "POST", body);
  }
  return res;
}

async function account(label, role) {
  const password = `C2-${label}-Password-2026!`;
  const user = await db.user.create({
    data: {
      email: `${prefix}-${label}@example.test`,
      fullName: `C2 ${label}`,
      role,
      passwordHash: await argon.hash(password),
      consentAt: new Date(),
    },
  });
  created.users.push(user.id);
  const login = await signIn(role === "ADMIN" ? "/auth/admin/login" : "/auth/login", { email: user.email, password });
  if (login.status !== 201) throw new Error(`${label} login ${login.status}`);
  return { id: user.id, email: user.email, password, token: login.data.accessToken };
}
const relogin = async (who, path = "/auth/login") => (await signIn(path, { email: who.email, password: who.password })).data?.accessToken;

/** Waits for a new mail to `to` and returns the raw reset token from its link. */
async function resetTokenFor(to, seen) {
  for (let i = 0; i < 60; i++) {
    const files = (await readdir(mailbox).catch(() => [])).filter((f) => !seen.has(f));
    for (const file of files) {
      const raw = (await readFile(resolve(mailbox, file), "utf8")).replace(/=\r?\n/g, "").replace(/=3D/g, "=");
      if (raw.includes(to)) {
        seen.add(file);
        await unlink(resolve(mailbox, file)).catch(() => undefined);
        return raw.match(/reset=([a-f0-9]{64})/)?.[1] ?? null;
      }
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  return null;
}

await h.run({
  async setup() {
    const admin = await account("admin", "ADMIN");
    const admin2 = await account("admin2", "ADMIN");
    const owner = await account("owner", "TEACHER");
    const heir = await account("heir", "TEACHER");
    const parent = await account("parent", "PARENT");
    const made = await req("/classes", "POST", { name: `${prefix} lớp`, grade: 8 }, owner.token, key());
    if (made.status !== 201) throw new Error(`class ${made.status}`);
    const classId = made.data.class.id;
    created.classes.push(classId);
    const provisioned = await req(
      `/classes/${classId}/students`,
      "POST",
      { username: `${prefix}-s`, fullName: "C2 học sinh", grade: 8, consent: true },
      owner.token,
      key(),
    );
    if (provisioned.status !== 201) throw new Error(`provision ${provisioned.status}`);
    created.users.push(provisioned.data.user.id);
    let login = await req("/auth/student/login", "POST", {
      username: provisioned.data.credentials.username,
      password: provisioned.data.credentials.temporaryPassword,
    });
    if (login.status === 429) {
      console.log("     waiting 61 s for the student-login rate window");
      await new Promise((r) => setTimeout(r, 61000));
      login = await req("/auth/student/login", "POST", {
        username: provisioned.data.credentials.username,
        password: provisioned.data.credentials.temporaryPassword,
      });
    }
    if (login.status !== 201) throw new Error(`student login ${login.status}`);
    const changed = await req(
      "/auth/password",
      "POST",
      { currentPassword: provisioned.data.credentials.temporaryPassword, password: "C2-Student-Password-2026!" },
      login.data.accessToken,
    );
    if (changed.status !== 201) throw new Error(`student password ${changed.status}`);
    const student = { id: provisioned.data.user.id, token: changed.data.accessToken };
    const lesson = await db.lesson.create({
      data: {
        subjectId: "physics",
        authorId: owner.id,
        title: `${prefix} bài riêng`,
        chapter: "C2",
        grade: 8,
        topic: "C2",
        learningObjective: "C2",
        prerequisites: "",
        curriculum: "",
        content: "<p>C2</p>",
        status: "published",
        scope: "TEACHER_PRIVATE",
        synthetic: true,
      },
    });
    created.lessons.push(lesson.id);
    const assignment = await db.assignment.create({
      data: { classId, contentId: lesson.id, contentType: "lesson", title: `${prefix} bài giao`, status: "ACTIVE", audience: "CLASS" },
    });
    return { admin, admin2, owner, heir, parent, student, classId, lesson, assignment };
  },

  async journey(ctx) {
    const { admin, admin2, owner, heir, parent, student, classId, lesson } = ctx;
    const seen = new Set(await readdir(mailbox).catch(() => []));

    // ---------- C2-T6 role boundary ----------
    const adminRoutes = [
      ["GET", "/admin/overview"],
      ["GET", "/admin/users"],
      ["POST", "/admin/users", { role: "TEACHER", email: `${prefix}-x@example.test`, fullName: "x", consent: true }],
      ["POST", `/admin/users/${student.id}/disable`, { reason: "thử quyền" }],
      ["DELETE", `/admin/users/${student.id}`, { reason: "thử quyền", confirm: true }],
      ["GET", "/admin/taxonomy"],
      ["POST", "/admin/subjects", { id: `${prefix}-x`, name: "x" }],
      ["GET", "/admin/content"],
      ["POST", `/admin/content/${lesson.id}/operations`, { action: "quarantine", reason: "thử quyền" }],
      ["GET", "/admin/labs"],
      ["POST", "/admin/labs/circuit/versions", {}],
      ["GET", "/admin/assets"],
      ["GET", "/admin/audit"],
    ];
    for (const [who, token] of [
      ["teacher", owner.token],
      ["parent", parent.token],
      ["student", student.token],
    ]) {
      const denied = [];
      for (const [method, path, body] of adminRoutes)
        if (!envelope(await req(path, method, body, token), 403, "FORBIDDEN")) denied.push(`${method} ${path}`);
      check(`${who} receives 403 on every admin route`, denied.length === 0, denied);
    }
    check("unauthenticated admin route → 401", envelope(await req("/admin/users"), 401, "UNAUTHENTICATED"));

    // ---------- C2-T4 admin-login separation ----------
    check(
      "ADMIN is rejected by the regular adult login",
      (await signIn("/auth/login", { email: admin.email, password: admin.password })).status === 401,
    );
    check("ADMIN signs in through auth/admin/login", Boolean(await relogin(admin, "/auth/admin/login")));
    check(
      "a teacher cannot use the admin login",
      (await signIn("/auth/admin/login", { email: owner.email, password: owner.password })).status === 401,
    );

    // ---------- C2-T1 list, create, eligibility ----------
    const listed = await timed("read", () => req(`/admin/users?q=${prefix}&role=TEACHER&limit=1`, "GET", undefined, admin.token));
    const next = await req(
      `/admin/users?q=${prefix}&role=TEACHER&limit=1&cursor=${listed.data?.nextCursor}`,
      "GET",
      undefined,
      admin.token,
    );
    check(
      "user list paginates with search and role filter",
      listed.status === 200 &&
        listed.data.items.length === 1 &&
        listed.data.nextCursor &&
        next.data.items.length === 1 &&
        next.data.items[0].id !== listed.data.items[0].id,
    );
    const newTeacher = await timed("mutation", () =>
      req(
        "/admin/users",
        "POST",
        { role: "TEACHER", email: `${prefix}-new@example.test`, fullName: "C2 giáo viên mới", consent: true },
        admin.token,
      ),
    );
    if (newTeacher.data?.id) created.users.push(newTeacher.data.id);
    check(
      "admin creates a teacher and a setup link is emailed (no admin-known password)",
      newTeacher.status === 201 && newTeacher.data.setupLinkSent === true && !("credentials" in newTeacher.data),
    );
    const setupToken = await resetTokenFor(`${prefix}-new@example.test`, seen);
    const setup = setupToken ? await req("/auth/reset", "POST", { token: setupToken, password: "C2-New-Teacher-2026!" }) : { status: 0 };
    check(
      "the new teacher activates through the one-time link and signs in",
      setup.status === 201 &&
        (await signIn("/auth/login", { email: `${prefix}-new@example.test`, password: "C2-New-Teacher-2026!" })).status === 201,
    );
    check(
      "duplicate email → 409 USER_EXISTS",
      envelope(
        await req("/admin/users", "POST", { role: "PARENT", email: parent.email, fullName: "x", consent: true }, admin.token),
        409,
        "USER_EXISTS",
      ),
    );

    const practice = await req(
      "/attempts",
      "POST",
      { challengeId: "circuit_001", labState: circuitState(470), durationMs: 1000 },
      student.token,
    );
    check("the student has practical evidence", practice.status === 201);
    const evidenceBefore = await db.attempt.count({ where: { studentId: student.id } });
    const eligibility = await req(`/admin/users/${student.id}/deletion-eligibility`, "GET", undefined, admin.token);
    check(
      "eligibility reports the student's evidence and enrollment",
      eligibility.data?.eligible === false && eligibility.data.blockers.attempts >= 1 && eligibility.data.blockers.enrollments === 1,
    );
    const refused = await req(`/admin/users/${student.id}`, "DELETE", { reason: "dọn dữ liệu", confirm: true }, admin.token);
    check(
      "hard delete of a referenced user → 409 DELETE_INELIGIBLE with no side effect",
      envelope(refused, 409, "DELETE_INELIGIBLE") &&
        refused.data.details.blocking.some((b) => b.key === "attempts") &&
        (await db.user.count({ where: { id: student.id } })) === 1 &&
        (await db.attempt.count({ where: { studentId: student.id } })) === evidenceBefore,
    );
    check(
      "self-disable → 409 SELF_ACTION_FORBIDDEN",
      envelope(await req(`/admin/users/${admin.id}/disable`, "POST", { reason: "tự khoá" }, admin.token), 409, "SELF_ACTION_FORBIDDEN"),
    );
    check(
      "self-delete → 409 SELF_ACTION_FORBIDDEN",
      envelope(
        await req(`/admin/users/${admin.id}`, "DELETE", { reason: "tự xoá", confirm: true }, admin.token),
        409,
        "SELF_ACTION_FORBIDDEN",
      ),
    );
    skip("last active admin over the API", "an acting admin is always another active admin; covered by unit test and the advisory lock");

    // ---------- C2-T1 disable with ownership resolution ----------
    const ownerAsset = await upload(owner.token, "so-do.png", png());
    if (ownerAsset.data?.assetId) created.assets.push(ownerAsset.data.assetId);
    const stored = ownerAsset.data?.id ? await db.assetVersion.findUnique({ where: { id: ownerAsset.data.id } }) : null;
    check(
      "upload stores an immutable READY version in object storage with a server SHA-256",
      ownerAsset.status === 201 && stored?.status === "READY" && Boolean(stored.objectKey) && /^[0-9a-f]{64}$/.test(stored?.sha256 ?? ""),
    );
    const missing = await req(`/admin/users/${owner.id}/disable`, "POST", { reason: "nghỉ việc" }, admin.token);
    check(
      "disabling an owner without resolutions → 409 OWNERSHIP_RESOLUTION_REQUIRED naming class, lesson and asset",
      envelope(missing, 409, "OWNERSHIP_RESOLUTION_REQUIRED") &&
        ["class", "lesson", "asset"].every((kind) => missing.data.details.problems.some((p) => p.kind === kind && p.problem === "missing")),
    );
    check("…and changes nothing: the owner still works", (await req("/classes", "GET", undefined, owner.token)).status === 200);
    const badOwner = await req(
      `/admin/users/${owner.id}/disable`,
      "POST",
      {
        reason: "nghỉ việc",
        resolutions: {
          classes: [{ id: classId, action: "reassign", newOwnerId: parent.id }],
          lessons: [{ id: lesson.id, action: "archive" }],
          assets: [{ id: ownerAsset.data.assetId, action: "quarantine" }],
        },
      },
      admin.token,
    );
    check(
      "reassigning to a non-teacher is refused",
      envelope(badOwner, 409, "OWNERSHIP_RESOLUTION_REQUIRED") && badOwner.data.details.problems[0].problem === "invalid_new_owner",
    );
    const disabled = await timed("mutation", () =>
      req(
        `/admin/users/${owner.id}/disable`,
        "POST",
        {
          reason: "nghỉ việc",
          resolutions: {
            classes: [{ id: classId, action: "reassign", newOwnerId: heir.id }],
            lessons: [{ id: lesson.id, action: "reassign", newOwnerId: heir.id }],
            assets: [{ id: ownerAsset.data.assetId, action: "quarantine" }],
          },
        },
        admin.token,
      ),
    );
    check(
      "disable with explicit resolutions succeeds and revokes sessions",
      disabled.status === 201 && disabled.data.user.status === "disabled" && disabled.data.sessionsRevoked >= 1,
    );
    check(
      "the disabled user receives 401 on the next request",
      envelope(await req("/classes", "GET", undefined, owner.token), 401, "UNAUTHENTICATED"),
    );
    check(
      "the disabled user cannot sign in",
      (await signIn("/auth/login", { email: owner.email, password: owner.password })).status === 401,
    );
    const [klass, ownedLesson, asset] = await Promise.all([
      db.classroom.findUnique({ where: { id: classId } }),
      db.lesson.findUnique({ where: { id: lesson.id } }),
      db.asset.findUnique({ where: { id: ownerAsset.data.assetId } }),
    ]);
    check(
      "class and lesson moved to the new owner, asset quarantined, evidence and enrollment intact",
      klass.teacherId === heir.id &&
        klass.status === "ACTIVE" &&
        ownedLesson.authorId === heir.id &&
        asset.status === "QUARANTINED" &&
        (await db.attempt.count({ where: { studentId: student.id } })) === evidenceBefore &&
        (await db.enrollment.count({ where: { classId, studentId: student.id, status: "approved" } })) === 1,
    );
    const disableAudit = await db.auditLog.findFirst({ where: { action: "user.disable", targetId: owner.id } });
    check(
      "user.disable audit carries actor, reason and allowlisted before/after",
      disableAudit?.actorId === admin.id &&
        disableAudit.reason === "nghỉ việc" &&
        disableAudit.before?.status === "active" &&
        disableAudit.after?.status === "disabled",
    );
    check(
      "each resolution is audited",
      (await db.auditLog.count({
        where: { action: { in: ["class.reassign", "lesson.reassign", "asset.quarantine"] }, reason: "nghỉ việc" },
      })) === 3,
    );
    const reactivated = await req(`/admin/users/${owner.id}/reactivate`, "POST", { reason: "quay lại" }, admin.token);
    owner.token = await relogin(owner);
    check("reactivation restores sign-in", reactivated.status === 201 && Boolean(owner.token));
    const disableAdmin2 = await req(`/admin/users/${admin2.id}/disable`, "POST", { reason: "luân chuyển" }, admin.token);
    check(
      "an admin can disable another admin while one stays active",
      disableAdmin2.status === 201 && disableAdmin2.data.user.status === "disabled",
    );

    const empty = await req(
      "/admin/users",
      "POST",
      { role: "PARENT", email: `${prefix}-empty@example.test`, fullName: "C2 trống", consent: true, password: "C2-Empty-Password-2026!" },
      admin.token,
    );
    if (empty.data?.id) created.users.push(empty.data.id);
    const removed = await req(`/admin/users/${empty.data.id}`, "DELETE", { reason: "tạo nhầm", confirm: true }, admin.token);
    check(
      "an eligible empty account hard-deletes with a reconciled dependency report",
      removed.status === 200 &&
        Object.entries(removed.data.report).every(([k, v]) => k === "sessionsRevoked" || v === 0) &&
        (await db.user.count({ where: { id: empty.data.id } })) === 0 &&
        (await db.auditLog.count({ where: { action: "user.delete", targetId: empty.data.id, actorId: admin.id } })) === 1,
    );

    // ---------- C2-T4 adult reset ----------
    const generic = await req("/auth/forgot", "POST", { email: `${prefix}-nobody@example.test` });
    const known = await req("/auth/forgot", "POST", { email: heir.email });
    check(
      "forgot-password answers identically for unknown and known emails",
      generic.status === 201 && known.status === 201 && generic.data.message === known.data.message,
    );
    const heirToken = await resetTokenFor(heir.email, seen);
    const storedHash = await db.session.findFirst({ where: { userId: heir.id, kind: "reset" } });
    check("only a hash of the reset token is stored", Boolean(heirToken && storedHash && storedHash.tokenHash !== heirToken));
    const oldAccess = heir.token;
    const reset = await req("/auth/reset", "POST", { token: heirToken, password: "C2-Heir-Reset-2026!" });
    heir.password = "C2-Heir-Reset-2026!";
    check(
      "reset succeeds and revokes every prior session",
      reset.status === 201 && envelope(await req("/classes", "GET", undefined, oldAccess), 401, "UNAUTHENTICATED"),
    );
    check(
      "a reused link fails uniformly",
      envelope(await req("/auth/reset", "POST", { token: heirToken, password: "C2-Second-Reset-2026!" }), 400, "RESET_TOKEN_INVALID"),
    );
    heir.token = await relogin(heir);
    await req("/auth/forgot", "POST", { email: heir.email });
    const expiring = await resetTokenFor(heir.email, seen);
    await db.session.updateMany({ where: { userId: heir.id, kind: "reset" }, data: { expiresAt: new Date(Date.now() - 1000) } });
    check(
      "an expired link fails uniformly",
      envelope(await req("/auth/reset", "POST", { token: expiring, password: "C2-Late-Reset-2026!" }), 400, "RESET_TOKEN_INVALID"),
    );
    const linkByAdmin = await req(`/admin/users/${heir.id}/reset-link`, "POST", undefined, admin.token);
    const concurrent = await resetTokenFor(heir.email, seen);
    const racing = await Promise.all(
      [1, 2].map((n) => req("/auth/reset", "POST", { token: concurrent, password: `C2-Race-${n}-Password-2026!` })),
    );
    check(
      "admin-issued link: concurrent consumes succeed exactly once",
      linkByAdmin.status === 201 && racing.filter((r) => r.status === 201).length === 1,
    );
    heir.password = racing[0].status === 201 ? "C2-Race-1-Password-2026!" : "C2-Race-2-Password-2026!";
    heir.token = await relogin(heir);
    check(
      "students keep teacher-managed reset",
      envelope(await req(`/admin/users/${student.id}/reset-link`, "POST", undefined, admin.token), 404, "ADULT_NOT_FOUND"),
    );

    // ---------- C2-T2 taxonomy ----------
    check(
      "duplicate subject ID → 409, never an overwrite",
      envelope(await req("/admin/subjects", "POST", { id: "physics", name: "Ghi đè" }, admin.token), 409, "SUBJECT_EXISTS"),
    );
    check("…and the subject keeps its name", (await db.subject.findUnique({ where: { id: "physics" } })).name !== "Ghi đè");
    const subjectId = `${prefix}-sub`;
    created.subjects.push(subjectId);
    check(
      "admin creates a subject",
      (await req("/admin/subjects", "POST", { id: subjectId, name: "KHTN thử" }, admin.token)).status === 201,
    );
    const chapterCode = `${prefix}-ch`;
    created.chapters.push(chapterCode);
    const chapter = await req(
      "/admin/chapters",
      "POST",
      { code: chapterCode, subjectId, grade: 8, domain: "ENERGY", title: "Chương thử" },
      admin.token,
    );
    check(
      "admin creates a chapter; duplicate code → 409",
      chapter.status === 201 &&
        envelope(
          await req("/admin/chapters", "POST", { code: chapterCode, subjectId, grade: 8, domain: "ENERGY", title: "Lặp" }, admin.token),
          409,
          "CHAPTER_EXISTS",
        ),
    );
    const outcomeCode = `${prefix}-oc`;
    created.outcomes.push(outcomeCode);
    const outcome = await req(
      "/admin/outcomes",
      "POST",
      { code: outcomeCode, grade: 8, domain: "ENERGY", chapter: "Chương thử", statement: "Mô tả được dòng điện trong mạch kín." },
      admin.token,
    );
    check(
      "admin creates an outcome; duplicate code → 409",
      outcome.status === 201 &&
        envelope(
          await req(
            "/admin/outcomes",
            "POST",
            { code: outcomeCode, grade: 8, domain: "ENERGY", chapter: "x", statement: "Lặp lại mã." },
            admin.token,
          ),
          409,
          "OUTCOME_EXISTS",
        ),
    );
    const topicCode = `${prefix}-tp`;
    created.topics.push(topicCode);
    const topic = await req(
      "/admin/topics",
      "POST",
      { code: topicCode, chapterCode, title: "Chủ đề thử", outcomeCodes: [outcomeCode] },
      admin.token,
    );
    check("a topic maps to outcomes of its chapter's grade and domain", topic.status === 201);
    check(
      "mapping an outcome of another grade/domain → 400 INVALID_OUTCOME",
      envelope(
        await req(
          "/admin/topics",
          "POST",
          { code: `${prefix}-tp2`, chapterCode, title: "Sai", outcomeCodes: ["FX8-MATTER-01"] },
          admin.token,
        ),
        400,
        "INVALID_OUTCOME",
      ),
    );
    check(
      "rewording a mapped outcome → 409 OUTCOME_IN_USE (traceability)",
      envelope(
        await req(
          `/admin/outcomes/${outcomeCode}`,
          "PUT",
          { statement: "Nội dung khác hẳn.", status: "active", reason: "sửa câu chữ" },
          admin.token,
        ),
        409,
        "OUTCOME_IN_USE",
      ),
    );
    const archivedOutcome = await req(
      `/admin/outcomes/${outcomeCode}`,
      "PUT",
      { statement: "Mô tả được dòng điện trong mạch kín.", status: "archived", reason: "thay mã mới" },
      admin.token,
    );
    check(
      "an outcome can be archived and stays mapped",
      archivedOutcome.status === 200 &&
        (await db.curriculumTopic.findUnique({ where: { code: topicCode } })).outcomeCodes.includes(outcomeCode),
    );

    // ---------- C2-T2 content operations ----------
    const evidenceCount = () => Promise.all([db.attempt.count(), db.quizAttempt.count(), db.stepProgress.count()]).then((v) => v.join("/"));
    const evidenceAtStart = await evidenceCount();
    const warn = await req(`/admin/content/${lesson.id}/operations`, "POST", { action: "quarantine", reason: "nội dung sai" }, admin.token);
    check(
      "quarantining assigned content warns first: 409 ACTIVE_ASSIGNMENTS_WARNING",
      envelope(warn, 409, "ACTIVE_ASSIGNMENTS_WARNING") && warn.data.details.activeAssignments === 1,
    );
    const quarantined = await timed("mutation", () =>
      req(
        `/admin/content/${lesson.id}/operations`,
        "POST",
        { action: "quarantine", reason: "nội dung sai", acknowledgeActiveAssignments: true },
        admin.token,
      ),
    );
    check("acknowledged quarantine applies", quarantined.status === 201 && quarantined.data.lesson.status === "quarantined");
    check(
      "the owner cannot edit or republish a quarantined lesson",
      envelope(await req(`/lessons/${lesson.id}`, "PUT", {}, heir.token), 409, "CONTENT_QUARANTINED"),
    );
    check(
      "admin cannot rewrite a teacher's private lesson body",
      envelope(await req(`/lessons/${lesson.id}`, "PUT", {}, admin.token), 403, "PRIVATE_CONTENT_READ_ONLY"),
    );
    const released = await req(`/admin/content/${lesson.id}/operations`, "POST", { action: "release", reason: "đã sửa" }, admin.token);
    check("release restores the previous status", released.data?.lesson?.status === "published");
    check(
      "reassigning content to a parent is refused",
      envelope(
        await req(
          `/admin/content/${lesson.id}/operations`,
          "POST",
          { action: "reassign", reason: "chuyển", newOwnerId: parent.id },
          admin.token,
        ),
        400,
        "INVALID_NEW_OWNER",
      ),
    );
    check("content operations never touch evidence", (await evidenceCount()) === evidenceAtStart);
    const library = await timed("read", () => req("/admin/content?scope=SHARED_LIBRARY&limit=5", "GET", undefined, admin.token));
    check(
      "admin content list exposes release blockers for shared content",
      library.status === 200 && library.data.items.every((item) => Array.isArray(item.releaseBlockers)),
    );
    check(
      "every content operation audited with reason",
      (await db.auditLog.count({
        where: { targetId: lesson.id, action: { in: ["lesson.quarantine", "lesson.release"] }, actorId: admin.id, reason: { not: null } },
      })) === 2,
    );

    // ---------- C2-T3 simulation versions ----------
    const versionsView = await req("/admin/labs/circuit/versions", "GET", undefined, admin.token);
    check(
      "versions view lists golden-case templates and the model allowlist",
      versionsView.status === 200 && versionsView.data.templates.length >= 3 && versionsView.data.model.modelRef,
    );
    const golden = [
      { challengeId: "circuit_001", label: "470 Ω", labState: circuitState(470), expectedVerdict: "partial" },
      { challengeId: "circuit_001", label: "1000 Ω", labState: circuitState(1000), expectedVerdict: "passed" },
    ];
    const reasonText = "C2 integration: siết dòng tối đa";
    check(
      "out-of-range parameter → 422 INVALID_SIMULATION_CONFIG",
      envelope(
        await req(
          "/admin/labs/circuit/versions",
          "POST",
          { challengeParams: { circuit_001: { maxCurrentMa: 50 } }, goldenCases: golden, reason: reasonText },
          admin.token,
        ),
        422,
        "INVALID_SIMULATION_CONFIG",
      ),
    );
    check(
      "non-allowlisted (executable-looking) parameter → 422",
      envelope(
        await req(
          "/admin/labs/circuit/versions",
          "POST",
          { challengeParams: { circuit_001: { onEvaluate: "process.exit()" } }, goldenCases: golden, reason: reasonText },
          admin.token,
        ),
        422,
        "INVALID_SIMULATION_CONFIG",
      ),
    );
    check(
      "challenge of another lab → 422",
      envelope(
        await req(
          "/admin/labs/circuit/versions",
          "POST",
          { challengeParams: { eye_001: { minScore: 50 } }, goldenCases: golden, reason: reasonText },
          admin.token,
        ),
        422,
        "INVALID_SIMULATION_CONFIG",
      ),
    );
    check(
      "unknown top-level binding field → 400",
      envelope(
        await req(
          "/admin/labs/circuit/versions",
          "POST",
          { challengeParams: {}, goldenCases: golden, reason: reasonText, binding: "x" },
          admin.token,
        ),
        400,
        "VALIDATION_FAILED",
      ),
    );
    check(
      "golden case that does not reproduce → 422 GOLDEN_CASE_MISMATCH",
      envelope(
        await req(
          "/admin/labs/circuit/versions",
          "POST",
          {
            challengeParams: { circuit_001: { maxCurrentMa: 10 } },
            goldenCases: [{ ...golden[0], expectedVerdict: "passed" }],
            reason: reasonText,
          },
          admin.token,
        ),
        422,
        "GOLDEN_CASE_MISMATCH",
      ),
    );
    const previous = await db.simulationConfigVersion.findFirst({ where: { labId: "circuit", status: "active" } });
    restoreVersion = previous?.id ?? null;
    const before = await req(
      "/attempts",
      "POST",
      { challengeId: "circuit_001", labState: circuitState(470), durationMs: 1000 },
      student.token,
    );
    const draft = await req(
      "/admin/labs/circuit/versions",
      "POST",
      { challengeParams: { circuit_001: { maxCurrentMa: 10, minLitLeds: 1 } }, goldenCases: golden, reason: reasonText },
      admin.token,
    );
    if (draft.data?.id) created.versions.push(draft.data.id);
    check(
      "a valid version is stored as a draft after golden cases pass",
      draft.status === 201 && draft.data.status === "draft" && draft.data.golden.every((g) => g.ok),
    );
    const activated = await req(`/admin/labs/circuit/versions/${draft.data.version}/activate`, "POST", { reason: reasonText }, admin.token);
    check("activation makes it active and retires the previous one", activated.status === 201 && activated.data.status === "active");
    check(
      "an activated version is immutable (activate again → 409)",
      envelope(
        await req(`/admin/labs/circuit/versions/${draft.data.version}/activate`, "POST", { reason: reasonText }, admin.token),
        409,
        "VERSION_NOT_DRAFT",
      ),
    );
    const after = await req(
      "/attempts",
      "POST",
      { challengeId: "circuit_001", labState: circuitState(470), durationMs: 1000 },
      student.token,
    );
    check(
      "a future attempt pins the new version and is evaluated with it",
      before.data?.verdict === "passed" &&
        after.data?.verdict === "partial" &&
        after.data.configVersionId === draft.data.id &&
        before.data.configVersionId === (previous?.id ?? null),
    );
    const replayOld = await req(`/admin/attempts/${before.data.id}/reproduce`, "GET", undefined, admin.token);
    const replayNew = await req(`/admin/attempts/${after.data.id}/reproduce`, "GET", undefined, admin.token);
    check(
      "historical attempts reproduce their original interpretation",
      replayOld.data?.matches === true &&
        replayOld.data.reproducedVerdict === "passed" &&
        replayNew.data?.matches === true &&
        replayNew.data.reproducedVerdict === "partial",
    );

    // ---------- C2-T5 assets ----------
    check(
      "signature/extension mismatch → 400 ASSET_TYPE_REJECTED",
      envelope(await upload(heir.token, "fake.pdf", png()), 400, "ASSET_TYPE_REJECTED"),
    );
    check("a quarantined asset is withheld from its owner", (await fileStatus(ownerAsset.data.id, owner.token)) === 403);
    check("…and still readable by an admin", (await fileStatus(ownerAsset.data.id, admin.token)) === 200);
    const releasedAsset = await req(
      `/admin/assets/${ownerAsset.data.assetId}/operations`,
      "POST",
      { action: "release", reason: "đã kiểm tra" },
      admin.token,
    );
    check("release restores owner access", releasedAsset.status === 201 && (await fileStatus(ownerAsset.data.id, owner.token)) === 200);
    check("another teacher cannot read a private asset", (await fileStatus(ownerAsset.data.id, heir.token)) === 403);
    check(
      "sharing requires a license and source",
      envelope(
        await req(`/admin/assets/${ownerAsset.data.assetId}/operations`, "POST", { action: "share", reason: "dùng chung" }, admin.token),
        400,
        "VALIDATION_FAILED",
      ),
    );
    const shared = await req(
      `/admin/assets/${ownerAsset.data.assetId}/operations`,
      "POST",
      { action: "share", reason: "dùng chung", license: "CC_BY", source: "Ảnh do NexaLab vẽ" },
      admin.token,
    );
    check(
      "a shared asset records its license and becomes readable by other teachers",
      shared.data?.scope === "SHARED_LIBRARY" &&
        shared.data.license === "CC_BY" &&
        (await fileStatus(ownerAsset.data.id, heir.token)) === 200,
    );
    check(
      "reassigning an asset to a parent is refused",
      envelope(
        await req(
          `/admin/assets/${ownerAsset.data.assetId}/operations`,
          "POST",
          { action: "reassign", reason: "chuyển", newOwnerId: parent.id },
          admin.token,
        ),
        400,
        "INVALID_NEW_OWNER",
      ),
    );
    await db.lesson.update({
      where: { id: lesson.id },
      data: { materials: [{ type: "image", url: `assetv:${ownerAsset.data.id}`, title: "Sơ đồ" }] },
    });
    const assetList = await timed("read", () => req(`/admin/assets?ownerId=${owner.id}`, "GET", undefined, admin.token));
    check(
      "asset list shows owner, scope, checksum and references",
      assetList.data?.items?.[0]?.references?.lessons?.some((l) => l.id === lesson.id) && assetList.data.items[0].versions?.[0]?.sha256,
    );
    const blocked = await req(`/admin/assets/${ownerAsset.data.assetId}`, "DELETE", { reason: "dọn", confirm: true }, admin.token);
    check(
      "a referenced asset cannot be deleted",
      envelope(blocked, 409, "ASSET_REFERENCED") && (await db.asset.count({ where: { id: ownerAsset.data.assetId } })) === 1,
    );
    const loose = await upload(heir.token, "le.png", png());
    if (loose.data?.assetId) created.assets.push(loose.data.assetId);
    const gone = await req(`/admin/assets/${loose.data.assetId}`, "DELETE", { reason: "tải nhầm", confirm: true }, admin.token);
    check(
      "an unreferenced asset deletes with audit",
      gone.status === 200 &&
        (await db.asset.count({ where: { id: loose.data.assetId } })) === 0 &&
        (await db.assetVersion.count({ where: { id: loose.data.id } })) === 0 &&
        (await db.auditLog.count({ where: { action: "asset.delete", targetId: loose.data.assetId } })) === 1,
    );

    // ---------- C2-T6 audit explorer ----------
    const readsBefore = await db.auditLog.count({ where: { action: "audit.read", actorId: admin.id } });
    const trail = await timed("read", () => req(`/admin/audit?targetId=${owner.id}&limit=1`, "GET", undefined, admin.token));
    const trailNext = await req(
      `/admin/audit?targetId=${owner.id}&limit=1&cursor=${trail.data?.nextCursor}`,
      "GET",
      undefined,
      admin.token,
    );
    check(
      "audit read is paginated and filtered by target",
      trail.status === 200 &&
        trail.data.items.length === 1 &&
        trail.data.nextCursor &&
        trailNext.data?.items?.length >= 1 &&
        [...trail.data.items, ...trailNext.data.items].every((r) => r.targetId === owner.id) &&
        trailNext.data.items[0].id !== trail.data.items[0].id,
    );
    check(
      "the audit read is itself audited",
      (await db.auditLog.count({ where: { action: "audit.read", actorId: admin.id } })) === readsBefore + 2,
    );
    const filtered = await req(`/admin/audit?action=user.disable&actorId=${admin.id}`, "GET", undefined, admin.token);
    check(
      "filter by action prefix and actor",
      filtered.data.items.length >= 2 && filtered.data.items.every((r) => r.action === "user.disable" && r.actorId === admin.id),
    );
    const everything = JSON.stringify(
      await db.auditLog.findMany({ where: { OR: [{ actorId: { in: created.users } }, { targetId: { in: created.users } }] } }),
    );
    check(
      "no password, reset token or hash appears in this run's audit rows",
      ![heirToken, expiring, concurrent, owner.password, heir.password, "C2-New-Teacher-2026!", "$argon2"]
        .filter(Boolean)
        .some((secret) => everything.includes(secret)),
    );
    for (let i = 0; i < 9; i++) {
      await timed("read", () => req("/admin/users?limit=25", "GET", undefined, admin.token));
      await timed("read", () => req("/admin/audit?limit=25", "GET", undefined, admin.token));
      const action = i % 2 ? "release" : "quarantine";
      await timed("mutation", () =>
        req(
          `/admin/content/${lesson.id}/operations`,
          "POST",
          { action, reason: "đo thời gian", acknowledgeActiveAssignments: true },
          admin.token,
        ),
      );
    }
    console.log(
      `     p95 read ${p95(timings.read)} ms (n=${timings.read.length}), mutation ${p95(timings.mutation)} ms (n=${timings.mutation.length}) — PRD QR-09 target 500/1000 ms; environment: ${h.origin}`,
    );
  },

  async cleanup() {
    // Restore the shared circuit configuration first.
    if (created.versions.length) {
      await db.attempt.updateMany({ where: { configVersionId: { in: created.versions } }, data: { configVersionId: null } });
      await db.simulationConfigVersion.deleteMany({ where: { id: { in: created.versions } } });
      if (restoreVersion)
        await db.simulationConfigVersion.update({ where: { id: restoreVersion }, data: { status: "active", retiredAt: null } });
    }
    const classes = await db.classroom.findMany({
      where: { OR: [{ id: { in: created.classes } }, { teacherId: { in: created.users } }] },
      select: { id: true },
    });
    await db.assignment.deleteMany({ where: { classId: { in: classes.map((c) => c.id) } } });
    await db.classroom.deleteMany({ where: { id: { in: classes.map((c) => c.id) } } });
    await db.lesson.deleteMany({ where: { OR: [{ id: { in: created.lessons } }, { authorId: { in: created.users } }] } });
    const assets = await db.asset.findMany({
      where: { OR: [{ id: { in: created.assets } }, { ownerId: { in: created.users } }] },
      include: { versions: true },
    });
    for (const a of assets) for (const v of a.versions) for (const key of [v.objectKey, v.stagingKey]) if (key) await storage().delete(key).catch(() => undefined);
    await db.assetVersion.deleteMany({ where: { assetId: { in: assets.map((a) => a.id) } } });
    await db.asset.deleteMany({ where: { id: { in: assets.map((a) => a.id) } } });
    await db.curriculumTopic.deleteMany({ where: { chapterCode: { in: created.chapters } } });
    await db.curriculumChapter.deleteMany({ where: { code: { in: created.chapters } } });
    await db.curriculumOutcome.deleteMany({ where: { code: { in: created.outcomes } } });
    await db.subject.deleteMany({ where: { id: { in: created.subjects } } });
    const targets = [
      ...created.users,
      ...created.classes,
      ...created.lessons,
      ...assets.map((a) => a.id),
      ...created.subjects,
      ...created.chapters,
      ...created.topics,
      ...created.outcomes,
      ...created.versions,
    ];
    await db.auditLog.deleteMany({ where: { OR: [{ actorId: { in: created.users } }, { targetId: { in: targets } }] } });
    await db.idempotencyRecord.deleteMany({ where: { actorId: { in: created.users } } });
    await db.user.deleteMany({ where: { id: { in: created.users } } });
  },
});
