-- TAI-06 (expand-only): DRAFT_LAB_CHALLENGE jobs carry no class-resource kind and record the single applied proposal.
-- Generated offline with prisma migrate diff; NOT applied to any database.
-- AlterTable
ALTER TABLE "AiJob" ADD COLUMN     "appliedItemId" TEXT,
ADD COLUMN     "appliedLessonId" TEXT,
ALTER COLUMN "targetKind" DROP NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "AiJob_appliedItemId_key" ON "AiJob"("appliedItemId");

