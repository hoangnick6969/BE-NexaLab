ALTER TABLE "Lesson" ADD COLUMN "sgkReference" JSONB;

CREATE TABLE "VideoProgressEvidence" (
  "id" TEXT NOT NULL,
  "studentId" TEXT NOT NULL,
  "stepId" TEXT NOT NULL,
  "assignmentId" TEXT,
  "scopeKey" TEXT NOT NULL,
  "durationSeconds" INTEGER NOT NULL,
  "watchedRanges" JSONB NOT NULL DEFAULT '[]',
  "watchedSeconds" INTEGER NOT NULL DEFAULT 0,
  "replaySeconds" INTEGER NOT NULL DEFAULT 0,
  "coveragePercent" INTEGER NOT NULL DEFAULT 0,
  "lastPosition" INTEGER NOT NULL DEFAULT 0,
  "completionMethod" TEXT,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  "lastObservedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "VideoProgressEvidence_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "VideoPlaybackSession" (
  "id" TEXT NOT NULL,
  "evidenceId" TEXT NOT NULL,
  "studentId" TEXT NOT NULL,
  "stepId" TEXT NOT NULL,
  "assignmentId" TEXT,
  "provider" TEXT NOT NULL,
  "clientSessionId" TEXT NOT NULL,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastSequence" INTEGER NOT NULL DEFAULT 0,
  "lastPosition" INTEGER NOT NULL DEFAULT 0,
  "lastClientObservedAt" TIMESTAMP(3),
  "lastResult" JSONB,
  "endedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "VideoPlaybackSession_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "VideoProgressEvidence_studentId_stepId_scopeKey_key" ON "VideoProgressEvidence"("studentId", "stepId", "scopeKey");
CREATE INDEX "VideoProgressEvidence_assignmentId_studentId_idx" ON "VideoProgressEvidence"("assignmentId", "studentId");
CREATE INDEX "VideoProgressEvidence_stepId_coveragePercent_idx" ON "VideoProgressEvidence"("stepId", "coveragePercent");
CREATE UNIQUE INDEX "VideoPlaybackSession_studentId_stepId_clientSessionId_key" ON "VideoPlaybackSession"("studentId", "stepId", "clientSessionId");
CREATE INDEX "VideoPlaybackSession_evidenceId_updatedAt_idx" ON "VideoPlaybackSession"("evidenceId", "updatedAt");
CREATE INDEX "VideoPlaybackSession_assignmentId_studentId_idx" ON "VideoPlaybackSession"("assignmentId", "studentId");

ALTER TABLE "VideoProgressEvidence" ADD CONSTRAINT "VideoProgressEvidence_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "VideoProgressEvidence" ADD CONSTRAINT "VideoProgressEvidence_stepId_fkey" FOREIGN KEY ("stepId") REFERENCES "LessonStep"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "VideoProgressEvidence" ADD CONSTRAINT "VideoProgressEvidence_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "Assignment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "VideoPlaybackSession" ADD CONSTRAINT "VideoPlaybackSession_evidenceId_fkey" FOREIGN KEY ("evidenceId") REFERENCES "VideoProgressEvidence"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "VideoPlaybackSession" ADD CONSTRAINT "VideoPlaybackSession_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "VideoPlaybackSession" ADD CONSTRAINT "VideoPlaybackSession_stepId_fkey" FOREIGN KEY ("stepId") REFERENCES "LessonStep"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "VideoPlaybackSession" ADD CONSTRAINT "VideoPlaybackSession_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "Assignment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
