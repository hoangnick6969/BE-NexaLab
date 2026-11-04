---
title: 'Book cover thumbnails from PDF page 1'
type: 'feature'
created: '2026-11-03'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '54df61fb669eb7556b042a63f5194492e5115112'
baseline_repositories:
  fe: 'cc5e4b30e9e4a7ebe7a920a70fcbb4c25bb371c8'
  content_tool: '8f8e0ba29a897c5f8aef96280c3f2cc94e354ebf'
context:
  - '{project-root}/AGENTS.md'
  - 'D:/coding/NEXA/nexalab-fe/AGENTS.md'
  - 'D:/coding/NEXA/nexalab-content-tool/specs/NexaLab_Content_Tool_Master_Plan_Lean_v5.5.md'
---

<frozen-after-approval reason="user-authorized feature; decisions below are grounded in current contracts">

## Intent

**Problem:** The student ebook library uses a CSS placeholder instead of the book's actual cover, and the subject-grade picker has only a book icon. Content Tool can render PDF pages locally, but has no flow to upload a cover or associate it with an ebook edition.

**Approach:** Let an operator preview page 1 locally, select the matching BE ebook edition, confirm publication rights, and upload an optimized JPEG through the existing private Asset/R2 flow. Store the immutable AssetVersion on the edition and render it in the ebook library and matching subject-grade card.

## Boundaries & Constraints

**Always:** Keep source PDFs local; only send the page-1 image after explicit operator action and publication-rights confirmation. Require an ADMIN token, a real license/source/attribution, and the existing shared-library upload policy. Preserve the latest P2 video workflow and all OCR, provenance, and release gates. Store asset references, never signed URLs; authorize reads through the BE.

**Never:** Upload a book automatically, publish a source PDF, persist/log credentials, expose a public R2 URL, or bypass the Asset validation/quarantine and audit paths. Do not broaden this into general media management or change video metadata behavior.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Preview cover | Imported PDF with page 1 | Show a local JPEG preview labelled PDF page 1 and the source book | Missing/invalid PDF yields a local error; no network request |
| Upload and attach | Selected edition, supported license/source/attribution, ADMIN token, rights confirmed | Upload only the derivative as a shared image Asset, then attach its pinned version to the edition | Keep an uploaded-but-unattached asset visible with retry guidance if attach fails |
| Unavailable cover | No cover, quarantined/deleted asset, expired signed URL, or unavailable R2 | Show the existing subject/book fallback; retry authorized access when appropriate | Never break catalog navigation |
| Rights or configuration blocked | Rights not confirmed, license/source missing, non-ADMIN token, uploads disabled | Do not upload or attach; keep local preview available | Show the backend reason without retaining the token |

</frozen-after-approval>

## Code Map

- `D:/coding/NEXA/nexalab-content-tool/src/nexalab_content_tool/m0a_review.py` -- local Studio API already renders source PDF pages at `/api/m1/source`; add the bounded cover preview and authenticated upload/attach orchestration here.
- `D:/coding/NEXA/nexalab-content-tool/src/nexalab_content_tool/m1_ui.html` -- existing Books & Chapters workflow, password-only BE token field, and video panel; add an explicit cover preview, edition selector, rights confirmation, and upload status.
- `D:/coding/NEXA/nexalab-content-tool/src/nexalab_content_tool/m1_workflow.py` -- imported book metadata, source SHA-256 and local-processing rights; reuse these to identify the exact local source and keep publication rights separate.
- `D:/coding/NEXA/nexalab-be/prisma/schema.prisma` -- `EbookEdition` represents subject/version/URL; add a nullable cover AssetVersion reference because the UI lists editions per grade.
- `D:/coding/NEXA/nexalab-be/src/modules/assets/interface/assets.controller.ts` and `application/asset-versions.ts` -- reuse presigned upload, signature/hash validation, shared-library license/source gates and immutable `assetv:` references; JPEG/PNG are supported, WebP is not.
- `D:/coding/NEXA/nexalab-be/src/modules/curriculum/interface/catalog.controller.ts` and `admin-curriculum.controller.ts` -- expose cover references in both catalog responses and add an ADMIN-only audited attach/clear operation.
- `D:/coding/NEXA/nexalab-be/src/modules/assets/application/asset-versions.ts` and `interface/admin-assets.controller.ts` -- allow student reads only for an active attached cover and include ebook-edition references in asset deletion guards.
- `D:/coding/NEXA/nexalab-fe/src/features/ebook/EbookLibraryPage.tsx` and `src/components/SubjectGradeChapterBrowser.tsx` -- replace the CSS cover/icon for matching editions with authorized images and retain current fallbacks.
- `D:/coding/NEXA/nexalab-fe/src/lib/api.ts` -- reuse `inlineMaterial` / asset access handling; signed URLs remain transient.
- Do not alter Content Tool video P2 contracts, source PDFs, lesson release logic, or production database state.

