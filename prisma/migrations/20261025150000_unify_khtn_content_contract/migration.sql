-- Unify the KHTN catalog on Subject.id = 'khtn' while preserving the four
-- curriculum domains on lessons, outcomes and packs. Historical KHTN 8
-- Structured Lessons remain explicitly unclassified until reviewed.

ALTER TABLE "ContentPack" ADD COLUMN "subjectId" TEXT;
ALTER TABLE "ContentPackVersion"
  ADD COLUMN "curriculumChapterCode" TEXT,
  ADD COLUMN "curriculumTopicCode" TEXT,
  ADD COLUMN "curriculumOrder" INTEGER,
  ADD COLUMN "classificationReview" JSONB;

UPDATE "ContentPack" SET "subjectId" = 'khtn' WHERE "grade" IN (8, 9);
ALTER TABLE "ContentPack" ALTER COLUMN "subjectId" SET NOT NULL;
ALTER TABLE "ContentPack"
  ADD CONSTRAINT "ContentPack_subjectId_fkey"
  FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- KHTN is the subject. The narrower rows remain available for other resource
-- types, but no longer partition KHTN lessons or curriculum chapters.
UPDATE "Lesson" SET "subjectId" = 'khtn' WHERE "grade" IN (8, 9);
UPDATE "CurriculumChapter" SET "subjectId" = 'khtn' WHERE "grade" IN (8, 9);

-- The imported KHTN 8 book has no reviewed curriculum crosswalk yet.
UPDATE "ContentPack" AS p
SET "domain" = 'UNCLASSIFIED'
WHERE p."grade" = 8
  AND EXISTS (
    SELECT 1 FROM "ContentPackVersion" AS v
    WHERE v."packKey" = p."key"
      AND v."manifest"->>'kind' = 'structured-lesson-candidate'
  );

UPDATE "Lesson" AS l
SET "domain" = 'UNCLASSIFIED'
WHERE l."grade" = 8
  AND EXISTS (
    SELECT 1 FROM "ContentPackVersion" AS v
    WHERE v."id" = l."packVersionId"
      AND v."manifest"->>'kind' = 'structured-lesson-candidate'
  );

-- Preserve the already released KHTN 9 mapping on its immutable pack version.
UPDATE "ContentPackVersion" AS v
SET "outcomeCodes" = l."outcomeCodes",
    "curriculumChapterCode" = l."curriculumChapterCode",
    "curriculumTopicCode" = l."curriculumTopicCode",
    "curriculumOrder" = l."curriculumOrder",
    "classificationReview" = jsonb_build_object(
      'type', 'legacy-release-backfill',
      'releaseId', v."releaseId",
      'source', 'released Lesson mapping',
      'migratedBy', '20261025150000_unify_khtn_content_contract'
    )
FROM "Lesson" AS l
WHERE l."packVersionId" = v."id"
  AND l."grade" = 9
  AND l."curriculumChapterCode" IS NOT NULL
  AND l."curriculumTopicCode" IS NOT NULL
  AND jsonb_array_length(l."outcomeCodes") > 0;

-- A topic owns the union of active outcomes used by its mapped, real KHTN 9
-- lessons. This repairs relationships but does not fabricate sourceEvidence.
WITH topic_outcomes AS (
  SELECT l."curriculumTopicCode" AS topic_code,
         jsonb_agg(DISTINCT outcome.code ORDER BY outcome.code) AS codes
  FROM "Lesson" AS l
  CROSS JOIN LATERAL jsonb_array_elements_text(l."outcomeCodes") AS outcome(code)
  JOIN "CurriculumOutcome" AS co
    ON co."code" = outcome.code
   AND co."grade" = l."grade"
   AND co."domain" = l."domain"
   AND co."status" = 'active'
   AND co."synthetic" = false
  WHERE l."subjectId" = 'khtn'
    AND l."grade" = 9
    AND l."synthetic" = false
    AND l."curriculumTopicCode" IS NOT NULL
  GROUP BY l."curriculumTopicCode"
)
UPDATE "CurriculumTopic" AS t
SET "outcomeCodes" = topic_outcomes.codes
FROM topic_outcomes
WHERE t."code" = topic_outcomes.topic_code;

