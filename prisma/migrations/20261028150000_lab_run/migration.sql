CREATE TABLE "LabRun" (
  "id" TEXT NOT NULL,
  "studentId" TEXT NOT NULL,
  "labId" TEXT NOT NULL,
  "challengeId" TEXT NOT NULL,
  "assignmentId" TEXT,
  "context" TEXT NOT NULL,
  "execution" JSONB NOT NULL,
  "executionDigest" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3),
  "revokedAt" TIMESTAMP(3),
  "revokedById" TEXT,
  "revocationReason" TEXT,
  CONSTRAINT "LabRun_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "LabRun_studentId_createdAt_idx" ON "LabRun"("studentId", "createdAt");
CREATE INDEX "LabRun_labId_revokedAt_idx" ON "LabRun"("labId", "revokedAt");
ALTER TABLE "Attempt" ADD COLUMN "labRunId" TEXT;
ALTER TABLE "Attempt" ADD CONSTRAINT "Attempt_labRunId_fkey" FOREIGN KEY ("labRunId") REFERENCES "LabRun"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE FUNCTION "prevent_lab_run_tuple_mutation"() RETURNS trigger AS $$
BEGIN
  IF ROW(NEW."studentId", NEW."labId", NEW."challengeId", NEW."assignmentId", NEW."context", NEW."execution", NEW."executionDigest", NEW."createdAt", NEW."expiresAt")
     IS DISTINCT FROM ROW(OLD."studentId", OLD."labId", OLD."challengeId", OLD."assignmentId", OLD."context", OLD."execution", OLD."executionDigest", OLD."createdAt", OLD."expiresAt") THEN
    RAISE EXCEPTION 'LabRun launch tuple is immutable';
  END IF;
  IF OLD."revokedAt" IS NOT NULL AND ROW(NEW."revokedAt", NEW."revokedById", NEW."revocationReason")
     IS DISTINCT FROM ROW(OLD."revokedAt", OLD."revokedById", OLD."revocationReason") THEN
    RAISE EXCEPTION 'LabRun revocation is irreversible';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "LabRun_immutable" BEFORE UPDATE ON "LabRun"
  FOR EACH ROW EXECUTE FUNCTION "prevent_lab_run_tuple_mutation"();
CREATE TABLE "LabPackRevocation" (
  "packVersionId" TEXT NOT NULL,
  "labId" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "revokedById" TEXT NOT NULL,
  "revokedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LabPackRevocation_pkey" PRIMARY KEY ("packVersionId")
);
CREATE INDEX "LabPackRevocation_labId_idx" ON "LabPackRevocation"("labId");