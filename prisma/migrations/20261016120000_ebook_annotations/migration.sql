CREATE TYPE "EbookAnnotationKind" AS ENUM ('HIGHLIGHT', 'UNDERLINE', 'NOTE');

CREATE TABLE "EbookAnnotation" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "documentFingerprint" TEXT NOT NULL,
    "pageNumber" INTEGER NOT NULL,
    "kind" "EbookAnnotationKind" NOT NULL,
    "startOffset" INTEGER NOT NULL,
    "endOffset" INTEGER NOT NULL,
    "selectedText" TEXT NOT NULL,
    "prefix" TEXT,
    "suffix" TEXT,
    "noteText" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EbookAnnotation_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ebook_annotation_owner_version_idx"
ON "EbookAnnotation"("userId", "subjectId", "documentFingerprint", "createdAt");

ALTER TABLE "EbookAnnotation"
ADD CONSTRAINT "EbookAnnotation_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "EbookAnnotation"
ADD CONSTRAINT "EbookAnnotation_subjectId_fkey"
FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE CASCADE ON UPDATE CASCADE;
