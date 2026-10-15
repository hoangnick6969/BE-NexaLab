-- B1-T4/T5: library taxonomy, teacher challenge variants, named release
-- reviews, and the immutable content version used by the duplicate rule.
-- Expand-only; every new column is nullable or defaulted.

-- AlterTable
ALTER TABLE "Lesson" ADD COLUMN     "challengeParams" JSONB,
ADD COLUMN     "domain" TEXT,
ADD COLUMN     "outcomeCodes" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "releaseReview" JSONB;

-- AlterTable
ALTER TABLE "Assignment" ADD COLUMN     "contentVersion" TEXT;

-- CreateTable
CREATE TABLE "CurriculumOutcome" (
    "code" TEXT NOT NULL,
    "grade" INTEGER NOT NULL,
    "domain" TEXT NOT NULL,
    "chapter" TEXT NOT NULL,
    "statement" TEXT NOT NULL,
    "synthetic" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CurriculumOutcome_pkey" PRIMARY KEY ("code")
);

-- CreateIndex
CREATE INDEX "CurriculumOutcome_grade_domain_idx" ON "CurriculumOutcome"("grade", "domain");
