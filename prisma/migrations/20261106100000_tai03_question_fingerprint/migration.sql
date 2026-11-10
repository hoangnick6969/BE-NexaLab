-- TAI-03 (TAI3-T1): question fingerprints for qdup@1. Expand-only: one new table, no existing table changes.

-- CreateTable
CREATE TABLE "QuestionFingerprint" (
    "id" TEXT NOT NULL,
    "sourceKind" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "sourceVersion" INTEGER NOT NULL,
    "itemId" TEXT NOT NULL,
    "ownerTeacherId" TEXT,
    "classId" TEXT,
    "normalizedText" TEXT NOT NULL,
    "normalizedHash" TEXT NOT NULL,
    "algorithm" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QuestionFingerprint_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "QuestionFingerprint_ownerTeacherId_normalizedHash_idx" ON "QuestionFingerprint"("ownerTeacherId", "normalizedHash");

-- CreateIndex
CREATE INDEX "QuestionFingerprint_sourceKind_normalizedHash_idx" ON "QuestionFingerprint"("sourceKind", "normalizedHash");

-- CreateIndex
CREATE UNIQUE INDEX "QuestionFingerprint_sourceKind_sourceId_sourceVersion_itemI_key" ON "QuestionFingerprint"("sourceKind", "sourceId", "sourceVersion", "itemId", "algorithm");

