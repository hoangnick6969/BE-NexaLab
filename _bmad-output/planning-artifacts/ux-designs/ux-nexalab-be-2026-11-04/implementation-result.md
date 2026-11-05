# Student UI/UX round-two implementation

Date: 2026-11-05 (Asia/Saigon). Frontend branch: `codex/ui-ux-upgrade`.

| Accepted finding | Implemented result | Evidence |
|---|---|---|
| 1. Mobile navigation clipped | Hide obsolete header wrapper; reserve safe-area content padding; keep labels visible | Stable phone browser check |
| 2. Invented official progress | Remove synthetic courses, percentages and versions; separate assignments | Live empty-course API/UI plus fixtures |
| 3. Wrong assignment completion | Select by assignmentId and canOpen; safe state when completion API fails | Pure and rendered regression |
| 4. Lost reading/CTA refinements | Restore accepted rules; contained desktop reading, single phone flow, compact next action | Desktop/tablet/phone DOM checks |
| 5. Modal keyboard lifecycle | Native dialog plus focus containment, Escape, scroll lock and focus restoration | Browser keyboard fixture |
| 6. Progress visual language | Real covers matched by subject/grade; restrained fallback; neutral/brand progress; unknown stays unavailable | Source and course fixtures |
| 7. Competing CTA/assignment alert | Secondary SGK action; quieter notice, spaced title/meta | Source and stable browser screenshot |
| 8. Empty catalog rows | Shared subject/grade cover grid, grade on each card, title below portrait cover | Stable desktop screenshot |
| 9. Repeated source controls | Compact source links with printed/PDF page distinction and exact target | Source review; provenance preserved |
| 10. Resume wrong activity | Actual reading/video/exercise selection; explicit Review and error states | Pure and rendered video-resume regression |
| 11. Heavy lab imports | Lazy scenes; lightweight evidence/metadata; local retry and explicit reload fallback | Static import graph and browser failure/retry |
| 12. Assignment context leaks | Preserve assignment only for same lesson | Routing regression |
| 13. History URL drift | Tabs and attempts synchronize with URL, including nested sheet return | Pure and read-only browser checks |

## Verification

- `npm run lint`: passed.
- `npm run test:regression`: 13 passed, 0 failed; registered in CI.
- `npm run test:ui-browser`: six isolated browser checks passed earlier in the implementation. The harness intercepts API responses and blocks unknown/write requests.
- Final production build: passed outside the filesystem sandbox after a sandbox-only EPERM. `git diff --check` passed. Final Lab entry: 82.98 KB raw / 27.78 KB gzip; shared OrbitControls: 839.89 KB raw / 226.18 KB gzip.
- Independent blind, edge-case and verification review completed. Actionable findings were patched; individual triage is recorded in the implementation spec.

The previous successful bundle comparison reduced the Lab entry from approximately 784 KB to 83 KB raw (250 KB to 28 KB gzip). Shared 3D dependencies remain large and load when needed. These are bundle measurements, not device LCP/INP or production speed claims.

## Scope and limits

No shared database migrations, seeds, submissions, LabRuns or release activation. Live official curriculum remains unconfigured; configured-course UI used browser-only fixtures. Teacher/parent/admin and production/device acceptance were not audited here.

Additional final browser capture was blocked by automatic approval review usage limits; the service did not classify the action as unsafe. Incorrect/transient final captures were removed rather than presented as evidence. Valid captures remain `output/playwright/ui-review-2026-11-04/after/lessons-desktop.png` and `after/lesson-mobile.png` (the latter predates the final breadcrumb cosmetic fix).

The existing broad stylesheet formatting was preserved. This report supersedes the recommendation-only completion statement in the original review; the original remains the historical baseline.
