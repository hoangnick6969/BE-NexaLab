-- TAI-03 (TAI3-T4): similarity runs, matches and append-only reviews for written assignments.
-- Expand-only and idempotent: new tables, indexes and foreign keys only; nothing existing changes.
CREATE TABLE IF NOT EXISTS "SubmissionSimilarityRun" (
    "id" TEXT NOT NULL,
    "assignmentId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "algorithmVersion" TEXT NOT NULL,
    "inputDigest" TEXT NOT NULL,
    "submissionCount" INTEGER NOT NULL,
    "skipped" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SubmissionSimilarityRun_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "SubmissionSimilarityMatch" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "submissionAId" TEXT NOT NULL,
    "submissionBId" TEXT NOT NULL,
    "level" TEXT NOT NULL,
    "maxContainment" DOUBLE PRECISION NOT NULL,
    "perPrompt" JSONB NOT NULL,

    CONSTRAINT "SubmissionSimilarityMatch_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "SimilarityMatchReview" (
    "id" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SimilarityMatchReview_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "SubmissionSimilarityRun_assignmentId_algorithmVersion_inputDigest_key" ON "SubmissionSimilarityRun"("assignmentId", "algorithmVersion", "inputDigest");
CREATE INDEX IF NOT EXISTS "SubmissionSimilarityRun_assignmentId_createdAt_idx" ON "SubmissionSimilarityRun"("assignmentId", "createdAt");
CREATE UNIQUE INDEX IF NOT EXISTS "SubmissionSimilarityMatch_runId_submissionAId_submissionBId_key" ON "SubmissionSimilarityMatch"("runId", "submissionAId", "submissionBId");
CREATE INDEX IF NOT EXISTS "SubmissionSimilarityMatch_submissionAId_idx" ON "SubmissionSimilarityMatch"("submissionAId");
CREATE INDEX IF NOT EXISTS "SubmissionSimilarityMatch_submissionBId_idx" ON "SubmissionSimilarityMatch"("submissionBId");
CREATE INDEX IF NOT EXISTS "SimilarityMatchReview_matchId_createdAt_idx" ON "SimilarityMatchReview"("matchId", "createdAt");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'SubmissionSimilarityRun_assignmentId_fkey') THEN
    ALTER TABLE "SubmissionSimilarityRun" ADD CONSTRAINT "SubmissionSimilarityRun_assignmentId_fkey"
      FOREIGN KEY ("assignmentId") REFERENCES "Assignment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'SubmissionSimilarityMatch_runId_fkey') THEN
    ALTER TABLE "SubmissionSimilarityMatch" ADD CONSTRAINT "SubmissionSimilarityMatch_runId_fkey"
      FOREIGN KEY ("runId") REFERENCES "SubmissionSimilarityRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'SubmissionSimilarityMatch_submissionAId_fkey') THEN
    ALTER TABLE "SubmissionSimilarityMatch" ADD CONSTRAINT "SubmissionSimilarityMatch_submissionAId_fkey"
      FOREIGN KEY ("submissionAId") REFERENCES "AssignmentSubmission"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'SubmissionSimilarityMatch_submissionBId_fkey') THEN
    ALTER TABLE "SubmissionSimilarityMatch" ADD CONSTRAINT "SubmissionSimilarityMatch_submissionBId_fkey"
      FOREIGN KEY ("submissionBId") REFERENCES "AssignmentSubmission"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'SimilarityMatchReview_matchId_fkey') THEN
    ALTER TABLE "SimilarityMatchReview" ADD CONSTRAINT "SimilarityMatchReview_matchId_fkey"
      FOREIGN KEY ("matchId") REFERENCES "SubmissionSimilarityMatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
