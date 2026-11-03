ALTER TABLE "EbookEdition"
ADD COLUMN "coverAssetVersionId" TEXT;

CREATE INDEX "EbookEdition_coverAssetVersionId_idx"
ON "EbookEdition"("coverAssetVersionId");

ALTER TABLE "EbookEdition"
ADD CONSTRAINT "EbookEdition_coverAssetVersionId_fkey"
FOREIGN KEY ("coverAssetVersionId") REFERENCES "AssetVersion"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
