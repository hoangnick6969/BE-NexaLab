-- AlterTable
ALTER TABLE "Attempt" ADD COLUMN IF NOT EXISTS "assignmentId" TEXT;
ALTER TABLE "Attempt" ADD COLUMN IF NOT EXISTS "lessonStepId" TEXT;
ALTER TABLE "Attempt" ADD COLUMN IF NOT EXISTS "simulationModelVersion" TEXT NOT NULL DEFAULT '1.0.0';
ALTER TABLE "Attempt" ADD COLUMN IF NOT EXISTS "idempotencyKey" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "Attempt_studentId_idempotencyKey_key" ON "Attempt"("studentId", "idempotencyKey");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Attempt_studentId_lessonStepId_createdAt_idx" ON "Attempt"("studentId", "lessonStepId", "createdAt");
