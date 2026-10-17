# Epic A1 Vertical Tickets

> Historical accepted-flow tickets. Explicit assignments remain supported, but these tickets do not make assignment the default/only route to released shared curriculum; new access follows the Open Curriculum PRD/spec.

Tickets are ordered so each can be completed using only earlier tickets. Every ticket spans the backend and frontend portions required for a demonstrable user or operator outcome; none is a frontend-only, backend-only, or database-only phase.

## A1-T0 — Establish the Supabase-backed MVP data path

**Outcome:** The API, Prisma CLI, migration pipeline, and non-production seed use the correct Supabase connection modes without exposing credentials to the frontend.

**Acceptance criteria**

- `.env.example` documents redacted `DATABASE_URL` (current long-lived runtime Session-pooler SSL URI) and `DIRECT_URL` (migration/seed direct SSL URI, with documented Session-pooler fallback for networks without direct reachability); neither appears under a `VITE_` name or in committed secrets.
- Prisma 6.19 runtime reuses one client per process; Prisma migrations and seed use the direct/session connection and never the transaction-pool connection.
- A clean non-production Supabase database accepts `prisma migrate deploy`, the idempotent seed, and an API health/read smoke check; a rerun creates no duplicate pilot identities, enrollments, content, or assignments.
- The guarded seed creates the documented owner/outsider Teacher and temporary/active/outsider Student personas from environment-provided credentials, using stable IDs and the same domain invariants as the API.
- Dev/test, staging/pilot, and production targets are distinguishable, and destructive/reset/dev-migration commands are refused or clearly gated for pilot/production.
- Connection, migration, pool exhaustion, and dependency-unavailable failures return/log diagnosable server-side errors without leaking credentials to the client.

**Verification**

- Source: trace environment loading, Prisma singleton, migration/seed target selection, and frontend bundles for secret absence.
- Automated: Prisma validation/generation, seed idempotency test against an isolated database, backend lint/test/build.
- Runtime: real non-production Supabase migration + seed + health/query smoke; capture redacted project/environment and migration version.
- Production: not passed by the non-production check.

## A1-T1 — Provision a student who can enter the learning platform

**Outcome:** An authorized teacher or supported seed path places a Student account in an owned class and produces a one-time temporary credential; the student can authenticate and complete the password gate.

**Acceptance criteria**

- Given an authenticated teacher operating an owned class, when a valid unique student username is provisioned, then the Student account and approved enrollment are created and the temporary credential is returned only by the provisioning response.
- Given a teacher who does not own the class, when provisioning or resetting that student's password is attempted, then the API returns forbidden and changes nothing.
- Given a provisioned student with a valid unexpired temporary password, when the student signs in, then protected learning routes remain blocked until a valid password change succeeds.
- Given an invalid, expired, revoked, inactive, or adult credential on the student login path, when login is attempted, then access is denied without revealing which identity field matched.
- Given a completed password change, when the old temporary password or a revoked refresh session is reused, then access is denied.
- Seeded personas authenticate through the real backend routes and guards. No development account selector, hard-coded credential, Student registration link, or frontend mock-login can satisfy this ticket.
- The Student login at the supported mobile width uses username/password, exposes no student self-registration or email reset, and has keyboard-visible focus and 44×44 px actions.

**Verification**

- Source: trace auth guard, session record, cookie attributes, provisioning ownership, temporary-password expiry, and frontend password gate.
- Automated: backend auth/ownership tests, frontend typecheck/lint/build, and relevant component or route tests.
- Runtime: real PostgreSQL + seeded API + frontend browser flow for provision → login → password change → refresh/logout; include forbidden and expired-password cases.
- Production: not passed unless the deployed environment is exercised separately.

## A1-T2 — Assign one published lesson to the prepared cohort

**Outcome:** An authorized operator can make one published lesson applicable to the prepared class or a selected enrolled student without exposing it to unrelated students.

**Acceptance criteria**

- Given an owned class and a published lesson, when the teacher assigns it to the class, then every approved enrolled student is applicable unless a valid selected-student subset is supplied.
- Given a selected-student subset, when the assignment is created, then every selected ID belongs to an approved enrollment in the owned class or the request fails atomically.
- Given a draft, archived, missing, or unsupported content target, when an assignment is created or opened, then the server rejects it or returns a non-actionable state according to one documented contract; the client does not infer publication.
- Given an unrelated teacher, class, or student, when assignment data is requested or mutated, then the API reveals no unauthorized assignment or student metadata.
- A repeatable seed may satisfy the operator preparation path, but it must use the same domain invariants and produce stable demo identifiers without duplicating records on rerun.

**Verification**

- Source: trace class ownership, approved enrollment, published-content lookup, selected-student validation, and transaction boundaries.
- Automated: assignment applicability and ownership tests, including class-wide, targeted, duplicate, invalid-target, and unauthorized cases.
- Runtime: create or seed a real assignment and query it as applicable and inapplicable students against PostgreSQL.
- Production: not passed unless the deployed environment is exercised separately.

## A1-T3 — Open applicable assigned learning from the Student landing experience

**Outcome:** The student sees the correct assigned-learning state and opens the assigned lesson's first available action.

**Acceptance criteria**

- Given one or more applicable assignments, when the Student landing view loads, then assignments are ordered by the Product Owner-approved rule and the primary learning action targets the selected applicable assignment.
- Given an applicable published lesson assignment, when the student opens it, then the rendered lesson identifies subject, grade/topic context, learning objective, prerequisites, and the first available learning step.
- Given no applicable assignments, when the view loads, then it shows a truthful empty state with a safe next action and no fabricated progress value.
- Given an API or dependency failure, when assignments or lesson data cannot load, then the student sees a recoverable error and the UI does not present stale state as current.
- Given an assignment for another student or class, when its URL or identifier is requested directly, then the server denies or omits it even if the client route is known.
- At 390, 768, 1024, and 1440 px, the primary action is visible, no horizontal overflow obscures content, keyboard order follows visual order, and reduced-motion does not remove readable state.

**Verification**

- Source: trace assignment filtering through API consumption and direct lesson-open authorization; confirm UI state derives from server data.
- Automated: backend access/applicability tests, frontend lint/build, and deterministic view tests for loading, populated, empty, forbidden, and recoverable-error states.
- Runtime: real browser flow as applicable and inapplicable students at representative desktop and mobile widths with the configured API/database.
- Production: not passed unless the deployed environment is exercised separately.

## A1-T4 — Demonstrate the complete cohort-to-lesson handoff

**Outcome:** The team has reproducible runtime evidence that A1 works end to end and knows exactly which evidence levels remain unverified.

**Acceptance criteria**

- Given a clean supported local setup, when the documented seed or operator flow is executed, then one teacher-owned class, one provisioned student, one published lesson, and one applicable assignment are available without manual database editing.
- When the student completes the A1 journey in a browser, then the observed path is provision → login → required password change → applicable assignment → assigned lesson.
- When the same assignment and lesson are probed with wrong-role, unrelated-student, and unrelated-class sessions, then server-side authorization rejects each case.
- The evidence report lists source, automated, runtime, and production results separately and includes actual commands/dependencies; skipped or unavailable dependencies are not marked passed.
- This ticket produces verification evidence only for A1 and does not implement A2 learning materials or later epics.

**Verification**

- Run backend lint, unit tests, and build; run frontend lint and build.
- Run backend integration and frontend E2E only with PostgreSQL, seed, API, app, and browser actually available.
- Preserve command output or CI links for the implementation turn; do not create a separate planning audit matrix.
