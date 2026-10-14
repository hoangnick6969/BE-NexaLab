-- A5: stable newest-first activity pagination by (createdAt, id)
CREATE INDEX IF NOT EXISTS "QuizAttempt_studentId_createdAt_id_idx" ON "QuizAttempt"("studentId", "createdAt", "id");

CREATE INDEX IF NOT EXISTS "Attempt_studentId_createdAt_id_idx" ON "Attempt"("studentId", "createdAt", "id");
