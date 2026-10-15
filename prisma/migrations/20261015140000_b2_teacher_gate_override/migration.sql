CREATE TABLE "TeacherGateOverride" (
  "id" TEXT NOT NULL,
  "studentId" TEXT NOT NULL,
  "assignmentId" TEXT NOT NULL,
  "stepId" TEXT NOT NULL,
  "actorId" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "revokedAt" TIMESTAMP(3),
  "revokedById" TEXT,
  CONSTRAINT "TeacherGateOverride_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "TeacherGateOverride_studentId_assignmentId_stepId_key"
  ON "TeacherGateOverride"("studentId", "assignmentId", "stepId");
CREATE INDEX "TeacherGateOverride_assignmentId_studentId_revokedAt_idx"
  ON "TeacherGateOverride"("assignmentId", "studentId", "revokedAt");
ALTER TABLE "TeacherGateOverride" ADD CONSTRAINT "TeacherGateOverride_assignmentId_fkey"
  FOREIGN KEY ("assignmentId") REFERENCES "Assignment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TeacherGateOverride" ADD CONSTRAINT "TeacherGateOverride_studentId_fkey"
  FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TeacherGateOverride" ADD CONSTRAINT "TeacherGateOverride_stepId_fkey"
  FOREIGN KEY ("stepId") REFERENCES "LessonStep"("id") ON DELETE CASCADE ON UPDATE CASCADE;
