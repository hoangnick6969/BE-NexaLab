import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();
const exceptions = [];
const updates = [];
const apply = process.argv.includes("--apply");

try {
  const columns = await db.$queryRawUnsafe(`SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'StepProgress'`);
  const migrated = columns.some((column) => column.column_name === "assignmentId");
  const rows = await db.$queryRawUnsafe(`
    SELECT sp."studentId", sp."stepId", ls."lessonId"
    FROM "StepProgress" sp
    JOIN "LessonStep" ls ON ls."id" = sp."stepId"
    ${migrated ? 'WHERE sp."assignmentId" IS NULL' : ""}
    ORDER BY sp."studentId", sp."stepId"
  `);
  const assignments = await db.assignment.findMany({
    where: { contentType: "lesson", status: { in: ["ACTIVE", "ARCHIVED"] } },
    select: { id: true, contentId: true, targets: { select: { studentId: true } } },
  });
  for (const row of rows) {
    const matches = assignments.filter((assignment) => assignment.contentId === row.lessonId && assignment.targets.some((target) => target.studentId === row.studentId));
    if (matches.length !== 1) {
      exceptions.push({ studentId: row.studentId, stepId: row.stepId, reason: matches.length ? "AMBIGUOUS_ASSIGNMENT" : "ORPHAN_NO_ASSIGNMENT", assignmentIds: matches.map((assignment) => assignment.id) });
    }
    else updates.push({ assignmentId: matches[0].id, studentId: row.studentId, stepId: row.stepId });
  }
  if (apply && exceptions.length === 0) {
    if (!migrated) throw new Error("Run prisma migrate deploy before b2:preflight --apply");
    await db.$transaction(updates.map((row) => db.$executeRawUnsafe(
      `UPDATE "StepProgress" SET "assignmentId" = $1 WHERE "studentId" = $2 AND "stepId" = $3 AND "assignmentId" IS NULL`,
      row.assignmentId,
      row.studentId,
      row.stepId,
    )));
  }
  const report = { mode: apply ? "apply" : "dry-run", checked: rows.length, uniquelyApplicable: rows.length - exceptions.length, updated: apply ? rows.length - exceptions.length : 0, exceptions };
  console.log(JSON.stringify(report, null, 2));
  if (exceptions.length) process.exitCode = 2;
} finally {
  await db.$disconnect();
}
