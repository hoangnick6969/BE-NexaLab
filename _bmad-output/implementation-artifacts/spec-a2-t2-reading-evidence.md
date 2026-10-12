---
title: 'A2-T2 Complete and Resume Reading'
type: 'feature'
created: '2026-10-13'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '2f7ef81cd18d4c1a6836d515033fc5e1fcd17d3f'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-2-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** A2-T1 presents sanitized reading material but has no explicit way for a student to record completion, so the pathway cannot advance based on durable reading evidence.

**Approach:** Add an authenticated, assignment-scoped reading completion mutation backed by the existing `StepProgress` record, and make the assigned-learning page expose a semantic reading region with an explicit server-confirmed completion action.

## Boundaries & Constraints

**Always:** Use the canonical `PUT /lessons/:lessonId/steps/:stepId/progress` contract with `{ action: "complete" }`; derive student identity from auth; require an applicable active lesson assignment, approved enrollment, published lesson, same-lesson `READING` step, and current server-authorized step. Persist `COMPLETED`/100 once, preserve the first completion time, update the aggregate lesson projection transactionally without downgrading an already completed lesson, and return reconciled server pathway state. Sanitize reading HTML at render time. A failed request must not advance Continue or appear saved; provide retry.

**Never:** Accept client progress/status or another student's/lesson's step; complete a locked or non-reading step; infer completion from scroll, page visit, or local state; implement video, card, quiz, lab, challenge, or general progress mutations in this story.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|----------------------------|----------------|
| Complete current reading | Assigned student, published lesson, current READING step; `{action:"complete"}` | One durable completed step; response shows next authorized step | N/A |
| Repeat completion | Same student and completed step | Same evidence row and completion timestamp; same reconciled pathway | Idempotent success |
| Invalid or unavailable step | Wrong type, foreign lesson, locked step, missing lesson content | No evidence mutation or pathway advancement | Stable 400/404 |
| Dependency failure | Completion request cannot reach/persist to server | Keep reading current and show retry | Visible recoverable error |

</frozen-after-approval>

## Code Map

- `src/routes.ts` -- pathway authorization/read and student route patterns; add the reading-only mutation beside the pathway handler and share assignment applicability checks.
- `src/pathway.ts` -- `buildPathwaySteps` is the server source for current/next state and locked resources; reuse it after persistence.
- `prisma/schema.prisma` -- `StepProgress` composite key, status, progress value, and timestamps already exist; no schema migration is expected.
- `scripts/integration.mjs` -- API fixture lifecycle and pathway assertions; prove authorized completion, idempotency, reload state, and negative cases.
- `../nexalab-fe/src/pages.tsx` -- `AssignedLearning` currently sanitizes READING HTML and renders server pathway state; add semantic reading markup and explicit completion/retry UI using the existing `useAction`/`api` pattern.
- `../nexalab-fe/tests/` -- add focused browser coverage without changing the separately owned A1 acceptance harness defects.
- `../nexalab-fe/src/api.ts` -- authenticated fetch/refresh behavior; keep it unchanged unless contract evidence requires otherwise.

## Tasks & Acceptance

**Execution:**
- [x] `src/routes.ts` -- authorize and validate the READING completion request, persist idempotent evidence and the aggregate projection transactionally, and return authoritative pathway state.
- [x] `scripts/integration.mjs` and focused unit tests -- verify current-step gating, unauthorized/invalid negatives, repeated completion, and server state after another GET.
- [x] `../nexalab-fe/src/pages.tsx` and focused browser coverage -- render sanitized semantic reading content, submit explicit completion, show pending/error/retry states, and advance only from the server response.
- [x] `../nexalab-fe/src/styles.css` -- existing scoped pathway styles support the action; no stylesheet changes were needed.

**Acceptance Criteria:**
- Given an applicable student with the current reading step, when they explicitly complete it, then exactly one authenticated step record is completed and the returned next step is server-authorized.
- Given a duplicate completion or page reload, when the pathway is fetched again, then reading remains completed with stable evidence and no duplicate row.
- Given an unassigned student, foreign/locked/non-reading step, or invalid body, when a completion is submitted, then no progress is recorded and no protected lesson metadata is disclosed.
- Given a failed completion write, when the student views the reading page, then Continue remains on reading and a keyboard-accessible retry is available; sanitized content and completion controls remain usable by keyboard.

## Implementation Notes

Implemented against the existing A2-T1 data model. `StepProgress` remains source evidence; `Progress` is updated as a projection and completed projections are preserved. Assignment validation, reading-step authorization, evidence writes, projection update, and returned pathway now share a serializable transaction. Completion is not optimistic in the browser.

## Spec Change Log

## Review Triage Log

- patch: Moved assignment/step authorization, evidence/projection writes, and the returned pathway into one serializable transaction to avoid committing completion and then failing the post-commit authorization read. Re-ran backend unit/lint/build and 67 integration assertions successfully.
- patch: Added assertions that duplicate completion preserves one evidence row and does not downgrade a completed aggregate projection.
- patch: Made the focused browser test repeatable against an already-completed persistent fixture; verified both the initial retry flow and repeat run.
- deferred/out of scope: Video resource rendering and completion are A2-T3; this story only returns the next server-authorized step and does not implement it.
- deferred: Production deployment/runtime verification was not performed; this story was verified against the configured local development API/database only.

## Design Notes

Repeat completion uses the `(studentId, stepId)` unique key and preserves `completedAt`; the server recalculates pathway state after the transaction. The browser must not mark the step complete optimistically.

## Verification

**Observed results (2026-10-13):**
- Backend `npm test`: 34/34 passed; `npm run lint` and `npm run build` passed.
- Backend `node --check scripts/integration.mjs` passed; final `npm run test:integration` against the seeded development API/database passed 67 assertions, including current reading, invalid/foreign/locked requests, authorization, unique idempotent evidence, completed-projection preservation, and pathway reload.
- Frontend `npm run lint` passed; `npm run build` passed (2441 modules). Initial sandbox build failed with filesystem `EPERM`; elevated retry passed.
- Focused Playwright test `tests/reading-completion.spec.ts` passed against local API/Vite for both first completion (keyboard activation, transient failure/retry, server-confirmed completion, reload persistence) and a repeat run with the persistent seeded reading already complete.
- Production deployment and production-user verification were not performed.
