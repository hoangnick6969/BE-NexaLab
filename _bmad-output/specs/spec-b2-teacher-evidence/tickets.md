# B2 — Ordered Vertical Tickets

## B2-T0 — Normalize assignment-scoped evidence

- Preflight every `StepProgress` row against lesson, student, enrollment, and assignment history. Backfill only a unique applicable assignment; output ambiguous/orphan rows and stop the migration until reconciled.
- Add a surrogate ID and nullable `assignmentId` to `StepProgress`, enforce unique `(studentId, assignmentId, stepId)`, and require assignment identity for all new assigned step/quiz/practical writes. Keep null only for labelled legacy/free-practice evidence.
- Update A5 derivation, pathway gates, `/me/progress`, activity, and projection updates to filter one assignment consistently. Free-practice evidence never completes assigned work.
- **Accept when:** assigning the same immutable lesson twice produces independent progress/evidence; migration counts reconcile; ambiguous rows are not guessed; Increment A behavior remains correct for migrated fixtures.

## B2-T1 — Assignment tracking board read model

- Provide `GET classes/:classId/assignments/:assignmentId/progress` with only the applicable roster and assignment-scoped step states or lab verdict.
- Reuse A5 evidence derivation; explicitly reconcile legacy step progress identity and behavior when one lesson is assigned more than once.
- **Accept when:** each metric reconciles to source records; other assignment evidence is excluded unless explicitly contracted; removed membership and archive follow B1 access rules; p95 method/workload is recorded.
- **Dependency:** B2-T0 is complete.

## B2-T2 — Deterministic needs-support flags

- Derive flags for overdue + incomplete, at least two failed quiz attempts, at least three practical attempts without pass, and no qualifying activity for seven days.
- Return rule code, neutral explanation, relevant evidence IDs, and timestamp/threshold context. No rank or risk score.
- Qualifying activity is StepProgress advance, QuizAttempt creation, or practical Attempt creation for that assignment. Page views and overrides do not count. Archive removes active flags; due-date edits and new evidence recalculate them.
- **Accept when:** exact boundary tests cover 1/2 quiz failures, 2/3 practical attempts, due boundary, 6/7 days, and qualifying activity reset; each flag drills to its evidence.

## B2-T3 — Teacher evidence detail

- Expose class-owned student evidence, quiz attempt, and practical attempt detail using A5 builders; teacher may see correct answers and hint content only within allowed ownership/enrollment.
- Return identical 404 for missing and unauthorized teacher detail; write only policy-required denial audit fields.
- **Accept when:** outsider teacher and removed student cannot read; values match source evidence; no unrelated student's information leaks.

## B2-T4 — Replace legacy analytics surface

- Remove reliance on raw analytics endpoint and replace with board, support flags, and evidence sheet. Do not expose raw simulation/hint payloads as aggregate analytics.
- **Accept when:** FE has no call to deprecated progress/analytics paths for teacher views; the board drills into existing evidence sheet and has empty/loading/error states.

## B2-T5 — Persistent teacher gate override

- Store override per student × assignment × gate step with actor, reason, created/revoked timestamps and audit; create/revoke mutations are idempotent and owner-authorized.
- Student receives explicit teacher-unlocked explanation. It unlocks only the target gate, never changes score/verdict/evidence. Revoke behavior accounts for already valid downstream evidence.
- **Accept when:** replay cannot broaden scope; wrong teacher cannot grant/revoke; reason is required and redacted-safe; score/attempt/verdict remain byte-for-byte unchanged.
- Revoke returns 409 `OVERRIDE_IN_USE` without changing the active override when downstream evidence exists; otherwise it revokes and relocks atomically.

## B2-T6 — Evidence-to-action journey

- Student submits failing evidence; teacher sees correct signal, opens exact attempt, grants target override, student reaches gate; teacher then revokes where no downstream completion blocks relock.
- **Accept when:** real API/database/browser journey passes with outsider, removed-student, stale-state, and retry negatives; measured endpoint mix is documented; pilot and production remain separately unclaimed.
