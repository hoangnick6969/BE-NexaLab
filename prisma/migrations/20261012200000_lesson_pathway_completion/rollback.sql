DELETE FROM "LessonStep" s
USING "Lesson" l
WHERE s."lessonId" = l."id"
  AND s."id" = 'step-' || l."id" || '-challenge'
  AND s."type" = 'CHALLENGE';

DELETE FROM "LessonStep" s
USING "Lesson" l
WHERE s."lessonId" = l."id"
  AND s."id" = 'step-' || l."id" || '-video'
  AND s."type" = 'VIDEO';


