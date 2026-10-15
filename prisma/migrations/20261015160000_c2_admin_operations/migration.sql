-- C2 admin operations: additive only. Existing rows keep their meaning:
-- assets READY/TEACHER_PRIVATE, outcomes active, attempts without a config version.

-- AlterTable
ALTER TABLE "AssetFile" ADD COLUMN     "license" TEXT,
ADD COLUMN     "quarantineReason" TEXT,
ADD COLUMN     "quarantinedAt" TIMESTAMP(3),
ADD COLUMN     "scope" TEXT NOT NULL DEFAULT 'TEACHER_PRIVATE',
ADD COLUMN     "sha256" TEXT,
ADD COLUMN     "source" TEXT,
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'READY';

-- AlterTable
ALTER TABLE "Attempt" ADD COLUMN     "configVersionId" TEXT;

-- AlterTable
ALTER TABLE "CurriculumOutcome" ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'active',
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "Lesson" ADD COLUMN     "quarantineReason" TEXT,
ADD COLUMN     "quarantinedAt" TIMESTAMP(3),
ADD COLUMN     "statusBeforeQuarantine" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "disabledAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "CurriculumChapter" (
    "code" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "grade" INTEGER NOT NULL,
    "domain" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "synthetic" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CurriculumChapter_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "CurriculumTopic" (
    "code" TEXT NOT NULL,
    "chapterCode" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "outcomeCodes" JSONB NOT NULL DEFAULT '[]',
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CurriculumTopic_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "SimulationConfigVersion" (
    "id" TEXT NOT NULL,
    "labId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "modelRef" TEXT NOT NULL,
    "challengeParams" JSONB NOT NULL,
    "goldenCases" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "reason" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "activatedAt" TIMESTAMP(3),
    "retiredAt" TIMESTAMP(3),

    CONSTRAINT "SimulationConfigVersion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CurriculumChapter_grade_domain_idx" ON "CurriculumChapter"("grade", "domain");

-- CreateIndex
CREATE INDEX "CurriculumTopic_chapterCode_idx" ON "CurriculumTopic"("chapterCode");

-- CreateIndex
CREATE INDEX "SimulationConfigVersion_labId_status_idx" ON "SimulationConfigVersion"("labId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "SimulationConfigVersion_labId_version_key" ON "SimulationConfigVersion"("labId", "version");

-- CreateIndex
CREATE INDEX "AssetFile_ownerId_idx" ON "AssetFile"("ownerId");

-- CreateIndex
CREATE INDEX "AssetFile_status_scope_idx" ON "AssetFile"("status", "scope");

-- AddForeignKey
ALTER TABLE "CurriculumTopic" ADD CONSTRAINT "CurriculumTopic_chapterCode_fkey" FOREIGN KEY ("chapterCode") REFERENCES "CurriculumChapter"("code") ON DELETE RESTRICT ON UPDATE CASCADE;
