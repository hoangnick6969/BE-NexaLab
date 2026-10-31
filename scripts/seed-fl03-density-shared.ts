/**
 * FL-03 creation-only seed for the SHARED Supabase database, with explicit owner approval.
 *
 * Refuses to run unless FL03_SHARED_WRITE_APPROVED is set to the owner's approval
 * token. Writes are upserts with empty updates (existing rows are never changed),
 * and nothing is deleted. The only assignment is for one named test student in an
 * existing class. No LabRelease is created, no OWNER_SIGNOFF is recorded, and no
 * curriculum row (outcome, chapter, topic, lesson) is touched.
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { seedDensityTuple } from "../src/modules/labs/interface/density-tuple.seed";

const APPROVAL = "owner-approved-fl03-shared-2026-10-31";
const CLASS_ID = "class-pilot-a";
const STUDENT_ID = "student-active";
const ADMIN_ID = "admin";
const ASSIGNMENT_TITLE = "FL-03 khối lượng riêng (thử nghiệm, dev)";

async function main() {
  if (process.env.FL03_SHARED_WRITE_APPROVED !== APPROVAL)
    throw new Error("Refusing shared write: FL03_SHARED_WRITE_APPROVED is not set to the owner approval token");
  const direct = new URL(process.env.DIRECT_URL ?? "");
  const database = new URL(process.env.DATABASE_URL ?? "");
  if (direct.hostname !== database.hostname || direct.pathname !== database.pathname) throw new Error("DATABASE_URL and DIRECT_URL must name the same host and database");
  const db = new PrismaClient();
  try {
    const admin = await db.user.findUnique({ where: { id: ADMIN_ID }, select: { id: true, role: true, status: true } });
    if (!admin || admin.role !== "ADMIN" || admin.status !== "active") throw new Error("Admin account not found or not active");
    const enrollment = await db.enrollment.findFirst({ where: { classId: CLASS_ID, studentId: STUDENT_ID, status: "approved" } });
    if (!enrollment) throw new Error(`${STUDENT_ID} must already be an approved member of ${CLASS_ID}`);

    const tuple = await seedDensityTuple(db, admin.id);

    const existing = await db.assignment.findFirst({
      where: { classId: CLASS_ID, contentId: "density", contentType: "lab", title: ASSIGNMENT_TITLE, targets: { some: { studentId: STUDENT_ID } } },
      select: { id: true },
    });
    const assignment = existing ?? await db.assignment.create({ data: {
      classId: CLASS_ID, contentId: "density", contentType: "lab", title: ASSIGNMENT_TITLE,
      dueDate: new Date(Date.now() + 14 * 86400000), targets: { create: [{ studentId: STUDENT_ID }] },
    } });

    console.log(JSON.stringify({
      host: direct.hostname, labId: tuple.lab.id, challengeId: tuple.challengeId,
      configVersionId: tuple.configVersionId, packVersionId: tuple.packVersionId, activityVersionId: tuple.activityVersionId,
      assignmentId: assignment.id, assignmentReused: Boolean(existing), classId: CLASS_ID, studentId: STUDENT_ID,
      releaseCreated: false, owner_signoff_recorded: false,
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
