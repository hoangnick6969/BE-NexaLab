-- Release authority is available only through the server. Preserve owner/service access.
ALTER TABLE "LabRelease" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "LabReviewerAuthorization" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "LabReleaseReview" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "LabRelease", "LabReviewerAuthorization", "LabReleaseReview" FROM PUBLIC;
DO $$
DECLARE role_name text;
BEGIN
  FOREACH role_name IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
      EXECUTE format('REVOKE ALL ON TABLE "LabRelease", "LabReviewerAuthorization", "LabReleaseReview" FROM %I', role_name);
    END IF;
  END LOOP;
END $$;
-- Deliberately no client policies. NestJS must use the table owner or its existing trusted BYPASSRLS role.
