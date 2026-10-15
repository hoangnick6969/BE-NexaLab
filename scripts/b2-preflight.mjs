import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();
const exceptions = [];

try {
  const rows = await db.stepProgress.findMany({
    where: { assignmentId: null },
    select: {
      id: true,
      studentId: true,
      stepId: true,
      step: { select: { lessonId: true } },
      student: { select: { enrollments: { where: { status: "approved" }, select: { classId: true } } } },
    },
  });
  const assignments = await db.assignment.findMany({
    where: { contentType: "lesson", status: { in: ["ACTIVE", "ARCHIVED"] } },
    select: { id: true, contentId: true, targets: { select: { studentId: true } } },
  });
  const candidates = new Map();
  for (const row of rows) {
    const matches = assignments.filter((assignment) => assignment.contentId === row.step.lessonId && assignment.targets.some((target) => target.studentId === row.studentId));
    candidates.set(row.id, matches.map((assignment) => assignment.id));
    if (matches.length !== 1) {
      exceptions.push({ id: row.id, studentId: row.studentId, stepId: row.stepId, reason: matches.length ? "AMBIGUOUS_ASSIGNMENT" : "ORPHAN_NO_ASSIGNMENT", assignmentIds: matches.map((assignment) => assignment.id) });
    }
  }
  const report = { checked: rows.length, uniquelyApplicable: rows.length - exceptions.length, exceptions };
  console.log(JSON.stringify(report, null, 2));
  if (exceptions.length) process.exitCode = 2;
} finally {
  await db.$disconnect();
}