## Tasks & Acceptance

**Execution:**
- [x] `nexalab-content-tool/src/nexalab_content_tool/m0a_review.py` and `m1_ui.html` -- preview PDF page 1, list/select BE editions, upload one rights-cleared JPEG using the transient token, attach it, and report partial failures without losing the asset reference.
- [x] `nexalab-be/prisma/schema.prisma`, a Prisma migration, curriculum and asset modules -- add nullable edition relation, validated audited attach/clear API, student read authorization for attached cover images, and deletion-reference protection.
- [x] `nexalab-be/src/modules/curriculum/interface/catalog.controller.ts` -- return the cover reference for authorized subject and Open Curriculum catalog consumers.
- [x] `nexalab-fe/src/features/ebook/EbookLibraryPage.tsx`, `src/components/SubjectGradeChapterBrowser.tsx`, and catalog types -- display the edition-matched cover, use authorized ephemeral image URLs, and preserve an accessible fallback.
- [x] Update the Content Tool usage notes to distinguish local processing permission from publication rights and document the new explicit upload step.

**Acceptance Criteria:**
- Given an imported PDF, when the operator previews its cover, then the image is generated locally from physical PDF page 1 and the source PDF remains local.
- Given no ADMIN token, no supported license/source/attribution, or no rights confirmation, when upload is requested, then the tool makes no BE/R2 upload.
- Given a valid ADMIN request and selected ebook edition, when its JPEG upload completes, then BE confirms a READY, ACTIVE shared image AssetVersion and records its immutable reference on that edition with an audit entry.
- Given a student opens the ebook library or a matching subject-grade catalog card, when the edition has an accessible cover, then the real image appears; missing, quarantined, or unavailable covers use the existing fallback.
- Given an asset referenced as an ebook cover, when an admin tries to delete it, then the existing asset reference guard prevents deletion until the cover is detached.
- Given a failed attach after successful upload, when the operator retries, then the tool reuses the uploaded version instead of creating duplicate assets.

## Implementation Notes

## Spec Change Log

## Review Triage Log

