-- CF-T1/CF-T3: source policy registry, ingestion staging, content packs and release receipts (additive).

-- AlterTable
ALTER TABLE "Lesson" ADD COLUMN     "packVersionId" TEXT;

-- CreateTable
CREATE TABLE "SourcePolicy" (
    "key" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "currentVersion" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SourcePolicy_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "SourcePolicyVersion" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "policy" JSONB NOT NULL,
    "reason" TEXT NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SourcePolicyVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IngestionRun" (
    "id" TEXT NOT NULL,
    "sourceKey" TEXT NOT NULL,
    "policyVersionId" TEXT NOT NULL,
    "connector" TEXT NOT NULL,
    "parserVersion" TEXT NOT NULL,
    "trigger" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'RUNNING',
    "counts" JSONB,
    "error" TEXT,
    "startedById" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "IngestionRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IngestionItem" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "url" TEXT,
    "status" TEXT NOT NULL,
    "rejection" TEXT,
    "sha256" TEXT,
    "artifactVersionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IngestionItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SourceArtifact" (
    "id" TEXT NOT NULL,
    "sourceKey" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "title" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SourceArtifact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SourceArtifactVersion" (
    "id" TEXT NOT NULL,
    "artifactId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "canonicalUrl" TEXT NOT NULL,
    "retrievedAt" TIMESTAMP(3) NOT NULL,
    "sha256" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "bytes" INTEGER NOT NULL,
    "licenseSnapshot" JSONB NOT NULL,
    "locator" TEXT,
    "parserVersion" TEXT,
    "storagePolicy" TEXT NOT NULL,
    "rawObjectKey" TEXT,
    "normalized" JSONB,
    "reviewStatus" TEXT NOT NULL DEFAULT 'STAGED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SourceArtifactVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContentPack" (
    "key" TEXT NOT NULL,
    "grade" INTEGER NOT NULL,
    "domain" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "namespace" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContentPack_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "ContentPackVersion" (
    "id" TEXT NOT NULL,
    "packKey" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "digest" TEXT NOT NULL,
    "manifest" JSONB NOT NULL,
    "status" TEXT NOT NULL,
    "synthetic" BOOLEAN NOT NULL DEFAULT false,
    "outcomeCodes" JSONB NOT NULL DEFAULT '[]',
    "lessonId" TEXT,
    "releaseId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "releasedAt" TIMESTAMP(3),
    "retiredAt" TIMESTAMP(3),

    CONSTRAINT "ContentPackVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContentRelease" (
    "id" TEXT NOT NULL,
    "environment" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "digest" TEXT NOT NULL,
    "importerVersion" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "initiatedById" TEXT NOT NULL,
    "approvedById" TEXT NOT NULL,
    "summary" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "retiredAt" TIMESTAMP(3),

    CONSTRAINT "ContentRelease_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContentReleaseItem" (
    "id" TEXT NOT NULL,
    "releaseId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "refId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContentReleaseItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SourcePolicyVersion_key_version_key" ON "SourcePolicyVersion"("key", "version");

-- CreateIndex
CREATE INDEX "IngestionRun_sourceKey_startedAt_idx" ON "IngestionRun"("sourceKey", "startedAt");

-- CreateIndex
CREATE INDEX "IngestionItem_runId_idx" ON "IngestionItem"("runId");

-- CreateIndex
CREATE UNIQUE INDEX "SourceArtifact_sourceKey_externalId_key" ON "SourceArtifact"("sourceKey", "externalId");

-- CreateIndex
CREATE UNIQUE INDEX "SourceArtifactVersion_artifactId_version_key" ON "SourceArtifactVersion"("artifactId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "SourceArtifactVersion_artifactId_sha256_key" ON "SourceArtifactVersion"("artifactId", "sha256");

-- CreateIndex
CREATE UNIQUE INDEX "ContentPackVersion_packKey_version_key" ON "ContentPackVersion"("packKey", "version");

-- CreateIndex
CREATE UNIQUE INDEX "ContentPackVersion_packKey_digest_key" ON "ContentPackVersion"("packKey", "digest");

-- CreateIndex
CREATE UNIQUE INDEX "ContentRelease_environment_digest_key" ON "ContentRelease"("environment", "digest");

-- CreateIndex
CREATE INDEX "ContentReleaseItem_releaseId_idx" ON "ContentReleaseItem"("releaseId");

-- AddForeignKey
ALTER TABLE "SourcePolicyVersion" ADD CONSTRAINT "SourcePolicyVersion_key_fkey" FOREIGN KEY ("key") REFERENCES "SourcePolicy"("key") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IngestionItem" ADD CONSTRAINT "IngestionItem_runId_fkey" FOREIGN KEY ("runId") REFERENCES "IngestionRun"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SourceArtifactVersion" ADD CONSTRAINT "SourceArtifactVersion_artifactId_fkey" FOREIGN KEY ("artifactId") REFERENCES "SourceArtifact"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentPackVersion" ADD CONSTRAINT "ContentPackVersion_packKey_fkey" FOREIGN KEY ("packKey") REFERENCES "ContentPack"("key") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentReleaseItem" ADD CONSTRAINT "ContentReleaseItem_releaseId_fkey" FOREIGN KEY ("releaseId") REFERENCES "ContentRelease"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
