# B2 Teacher Evidence — Implementation Record

Date: 2026-10-15
Runtime acceptance: isolated local PostgreSQL 18 + real Nest API + real Chromium/Vite UI

## Delivered

- B2-T0: `StepProgress` now has a surrogate ID and nullable assignment identity, with unique student × assignment × step scope. The preflight reports ambiguous/orphan legacy evidence and refuses apply mode when any exception exists.
- B2-T1: assignment progress board returns only current approved targets and assignment-scoped lesson/practical evidence.
- B2-T2: deterministic overdue, two-failed-quiz, three-practical-without-pass, and rolling seven-day inactivity flags with evidence IDs and boundary tests.
- B2-T3/T4: teacher evidence summary and quiz/practical detail routes use the same `EVIDENCE_NOT_FOUND` contract for missing, outsider, and removed-student access. The FE teacher surface no longer calls legacy analytics.
- B2-T5: persistent student × assignment × gate-step override with reason, audit, idempotent grant/revoke, explicit student unlock label, and `OVERRIDE_IN_USE` protection.
- B2-T6: real API/database integration journey and real mobile Chromium board/evidence journey.

## Verification

- BE build/lint pass; Vitest 107/107.
- Fresh UTF-8 PostgreSQL 18: all 14 migrations applied; seed passed; B2 preflight 0 exceptions.
- `test:b2`: 13/13 against the real local API/database, including outsider, removed student, replay, revoke/relock and downstream-evidence conflict.
- Assignment board local p95 stayed below the 500 ms development target in the 20-read fixture measurement. This is not pilot or production proof.
- FE build/lint pass; `b2-teacher-evidence-live.spec.ts` 1/1 at 390 px with no horizontal overflow.

## External gates and non-claims

- Shared development migration was not run because the configured database credentials were rejected; local runtime acceptance is complete.
- Pilot/production latency and deployment remain unverified.
- C1 may begin. Pilot activation still requires approved Vietnamese consent purpose/version/copy/content hash.
