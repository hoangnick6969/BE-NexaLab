// B0 platform verification on real dependencies (B0P-T1/T2/T4), built on the
// shared B/C harness (B0P-T3). Run with tsx so the audit helper is imported
// from source:
//   TEST_API=http://127.0.0.1:4000/api npx tsx scripts/b0-integration.mjs
// The T4 checks need the API started with APP_ENV=test (or development) and
// HINT_PROVIDER_TEST_DELAY_MS=3000; without it they are reported as SKIP.
import * as argon from "argon2";
import { createHarness } from "./lib/harness.mjs";
import { audit } from "../src/audit.ts";

const h = createHarness("B0 platform");
const { db, req, check, skip, envelope, key } = h;
const prefix = "b0-" + Date.now().toString(36);
const createdUsers = [];
const circuit = (resistance) => ({
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

async function teacher(label) {
  const password = `B0-${label}-Password-2026!`;
  const user = await db.user.create({
    data: {
      email: `${prefix}-${label}@example.test`,
      fullName: `B0 ${label}`,
      role: "TEACHER",
      passwordHash: await argon.hash(password),
      consentAt: new Date(),
    },
  });
  createdUsers.push(user.id);
  const login = await req("/auth/login", "POST", { email: user.email, password });
  if (login.status !== 201) throw new Error(`teacher login ${login.status}`);
  return { id: user.id, token: login.data.accessToken };
}

async function student(classId, token) {
  const made = await req(
    `/classes/${classId}/students`,
    "POST",
    { username: `${prefix}-s`, fullName: "B0 học sinh", grade: 8, consent: true },
    token,
    key(),
  );
  if (made.status !== 201) throw new Error(`provision ${made.status}`);
  createdUsers.push(made.data.user.id);
  let login = await req("/auth/student/login", "POST", {
    username: made.data.credentials.username,
    password: made.data.credentials.temporaryPassword,
  });
  if (login.status === 429) {
    console.log("     waiting 61 s for the student-login rate window");
    await new Promise((resolve) => setTimeout(resolve, 61000));
    login = await req("/auth/student/login", "POST", {
      username: made.data.credentials.username,
      password: made.data.credentials.temporaryPassword,
    });
  }
  if (login.status !== 201) throw new Error(`student login ${login.status}`);
  const changed = await req(
    "/auth/password",
    "POST",
    { currentPassword: made.data.credentials.temporaryPassword, password: "B0-Student-Password-2026!" },
    login.data.accessToken,
  );
  if (changed.status !== 201) throw new Error(`password change ${changed.status}`);
  return { id: made.data.user.id, token: changed.data.accessToken };
}

await h.run({
  async setup() {
    const owner = await teacher("owner");
    const created = await req("/classes", "POST", { name: `${prefix} lớp`, grade: 8 }, owner.token, key());
    if (created.status !== 201) throw new Error(`class create ${created.status}`);
    const classId = created.data.class.id;
    return { owner, classId, pupil: await student(classId, owner.token) };
  },

  async journey({ owner, classId, pupil }) {
    // ---------- B0P-T1 stable error envelope ----------
    check("unauthenticated → 401 UNAUTHENTICATED", envelope(await req("/me/progress"), 401, "UNAUTHENTICATED"));
    check(
      "wrong role → 403 FORBIDDEN",
      envelope(await req(`/classes/${classId}/students`, "GET", undefined, pupil.token), 403, "FORBIDDEN"),
    );
    const invalid = await req("/classes", "POST", { grade: 99 }, owner.token, key());
    check(
      "validation → 400 VALIDATION_FAILED with safe details",
      envelope(invalid, 400, "VALIDATION_FAILED") && !/prisma|stack|at \//i.test(JSON.stringify(invalid.data)),
    );
    check(
      "missing resource → 404 with a route code",
      envelope(await req("/teacher/content/missing-lesson/preview", "GET", undefined, owner.token), 404, "LESSON_NOT_FOUND"),
    );
    const reused = key();
    await req("/classes", "POST", { name: `${prefix} khóa A`, grade: 8 }, owner.token, reused);
    const conflict = await req("/classes", "POST", { name: `${prefix} khóa B`, grade: 8 }, owner.token, reused);
    check(
      "idempotency key reuse with another payload → 409 with a stable code",
      conflict.status === 409 && /^[A-Z][A-Z0-9_]+$/.test(conflict.data?.code ?? "") && typeof conflict.data.message === "string",
    );

    // ---------- B0P-T2 audit on the real database ----------
    const before = await db.classroom.findUniqueOrThrow({ where: { id: classId } });
    let failure = null;
    try {
      await db.$transaction(async (tx) => {
        await tx.classroom.update({ where: { id: classId }, data: { name: before.name + " (phải rollback)" } });
        const failingAudit = new Proxy(tx, {
          get: (target, prop) =>
            prop === "auditLog" ? { create: async () => Promise.reject(new Error("forced audit failure")) } : target[prop],
        });
        await audit(failingAudit, {
          actor: { sub: owner.id, role: "TEACHER" },
          action: "class.update",
          targetType: "Classroom",
          targetId: classId,
        });
      });
    } catch (error) {
      failure = error;
    }
    const after = await db.classroom.findUniqueOrThrow({ where: { id: classId } });
    check(
      "a forced audit write failure rolls back the protected mutation",
      failure?.message === "forced audit failure" && after.name === before.name,
    );
    const sentinel = {
      password: "SENTINEL-B0-PASSWORD",
      joinCode: "NL-ABCDEF-0123456789",
      token: "eyJhbGciOiJIUzI1NiJ9.SENTINELB0xx.sig",
      name: "eyJhbGciOiJIUzI1NiJ9.SENTINELB0yy.sig",
    };
    await db.$transaction((tx) =>
      audit(tx, {
        actor: { sub: owner.id, role: "TEACHER" },
        action: "b0.sentinel",
        targetType: "Classroom",
        targetId: classId,
        before: sentinel,
        after: { ...sentinel, grade: 8 },
      }),
    );
    const row = await db.auditLog.findFirstOrThrow({ where: { actorId: owner.id, action: "b0.sentinel" } });
    check("sentinel secrets never persist in AuditLog", !/SENTINEL/.test(JSON.stringify(row)) && row.after?.grade === 8);
    const audited = await db.auditLog.findMany({ where: { actorId: owner.id }, select: { action: true, outcome: true } });
    check(
      "protected mutations of this run are audited and failed validation is not",
      audited.some((r) => r.action === "class.create" && r.outcome === "success") &&
        audited.filter((r) => r.action === "class.create").length === 2,
      audited,
    );

    // ---------- B0P-T4 hint provider boundary ----------
    const first = await req("/attempts", "POST", { challengeId: "circuit_001", labState: circuit(100), durationMs: 1000 }, pupil.token);
    check("a standalone practice attempt is recorded for the hint", first.status === 201);
    const advisoryLocks = async () =>
      Number(
        (
          await db.$queryRawUnsafe(
            `SELECT count(*)::int AS n FROM pg_locks WHERE locktype = 'advisory' AND objid::bigint = (hashtext($1)::bigint & 4294967295)`,
            pupil.id,
          )
        )[0].n,
      );
    const idleInTransaction = async () =>
      Number(
        (
          await db.$queryRawUnsafe(
            `SELECT count(*)::int AS n FROM pg_stat_activity WHERE datname = current_database() AND state LIKE 'idle in transaction%' AND pid <> pg_backend_pid()`,
          )
        )[0].n,
      );
    let settled = false;
    const started = performance.now();
    const pending = req(`/attempts/${first.data.id}/hint`, "POST", undefined, pupil.token).then((res) => {
      settled = true;
      return res;
    });
    await new Promise((resolve) => setTimeout(resolve, 1200));
    if (settled) {
      await pending;
      skip("delayed provider holds no transaction or lock", "API not started with APP_ENV=test and HINT_PROVIDER_TEST_DELAY_MS");
      skip("revoked session during the provider call persists nothing", "provider delay not configured");
      return;
    }
    const locksDuring = await advisoryLocks();
    const hintsDuring = await db.hintLog.count({ where: { attemptId: first.data.id } });
    const idleDuring =
      h.origin && process.env.DATABASE_URL && /localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL) ? await idleInTransaction() : null;
    const hint = await pending;
    console.log(`     hint round trip ${Math.round(performance.now() - started)} ms with the delayed provider`);
    check(
      "while the provider is delayed no advisory lock or open transaction is held",
      locksDuring === 0 && hintsDuring === 0 && (idleDuring === null || idleDuring === 0),
      { locksDuring, hintsDuring, idleDuring },
    );
    check(
      "after the delayed provider the hint is persisted once",
      hint.status === 201 && (await db.hintLog.count({ where: { attemptId: first.data.id } })) === 1,
    );
    const replay = await req(`/attempts/${first.data.id}/hint`, "POST", undefined, pupil.token);
    check(
      "asking again returns the stored hint without a second provider result",
      replay.status === 201 && replay.data.id === hint.data.id,
    );

    const second = await req("/attempts", "POST", { challengeId: "circuit_001", labState: circuit(100), durationMs: 1000 }, pupil.token);
    const revoked = req(`/attempts/${second.data.id}/hint`, "POST", undefined, pupil.token);
    await new Promise((resolve) => setTimeout(resolve, 1200));
    await db.session.deleteMany({ where: { userId: pupil.id } });
    const denied = await revoked;
    check(
      "a session revoked during the provider call persists and returns nothing",
      envelope(denied, 401, "UNAUTHENTICATED") && (await db.hintLog.count({ where: { attemptId: second.data.id } })) === 0,
      denied,
    );
  },

  async cleanup() {
    const classes = await db.classroom.findMany({ where: { teacherId: { in: createdUsers } }, select: { id: true } });
    await db.assignment.deleteMany({ where: { classId: { in: classes.map((c) => c.id) } } });
    await db.classroom.deleteMany({ where: { id: { in: classes.map((c) => c.id) } } });
    await db.idempotencyRecord.deleteMany({ where: { actorId: { in: createdUsers } } });
    await db.auditLog.deleteMany({ where: { actorId: { in: createdUsers } } });
    await db.user.deleteMany({ where: { id: { in: createdUsers } } });
  },
});
