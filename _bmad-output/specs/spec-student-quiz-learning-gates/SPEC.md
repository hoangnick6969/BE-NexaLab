---
id: SPEC-student-quiz-learning-gates
status: ready-for-implementation
companions:
  - tickets.md
  - ../../planning-artifacts/architecture-spine-nexalab-release-1/ARCHITECTURE-SPINE.md
  - ../../../../nexalab-fe/docs/design/08-STUDENT-P0-UX-DEFINITION.md
sources:
  - ../../../docs/product/prd.md
  - ../spec-student-core-learning-materials/SPEC.md
---

> **Historical accepted contract.** This SPEC and its companions define the original assigned-quiz Epic A3. For amended product behavior, the 2026-10-17 PRD and Open Curriculum spec take precedence. A3 remains the prior accepted baseline; this change has not been decomposed into stories.

> **Open Curriculum precedence (2026-10-17):** A3's server scoring, answer-key privacy, immutable attempts, and retry contract remain applicable to historical assigned quizzes and new explicitly assigned tests. New Class Space study quizzes are unscored practice. There is no public quiz step and no quiz/test pass is a default gate for shared content or either Lab type. Existing A3 tickets capture historical assigned-flow acceptance; new behavior follows the PRD and `spec-open-learning-catalog`.

# Epic A3 — A Student Proves Understanding and Unlocks Practice

## Why

In the historical assigned circuit flow, a quiz can gate explicitly assigned practical work. The current route overwrites aggregate score and returns only a number; A3 must retain each submission, protect answer keys, and make any configured assignment gate a server decision. This rule does not apply to Open Curriculum or create a default Class Space Lab prerequisite.

## Capabilities

- **CAP-1 — Safe quiz delivery:** an applicable student receives published multiple-choice questions without answers; success means inaccessible/draft content and answer keys cannot be obtained through the student contract.
- **CAP-2 — Immutable submission:** the student submits one complete answer set and receives score, pass state, feedback, and reconciled pathway; success means every accepted submission is retained exactly once.
- **CAP-3 — Retry and configured assignment gate:** in the historical assigned circuit flow, a score of at least 50% unlocks that assigned practical step; success means retries preserve history and no client action/URL can bypass the configured server gate. It does not gate released foundational Labs or custom Class Space Labs by default.
- **CAP-4 — Understandable outcome:** the UI explains passed/not-yet-passed without shame, shows evidence by question, and offers one next action.

## Constraints

- Multiple-choice only in Increment A; short-answer UX is deferred despite legacy design wording.
- Quiz answer keys remain server-only. Question IDs, not client indexes alone, identify answers.
- In the historical assigned A2/A3 circuit flow, a required scored quiz becomes available only when required A2 steps are complete. Pass threshold is 50% and has no teacher override in Increment A. Public Open Curriculum has no quiz step; new Class Space study quizzes are unscored, and tests are scored only when explicitly assigned. Neither creates a default Lab prerequisite.
- Accepted submissions are atomic and immutable; an idempotency key prevents duplicate attempts after timeout/retry.
- `Progress` is a projection; `QuizAttempt` and per-question evidence are the source. Best score may drive display, latest attempt drives latest-state copy, and both are labeled.

## Non-goals

- Teacher override, manual grading, question authoring UX, randomized/adaptive testing, leaderboard, competency analytics, or AI explanations.

## Success signal

With real dependencies, a student in the historical assigned circuit flow completes A2, submits a failing quiz, retries, passes at 50% or above, sees the assigned practical step unlock after the server response, and can reload to see both attempts and the same official gate state. Direct practical access before pass is rejected. This is not the Open Curriculum or default Class Space flow.

## Implementation contract

- `QuizAttempt`: `id`, `studentId`, `lessonId`, `stepId`, `assignmentId?`, `answers` JSON using stable question IDs, `correctCount`, `questionCount`, `score`, `passed`, `createdAt`, `idempotencyKey`; unique `(studentId, idempotencyKey)`.
- Questions use stable IDs and validated options/answer; changing a published quiz requires a new content revision or prevents comparison with prior attempts. The accepted attempt stores enough question-version evidence to explain its score later.
- `GET /lessons/:lessonId/quiz` returns sanitized questions only when assignment/path prerequisites are met.
- `POST /lessons/:lessonId/quiz-attempts` accepts `{ answers: [{ questionId, optionId }], idempotencyKey }`; rejects missing/extra/duplicate question IDs atomically; computes on server; returns attempt summary, per-question correct/incorrect status without exposing the answer to unrelated future questions, and reconciled pathway/unlocks.
- Gate authorization is reused by both the pathway response and A4 attempt route. A hidden or disabled frontend control is never sufficient.

Canonical quiz contracts:

```ts
type StudentQuiz = { lessonId: string; stepId: string; questions: Array<{ id: string; prompt: string; options: Array<{ id: string; text: string }> }> };
type QuizAttemptRequest = { answers: Array<{ questionId: string; optionId: string }>; idempotencyKey: string };
type QuizAttemptResponse = {
  attempt: { id: string; score: number; passed: boolean; correctCount: number; questionCount: number; createdAt: string; results: Array<{ questionId: string; correct: boolean }> };
  pathway: PathwayResponse;
};
```

The threshold is server configuration bound to the published quiz at 50 for Increment A. Responses never include `answer`, correct option IDs, or another student's attempt.

