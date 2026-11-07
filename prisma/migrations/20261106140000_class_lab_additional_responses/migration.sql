CREATE TABLE "ClassLabAdditionalResponse" (
    "id" TEXT NOT NULL,
    "resourceId" TEXT NOT NULL,
    "assignmentId" TEXT,
    "studentId" TEXT NOT NULL,
    "resourceVersion" INTEGER NOT NULL,
    "promptSnapshot" JSONB NOT NULL,
    "answers" JSONB NOT NULL,
    "attempt" INTEGER NOT NULL,
    "idempotencyKey" TEXT,
    "score" INTEGER,
    "feedback" TEXT,
    "gradedById" TEXT,
    "gradedAt" TIMESTAMP(3),
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ClassLabAdditionalResponse_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ClassLabAdditionalResponse_score_range" CHECK ("score" IS NULL OR ("score" >= 0 AND "score" <= 100))
);

CREATE INDEX "ClassLabAdditionalResponse_resourceId_assignmentId_submittedAt_idx"
    ON "ClassLabAdditionalResponse"("resourceId", "assignmentId", "submittedAt");
CREATE INDEX "ClassLabAdditionalResponse_studentId_submittedAt_idx"
    ON "ClassLabAdditionalResponse"("studentId", "submittedAt");
CREATE INDEX "ClassLabAdditionalResponse_studentId_idempotencyKey_idx"
    ON "ClassLabAdditionalResponse"("studentId", "idempotencyKey");
CREATE INDEX "ClassLabAdditionalResponse_attempt_lookup_idx"
    ON "ClassLabAdditionalResponse"("resourceId", "assignmentId", "studentId", "attempt");

ALTER TABLE "ClassLabAdditionalResponse"
    ADD CONSTRAINT "ClassLabAdditionalResponse_resourceId_fkey"
    FOREIGN KEY ("resourceId") REFERENCES "ClassResource"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ClassLabAdditionalResponse"
    ADD CONSTRAINT "ClassLabAdditionalResponse_assignmentId_fkey"
    FOREIGN KEY ("assignmentId") REFERENCES "Assignment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ClassLabAdditionalResponse"
    ADD CONSTRAINT "ClassLabAdditionalResponse_studentId_fkey"
    FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE FUNCTION "preserve_class_lab_additional_response"() RETURNS trigger AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'Class Lab response history is immutable';
    END IF;
    IF ROW(NEW."resourceId", NEW."assignmentId", NEW."studentId", NEW."resourceVersion", NEW."promptSnapshot", NEW.answers, NEW.attempt, NEW."idempotencyKey", NEW."submittedAt")
       IS DISTINCT FROM
       ROW(OLD."resourceId", OLD."assignmentId", OLD."studentId", OLD."resourceVersion", OLD."promptSnapshot", OLD.answers, OLD.attempt, OLD."idempotencyKey", OLD."submittedAt") THEN
        RAISE EXCEPTION 'Class Lab submitted answers are immutable';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = pg_catalog;

CREATE TRIGGER "ClassLabAdditionalResponse_history_immutable"
    BEFORE UPDATE OR DELETE ON "ClassLabAdditionalResponse"
    FOR EACH ROW EXECUTE FUNCTION "preserve_class_lab_additional_response"();

-- This table is in Supabase's exposed public schema. Only the NestJS server
-- should access it; no direct PostgREST/anon/authenticated policies are needed.
ALTER TABLE "ClassLabAdditionalResponse" ENABLE ROW LEVEL SECURITY;
