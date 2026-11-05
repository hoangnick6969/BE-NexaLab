-- Legacy objects with no data and no remaining code path (checked on the shared database 2026-11-05):
-- * AssetFile: 0 rows; every file is an Asset + AssetVersion since CF-T2, and no Lesson, LessonStep,
--   Lab, ClassResource or ContentPackVersion references a legacy `asset:<uuid>` URL.
-- * Asset.legacyFileId: 0 non-null values (only set by the one-off CF-T2 import script, now removed).
-- * Classroom.joinCode: Increment A code, not accepted for joining since B1-T3 (joinLocator +
--   joinSecretHash replaced it); only the seed still wrote it.

DROP TABLE IF EXISTS "AssetFile";

DROP INDEX IF EXISTS "Asset_legacyFileId_key";
ALTER TABLE "Asset" DROP COLUMN IF EXISTS "legacyFileId";

DROP INDEX IF EXISTS "Classroom_joinCode_key";
ALTER TABLE "Classroom" DROP COLUMN IF EXISTS "joinCode";
