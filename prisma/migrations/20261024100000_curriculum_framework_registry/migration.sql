CREATE TABLE "CurriculumFramework" (
    "id" TEXT NOT NULL,
    "frameworkKey" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "sourceMetadata" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CurriculumFramework_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CurriculumFramework_title_version_idx" ON "CurriculumFramework"("title", "version");
CREATE UNIQUE INDEX "CurriculumFramework_frameworkKey_version_key" ON "CurriculumFramework"("frameworkKey", "version");

CREATE TABLE "CurriculumFrameworkSubject" (
    "frameworkId" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "grade" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CurriculumFrameworkSubject_pkey" PRIMARY KEY ("frameworkId", "subjectId", "grade"),
    CONSTRAINT "CurriculumFrameworkSubject_frameworkId_fkey" FOREIGN KEY ("frameworkId") REFERENCES "CurriculumFramework"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "CurriculumFrameworkSubject_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "CurriculumFrameworkSubject_grade_check" CHECK ("grade" BETWEEN 1 AND 12)
);

CREATE INDEX "CurriculumFrameworkSubject_subjectId_grade_idx" ON "CurriculumFrameworkSubject"("subjectId", "grade");
