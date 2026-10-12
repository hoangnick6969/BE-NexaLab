# Epic A3 Vertical Tickets

## A3-T1 — Deliver a gate-protected sanitized quiz

**Acceptance criteria**

- Stable question/option IDs and 50% threshold are validated at publication; empty/invalid quizzes cannot become required published steps.
- Student quiz response contains no answer field and is available only to the authenticated applicable student after required A2 steps.
- Wrong-role, unrelated-student, unpublished, and prerequisite-incomplete requests return stable non-leaking errors.
- UI renders one question at a time, requires selection before advancing/submitting, and preserves local answers through recoverable read/render errors.

**Verification:** source trace of sanitization and shared gate; API schema/authorization tests; frontend keyboard/touch/responsive checks; real seeded quiz retrieval.

## A3-T2 — Record and score one immutable quiz attempt

**Acceptance criteria**

- Migration creates `QuizAttempt` and required indexes/relationships; existing aggregate progress does not masquerade as attempt history.
- Submission validates the exact published question set, computes score server-side, stores evidence atomically, and returns the created attempt/pathway.
- Same student + idempotency key returns the original result without incrementing history; a different payload with the same key returns conflict.
- Timeout/failure before confirmation does not make the UI claim success; retry uses the same key and reconciles.

**Verification:** exact-boundary scores (0, below 50, exactly 50, 100), malformed/duplicate/idempotency/concurrency tests; real Supabase persistence and reload.

## A3-T3 — Retry until the practical step unlocks

**Acceptance criteria**

- A failed attempt keeps Quiz current, retains prior evidence, and offers supportive Retry; no red/shame treatment is used.
- A passing attempt atomically marks Quiz complete, updates the rebuildable progress projection, and unlocks the configured LAB step.
- Best and latest score semantics are distinct in API/UI. The student can open the source attempt for any displayed score.
- Direct A4 gate probe fails before pass and succeeds after pass without frontend-only state.

**Verification:** multi-attempt/gate/rollback tests; frontend transition and reload tests; real failed → passed → direct-open browser flow.

## A3-T4 — Verify quiz contract, privacy, and performance

**Acceptance criteria**

- OpenAPI/contract fixtures and frontend types match the accepted request/response/error envelope.
- Logs and client errors contain no answer keys, passwords, tokens, or database URLs.
- Measured submission/read latency is recorded against pilot targets; concurrency test shows duplicate network delivery cannot create duplicate attempts.
- Evidence tiers remain separate and E2E names the real dependencies used.

**Verification:** backend lint/test/build, frontend lint/build/tests, contract diff, real-dependency E2E and timing; production separate.
