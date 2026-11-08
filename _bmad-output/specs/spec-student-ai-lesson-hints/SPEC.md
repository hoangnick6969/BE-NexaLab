---
id: SPEC-student-ai-lesson-hints
status: review
slice: SAI-03A (lesson quiz questions) + SAI-03-T3 (Open Curriculum basic exercises); B5 textbook Q&A follows
ideas: SAI-03 lesson and quiz hints (roadmap; owner 2026-11-05: "làm tiếp SAI-03")
companions:
  - ../spec-student-ai-checkpoint-hints/SPEC.md
  - ../spec-student-ai-tutor/student-ai-roadmap.md
  - ../../planning-artifacts/increment-sai-student-ai.md
---

# SAI-03A — Rules-Only Hints on Lesson Quiz Questions

## Why

Students get stuck on lesson quiz questions too, and the roadmap allows hints there "using lesson passages and the
question, never the answer key". The lesson's own study steps (reading, study cards, video transcript) already hold
the explanation, so a rule can point the student at the right sentence without any model call (D1 of SAI-01A:
rules-only; SG-2 still gates any provider).

## Capabilities

- **CAP-1 — Answer-blind.** The planner (`lesson-question-hints.ts`, `lesson-hints@1`) receives the prompt, the
  option texts and the lesson's study text only; its input type has no answer field, so the hint is identical
  whichever option is correct (unit test). The student's unsent draft is never sent or read.
- **CAP-2 — Ladder per question.** Level 1 question focus (topic phrases of the prompt), level 2 where to look (the
  study step and the opening words of the most relevant sentence), level 3 that sentence quoted. Asking again climbs
  1 → 2. **Level 3 opens only after a submitted attempt answered this question wrong (BR-06)**; before that a third
  ask repeats level 2 with the other wording and `repeatReason: "NEEDS_ATTEMPT"`; at level 3 it repeats with
  `TOP_LEVEL` (and the next most relevant sentence when there is one).
- **CAP-3 — No key in quoted text.** Every option text in text taken from the lesson is masked as "___" — all
  options alike, so the mask does not tell which is right. An option word inside a two-word phrase the prompt itself
  shows ("quỳ tím") is kept. Sentence relevance is ranked by overlap with the prompt only.
- **CAP-4 — Eligibility.** Student's own assignment pathway, quiz step `IN_PROGRESS` or `COMPLETED`; unknown
  question → `400 QUESTION_NOT_FOUND`; a passed quiz (any attempt) → `409 HINT_NOT_NEEDED`; 60 hints per quiz step
  and assignment → `429 LESSON_HINT_LIMIT`; rate key `lesson-hint:` 30.
- **CAP-5 — Traceable, FR-22.** One `HintLog` per hint with `studentId` + `lessonStepId` (no attempt, no run) and
  `contextSnapshot { kind: "lesson-question-hint", ruleVersion, lessonId, stepId, assignmentId, questionId, level,
  variant, escalated, repeatReason, passage: { stepId, kind, sentence } | null, provider: "rules" }` — no key, no
  draft. Quiz attempts and step progress are unchanged (integration test).

## API

`POST /api/lessons/:lessonId/quiz/hints?assignmentId=` `{ questionId }` → `{ id, questionId, level, maxLevel,
content, escalated, repeatReason, provider: "rules", ruleVersion, createdAt }`.

Migration `20261107120000_hint_log_lesson_step` (expand-only): `HintLog.lessonStepId` (FK, cascade),
`HintLog.studentId` (FK, cascade), indexes, and the target check widened to attempt OR run OR (step AND student).
Lab read paths (progress, SAI-02A, SAI-05) select by attempt or run, so lesson rows do not enter them.

## Student UX

Under the options of the current question: "Gợi ý cho câu này", then "Gợi ý thêm". The hint shows "Mức n/3 ·
Câu hỏi gợi mở | Chỗ cần xem lại | Câu trong bài học"; when level 3 is still locked it says it opens after
submitting with this question still wrong. Note: "Gợi ý không cho đáp án và không trừ điểm." Hidden once passed.

## Non-goals

- Scored TEST assignments (never while open). Basic exercises: see SAI-03-T3 below.
- B5 Q&A on a highlighted textbook passage (free text: needs SG-2 / SAI-04).
- Lesson hints in the parent summary (SAI-05) or teacher insight (SAI-02A).

## SAI-03-T3 — basic exercises (Open Curriculum, 2026-11-08)

The same `lesson-hints@1` planner and ladder on a `BASIC_EXERCISE` step of a released shared lesson (no assignment).

- `POST /api/open-curriculum/lessons/:lessonId/exercises/:stepId/hints` `{ questionId }` (student, strict body) →
  the same response shape as the quiz hint. Same eligibility as submitting the exercise: lesson published,
  `SHARED_LIBRARY`, not synthetic, pack version released → otherwise `404 CURRICULUM_EXERCISE_NOT_FOUND`.
- Unknown question → `400 QUESTION_NOT_FOUND`; any passed attempt of this step → `409 HINT_NOT_NEEDED`; 60 hints per
  step and student → `429 EXERCISE_HINT_LIMIT`; shared rate key `lesson-hint:` 30.
- Level 3 only after a submitted `BasicExerciseAttempt` answered this question wrong (gate reads `correctOptionId`
  only for that check; the planner gets id, prompt and option texts).
- `HintLog` row: `studentId` + `lessonStepId`, snapshot as CAP-5 with `kind: "exercise-question-hint"` and
  `assignmentId: null`. No migration. Attempts and step progress are unchanged (integration test).
- FE: the hint under each question of the lesson's "Bài tập luyện tập" tab (`ExerciseQuestionHint`, same component
  as the quiz); hidden once the step is `COMPLETED`.
- Verification: `exercise-hints.integration.test.ts` (isolated DB) 2/2; BE suite 594 passed; FE
  `exercise-question-hints.spec.ts` 2/2 (mocked API, 390 px, no horizontal scroll).

## Success signal

Fixture Ohm lesson: asking on "Khi điện áp không đổi, tăng điện trở thì dòng điện sẽ?" gives level 1 about
“điện áp”, then 2, then 2 again (`NEEDS_ATTEMPT`); after a not-passed submission with that question wrong, level 3
quotes "…thì cường độ dòng điện ___" with no option word; the attempt and step progress are unchanged.
