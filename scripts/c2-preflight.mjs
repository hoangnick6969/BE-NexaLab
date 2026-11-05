// Read-only C2 preflight: run before and after `prisma migrate deploy` on a
// shared database. It never writes. Prints RESULT ok when C2 can be applied
// (before) or is consistent (after).
//   node scripts/c2-preflight.mjs
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();
const host = (() => {
  try {
    return new URL(process.env.DATABASE_URL ?? "").hostname;
  } catch {
    return "unknown";
  }
})();
const problems = [];
try {
  const migrations = await db.$queryRaw`SELECT migration_name, finished_at, rolled_back_at FROM "_prisma_migrations" ORDER BY started_at`;
  const applied = migrations.filter((m) => m.finished_at).map((m) => m.migration_name);
  // A rolled-back failed attempt followed by a successful rerun is normal history.
  const failed = migrations.filter((m) => !m.finished_at && !m.rolled_back_at).map((m) => m.migration_name);
  const c2 = applied.includes("20261015160000_c2_admin_operations");
  if (failed.length) problems.push(`unfinished migrations: ${failed.join(", ")}`);
  for (const required of ["20261015150000_c1_parent_link_lifecycle", "20261015140000_b2_teacher_gate_override"])
    if (!applied.includes(required)) problems.push(`prerequisite migration missing: ${required}`);
  const admins = await db.$queryRaw`SELECT count(*)::int AS n FROM "User" WHERE role = 'ADMIN' AND status = 'active'`;
  if (!admins[0].n) problems.push("no active admin: the admin console would be unreachable");
  const adminEmails = await db.$queryRaw`SELECT count(*)::int AS n FROM "User" WHERE role = 'ADMIN' AND status = 'active' AND email IS NULL`;
  if (adminEmails[0].n) problems.push(`${adminEmails[0].n} active admin(s) without email cannot use auth/admin/login`);
  const statuses = await db.$queryRaw`SELECT status, count(*)::int AS n FROM "Lesson" GROUP BY status`;
  const unknown = statuses.filter((s) => !["draft", "published", "archived", ...(c2 ? ["quarantined"] : [])].includes(s.status));
  if (unknown.length) problems.push(`unexpected lesson statuses: ${unknown.map((s) => `${s.status}=${s.n}`).join(", ")}`);
  const report = {
    database: host,
    c2Applied: c2,
    activeAdmins: admins[0].n,
    lessonStatuses: Object.fromEntries(statuses.map((s) => [s.status, s.n])),
  };
  if (c2) {
    const [versions, pinned] = await Promise.all([
      db.$queryRaw`SELECT status, count(*)::int AS n FROM "SimulationConfigVersion" GROUP BY status`,
      db.$queryRaw`SELECT count(*)::int AS n FROM "Attempt" WHERE "configVersionId" IS NOT NULL`,
    ]);
    const active = await db.$queryRaw`SELECT "labId", count(*)::int AS n FROM "SimulationConfigVersion" WHERE status = 'active' GROUP BY "labId" HAVING count(*) > 1`;
    if (active.length) problems.push(`more than one active configuration version for: ${active.map((a) => a.labId).join(", ")}`);
    Object.assign(report, {
      simulationVersions: Object.fromEntries(versions.map((v) => [v.status, v.n])),
      attemptsPinnedToVersion: pinned[0].n,
    });
  }
  // Content Foundation (CF-T1..T4) state, when its migrations are applied.
  const cf = ["20261016090000_cf_asset_versions", "20261016100000_cf_sources_packs_releases", "20261016110000_cf_simulation_packs"];
  report.contentFoundation = Object.fromEntries(cf.map((m) => [m, applied.includes(m)]));
  if (applied.includes(cf[0])) {
    const pending = await db.$queryRaw`SELECT count(*)::int AS n FROM "AssetVersion" WHERE status IN ('PENDING','VALIDATING')`;
    report.pendingUploads = pending[0].n;
  }
  if (applied.includes(cf[2])) {
    const active = await db.$queryRaw`SELECT "labId", count(*)::int AS n FROM "SimulationPackVersion" WHERE status = 'active' GROUP BY "labId" HAVING count(*) > 1`;
    if (active.length) problems.push(`more than one active simulation pack for: ${active.map((a) => a.labId).join(", ")}`);
  }
  console.log(JSON.stringify(report, null, 2));
} catch (error) {
  problems.push("preflight query failed: " + (error?.code ?? error?.message ?? "unknown"));
} finally {
  await db.$disconnect();
}
for (const problem of problems) console.log("PROBLEM " + problem);
console.log(problems.length ? "RESULT blocked" : "RESULT ok");
process.exitCode = problems.length ? 1 : 0;
