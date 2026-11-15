-- TAI-07 (TAI7-T3): class gradebook lock ("Chốt sổ điểm") and immutable snapshot rows. Expand-only and idempotent.
ALTER TABLE "Assignment" ADD COLUMN IF NOT EXISTS "gradebookLockedAt" TIMESTAMP(3);
ALTER TABLE "Assignment" ADD COLUMN IF NOT EXISTS "gradebookLockedById" TEXT;
ALTER TABLE "Assignment" ADD COLUMN IF NOT EXISTS "gradebookLockVersion" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS "GradebookEntry" (
    "id" TEXT NOT NULL,
    "assignmentId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "lockVersion" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "score10" DECIMAL(3,1),
    "rawPoints" DOUBLE PRECISION,
    "maxPoints" DOUBLE PRECISION,
    "similarityFlag" TEXT,
    "sourceSubmissionId" TEXT,
    "sourceGradeId" TEXT,
    "lockedById" TEXT NOT NULL,
    "lockedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GradebookEntry_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "GradebookEntry_assignmentId_studentId_lockVersion_key" ON "GradebookEntry"("assignmentId", "studentId", "lockVersion");
CREATE INDEX IF NOT EXISTS "GradebookEntry_assignmentId_lockVersion_idx" ON "GradebookEntry"("assignmentId", "lockVersion");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'GradebookEntry_status_check') THEN
    ALTER TABLE "GradebookEntry" ADD CONSTRAINT "GradebookEntry_status_check"
      CHECK (("status" = 'ABSENT' AND "score10" IS NULL)
          OR ("status" IN ('GRADED', 'ZERO_REJECTED') AND "score10" IS NOT NULL AND "score10" >= 0 AND "score10" <= 10));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Assignment_gradebook_lock_check') THEN
    ALTER TABLE "Assignment" ADD CONSTRAINT "Assignment_gradebook_lock_check"
      CHECK ("gradebookLockVersion" >= 0 AND ("gradebookLockedAt" IS NULL OR "gradebookLockVersion" >= 1));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'GradebookEntry_assignmentId_fkey') THEN
    ALTER TABLE "GradebookEntry" ADD CONSTRAINT "GradebookEntry_assignmentId_fkey"
      FOREIGN KEY ("assignmentId") REFERENCES "Assignment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'GradebookEntry_studentId_fkey') THEN
    ALTER TABLE "GradebookEntry" ADD CONSTRAINT "GradebookEntry_studentId_fkey"
      FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
