// B1 migration preflight and reconciliation report. Read-only: it never
// writes to the database. Run before and after `prisma migrate deploy`.
//   npm run b1:preflight            -> human-readable report
//   npm run b1:preflight -- --json  -> machine-readable report
// Exit code 1 means a blocking problem that the migration would refuse.
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();
const json = process.argv.includes("--json");

const count = async (sql: string) => Number(((await db.$queryRawUnsafe<any[]>(sql))[0]?.n) ?? 0);

async function columnExists(table: string, column: string) {
  const rows = await db.$queryRawUnsafe<any[]>(
    `SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = $1 AND column_name = $2`,
    table,
    column,
  );
  return rows.length > 0;
}

async function main() {
  const migrated = await columnExists("Enrollment", "status");
  const report: Record<string, unknown> = { migrated };
  const blocking: string[] = [];
  const warnings: string[] = [];

  report.enrollments = {
    total: await count(`SELECT count(*) AS n FROM "Enrollment"`),
    legacyApproved: await count(`SELECT count(*) AS n FROM "Enrollment" WHERE approved`),
    legacyPending: await count(`SELECT count(*) AS n FROM "Enrollment" WHERE NOT approved`),
    nonStudentAccounts: await count(
      `SELECT count(*) AS n FROM "Enrollment" e JOIN "User" u ON u.id = e."studentId" WHERE u.role <> 'STUDENT'`,
    ),
  };
  if ((report.enrollments as any).nonStudentAccounts)
    warnings.push("Enrollment rows point at non-student accounts; they never grant assignment access.");

  const nonArray = await count(`SELECT count(*) AS n FROM "Assignment" WHERE jsonb_typeof("studentIds") <> 'array'`);
  const missingUsers = nonArray
    ? 0
    : await count(
        `SELECT count(*) AS n FROM "Assignment" a, jsonb_array_elements_text(a."studentIds") t(id)
         WHERE NOT EXISTS (SELECT 1 FROM "User" u WHERE u.id = t.id)`,
      );
  const nonMembers = nonArray
    ? 0
    : await count(
        `SELECT count(*) AS n FROM "Assignment" a, jsonb_array_elements_text(a."studentIds") t(id)
         WHERE NOT EXISTS (SELECT 1 FROM "Enrollment" e WHERE e."classId" = a."classId" AND e."studentId" = t.id)`,
      );
  const duplicateTargets = nonArray
    ? 0
    : await count(
        `SELECT count(*) AS n FROM (SELECT a.id, t.id AS sid FROM "Assignment" a, jsonb_array_elements_text(a."studentIds") t(id)
         GROUP BY a.id, t.id HAVING count(*) > 1) d`,
      );
  report.assignments = {
    total: await count(`SELECT count(*) AS n FROM "Assignment"`),
    active: await count(`SELECT count(*) AS n FROM "Assignment" WHERE status = 'ACTIVE'`),
    wholeClass: nonArray ? null : await count(`SELECT count(*) AS n FROM "Assignment" WHERE jsonb_array_length("studentIds") = 0`),
    subset: nonArray ? null : await count(`SELECT count(*) AS n FROM "Assignment" WHERE jsonb_array_length("studentIds") > 0`),
    nonArrayStudentIds: nonArray,
    targetsMissingUser: missingUsers,
    targetsNotEnrolled: nonMembers,
    duplicateTargetEntries: duplicateTargets,
    missingLessonContent: await count(
      `SELECT count(*) AS n FROM "Assignment" a WHERE a."contentType" = 'lesson' AND NOT EXISTS (SELECT 1 FROM "Lesson" l WHERE l.id = a."contentId")`,
    ),
    missingLabContent: await count(
      `SELECT count(*) AS n FROM "Assignment" a WHERE a."contentType" = 'lab' AND NOT EXISTS (SELECT 1 FROM "Lab" l WHERE l.id = a."contentId")`,
    ),
  };
  if (nonArray) blocking.push(`${nonArray} assignment(s) have non-array studentIds.`);
  if (missingUsers) blocking.push(`${missingUsers} legacy target(s) reference missing users.`);
  if (nonMembers) warnings.push(`${nonMembers} legacy target(s) are not enrolled in the class; they are kept as targets but get no access.`);
  if (duplicateTargets) warnings.push(`${duplicateTargets} duplicated legacy target entr(y/ies) collapse into one AssignmentTarget row.`);

  report.classes = {
    total: await count(`SELECT count(*) AS n FROM "Classroom"`),
    duplicateNamesPerTeacher: await count(
      `SELECT count(*) AS n FROM (SELECT "teacherId", lower(btrim(name)) FROM "Classroom" GROUP BY 1, 2 HAVING count(*) > 1) d`,
    ),
  };
  if ((report.classes as any).duplicateNamesPerTeacher)
    warnings.push("Some teachers own classes with the same name; renames are required before those classes can be updated.");

  if (migrated) {
    const statusMismatch = await count(
      `SELECT count(*) AS n FROM "Enrollment" WHERE (status = 'approved') <> approved`,
    );
    const expectedTargets = await count(
      `SELECT count(*) AS n FROM (
         SELECT DISTINCT a.id, t.id AS sid FROM "Assignment" a, jsonb_array_elements_text(a."studentIds") t(id)
         WHERE a."createdById" IS NULL AND jsonb_array_length(a."studentIds") > 0
       ) x`,
    );
    report.reconciliation = {
      enrollmentStatus: Object.fromEntries(
        (await db.$queryRawUnsafe<any[]>(`SELECT status::text AS s, count(*) AS n FROM "Enrollment" GROUP BY 1`)).map((r) => [r.s, Number(r.n)]),
      ),
      enrollmentMirrorMismatch: statusMismatch,
      assignmentTargets: await count(`SELECT count(*) AS n FROM "AssignmentTarget"`),
      legacySubsetTargetsExpected: expectedTargets,
      legacySubsetTargetsMissing: await count(
        `SELECT count(*) AS n FROM "Assignment" a, jsonb_array_elements_text(a."studentIds") t(id)
         WHERE a."createdById" IS NULL AND NOT EXISTS (
           SELECT 1 FROM "AssignmentTarget" x WHERE x."assignmentId" = a.id AND x."studentId" = t.id)`,
      ),
      assignmentsWithoutTargets: await count(
        `SELECT count(*) AS n FROM "Assignment" a WHERE NOT EXISTS (SELECT 1 FROM "AssignmentTarget" x WHERE x."assignmentId" = a.id)`,
      ),
      classesWithoutJoinCode: await count(`SELECT count(*) AS n FROM "Classroom" WHERE "joinLocator" IS NULL`),
    };
    const rec = report.reconciliation as any;
    if (statusMismatch) blocking.push(`${statusMismatch} enrollment(s) have status/approved mirror drift.`);
    if (rec.legacySubsetTargetsMissing) blocking.push(`${rec.legacySubsetTargetsMissing} legacy subset target(s) were not migrated.`);
    if (rec.assignmentsWithoutTargets)
      warnings.push(`${rec.assignmentsWithoutTargets} assignment(s) have no recipients (whole-class assignment of a class with no approved members).`);
  }

  report.blocking = blocking;
  report.warnings = warnings;
  if (json) console.log(JSON.stringify(report, null, 2));
  else {
    console.log(`B1 preflight (${migrated ? "after" : "before"} migration)`);
    for (const [key, value] of Object.entries(report))
      if (!["blocking", "warnings", "migrated"].includes(key)) console.log(`- ${key}: ${JSON.stringify(value)}`);
    for (const item of warnings) console.log("WARN  " + item);
    for (const item of blocking) console.log("BLOCK " + item);
    console.log(blocking.length ? "RESULT blocked" : "RESULT ok");
  }
  if (blocking.length) process.exitCode = 1;
}

main()
  .catch(() => {
    console.error("B1 preflight failed; check database connectivity. Credentials redacted.");
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
