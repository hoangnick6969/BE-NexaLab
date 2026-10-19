---
title: 'Student learning catalog route hierarchy'
type: 'refactor'
created: '2026-10-19'
status: 'in-review'
baseline_commit: '639857132d829d89ae1cd0abd94f2ce91b9d9070'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/docs/product/prd.md'
  - '{project-root}/_bmad-output/planning-artifacts/increment-i1-epic-01-open-curriculum.md'
  - '{project-root}/../nexalab-fe/docs/design/08-STUDENT-P0-UX-DEFINITION.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The student Lessons, Class Space, and Assignments surfaces currently hide a multi-level catalog inside one component state tree. The result has no deep links or reliable browser-back behavior, renders distracting zero-content subject/ebook placeholders, and performs one assignment-detail request per item.

**Approach:** Replace the in-page browser with route-level progressive disclosure: grade-grouped subject selection, a dedicated ordered chapter table of contents, and a dedicated chapter content screen. Reuse one hierarchy read model across the three destinations while preserving each destination's access and action rules.

## Boundaries & Constraints

**Always:** `/lessons`, `/classes`, and `/assignments` remain distinct destinations. Lessons show only released shared lessons and eligible assigned lessons. Every lesson card opens lesson content first; for an assigned lesson, `/lessons/:id?assignmentId=:assignmentId` preserves authorized, assignment-scoped reading/video progress, while a separate explicit action opens `/assignments/:id` for taking the assignment. Class Space remains membership-scoped and preserves pending enrollment states. Grades sort numerically ascending; chapters and items use canonical order where supplied, then Vietnamese numeric-aware title order. Every hierarchy level has a deep-linkable URL, visible breadcrumb/back path, recoverable loading/error/empty state, keyboard focus treatment, at least 44px touch targets, responsive 375px behavior, and reduced-motion support. Existing teacher/admin routes and lesson/assignment detail routes remain valid.

**Never:** Do not show subjects or grades with zero eligible content as curriculum cards. Remove the current “no ebook link” mock presentation from the student catalog; do not delete the separate ebook reader route. Do not invent I2 class-resource APIs, custom Lab tabs, taxonomy IDs, or assignment lifecycle states. Do not change authorization, progress evidence, scoring, or seed data.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|---------------|----------------------------|----------------|
| Released catalog | Grades 6–9 with multiple subjects and chapters | `/lessons` groups subjects under ascending grade headings; subject route opens ordered chapters; chapter route opens only its lessons | Missing route data shows a useful empty state and link back to the nearest valid parent |
| Assigned overlap | One lesson is shared and assigned | It appears once, marked assigned, offers separate “Học nội dung” and “Làm bài tập” actions; content opens the authorized lesson pathway with that assignment context | Archived-not-started content remains unavailable with server notice |
| Class membership | Approved and pending classes | Class list opens a dedicated class screen only for membership data already returned; pending classes expose no content actions | API failure keeps class shell and exposes retry |
| Assignment catalog | Many assignments across classes/subjects | One list read supplies hierarchy metadata; no per-assignment detail waterfall is required | Unavailable items are separated from actionable hierarchy |

</frozen-after-approval>

## Code Map

- `src/learning/learning.controller.ts` -- student assignment list; enrich its response with content hierarchy metadata in bounded batch queries while preserving authorization and availability semantics.
- `../nexalab-fe/src/app/App.tsx` -- add non-conflicting catalog/class detail routes before existing `:id` detail routes and update top breadcrumb labels.
- `../nexalab-fe/src/lesson-catalog.ts` -- canonical client normalization, grouping keys, and deterministic grade/chapter/item ordering.
- `../nexalab-fe/src/features/lessons/StudentLessonsHub.tsx` -- convert the hub to grade-grouped subject cards and remove zero-content/ebook placeholder directory.
- `../nexalab-fe/src/features/ebook/ebook.tsx` and `src/progress/student-access.service.ts` -- open assigned lesson content on the lesson detail route and reuse the authorized assignment pathway response for content/progress.
- `../nexalab-fe/src/components/SubjectGradeChapterBrowser.tsx` -- URL-backed subject/grade/chapter screens shared by Lessons, Class Space, and Assignments.
- `../nexalab-fe/src/features/classes/classes.tsx` -- keep teacher UI intact; move student class cards to links and render student class hierarchy on dedicated routes.
- `../nexalab-fe/src/features/assignments/StudentAssignments.tsx` -- use the enriched list for lessons, labs, and assigned tests while retaining I3 status and direct detail routes.
- `../nexalab-fe/src/components/SubjectGradeChapterBrowser.tsx` -- provide the URL-backed shared grade/subject/chapter hierarchy and destination-specific item count labels.
- `../nexalab-fe/src/styles.css` -- remove obsolete directory/browser rules and add responsive catalog, TOC, skeleton, focus, and reduced-motion states using existing Student tokens.

