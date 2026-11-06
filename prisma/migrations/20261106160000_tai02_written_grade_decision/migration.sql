-- TAI-02 (TAI2-T3): append-only teacher grades for written submissions. Expand-only and idempotent.
-- The full WrittenGradeKind enum is declared now so TAI2-T6 needs no enum migration; T3 writes MANUAL only.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'WrittenGradeKind') THEN
    CREATE TYPE "WrittenGradeKind" AS ENUM ('MANUAL', 'ACCEPTED_AI', 'EDITED_AI', 'REJECTED_AI');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "WrittenGradeDecision" (
    "id" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "kind" "WrittenGradeKind" NOT NULL,
    "basedOnSuggestionId" TEXT,
    "criterionPoints" JSONB NOT NULL,
    "totalPoints" DOUBLE PRECISION NOT NULL,
    "maxPoints" DOUBLE PRECISION NOT NULL,
    "score" INTEGER NOT NULL,
    "feedback" TEXT,
    "resourceVersion" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WrittenGradeDecision_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "WrittenGradeDecision_submissionId_createdAt_idx" ON "WrittenGradeDecision"("submissionId", "createdAt");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'WrittenGradeDecision_submissionId_fkey') THEN
    ALTER TABLE "WrittenGradeDecision" ADD CONSTRAINT "WrittenGradeDecision_submissionId_fkey"
      FOREIGN KEY ("submissionId") REFERENCES "AssignmentSubmission"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
