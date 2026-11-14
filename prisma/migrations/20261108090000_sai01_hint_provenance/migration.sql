-- SAI-01 (expand-only): provenance columns on HintLog and the provider observation cache.
ALTER TABLE "HintLog"
  ADD COLUMN "contextDigest" TEXT,
  ADD COLUMN "labDigest" TEXT,
  ADD COLUMN "ruleVersion" TEXT,
  ADD COLUMN "promptVersion" TEXT,
  ADD COLUMN "provider" TEXT,
  ADD COLUMN "model" TEXT,
  ADD COLUMN "fallbackReason" TEXT,
  ADD COLUMN "escalated" BOOLEAN,
  ADD COLUMN "variant" TEXT;

CREATE INDEX "HintLog_createdAt_idx" ON "HintLog"("createdAt");

CREATE TABLE "HintObservationCache" (
    "key" TEXT NOT NULL,
    "observation" TEXT NOT NULL,
    "promptVersion" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HintObservationCache_pkey" PRIMARY KEY ("key")
);

CREATE INDEX "HintObservationCache_expiresAt_idx" ON "HintObservationCache"("expiresAt");
