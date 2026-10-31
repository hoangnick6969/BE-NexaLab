-- 20261025150000_unify_khtn_content_contract limited Lesson.scope to PRIVATE/CLASS/SHARED_LIBRARY,
-- but the schema default and the API write TEACHER_PRIVATE, so teacher-private lessons failed to insert.
-- Allow TEACHER_PRIVATE alongside the existing values; no data changes.
ALTER TABLE "Lesson" DROP CONSTRAINT IF EXISTS "Lesson_scope_check";
ALTER TABLE "Lesson"
  ADD CONSTRAINT "Lesson_scope_check" CHECK ("scope" IN ('TEACHER_PRIVATE', 'PRIVATE', 'CLASS', 'SHARED_LIBRARY'));
