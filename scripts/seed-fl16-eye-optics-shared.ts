/**
 * FL-16 creation-only seed for the SHARED database, with explicit owner approval.
 *
 * Same contract as seed-fl03-density-shared.ts. Refuses to write unless
 * FL16_SHARED_WRITE_APPROVED is set to the owner approval token. `--dry-run`
 * only reads and prints what exists. Writes are upserts with empty updates
 * (existing rows are never changed) and nothing is deleted.
 *
 * Creates: Lab `eye-optics` (CLASS_PRIVATE, releaseCleared=false), challenge,
 * activity eye-anatomy-optics v1, config v1 and pack `eye-optics-ex-a` v1, plus one
 * assignment for one named test student in an existing class so the Lab can be
 * opened. It creates no LabRelease, records no OWNER_SIGNOFF, binds no lesson and
 * does not read or write the legacy `eye` Lab or its eye@1.0.0 rows.
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { seedEyeOpticsTuple, EYE_OPTICS_TUPLE } from "../src/modules/labs/interface/eye-optics-tuple.seed";

const APPROVAL = "owner-approved-fl16-shared-2026-11-02";
const CLASS_ID = "class-pilot-a";
const STUDENT_ID = "student-active";
const ADMIN_ID = "admin";
const ASSIGNMENT_TITLE = "FL-16 Mắt và điều tiết (Showcase Pilot, thử nghiệm)";

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  if (!dryRun && process.env.FL16_SHARED_WRITE_APPROVED !== APPROVAL)
    throw new Error("Refusing shared write: FL16_SHARED_WRITE_APPROVED is not set to the owner approval token");
  const direct = new URL(process.env.DIRECT_URL ?? "");
  const database = new URL(process.env.DATABASE_URL ?? "");
  if (direct.hostname !== database.hostname || direct.pathname !== database.pathname) throw new Error("DATABASE_URL and DIRECT_URL must name the same host and database");
  const db = new PrismaClient();
  try {
    const admin = await db.user.findUnique({ where: { id: ADMIN_ID }, select: { id: true, role: true, status: true } });
    if (!admin || admin.role !== "ADMIN" || admin.status !== "active") throw new Error("Admin account not found or not active");
    const enrollment = await db.enrollment.findFirst({ where: { classId: CLASS_ID, studentId: STUDENT_ID, status: "approved" } });
    if (!enrollment) throw new Error(`${STUDENT_ID} must already be an approved member of ${CLASS_ID}`);

    const tuple = await seedEyeOpticsTuple(db, admin.id, { dryRun });
    const assignmentWhere = { classId: CLASS_ID, contentId: EYE_OPTICS_TUPLE.labId, contentType: "lab", title: ASSIGNMENT_TITLE, targets: { some: { studentId: STUDENT_ID } } };
    const existing = await db.assignment.findFirst({ where: assignmentWhere, select: { id: true } });
    if (tuple.dryRun) {
      console.log(JSON.stringify({ dryRun: true, host: direct.hostname, existing: { ...tuple.existing, assignment: Boolean(existing) }, outcomes: tuple.outcomes }, null, 1));
      return;
    }
    const assignment = existing ?? await db.assignment.create({ data: {
      classId: CLASS_ID, contentId: EYE_OPTICS_TUPLE.labId, contentType: "lab", title: ASSIGNMENT_TITLE,
      dueDate: new Date(Date.now() + 14 * 86400000), targets: { create: [{ studentId: STUDENT_ID }] },
    } });

    console.log(JSON.stringify({
      host: direct.hostname, labId: tuple.lab.id, challengeId: tuple.challengeId,
      activityVersionId: tuple.activityVersionId, configVersionId: tuple.configVersionId, packVersionId: tuple.packVersionId,
      rubricRef: tuple.rubricRef, kitId: EYE_OPTICS_TUPLE.kitId, rowsBefore: tuple.existing, outcomes: tuple.outcomes,
      assignmentId: assignment.id, assignmentReused: Boolean(existing), classId: CLASS_ID, studentId: STUDENT_ID,
      releaseCreated: false, owner_signoff_recorded: false, lessonBound: false,
    }, null, 1));
  } finally {
    await db.$disconnect();
  }
}

main().catch((error) => {
  const response = (error as any)?.response;
  console.error(response ? JSON.stringify(response) : error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
