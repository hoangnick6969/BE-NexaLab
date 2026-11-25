// Run only with an isolated loopback database and a separately started API using
// AI_CREDITS_ENABLED=true, AI_STARTER_CREDITS=10 and the fake provider.
import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { hash } from "argon2";
import { deletionBlockers } from "../src/modules/users/application/admin-policy";

const loopback = (value) => {
  try { const u = new URL(value); return ["localhost", "127.0.0.1", "::1", "[::1]"].includes(u.hostname.toLowerCase()) ? `${u.hostname}:${u.port || "5432"}${u.pathname}` : null; }
  catch { return null; }
};
const isolated = loopback(process.env.NEXALAB_ISOLATED_DATABASE_URL ?? "");
if (!isolated || loopback(process.env.DATABASE_URL ?? "") !== isolated || loopback(process.env.DIRECT_URL ?? "") !== isolated)
  throw new Error("F2 integration requires one isolated loopback database for all database URLs");
const db = new PrismaClient();
const origin = process.env.TEST_API ?? "http://127.0.0.1:4100/api";
const prefix = `f2-${Date.now().toString(36)}`;
const password = `F2-${randomUUID()}!`;
const users = [];
const classes = [];
async function api(path, method = "GET", token, body, headers = {}) {
  const res = await fetch(origin + path, { method, headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}), ...headers }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  return { status: res.status, data: await res.json().catch(() => null) };
}
async function fixture(label, role = "TEACHER", status = "active") {
  // Students sign in with a username and have no email (User_role_identifier_check).
  const identity = role === "STUDENT" ? { username: `${prefix}-${label}` } : { email: `${prefix}-${label}@example.test` };
  const row = await db.user.create({ data: { ...identity, fullName: label, role, status, passwordHash: await hash(password), consentAt: new Date() } });
  users.push(row.id);
  // Students and parents never call credit routes here; inactive users cannot log in.
  if (status !== "active" || role === "STUDENT" || role === "PARENT") return { id: row.id };
  const login = await api(role === "ADMIN" ? "/auth/admin/login" : "/auth/login", "POST", null, { email: row.email, password });
  assert.equal(login.status, 201);
  return { id: row.id, token: login.data.accessToken };
}
const count = (id) => db.creditTransaction.count({ where: { systemKey: `starter:v1:${id}` } });
try {
  const teacher = await fixture("existing");
  const first = await api("/me/credits", "GET", teacher.token);
  assert.equal(first.status, 200);
  assert.equal(first.data.available, 10);
  assert.equal(first.data.starterGrant?.credits, 10);
  assert.equal(first.data.transactions.filter((t) => t.origin === "STARTER").length, 1);
  await api("/me/credits", "GET", teacher.token);
  assert.equal(await count(teacher.id), 1);

  const parallel = await fixture("parallel");
  const classroom = await db.classroom.create({ data: { teacherId: parallel.id, name: `${prefix} class`, grade: 8 } });
  classes.push(classroom.id);
  const estimate = { purpose: "GENERATE_RESOURCE", targetKind: "TEST", lessonId: "lesson-circuit", itemCount: 5 };
  const calls = Array.from({ length: 10 }, (_, i) => i % 2 ? api(`/classes/${classroom.id}/ai-jobs/estimate`, "POST", parallel.token, estimate) : api("/me/credits", "GET", parallel.token));
  const results = await Promise.all(calls);
  assert.ok(results.every((r) => r.status === 200 || r.status === 201));
  assert.equal(await count(parallel.id), 1);
  assert.equal((await db.creditAccount.findFirst({ where: { ownerId: parallel.id, kind: "TEACHER_AVAILABLE" } })).balance, 10);
  assert.ok((await deletionBlockers(db, teacher.id)).creditTransactions > 0);

  const admin = await fixture("admin", "ADMIN");
  const granted = await fixture("admin-granted");
  const manual = await api(`/admin/credits/accounts/${granted.id}/grants`, "POST", admin.token, { credits: 4, reason: "Cấp thử nghiệm" }, { "Idempotency-Key": randomUUID() });
  assert.equal(manual.status, 201);
  const history = await api(`/admin/credits/accounts?teacherId=${granted.id}`, "GET", admin.token);
  assert.equal(history.data.available, 14);
  assert.ok(history.data.transactions.some((t) => t.origin === "ADMIN"));
  assert.ok(history.data.transactions.some((t) => t.origin === "STARTER"));

  for (const role of ["STUDENT", "PARENT"]) await fixture(role.toLowerCase(), role);
  const disabled = await fixture("disabled", "TEACHER", "disabled");
  assert.equal(await count(disabled.id), 0);
  const allNonTeachers = await db.user.findMany({ where: { id: { in: users }, role: { not: "TEACHER" } }, select: { id: true } });
  assert.ok((await Promise.all(allNonTeachers.map((u) => count(u.id)))).every((n) => n === 0));

  const expensive = await api(`/classes/${classroom.id}/ai-jobs`, "POST", parallel.token, { ...estimate, itemCount: 10, confirmedCredits: 12 }, { "Idempotency-Key": randomUUID() });
  assert.equal(expensive.status, 402);
  assert.equal(expensive.data?.details?.available, 10);
  assert.equal(await count(parallel.id), 1);
  assert.equal((await db.creditAccount.findFirst({ where: { ownerId: parallel.id, kind: "TEACHER_AVAILABLE" } })).balance, 10);
  console.log("F2 starter integration passed: once-only, parallel, admin origin, role/status, and 402 persistence");
} finally {
  // Disposable fixtures are left in the isolated database for ledger reconciliation and inspection.
  await db.$disconnect();
}
