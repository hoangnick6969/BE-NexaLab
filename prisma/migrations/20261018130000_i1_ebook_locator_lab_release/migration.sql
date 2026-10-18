ALTER TABLE "Lab"
  ADD COLUMN "scope" TEXT NOT NULL DEFAULT 'CLASS_PRIVATE',
  ADD COLUMN "releaseCleared" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "topicCode" TEXT,
  ADD COLUMN "synthetic" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "EbookEdition" (
  "id" TEXT NOT NULL,
  "subjectId" TEXT NOT NULL,
  "url" TEXT NOT NULL,
  "version" TEXT NOT NULL,
  "fallbackPhysicalPage" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EbookEdition_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "EbookEdition_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "EbookEdition_fallbackPhysicalPage_check" CHECK ("fallbackPhysicalPage" > 0),
  CONSTRAINT "EbookEdition_https_check" CHECK ("url" LIKE 'https://%')
);
CREATE UNIQUE INDEX "EbookEdition_subjectId_version_key" ON "EbookEdition"("subjectId", "version");

CREATE TABLE "LessonEbookLocator" (
  "id" TEXT NOT NULL,
  "lessonId" TEXT NOT NULL,
  "editionId" TEXT NOT NULL,
  "printedPageLabel" TEXT,
  "physicalPageIndex" INTEGER NOT NULL,
  "verificationStatus" TEXT NOT NULL DEFAULT 'unverified',
  "provenance" TEXT NOT NULL,
  "sourceMapVersion" TEXT NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "LessonEbookLocator_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "LessonEbookLocator_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "Lesson"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "LessonEbookLocator_editionId_fkey" FOREIGN KEY ("editionId") REFERENCES "EbookEdition"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "LessonEbookLocator_physicalPageIndex_check" CHECK ("physicalPageIndex" > 0)
);
CREATE UNIQUE INDEX "LessonEbookLocator_lessonId_editionId_key" ON "LessonEbookLocator"("lessonId", "editionId");
CREATE INDEX "LessonEbookLocator_editionId_verificationStatus_idx" ON "LessonEbookLocator"("editionId", "verificationStatus");

ALTER TABLE "CurriculumChapter" ADD COLUMN "officialOrder" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "CurriculumTopic" ADD COLUMN "officialOrder" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Lesson"
  ADD COLUMN "curriculumChapterCode" TEXT,
  ADD COLUMN "curriculumTopicCode" TEXT,
  ADD COLUMN "curriculumOrder" INTEGER,
  ADD CONSTRAINT "Lesson_curriculumChapterCode_fkey" FOREIGN KEY ("curriculumChapterCode") REFERENCES "CurriculumChapter"("code") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "Lesson_curriculumTopicCode_fkey" FOREIGN KEY ("curriculumTopicCode") REFERENCES "CurriculumTopic"("code") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "Lesson_curriculumChapterCode_curriculumOrder_idx" ON "Lesson"("curriculumChapterCode", "curriculumOrder");

CREATE TABLE "FoundationalCourseVersion" (
  "id" TEXT NOT NULL,
  "subjectId" TEXT NOT NULL,
  "grade" INTEGER NOT NULL,
  "version" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'draft',
  "sourceVersion" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FoundationalCourseVersion_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "FoundationalCourseVersion_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "FoundationalCourseVersion_subjectId_grade_version_key" ON "FoundationalCourseVersion"("subjectId", "grade", "version");
CREATE INDEX "FoundationalCourseVersion_grade_status_idx" ON "FoundationalCourseVersion"("grade", "status");
CREATE UNIQUE INDEX "FoundationalCourseVersion_one_active_per_subject_grade_idx" ON "FoundationalCourseVersion"("subjectId", "grade") WHERE "status" = 'active';

CREATE TABLE "FoundationalCourseLesson" (
  "courseVersionId" TEXT NOT NULL,
  "lessonId" TEXT NOT NULL,
  "officialOrder" INTEGER NOT NULL,
  "foundationalLabId" TEXT,
  CONSTRAINT "FoundationalCourseLesson_pkey" PRIMARY KEY ("courseVersionId", "lessonId"),
  CONSTRAINT "FoundationalCourseLesson_courseVersionId_fkey" FOREIGN KEY ("courseVersionId") REFERENCES "FoundationalCourseVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "FoundationalCourseLesson_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "Lesson"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "FoundationalCourseLesson_courseVersionId_officialOrder_key" ON "FoundationalCourseLesson"("courseVersionId", "officialOrder");

ALTER TYPE "LessonStepType" ADD VALUE 'BASIC_EXERCISE';
ALTER TABLE "EbookEdition" ADD COLUMN "isCurrent" BOOLEAN NOT NULL DEFAULT false;
CREATE UNIQUE INDEX "EbookEdition_one_current_per_subject_idx" ON "EbookEdition"("subjectId") WHERE "isCurrent" = true;
CREATE TABLE "BasicExerciseAttempt" (
  "id" TEXT NOT NULL,
  "studentId" TEXT NOT NULL,
  "lessonId" TEXT NOT NULL,
  "stepId" TEXT NOT NULL,
  "answers" JSONB NOT NULL,
  "score" INTEGER NOT NULL,
  "passThreshold" INTEGER NOT NULL,
  "passed" BOOLEAN NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BasicExerciseAttempt_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "BasicExerciseAttempt_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "BasicExerciseAttempt_stepId_fkey" FOREIGN KEY ("stepId") REFERENCES "LessonStep"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "BasicExerciseAttempt_score_check" CHECK ("score" BETWEEN 0 AND 100),
  CONSTRAINT "BasicExerciseAttempt_threshold_check" CHECK ("passThreshold" BETWEEN 1 AND 100)
);
CREATE UNIQUE INDEX "BasicExerciseAttempt_studentId_idempotencyKey_key" ON "BasicExerciseAttempt"("studentId", "idempotencyKey");
CREATE INDEX "BasicExerciseAttempt_studentId_lessonId_stepId_createdAt_idx" ON "BasicExerciseAttempt"("studentId", "lessonId", "stepId", "createdAt");
CREATE INDEX "BasicExerciseAttempt_lessonId_stepId_passed_idx" ON "BasicExerciseAttempt"("lessonId", "stepId", "passed");
