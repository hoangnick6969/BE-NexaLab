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

> **Canonical contract.** This SPEC and its companions define Epic A3. Implement after A2 runtime acceptance.

# Epic A3 — A Student Proves Understanding and Unlocks Practice

## Why

The quiz is the explicit learning gate between core materials and practical work. The current route overwrites aggregate score and returns only a number; A3 must retain each submission, protect answer keys, and make unlock state a server decision.

## Capabilities

- **CAP-1 — Safe quiz delivery:** an applicable student receives published multiple-choice questions without answers; success means inaccessible/draft content and answer keys cannot be obtained through the student contract.
- **CAP-2 — Immutable submission:** the student submits one complete answer set and receives score, pass state, feedback, and reconciled pathway; success means every accepted submission is retained exactly once.
- **CAP-3 — Retry and gate:** a score of at least 50% unlocks the circuit practical step; success means retries preserve history and no client action/URL can bypass the server gate.
- **CAP-4 — Understandable outcome:** the UI explains passed/not-yet-passed without shame, shows evidence by question, and offers one next action.

## Constraints

- Multiple-choice only in Increment A; short-answer UX is deferred despite legacy design wording.
- Quiz answer keys remain server-only. Question IDs, not client indexes alone, identify answers.
- A required quiz becomes available only when required A2 steps are complete. Pass threshold is 50% and has no teacher override in Increment A.
- Accepted submissions are atomic and immutable; an idempotency key prevents duplicate attempts after timeout/retry.
- `Progress` is a projection; `QuizAttempt` and per-question evidence are the source. Best score may drive display, latest attempt drives latest-state copy, and both are labeled.

## Non-goals

- Teacher override, manual grading, question authoring UX, randomized/adaptive testing, leaderboard, competency analytics, or AI explanations.

## Success signal

With real dependencies, the A2-complete student submits a failing quiz, retries, passes at 50% or above, sees the practical step unlock after the server response, and can reload to see both attempts and the same official gate state. Direct practical access before pass is rejected.

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

