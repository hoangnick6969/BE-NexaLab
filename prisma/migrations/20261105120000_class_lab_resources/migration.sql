ALTER TYPE "ClassResourceKind" ADD VALUE 'LAB';
ALTER TYPE "ClassResourceKind" ADD VALUE 'DOCUMENT';
ALTER TYPE "ClassResourceKind" ADD VALUE 'REPORT_TEMPLATE';
ALTER TYPE "ClassResourceKind" ADD VALUE 'LINK';
ALTER TABLE "Assignment" ADD COLUMN "classLabSnapshot" JSONB;
ALTER TABLE "LabRun" ADD COLUMN "resourceId" TEXT, ADD COLUMN "classLabSnapshot" JSONB;
CREATE INDEX "LabRun_resourceId_idx" ON "LabRun"("resourceId");
ALTER TABLE "LabRun" ADD CONSTRAINT "LabRun_resourceId_fkey" FOREIGN KEY ("resourceId") REFERENCES "ClassResource"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
