-- TAI-01 (TAI-T2): shared Teacher AI job runtime. Expand-only: three new tables and two enums; no existing table changes.

-- CreateEnum
CREATE TYPE "AiJobStatus" AS ENUM ('PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AiItemDecisionKind" AS ENUM ('ACCEPTED', 'EDITED', 'REJECTED');

-- CreateTable
CREATE TABLE "AiJob" (
    "id" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "targetKind" "ClassResourceKind" NOT NULL,
    "lessonId" TEXT NOT NULL,
    "request" JSONB NOT NULL,
    "inputSnapshot" JSONB NOT NULL,
    "inputDigest" TEXT NOT NULL,
    "promptVersion" TEXT NOT NULL,
    "outputSchemaVersion" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "status" "AiJobStatus" NOT NULL DEFAULT 'PENDING',
    "failureCode" TEXT,
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "leaseUntil" TIMESTAMP(3),
    "inputTokens" INTEGER,
    "outputTokens" INTEGER,
    "droppedItems" JSONB NOT NULL DEFAULT '[]',
    "materializedResourceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),

    CONSTRAINT "AiJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiJobItem" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "payload" JSONB NOT NULL,
    "flags" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiJobItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiItemDecision" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "decision" "AiItemDecisionKind" NOT NULL,
    "editedPayload" JSONB,
    "reasonCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiItemDecision_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AiJob_materializedResourceId_key" ON "AiJob"("materializedResourceId");

-- CreateIndex
CREATE INDEX "AiJob_actorId_purpose_createdAt_idx" ON "AiJob"("actorId", "purpose", "createdAt");

-- CreateIndex
CREATE INDEX "AiJob_status_leaseUntil_idx" ON "AiJob"("status", "leaseUntil");

-- CreateIndex
CREATE INDEX "AiJob_classId_createdAt_idx" ON "AiJob"("classId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AiJobItem_jobId_position_key" ON "AiJobItem"("jobId", "position");

-- CreateIndex
CREATE INDEX "AiItemDecision_itemId_createdAt_idx" ON "AiItemDecision"("itemId", "createdAt");

-- AddForeignKey
ALTER TABLE "AiJobItem" ADD CONSTRAINT "AiJobItem_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "AiJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiItemDecision" ADD CONSTRAINT "AiItemDecision_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "AiJobItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

