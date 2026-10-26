---
title: 'P1 SGK source viewer'
type: 'feature'
created: '2026-10-25'
status: 'in-review'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '023ea4842e49959d468d6e3e5b3a784aa04fe8f6'
context:
  - 'D:/coding/nexalab-fe/AGENTS.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Students can see provenance in 47 published KHTN 8 Lessons but cannot open the referenced textbook page in the Lesson. The subject ebook URL is public and is not a secure source-document contract.

**Approach:** Match each released structured Lesson's existing textbook SHA-256 to one immutable shared PDF `AssetVersion`, authorize it through the existing asset access API, and render the exact existing one-based `physicalPageIndex` in an in-Lesson PDF viewer. Keep the Lesson mounted so reading position survives open/close; use a desktop side panel and a mobile full-screen overlay.

## Boundaries & Constraints

**Always:** Preserve source block IDs, textbook digest, and one-based physical pages; fail closed on missing, duplicate, mismatched, quarantined, or inaccessible assets; use short-lived signed URLs; lazy-load PDF.js/ranges; keep actions keyboard-accessible; retain Markdown/KaTeX and Open Curriculum authorization.

**Never:** Infer pages from printed labels/ranges; expose a public PDF URL; persist signed URLs; rerun OCR/reimport; change Releases, Outcomes, Labs, legacy data, or Content Tool artifacts; add an ebook migration. Skip the optional context menu unless trivial after acceptance.

**Human decisions:** The project owner confirms publisher permission for NexaLab and attests the authorization. Record the classification as publisher permission with documentary evidence pending; do not invent a public/open license, legal document ID, URL, or verification claim. Upload only to private storage in verified Supabase project `eiotlkegrejjhldsvaqp` as the remote development/pilot target, using authorized short-lived access. Preserve all Lessons and assignments.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Valid source | Referenced page and one eligible PDF with matching SHA-256 | Show `Xem trong SGK`; open exact page in panel/overlay | Refresh an expired signed URL once |
| Invalid reference | Missing, zero, non-integer, digest mismatch, or page beyond loaded document | Do not navigate to a guessed page | Keep Lesson usable and explain that the source page is unavailable |
| PDF unavailable | No/duplicate match, quarantine, storage/render failure | Keep provenance visible | Retry/close without losing Lesson scroll |

</frozen-after-approval>

## Code Map

- `src/modules/learning/interface/learning.controller.ts` -- public Lesson contract and digest-matched source blocks.
- `src/modules/assets/application/asset-versions.ts` -- extend `canReadVersion` for an exact published structured-manifest book digest, never title/URL matching.
- `src/modules/assets/interface/assets.controller.ts` -- reuse short-lived `GET /assets/versions/:id/access`.
- `src/modules/storage/interface/local-storage.controller.ts` -- add signed HEAD and single-range GET parity with R2 so local PDF.js does not fetch the full 25 MB document.
- `src/modules/learning/interface/learning.controller.test.ts` and asset/storage tests -- digest, access, page, range cases.
- `../nexalab-fe/src/features/lessons/LessonDetail.tsx` -- turn existing source evidence rows into visible actions and own viewer open/close state without unmounting reading content.
- `../nexalab-fe/src/features/ebook/SourcePdfViewer.tsx` -- lean PDF.js renderer using existing dynamic worker/ranges, without annotations.
- `../nexalab-fe/src/lib/api.ts` -- obtain authorized asset access metadata; do not materialize the whole PDF blob.
- `../nexalab-fe/src/styles.css` -- desktop side panel and mobile fixed full-screen overlay.
- `../nexalab-fe/tests/student-lessons-hub.spec.ts` -- mapping, responsive/failure behavior, scroll, Math regression.
- `../nexalab-content-tool/workspaces/m1-khtn8-acceptance/exports/structured/` -- read-only mapping evidence; no changes required.

## Tasks & Acceptance

**Execution:**
- [x] BE learning and asset modules -- expose one unambiguous digest-matched source document and authorize its READY shared PDF version.
- [x] BE local signed storage -- implement HEAD/Range responses with bounded reads and tests.
- [x] FE Lesson/source viewer -- add mandatory per-reference action, exact-page navigation, responsive panel/overlay, retry/close states, and preserved reading position.
- [x] Acceptance fixtures/tests -- cover chapters I, V, and VIII using pages 13, 86, and 172 with source digest `6dcda104a5b09d1395417afef9ac48630843e57dc53938412eada13a6fdfdbf1`.
- [ ] Authorized environment operation -- upload once through ADMIN shared-asset flow with exact digest/license/source; verify no public URL. Target project is verified but currently has no eligible PDF; the existing bucket is public-only and dashboard access redirects to sign-in. No authenticated Supabase Storage upload session/credential is available in this workspace.

**Acceptance Criteria:**
- Given a valid published source block, when a student selects `Xem trong SGK`, then the matching immutable PDF opens at the exact page with matching digest identity.
- Given desktop and mobile viewports, when the viewer opens and closes, then it appears as a side panel or full-screen overlay respectively and the Lesson reading scroll position is unchanged.
- Given unavailable storage or an invalid/out-of-range reference, when attempted, then the Lesson stays readable and no page is guessed.
- Given representative Lessons from chapters I, V, and VIII, when their source actions are tested, then pages 13, 86, and 172 map to the same pinned textbook digest and Markdown/KaTeX rendering remains unchanged.
- Given a production FE build and configured browser test runtime, when verification runs, then build and focused browser tests pass.

