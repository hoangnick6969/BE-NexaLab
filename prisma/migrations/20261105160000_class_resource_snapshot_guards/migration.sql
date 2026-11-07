CREATE FUNCTION "prevent_class_lab_snapshot_mutation"() RETURNS trigger AS $$
BEGIN
  IF NEW."classLabSnapshot" IS DISTINCT FROM OLD."classLabSnapshot" THEN
    RAISE EXCEPTION 'Class Lab pedagogical snapshot is immutable';
  END IF;
  IF TG_TABLE_NAME = 'LabRun' THEN
    IF NEW."resourceId" IS DISTINCT FROM OLD."resourceId" THEN
      RAISE EXCEPTION 'Class Lab run resource is immutable';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "Assignment_class_lab_snapshot_immutable" BEFORE UPDATE ON "Assignment"
  FOR EACH ROW EXECUTE FUNCTION "prevent_class_lab_snapshot_mutation"();
CREATE TRIGGER "LabRun_class_lab_snapshot_immutable" BEFORE UPDATE ON "LabRun"
  FOR EACH ROW EXECUTE FUNCTION "prevent_class_lab_snapshot_mutation"();

CREATE FUNCTION "prevent_published_class_resource_mutation"() RETURNS trigger AS $$
BEGIN
  IF OLD.status <> 'DRAFT' AND
     ROW(NEW."classId", NEW.kind, NEW.title, NEW."lessonId", NEW.version, NEW.content, NEW."createdById")
     IS DISTINCT FROM ROW(OLD."classId", OLD.kind, OLD.title, OLD."lessonId", OLD.version, OLD.content, OLD."createdById") THEN
    RAISE EXCEPTION 'Published class resource version is immutable';
  END IF;
  IF OLD.status = 'ARCHIVED' AND NEW.status <> 'ARCHIVED' THEN
    RAISE EXCEPTION 'Class resource archival is irreversible';
  END IF;
  IF OLD.status = 'PUBLISHED' AND NEW.status = 'DRAFT' THEN
    RAISE EXCEPTION 'Published class resource cannot return to draft';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "ClassResource_published_immutable" BEFORE UPDATE ON "ClassResource"
  FOR EACH ROW EXECUTE FUNCTION "prevent_published_class_resource_mutation"();
