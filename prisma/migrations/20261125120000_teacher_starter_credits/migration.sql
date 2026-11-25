ALTER TABLE "CreditTransaction" ADD COLUMN "systemKey" TEXT;
CREATE UNIQUE INDEX "CreditTransaction_systemKey_key" ON "CreditTransaction"("systemKey");
