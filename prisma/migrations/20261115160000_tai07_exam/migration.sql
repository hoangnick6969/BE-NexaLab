ALTER TYPE "ClassResourceKind" ADD VALUE IF NOT EXISTS 'EXAM';
ALTER TYPE "GradingMode" ADD VALUE IF NOT EXISTS 'MIXED';

ALTER TABLE "AssignmentSubmission" ADD COLUMN IF NOT EXISTS "examComponents" JSONB;
ALTER TABLE "LabRun" ADD COLUMN IF NOT EXISTS "assessmentSessionId" TEXT REFERENCES "AssessmentSession"("id") ON DELETE SET NULL,
                     ADD COLUMN IF NOT EXISTS "examItemId" TEXT;
CREATE INDEX IF NOT EXISTS "LabRun_assessmentSessionId_examItemId_idx" ON "LabRun" ("assessmentSessionId", "examItemId");