- `blind-hunter #1` — `low` — Rejected: the bearer token is sent only to the HTTPS or loopback API base the operator entered; the workflow labels this field as the NexaLab API base, and a remote-host allowlist would add a new configuration contract not captured in the approved intent.
- `blind-hunter #2` — `low` — Rejected: the operator explicitly selects an edition from a list that displays subject and version, while imported books have no subject ID to compare; adding a source-to-subject mapping would require new metadata beyond the approved workflow.
- `blind-hunter #3` — `medium` — Patched: when the source book has a grade, the Tool now hides editions with unknown grades and rejects an unknown or mismatched edition grade server-side.
- `blind-hunter #4` — `medium` — Patched: the subject-grade catalog now prefers the edition marked `isCurrent`, with a deterministic last-version fallback when no current edition is present.
- `blind-hunter #5` — `medium` — Patched: cover attachment requires `rightsConfirmed: true` and records the assertion in the audit event; clearing remains available to ADMIN without a publication assertion.
- `blind-hunter #6` — `medium` — Patched: local rendering caps the raster at 2,000 pixels on the longest edge and 4 MP, avoiding unbounded page dimensions.
- `blind-hunter #7` — `medium` — Patched with #6's bounded derivative: the generated JPEG is also rejected above 9 MB, below the default 10 MB Asset image limit.
- `blind-hunter #8` — `low` — Rejected with a recorded residual: an interrupted single or multipart transfer remains visible under its immutable reference and is not duplicated, but the current Tool cannot resume it; adding resume/abort lifecycle support is a broader API change and transfer interruption is uncommon.
- `blind-hunter #9` — `medium` — Patched: the Tool now accepts attach success only when BE returns the requested edition ID and exact uploaded version reference.
- `blind-hunter #10` — `low` — Rejected: image access is eager, but each derivative is now bounded and the library is edition-sized; adding observer-driven loading is a separate performance change without current volume evidence.
- `blind-hunter #11` — `medium` — Deferred: the reviewer identified missing authorization/lifecycle assertions; this task explicitly prohibits adding or running tests.
- `edge-case-hunter #1` — `medium` — Patched: the upload title is truncated to the Asset API's 200-character limit.
- `edge-case-hunter #2` — `medium` — Patched with `blind-hunter #3`: source-grade matching fails closed if the edition grade is absent or different.
- `edge-case-hunter #3` — `medium` — Patched: a process-local lock serializes cover upload and attach operations, preventing concurrent Tool requests from racing on the same local upload record.
- `edge-case-hunter #4` — `low` — Rejected with a recorded residual: if BE commits upload initialization but its response is lost before the Tool receives the version ID, local recovery is impossible without a new BE idempotency key contract; this is a narrow transport failure and broader API change.
- `edge-case-hunter #5` — `low` — Rejected with `blind-hunter #8`: a partial transfer retains its reference and is not duplicated, but resume/abort support is outside the specified failed-attach retry path.
- `edge-case-hunter #6` — `medium` — Patched: `/subjects` again returns the full `EbookEdition` shape, and Open Curriculum now includes `isCurrent` for edition selection.
- `verification-gap #1` — `medium` — Deferred: focused attached/detached student cover authorization tests were not added because this task prohibits tests.
- `verification-gap #2` — `medium` — Deferred: focused ADMIN attach/clear audit tests were not added because this task prohibits tests.
- `verification-gap #3` — `medium` — Deferred: attribution persistence and cover-attachment tests were not added because this task prohibits tests.
- `verification-gap #4` — `medium` — Deferred: FE cover rendering and fallback tests were not added because this task prohibits tests.
- `verification-gap #5` — `medium` — Deferred: a route test proving unchecked rights causes no BE or storage request was not added because this task prohibits tests.
- `verification-gap #6` — `medium` — Deferred: a failed-attach retry test proving the same version is reused was not added because this task prohibits tests.

## Design Notes

The ebook library creates one card per edition, so the cover belongs to `EbookEdition`, not `Subject`. The subject-grade picker should select the edition whose configured grade matches the card. Shared covers stay in private storage: students receive short-lived authorized access only while the version is attached and active.

## Verification

**Commands:**
- `npm run lint` and `npm run build` in BE and FE -- expected: checks and production bundles succeed.
- `python -m compileall src/nexalab_content_tool` -- expected: Content Tool Python modules compile.

**Manual checks (if no CLI):**
- Preview page 1, verify no request is sent until rights confirmation and upload, then confirm the selected edition cover appears for a student and falls back after detach.
**Run results:** BE and FE npm run lint and npm run build passed; python -m compileall -q src/nexalab_content_tool passed. Full npm run db:generate was retried with escalation but remained blocked by Windows EPERM replacing the Prisma query-engine DLL; npx prisma generate --no-engine had generated local TypeScript types successfully.

**Deferred manual check:** No database migration or real asset upload was performed, and the upload/student-view flow was not manually exercised.
