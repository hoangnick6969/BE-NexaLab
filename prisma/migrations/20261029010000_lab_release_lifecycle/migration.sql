CREATE TABLE "LabRelease" (
  "id" TEXT NOT NULL,
  "labId" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "digest" TEXT NOT NULL,
  "snapshot" JSONB NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "reason" TEXT NOT NULL,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "activatedAt" TIMESTAMP(3),
  "quarantinedAt" TIMESTAMP(3),
  CONSTRAINT "LabRelease_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "LabRelease_labId_fkey" FOREIGN KEY ("labId") REFERENCES "Lab"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "LabRelease_version_check" CHECK ("version" > 0),
  CONSTRAINT "LabRelease_status_check" CHECK ("status" IN ('DRAFT', 'CHANGES_REQUESTED', 'APPROVED', 'ACTIVE', 'SUPERSEDED', 'QUARANTINED'))
);
CREATE UNIQUE INDEX "LabRelease_labId_version_key" ON "LabRelease"("labId", "version");
CREATE UNIQUE INDEX "LabRelease_labId_digest_key" ON "LabRelease"("labId", "digest");
CREATE INDEX "LabRelease_labId_status_idx" ON "LabRelease"("labId", "status");
CREATE UNIQUE INDEX "LabRelease_one_active_per_lab_idx" ON "LabRelease"("labId") WHERE "status" = 'ACTIVE';

CREATE TABLE "LabReviewerAuthorization" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "subjectId" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "authorizedById" TEXT NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LabReviewerAuthorization_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "LabReviewerAuthorization_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "LabReviewerAuthorization_kind_check" CHECK ("kind" IN ('CURRICULUM', 'SUBJECT', 'MODEL', 'SAFETY', 'RIGHTS', 'RANGE'))
);
CREATE UNIQUE INDEX "LabReviewerAuthorization_userId_subjectId_kind_key" ON "LabReviewerAuthorization"("userId", "subjectId", "kind");
CREATE INDEX "LabReviewerAuthorization_subjectId_kind_active_idx" ON "LabReviewerAuthorization"("subjectId", "kind", "active");

CREATE TABLE "LabReleaseReview" (
  "id" TEXT NOT NULL,
  "releaseId" TEXT NOT NULL,
  "reviewerId" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "decision" TEXT NOT NULL,
  "releaseDigest" TEXT NOT NULL,
  "note" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LabReleaseReview_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "LabReleaseReview_releaseId_fkey" FOREIGN KEY ("releaseId") REFERENCES "LabRelease"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "LabReleaseReview_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "LabReleaseReview_kind_check" CHECK ("kind" IN ('CURRICULUM', 'SUBJECT', 'MODEL', 'SAFETY', 'RIGHTS', 'RANGE')),
  CONSTRAINT "LabReleaseReview_decision_check" CHECK ("decision" IN ('APPROVE', 'REQUEST_CHANGES'))
);
CREATE UNIQUE INDEX "LabReleaseReview_releaseId_kind_key" ON "LabReleaseReview"("releaseId", "kind");
CREATE INDEX "LabReleaseReview_reviewerId_createdAt_idx" ON "LabReleaseReview"("reviewerId", "createdAt");

CREATE FUNCTION "guard_lab_release_snapshot_immutable"() RETURNS trigger AS $$
BEGIN
  IF ROW(NEW."labId", NEW."version", NEW."digest", NEW."snapshot", NEW."reason", NEW."createdById", NEW."createdAt")
     IS DISTINCT FROM
     ROW(OLD."labId", OLD."version", OLD."digest", OLD."snapshot", OLD."reason", OLD."createdById", OLD."createdAt") THEN
    RAISE EXCEPTION 'Lab release content and digest are immutable';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "LabRelease_immutable_snapshot"
  BEFORE UPDATE ON "LabRelease"
  FOR EACH ROW EXECUTE FUNCTION "guard_lab_release_snapshot_immutable"();

CREATE FUNCTION "guard_lab_release_review_immutable"() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Lab release reviews are append-only';
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "LabReleaseReview_immutable"
  BEFORE UPDATE OR DELETE ON "LabReleaseReview"
  FOR EACH ROW EXECUTE FUNCTION "guard_lab_release_review_immutable"();
