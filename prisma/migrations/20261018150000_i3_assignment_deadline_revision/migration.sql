CREATE TABLE "AssignmentDeadlineRevision" (
    "id" TEXT NOT NULL,
    "assignmentId" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "actorId" TEXT NOT NULL,
    "note" TEXT,
    "triggeredBySubmissionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AssignmentDeadlineRevision_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AssignmentDeadlineRevision_assignmentId_revision_key" ON "AssignmentDeadlineRevision"("assignmentId", "revision");

ALTER TABLE "AssignmentDeadlineRevision" ADD CONSTRAINT "AssignmentDeadlineRevision_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "Assignment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
