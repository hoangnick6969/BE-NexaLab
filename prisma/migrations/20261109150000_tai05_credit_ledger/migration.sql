-- TAI-05 (TAI5-T1): credit ledger, pricing versions and AiJob credit columns. Expand-only and idempotent.
-- Generated offline with `prisma migrate diff --from-schema-datamodel <schema before TAI-05> --to-schema-datamodel prisma/schema.prisma`,
-- wrapped in IF NOT EXISTS guards, plus the hand-written constraints below. NOT applied to any database.
-- Hand-written (Prisma cannot express them, so a later `migrate diff` will list them as drift: keep them):
--   1. CHECK (balance >= 0) on teacher account kinds (CAP-3, last line of defence behind the conditional decrement);
--   2. partial unique indexes so the two system accounts are singletons (a plain unique treats NULL ownerId as distinct);
--   3. triggers that reject UPDATE and DELETE on CreditTransaction and CreditEntry (append-only ledger);
--   4. non-negative price checks.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'CreditAccountKind') THEN
    CREATE TYPE "CreditAccountKind" AS ENUM ('TEACHER_AVAILABLE', 'TEACHER_RESERVED', 'SYSTEM_ISSUANCE', 'SYSTEM_CONSUMED');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'CreditTxKind') THEN
    CREATE TYPE "CreditTxKind" AS ENUM ('GRANT', 'ADJUST', 'RESERVE', 'SETTLE', 'REFUND');
  END IF;
END $$;

ALTER TABLE "AiJob"
  ADD COLUMN IF NOT EXISTS "chargedCredits" INTEGER,
  ADD COLUMN IF NOT EXISTS "estimatedCredits" INTEGER,
  ADD COLUMN IF NOT EXISTS "pricingVersionId" TEXT;

CREATE TABLE IF NOT EXISTS "CreditAccount" (
    "id" TEXT NOT NULL,
    "kind" "CreditAccountKind" NOT NULL,
    "ownerId" TEXT,
    "balance" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CreditAccount_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "CreditTransaction" (
    "id" TEXT NOT NULL,
    "kind" "CreditTxKind" NOT NULL,
    "aiJobId" TEXT,
    "pricingVersionId" TEXT,
    "actorId" TEXT,
    "reason" TEXT,
    "idempotencyKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CreditTransaction_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "CreditEntry" (
    "id" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,

    CONSTRAINT "CreditEntry_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "PricingVersion" (
    "id" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "baseCredits" INTEGER NOT NULL,
    "perItemCredits" INTEGER NOT NULL,
    "creditsPer1kInputTokens" INTEGER NOT NULL,
    "creditsPer1kOutputTokens" INTEGER NOT NULL,
    "evidenceRef" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "activatedAt" TIMESTAMP(3),
    "retiredAt" TIMESTAMP(3),

    CONSTRAINT "PricingVersion_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "CreditAccount_kind_ownerId_key" ON "CreditAccount"("kind", "ownerId");
CREATE INDEX IF NOT EXISTS "CreditTransaction_createdAt_idx" ON "CreditTransaction"("createdAt");
CREATE UNIQUE INDEX IF NOT EXISTS "CreditTransaction_aiJobId_kind_key" ON "CreditTransaction"("aiJobId", "kind");
CREATE UNIQUE INDEX IF NOT EXISTS "CreditTransaction_actorId_idempotencyKey_key" ON "CreditTransaction"("actorId", "idempotencyKey");
CREATE INDEX IF NOT EXISTS "CreditEntry_accountId_idx" ON "CreditEntry"("accountId");
CREATE INDEX IF NOT EXISTS "CreditEntry_transactionId_idx" ON "CreditEntry"("transactionId");
CREATE UNIQUE INDEX IF NOT EXISTS "PricingVersion_purpose_version_key" ON "PricingVersion"("purpose", "version");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CreditEntry_transactionId_fkey') THEN
    ALTER TABLE "CreditEntry" ADD CONSTRAINT "CreditEntry_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "CreditTransaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CreditEntry_accountId_fkey') THEN
    ALTER TABLE "CreditEntry" ADD CONSTRAINT "CreditEntry_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "CreditAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;

  -- 1. A teacher balance can never be negative; the system accounts may be (negative issuance = credits issued).
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CreditAccount_teacher_balance_check') THEN
    ALTER TABLE "CreditAccount" ADD CONSTRAINT "CreditAccount_teacher_balance_check"
      CHECK ("kind" IN ('SYSTEM_ISSUANCE', 'SYSTEM_CONSUMED') OR "balance" >= 0);
  END IF;
  -- A system account has no owner and a teacher account always has one.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CreditAccount_owner_check') THEN
    ALTER TABLE "CreditAccount" ADD CONSTRAINT "CreditAccount_owner_check"
      CHECK (("kind" IN ('SYSTEM_ISSUANCE', 'SYSTEM_CONSUMED')) = ("ownerId" IS NULL));
  END IF;
  -- 4. Prices are non-negative; a status is one of the three known values.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PricingVersion_values_check') THEN
    ALTER TABLE "PricingVersion" ADD CONSTRAINT "PricingVersion_values_check"
      CHECK ("baseCredits" >= 0 AND "perItemCredits" >= 0 AND "creditsPer1kInputTokens" >= 0 AND "creditsPer1kOutputTokens" >= 0
             AND "version" >= 1 AND "status" IN ('draft', 'active', 'retired'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AiJob_credits_check') THEN
    ALTER TABLE "AiJob" ADD CONSTRAINT "AiJob_credits_check"
      CHECK (("estimatedCredits" IS NULL OR "estimatedCredits" >= 0)
             AND ("chargedCredits" IS NULL OR ("chargedCredits" >= 0 AND "estimatedCredits" IS NOT NULL AND "chargedCredits" <= "estimatedCredits")));
  END IF;
END $$;

-- 2. System accounts are singletons per kind.
CREATE UNIQUE INDEX IF NOT EXISTS "CreditAccount_system_singleton_key" ON "CreditAccount"("kind") WHERE "ownerId" IS NULL;

-- 3. Append-only ledger: a posted transaction or entry can never change or disappear.
CREATE OR REPLACE FUNCTION "credit_ledger_immutable"() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'CreditTransaction and CreditEntry are append-only (% on %)', TG_OP, TG_TABLE_NAME USING ERRCODE = 'integrity_constraint_violation';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "CreditTransaction_immutable" ON "CreditTransaction";
CREATE TRIGGER "CreditTransaction_immutable" BEFORE UPDATE OR DELETE ON "CreditTransaction"
  FOR EACH ROW EXECUTE FUNCTION "credit_ledger_immutable"();
DROP TRIGGER IF EXISTS "CreditEntry_immutable" ON "CreditEntry";
CREATE TRIGGER "CreditEntry_immutable" BEFORE UPDATE OR DELETE ON "CreditEntry"
  FOR EACH ROW EXECUTE FUNCTION "credit_ledger_immutable"();