## Implementation Notes

## Spec Change Log

- 2026-10-25: Owner-attested publisher permission and Supabase pilot target resolved all planning questions; specification reached ready-for-dev and implementation started.
- 2026-10-26: Code and local/browser acceptance completed. Remote upload remains unchecked because the configured object store is Cloudflare R2 while the authorized remote target is Supabase Storage, and no Supabase Storage CLI session/service credential is available.

## Review Triage Log

| Finding | Decision | Resolution |
|---------|----------|------------|
| Signed GET URLs may reject a preceding HEAD request | Fix | FE now starts with the bounded `GET Range: bytes=0-...` using the authorized byte count. |
| Source lookup/authorization must require a structured released manifest | Fix | Source query is gated by `structured-lesson-candidate`; student authorization checks published shared Lessons, released packs, and exact digest. |
| Duplicate matching PDFs could bypass the direct access path | Fix | Student access requires exactly one eligible digest match; Lesson response also fails closed unless exactly one is found. |
| Disabled source action relied on a tooltip | Fix | Keep the visible disabled `Xem trong SGK` action and render the unavailability note inline. |
| Viewer needed keyboard focus containment/return | Fix | Mobile modal traps Tab; Escape closes; closing restores focus to the invoking action. Desktop panel remains non-modal. |
| Stale source page could survive Lesson/tab changes | Fix | Clear selected page when Lesson ID or active tab changes. |
| Byte-range parser lacked suffix-range support and controller evidence | Fix | Support suffix ranges; test 206 bounded reads, 416, HEAD metadata, and ordinary streaming. |
| Browser scroll/range assertions were too weak | Fix | Use overflowing lesson content, assert preserved `scrollTop`, and assert all PDF fetches are ranged GETs. |
| Representative fixtures did not identify the published Lessons | Fix | Use the three verified published Lesson IDs from project `eiotlkegrejjhldsvaqp`, with their original block IDs/pages and common book digest. The PDF bytes remain a synthetic browser fixture because no authorized PDF is stored in the target. |
| Signed URL refresh, network timeout, and mobile scroll behavior were unverified | Fix | Add one-refresh browser case, a bounded request timeout, mobile body scroll lock, and contained PDF viewport overscroll. |
| Publisher-permission classification lacked an executable test | Fix | Add a test asserting `PUBLISHER_PERMISSION` and its explicit Vietnamese label; no open license or documentary evidence is claimed. |
| Assigned pathway source viewing was not available | Defer | Outside the Open Curriculum source-reference path in this P1; assignment and Lesson data remain unchanged. |
| Route-manifest evidence was missing | Fix | Baseline and current routes retain the same method, path, roles, and public flag; storage handler gains request metadata only for HEAD/Range behavior. |

Review result: implementation findings were fixed or explicitly deferred as scoped above; private PDF upload remains an environment blocker, not an implementation finding.

## Design Notes

`physicalPageIndex` is established as one-based by the Content Tool validator and the existing PDF.js reader. The API must return no `sourceDocument` when digest resolution finds zero or more than one eligible PDF version. R2 already supports ranges; local signed storage needs parity only.

## Verification

**Commands:**
- `npx tsx scripts/route-manifest.ts src` before and after BE work -- expected: route manifest unchanged unless HEAD support is represented separately.
- `npm run lint && npm test && npm run build` in `D:/coding/nexalab-be` -- expected: PASS.
- `npm run lint && npm run build && npx playwright test tests/student-lessons-hub.spec.ts` in `D:/coding/nexalab-fe` -- expected: PASS.

**Manual checks:**
- Verify the three released API responses against their source artifacts and confirm the browser requests byte ranges rather than eagerly downloading the complete PDF.

**Executed evidence (2026-10-26):**
- BE `npm run lint`, `npm run build`, and 26 focused Vitest cases: PASS.
- FE `npm run lint`, production `npm run build`, and all 11 `student-lessons-hub.spec.ts` Chromium cases: PASS.
- Read-only query against Supabase project `eiotlkegrejjhldsvaqp` verified the published Lessons and exact source references: Phản ứng hoá học (page 13, block `...p0013-b0001`), Hiện tượng nhiễm điện do cọ xát (page 86, block `...p0086-b0001`), and Môi trường và các nhân tố sinh thái (page 172, block `...p0172-b0001`); all use digest `6dcda104a5b09d1395417afef9ac48630843e57dc53938412eada13a6fdfdbf1`.
- The same read-only query found zero eligible READY shared PDF AssetVersions matching that digest. The target project is `ACTIVE_HEALTHY`; its existing Storage bucket is public-only. Dashboard navigation redirects to sign-in, and no authenticated Supabase Storage upload session/credential is available in this workspace. No upload was attempted outside the authorized Supabase Storage target.
- `npx tsx scripts/route-manifest.ts src`: PASS for unchanged method, path, roles, and public flag. The storage handler adds a request argument to implement HEAD and Range; the route shape is unchanged.
- `git diff --check`: PASS.
