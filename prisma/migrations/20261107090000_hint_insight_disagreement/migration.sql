-- SAI-02A: teacher disagreement with a misconception hypothesis (UC-AI-07). Additive only.
-- CreateTable
CREATE TABLE "HintInsightDisagreement" (
    "id" TEXT NOT NULL,
    "assignmentId" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "rubricRef" TEXT NOT NULL,
    "criterion" TEXT NOT NULL,
    "misconception" TEXT NOT NULL,
    "ruleVersion" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HintInsightDisagreement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "HintInsightDisagreement_teacherId_idx" ON "HintInsightDisagreement"("teacherId");

-- CreateIndex
CREATE UNIQUE INDEX "HintInsightDisagreement_assignmentId_rubricRef_criterion_mi_key" ON "HintInsightDisagreement"("assignmentId", "rubricRef", "criterion", "misconception");

-- AddForeignKey
ALTER TABLE "HintInsightDisagreement" ADD CONSTRAINT "HintInsightDisagreement_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "Assignment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