## Tasks & Acceptance

**Execution:**
- [x] `src/learning/learning.controller.ts` -- batch-fetch authorized assignment content summaries and return subject, grade, chapter, topic, and ordering fields -- eliminate the client N+1 detail waterfall.
- [x] `../nexalab-fe/src/lesson-catalog.ts` and student feature pages -- implement one normalized route hierarchy and destination-specific item actions -- keep ordering and access rules consistent without duplicating business logic.
- [x] `../nexalab-fe/src/app/App.tsx` -- register explicit hierarchy routes and breadcrumbs -- provide shareable navigation and correct browser back behavior without colliding with existing detail IDs.
- [x] `../nexalab-fe/src/styles.css` -- implement scannable grade sections, numbered chapter rows, responsive cards, skeleton reservation, focus-visible and reduced-motion behavior -- meet the Student UX source of truth.
- [x] `src/progress/student-access.service.ts`, `../nexalab-fe/src/features/ebook/ebook.tsx`, and `../nexalab-fe/src/features/lessons/StudentLessonsHub.tsx` -- serve lesson content/materials in the authorized pathway and keep reading/video separate from assignment-taking -- avoid redirecting learners into the assessment flow or a duplicate assignment-detail read.
- [x] `../nexalab-fe/src/features/ebook/ebook.tsx` -- load PDF.js dynamically when the ebook reader opens -- keep PDF runtime out of the initial lesson-detail chunk.
- [x] Relevant BE/FE tests -- add batch summary and no-fan-out coverage, catalog hierarchy navigation, and assigned-only normalization coverage. FE browser execution remains blocked by missing Playwright Chromium.

**Acceptance Criteria:**
- Given eligible curriculum exists across several grades, when a student enters any of the three destinations, then they navigate through separate URLs for grade/subject, chapter table of contents, and content rather than expanding every level on one page.
- Given a subject has no released or eligible assigned content, when the Lessons hub renders, then no zero-count or “no ebook link” subject card is shown.
- Given a student has N actionable assignments, when Assignments or Class Space loads, then the client does not issue N `/assignments/:id` requests.
- Given an assigned lesson is shown in Lessons, when the student chooses “Học nội dung”, then the reading/video detail opens without redirecting to the assignment; “Làm bài tập” remains a separate explicit action.
- Given a 375px viewport or keyboard-only navigation, when the hierarchy is used, then cards do not overflow, targets remain at least 44px, focus is visible, and back/breadcrumb navigation remains operable.
- Given an actionable I3 test assignment linked to a ClassResource lesson, when the student opens `/assignments`, then it appears under that lesson's subject, grade, and chapter with its I3 status still visible.
- Given a legacy actionable test with no usable lesson link, when the student opens `/assignments`, then its direct detail link remains available in an explicitly ungrouped section rather than disappearing.

## Implementation Notes

