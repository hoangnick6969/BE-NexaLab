-- TAI-04 (TAI4-T3): append-only teacher responses to insight fingerprints. Expand-only and idempotent.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'InsightAckAction') THEN
    CREATE TYPE "InsightAckAction" AS ENUM ('ACKNOWLEDGED', 'DISMISSED');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "InsightAcknowledgement" (
    "id" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "ruleVersion" TEXT NOT NULL,
    "ruleCode" TEXT NOT NULL,
    "evidenceIds" JSONB NOT NULL,
    "action" "InsightAckAction" NOT NULL,
    "note" TEXT,
    "actorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InsightAcknowledgement_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "InsightAcknowledgement_classId_studentId_createdAt_idx" ON "InsightAcknowledgement"("classId", "studentId", "createdAt");
CREATE INDEX IF NOT EXISTS "InsightAcknowledgement_fingerprint_createdAt_idx" ON "InsightAcknowledgement"("fingerprint", "createdAt");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'InsightAcknowledgement_classId_fkey') THEN
    ALTER TABLE "InsightAcknowledgement" ADD CONSTRAINT "InsightAcknowledgement_classId_fkey"
      FOREIGN KEY ("classId") REFERENCES "Classroom"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'InsightAcknowledgement_studentId_fkey') THEN
    ALTER TABLE "InsightAcknowledgement" ADD CONSTRAINT "InsightAcknowledgement_studentId_fkey"
      FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
