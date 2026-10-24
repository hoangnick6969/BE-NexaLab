---
title: 'I3 — Assign Tests and Coordinate Due Dates Across Roles'
type: 'feature'
created: '2026-10-18'
status: 'review'
route: 'dispatch'
context:
  - '{project-root}/_bmad-output/planning-artifacts/increment-i3-epic-03-assigned-test-lifecycle.md'
  - '{project-root}/_bmad-output/specs/spec-open-learning-catalog/class-space-assignment-contract.md'
  - '{project-root}/docs/product/open-questions.md'
---

# I3 implementation record

## Gate decisions

Decided: D-I3-01..03 were proposed 2026-10-18 and confirmed by the product owner on 2026-10-19 (see `sprint-status.yaml`). Full text in `class-space-assignment-contract.md` §2a.

## Story 3.1 — Assign a test with a due date and fixed recipient set (review)

**Behavior**

- `POST /classes/:id/assignments` accepts `contentType: "test"` with `contentId` = a `PUBLISHED` `TEST` `ClassResource` of the same class. Draft, archived, other-class or non-test resources return 400 `CONTENT_NOT_PUBLISHED`. A missing due date returns 400 `DUE_DATE_REQUIRED`. Existing rules still apply: owner-only, approved targets only with no partial targets (`INVALID_TARGETS`), past due date rejected, duplicate check, `Idempotency-Key` replay.
- The same transaction writes the recipient snapshot (`AssignmentTarget`) and `AssignmentDeadlineRevision` revision 1 (`dueAt` in UTC). `contentVersion` is the resource version.
- `PUT /classes/:id/assignments/:assignmentId` on a test accepts a title change only. Target or due-date changes return 409 `TEST_ASSIGNMENT_IMMUTABLE`.
- `GET /classes/:id/assignable-content` also returns `tests` (published class tests with `version` and `questionCount`).
- Student `GET /assignments` lists targeted test assignments. `GET /assignments/:id` returns the identity, the current `deadline { revision, dueAt }` and question prompts and options, with no `correctOption` or `explanation`. Non-targets get 404 `ASSIGNMENT_NOT_FOUND` through the existing applicable-assignment filter.
- Sharing a test resource alone creates nothing; Class Space still hides test content from members.
- FE: the teacher assign modal adds "Bài kiểm tra" with a required due date. The edit modal locks the deadline for tests. The student list and detail show the localized deadline with time; submission UI arrives in 3.2.

**Verification (2026-10-18):** BE `npm run lint`, `npm test` 157/157, `prisma validate`, and the migration SQL matched `prisma migrate diff` from the previous schema. FE `npm run lint` and `npm run build` passed. Not run: API/DB integration and browser acceptance. No local database was available, and the migration is not applied to shared Supabase.

**Remaining:** apply the migration after approval. Then run the API/DB checks listed in `sprint-status.yaml` story_notes. The teacher progress/support boards do not yet understand test assignments (Story 3.5).

## Stories 3.2–3.6 (review, 2026-10-19)

**Schema:** `AssignmentSubmission` holds immutable submissions linked to the governing deadline revision and resource version, with server score, timing and late reason. `LateDecision` holds one row per decided late submission. Migration: `20261019090000_i3_assignment_submissions`. The pure rules are in `src/classes/assignment-test-contract.ts`, and the shared read model is in `src/classes/assignment-test-state.ts`. Student, teacher and parent endpoints all read through `testStates`, so the three roles always see the same status.

| Story | API | UI |
|---|---|---|
| 3.2 Submit with late reason | `POST /assignments/:id/submissions` | Student test form, late-reason field, history (`AssignedLearning.tsx`) |
| 3.3 Reject or revise deadline | `POST classes/:id/assignments/:aid/late-submissions/:sid/reject`, `POST classes/:id/assignments/:aid/deadline-revisions` | Reject and class-wide revise dialogs (`classes.tsx`) |
| 3.4 Student states | `testStatus` on `GET /assignments`, `state` on `GET /assignments/:id` | Status badges and due-soon banner (`StudentAssignments.tsx`), status and next step on detail |
| 3.5 Teacher queue | `testSummary` on `GET classes/:id/assignments`, `GET classes/:id/assignments/:aid/test-status`, `GET classes/:id/late-queue` | Late queue panel and per-test tracking dialog (`classes.tsx`) |
| 3.6 Parent overdue notice | `GET children/:studentId/assignment-notices`, `GET children/:studentId/assignments/:aid` | Overdue notices on the parent progress page (`ProgressPage.tsx`) |

