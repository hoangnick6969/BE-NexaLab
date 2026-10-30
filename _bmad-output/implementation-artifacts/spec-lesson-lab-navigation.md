---
title: 'Contextual lesson and Lab navigation'
type: 'feature'
created: '2026-10-30'
status: 'done'
route: 'oneshot'
review_loop_iteration: 1
context: []
---

<frozen-after-approval reason="human-owned intent">

## Intent

**Problem:** The published Circuit activity appears as a detached link only for students outside assignment context. Learners cannot identify its related section or return from the Lab to that section.

**Approach:** Add a dedicated Lab tab and an activity card at the verified B22 section I, with two-way navigation that retains the lesson assignment context. Show related lessons on Lab pages and library cards using validated active release bindings. The user confirmed the Lab tab plus contextual section link. Keep the active release, scientific scope, existing assessment and progress semantics unchanged.

</frozen-after-approval>

## Implementation Notes

- B22 section verified through the published lesson API: `section-sgk-khtn8-nxbgd-2026-p0093-b0011-c295fcf1`, heading I, circuit components and closed circuit.
- Add read-only catalog metadata for related published lessons, retaining immutable binding validation. Allow existing public lesson-Lab reads for STUDENT, TEACHER and ADMIN.
- Keep explicit UI section placement separate from scientific release content, validate that the section exists before displaying an inline card, and never infer support for section II.
- Preserve lesson assignment context only as return navigation; do not pass a lesson assignment ID as a standalone Lab assignment ID.
- Local implementation and focused tests first. Deploy authorization is separate.
- Implemented a URL-addressable Lab tab, contextual section-I activity card, bound-lesson links on the Lab library and Lab page, and assignment-aware return navigation. ADMIN navigation respects the existing library-only Lab route; teachers can preview the published bulb activity without writing student evidence.
- Raw teacher/admin and assigned lesson reads omit structured section projection. Fetch the canonical public reading only for lessons with a validated active Lab binding, while keeping assignment progress and write endpoints on their original pathway. The existing public reader allows teacher/admin reads with its published, shared, released-pack filters intact.
- Both backend and frontend builds passed into separate `.local/lesson-lab-build` artifact directories. After explicit human authorization, deployed those artifacts to the existing API at port 4000 and frontend at port 5173.
- Final checks: 21/21 mocked Playwright browser cases (13 new navigation cases plus 8 nearby regressions), including mobile and delayed public-section reads; 11/11 backend checks including isolated PostgreSQL authenticated HTTP catalog/public-reader access and existing structured-reading unit checks.
- Screenshots: frontend `test-results/lesson-lab-tab.png` and `test-results/lesson-lab-mobile.png`. The active Circuit snapshot, shared assignments and shared Attempts were not mutated.
- Live post-deployment checks passed for STUDENT, TEACHER and ADMIN: Lab tab, verified inline section-I placement, role-appropriate activity/library link, return navigation to the reading section and library-to-lesson navigation. Student mobile layout also passed. This read/navigation acceptance created no LabRun or Attempt.
- Live evidence: backend `.local/lesson-lab-live-result.json`, `.local/lesson-lab-live-*-tab.png`, `.local/lesson-lab-live-mobile.png`. Read-only preservation check `.local/lesson-lab-data-preservation.json` confirmed the exact active Circuit v2 digest and unchanged fingerprints for the original two assignments and 25 Attempts.

## Review Triage Log

- medium, patched: omitted section placement previously recomputed a nonexistent return anchor. Return anchors now require an explicit sectionId matching the known placement; missing-section navigation returns to the Lab tab, covered by regression.
- medium, patched: unavailable URL tabs could leave no accessible selected tab. Resolve selected tabs against loaded availability, retaining the pending Lab tab only during loading; labs/video/exercise/materials deep-link regressions pass.
- medium, patched: raw lesson readers could enable launch before canonical section projection resolved. Hold the launch action while that projection is fetching; a delayed-public-response regression confirms section context is retained.
- low, patched during visual inspection: without a chapter sidebar, the lesson main column occupied only the grid's narrow first column. The sole main column now spans the grid; desktop-width and mobile-overflow assertions pass.
