---
title: 'Student lesson detail and ebook reader'
type: 'feature'
created: '2026-10-16'
status: 'ready-for-dev'
route: 'dispatch'
review_loop_iteration: 0
context:
  - 'D:/coding/nexalab-fe/AGENTS.md'
  - 'D:/coding/nexalab-fe/docs/design/08-STUDENT-P0-UX-DEFINITION.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Lesson content is in a cramped modal and the external ebook has no study workspace. Students need a clear lesson page and reader with navigation and personal annotations.

**Approach:** Replace the modal with a responsive detail route and add an authenticated ebook reader. Render the PDF in-app with page navigation, text highlight/underline, and notes synced through user-scoped APIs.

**Human decisions:** Store notes/marks in the student's account for cross-device sync. Use text selection for highlights/underlines and anchor notes to the selected passage and PDF page.

**Boundaries & Constraints**

**Always:** Preserve lesson authorization, assignment progress gates, sanitized lesson HTML, HTTPS ebook URLs, and Student P0 responsive/accessibility rules. Scope annotations to the authenticated owner and ebook fingerprint.

**Never:** Seed or publish test content to production; copy the remote PDF into app storage; change quiz, assignment, or progress semantics; imply that the external ebook is hosted or rights-cleared by NexaLab.

**I/O & Edge-Case Matrix**

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Open lesson | Authorized lesson | Detail shows objective, content, materials, assessment and ebook action | Retry/back on API error |
| Open ebook | Valid HTTPS URL | PDF, page controls, annotations and return link | Retry/open externally if unavailable |
| Save annotation | Text selection and annotation | Sync and restore for same account and PDF version | Keep editor content and offer retry |
| No ebook | Missing/unsafe URL | Detail remains usable; reader explains unavailable book | Clear unavailable state |

</frozen-after-approval>

## Code Map

- `../nexalab-fe/src/features/ebook/ebook.tsx` — lesson detail, sanitized reading content, video/material tabs, PDF reader, annotations, and retry states.
- `../nexalab-fe/src/app/App.tsx`, `../nexalab-fe/src/lib/api.ts`, `../nexalab-fe/src/styles.css` — authenticated routes, typed API contracts, and responsive patterns.
- `src/learning/learning.controller.ts`, `src/progress/student-access.service.ts`, and `src/lessons/ebook.controller.ts` — student assignment pathway/content access and user-scoped ebook annotation APIs.
- `nexalab-be/prisma/schema.prisma` — User/Subject relations for new account annotations.
- `nexalab-fe/docs/design/08-STUDENT-P0-UX-DEFINITION.md` — Student responsive/accessibility constraints.

## Tasks & Acceptance

**Execution:**
- [ ] `nexalab-fe/src/pages.tsx` — detail and reader screens; separate reading/assessment and add text annotations.
- [ ] `nexalab-fe/src/App.tsx`, `src/styles.css` — routes, breadcrumbs and responsive accessible screens.
- [ ] `nexalab-be/prisma/schema.prisma` and migration — account-owned annotations anchored to ebook version, page and text range.
- [ ] `nexalab-be/src/routes.ts` — validated annotation CRUD scoped to the current user and subject ebook.
- [ ] `nexalab-fe/package.json`, lockfile, `src/api.ts` — add PDF text renderer and sync annotations; retain unsaved content on errors.

**Acceptance Criteria:**
- Given an authorized lesson, when the student opens it, then a readable detail page presents content separately from assessment and provides a clear ebook action when available.
- Given an assigned lesson with a quiz, when the student opens its detail, then reading and assessment have distinct sections and official submissions remain in the assigned-learning flow.
- Given a subject PDF, when the student uses the reader, then previous/next and page entry controls navigate the PDF, and the student can select text to highlight, underline, or attach a note.
- Given a saved annotation, when its owner opens the same ebook version on another device, then it returns at the saved text range.
- Given a different student requests an annotation, when they query or mutate the API, then they cannot read or change another user's annotation.
- Given a student without access to a lesson or a subject without a valid ebook URL, when a route is opened directly, then existing authorization holds and the UI explains the unavailable content.
- Given mobile width or keyboard-only input, when using detail/reader controls, then actions remain visible and operable.

## Verification

**Commands:**
- `npm run lint` and `npm run build` in `D:/coding/nexalab-be` and `D:/coding/nexalab-fe` — expected: TypeScript checks and production bundles succeed.

**Manual checks:**
- Sign in as student; verify detail/assessment separation, PDF navigation and annotation sync/isolation.
- Verify PDF/API failure recovery, mobile layout and keyboard use.

## Implementation Notes

Implemented in the current route architecture: `LessonDetail` lives in `../nexalab-fe/src/features/ebook/ebook.tsx`; student ebook annotations are served by `src/lessons/ebook.controller.ts`. Assigned lesson content opens from Lessons at `/lessons/:id?assignmentId=:assignmentId`, with a separate assignment-taking action. That view uses one authorized lesson-pathway read for content/materials and assignment progress. PDF.js is dynamically imported only when the ebook reader opens, keeping it out of the lesson-detail entry chunk.

Verification recorded for the route/content change: BE and FE lint/build passed; focused BE pathway/progress tests passed 16/16. The focused FE Playwright suite could not launch because Chromium is not installed, so its browser assertions and visual checks remain unverified. FE build output measured the lesson-detail module at 77.98 KB (26.72 KB gzip) and the separate PDF runtime at 483.14 KB (144.26 KB gzip); these are build sizes, not end-to-end latency measurements.

The student `/lessons` card is content-first: assigned content opens `/lessons/:id?assignmentId=:assignmentId` and retains assignment-scoped reading/video evidence; “Làm bài tập” remains a separate `/assignments/:id` action. The lesson-detail route gets content/materials/ebook URL from the authorized pathway request instead of issuing an additional assignment-detail request. PDF.js is dynamically imported only when the ebook reader loads, keeping the lesson-detail entry chunk separate from the PDF runtime.

## Spec Change Log

## Review Triage Log
