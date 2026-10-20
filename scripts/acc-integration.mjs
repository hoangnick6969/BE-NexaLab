// Account, preferences and notifications (increment account-notifications-r2, acc-1..acc-6) against the running
// API, its database and the configured object storage. Every fixture uses a unique prefix and is removed afterwards.
//   TEST_API=http://127.0.0.1:4000/api npm run test:acc
import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import * as argon from "argon2";

const db = new PrismaClient();
const origin = process.env.TEST_API ?? "http://127.0.0.1:4000/api";
const prefix = "acc-accept-" + Date.now().toString(36);
const password = "Acc-Accept-Password-2026!";
const createdUsers = [];
const createdClasses = [];
const storedKeys = [];
let passed = 0;

async function req(path, method = "GET", body, auth, headers = {}) {
  const r = await fetch(origin + path, {
    method,
    headers: { "content-type": "application/json", ...(auth ? { authorization: "Bearer " + auth } : {}), ...(method === "GET" ? {} : { "Idempotency-Key": randomUUID() }), ...headers },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const data = await r.json().catch(() => null);
  return { status: r.status, data, cookies: r.headers.getSetCookie?.() ?? [] };
}
function check(name, condition, detail) {
  assert.ok(condition, name + (detail === undefined ? "" : " — " + JSON.stringify(detail).slice(0, 400)));
  passed++;
  console.log("PASS " + name);
}
const code = (res, status, value) => res.status === status && res.data?.code === value;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const refreshCookie = (res) => res.cookies.find((c) => /^(nexalab_)?refresh/i.test(c) || /refresh/i.test(c.split("=")[0])) ?? "";

async function login(path, body) {
  let res = await req(path, "POST", body);
  if (res.status === 429) {
    console.log("     (login rate limit, waiting 61 s)");
    await sleep(61000);
    res = await req(path, "POST", body);
  }
  return res;
}
async function user(label, role) {
  const row = await db.user.create({
    data: {
      ...(role === "STUDENT" ? { username: `${prefix}-${label}` } : { email: `${prefix}-${label}@example.test` }),
      fullName: `Acc ${label}`,
      role,
      passwordHash: await argon.hash(password),
      consentAt: new Date(),
    },
  });
  createdUsers.push(row.id);
  const path = role === "STUDENT" ? "/auth/student/login" : role === "ADMIN" ? "/auth/admin/login" : "/auth/login";
  const res = await login(path, role === "STUDENT" ? { username: row.username, password } : { email: row.email, password });
  assert.equal(res.status, 201, `${label} login ${res.status}`);
  return { ...row, token: res.data.accessToken, path };
}
async function uploadAvatar(who) {
  const png = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), Buffer.alloc(64, 1)]);
  const slot = await req("/me/avatar/upload-url", "POST", { contentType: "image/png", bytes: png.length }, who.token);
  storedKeys.push(slot.data?.key);
  const put = await fetch(slot.data.url, { method: "PUT", headers: slot.data.headers, body: png });
  const confirmed = await req("/me/avatar", "POST", { key: slot.data.key }, who.token);
  return { slot, put, confirmed };
}