- The student `/lessons` landing now shows only eligible content grouped by ascending grade and subject; zero-content subjects and the “no ebook link” directory are removed. Dedicated subject/grade TOC and chapter screens use `/lessons/catalog/grades/:grade/subjects/:subjectId/chapters/:chapter`.
- `/classes` now links to membership-scoped `/classes/:classId/catalog` screens. Pending membership exposes only its pending state; approved membership gets assignment-derived subject/grade/chapter hierarchy. No new Class Space resource or Lab API was introduced.
- `/assignments` uses the enriched list endpoint and keeps assignment detail links on `/assignments/:id`. All three destinations share the route-based hierarchy component; chapter/item order uses supplied canonical order then Vietnamese numeric-aware title comparison.
- Assignment list summaries are batch-loaded for lesson/lab content and retain the previous student authorization and availability checks. Lessons and Class Space no longer issue per-assignment detail reads to build their catalogs.
- Assigned lesson rows now expose separate “Học nội dung” and “Làm bài tập” links. The content route carries the selected `assignmentId`; student pathway returns published lesson content/materials so the detail page can load reading/video and assignment progress in one request, while task-taking remains on `/assignments/:id`.
- The lesson detail route lazy-loads the PDF.js runtime only when the ebook reader is opened. FE production build output placed the lesson-detail module at 77.98 KB (26.72 KB gzip) and PDF.js in a separate 483.14 KB (144.26 KB gzip) chunk; this is a bundle split observation, not an API latency claim.
- I3 test assignments now receive hierarchy metadata through one bounded ClassResource batch plus the shared lesson summary batch; the batch also replaces per-test availability lookups. Tests use their linked lesson's existing subject/grade/chapter metadata and stay within the student's already-authorized assignment list.
- `/assignments` now displays actionable lesson, practical, and test assignments through the same grade → subject → chapter routes. Test state and due-soon reminders remain visible; legacy tests without a usable lesson mapping stay directly reachable in an explicit fallback section.

## Spec Change Log

## Review Triage Log

## Design Notes

Use stable route namespaces such as `/lessons/catalog/...`, `/classes/:classId/catalog/...`, and `/assignments/catalog/...` so existing `/lessons/:id` and `/assignments/:id` detail contracts remain unambiguous. The hierarchy is progressive disclosure, not a client-side accordion: each route fetches from shared React Query caches and renders only its own level.

## Verification

**Commands:**
- `npm run lint` in both repositories -- expected: TypeScript checks pass.
- `npm run build` in both repositories -- expected: production builds pass; retry environment-only Windows `EPERM` outside the sandbox if required.
- Relevant focused BE and FE tests -- expected: hierarchy metadata and navigation scenarios pass without changing authorization behavior.

**Manual checks:**
- Inspect Lessons, one Class Space, and Assignments at 375px, 768px, and desktop; verify deep links, browser back, skeleton stability, no horizontal overflow, and no per-assignment request waterfall.

**Run results:**
- BE `npx vitest run src/learning/learning.controller.test.ts`: 3 tests passed after retrying outside the sandbox for Windows `EPERM` during Vite realpath resolution.
- BE `npm run lint`: passed.
- FE `npm run lint`: passed.
- FE `npm run build`: passed after retrying outside the sandbox for Windows `EPERM` while resolving `src/main.tsx`.
- BE `npm test -- src/learning/learning.controller.test.ts src/progress/progress.test.ts`: 16 tests passed after retrying outside the sandbox for Windows `EPERM` during Vite realpath resolution.
- FE `npx playwright test tests/student-lessons-hub.spec.ts --reporter=line`: unable to launch tests because the configured Chromium headless executable is not installed. The test assertions did not run; no browser package was installed.

**Latest verification (2026-10-19):**
- BE `npm run lint`, `npm run build`, and `npx vitest run src/learning/learning.controller.test.ts` passed; 4 focused tests passed.
- FE `npm run lint` and `npm run build` passed after retrying outside the sandbox for Vite's Windows `EPERM` realpath issue.
- FE `tests/student-lessons-hub.spec.ts` passed 4/4 in installed Chrome against local Vite. The assignment catalog test also exercised 375px width with reduced motion, confirmed no horizontal overflow, and confirmed zero per-assignment detail requests.
- Browser checks used mocked API responses; live API/database and the full FE browser suite were not rerun. 768px/tablet and landscape visual checks remain outstanding.
