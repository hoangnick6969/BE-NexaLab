---
title: Student UI and UX round two
type: bugfix
created: 2026-11-04
status: done
route: dispatch
baseline_commit: 0d76be5644d31d9743d93a908763fc31517270ca
context: []
---

<frozen-after-approval reason="User explicitly approved implementation of the round-two review in this session">

## Intent

Correct the student learning interface identified in the accepted deep UI/UX review: trustworthy progress, valid resume and assignment context, usable mobile navigation and dialogs, cohesive cover/card/CTA presentation, and isolated loading of heavy lab renderers.

## Boundaries & Constraints

Always preserve the user-selected real portrait book covers with titles below, explicit lesson title in reading content, compact next-lesson links, server-authoritative learning evidence, role restrictions, and existing unpublished work. Keep the prior broad uncommitted CSS formatting changes; repair conflicting rules and restore the missing accepted lesson refinements without replacing the stylesheet wholesale. User approval of the report and request to implement it authorize this scope and preservation of existing generated reports.

Never mutate shared databases, migrations, seeded evidence or release gates. Do not invent course versions, percentages, titles, covers, assignment completion, or next activities. No push or deploy. Do not auto-complete learning while checking the interface.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| No official course | Course API returns courses empty/configured false | Honest unconfigured/empty state; assignments remain separate | Retry on failed API, no sample progress |
| Assignment selection | Assignment unavailable or completed for that assignment | Skip it for Continue | Use scoped assignment evidence, not global lesson completion |
| Open resume | Valid unfinished published lesson, no unfinished assignment | Resume its actual available activity; identify the lesson | Loading/error stay explicit |
| Phone shell | 390 by 844 viewport | All five nav labels visible inside fixed bar | Respect safe-area and reserve content padding |
| Course modal | Keyboard opens and closes detail | Initial focus, contained Tab, Escape close, focus restored | Direct close has a valid fallback |
| Context navigation | User leaves assigned lesson for a different chapter lesson | No unrelated assignmentId on target URL | Server authorization stays unchanged |
| History URL | Direct attempt URL, then close or change tab | URL and visible state agree | Invalid/forbidden evidence uses existing error presentation |
| Lab import failure | One heavy scene chunk fails | Local retry/error; unrelated lab metadata remains loadable | No authoritative simulation logic changes |

</frozen-after-approval>

## Code Map

All frontend paths below are relative to `../nexalab-fe` from the backend repository root.

- `src/features/progress/StudentProgress.tsx`: remove DEFAULT_* synthetic progress and assignment-derived official course fallback. Course modal, history URL state and subject-card presentation live here.
- `src/features/progress/EvidenceSheet.tsx`: existing focus and evidence patterns; use for consistency.
- `src/features/dashboard/StudentDashboard.tsx`: assignment candidate selection and open-lesson resume query/copy. `/assignments` lacks completion; `/me/progress` has assignment-specific completion.
- `src/features/lessons/LessonDetail.tsx`: chapter and prev/next links, source citations, reading title and tabs.
- `src/components/SubjectGradeChapterBrowser.tsx`: real cover rendering and root grade/subject card grouping; retain deep links.
- `src/styles.css`: mobile shell's stale direct-child brand selector, conflicting reading-scroll override, missing final refinements, patterned progress card and red glow bars.
- `src/features/labs/runtime/activity-renderers.tsx` and `checkpoint-views.tsx`: eager scene imports; preserve readiness/default-state/model contracts.
- `src/lib/api.ts`: existing authenticated assets and query types.

## Tasks & Acceptance

**Execution:**
- [x] Correct official-progress and Continue data sources without synthetic fallback.
- [x] Repair mobile bar and reconcile missing reading/card/CTA refinements with working CSS.
- [x] Complete modal focus handling and URL-backed history state.
- [x] Keep real covers; flatten visual hierarchy for SGK, status, source citations and progress cards.
- [x] Arrange root subject/grade cards together when there are few books.
- [x] Remove unrelated assignment context from cross-lesson navigation.
- [x] Lazy-load heavy activity renderers and isolate recoverable loading failures.
- [x] Run meaningful selection/routing tests, FE typecheck/build and targeted browser checks.