The statuses shared across roles are defined in `class-space-assignment-contract.md` §2a. The FE labels are in `src/lib/test-status.ts`.

**Verification:** BE `npm run lint`, `npm run build`, `npm test` 164/164. Both I3 migrations matched `prisma migrate diff`. FE `npm run lint` and `npm run build` passed. Not run: API/DB and browser acceptance, because the migrations are not applied to shared Supabase and no local database was available. `scripts/route-manifest.ts` fails on unmodified main as well.

**API/DB acceptance (2026-10-19):** the user applied both migrations to shared Supabase development. `npm run test:i3` (`scripts/i3-integration.mjs`) ran against a local API and passed 65/65 checks with isolated prefixed fixtures. Covered: the owner assigns, draft or non-owner assignment rejected, missing due date and non-approved target rejected with no partial targets, immutable targets and deadline, answer key hidden, due-soon, non-target and outsider denied, on-time scoring, idempotent replay and key reuse, overdue with no zero, late without reason rejected, late pending, latest attempt current, parent notice, pending parent and other-child denial, teacher queue, status and summary, non-owner denial, reject to zero, double decision blocked, stale and past revisions rejected, revision for all recipients accepting pending work, replay, extension clearing the parent notice, resubmission after rejection, audit rows. Afterwards 0 leftover rows were confirmed.

**Browser acceptance (2026-10-19):** `FE-NexaLab/tests/i3-assigned-test-live.spec.ts` passed 2/2 against local Vite and the API on shared development, using system Chrome. The spec covers:
- The teacher assigns a test through the UI.
- On time: the student sees the due-soon banner and submits, and the score shows.
- Late: the submit button stays disabled until a reason is given, then the work shows as pending with no score.
- The teacher queue shows reasons; the teacher rejects one late submission and extends the deadline for the other.
- The tracking dialog shows the late work accepted by the extension.
- The student sees the extension, the accepted score and the zero after rejection.
- The parent sees a read-only overdue notice that disappears after the extension.

The spec found a pre-existing crash: the parent progress page read `attempts`, which the API does not return. Fixed in `ProgressPage.tsx`.

**Full suite:** the branch result was 10 passed, 16 failed and 8 did not run. FE `main` on the same API and DB fails the same 16 specs, so none of these failures come from I3.

**More e2e coverage (2026-10-19):**
- `tests/i3-assigned-test-edges-live.spec.ts` (8 tests) covers:
  - the assign form offering only published tests, with a required due date;
  - a title-only edit while the deadline and recipients stay locked;
  - a non-target member and an outsider student denied;
  - an outsider teacher who sees no foreign class and gets 403 from every I3 endpoint;
  - resubmission after an extension, with the latest attempt current and history kept;
  - an archived assignment leaving the student queue;
  - no answer key or explanation in any student response;
  - a 390 px phone layout.
- `tests/i2-class-space-ui-live.spec.ts` (3 tests) covers the Class Space UI: a deck with unscored card practice, a shared test hiding its questions plus an unscored study quiz, and CSV import with row errors followed by a valid draft.
- The shared helpers live in `tests/fixtures/live.ts`.
- The phone test found a pre-existing I2 overflow: the Class Space create form widened to 776 px because of a long lesson option. Fixed in `styles.css`.
- Full suite result: 21 passed, 16 failed (pre-existing), 8 did not run.

**Remaining:** none for I3. The pre-existing e2e failures are tracked as a separate task.

## Review Triage Log — 2026-10-24 (flows 11, 18, 25, 33)

- The live UI specs had drifted from the app, not the reverse. `/assignments` now groups work by grade → subject → chapter, so `i3-assigned-test-live` and `i3-assigned-test-edges-live` open the chapter screen through the `studentAssignmentRow` helper (`tests/fixtures/live.ts`). The parent overdue notice carries one control, "Đã xem", which marks the stored notification read (acc-3, `a988908`); the work itself stays read-only, so the spec now asserts exactly that control and no links.
- Result on shared development: 10/10 (2 + 8), including the parent notice cleared by a deadline revision.
- Related privacy fix found while probing roles: `GET /lessons` no longer serves parents (FINDING-21 in `flows-remaining-2026-10-24.md`).
