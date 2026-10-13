---
title: 'A2-T1 Authoritative Ordered Lesson Pathway'
type: 'feature'
created: '2026-10-12'
status: 'in-progress'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: 'b45a30cff548239e0a24ef91b7861fb4c3e72cab'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-2-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Assigned students currently receive a flat lesson payload with no authoritative ordered steps, official per-step state, lock reasons, or server-selected next action. Published content can therefore bypass the evidence model required by Epic A2.

**Approach:** Add the A2 lesson-step/evidence schema and a student-owned pathway read, backfill and seed deterministic pilot pathways, then update the assigned-learning page to render the server response without deriving gates in React. Preserve the existing lesson authoring payload by materializing validated step records from its legacy content fields when a lesson is published.

## Boundaries & Constraints

**Always:** Enforce STUDENT role plus approved enrollment, active assignment targeting, published lesson state, and lesson ownership at the API. Return 404 without lesson metadata for unrelated/direct access. Keep backend ordering, state, locks, and `nextStepId` authoritative; sanitize step resources and never expose quiz answers. Keep migrations deterministic, reversible in an isolated database, and safe for guarded seed reruns. Update backend and frontend contract consumers together.

**Never:** Implement A2-T2 progress mutations, reading completion, video heartbeat/resume, card-visit evidence, quiz scoring/unlock, lab/challenge execution, or a new teacher step-authoring UI. Do not alter A1 authentication, dashboard assignment ordering, simulation authority, or infer official progress from page visits/client state.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|---------------|----------------------------|----------------|
| Assigned pathway | Authenticated student, approved enrollment, active targeted assignment, published valid lesson | Ordered sanitized steps, official states, lock reasons, `nextStepId`, lesson/assignment summaries | N/A |
| Unauthorized path | Unrelated student, inactive/unassigned lesson, or direct URL | No content metadata | Stable 404 response |
| Invalid publication | Published lesson materializes duplicate/unsupported/empty required step config | Publication is rejected and invalid pathway is never served | Validated 400 response |
| Legacy authoring | Existing create/update payload with valid content/materials/questions/lab reference | Server derives deterministic step records transactionally | Preserve existing draft behavior; reject invalid publish |

</frozen-after-approval>

## Code Map

- `prisma/schema.prisma` -- add `LessonStep`, `StepProgress`, relations, stable enums, unique lesson position and student-step evidence constraints.
- `prisma/migrations/*_lesson_pathway/migration.sql` and `rollback.sql` -- create/backfill deterministic records and provide isolated reversal evidence.
- `src/routes.ts` -- reuse `lessonSchema`, authenticated actor, published lesson checks, and assignment applicability; add pathway read and transactional step materialization without changing progress mutations.
- `src/pathway.ts` -- only if needed for small pure validation/sanitization/state helpers shared by route tests.
- `prisma/seed.ts` -- idempotently seed canonical ordered pilot steps and a lesson assignment reachable by the A1 student.
- `scripts/integration.mjs` plus focused Vitest coverage -- prove order, sanitization, publication validation, ownership non-disclosure, and official current/locked/next state.
- `../nexalab-fe/src/pages.tsx` -- replace flat assigned-lesson rendering with the canonical pathway response; retain loading, retry, overdue, and DOMPurify behavior.
- `../nexalab-fe/src/styles.css` -- scoped pathway states and unobscured primary action using existing tokens/components.
- `../nexalab-fe/tests/a1-acceptance.cjs` or a focused A2 case -- verify ordered UI, precise Continue copy, locked non-disclosure, unrelated access, and 390/768/1024/1440 layouts.
- `_bmad-output/implementation-artifacts/sprint-status.yaml` -- record only A2-T1 evidence/status; do not unlock later stories or Epic A3.

## Tasks & Acceptance

**Execution:**
- [ ] `prisma/schema.prisma`, migration, and rollback -- introduce authoritative step/evidence storage and deterministic backfill without losing legacy lesson data; rollback SQL still needs isolated execution proof.
- [x] `src/routes.ts` and focused tests -- validate published step config, authorize/sanitize pathway reads, and calculate official ordered states plus next action.
- [ ] `prisma/seed.ts` and `scripts/integration.mjs` -- keep fresh/rerun fixtures deterministic and prove the API contract against PostgreSQL.
- [ ] `../nexalab-fe/src/pages.tsx`, `src/styles.css`, and browser tests -- render every server step in fixed order with complete/current/locked states and a precise Continue action.
- [x] `_bmad-output/implementation-artifacts/sprint-status.yaml` -- record changed files, evidence tiers, blockers, remaining risk, and only the current story status.

**Acceptance Criteria:**
- Given an isolated database with existing seeded published lessons, when the migration/backfill runs and its rollback is exercised, then ordered canonical steps are deterministic and schema/data return to the pre-migration shape.
- Given a lesson publish request, when required step resources, references, types, or positions are invalid, then publication fails and students cannot retrieve the invalid content.
- Given an applicable student, when they request the pathway, then the response matches the canonical A2 contract and contains only sanitized resources; an unrelated student receives 404 with no lesson metadata.
- Given the assigned-learning page at 390, 768, 1024, and 1440 pixels, when the pathway loads, then all steps appear in server order with explicit complete/current/locked cues and one unobscured, accurately labelled Continue action.

## Implementation Notes

- Added the authoritative Prisma models, deterministic migration backfill and explicit isolated rollback SQL. Prisma client generation, schema compilation and focused pathway tests pass.
- Kept legacy authoring compatible by transactionally materializing validated published steps from content, video materials, questions and lab references. The pathway read enforces enrollment/assignment targeting and returns only sanitized resources for the current step.
- Added deterministic seeded pilot steps/assignment, integration assertions, frontend pathway rendering, responsive styles and browser assertions for the four required widths.
- Automated evidence: backend lint/build and 34 unit tests pass; frontend lint/build pass. The integration script passes Node syntax validation; its API assertions have not been executed. Its expected pathway order was corrected to include the deterministic VIDEO equivalent step.
- Database runtime: Prisma reported all migrations up to date; read-only queries confirmed three published pilot lessons each have the six ordered step records. The database has no active lesson assignment, so API and browser acceptance still require fixture seeding.
- Rollback SQL is present but has not been executed; the configured Supabase database is not an isolated rollback target.
- Seed blocker: automatic approval rejected the guarded seed against the configured Supabase database because it contains existing data and the reset setting/target approval was not established. No seed or integration test was run. Production remains unverified.

## Spec Change Log

## Review Triage Log

## Design Notes

Use existing lesson fields as the compatibility source for transactional step materialization: reading from `content`, video resources from `materials`, quiz presence from `questions`, and practical reference from `labId`. Seeded pilot data may add canonical study-card config directly. Deterministic assignment selection follows the existing due-date, creation-time, then ID ordering.

## Verification

**Commands:**
- `npm run db:generate && npm test && npm run lint && npm run build` -- generated Prisma client, backend unit suite, typecheck, and compile pass.
- `npm run test:integration` -- isolated seeded PostgreSQL contract/ownership checks pass.
- `npm run lint && npm run build` from `../nexalab-fe` -- frontend typecheck and production build pass.
- `npm run test:e2e` from `../nexalab-fe` -- configured real API/database/browser pathway acceptance passes at required viewports.
- `git diff --check` in both repositories -- no whitespace errors; final diff contains only A2-T1 and authorized tracking/context files.

