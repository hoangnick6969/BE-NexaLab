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

- `nexalab-fe/src/pages.tsx` — lesson list/modal and ebook link; reuse API and sanitized HTML.
- `nexalab-fe/src/App.tsx`, `src/api.ts`, `src/styles.css` — authenticated routes, API client, and responsive patterns.
- `nexalab-be/src/routes.ts` — subjects expose ebookUrl; lessons are role/assignment filtered. No annotation API exists.
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

## Spec Change Log

## Review Triage Log
