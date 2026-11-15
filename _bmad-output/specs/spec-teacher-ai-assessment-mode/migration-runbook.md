# TAI-07 — migration runbook for the shared database

Three migrations, all expand-only and idempotent (`IF NOT EXISTS`, guarded constraints; each was applied, then its SQL was
re-run on a disposable PostgreSQL 18 with no error). TAI7-T2 and TAI7-T5 need **no** migration. Apply them in this order, on
top of `20261109170000_tai06_lab_challenge_job` (the last migration of TAI-01..06):

| # | Folder (`BE-NexaLab/prisma/migrations/`) | Story | What it adds |
|---|---|---|---|
| 1 | `20261115090000_tai07_assessment_mode` | T1 | enums `AssessmentType`, `AssessmentSessionStatus`; `Assignment.assessmentType` (default `PRACTICE`), `durationMinutes`, `scoresPublishedAt/ById`; `AssignmentSubmission.sessionId` (unique), `autoSubmitted`; tables `AssessmentSession`, `AssessmentRetakeGrant`; CHECKs `Assignment_assessment_duration_check`, `AssessmentSession_expiry_check`; foreign keys |
| 2 | `20261115140000_tai07_gradebook` | T3 | `Assignment.gradebookLockedAt/ById`, `gradebookLockVersion`; table `GradebookEntry` (unique per assignment + student + lock version); CHECKs `GradebookEntry_status_check`, `Assignment_gradebook_lock_check` |
| 3 | `20261115160000_tai07_exam` | T4 | enum values `ClassResourceKind.EXAM`, `GradingMode.MIXED`; `AssignmentSubmission.examComponents`; `LabRun.assessmentSessionId`, `examItemId` and an index |

Existing rows are unchanged: every assignment becomes `PRACTICE` through the column default, so the I3 and TAI-02 behaviour of
history is the same. No data backfill, no destructive step, no `DROP`.

## Before

- Take a backup or a branch of the database (Supabase dashboard). The shared database is not covered by the repo's isolated-DB
  guard on purpose: `npm run db:migrate` refuses to run against it (`predb:migrate` -> `assert-isolated-db`), so this is a
  deliberate, owner-run step with the Prisma CLI directly.
- Use the **direct** connection (`DIRECT_URL`, port 5432), not the transaction pooler (6543); Prisma migrate needs a session.
- Deploy the backend that contains this epic only **after** the migrations: the new code selects the new columns on every
  assignment query and fails if they are missing. Roll the frontend after the backend.

## Commands (from `BE-NexaLab/`, with `DIRECT_URL` pointing at the shared database)

```bash
npx prisma migrate status
```

Expect exactly the three folders above as "not yet applied" (anything else pending is not part of TAI-07: stop and look).

```bash
npx prisma migrate deploy
```

```bash
npx prisma migrate status
```

Expect "Database schema is up to date".

## After (read-only checks)

```sql
select count(*) filter (where "assessmentType" <> 'PRACTICE') as graded, count(*) as all_assignments from "Assignment";
select conname from pg_constraint where conname in ('Assignment_assessment_duration_check', 'AssessmentSession_expiry_check', 'Assignment_gradebook_lock_check', 'GradebookEntry_status_check') order by 1;
select enumlabel from pg_enum e join pg_type t on t.oid = e.enumtypid where t.typname in ('ClassResourceKind', 'GradingMode') and enumlabel in ('EXAM', 'MIXED');
select to_regclass('"AssessmentSession"'), to_regclass('"AssessmentRetakeGrant"'), to_regclass('"GradebookEntry"');
```

Expect `graded = 0` right after the migration, 4 constraints, 2 enum labels and 3 tables.

## Rollback

There is no down migration. The columns and tables are additive and unused by the previous backend, so the safe rollback is to
redeploy the previous backend build and leave the schema as is. Enum values cannot be removed from PostgreSQL; leaving `EXAM` and
`MIXED` in place is harmless.

## Environment

- `ASSESSMENT_SWEEPER_ENABLED=false` turns off the 60-second auto-submit sweeper (lazy auto-submit on read still works).
- Teacher AI needs no new variables: `GENERATE_ASSESSMENT` uses the existing `AI_PROVIDER`, `AI_*_LIMIT` and `AI_CREDITS_*`
  settings; with credits on, a baseline price for the new purpose is seeded on boot (`AI_CREDITS_SEED_BASELINE`, default true).
- Assist-mode AI grading in the gradebook still needs the TAI-02 gate (`AI_ASSESSMENT_ENABLED`, `AI_ASSESSMENT_MODE=assist`,
  `AI_ASSESSMENT_POLICY`).