async function main() {
  const teacher = await user("teacher", "TEACHER");
  const outsider = await user("outsider", "TEACHER");
  const student = await user("student", "STUDENT");
  const parent = await user("parent", "PARENT");
  const admin = await user("admin", "ADMIN");
  const spare = await user("spare", "PARENT");

  // acc-1 remember-me sessions
  const persistent = await login("/auth/login", { email: teacher.email, password, remember: true });
  const session = await login("/auth/login", { email: teacher.email, password, remember: false });
  check("remember-me login sets a persistent refresh cookie", /max-age=\d+/i.test(refreshCookie(persistent)), persistent.cookies);
  check("a session login sets a browser-session cookie (no Max-Age/Expires)", refreshCookie(session) && !/max-age|expires=/i.test(refreshCookie(session)), session.cookies);
  const rotated = await req("/auth/refresh", "POST", {}, undefined, { cookie: refreshCookie(persistent).split(";")[0] });
  check("refresh rotation keeps the remember-me choice", rotated.status === 201 && /max-age=\d+/i.test(refreshCookie(rotated)), rotated.status);
  const wrong = await login("/auth/login", { email: teacher.email, password: "not-the-password" });
  check("a wrong password has a stable code (acc-5)", code(wrong, 401, "INVALID_CREDENTIALS"), wrong.data);

  // acc-2 profile and avatar
  const profile = await req("/me/profile", "GET", undefined, teacher.token);
  check("own profile with editable name for adults", profile.status === 200 && profile.data.canEditName === true && profile.data.avatarUrl === null, profile.data);
  const renamed = await req("/me/profile", "PATCH", { fullName: `Acc teacher renamed` }, teacher.token);
  check("an adult renames themselves", renamed.status === 200 && renamed.data.fullName === "Acc teacher renamed", renamed.data);
  check("a student's name is locked", code(await req("/me/profile", "PATCH", { fullName: "x" }, student.token), 403, "PROFILE_NAME_LOCKED"));
  const own = await uploadAvatar(student);
  check("avatar upload slot is under the caller's staging prefix", own.slot.data.key.includes(`/staging/avatars/${student.id}/`), own.slot.data.key);
  check("avatar confirmed after the browser-style PUT", own.put.ok && own.confirmed.status === 201 && own.confirmed.data.avatarUrl, own.confirmed.status);
  const stored = await db.user.findUnique({ where: { id: student.id }, select: { avatarKey: true } });
  storedKeys.push(stored.avatarKey);
  check("the stored avatar key left staging (acc-6)", stored.avatarKey.includes(`/avatars/${student.id}/`) && !stored.avatarKey.includes("/staging/"), stored.avatarKey);
  const image = await fetch(own.confirmed.data.avatarUrl);
  check("the presigned avatar URL serves the image", image.ok && (image.headers.get("content-type") ?? "").startsWith("image/png"), image.status);
  check("another user's staging key is refused", code(await req("/me/avatar", "POST", { key: own.slot.data.key }, teacher.token), 400, "AVATAR_KEY_INVALID"));

  // acc-3 notifications through enrollment request and approval
  const created = await req("/classes", "POST", { name: `${prefix} lớp`, grade: 8, requiresApproval: true }, teacher.token);
  check("teacher creates a class that needs approval", created.status === 201 && created.data.joinCode, created.status);
  const classId = created.data.class.id;
  createdClasses.push(classId);
  const joined = await req("/classes/join", "POST", { code: created.data.joinCode }, student.token);
  check("the student's join request is pending", joined.status === 201 && joined.data.enrollmentStatus === "pending", joined.data);
  const teacherList = await req("/me/notifications", "GET", undefined, teacher.token);
  check("the owning teacher is notified of the request", teacherList.data.items.some((n) => n.type === "ENROLLMENT_REQUESTED"), teacherList.data);
  const approved = await req(`/classes/${classId}/students/${student.id}`, "PUT", { status: "approved" }, teacher.token);
  check("the teacher approves the request", approved.status === 200, approved.status);
  const unread = await req("/me/notifications/unread-count", "GET", undefined, student.token);
  const studentList = await req("/me/notifications", "GET", undefined, student.token);
  const approvedNotice = studentList.data.items.find((n) => n.type === "ENROLLMENT_APPROVED");
  check("the student is notified of the approval", approvedNotice && unread.data.count >= 1, studentList.data);
  check("nobody else can read the student's notice", (await req(`/me/notifications/${approvedNotice.id}/read`, "POST", {}, outsider.token)).status === 404);
  check("the student marks it read", (await req(`/me/notifications/${approvedNotice.id}/read`, "POST", {}, student.token)).status === 201);
  await req("/me/notifications/read-all", "POST", {}, student.token);
  check("read-all clears the unread count", (await req("/me/notifications/unread-count", "GET", undefined, student.token)).data.count === 0);

  // acc-2 moderation: outsider refused, owning teacher removes the member's avatar
  check("an outsider teacher cannot remove the avatar", code(await req(`/classes/${classId}/students/${student.id}/avatar`, "DELETE", undefined, outsider.token), 403, "CLASS_ACCESS_DENIED"));
  const roster = await req(`/classes/${classId}/students`, "GET", undefined, teacher.token);
  check("the owning teacher sees the member's avatar in the roster", roster.data.find((e) => e.studentId === student.id)?.student.avatarUrl, roster.data);
  const removed = await req(`/classes/${classId}/students/${student.id}/avatar`, "DELETE", undefined, teacher.token);
  check("the owning teacher removes it", removed.status === 200 && !(await db.user.findUnique({ where: { id: student.id } })).avatarKey, removed.status);

  // acc-3 parent panel reads stored notifications
  await db.parentLink.create({ data: { parentId: parent.id, studentId: student.id, status: "approved" } });
  const notices = await req(`/children/${student.id}/assignment-notices`, "GET", undefined, parent.token);
  check("the linked parent's overdue panel answers from stored notices", notices.status === 200 && Array.isArray(notices.data), notices.data);

  // acc-4 / acc-5 preferences
  const prefs = await req("/me/preferences", "PATCH", { theme: "dark", locale: "en" }, student.token);
  check("a student saves theme and language", prefs.status === 200 && prefs.data.preferences.theme === "dark" && prefs.data.preferences.locale === "en", prefs.data);
  check("unknown preference values are refused", (await req("/me/preferences", "PATCH", { theme: "neon" }, student.token)).status === 400);
  check("the profile returns the saved preferences", (await req("/me/profile", "GET", undefined, student.token)).data.preferences.locale === "en");

  // acc-6 deleting an account deletes its avatar object. Uploading an avatar is audited, and audit history makes an
  // account ineligible for hard deletion (disable instead), so the deletable case is an avatar with no history.
  await uploadAvatar(spare);
  storedKeys.push((await db.user.findUnique({ where: { id: spare.id } })).avatarKey);
  check("an account with audited history cannot be hard-deleted", code(await req(`/admin/users/${spare.id}`, "DELETE", { reason: "acc acceptance", confirm: true }, admin.token), 409, "DELETE_INELIGIBLE"));
  const { storage } = await import("../src/modules/storage/infrastructure/storage.ts");
  const clean = await user("clean", "PARENT");
  const cleanKey = `${process.env.APP_ENV ?? "development"}/avatars/${clean.id}/${randomUUID()}.png`;
  storedKeys.push(cleanKey);
  await storage().put(cleanKey, Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), "image/png");
  await db.user.update({ where: { id: clean.id }, data: { avatarKey: cleanKey } });
  await db.session.deleteMany({ where: { userId: clean.id } });
  const gone = await req(`/admin/users/${clean.id}`, "DELETE", { reason: "acc acceptance", confirm: true }, admin.token);
  check("account deletion removes the avatar object", gone.status === 200 && (await storage().head(cleanKey)) === null, gone.data);

  console.log(`\n${passed} checks passed`);
}

