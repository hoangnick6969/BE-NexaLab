# Epic A5 Vertical Tickets

> Historical accepted-flow tickets. Assignment progress and attempt history remain class-assessment evidence; Open Curriculum course progress is separate and follows the PRD/spec, excluding Class Space decks, quizzes, custom Labs, and assignment evidence from its denominator.

## A5-T1 — Return a self-scoped evidence-backed progress overview

**Acceptance criteria**

- `/me/progress` derives actor from session and includes only applicable active assignments and their required published steps.
- Completion denominator/numerator and latest/best/verdict semantics are documented and covered by examples: not started, partial, passed, archived, and legacy evidence.
- Every summary field includes or resolves to source IDs/timestamps; another student's IDs cannot alter/query the response.
- UI shows honest loading/empty/error states, no unsupported percentages, and a Continue action matching the authoritative next step.

**Verification:** derivation/ownership source trace; fixture/property/contract tests; real A1–A4 dataset comparison to direct evidence; responsive browser check.

## A5-T2 — Drill progress into step and quiz evidence

**Acceptance criteria**

- Selecting reading/video/cards/quiz status opens the exact evidence rows and timestamps used in the summary.
- Quiz detail labels latest/best, attempt time, score calculation inputs, and per-question outcome without leaking answer keys beyond allowed feedback.
- Direct detail request for another student or missing evidence returns indistinguishable not-found and logs a safe authorization event.
- Detail panels/sheets trap/restore focus, work at 390 px, and preserve the underlying list/scroll state.

**Verification:** detail authorization/contract tests; frontend accessibility and navigation tests; real drill-down from metric to attempt.

## A5-T3 — Page practical and quiz history without gaps

**Acceptance criteria**

- Activity union is stable newest-first by timestamp + ID, uses opaque cursor, bounded limit, and does not duplicate/skip when equal timestamps exist.
- Practical row displays official verdict/model context; quiz row displays labeled score/pass; each links back to lesson step/assignment when retained.
- Archived evidence remains addressable/history-visible; active denominator excludes it. Legacy records are labeled when source links are incomplete.
- UI supports empty, first page, next page, retry-after-error, and long-list performance without losing loaded items.

**Verification:** pagination boundary/concurrency tests; frontend list/retry tests; real multi-page Supabase dataset and detail navigation.

## A5-T4 — Detect and repair projection drift

**Acceptance criteria**

- Projection updater runs transactionally with new evidence; failure rolls back or queues an explicit repair without claiming updated progress.
- Rebuild/check command in dry-run reports mismatches; apply mode updates projection only, is idempotent, and never edits source attempts/progress evidence.
- Tests inject inconsistent `Progress` rows and prove rebuild matches the documented derivation.
- Operational output contains counts/IDs suitable for diagnosis but no student secrets or answer keys.

**Verification:** transaction/rollback/rebuild tests; isolated Supabase dry-run + apply + second no-op run; source evidence hash/count comparison.

## A5-T5 — Verify the complete Increment A journey

**Acceptance criteria**

- One real seeded student completes A1 → A2 → A3 failed/pass → A4 retry/pass → A5 drill-down using Supabase, API, frontend, and browser.
- Negative suite covers wrong role, unrelated class/student, expired session, prerequisite bypass, tampered verdict, duplicate mutation, database interruption, and reload recovery.
- Pilot interaction/API targets are measured and reported; unmet targets stay open rather than being marked pass.
- Source, automated, runtime, and production evidence remain distinct. No production pass without deployed verification.

**Verification:** both repos lint/build/tests; backend integration and frontend E2E with dependencies named; responsive/accessibility run at required widths; production separate.
