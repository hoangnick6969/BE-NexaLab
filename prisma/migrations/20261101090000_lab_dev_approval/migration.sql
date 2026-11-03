-- Developer approval is the active publication gate. Preserve historical review kinds.
ALTER TABLE "LabReleaseReview" DROP CONSTRAINT "LabReleaseReview_kind_check";
ALTER TABLE "LabReleaseReview" ADD CONSTRAINT "LabReleaseReview_kind_check"
  CHECK ("kind" IN ('CURRICULUM', 'SUBJECT', 'MODEL', 'SAFETY', 'RIGHTS', 'RANGE', 'OWNER_SIGNOFF', 'DEV_APPROVAL'));

ALTER TABLE "LabReleaseReview" ADD CONSTRAINT "LabReleaseReview_dev_approval_evidence_check"
  CHECK ("kind" <> 'DEV_APPROVAL' OR "decision" <> 'APPROVE' OR "evidence" IS NOT NULL);
