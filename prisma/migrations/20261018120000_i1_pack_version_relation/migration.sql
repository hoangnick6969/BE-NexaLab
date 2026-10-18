ALTER TABLE "Lesson"
ADD CONSTRAINT "Lesson_packVersionId_fkey"
FOREIGN KEY ("packVersionId") REFERENCES "ContentPackVersion"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "Lesson_packVersionId_idx" ON "Lesson"("packVersionId");
