DROP INDEX IF EXISTS "Attempt_studentId_lessonStepId_createdAt_idx";
DROP INDEX IF EXISTS "Attempt_studentId_idempotencyKey_key";
ALTER TABLE "Attempt" DROP COLUMN IF EXISTS "idempotencyKey";
ALTER TABLE "Attempt" DROP COLUMN IF EXISTS "simulationModelVersion";
ALTER TABLE "Attempt" DROP COLUMN IF EXISTS "lessonStepId";
ALTER TABLE "Attempt" DROP COLUMN IF EXISTS "assignmentId";
