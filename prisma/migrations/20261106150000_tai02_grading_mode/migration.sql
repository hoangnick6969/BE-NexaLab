-- TAI-02 (TAI2-T2): written submissions are graded by the teacher, so AssignmentSubmission gains
-- gradingMode and score/correctCount become nullable for TEACHER rows only. Idempotent; order matters:
-- enum, column with default (backfills existing rows to AUTO), preflight, CHECK, then relax NOT NULL.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'GradingMode') THEN
    CREATE TYPE "GradingMode" AS ENUM ('AUTO', 'TEACHER');
  END IF;
END $$;

ALTER TABLE "AssignmentSubmission" ADD COLUMN IF NOT EXISTS "gradingMode" "GradingMode" NOT NULL DEFAULT 'AUTO';

-- Preflight: stop before the CHECK if any AUTO row lacks a score.
DO $$
DECLARE missing integer;
BEGIN
  SELECT count(*) INTO missing FROM "AssignmentSubmission"
    WHERE "gradingMode" = 'AUTO' AND ("score" IS NULL OR "correctCount" IS NULL);
  IF missing > 0 THEN
    RAISE EXCEPTION 'TAI2-T2 preflight: % AUTO submission rows have a null score or correctCount', missing;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AssignmentSubmission_auto_score_check') THEN
    ALTER TABLE "AssignmentSubmission" ADD CONSTRAINT "AssignmentSubmission_auto_score_check"
      CHECK ("gradingMode" <> 'AUTO' OR ("score" IS NOT NULL AND "correctCount" IS NOT NULL));
  END IF;
END $$;

ALTER TABLE "AssignmentSubmission" ALTER COLUMN "score" DROP NOT NULL;
ALTER TABLE "AssignmentSubmission" ALTER COLUMN "correctCount" DROP NOT NULL;
