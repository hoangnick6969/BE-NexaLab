# Epic 3 Context: A student proves understanding and unlocks practice

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Let a student demonstrate understanding through a scored, retryable quiz and use the server-confirmed result to unlock practical work. Preserve trustworthy evidence for every accepted submission, protect quiz answers, and make the next step and its prerequisite clear throughout the learning pathway.

## Stories

- Story A3-T1: Deliver a gate-protected sanitized quiz
- Story A3-T2: Record and score one immutable quiz attempt
- Story A3-T3: Retry until the practical step unlocks
- Story A3-T4: Verify quiz contract, privacy, and performance

## Requirements & Constraints

- Increment A quizzes are multiple-choice only. Short-answer grading, teacher overrides, question authoring, adaptive/randomized tests, leaderboards, analytics, and AI explanations are out of scope.
- Students receive only published questions applicable to their assignment and pathway. A required quiz is available only after required reading, video, and study-card steps are complete. Keep answer keys and correct option IDs server-side.
- Accept one complete answer set keyed by stable question and option IDs. Reject missing, extra, or duplicate question IDs atomically. The server calculates score and pass state; 50% passes, with no client-side bypass or override.
- Preserve each accepted submission as immutable evidence. Same student and idempotency key must resolve to the original result; reusing that key with a different payload conflicts. Retain question-version evidence sufficient to explain historical results.
- A pass unlocks the configured practical step. A failure leaves the quiz as the current step and permits retry. Keep best score and latest attempt semantics distinct and traceable. Progress is a rebuildable projection; quiz attempts and question evidence are authoritative.
- Every displayed score, count, or status must lead to its source evidence. Official progress and unlock state come from authorized backend operations, never client-derived state. Use stable error envelopes and update backend contracts and frontend consumers together.
- Report source, automated, real-dependency runtime, and production verification separately. Integration claims require the actual database, seeded API, frontend, and browser dependencies.

## Technical Decisions

- Backend is authoritative for assignment applicability, quiz delivery, scoring, persistence, step completion, and gates. Validate request bodies with Zod; derive student identity from the authenticated session, not client ownership fields. Use opaque string IDs and ISO-8601 UTC timestamps.
- Persist `QuizAttempt` with student, lesson, step, optional assignment, stable-ID answers, counts, score, pass state, timestamp, and idempotency key; enforce uniqueness on `(studentId, idempotencyKey)`. Persist enough published-question revision/evidence to explain the score later. Store attempt and progress changes atomically.
- `GET /lessons/:lessonId/quiz` returns sanitized questions only after authorization and prerequisites. `POST /lessons/:lessonId/quiz-attempts` accepts `{ answers: [{ questionId, optionId }], idempotencyKey }`, computes the result on the server, and returns attempt evidence plus reconciled pathway/unlocks. Never return answer keys or another student's attempts.
- Reuse the same backend gate authorization for pathway reporting and practical-attempt access. Contract changes include route validation, OpenAPI/contract fixtures, frontend types, and recoverable error handling.

## UX & Interaction Patterns

- Show the full ordered lesson pathway with locked future steps visible and disabled. The primary action points to the next unlocked step; explain a lock's prerequisite inline.
- Present one multiple-choice question at a time with question position, keyboard/touch support, and submission disabled until an option is selected. Preserve local answers through recoverable read/render errors; do not imply a submission succeeded until the server confirms it.
- After confirmation, show question-level correct/incorrect evidence and a supportive outcome. A pass unlocks the practical step; a non-pass offers a neutral retry action without shame or celebratory score framing. Respect responsive layout, accessible states, and reduced-motion preferences.

## Cross-Story Dependencies

- A3 follows A2 and may start only after A2 runtime acceptance. Its prerequisite checks rely on the ordered learning-step and completion evidence established there.
- Execute A3-T1 through A3-T4 in order: safe delivery and gates precede immutable scoring, which precedes retry/unlock reconciliation and end-to-end contract/privacy verification.
- A4 consumes the practical-step gate produced by A3; practical access must fail before a pass and succeed after a pass using backend authorization.
