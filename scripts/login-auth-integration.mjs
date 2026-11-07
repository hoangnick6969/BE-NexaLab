import "dotenv/config";
import "./assert-isolated-db.mjs";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { hash } from "argon2";

if (process.exitCode) process.exit(process.exitCode);
const origin = new URL(process.env.TEST_API ?? "http://127.0.0.1:4011/api");
assert.ok(
  ["127.0.0.1", "localhost", "[::1]"].includes(origin.hostname),
  "Auth verification requires a loopback API",
);
const db = new PrismaClient();
const username = `auth-${randomUUID().slice(0, 8)}`;
const password = "Isolated-Temporary-2026!";
const replacement = "Isolated-Permanent-2026!";
const users = [];
let passed = 0;
function check(name, value) {
  assert.ok(value, name);
  passed++;
  console.log(`PASS ${name}`);
}
async function req(path, body, token, cookie) {
  const r = await fetch(origin.href + path, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(cookie ? { cookie } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return {
    status: r.status,
    data: await r.json(),
    cookie: r.headers.get("set-cookie") ?? "",
  };
}
try {
  for (const expired of [false, true]) {
    const user = await db.user.create({
      data: {
        username: username + (expired ? "-expired" : ""),
        fullName: "Isolated Auth Verification",
        role: "STUDENT",
        passwordHash: await hash(password),
        mustChangePassword: true,
        temporaryPasswordExpiresAt: new Date(
          Date.now() + (expired ? -60000 : 3600000),
        ),
      },
    });
    users.push(user.id);
  }
  const expired = await req("/auth/student/login", {
    username: username + "-expired",
    password,
  });
  check(
    "expired temporary password gives actionable stable error",
    expired.status === 401 &&
      expired.data.code === "TEMPORARY_PASSWORD_EXPIRED",
  );
  const first = await req("/auth/student/login", {
    username,
    password,
    remember: true,
  });
  check(
    "temporary remembered login returns mandatory-change flag",
    first.status === 201 &&
      first.data.user.mustChangePassword === true &&
      /Max-Age=2592000/i.test(first.cookie),
  );
  const token = first.data.accessToken;
  const cookie = first.cookie.split(";")[0];
  const protectedRead = await req("/classes", undefined, token);
  check(
    "protected content rejects temporary session",
    protectedRead.status === 403 &&
      protectedRead.data.code === "PASSWORD_CHANGE_REQUIRED",
  );
  const wrong = await req(
    "/auth/password",
    { currentPassword: "Incorrect-Password", password: replacement },
    token,
  );
  check(
    "incorrect temporary password gives stable error and permits retry",
    wrong.status === 400 && wrong.data.code === "CURRENT_PASSWORD_INCORRECT",
  );
  const short = await req(
    "/auth/password",
    { currentPassword: password, password: "short" },
    token,
  );
  check(
    "short replacement rejected by server",
    short.status === 400 && short.data.code === "VALIDATION_FAILED",
  );
  const second = await req("/auth/student/login", {
    username,
    password,
    remember: false,
  });
  const changed = await req(
    "/auth/password",
    { currentPassword: password, password: replacement },
    token,
  );
  check(
    "change clears mandatory flag and returns replacement session",
    changed.status === 201 &&
      changed.data.user.mustChangePassword === false &&
      !!changed.data.accessToken,
  );
  check(
    "change preserves persistent cookie choice",
    /Max-Age=2592000/i.test(changed.cookie) &&
      /HttpOnly/i.test(changed.cookie) &&
      /Path=\/api\/auth/i.test(changed.cookie),
  );
  const user = await db.user.findUniqueOrThrow({ where: { id: users[0] } });
  const sessions = await db.session.findMany({ where: { userId: users[0] } });
  check(
    "database clears temporary expiry and revokes all previous sessions",
    user.temporaryPasswordExpiresAt === null &&
      sessions.length === 1 &&
      sessions[0].remember,
  );
  check(
    "old access token revoked",
    (await req("/auth/me", undefined, token)).status === 401,
  );
  check(
    "other access session revoked",
    (await req("/auth/me", undefined, second.data.accessToken)).status === 401,
  );
  check(
    "old refresh cookie revoked",
    (await req("/auth/refresh", {}, undefined, cookie)).status === 401,
  );
  check(
    "new session accesses protected content",
    (await req("/classes", undefined, changed.data.accessToken)).status === 200,
  );
  const oldPassword = await req("/auth/student/login", { username, password });
  check(
    "old temporary password cannot log in",
    oldPassword.status === 401 &&
      oldPassword.data.code === "INVALID_CREDENTIALS",
  );
  const rotated = await req(
    "/auth/refresh",
    {},
    undefined,
    changed.cookie.split(";")[0],
  );
  check(
    "refresh rotation preserves remembered choice after change",
    rotated.status === 201 && /Max-Age=2592000/i.test(rotated.cookie),
  );
  await db.session.updateMany({
    where: { userId: users[0] },
    data: { expiresAt: new Date(Date.now() - 1000) },
  });
  check(
    "expired session cannot restore",
    (await req("/auth/refresh", {}, undefined, rotated.cookie.split(";")[0]))
      .status === 401,
  );
  const ordinary = await req("/auth/student/login", {
    username,
    password: replacement,
    remember: false,
  });
  const ordinaryChange = await req(
    "/auth/password",
    {
      currentPassword: replacement,
      password: "Isolated-Second-Permanent-2026!",
    },
    ordinary.data.accessToken,
  );
  check(
    "ordinary password change retains session cookie",
    ordinaryChange.status === 201 &&
      !!ordinaryChange.cookie &&
      !/Max-Age|Expires=/i.test(ordinaryChange.cookie),
  );
  const ordinaryRotation = await req(
    "/auth/refresh",
    {},
    undefined,
    ordinaryChange.cookie.split(";")[0],
  );
  check(
    "ordinary refresh after password change remains a session cookie",
    ordinaryRotation.status === 201 &&
      !!ordinaryRotation.cookie &&
      !/Max-Age|Expires=/i.test(ordinaryRotation.cookie),
  );
  console.log(`${passed} auth integration assertions passed.`);
} finally {
  await db.session.deleteMany({ where: { userId: { in: users } } });
  await db.user.deleteMany({ where: { id: { in: users } } });
  await db.$disconnect();
}
