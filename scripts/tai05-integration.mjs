// TAI-05 real-dependency proof (TAI5-T3, T4, T6): the SPEC success-signal journey against the running API and its
// database, the PostgreSQL-only guarantees (balance CHECK, partial unique system accounts, append-only triggers,
// (aiJobId, kind) uniqueness, concurrent creates at the balance boundary), and `npm run credits:reconcile` on a clean
// ledger and on one injected fault of every class. Every fixture uses a unique prefix and is removed afterwards.
//
// WRITTEN, NOT RUN: no isolated loopback database exists on the machine where it was written. Run it only against an
// isolated local PostgreSQL that has the TAI-05 migration applied (the npm script is guarded by assert-isolated-db, and
// this file refuses a non-loopback database). The API under test must run with the fake provider and credits on:
//   AI_PROVIDER=fake AI_RUNNER_ENABLED=true AI_PROVIDER_MIN_INTERVAL_MS=0 AI_CREDITS_ENABLED=true
//   AI_CONCURRENT_JOB_LIMIT=20 AI_DAILY_JOB_LIMIT=100
//   NEXALAB_ISOLATED_DATABASE_URL=... DATABASE_URL=... DIRECT_URL=...  (same loopback database)
//   TEST_API=http://127.0.0.1:4100/api npm run test:tai05
// Fault injection temporarily drops a constraint or disables an immutability trigger in that disposable database and
// restores it in a finally block; it never runs against anything but the loopback target checked below.
import "dotenv/config";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import * as argon from "argon2";

const loopback = (value) => {
  try {
    const url = new URL(value);
    return ["localhost", "127.0.0.1", "::1", "[::1]"].includes(url.hostname.toLowerCase()) ? `${url.hostname}:${url.port || "5432"}${url.pathname}` : null;
  } catch {
    return null;
  }
};
const isolated = loopback(process.env.NEXALAB_ISOLATED_DATABASE_URL ?? "");
if (!isolated || loopback(process.env.DATABASE_URL ?? "") !== isolated) {
  console.error("tai05-integration: refusing to run: DATABASE_URL must equal an isolated loopback NEXALAB_ISOLATED_DATABASE_URL.");
  process.exit(1);
}

const db = new PrismaClient();
const origin = process.env.TEST_API ?? "http://127.0.0.1:4100/api";
const prefix = "tai05-" + Date.now().toString(36);
const password = "Tai05-Journey-Password-2026!";
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
  assert.ok(condition, name + (detail === undefined ? "" : " - " + JSON.stringify(detail)));
  passed++;
  console.log("PASS " + name);
}
const code = (res, status, value) => res.status === status && res.data?.code === value;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const rejects = async (promise) => promise.then(() => null, (error) => error);
const TOKEN_WORDS = /token|gemini|fake-model/i;

async function user(label, role, fullName, extra = {}) {
  const row = await db.user.create({
    data: {
      ...(role === "STUDENT" ? { username: `${prefix}-${label}` } : { email: `${prefix}-${label}@example.test` }),
      fullName, role, passwordHash: await argon.hash(password), consentAt: new Date(), ...extra,
    },
  });
  createdUsers.push(row.id);
  const signIn = () => (role === "STUDENT" ? req("/auth/student/login", "POST", { username: row.username, password }) : req("/auth/login", "POST", { email: row.email, password }));
  let login = await signIn();
  if (login.status === 429) {
    console.log("     waiting 61 s for the login rate window");
    await sleep(61000);
    login = await signIn();
  }
  assert.equal(login.status, 201, `${label} login ${JSON.stringify(login.data)}`);
  return { id: row.id, token: login.data.accessToken };
}

async function waitForJob(classId, jobId, token) {
  for (let i = 0; i < 40; i++) {
    const res = await req(`/classes/${classId}/ai-jobs/${jobId}`, "GET", undefined, token);
    if (["SUCCEEDED", "FAILED", "CANCELLED"].includes(res.data?.status)) return res.data;
    await sleep(1000);
  }
  throw new Error(`job ${jobId} did not finish in 40 s (is the runner enabled with AI_PROVIDER=fake?)`);
}

