-- CF-T2: immutable asset versions in object storage (additive). Existing AssetFile rows are
-- imported by `npm run cf:migrate-assets` with before/after reconciliation.

-- CreateTable
CREATE TABLE "Asset" (
    "id" TEXT NOT NULL,
    "scope" TEXT NOT NULL DEFAULT 'TEACHER_PRIVATE',
    "ownerId" TEXT,
    "title" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "license" TEXT,
    "source" TEXT,
    "attribution" TEXT,
    "quarantinedAt" TIMESTAMP(3),
    "quarantineReason" TEXT,
    "legacyFileId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Asset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssetVersion" (
    "id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "storage" TEXT NOT NULL,
    "bucket" TEXT NOT NULL,
    "stagingKey" TEXT,
    "objectKey" TEXT,
    "fileName" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "declaredBytes" INTEGER NOT NULL,
    "bytes" INTEGER,
    "sha256" TEXT,
    "expectedSha256" TEXT,
    "etag" TEXT,
    "uploadId" TEXT,
    "multipart" BOOLEAN NOT NULL DEFAULT false,
    "validation" JSONB,
    "failureReason" TEXT,
    "expiresAt" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "readyAt" TIMESTAMP(3),

    CONSTRAINT "AssetVersion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Asset_legacyFileId_key" ON "Asset"("legacyFileId");

-- CreateIndex
CREATE INDEX "Asset_ownerId_idx" ON "Asset"("ownerId");

-- CreateIndex
CREATE INDEX "Asset_status_scope_idx" ON "Asset"("status", "scope");

-- CreateIndex
CREATE UNIQUE INDEX "AssetVersion_objectKey_key" ON "AssetVersion"("objectKey");

-- CreateIndex
CREATE INDEX "AssetVersion_status_expiresAt_idx" ON "AssetVersion"("status", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "AssetVersion_assetId_version_key" ON "AssetVersion"("assetId", "version");

-- AddForeignKey
ALTER TABLE "AssetVersion" ADD CONSTRAINT "AssetVersion_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
