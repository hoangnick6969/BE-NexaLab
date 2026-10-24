// Teacher class management against the running API and its database:
//   flow 16 — class settings: rename, unique names, join code on/off and
//             approval switch, archive is read-only for owner and members;
//   flow 17 — roster: provisioned student first login, password reset by the
//             provisioning teacher (sessions revoked, old password dead, new
//             temporary password must be changed), reset denied for other
//             teachers and for enrolled existing accounts.
// All fixtures use a unique prefix and are removed afterwards.
//   TEST_API=http://127.0.0.1:4000/api npm run test:classes
import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import * as argon from "argon2";

const db = new PrismaClient();
const origin = process.env.TEST_API ?? "http://127.0.0.1:4100/api";
const prefix = "cls-" + Date.now().toString(36);
const password = "Classes-Fixture-2026!";
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

// The API keeps a 10/minute in-memory student-login limit per IP; wait out the window when hit.
async function login(path, body) {
  let res = await req(path, "POST", body);
  if (res.status === 429) {
    console.log("     waiting 61 s for the login rate window");
    await sleep(61000);
    res = await req(path, "POST", body);
  }
  return res;
}

async function teacher(label) {
  const row = await db.user.create({
    data: { email: `${prefix}-${label}@example.test`, fullName: `CLS ${label}`, role: "TEACHER", passwordHash: await argon.hash(password), consentAt: new Date() },
  });
  createdUsers.push(row.id);
  const res = await login("/auth/login", { email: row.email, password });
  assert.equal(res.status, 201, `${label} login ${JSON.stringify(res.data)}`);
  return { id: row.id, token: res.data.accessToken };
}

