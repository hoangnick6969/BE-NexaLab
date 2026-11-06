-- SAI-03A lesson quiz hints: a hint can belong to a student's lesson step instead of an attempt or a LabRun.
-- Expand-only: existing rows are untouched; the target check is widened, never narrowed.
ALTER TABLE "HintLog" ADD COLUMN "lessonStepId" TEXT;
ALTER TABLE "HintLog" ADD COLUMN "studentId" TEXT;
ALTER TABLE "HintLog" ADD CONSTRAINT "HintLog_lessonStepId_fkey" FOREIGN KEY ("lessonStepId") REFERENCES "LessonStep"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HintLog" ADD CONSTRAINT "HintLog_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE INDEX "HintLog_studentId_lessonStepId_createdAt_idx" ON "HintLog"("studentId", "lessonStepId", "createdAt");
CREATE INDEX "HintLog_lessonStepId_idx" ON "HintLog"("lessonStepId");
ALTER TABLE "HintLog" DROP CONSTRAINT "HintLog_target_check";
-- Every hint belongs to an attempt, a run, or a student's lesson step.
ALTER TABLE "HintLog" ADD CONSTRAINT "HintLog_target_check" CHECK (
  "attemptId" IS NOT NULL OR "labRunId" IS NOT NULL OR ("lessonStepId" IS NOT NULL AND "studentId" IS NOT NULL)
);
