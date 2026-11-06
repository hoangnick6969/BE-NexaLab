-- SAI-01A in-run hints: a hint can belong to a LabRun before any attempt exists.
-- Expand-only: existing rows keep their attemptId; nothing is dropped.
ALTER TABLE "HintLog" ALTER COLUMN "attemptId" DROP NOT NULL;
ALTER TABLE "HintLog" ADD COLUMN "labRunId" TEXT;
ALTER TABLE "HintLog" ADD CONSTRAINT "HintLog_labRunId_fkey" FOREIGN KEY ("labRunId") REFERENCES "LabRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE INDEX "HintLog_labRunId_createdAt_idx" ON "HintLog"("labRunId", "createdAt");
-- Every hint belongs to an attempt, a run, or both.
ALTER TABLE "HintLog" ADD CONSTRAINT "HintLog_target_check" CHECK ("attemptId" IS NOT NULL OR "labRunId" IS NOT NULL);
