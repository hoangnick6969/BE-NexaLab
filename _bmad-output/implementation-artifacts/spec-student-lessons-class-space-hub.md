---
title: 'Student lessons hub and Class Space navigation'
type: 'feature'
created: '2026-10-18'
status: 'in-review'
route: 'dispatch'
review_loop_iteration: 1
baseline_commit: 'cf679c3c1172e8a1c3e2f300b7f33e7f595ab5cd'
context:
  - '{project-root}/docs/product/prd.md'
  - '{project-root}/_bmad-output/planning-artifacts/increment-i2-epic-02-class-space-resources.md'
  - '{project-root}/_bmad-output/planning-artifacts/increment-i3-epic-03-assigned-test-lifecycle.md'
  - '../nexalab-fe/docs/design/08-STUDENT-P0-UX-DEFINITION.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The student `/lessons` page currently loads only released shared curriculum, while student `GET /lessons` returns only assigned lessons. Students therefore cannot find assigned lessons beside the shared subject/book catalog, and the existing `/classes` screen is not reachable from student navigation.

**Approach:** Make `/lessons` the student hub for all registered subjects and configured external book links, with released shared lessons plus applicable assigned lesson content. Give assigned lessons a prominent section and a filter that distinguishes assigned work from the unassigned shared catalog. Add a student sidebar entry to the existing `/classes` route as the Class Space destination; I2 owns the membership-scoped resource experience within it.

**Always:** Preserve I1 release eligibility for shared lessons. Use existing authorized assignment list/content APIs for assigned lesson cards and route those cards through `/assignments/:id`, preserving assignment-specific progress and evidence. A lesson that is both shared and assigned is one card, marked assigned. Keep scored test assignment lifecycle in Assignments, not the shared lesson catalog. Class resource access is limited to active, approved members server-side.

**Never:** Do not loosen publication/review/rights gates, expose unreleased/synthetic shared lessons, infer subject content from placeholders, merge assignment progress into foundational progress, or treat sharing a class resource as creating an assignment. Do not invent a Class Space resource API in this navigation change.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Shared and assigned overlap | Released lesson is also an applicable assignment target | One lesson card, prominent as assigned, opens the authorized assignment | Assignment API remains authoritative |
| No assigned lessons | Student has no applicable lesson assignments | Show all available shared lessons/books and an empty assigned filter state | Recoverable read errors offer retry |
| No released lessons | No released shared lessons and no assigned lessons | Show subjects/books without claiming unavailable lessons are published | Explain that lesson content is not yet released |
| Pending/removed class member | Membership is not active and approved | Class Space shows membership state; no class resource access is implied | Server denies resource routes |

</frozen-after-approval>

## Code Map

- `src/routes.ts` -- existing `/open-curriculum` release-gated catalog, student assignment-only `/lessons`, and `/assignments` access contract; preserve these boundaries and honor an explicit assignment ID for assignment-specific pathway reads.
- `../nexalab-fe/src/pages.tsx` -- student lesson list, subject/book links, filters, and lesson grouping; combine existing API results and avoid placeholder subjects.
- `../nexalab-fe/src/ebook.tsx` -- shared lesson details use Open Curriculum; assignment-only lesson cards must open existing assignment detail instead.
- `../nexalab-fe/src/App.tsx` -- student sidebar and `/classes` route; teacher/admin class navigation remains unchanged.
- `../nexalab-fe/src/classes.tsx` -- existing student membership screen, to be named and presented as Class Space entry point; I2 adds resource views.
- `docs/product/prd.md`, `../nexalab-fe/docs/design/08-STUDENT-P0-UX-DEFINITION.md`, and I2/I3 planning artifacts -- align product, UX, and story integration contract.

## Tasks & Acceptance

**Execution:**
- [x] Update PRD and Student UX to define `/lessons` as the unified subject/book hub, the assigned/shared distinction, and Class Space as a separate student destination.
- [x] Update I2 to own the student Class Space sidebar/screen/resource listing and membership states; update I3 to keep scored assigned tests in Assignments and define lesson-card integration boundaries.
- [x] Update FE student `/lessons` data composition, assigned prominence/filter, all-subject book links, and student Class Space navigation without changing teacher/admin flows.
- [x] Add focused tests for lesson union/deduplication/filter behavior and run relevant frontend checks.

