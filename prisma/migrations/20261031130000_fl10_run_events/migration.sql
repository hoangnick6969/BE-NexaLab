CREATE TABLE "LabRunEvent" (
  "id" TEXT NOT NULL,
  "runId" TEXT NOT NULL,
  "sequence" INTEGER NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "event" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LabRunEvent_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "LabRunEvent_runId_sequence_key" ON "LabRunEvent"("runId", "sequence");
CREATE UNIQUE INDEX "LabRunEvent_runId_idempotencyKey_key" ON "LabRunEvent"("runId", "idempotencyKey");
ALTER TABLE "LabRunEvent" ADD CONSTRAINT "LabRunEvent_runId_fkey" FOREIGN KEY ("runId") REFERENCES "LabRun"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "LabRunEvent" ENABLE ROW LEVEL SECURITY;

CREATE FUNCTION "prevent_lab_run_event_mutation"() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'LabRun evidence is immutable';
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "LabRunEvent_immutable_update" BEFORE UPDATE OR DELETE ON "LabRunEvent"
  FOR EACH ROW EXECUTE FUNCTION "prevent_lab_run_event_mutation"();