-- Remove only the known empty pilot chapter. The guards protect any chapter
-- which acquired a real topic or lesson after the audit.
DELETE FROM "CurriculumChapter" AS c
WHERE c."code" = 'khtn9-physics-energy'
  AND NOT EXISTS (SELECT 1 FROM "CurriculumTopic" t WHERE t."chapterCode" = c."code")
  AND NOT EXISTS (SELECT 1 FROM "Lesson" l WHERE l."curriculumChapterCode" = c."code");

CREATE INDEX "ContentPack_subjectId_grade_idx" ON "ContentPack"("subjectId", "grade");
CREATE INDEX "ContentPackVersion_curriculum_mapping_idx" ON "ContentPackVersion"("curriculumChapterCode", "curriculumTopicCode", "curriculumOrder");
CREATE INDEX "Lesson_subjectId_idx" ON "Lesson"("subjectId");
CREATE INDEX "Lesson_curriculumTopicCode_idx" ON "Lesson"("curriculumTopicCode");
CREATE INDEX "AssignmentSubmission_deadlineRevisionId_idx" ON "AssignmentSubmission"("deadlineRevisionId");
CREATE INDEX "Challenge_labId_idx" ON "Challenge"("labId");
CREATE INDEX "Lab_subjectId_idx" ON "Lab"("subjectId");
CREATE INDEX "LateDecision_deadlineRevisionId_idx" ON "LateDecision"("deadlineRevisionId");
CREATE INDEX "SavedExperiment_studentId_idx" ON "SavedExperiment"("studentId");
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

ALTER TABLE "ContentPack"
  ADD CONSTRAINT "ContentPack_grade_check" CHECK ("grade" BETWEEN 8 AND 9),
  ADD CONSTRAINT "ContentPack_domain_check" CHECK ("domain" IN ('ENERGY', 'MATTER', 'LIVING', 'EARTH_SKY', 'UNCLASSIFIED')),
  ADD CONSTRAINT "ContentPack_namespace_check" CHECK ("namespace" IN ('fixture', 'baseline'));

ALTER TABLE "ContentPackVersion"
  ADD CONSTRAINT "ContentPackVersion_status_check" CHECK ("status" IN ('draft', 'released', 'retired')),
  ADD CONSTRAINT "ContentPackVersion_curriculum_order_check" CHECK ("curriculumOrder" IS NULL OR "curriculumOrder" > 0);

ALTER TABLE "ContentRelease"
  ADD CONSTRAINT "ContentRelease_status_check" CHECK ("status" IN ('APPLIED', 'RETIRED'));

ALTER TABLE "CurriculumChapter"
  ADD CONSTRAINT "CurriculumChapter_grade_check" CHECK ("grade" BETWEEN 8 AND 9),
  ADD CONSTRAINT "CurriculumChapter_status_check" CHECK ("status" IN ('active', 'archived'));

ALTER TABLE "CurriculumOutcome"
  ADD CONSTRAINT "CurriculumOutcome_grade_check" CHECK ("grade" BETWEEN 8 AND 9),
  ADD CONSTRAINT "CurriculumOutcome_domain_check" CHECK ("domain" IN ('ENERGY', 'MATTER', 'LIVING', 'EARTH_SKY')),
  ADD CONSTRAINT "CurriculumOutcome_status_check" CHECK ("status" IN ('active', 'archived'));

ALTER TABLE "CurriculumTopic"
  ADD CONSTRAINT "CurriculumTopic_status_check" CHECK ("status" IN ('active', 'archived'));

ALTER TABLE "Lesson"
  ADD CONSTRAINT "Lesson_grade_check" CHECK ("grade" BETWEEN 1 AND 12),
  ADD CONSTRAINT "Lesson_domain_check" CHECK ("domain" IS NULL OR "domain" IN ('ENERGY', 'MATTER', 'LIVING', 'EARTH_SKY', 'UNCLASSIFIED')),
  ADD CONSTRAINT "Lesson_status_check" CHECK ("status" IN ('draft', 'published', 'archived', 'quarantined')),
  ADD CONSTRAINT "Lesson_scope_check" CHECK ("scope" IN ('PRIVATE', 'CLASS', 'SHARED_LIBRARY'));
