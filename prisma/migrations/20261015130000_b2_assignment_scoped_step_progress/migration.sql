-- B2-T0: preserve legacy/free-practice rows as assignmentId NULL.
-- Assigned evidence is populated by the application and constrained by the
-- composite unique key below. No legacy row is guessed into an assignment.
ALTER TABLE "StepProgress" ADD COLUMN "id" TEXT;
UPDATE "StepProgress" SET "id" = 'legacy_' || md5("studentId" || ':' || "stepId") WHERE "id" IS NULL;
ALTER TABLE "StepProgress" ALTER COLUMN "id" SET NOT NULL;
ALTER TABLE "StepProgress" ADD COLUMN "assignmentId" TEXT;
ALTER TABLE "StepProgress" DROP CONSTRAINT "StepProgress_pkey";
ALTER TABLE "StepProgress" ADD CONSTRAINT "StepProgress_pkey" PRIMARY KEY ("id");
CREATE UNIQUE INDEX "StepProgress_studentId_assignmentId_stepId_key"
  ON "StepProgress"("studentId", "assignmentId", "stepId");
CREATE INDEX "StepProgress_assignmentId_studentId_idx"
  ON "StepProgress"("assignmentId", "studentId");
ALTER TABLE "StepProgress" ADD CONSTRAINT "StepProgress_assignmentId_fkey"
  FOREIGN KEY ("assignmentId") REFERENCES "Assignment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