try {
  const owner = await teacher("owner");
  const other = await teacher("other");

  // ---------- flow 16: class settings ----------
  const made = await req("/classes", "POST", { name: `${prefix} Lớp 8A`, grade: 8 }, owner.token, key());
  check("owner creates a class", made.status === 201);
  const classId = made.data.class.id;
  const joinCode = made.data.joinCode ?? made.data.class.joinCode;
  const second = await req("/classes", "POST", { name: `${prefix} Lớp 8B`, grade: 8 }, owner.token, key());
  const renamed = await req(`/classes/${classId}`, "PUT", { name: `  ${prefix}   Lớp 8A1 ` }, owner.token);
  check("rename normalises whitespace", renamed.status === 200 && renamed.data.name === `${prefix} Lớp 8A1`, renamed.data);
  check(
    "rename to another own class's name is rejected",
    (await req(`/classes/${classId}`, "PUT", { name: second.data.class.name }, owner.token)).status === 409,
  );
  check("an empty update is rejected", (await req(`/classes/${classId}`, "PUT", {}, owner.token)).status === 400);
  check("another teacher cannot rename the class", [403, 404].includes((await req(`/classes/${classId}`, "PUT", { name: "x" }, other.token)).status));
  const renameAudit = await db.auditLog.findFirst({ where: { action: "class.update", targetId: classId } });
  check("rename is audited", renameAudit?.outcome === "success");

  // ---------- flow 17: provisioned student and password reset ----------
  const provisioned = await req(
    `/classes/${classId}/students`,
    "POST",
    { username: `${prefix}-hs`, fullName: "CLS học sinh", grade: 8, consent: true },
    owner.token,
    key(),
  );
  check("owner provisions a student with a one-time temporary password", provisioned.status === 201 && provisioned.data.credentials?.temporaryPassword);
  const studentId = provisioned.data.user.id;
  createdUsers.push(studentId);
  const username = provisioned.data.credentials.username;
  const first = await login("/auth/student/login", { username, password: provisioned.data.credentials.temporaryPassword });
  check("the temporary password logs in and must be changed", first.status === 201 && first.data.user?.mustChangePassword === true, first.data.user);
  const changed = await req(
    "/auth/password",
    "POST",
    { currentPassword: provisioned.data.credentials.temporaryPassword, password: "Classes-Student-2026!" },
    first.data.accessToken,
  );
  check("the student sets their own password", changed.status === 201);
  const studentToken = changed.data.accessToken;
  check("the new session works", (await req("/classes", "GET", undefined, studentToken)).status === 200);

  check(
    "another teacher cannot reset the student",
    [403, 404].includes((await req(`/classes/${classId}/students/${studentId}/reset-password`, "POST", {}, other.token)).status),
  );
  const reset = await req(`/classes/${classId}/students/${studentId}/reset-password`, "POST", {}, owner.token);
  check(
    "the provisioning teacher resets the password and sees it once",
    reset.status === 201 && reset.data.credentials.username === username && reset.data.credentials.temporaryPassword && reset.data.credentials.expiresAt,
  );
  check("reset revokes the student's sessions", (await req("/classes", "GET", undefined, studentToken)).status === 401);
  check(
    "the student's own password no longer works",
    (await login("/auth/student/login", { username, password: "Classes-Student-2026!" })).status === 401,
  );
  const afterReset = await login("/auth/student/login", { username, password: reset.data.credentials.temporaryPassword });
  check("the new temporary password logs in and must be changed", afterReset.status === 201 && afterReset.data.user?.mustChangePassword === true);
  check(
    "the reset is audited without the password",
    await db.auditLog
      .findFirst({ where: { action: "student.password_reset", targetId: studentId } })
      .then((row) => row?.outcome === "success" && !JSON.stringify(row).includes(reset.data.credentials.temporaryPassword)),
  );

  // An existing account enrolled by username is not the teacher's to reset.
  const otherClass = await req("/classes", "POST", { name: `${prefix} Lớp khác`, grade: 8 }, other.token, key());
  const enrolled = await req(`/classes/${otherClass.data.class.id}/enrollments`, "POST", { username }, other.token, key());
  check("another teacher enrolls the existing account", enrolled.status === 201);
  check(
    "that teacher cannot reset an account they did not provision",
    code(await req(`/classes/${otherClass.data.class.id}/students/${studentId}/reset-password`, "POST", {}, other.token), 403, "PASSWORD_RESET_NOT_ALLOWED"),
  );

  // ---------- flow 16: join switches ----------
  const joiner = await db.user.create({
    data: { username: `${prefix}-joiner`, fullName: "CLS joiner", role: "STUDENT", grade: 8, passwordHash: await argon.hash(password), consentAt: new Date() },
  });
  createdUsers.push(joiner.id);
  const joinerLogin = await login("/auth/student/login", { username: joiner.username, password });
  const off = await req(`/classes/${classId}`, "PUT", { joinCodeEnabled: false }, owner.token);
  check("owner disables the join code", off.status === 200 && off.data.joinCode.enabled === false);
  const disabledJoin = await req("/classes/join", "POST", { code: joinCode }, joinerLogin.data.accessToken, key());
  const malformed = await req("/classes/join", "POST", { code: "NL-XXXXXX-0000000000" }, joinerLogin.data.accessToken, key());
  check("a disabled code fails like any invalid code", disabledJoin.status === malformed.status && disabledJoin.data?.code === malformed.data?.code, disabledJoin.data);
  await req(`/classes/${classId}`, "PUT", { joinCodeEnabled: true, requiresApproval: false }, owner.token);
  const direct = await req("/classes/join", "POST", { code: joinCode }, joinerLogin.data.accessToken, key());
  check("with approval off a join is approved at once", direct.status === 201 && direct.data.enrollmentStatus === "approved", direct.data);

  // ---------- flow 16: archive is read-only ----------
  const archived = await req(`/classes/${classId}/archive`, "POST", { confirm: true, reason: "hết học kỳ" }, owner.token);
  check("owner archives the class", archived.status === 201);
  check("an archived class cannot be renamed", code(await req(`/classes/${classId}`, "PUT", { name: `${prefix} mới` }, owner.token), 409, "CLASS_ARCHIVED"));
  check(
    "an archived class cannot reset passwords",
    code(await req(`/classes/${classId}/students/${studentId}/reset-password`, "POST", {}, owner.token), 409, "CLASS_ARCHIVED"),
  );
  check(
    "an archived class cannot rotate its join code",
    (await req(`/classes/${classId}/join-code/rotate`, "POST", {}, owner.token, key())).status === 409,
  );
  const ownerList = (await req("/classes", "GET", undefined, owner.token)).data ?? [];
  check("the owner still lists the archived class", ownerList.some((c) => c.id === classId && c.status === "ARCHIVED"));
  const memberList = (await req("/classes", "GET", undefined, joinerLogin.data.accessToken)).data ?? [];
  const seen = memberList.find((c) => c.id === classId);
  check("a member sees the class as archived, not as active", !seen || seen.status === "ARCHIVED", seen);

  console.log(`\nClasses: ${passed} checks passed.`);
} catch (error) {
  console.error("FAIL", error.message);
  process.exitCode = 1;
} finally {
  const classes = await db.classroom.findMany({ where: { teacherId: { in: createdUsers } }, select: { id: true } });
  await db.assignment.deleteMany({ where: { classId: { in: classes.map((c) => c.id) } } });
  await db.classroom.deleteMany({ where: { id: { in: classes.map((c) => c.id) } } });
  await db.idempotencyRecord.deleteMany({ where: { actorId: { in: createdUsers } } });
  await db.auditLog.deleteMany({ where: { OR: [{ actorId: { in: createdUsers } }, { targetId: { in: createdUsers } }] } });
  await db.user.deleteMany({ where: { id: { in: createdUsers } } });
  await db.$disconnect();
}
