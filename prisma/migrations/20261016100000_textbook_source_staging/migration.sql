CREATE TABLE "TextbookSource" (
  "sourceId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "series" TEXT NOT NULL,
  "publisher" TEXT NOT NULL,
  "publicationYear" INTEGER NOT NULL,
  "reprint" INTEGER,
  "isbn" TEXT,
  "language" TEXT NOT NULL,
  "pdfSha256" TEXT NOT NULL,
  "sourceMapSchema" TEXT NOT NULL,
  "rightsStatus" TEXT NOT NULL DEFAULT 'UNRESOLVED',
  "status" TEXT NOT NULL DEFAULT 'DEVELOPMENT_STAGING',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TextbookSource_pkey" PRIMARY KEY ("sourceId")
);

CREATE TABLE "TextbookSourceChunk" (
  "id" TEXT NOT NULL,
  "sourceId" TEXT NOT NULL,
  "sourceSectionId" TEXT NOT NULL,
  "chapterId" TEXT NOT NULL,
  "chapterTitle" TEXT NOT NULL,
  "grade" INTEGER NOT NULL,
  "lessonNumber" INTEGER NOT NULL,
  "title" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "contentSha256" TEXT NOT NULL,
  "reviewStatus" TEXT NOT NULL DEFAULT 'NEEDS_HUMAN_REVIEW',
  "ocrReviewed" BOOLEAN NOT NULL DEFAULT false,
  "studentFacing" BOOLEAN NOT NULL DEFAULT false,
  "printedPageStart" INTEGER,
  "printedPageEnd" INTEGER,
  "physicalPdfPageStart" INTEGER,
  "physicalPdfPageEnd" INTEGER,
  "sourceTextLineStart" INTEGER,
  "sourceTextLineEnd" INTEGER,
  "locatorEvidence" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TextbookSourceChunk_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TextbookSourceChunk_sourceId_sourceSectionId_key"
  ON "TextbookSourceChunk"("sourceId", "sourceSectionId");
CREATE INDEX "TextbookSource_status_rightsStatus_idx"
  ON "TextbookSource"("status", "rightsStatus");
CREATE INDEX "TextbookSourceChunk_sourceId_chapterId_lessonNumber_idx"
  ON "TextbookSourceChunk"("sourceId", "chapterId", "lessonNumber");
CREATE INDEX "TextbookSourceChunk_reviewStatus_studentFacing_idx"
  ON "TextbookSourceChunk"("reviewStatus", "studentFacing");

ALTER TABLE "TextbookSourceChunk"
  ADD CONSTRAINT "TextbookSourceChunk_sourceId_fkey"
  FOREIGN KEY ("sourceId") REFERENCES "TextbookSource"("sourceId")
  ON DELETE CASCADE ON UPDATE CASCADE;
