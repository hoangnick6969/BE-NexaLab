# A1 local acceptance — 2026-10-12

Environment: isolated NexaLab PostgreSQL cluster `.local/a1-acceptance-pg`, database `nexalab_a1_acceptance`, loopback port `55439`; API `4409`; frontend `5199`. PIM services and configuration were not used or changed.

## Evidence

- Four Prisma migrations applied successfully to an empty database.
- Seed ran twice; counts stayed `User=10`, `Enrollment=5`, `Lesson=3`, `Assignment=3`.
- Backend lint/build passed.
- Backend unit tests: 29 passed.
- Backend integration: 53 assertions passed.
- Frontend lint/build passed.
- Browser acceptance passed: teacher provision → student temporary login → password gate → reload/refresh → assigned published lesson → logout → reload remains logged out.
- Browser widths 390, 768, 1024 and 1440 had no horizontal overflow; no page JavaScript errors.
- Invalid duplicate assignment targets returned HTTP 400.
- `git diff --check` passed.

## Story verdicts

- A1-T0: done for isolated local PostgreSQL acceptance. Supabase production and deployment remain unverified.
- A1-T1: done for the exercised provision/password/session journey.
- A1-T2: done for the exercised published assignment, target validation and authorization journey.
- A1-T3: done for the exercised populated landing, assignment detail, lesson context, retry/error rendering and responsive browser journey.
- A1-T4: done for the complete local cohort-to-lesson evidence path.

## Remaining limits

Production deployment is unverified. Supabase was smoke-tested earlier, but this clean migration/seed run used isolated local PostgreSQL. Full keyboard/reduced-motion/manual accessibility review and every negative matrix case are outside this run.

No commit was created and no later epic was unlocked.
