-- B0 + B1: audit, idempotency, shared limiter, class lifecycle, enrollment
-- status, normalized assignment targets, teacher content scope.
-- Expand-only: legacy Enrollment.approved and Assignment.studentIds stay as
-- deprecated mirrors so older deployments sharing the database keep working.

-- Preflight (stop instead of guessing): every legacy target list must be a
-- JSON array of existing user IDs. Run `npm run b1:preflight` for the report.
DO $$
DECLARE bad integer;
BEGIN
  SELECT count(*) INTO bad FROM "Assignment" WHERE jsonb_typeof("studentIds") <> 'array';
  IF bad > 0 THEN RAISE EXCEPTION 'B1 preflight: % assignment(s) have non-array studentIds', bad; END IF;
  SELECT count(*) INTO bad
  FROM "Assignment" a, jsonb_array_elements_text(a."studentIds") AS t(id)
  WHERE NOT EXISTS (SELECT 1 FROM "User" u WHERE u.id = t.id);
  IF bad > 0 THEN RAISE EXCEPTION 'B1 preflight: % assignment target(s) reference missing users', bad; END IF;
END $$;

-- CreateEnum
CREATE TYPE "ClassroomStatus" AS ENUM ('ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "EnrollmentStatus" AS ENUM ('pending', 'approved', 'removed');

-- AlterTable
ALTER TABLE "Assignment" ADD COLUMN     "archivedAt" TIMESTAMP(3),
ADD COLUMN     "audience" TEXT NOT NULL DEFAULT 'CLASS',
ADD COLUMN     "createdById" TEXT,
ADD COLUMN     "targetHash" TEXT,
ALTER COLUMN "dueDate" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Classroom" ADD COLUMN     "archivedAt" TIMESTAMP(3),
ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "joinCodeEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "joinCodeRotatedAt" TIMESTAMP(3),
ADD COLUMN     "joinKeyVersion" INTEGER,
ADD COLUMN     "joinLocator" TEXT,
ADD COLUMN     "joinSecretHash" TEXT,
ADD COLUMN     "requiresApproval" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "status" "ClassroomStatus" NOT NULL DEFAULT 'ACTIVE',
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ALTER COLUMN "joinCode" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Enrollment" ADD COLUMN     "status" "EnrollmentStatus" NOT NULL DEFAULT 'pending',
ADD COLUMN     "statusChangedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "Lesson" ADD COLUMN     "clonedFromId" TEXT,
ADD COLUMN     "publishedAt" TIMESTAMP(3),
ADD COLUMN     "review" JSONB,
ADD COLUMN     "scope" TEXT NOT NULL DEFAULT 'TEACHER_PRIVATE',
ADD COLUMN     "synthetic" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateTable
CREATE TABLE "AssignmentTarget" (
    "assignmentId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssignmentTarget_pkey" PRIMARY KEY ("assignmentId","studentId")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "actorId" TEXT,
    "actorRole" TEXT,
    "action" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT,
    "outcome" TEXT NOT NULL,
    "reason" TEXT,
    "before" JSONB,
    "after" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IdempotencyRecord" (
    "actorId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "statusCode" INTEGER NOT NULL DEFAULT 201,
    "response" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IdempotencyRecord_pkey" PRIMARY KEY ("actorId","key")
);

-- CreateTable
CREATE TABLE "RateLimitBucket" (
    "key" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "windowStart" TIMESTAMP(3) NOT NULL,
    "lockedUntil" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RateLimitBucket_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE INDEX "AssignmentTarget_studentId_idx" ON "AssignmentTarget"("studentId");

-- CreateIndex
CREATE INDEX "AuditLog_targetType_targetId_createdAt_idx" ON "AuditLog"("targetType", "targetId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_actorId_createdAt_idx" ON "AuditLog"("actorId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_action_createdAt_idx" ON "AuditLog"("action", "createdAt");

-- CreateIndex
CREATE INDEX "IdempotencyRecord_expiresAt_idx" ON "IdempotencyRecord"("expiresAt");

-- CreateIndex
CREATE INDEX "RateLimitBucket_expiresAt_idx" ON "RateLimitBucket"("expiresAt");

-- CreateIndex
CREATE INDEX "Assignment_contentType_contentId_status_idx" ON "Assignment"("contentType", "contentId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Classroom_joinLocator_key" ON "Classroom"("joinLocator");

-- CreateIndex
CREATE INDEX "Classroom_teacherId_status_idx" ON "Classroom"("teacherId", "status");

-- CreateIndex
CREATE INDEX "Enrollment_studentId_status_idx" ON "Enrollment"("studentId", "status");

-- CreateIndex
CREATE INDEX "Lesson_scope_status_grade_idx" ON "Lesson"("scope", "status", "grade");

-- CreateIndex
CREATE INDEX "Lesson_authorId_status_idx" ON "Lesson"("authorId", "status");

-- AddForeignKey
ALTER TABLE "AssignmentTarget" ADD CONSTRAINT "AssignmentTarget_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "Assignment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssignmentTarget" ADD CONSTRAINT "AssignmentTarget_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Backfill (Q-B1-01): approved=true -> approved, approved=false -> pending.
UPDATE "Enrollment" SET "status" = CASE WHEN "approved" THEN 'approved'::"EnrollmentStatus" ELSE 'pending'::"EnrollmentStatus" END,
  "statusChangedAt" = "joinedAt";

-- Snapshot targets: explicit legacy lists stay a subset; an empty list meant
-- the whole class, so it becomes the approved members at migration time.
INSERT INTO "AssignmentTarget" ("assignmentId", "studentId", "createdAt")
SELECT DISTINCT a.id, t.id, a."createdAt"
FROM "Assignment" a, jsonb_array_elements_text(a."studentIds") AS t(id)
WHERE jsonb_array_length(a."studentIds") > 0;
INSERT INTO "AssignmentTarget" ("assignmentId", "studentId", "createdAt")
SELECT a.id, e."studentId", a."createdAt"
FROM "Assignment" a JOIN "Enrollment" e ON e."classId" = a."classId" AND e."approved" = true
WHERE jsonb_array_length(a."studentIds") = 0
ON CONFLICT DO NOTHING;
UPDATE "Assignment" SET "audience" = CASE WHEN jsonb_array_length("studentIds") > 0 THEN 'SUBSET' ELSE 'CLASS' END;
UPDATE "Assignment" a SET "targetHash" = h.hash
FROM (
  SELECT "assignmentId", encode(sha256(convert_to(string_agg("studentId", ',' ORDER BY "studentId"), 'UTF8')), 'hex') AS hash
  FROM "AssignmentTarget" GROUP BY "assignmentId"
) h
WHERE h."assignmentId" = a.id;
UPDATE "Assignment" SET "archivedAt" = "updatedAt" WHERE "status" = 'ARCHIVED';

UPDATE "Lesson" SET "updatedAt" = "createdAt", "publishedAt" = CASE WHEN "status" = 'published' THEN "createdAt" END;
