INSERT INTO "LessonStep" ("id", "lessonId", "type", "position", "required", "config", "createdAt", "updatedAt")
SELECT 'step-' || l."id" || '-video', l."id", 'VIDEO'::"LessonStepType", 20, true,
       jsonb_build_object(
         'url', video->>'url',
         'title', COALESCE(video->>'title', 'Video bài học'),
         'equivalentText', l."content"
       ), CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Lesson" l
LEFT JOIN LATERAL (
  SELECT item AS video
  FROM jsonb_array_elements(l."materials") AS item
  WHERE item->>'type' = 'video'
  ORDER BY item->>'title', item->>'url'
  LIMIT 1
) videos ON true
WHERE l."status" = 'published'
  AND btrim(l."content") <> ''
  AND NOT EXISTS (
    SELECT 1 FROM "LessonStep" s WHERE s."lessonId" = l."id" AND s."type" = 'VIDEO'
  )
ON CONFLICT DO NOTHING;


INSERT INTO "LessonStep" ("id", "lessonId", "type", "position", "required", "config", "createdAt", "updatedAt")
SELECT 'step-' || l."id" || '-challenge', l."id", 'CHALLENGE'::"LessonStepType", 60, true,
       jsonb_build_object('challengeId', c."id"), CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Lesson" l
JOIN "Challenge" c ON c."id" = l."labId" || '_001'
WHERE l."status" = 'published'
  AND NOT EXISTS (
    SELECT 1 FROM "LessonStep" s WHERE s."lessonId" = l."id" AND s."type" = 'CHALLENGE'
  )
ON CONFLICT DO NOTHING;

