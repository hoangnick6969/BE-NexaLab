CREATE TYPE "ClassResourceKind" AS ENUM ('DECK', 'STUDY_QUIZ', 'TEST');
CREATE TYPE "ClassResourceStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

CREATE TABLE "ClassResource" (
    "id" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "kind" "ClassResourceKind" NOT NULL,
    "title" TEXT NOT NULL,
    "lessonId" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "status" "ClassResourceStatus" NOT NULL DEFAULT 'DRAFT',
    "content" JSONB NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "publishedAt" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),
    CONSTRAINT "ClassResource_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ClassResourcePractice" (
    "id" TEXT NOT NULL,
    "resourceId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "state" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ClassResourcePractice_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ClassResource_classId_kind_title_version_key" ON "ClassResource"("classId", "kind", "title", "version");
CREATE INDEX "ClassResource_classId_status_kind_createdAt_idx" ON "ClassResource"("classId", "status", "kind", "createdAt");
CREATE INDEX "ClassResource_lessonId_idx" ON "ClassResource"("lessonId");
CREATE UNIQUE INDEX "ClassResourcePractice_resourceId_studentId_key" ON "ClassResourcePractice"("resourceId", "studentId");
CREATE INDEX "ClassResourcePractice_studentId_updatedAt_idx" ON "ClassResourcePractice"("studentId", "updatedAt");

ALTER TABLE "ClassResource" ADD CONSTRAINT "ClassResource_classId_fkey" FOREIGN KEY ("classId") REFERENCES "Classroom"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ClassResource" ADD CONSTRAINT "ClassResource_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "Lesson"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ClassResourcePractice" ADD CONSTRAINT "ClassResourcePractice_resourceId_fkey" FOREIGN KEY ("resourceId") REFERENCES "ClassResource"("id") ON DELETE CASCADE ON UPDATE CASCADE;
