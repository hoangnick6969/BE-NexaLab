-- TAI-07 (TAI7-T1): graded assessment mode (AD-19). Expand-only and idempotent.
-- Existing assignments become PRACTICE through the column default, so their lifecycle is unchanged.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'AssessmentType') THEN
    CREATE TYPE "AssessmentType" AS ENUM ('PRACTICE', 'REGULAR_15M', 'MIDTERM_45M');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'AssessmentSessionStatus') THEN
    CREATE TYPE "AssessmentSessionStatus" AS ENUM ('OPEN', 'SUBMITTED');
  END IF;
END $$;

ALTER TABLE "Assignment" ADD COLUMN IF NOT EXISTS "assessmentType" "AssessmentType" NOT NULL DEFAULT 'PRACTICE';
ALTER TABLE "Assignment" ADD COLUMN IF NOT EXISTS "durationMinutes" INTEGER;
ALTER TABLE "Assignment" ADD COLUMN IF NOT EXISTS "scoresPublishedAt" TIMESTAMP(3);
ALTER TABLE "Assignment" ADD COLUMN IF NOT EXISTS "scoresPublishedById" TEXT;

ALTER TABLE "AssignmentSubmission" ADD COLUMN IF NOT EXISTS "autoSubmitted" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "AssignmentSubmission" ADD COLUMN IF NOT EXISTS "sessionId" TEXT;

CREATE TABLE IF NOT EXISTS "AssessmentRetakeGrant" (
    "id" TEXT NOT NULL,
    "assignmentId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "grantedById" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "consumedAt" TIMESTAMP(3),

    CONSTRAINT "AssessmentRetakeGrant_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "AssessmentSession" (
    "id" TEXT NOT NULL,
    "assignmentId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "attemptNo" INTEGER NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "draftAnswers" JSONB NOT NULL DEFAULT '[]',
    "draftSavedAt" TIMESTAMP(3),
    "status" "AssessmentSessionStatus" NOT NULL DEFAULT 'OPEN',
    "retakeGrantId" TEXT,

    CONSTRAINT "AssessmentSession_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "AssessmentSession_retakeGrantId_key" ON "AssessmentSession"("retakeGrantId");
CREATE INDEX IF NOT EXISTS "AssessmentSession_status_expiresAt_idx" ON "AssessmentSession"("status", "expiresAt");
CREATE UNIQUE INDEX IF NOT EXISTS "AssessmentSession_assignmentId_studentId_attemptNo_key" ON "AssessmentSession"("assignmentId", "studentId", "attemptNo");
CREATE INDEX IF NOT EXISTS "AssessmentRetakeGrant_assignmentId_studentId_createdAt_idx" ON "AssessmentRetakeGrant"("assignmentId", "studentId", "createdAt");
CREATE UNIQUE INDEX IF NOT EXISTS "AssignmentSubmission_sessionId_key" ON "AssignmentSubmission"("sessionId");

-- Graded settings are coherent: PRACTICE has no duration and never publishes; graded rows carry a positive duration.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Assignment_assessment_duration_check') THEN
    ALTER TABLE "Assignment" ADD CONSTRAINT "Assignment_assessment_duration_check"
      CHECK (("assessmentType" = 'PRACTICE' AND "durationMinutes" IS NULL AND "scoresPublishedAt" IS NULL)
          OR ("assessmentType" <> 'PRACTICE' AND "durationMinutes" IS NOT NULL AND "durationMinutes" > 0));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AssessmentSession_expiry_check') THEN
    ALTER TABLE "AssessmentSession" ADD CONSTRAINT "AssessmentSession_expiry_check" CHECK ("expiresAt" > "startedAt" AND "attemptNo" >= 1);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AssignmentSubmission_sessionId_fkey') THEN
    ALTER TABLE "AssignmentSubmission" ADD CONSTRAINT "AssignmentSubmission_sessionId_fkey"
      FOREIGN KEY ("sessionId") REFERENCES "AssessmentSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AssessmentSession_assignmentId_fkey') THEN
    ALTER TABLE "AssessmentSession" ADD CONSTRAINT "AssessmentSession_assignmentId_fkey"
      FOREIGN KEY ("assignmentId") REFERENCES "Assignment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AssessmentSession_studentId_fkey') THEN
    ALTER TABLE "AssessmentSession" ADD CONSTRAINT "AssessmentSession_studentId_fkey"
      FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AssessmentSession_retakeGrantId_fkey') THEN
    ALTER TABLE "AssessmentSession" ADD CONSTRAINT "AssessmentSession_retakeGrantId_fkey"
      FOREIGN KEY ("retakeGrantId") REFERENCES "AssessmentRetakeGrant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AssessmentRetakeGrant_assignmentId_fkey') THEN
    ALTER TABLE "AssessmentRetakeGrant" ADD CONSTRAINT "AssessmentRetakeGrant_assignmentId_fkey"
      FOREIGN KEY ("assignmentId") REFERENCES "Assignment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AssessmentRetakeGrant_studentId_fkey') THEN
    ALTER TABLE "AssessmentRetakeGrant" ADD CONSTRAINT "AssessmentRetakeGrant_studentId_fkey"
      FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
