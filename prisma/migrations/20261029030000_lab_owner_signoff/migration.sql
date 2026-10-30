-- Additive MVP policy. Existing delegated review receipts and release snapshots stay intact.
ALTER TABLE "LabReleaseReview" ADD COLUMN "evidence" JSONB;

ALTER TABLE "LabReleaseReview" DROP CONSTRAINT "LabReleaseReview_kind_check";
ALTER TABLE "LabReleaseReview" ADD CONSTRAINT "LabReleaseReview_kind_check"
  CHECK ("kind" IN ('CURRICULUM', 'SUBJECT', 'MODEL', 'SAFETY', 'RIGHTS', 'RANGE', 'OWNER_SIGNOFF'));

ALTER TABLE "LabReleaseReview" ADD CONSTRAINT "LabReleaseReview_owner_evidence_check"
  CHECK ("kind" <> 'OWNER_SIGNOFF' OR "decision" <> 'APPROVE' OR "evidence" IS NOT NULL);
