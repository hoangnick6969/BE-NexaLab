CREATE TYPE "LessonStepType" AS ENUM ('READING', 'VIDEO', 'STUDY_CARDS', 'QUIZ', 'LAB', 'CHALLENGE');
CREATE TYPE "StepProgressStatus" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'COMPLETED');

CREATE TABLE "LessonStep" (
    "id" TEXT NOT NULL,
    "lessonId" TEXT NOT NULL,
    "type" "LessonStepType" NOT NULL,
    "position" INTEGER NOT NULL,
    "required" BOOLEAN NOT NULL DEFAULT true,
    "config" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "LessonStep_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "StepProgress" (
    "studentId" TEXT NOT NULL,
    "stepId" TEXT NOT NULL,
    "status" "StepProgressStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "progressValue" INTEGER NOT NULL DEFAULT 0,
    "lastPosition" INTEGER,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "StepProgress_pkey" PRIMARY KEY ("studentId", "stepId")
);

CREATE UNIQUE INDEX "LessonStep_lessonId_position_key" ON "LessonStep"("lessonId", "position");
CREATE INDEX "LessonStep_lessonId_type_idx" ON "LessonStep"("lessonId", "type");
CREATE INDEX "StepProgress_stepId_idx" ON "StepProgress"("stepId");
ALTER TABLE "StepProgress" ADD CONSTRAINT "StepProgress_progressValue_check"
  CHECK ("progressValue" >= 0 AND "progressValue" <= 100);
ALTER TABLE "StepProgress" ADD CONSTRAINT "StepProgress_lastPosition_check"
  CHECK ("lastPosition" IS NULL OR "lastPosition" >= 0);

ALTER TABLE "LessonStep" ADD CONSTRAINT "LessonStep_lessonId_fkey"
  FOREIGN KEY ("lessonId") REFERENCES "Lesson"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StepProgress" ADD CONSTRAINT "StepProgress_studentId_fkey"
  FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StepProgress" ADD CONSTRAINT "StepProgress_stepId_fkey"
  FOREIGN KEY ("stepId") REFERENCES "LessonStep"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "LessonStep" ("id", "lessonId", "type", "position", "required", "config", "createdAt", "updatedAt")
SELECT 'step-' || "id" || '-reading', "id", 'READING'::"LessonStepType", 10, true,
       jsonb_build_object('html', "content"), CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Lesson"
WHERE "status" = 'published' AND btrim("content") <> '';

INSERT INTO "LessonStep" ("id", "lessonId", "type", "position", "required", "config", "createdAt", "updatedAt")
SELECT 'step-' || "id" || '-video', "id", 'VIDEO'::"LessonStepType", 20, true,
       jsonb_build_object(
         'url', video->>'url',
         'title', COALESCE(video->>'title', 'Video bài học'),
         'equivalentText', "content"
       ), CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Lesson"
CROSS JOIN LATERAL (
  SELECT item AS video
  FROM jsonb_array_elements("materials") AS item
  WHERE item->>'type' = 'video'
  ORDER BY item->>'title', item->>'url'
  LIMIT 1
) AS videos
WHERE "status" = 'published' AND btrim("content") <> '';

INSERT INTO "LessonStep" ("id", "lessonId", "type", "position", "required", "config", "createdAt", "updatedAt")
SELECT 'step-' || "id" || '-cards', "id", 'STUDY_CARDS'::"LessonStepType", 30, true,
       jsonb_build_object('cards', jsonb_build_array(
         jsonb_build_object('id', "id" || '-objective', 'front', 'Mục tiêu bài học', 'back', "learningObjective"),
         jsonb_build_object('id', "id" || '-key-idea', 'front', 'Ý chính cần nhớ', 'back', "content")
       )), CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Lesson"
WHERE "status" = 'published' AND btrim("content") <> '';

INSERT INTO "LessonStep" ("id", "lessonId", "type", "position", "required", "config", "createdAt", "updatedAt")
SELECT 'step-' || "id" || '-quiz', "id", 'QUIZ'::"LessonStepType", 40, true,
       jsonb_build_object('questions', "questions"), CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Lesson"
WHERE "status" = 'published' AND jsonb_array_length("questions") > 0;

INSERT INTO "LessonStep" ("id", "lessonId", "type", "position", "required", "config", "createdAt", "updatedAt")
SELECT 'step-' || "id" || '-lab', "id", 'LAB'::"LessonStepType", 50, true,
       jsonb_build_object('labId', "labId"), CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Lesson"
WHERE "status" = 'published' AND "labId" IS NOT NULL;