**Acceptance Criteria:**
- Given an unconfigured official curriculum, when Progress opens, then no invented percent/version/course appears.
- Given completed global lesson evidence and an unfinished assignment for that lesson, when Home opens, then that assignment remains eligible.
- Given a phone viewport, when navigating student pages, then all bottom labels and last page actions remain visible.
- Given long reading content on desktop, when scrolling it, then reading stays contained and next navigation stays compact; phone keeps a usable single reading flow.
- Given a real cover is available, when viewing catalog/course cards, then the same source is used and the title remains below it; unavailable covers use a restrained fallback.
- Given a keyboard user, when opening/closing modal or moving between history tabs, then focus and URL reflect the visible state.
- Given a lab is opened, when its scene loads, then unrelated heavy scenes are not eagerly imported by the registry.

## Implementation Notes

The user explicitly authorized all round-two findings and preservation of current work. Existing FE checkpoint is the baseline; broad unstaged CSS and BE audit artifacts are expected existing work. Independent file ownership is assigned to progress, Continue/routing, and lab-loading workers; root owns CSS, shared catalog and final integration.

## Verification

- FE `npm run lint` and `npm run build` must pass.
- Run focused regression checks for assignment selection, routing and URL state as feasible without a shared database.
- Use the existing student login only to read pages. Check 390x844, desktop 1440x1000, and a short landscape viewport. Do not submit exercises or mark content complete.

## Review triage

Independent blind, edge-case and verification reviewers examined the implementation. All actionable findings below are resolved; duplicate coverage observations are retained explicitly.

| Finding | Decision and evidence |
|---|---|
| Completion API failure blocks all Continue | Fixed: explicit retry/safe assignment destination; open resume remains independent. Browser fixture passed. |
| Background fetching hides cached Continue | Fixed: only initial loading hides a missing candidate; cached data remains visible. |
| Stale in-progress summary offers unfinished reading | Fixed: completed supported activities offer Review. Regression passed. |
| Unsupported activity masquerades as reading | Hardened: explicit supported types; unsupported returns no inferred activity. Regression passed. |
| Cover lookup failure should block progress | Rejected: optional cover metadata must gracefully fall back without hiding official progress. |
| Unknown percent rendered as measured zero | Fixed: unavailable text, no measured progress element. Browser fixture passed. |
| Import retry can retain failed module cache | Fixed: explicit reload after retry failure, with unsaved-work warning; no automatic reload. |
| Lazy retry lacks behavioral coverage | Resolved: isolated browser harness checks import failure/retry and preserved props. |
| Dashboard helper tests lack rendered coverage | Resolved: isolated browser harness checks assignment, open-video resume and completion API failure. |
| Modal lacks keyboard verification | Resolved: browser fixture checks initial focus, Tab/Shift+Tab, Escape and opener restoration. Explicit wrapping added. |
| Verification reviewer: lazy recovery unverified | Duplicate retained: browser harness passed rejected import and persistent render failure cases. |
| Node checks not registered in CI | Fixed: test:regression registered in CI; Playwright excludes the Node-only dashboard test. |
| Nested evidence sheet URL loses attempt context | Fixed: shareable attempt URL, return-to-step clears attempt params; read-only browser check passed. |

## Implementation result

All thirteen accepted round-two items are implemented in the frontend. No backend source, simulation scoring, release gates or shared database state changed. The existing broad stylesheet formatting was preserved while conflicting reading rules were removed and accepted refinements restored.

The official course endpoint currently returns no configured courses. That live state is presented honestly; configured-course covers, missing percentages and keyboard modal states were checked using browser-only fixtures. These checks do not activate a curriculum.

### Recorded verification

- Final TypeScript check: passed.
- Final regression suite: 13 passed, 0 failed (assignment scope, activity routing, history URL, evidence defaults and static lazy import graph).
- Isolated browser harness: six checks passed earlier in this implementation, using intercepted local fixtures and blocking unknown/write API requests.
- Read-only authenticated browser: empty official course state, history step/attempt navigation, stable mobile navigation and contained desktop/tablet reading checked.
- Modal fixture: keyboard containment, Escape and focus restoration passed; unknown percentage has no measured progress bar.
- Stable phone 390x844: bottom navigation remains inside viewport. Desktop reading panel capped at 640px with inner scrolling; phone uses a single reading flow.
- Production build result is recorded in the companion implementation report.

Additional final browser capture was not executed because automatic approval review hit its usage limit. This was a review-service failure, not an unsafe-action determination. Earlier successful browser checks remain separate evidence. Teacher/parent/admin, production deployment, real-device field metrics and complete lab scientific acceptance are outside this student UI round.

Final production build passed on 2026-11-05 outside the restricted filesystem sandbox; git diff --check passed. Final Lab entry: 82.98 KB raw / 27.78 KB gzip; shared OrbitControls: 839.89 KB raw / 226.18 KB gzip.