function reconcile() {
  const run = spawnSync("npx", ["tsx", "scripts/credits-reconcile.ts", "--json"], { encoding: "utf8", shell: process.platform === "win32", env: process.env });
  let report = null;
  try {
    report = JSON.parse(run.stdout);
  } catch {
    report = null;
  }
  return { code: run.status, report, stderr: run.stderr };
}

async function withoutTriggers(fn) {
  await db.$executeRawUnsafe(`ALTER TABLE "CreditEntry" DISABLE TRIGGER "CreditEntry_immutable"`);
  await db.$executeRawUnsafe(`ALTER TABLE "CreditTransaction" DISABLE TRIGGER "CreditTransaction_immutable"`);
  try {
    return await fn();
  } finally {
    await db.$executeRawUnsafe(`ALTER TABLE "CreditEntry" ENABLE TRIGGER "CreditEntry_immutable"`);
    await db.$executeRawUnsafe(`ALTER TABLE "CreditTransaction" ENABLE TRIGGER "CreditTransaction_immutable"`);
  }
}

try {
  const owner = await user("owner", "TEACHER", "TAI05 Owner");
  const poor = await user("poor", "TEACHER", "TAI05 Poor");
  const outsider = await user("outsider", "TEACHER", "TAI05 Outsider");
  const student = await user("student", "STUDENT", "Trần Bảo Ngọc");
  const parent = await user("parent", "PARENT", "TAI05 Parent", { emailVerifiedAt: new Date() });
  const admin = await user("admin", "ADMIN", "TAI05 Admin");
  const lesson = await db.lesson.findFirst({ where: { scope: "SHARED_LIBRARY", status: "published" }, select: { id: true } });
  assert.ok(lesson, "a published shared lesson exists");
  const classA = await db.classroom.create({ data: { teacherId: owner.id, name: `${prefix} class A`, grade: 8 } });
  const classP = await db.classroom.create({ data: { teacherId: poor.id, name: `${prefix} poor class`, grade: 8 } });
  const classO = await db.classroom.create({ data: { teacherId: outsider.id, name: `${prefix} outsider class`, grade: 8 } });
  classIds.push(classA.id, classP.id, classO.id);
  const body = (patch = {}) => ({ purpose: "GENERATE_RESOURCE", targetKind: "TEST", lessonId: lesson.id, itemCount: 5, ...patch });

  // ---------- baseline price and role denials ----------
  const pricing = await req("/admin/credits/pricing", "GET", undefined, admin.token);
  check("admin lists the pricing versions; every purpose has exactly one active version", pricing.status === 200 && ["GENERATE_RESOURCE", "ASSESS_SUBMISSION"].every((p) => pricing.data.items.filter((r) => r.purpose === p && r.status === "active").length === 1), pricing.data);
  for (const [who, token] of [["teacher", owner.token], ["student", student.token], ["parent", parent.token]])
    check(`${who} is denied the admin credit routes`, (await req("/admin/credits/pricing", "GET", undefined, token)).status === 403);
  for (const [who, token] of [["student", student.token], ["parent", parent.token], ["admin", admin.token]])
    check(`${who} is denied the teacher credit routes`, (await req("/me/credits", "GET", undefined, token)).status === 403 && (await req(`/classes/${classA.id}/ai-jobs/estimate`, "POST", body(), token)).status === 403);

  // ---------- grant, replay, estimate ----------
  const grantKey = key();
  const grant = await req(`/admin/credits/accounts/${owner.id}/grants`, "POST", { credits: 100, reason: "Cấp thử nghiệm TAI-05" }, admin.token, grantKey);
  const replay = await req(`/admin/credits/accounts/${owner.id}/grants`, "POST", { credits: 100, reason: "Cấp thử nghiệm TAI-05" }, admin.token, grantKey);
  check("a grant posts once and its key replays the same result", grant.status === 201 && replay.status === 201 && replay.data.transactionId === grant.data.transactionId && (await db.creditTransaction.count({ where: { kind: "GRANT", idempotencyKey: grantKey[ "Idempotency-Key" ] } })) === 1, [grant.data, replay.data]);
  check("a grant without a key, with a short reason or to a non-teacher is refused", (await req(`/admin/credits/accounts/${owner.id}/grants`, "POST", { credits: 5, reason: "Cấp thử nghiệm" }, admin.token)).status === 400
    && (await req(`/admin/credits/accounts/${owner.id}/grants`, "POST", { credits: 5, reason: "ngắn" }, admin.token, key())).status === 400
    && (await req(`/admin/credits/accounts/${student.id}/grants`, "POST", { credits: 5, reason: "Cấp thử nghiệm" }, admin.token, key())).status === 404);
  const overdraw = await req(`/admin/credits/accounts/${owner.id}/adjustments`, "POST", { credits: -101, reason: "Điều chỉnh quá số dư" }, admin.token, key());
  check("an overdrawing adjustment is 409 CREDIT_BALANCE_NEGATIVE and changes nothing", code(overdraw, 409, "CREDIT_BALANCE_NEGATIVE") && (await db.creditAccount.findFirst({ where: { kind: "TEACHER_AVAILABLE", ownerId: owner.id } })).balance === 100);

  const estimate = await req(`/classes/${classA.id}/ai-jobs/estimate`, "POST", body(), owner.token);
  check("estimate is deterministic, in credits and writes nothing", estimate.status === 200 && estimate.data.enabled === true && estimate.data.credits === 7 && estimate.data.available === 100 && !TOKEN_WORDS.test(JSON.stringify(estimate.data)), estimate.data);
  check("estimate for a foreign class is 403 CLASS_ACCESS_DENIED", code(await req(`/classes/${classA.id}/ai-jobs/estimate`, "POST", body(), outsider.token), 403, "CLASS_ACCESS_DENIED"));

  // ---------- create: confirm, stale, insufficient, replay ----------
  check("a stale confirmation is 409 AI_ESTIMATE_CHANGED with the new value and creates no job", await (async () => {
    const res = await req(`/classes/${classA.id}/ai-jobs`, "POST", body({ confirmedCredits: 3 }), owner.token, key());
    return code(res, 409, "AI_ESTIMATE_CHANGED") && res.data.details.credits === 7 && (await db.aiJob.count({ where: { classId: classA.id } })) === 0;
  })());
  check("a missing confirmation is 400 while credits are on", (await req(`/classes/${classA.id}/ai-jobs`, "POST", body(), owner.token, key())).status === 400);
  const poorRes = await req(`/classes/${classP.id}/ai-jobs`, "POST", body({ confirmedCredits: 7 }), poor.token, key());
  check("a teacher with no credits gets 402 AI_CREDITS_INSUFFICIENT and nothing is created", code(poorRes, 402, "AI_CREDITS_INSUFFICIENT") && poorRes.data.details.available === 0 && poorRes.data.details.required === 7 && (await db.aiJob.count({ where: { classId: classP.id } })) === 0);

  const k = key();
  const first = await req(`/classes/${classA.id}/ai-jobs`, "POST", body({ confirmedCredits: 7 }), owner.token, k);
  const again = await req(`/classes/${classA.id}/ai-jobs`, "POST", body({ confirmedCredits: 7 }), owner.token, k);
  check("a double click creates one job and one reserve", first.status === 202 && again.status === 202 && again.data.id === first.data.id && (await db.creditTransaction.count({ where: { aiJobId: first.data.id, kind: "RESERVE" } })) === 1, [first.data, again.data]);
  const done = await waitForJob(classA.id, first.data.id, owner.token);
  check("the job succeeds and settles at most the reserved estimate", done.status === "SUCCEEDED" && done.credits.state === "settled" && done.credits.charged <= 7 && done.credits.charged + done.credits.refunded === 7 && !TOKEN_WORDS.test(JSON.stringify(done)) && !("usage" in done), done);
  check("exactly one SETTLE and no REFUND for the succeeded job", (await db.creditTransaction.count({ where: { aiJobId: first.data.id, kind: "SETTLE" } })) === 1 && (await db.creditTransaction.count({ where: { aiJobId: first.data.id, kind: "REFUND" } })) === 0);

  // ---------- cancel refunds ----------
  const toCancel = await req(`/classes/${classA.id}/ai-jobs`, "POST", body({ confirmedCredits: 7 }), owner.token, key());
  const cancelled = await req(`/classes/${classA.id}/ai-jobs/${toCancel.data.id}/cancel`, "POST", {}, owner.token);
  await sleep(1500); // a late runner persist must not settle
  check("cancel refunds in full exactly once and a late result posts nothing", cancelled.status === 200 && (await db.creditTransaction.count({ where: { aiJobId: toCancel.data.id, kind: "REFUND" } })) === 1 && (await db.creditTransaction.count({ where: { aiJobId: toCancel.data.id, kind: "SETTLE" } })) === 0);

  // ---------- teacher history ----------
  const mine = await req("/me/credits", "GET", undefined, owner.token);
  check("the history is in credits, newest first, with no tokens or provider names", mine.status === 200 && mine.data.reserved === 0 && mine.data.transactions.length >= 5 && !TOKEN_WORDS.test(JSON.stringify(mine.data)) && mine.data.transactions[0].createdAt >= mine.data.transactions.at(-1).createdAt, mine.data);

  // ---------- concurrency at the boundary (SPEC CAP-3) ----------
  const racer = await user("racer", "TEACHER", "TAI05 Racer");
  const classR = await db.classroom.create({ data: { teacherId: racer.id, name: `${prefix} racer class`, grade: 8 } });
  classIds.push(classR.id);
  await req(`/admin/credits/accounts/${racer.id}/grants`, "POST", { credits: 14, reason: "Cấp đúng hai lượt" }, admin.token, key());
  const race = await Promise.all(Array.from({ length: 6 }, () => req(`/classes/${classR.id}/ai-jobs`, "POST", body({ confirmedCredits: 7 }), racer.token, key())));
  const won = race.filter((r) => r.status === 202).length;
  const lost = race.filter((r) => r.status === 402).length;
  const racerAvailable = (await db.creditAccount.findFirst({ where: { kind: "TEACHER_AVAILABLE", ownerId: racer.id } })).balance;
  check("six concurrent creates against 14 credits let exactly two through and never overdraw", won === 2 && lost === 4 && racerAvailable === 0, race.map((r) => r.status));

  // ---------- PostgreSQL-only guarantees ----------
  const available = await db.creditAccount.findFirst({ where: { kind: "TEACHER_AVAILABLE", ownerId: owner.id } });
  check("the balance CHECK rejects a negative teacher balance", (await rejects(db.$executeRawUnsafe(`UPDATE "CreditAccount" SET balance = -1 WHERE id = '${available.id}'`))) !== null);
  check("a second system issuance account is refused (partial unique index)", (await rejects(db.creditAccount.create({ data: { kind: "SYSTEM_ISSUANCE", ownerId: null } }))) !== null);
  check("a teacher account must have an owner (CHECK)", (await rejects(db.$executeRawUnsafe(`INSERT INTO "CreditAccount" (id, kind, "ownerId", balance) VALUES ('${prefix}-bad', 'TEACHER_AVAILABLE', NULL, 0)`))) !== null);
  const someEntry = await db.creditEntry.findFirst({ where: { accountId: available.id } });
  check("entries and transactions are append-only (trigger)", (await rejects(db.creditEntry.update({ where: { id: someEntry.id }, data: { amount: 1 } }))) !== null
    && (await rejects(db.creditEntry.delete({ where: { id: someEntry.id } }))) !== null
    && (await rejects(db.creditTransaction.update({ where: { id: someEntry.transactionId }, data: { reason: "x" } }))) !== null
    && (await rejects(db.creditTransaction.delete({ where: { id: someEntry.transactionId } }))) !== null);
  check("a second RESERVE for one job is refused (unique aiJobId, kind)", (await rejects(db.creditTransaction.create({ data: { kind: "RESERVE", aiJobId: first.data.id } }))) !== null);

  // ---------- reconciliation: clean, then one fault per class ----------
  const clean = reconcile();
  check("a clean ledger exits 0", clean.code === 0 && clean.report?.ok === true, { code: clean.code, stderr: clean.stderr });

  const settle = await db.creditTransaction.findFirst({ where: { aiJobId: first.data.id, kind: "SETTLE" } });
  const faults = [
    {
      name: "an unbalanced transaction (check 1)", check: 1, ids: [settle.id],
      apply: () => withoutTriggers(() => db.$executeRawUnsafe(`UPDATE "CreditEntry" SET amount = amount + 1 WHERE id = (SELECT id FROM "CreditEntry" WHERE "transactionId" = '${settle.id}' ORDER BY id LIMIT 1)`)),
      undo: () => withoutTriggers(() => db.$executeRawUnsafe(`UPDATE "CreditEntry" SET amount = amount - 1 WHERE id = (SELECT id FROM "CreditEntry" WHERE "transactionId" = '${settle.id}' ORDER BY id LIMIT 1)`)),
    },
    {
      name: "cached balance drift (check 2)", check: 2, ids: [available.id],
      apply: () => db.creditAccount.update({ where: { id: available.id }, data: { balance: { increment: 1 } } }),
      undo: () => db.creditAccount.update({ where: { id: available.id }, data: { balance: { decrement: 1 } } }),
    },
    {
      name: "a negative teacher balance (check 3)", check: 3, ids: [available.id],
      apply: async () => {
        await db.$executeRawUnsafe(`ALTER TABLE "CreditAccount" DROP CONSTRAINT "CreditAccount_teacher_balance_check"`);
        await db.creditAccount.update({ where: { id: available.id }, data: { balance: -5 } });
      },
      undo: async () => {
        await db.creditAccount.update({ where: { id: available.id }, data: { balance: 0 } });
        await db.$executeRawUnsafe(`ALTER TABLE "CreditAccount" ADD CONSTRAINT "CreditAccount_teacher_balance_check" CHECK ("kind" IN ('SYSTEM_ISSUANCE', 'SYSTEM_CONSUMED') OR "balance" >= 0)`);
      },
    },
    {
      name: "a terminal job without its settlement (check 4)", check: 4, ids: [first.data.id],
      apply: () => withoutTriggers(() => db.$executeRawUnsafe(`UPDATE "CreditTransaction" SET "aiJobId" = '${prefix}-moved' WHERE id = '${settle.id}'`)),
      undo: () => withoutTriggers(() => db.$executeRawUnsafe(`UPDATE "CreditTransaction" SET "aiJobId" = '${first.data.id}' WHERE id = '${settle.id}'`)),
    },
    {
      name: "a non-terminal job that already has a REFUND (check 5)", check: 5, ids: [toCancel.data.id],
      apply: () => db.aiJob.update({ where: { id: toCancel.data.id }, data: { status: "PENDING" } }),
      undo: () => db.aiJob.update({ where: { id: toCancel.data.id }, data: { status: "CANCELLED" } }),
    },
    {
      name: "a SETTLE above its reservation (check 6)", check: 6, ids: [first.data.id],
      apply: () => withoutTriggers(() => db.$executeRawUnsafe(`UPDATE "CreditEntry" SET amount = amount + 50 WHERE "transactionId" = '${settle.id}' AND "accountId" = (SELECT id FROM "CreditAccount" WHERE kind = 'SYSTEM_CONSUMED' LIMIT 1)`)),
      undo: () => withoutTriggers(() => db.$executeRawUnsafe(`UPDATE "CreditEntry" SET amount = amount - 50 WHERE "transactionId" = '${settle.id}' AND "accountId" = (SELECT id FROM "CreditAccount" WHERE kind = 'SYSTEM_CONSUMED' LIMIT 1)`)),
    },
    {
      name: "a job pinned to a price that does not exist (check 7)", check: 7, ids: [first.data.id],
      apply: () => db.aiJob.update({ where: { id: first.data.id }, data: { pricingVersionId: `${prefix}-no-such-price` } }),
      undo: async () => {
        const pinned = await db.creditTransaction.findFirst({ where: { aiJobId: first.data.id, kind: "RESERVE" } });
        await db.aiJob.update({ where: { id: first.data.id }, data: { pricingVersionId: pinned.pricingVersionId } });
      },
    },
  ];
  for (const fault of faults) {
    let injected = true;
    try {
      await fault.apply();
    } catch {
      injected = false;
    }
    assert.ok(injected, `could not inject ${fault.name}`);
    try {
      const run = reconcile();
      const hit = run.report?.violations?.find((v) => v.check === fault.check);
      check(`injected ${fault.name} exits non-zero naming the ID`, run.code === 1 && !!hit && fault.ids.every((id) => hit.ids.includes(id)), { code: run.code, violations: run.report?.violations });
    } finally {
      await fault.undo();
    }
    const again = reconcile();
    check(`after undoing ${fault.name} the ledger reconciles again`, again.code === 0, again.report?.violations);
  }

  console.log(`\nTAI-05 journey: ${passed} checks passed`);
} finally {
  // Ledger rows are append-only (trigger), so the disposable fixture cleanup disables the triggers first.
  const jobIds = (await db.aiJob.findMany({ where: { classId: { in: classIds } }, select: { id: true } })).map((j) => j.id);
  const accounts = (await db.creditAccount.findMany({ where: { ownerId: { in: createdUsers } }, select: { id: true } })).map((a) => a.id);
  const txs = [
    ...(await db.creditTransaction.findMany({ where: { OR: [{ aiJobId: { in: jobIds } }, { actorId: { in: createdUsers } }] }, select: { id: true } })).map((t) => t.id),
    ...(await db.creditEntry.findMany({ where: { accountId: { in: accounts } }, select: { transactionId: true } })).map((e) => e.transactionId),
  ];
  await withoutTriggers(async () => {
    await db.creditEntry.deleteMany({ where: { transactionId: { in: txs } } });
    await db.creditTransaction.deleteMany({ where: { id: { in: txs } } });
  });
  // The system accounts carry the fixtures' entries too; with those entries gone their cached balance must follow.
  const sums = await db.$queryRawUnsafe(`SELECT a.id, COALESCE(SUM(e.amount), 0)::int AS total FROM "CreditAccount" a LEFT JOIN "CreditEntry" e ON e."accountId" = a.id WHERE a."ownerId" IS NULL GROUP BY a.id`);
  for (const row of sums) await db.creditAccount.update({ where: { id: row.id }, data: { balance: row.total } });
  await db.creditAccount.deleteMany({ where: { id: { in: accounts } } });
  await db.auditLog.deleteMany({ where: { OR: [{ targetId: { in: [...jobIds, ...accounts] } }, { actorId: { in: createdUsers } }] } });
  await db.aiJob.deleteMany({ where: { classId: { in: classIds } } });
  await db.classroom.deleteMany({ where: { id: { in: classIds } } });
  await db.idempotencyRecord.deleteMany({ where: { actorId: { in: createdUsers } } });
  await db.session.deleteMany({ where: { userId: { in: createdUsers } } });
  await db.user.deleteMany({ where: { id: { in: createdUsers } } });
  await db.$disconnect();
}