async function cleanup() {
  try {
    const { storage } = await import("../src/modules/storage/infrastructure/storage.ts");
    for (const key of storedKeys.filter(Boolean)) await storage().delete(key).catch(() => undefined);
  } catch {
    console.log("     (run with tsx to also delete stored objects)");
  }
  await db.notification.deleteMany({ where: { recipientId: { in: createdUsers } } });
  await db.parentLink.deleteMany({ where: { OR: [{ parentId: { in: createdUsers } }, { studentId: { in: createdUsers } }] } });
  await db.enrollment.deleteMany({ where: { classId: { in: createdClasses } } });
  await db.classroom.deleteMany({ where: { id: { in: createdClasses } } });
  await db.auditLog.deleteMany({ where: { OR: [{ actorId: { in: createdUsers } }, { targetId: { in: [...createdUsers, ...createdClasses] } }] } });
  await db.idempotencyRecord.deleteMany({ where: { actorId: { in: createdUsers } } });
  await db.session.deleteMany({ where: { userId: { in: createdUsers } } });
  await db.user.deleteMany({ where: { id: { in: createdUsers } } });
  const left = await db.user.count({ where: { OR: [{ email: { startsWith: prefix } }, { username: { startsWith: prefix } }] } });
  console.log(`cleanup: ${left} users left with prefix ${prefix}`);
  await db.$disconnect();
}

main()
  .catch((error) => {
    console.error("FAIL " + error.message);
    process.exitCode = 1;
  })
  .finally(cleanup);
