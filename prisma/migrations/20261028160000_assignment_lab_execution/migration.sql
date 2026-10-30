ALTER TABLE "Assignment"
  ADD COLUMN "labExecution" JSONB,
  ADD COLUMN "labExecutionDigest" TEXT;

ALTER TABLE "Assignment" ADD CONSTRAINT "Assignment_lab_execution_pair"
  CHECK (("labExecution" IS NULL AND "labExecutionDigest" IS NULL)
      OR ("labExecution" IS NOT NULL AND "labExecutionDigest" IS NOT NULL));

CREATE FUNCTION "prevent_assignment_lab_execution_mutation"() RETURNS trigger AS $$
BEGIN
  IF ROW(NEW."labExecution", NEW."labExecutionDigest")
     IS DISTINCT FROM ROW(OLD."labExecution", OLD."labExecutionDigest") THEN
    RAISE EXCEPTION 'Assignment Lab execution snapshot is immutable';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "Assignment_lab_execution_immutable" BEFORE UPDATE ON "Assignment"
  FOR EACH ROW EXECUTE FUNCTION "prevent_assignment_lab_execution_mutation"();