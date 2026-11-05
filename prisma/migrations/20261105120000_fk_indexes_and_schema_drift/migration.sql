-- Additive only: no table, column or data is removed.
--
-- 1. StepProgress(studentId, stepId) is declared in schema.prisma but was never created.
-- 2. Foreign keys without a leading index. Lookups by these columns (Attempt.labRunId on lab submit)
--    and cascade/restrict checks when a LessonStep, Challenge, LabRun, Lesson or Subject is deleted
--    scan the whole child table without them.
--
-- The indexes created by earlier migrations but missing from schema.prisma (Session.userId,
-- Lab.subjectId, Challenge.labId, StepProgress.stepId, Lesson.*, ...) are now declared there, so a
-- future `migrate dev` no longer proposes to drop them. Columns, indexes and tables of the
-- unmerged p2-vid branch (Lesson.sections/videos/sgkReference, ContentPack.subjectId,
-- ContentPackVersion curriculum columns, Video* tables) hold data or belong to that branch and are
-- intentionally left as they are.

CREATE INDEX IF NOT EXISTS "StepProgress_studentId_stepId_idx" ON "StepProgress"("studentId", "stepId");
CREATE INDEX IF NOT EXISTS "Attempt_labRunId_idx" ON "Attempt"("labRunId");
CREATE INDEX IF NOT EXISTS "Attempt_challengeId_idx" ON "Attempt"("challengeId");
CREATE INDEX IF NOT EXISTS "TeacherGateOverride_stepId_idx" ON "TeacherGateOverride"("stepId");
CREATE INDEX IF NOT EXISTS "BasicExerciseAttempt_stepId_idx" ON "BasicExerciseAttempt"("stepId");
CREATE INDEX IF NOT EXISTS "FoundationalCourseLesson_lessonId_idx" ON "FoundationalCourseLesson"("lessonId");
CREATE INDEX IF NOT EXISTS "EbookAnnotation_subjectId_idx" ON "EbookAnnotation"("subjectId");
