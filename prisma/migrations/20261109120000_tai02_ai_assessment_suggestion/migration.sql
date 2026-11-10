-- TAI-02 (TAI2-T4): ASSESS_SUBMISSION jobs and AI rubric suggestions. Expand-only and idempotent.
-- Generated offline with `prisma migrate diff --from-schema-datamodel <HEAD schema> --to-schema-datamodel prisma/schema.prisma`
-- and wrapped in IF NOT EXISTS guards. NOT applied to any database.
-- AiJob.submissionId is nullable (set only for ASSESS_SUBMISSION) and cascades, so the redacted snapshot of a job is
-- deleted together with its submission; a suggestion cascades with its job and its submission.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'AiSuggestionStatus') THEN
    CREATE TYPE "AiSuggestionStatus" AS ENUM ('VALID', 'PARTIAL', 'SUPPRESSED');
  END IF;
END $$;

ALTER TABLE "AiJob" ADD COLUMN IF NOT EXISTS "submissionId" TEXT;

CREATE TABLE IF NOT EXISTS "AiAssessmentSuggestion" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "resourceVersion" INTEGER NOT NULL,
    "promptVersion" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "status" "AiSuggestionStatus" NOT NULL,
    "criterionResults" JSONB NOT NULL,
    "flags" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiAssessmentSuggestion_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "AiAssessmentSuggestion_jobId_key" ON "AiAssessmentSuggestion"("jobId");
CREATE INDEX IF NOT EXISTS "AiAssessmentSuggestion_submissionId_createdAt_idx" ON "AiAssessmentSuggestion"("submissionId", "createdAt");
CREATE INDEX IF NOT EXISTS "AiAssessmentSuggestion_promptVersion_mode_idx" ON "AiAssessmentSuggestion"("promptVersion", "mode");
CREATE INDEX IF NOT EXISTS "AiJob_submissionId_promptVersion_idx" ON "AiJob"("submissionId", "promptVersion");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AiJob_submissionId_fkey') THEN
    ALTER TABLE "AiJob" ADD CONSTRAINT "AiJob_submissionId_fkey"
      FOREIGN KEY ("submissionId") REFERENCES "AssignmentSubmission"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AiAssessmentSuggestion_jobId_fkey') THEN
    ALTER TABLE "AiAssessmentSuggestion" ADD CONSTRAINT "AiAssessmentSuggestion_jobId_fkey"
      FOREIGN KEY ("jobId") REFERENCES "AiJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AiAssessmentSuggestion_submissionId_fkey') THEN
    ALTER TABLE "AiAssessmentSuggestion" ADD CONSTRAINT "AiAssessmentSuggestion_submissionId_fkey"
      FOREIGN KEY ("submissionId") REFERENCES "AssignmentSubmission"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
