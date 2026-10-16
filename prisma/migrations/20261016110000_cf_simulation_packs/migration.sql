-- CF-T4: practical activity and topic simulation pack versions; attempts pin the pack (additive).

-- AlterTable
ALTER TABLE "Attempt" ADD COLUMN     "packVersionId" TEXT;

-- CreateTable
CREATE TABLE "PracticalActivityVersion" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "digest" TEXT NOT NULL,
    "spec" JSONB NOT NULL,
    "reviews" JSONB NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PracticalActivityVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SimulationPackVersion" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "labId" TEXT NOT NULL,
    "modelRef" TEXT NOT NULL,
    "engineVersion" TEXT NOT NULL,
    "activityVersionId" TEXT NOT NULL,
    "template" JSONB NOT NULL,
    "visualAssetVersionId" TEXT,
    "semanticMap" JSONB NOT NULL,
    "bindings" JSONB NOT NULL,
    "challengeTemplates" JSONB NOT NULL,
    "reviews" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "validation" JSONB,
    "reason" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "activatedAt" TIMESTAMP(3),
    "retiredAt" TIMESTAMP(3),

    CONSTRAINT "SimulationPackVersion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PracticalActivityVersion_key_version_key" ON "PracticalActivityVersion"("key", "version");

-- CreateIndex
CREATE UNIQUE INDEX "PracticalActivityVersion_key_digest_key" ON "PracticalActivityVersion"("key", "digest");

-- CreateIndex
CREATE INDEX "SimulationPackVersion_labId_status_idx" ON "SimulationPackVersion"("labId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "SimulationPackVersion_key_version_key" ON "SimulationPackVersion"("key", "version");
