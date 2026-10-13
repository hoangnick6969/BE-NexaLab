CREATE TABLE "QuizAttempt" (
  "id" TEXT NOT NULL,
  "studentId" TEXT NOT NULL,
  "lessonId" TEXT NOT NULL,
  "stepId" TEXT NOT NULL,
  "assignmentId" TEXT,
  "answers" JSONB NOT NULL,
  "questionSnapshot" JSONB NOT NULL,
  "correctCount" INTEGER NOT NULL,
  "questionCount" INTEGER NOT NULL,
  "score" DOUBLE PRECISION NOT NULL,
  "passed" BOOLEAN NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "QuizAttempt_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "QuizAttempt_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "QuizAttempt_studentId_idempotencyKey_key" ON "QuizAttempt"("studentId", "idempotencyKey");
CREATE INDEX "QuizAttempt_studentId_lessonId_createdAt_idx" ON "QuizAttempt"("studentId", "lessonId", "createdAt");
CREATE INDEX "QuizAttempt_lessonId_stepId_passed_idx" ON "QuizAttempt"("lessonId", "stepId", "passed");

WITH quiz_steps AS (
  SELECT ls."id" AS step_id, q.value AS question, q.ordinality AS question_order,
         'question-' || md5(trim(q.value->>'prompt')) AS base_question_id,
         count(*) OVER (PARTITION BY ls."id", trim(q.value->>'prompt')) AS duplicate_count,
         row_number() OVER (PARTITION BY ls."id", trim(q.value->>'prompt') ORDER BY q.ordinality) - 1 AS duplicate_order
  FROM "LessonStep" ls
  CROSS JOIN LATERAL jsonb_array_elements(ls."config"->'questions') WITH ORDINALITY AS q(value, ordinality)
  WHERE ls."type" = 'QUIZ'
    AND jsonb_typeof(ls."config"->'questions') = 'array'
    AND CASE WHEN jsonb_typeof(ls."config"->'questions') = 'array' THEN jsonb_array_length(ls."config"->'questions') > 0 ELSE false END
    AND NOT (ls."config"->'questions'->0 ? 'id')
), normalized AS (
  SELECT step_id, question_order,
         CASE WHEN duplicate_count > 1 THEN base_question_id || '-' || duplicate_order ELSE base_question_id END AS question_id,
         question->>'prompt' AS prompt,
         (question->>'answer')::integer AS answer_index,
         (
           SELECT jsonb_agg(
             jsonb_build_object(
               'id', 'option-' || md5(
                 (CASE WHEN duplicate_count > 1 THEN base_question_id || '-' || duplicate_order ELSE base_question_id END) || ':' || option_text
               ) || CASE WHEN duplicate_option_order > 1 THEN '-' || (duplicate_option_order - 1) ELSE '' END,
               'text', option_text
             ) ORDER BY option_order
           )
           FROM (
             SELECT trim(option.value) AS option_text, option.ordinality AS option_order,
                    count(*) OVER (PARTITION BY trim(option.value)) AS duplicate_option_count,
                    row_number() OVER (PARTITION BY trim(option.value) ORDER BY option.ordinality) AS duplicate_option_order
             FROM jsonb_array_elements_text(question->'options') WITH ORDINALITY AS option(value, ordinality)
           ) options
         ) AS options
  FROM quiz_steps
), assembled AS (
  SELECT step_id,
         jsonb_agg(
           jsonb_build_object(
             'id', question_id,
             'prompt', prompt,
             'options', options,
             'answerOptionId', options->answer_index->>'id'
           ) ORDER BY question_order
         ) AS questions
  FROM normalized
  GROUP BY step_id
)
UPDATE "LessonStep" ls
SET "config" = jsonb_build_object('questions', assembled.questions)
FROM assembled
WHERE ls."id" = assembled.step_id;
