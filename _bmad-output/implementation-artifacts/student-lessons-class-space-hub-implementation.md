# Student Lessons Hub and Class Space Navigation — Implementation Record

**Record type:** Historical implementation and verification evidence
**Implemented:** 2026-10-18
**Repositories:** `nexalab-be` and `nexalab-fe`
**Branch:** `codex/i1-open-curriculum`
**Implementation baseline:** `cf679c3c1172e8a1c3e2f300b7f33e7f595ab5cd`

## Outcome

The student `/lessons` hub combines the released shared-curriculum catalog with eligible lesson assignments, subject/book links, and an assigned/shared filter. Duplicate shared and assigned lessons render once and retain their assignment associations. Assignment cards open the authorized `/assignments/:id` flow and preserve its selected assignment context. The student sidebar links to the existing `/classes` screen as Class Space; membership-scoped resource discovery remains I2 work.

The implementation preserves server authorization, I1 release eligibility, assignment-specific progress, and the separation between public curriculum, class resources, and scored assignment work. Teacher/admin navigation is unchanged.

## Completed work

- [x] Update PRD and Student UX to define `/lessons` as the unified subject/book hub, the assigned/shared distinction, and Class Space as a separate student destination.
- [x] Update I2 to own the student Class Space sidebar/screen/resource listing and membership states; update I3 to keep scored assigned tests in Assignments and define lesson-card integration boundaries.
- [x] Update FE student `/lessons` data composition, assigned prominence/filter, all-subject book links, and student Class Space navigation without changing teacher/admin flows.
- [x] Add focused tests for lesson union/deduplication/filter behavior and run relevant frontend checks.

## Acceptance evidence

- `/lessons` discovers registered subjects and configured external book links; shared lesson cards are release-gated.
- Eligible assigned lessons are prominent and filterable, carry class/assignment context, and link through authorized assignment detail.
- Shared/assigned overlap is one card, classified as assigned, with all assignment associations retained.
- Student Class Space navigation opens the existing `/classes` route. Resource discovery and member/nonmember authorization remain I2-owned.
- Scored test due/status/submission controls remain in `/assignments` and are not duplicated in the shared lesson catalog.

## Verification record

Results after final implementation edits:

- Backend `npm run lint` — passed.
- Backend `npm run build` — passed.
- Backend `npm test` — 20 test files and 156 tests passed.
- Frontend `npm run lint` — passed.
- Frontend `npm run build` — passed.
- Frontend `npm run test:e2e -- tests/lesson-catalog.spec.ts` — 5 tests passed.
- Frontend Edge E2E `npm run test:e2e -- tests/student-lessons-hub.spec.ts` — 3 tests passed with mocked API responses; this verifies hub composition and navigation, not live database integration.
- Live database/API integration and production verification — not run.
- `git diff --check` — Git reported `fatal: this operation must be run in a work tree` despite `git rev-parse --is-inside-work-tree` returning `true`; not counted as passed.

## Review triage preserved from the implementation spec

| Finding | Classification | Disposition |
|---|---|---|
| Assignment-detail fan-out silently ignored individual failures | Patch | Normal published lessons use `/lessons` plus `/assignments`; fallback failures surface through retry UI. |
| Assigned card assumed subject metadata was always flattened | Patch | Catalog builder handles nested subject metadata from authorized APIs. |
| Open-catalog failure could be described as an empty release state | Patch | Shared-catalog empty state is suppressed when its query fails. |
| One detail request per eligible assignment created avoidable request volume | Patch | Detail reads are limited to eligible archived-started lessons missing from the published list. |
| Assignments for the same lesson were hard to distinguish in card actions | Patch | Card actions include assignment title, class, and due date. |
| UX hierarchy hid subjects without released curriculum | Patch | Subject/grade hierarchy includes registered subjects and configured books; availability is separate. |
| Focused tests did not cover several assignment associations on one card | Patch | Catalog tests verify overlap retains multiple assignment IDs. |
| Verification section recorded expectations instead of final evidence | Patch | This record lists executed checks and their limits. |
| Subject summaries changed misleadingly under active lesson filters | Patch | Summary derives from the unfiltered catalog. |
| Pending/removed membership and class-resource denial are not tested by this slice | Defer to I2 | I2 Story 2.3 owns resource-route membership authorization and regression tests. |
| Duplicate lesson assignments could read the first assignment's pathway evidence | Patch | Pathway selection validates and constrains the explicit assignment ID. |
