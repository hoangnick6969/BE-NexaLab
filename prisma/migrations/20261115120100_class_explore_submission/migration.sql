-- Class Explore (P0 C3.4, K2 pilot step C, expand-only): the pinned snapshot on an assignment and the student submissions.
-- Generated offline with prisma migrate diff; NOT applied to any database.
-- AlterTable
ALTER TABLE "Assignment" ADD COLUMN     "exploreSnapshot" JSONB;

-- CreateTable
CREATE TABLE "ClassExploreSubmission" (
    "id" TEXT NOT NULL,
    "assignmentId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "idempotencyKey" TEXT,
    "answers" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'SUBMITTED',
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "feedback" TEXT,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),

    CONSTRAINT "ClassExploreSubmission_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ClassExploreSubmission_studentId_submittedAt_idx" ON "ClassExploreSubmission"("studentId", "submittedAt");

-- CreateIndex
CREATE INDEX "ClassExploreSubmission_assignmentId_status_idx" ON "ClassExploreSubmission"("assignmentId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ClassExploreSubmission_assignmentId_studentId_key" ON "ClassExploreSubmission"("assignmentId", "studentId");

-- AddForeignKey
ALTER TABLE "ClassExploreSubmission" ADD CONSTRAINT "ClassExploreSubmission_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "Assignment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassExploreSubmission" ADD CONSTRAINT "ClassExploreSubmission_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

