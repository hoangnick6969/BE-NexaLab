-- CreateTable
CREATE TABLE "AssignmentSubmission" (
    "id" TEXT NOT NULL,
    "assignmentId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "deadlineRevisionId" TEXT NOT NULL,
    "resourceVersion" INTEGER NOT NULL,
    "answers" JSONB NOT NULL,
    "score" INTEGER NOT NULL,
    "correctCount" INTEGER NOT NULL,
    "questionCount" INTEGER NOT NULL,
    "timing" TEXT NOT NULL,
    "lateReason" TEXT,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssignmentSubmission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LateDecision" (
    "id" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "decision" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "note" TEXT,
    "deadlineRevisionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LateDecision_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AssignmentSubmission_assignmentId_studentId_submittedAt_idx" ON "AssignmentSubmission"("assignmentId", "studentId", "submittedAt");

-- CreateIndex
CREATE INDEX "AssignmentSubmission_studentId_submittedAt_idx" ON "AssignmentSubmission"("studentId", "submittedAt");

-- CreateIndex
CREATE UNIQUE INDEX "LateDecision_submissionId_key" ON "LateDecision"("submissionId");

-- AddForeignKey
ALTER TABLE "AssignmentSubmission" ADD CONSTRAINT "AssignmentSubmission_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "Assignment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssignmentSubmission" ADD CONSTRAINT "AssignmentSubmission_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssignmentSubmission" ADD CONSTRAINT "AssignmentSubmission_deadlineRevisionId_fkey" FOREIGN KEY ("deadlineRevisionId") REFERENCES "AssignmentDeadlineRevision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LateDecision" ADD CONSTRAINT "LateDecision_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "AssignmentSubmission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LateDecision" ADD CONSTRAINT "LateDecision_deadlineRevisionId_fkey" FOREIGN KEY ("deadlineRevisionId") REFERENCES "AssignmentDeadlineRevision"("id") ON DELETE SET NULL ON UPDATE CASCADE;

