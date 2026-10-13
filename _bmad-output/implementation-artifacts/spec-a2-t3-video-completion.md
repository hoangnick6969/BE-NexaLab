---
title: 'A2-T3 Resume and Complete Video or Equivalent Text'
type: 'feature'
created: '2026-10-13'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '4fe9e1b5224981bbc5375736bebfce8df4c029a3'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-2-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** After reading is complete, the authoritative pathway exposes a VIDEO step but students cannot play or resume video, use the published transcript/equivalent, or persist evidence that unlocks the next step.

**Approach:** Extend the existing assignment-scoped progress mutation with VIDEO-specific evidence and render a non-autoplay player or approved equivalent text that reconciles local playback with the returned server pathway.

## Boundaries & Constraints

**Always:** Derive the student from auth and revalidate the active assignment, approved enrollment, published lesson, same-lesson current VIDEO step, and published resource inside the serializable transaction. Accept strict action-specific payloads: media `heartbeat`/`ended` require integer seconds with `0 <= positionSeconds <= durationSeconds <= 86400`; `complete-fallback` carries no client timing and is allowed only when non-empty `equivalentText` is published. Persist `lastPosition` and integer percentage monotonically, preserve first completion evidence, complete at at least 90 percent or `ended`, keep aggregate progress monotonic, and return `{ step, pathway }`. The browser must not autoplay, must batch observations rather than write per playback event, and must retain unsent high-water evidence after recoverable failure.

**Never:** Trust client-supplied percentage/status/student identity; lower prior position or progress after backward seeking; accept fallback completion without a configured equivalent; optimistically unlock the next step; implement study cards, Quiz scoring, lab/challenge behavior, video authoring, DRM, or offline download.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|----------------------------|----------------|
| Resume playback | Current URL-backed VIDEO; valid heartbeat | Store max position and server-derived percent; reload returns resume evidence | Reject malformed, non-finite, negative, inverted, or oversized timing |
| Complete media | Heartbeat reaches 90% or valid `ended` | Complete once and return next server-authorized step | Duplicate/backward updates preserve high-water and first completion time |
| Complete equivalent | Current VIDEO has published `equivalentText` | Explicit action completes the step | Return 404 without disclosing config when fallback is absent or step is unavailable |
| Dependency failure | Batched write fails | Keep official pathway unchanged and retain the unsent local high-water for retry | Visible retry; no saved/completed claim |

</frozen-after-approval>

## Code Map

- `src/pathway.ts` -- VIDEO config validation and pathway serialization; normalize optional null URL from historical backfill and expose `lastPosition` as resume evidence without exposing locked resources.
- `src/routes.ts` -- generalize the current reading-only progress handler into a strict reading/video action union while preserving the existing serializable authorization/write/response transaction.
- `prisma/schema.prisma` -- existing `StepProgress.progressValue`, `lastPosition`, status, timestamps, and composite identity are sufficient; no migration is expected.
- `scripts/integration.mjs` -- extend the disposable dynamic lesson flow with URL/transcript/equivalent config and assertions for bounds, authorization, monotonicity, 90%/ended, fallback, idempotency, and reload.
- `../nexalab-fe/src/pages.tsx` -- render the current VIDEO resource, transcript/equivalent, local high-water state, batched mutation, retry, and server-authoritative cache replacement.
- `../nexalab-fe/src/api.ts` -- add the smallest authenticated blob-URL helper needed for inline `asset:` video and revoke object URLs on cleanup; external URLs remain direct.
- `../nexalab-fe/src/styles.css` -- add scoped responsive player/transcript/progress states with 44px controls and no horizontal overflow.
- `../nexalab-fe/tests/video-completion.spec.ts` -- deterministic media/fallback browser coverage; do not modify the separately owned A1 harness defects.

## Tasks & Acceptance

**Execution:**
- [x] `src/pathway.ts`, `src/routes.ts` -- implement the canonical VIDEO contract, monotonic evidence, resume serialization, fallback authorization, and authoritative response.
- [x] `scripts/integration.mjs` and focused unit tests -- cover the full edge-case matrix and prove reload-safe evidence with no duplicate/downgrade.
- [x] `../nexalab-fe/src/api.ts`, `src/pages.tsx`, `src/styles.css` -- implement accessible non-autoplay playback/equivalent UX, transcript toggle, batching, retained retry state, and cache reconciliation.
- [x] `../nexalab-fe/tests/video-completion.spec.ts` -- verify keyboard-accessible fallback and deterministic media completion/reload without relying on real network media.

**Acceptance Criteria:**
- Given an applicable student on a current URL-backed VIDEO step, when playback observations advance or seek backward, then the server stores only the highest valid position/percentage and reload resumes from that evidence.
- Given playback reaches 90 percent or emits `ended`, when the server confirms persistence, then VIDEO completes exactly once and the UI advances to the returned next step.
- Given unavailable media with an approved published equivalent, when the student explicitly completes it, then fallback completion persists; the same action is denied when no equivalent is configured.
- Given a recoverable write failure, when the student retries, then the highest unsent observation is sent and no false saved/completed state was shown before confirmation.
- Given keyboard, reduced-motion, and narrow viewport use, then controls, transcript/equivalent, status, retry, and the single primary action remain operable without autoplay or horizontal overflow.