**Acceptance Criteria:**
- Given any student, when they open `/lessons`, then all registered subjects and configured external book links are discoverable, while shared lesson cards include only I1-released lessons.
- Given a student has an applicable assigned lesson, when they open `/lessons`, then it appears in a prominent assigned section and the assigned filter, with assignment/class context and an authorized assignment link.
- Given a lesson is both released shared content and assigned, when displayed, then it appears once and is classified as assigned; an unassigned shared lesson appears under the shared-curriculum filter.
- Given a student opens Class Space from the sidebar, when the route loads, then the existing `/classes` screen opens; I2 adds class-resource listing there with active-approved membership authorization, while teacher/admin behavior is unchanged.
- Given a teacher assigns scored test content, when the student navigates learning surfaces, then due/status/submission controls remain in Assignments per I3 and are not duplicated as shared lessons.

## Implementation Notes

Planning facts: intent gaps are resolved by the user's explicit hub/navigation direction plus existing PRD boundaries; no database or external side effect is required; footprint spans the BE PRD and I2/I3 specs plus FE UX, navigation, class page, lesson page, and the assignment pathway's explicit assignment selector. API authorization remains server-owned; the existing `/lessons` list and `/assignments` list are joined, with authorized assignment detail used only for eligible archived-started lessons omitted from the published lesson list.

## Design Notes

Composition rule: shared catalog items are fetched through the I1 release-gated endpoint; published assigned lessons and metadata are joined from existing student `/lessons` and `/assignments` APIs, with authorized detail fallback only for eligible archived-started items. Merge by lesson ID, attaching assignment associations; never use class membership alone as assignment eligibility. Assignment card actions open the corresponding `/assignments/:id` flow and its selected assignment ID scopes the pathway; unassigned shared cards retain `/lessons/:id`.

## Verification

**Commands:**
- `npm run lint` (frontend) -- passed after final edits.
- `npm run build` (frontend) -- passed after final edits.
- `npx playwright test tests/lesson-catalog.spec.ts` (frontend) -- passed; covers overlap dedupe, multiple assignment associations, assigned/shared filters, and empty lists.
- `npx playwright test tests/student-lessons-hub.spec.ts` -- authored to cover hub composition, assignment links, subject book link, student Class Space navigation, and pending membership UI; could not launch because this environment has no installed Chromium/Edge executable.
- `npx vitest run src/access.test.ts` (backend) -- passed; verifies assignment-specific pathway lookup retains active class/enrollment/target constraints.
- `npm run build` (backend) -- passed (`tsc -p tsconfig.json`).
- `git diff --check` -- attempted in both repositories, but Git returned `fatal: this operation must be run in a work tree` despite `git status` recognizing the repository. Not counted as passed; builds and tests cover syntax/type correctness.

**Not run:** backend integration/API against a live database and browser end-to-end against a running app. The pending/removed Class Space member/resource scenario remains I2-owned and is not implemented by this navigation slice.

## Review Triage Log

| Finding | Classification | Disposition |
|---|---|---|
| Assignment-detail fan-out silently ignored individual failures | Patch | Replaced per-assignment requests for normal published lessons with the existing `/lessons` + `/assignments` reads; detail fallback failures now fail the query and use retry UI. |
| Assigned card assumed subject metadata was always flattened | Patch | Retained the assignment detail's nested subject fallback in `buildStudentLessonCatalog`; card reads `subject.name` supplied by the authorized student APIs. |
| Open-catalog failure could be described as an empty release state | Patch | Suppressed the shared-catalog empty state when that query has an error. |
| One detail request per eligible assignment created avoidable request volume | Patch | Joined existing list endpoints and limited detail reads to eligible archived-started lessons absent from the published list. |
| Assignments for the same lesson were hard to distinguish in card actions | Patch | Card actions now include assignment title, class, and due date. |
| UX hierarchy still said to hide subjects without released curriculum | Patch | Updated subject/grade hierarchy to include registered subjects and books, with lesson availability separated. |
| Focused tests did not cover several assignment associations on one card | Patch | Extended catalog test to assert a shared/assigned overlap is one card retaining both assignment IDs. |
| Verification section recorded expectations rather than final evidence | Patch | Replaced expectations with actual commands and outcomes; listed API/browser checks not run. |
| Subject summaries changed misleadingly under active lesson filters | Patch | Summary now derives from the unfiltered catalog. |
| Pending/removed membership and class-resource denial are not tested by this slice | Defer to I2 | This story only adds navigation; resource routes and their membership authorization belong to I2 Story 2.3. Keep the frozen edge-case requirement and verify it with I2's resource-list/detail access tests. |
| Duplicate lesson assignments could read the first assignment's pathway evidence | Patch | Added optional, membership/target-constrained `assignmentId` to pathway selection and pass the selected assignment from `/assignments/:id`. |