## Implementation Notes

Use integer seconds because the persisted resume field is an integer. Derive `progressValue` with `floor(positionSeconds / durationSeconds * 100)` and compare the precise ratio to the 90 percent completion threshold. Batch new high-water observations at a 10-second delta and flush on pause/ended; retain the maximum unsent observation until a server-confirmed response. Existing pilot seed content is equivalent-only, so API integration should use a disposable URL-backed step while browser coverage may deterministically exercise the seeded fallback plus mocked media events.

Implemented the VIDEO progress union on the existing assignment-scoped transaction, reused the existing progress records without a migration, added authenticated inline asset loading, and reconciled every successful mutation from the returned authoritative pathway. No A2-T4 behavior was added.

## Spec Change Log

## Review Triage Log

| ID | Verdict | Route and evidence |
|---|---|---|
| B01 | false | The approved contract intentionally accepts bounded playback evidence while deriving percentage, status, identity, and gates on the server; trusted media duration metadata is not available in the published resource model. |
| B02 | medium | patch -- `ended` previously produced `COMPLETED` with a low percentage; reconciliation now persists 100 while preserving the high-water position and first timestamps. |
| B03 | false | A stale flush flag alone never dispatches; a follow-up occurs only when evidence arrived while the justified request was in flight, limiting the sequence to one coalesced follow-up. |
| B04 | medium | patch -- successful equivalent completion could leave stale unsent media state; it now clears the observation/flush state and reconciles the local position from the response. |
| B05 | low | rejected -- the specified bounded batching flushes at ten seconds, pause, and ended; an unload keepalive would add a second auth/write path for at most the bounded unsaved tail. |
| B06 | maybe-false | defer -- `asset:` uses an authenticated Blob because the current file contract requires headers; whether memory/latency is harmful depends on real asset sizes and production delivery behavior not available in this story. |
| B07 | maybe-false | defer -- the same Blob path cannot cancel its fetch today; material harm depends on large/slow uploaded video usage and is grouped with B06. |
| B08 | false | A2-T4 remains locked by design, so the authoritative response has no next step to assert; the browser does prove response reconciliation by rendering the confirmed completed state. |
| B09 | medium | patch -- no executable test covered the new authenticated asset branch; Playwright now covers auth headers, 401 refresh/retry, Blob URL creation, and revocation. |
| B10 | low | patch -- disclosure controls now expose stable `aria-expanded` and `aria-controls` relationships for transcript and equivalent content. |
| B11 | false | Runtime failure already leaves a visible, keyboard-operable equivalent disclosure button; automatic expansion is not required for the content to remain available. |
| B12 | false | A serialization failure is surfaced as a recoverable error and the client retains high-water evidence for explicit retry; there is no silent downgrade or false completion. |
| E01 | high | defer -- published lessons can be edited in place while retaining deterministic step IDs, so old playback evidence is not resource-version-bound; this is a pre-existing publication/versioning decision shared by all step evidence and needs a separate contract decision. |
| E02 | low | patch -- source state is now cleared before a replacement resource begins loading, preventing the prior direct URL from remaining playable during replacement. |
| E03 | low | rejected -- same bounded-tail observation as B05; adding lifecycle keepalive is disproportionate to this story's explicit batching contract. |
| V01 | medium | patch -- reload coverage now emits `loadedmetadata` and asserts that the media element seeks to the persisted high-water second. |
| V02 | medium | patch -- browser coverage now emits `ended` below 90 percent and verifies an `ended` request plus server-confirmed 100 percent completion. |
| V03 | medium | patch -- Playwright now executes the authenticated asset load, refresh retry, Blob source, and cleanup path. |
| V04 | medium | patch -- Playwright now proves no write below ten seconds and one write exactly at the batching boundary. |

## Design Notes

The response adds nullable `lastPosition` to each pathway step. This is evidence only, not authorization; `state` and `nextStepId` remain server-derived. A URL and equivalent may coexist so the same published fallback can be used after a runtime media failure.

## Verification

**Commands:**
- Backend `npm test`, `npm run lint`, `npm run build`, `node --check scripts/integration.mjs`, and `npm run test:integration` against the configured seeded development API/database.
- Frontend `npm run lint`, `npm run build`, and `npm run test:e2e -- tests/video-completion.spec.ts` against the local API/browser stack.
- Review both repository diffs and verify no A2-T4 implementation or production-readiness claim was introduced.

**Results (2026-10-13, rerun after review patches):**
- Source/static: backend and frontend TypeScript lint passed; backend build passed; frontend Vite production build passed; `node --check scripts/integration.mjs` passed; tracked and untracked whitespace checks passed.
- Automated: backend Vitest passed 37/37 tests; configured development API/database integration passed 76/76 assertions; focused Edge Playwright passed 3/3 tests, including batching, recoverable write retry, below-threshold ended completion, actual resume seek, keyboard fallback, reduced motion, 390px overflow, authenticated asset refresh/retry, Blob URL creation, and cleanup.
- Runtime: local API/database and browser flows were executed; media bytes were intentionally mocked/aborted so behavior was deterministic and did not depend on a third-party stream.
- Production: not deployed or verified in production.
