# Content Foundation (CF-T1..T4) — Implementation Record

Date: 2026-10-16
Branch: `feat/content-foundation` (BE and FE, stacked on `feat/c2-admin-operations`)
Purpose: platform contracts for curriculum packs, private R2 media, source ingestion, the release importer and simulation packs. This also delivers the C2-T3/C2-T5 surfaces that C2 deferred.
Runtime acceptance: isolated local PostgreSQL 18 + real Nest API + **real Cloudflare R2 development bucket** (`nexalab-dev`) + real Chrome/Vite.

## Delivered

### CF-T2 — Private R2 media and immutable asset versions

- **Storage boundary (`src/storage.ts`).** One interface with an R2 driver (S3 API, `@aws-sdk/client-s3` and `s3-request-presigner` pinned at 3.1140.0) and a local driver (HMAC-signed API URLs) for development and tests.
  - Server-generated keys; `staging/` and `assets/{private,shared}/` never share a prefix.
  - Credentials stay on the server; the browser only receives presigned URLs.
- **`npm run r2:check`** checks server put/head/range/stream SHA-256, presigned GET and PUT, multipart part ETag, copy, expired-URL refusal and delete. Result: **9/9 on R2 dev**.
- **Migration `20261016090000_cf_asset_versions`** adds `Asset` (scope, owner, status ACTIVE/QUARANTINED/ARCHIVED, licence/source) and `AssetVersion` (immutable; PENDING → VALIDATING → READY/FAILED; staging key, released key, declared/actual bytes, server SHA-256, expected SHA-256, multipart upload ID, validation result, 24 h expiry).
- **`/assets` API.**
  - `POST /assets/uploads`: presigned single PUT (≤64 MB), or multipart in 16 MiB parts with `/parts` presigned part URLs. `/complete` and `/abort` follow.
  - **Finalize** runs:
    - HEAD size against the declared size and the per-type budget;
    - bounded range read for the signature check;
    - GLB JSON-chunk inspection (node/animation inventory, external URI or script rejection) and WebVTT cue check;
    - a full streamed SHA-256 computed by the server (never the ETag), compared with an optional client claim;
    - the security-scan hook (recorded as not configured in development; it blocks READY in pilot/production);
    - then copy staging → released key and delete staging.
  - On failure the version becomes FAILED with a reason, the staging object is deleted, and the outcome is audited.
  - Expired uploads are aborted and cleaned up. Each user may hold at most 20 pending uploads.
  - `GET /assets/versions/:id/access` returns a short-lived signed GET after checks on owner, staff-for-shared, published-content reference and quarantine (admins always). `GET /assets/mine` lists the caller's assets.
- **Configuration-driven budgets (`src/media.ts`).** Uploads are disabled in pilot/production until `ASSET_BUDGETS_APPROVED=true` (Q-DATA-01/Q-C2-03).
- **Content pins versions.** References use `assetv:<versionId>`; published lessons accept only READY versions of ACTIVE assets that the actor owns or that are shared (clone inheritance kept). Legacy `asset:<uuid>` files still resolve.
- **`POST /files`** (≤20 MB form upload) now goes through the same storage, validation and immutable version. **`GET /files/:id`** redirects version IDs to a signed URL.
- **`npm run cf:migrate-assets`** moves local `AssetFile` rows into storage. It is a dry run by default.
  - `--apply` verifies object bytes and checksum, then rewrites `asset:` to `assetv:` in lessons, steps and labs with before/after counts.
  - `--delete-local` removes the local file only after verification.
  - Verified locally: dry run, apply (1 reference rewritten, 1 → 0 legacy references), and an idempotent rerun.
- **C2-T5 on the new model.** Admin asset list shows versions and references; quarantine, release, reassign and share (licence + source); delete is blocked by any reference and removes storage objects. Ownership resolution and deletion eligibility use `Asset`.
- **FE.** `uploadFile` uploads straight to storage (single or multipart, with progress hook); `openMaterial`/`inlineMaterial` use signed URLs for `assetv:`. The admin "Tệp" tab shows versions, storage, SHA-256 and references.

### CF-T1 — Versioned content packs and gates (`src/content-pack.ts`)

- **Strict manifest** covering grade 8/9, domain, outcomes, item-level sources (licence, attribution, authoritative flag, optional artifact version), knowledge units with claim → source links, lesson body, pinned `assetv:` materials with transcript and caption, stable question/option IDs with answer key, rationale and sources, and named editorial/subject/rights/accessibility reviews.
- **Hard gates.** A release is blocked when any of the following fails:
  - outcomes exist, are active and match the pack's grade/domain; synthetic outcomes are excluded from baseline;
  - licences are only ORIGINAL, CC0, public domain, CC BY, CC BY-SA or school-owned (REFERENCE_ONLY counts as evidence only); NC, ND and unknown licences are rejected;
  - every claim is sourced, and every important claim has two independent sources including an authoritative one;
  - answer keys point at real options;
  - every video has a transcript and a checked WebVTT caption;
  - materials are READY (and shared for baseline);
  - all four named reviews are present and subject ≠ rights; baseline reviewers must be active accounts;
  - synthetic packs stay in the `fixture` namespace only.
- **Coverage report** has five separate dimensions per grade × domain (mapped outcomes, reviewed knowledge units, released lessons, specified practicals, available simulations), each with numerator, denominator and gaps. Synthetic coverage is reported apart; the released denominator stays empty until CF-T5.

### CF-T3 — Source registry, ingestion and release importer

- **Migration `20261016100000_cf_sources_packs_releases`** adds `SourcePolicy` (+ versions), `IngestionRun`/`IngestionItem`, `SourceArtifact`(+ versions), `ContentPack`(+ versions), `ContentRelease`(+ items), and `Lesson.packVersionId`.
- **Policy schema** (`src/ingestion.ts`): access mode, connector, host/path/MIME allowlists, size cap, licence, storage policy (METADATA_ONLY or SNAPSHOT), rate limit, terms-review and recheck dates, optional ID allowlist.
- **Pre-fetch gates** reject a disabled source, `BOUNDED_CRAWL` (off in MVP), NC/ND/unknown licences, a REFERENCE_ONLY source with a snapshot, and overdue terms review.
- **Bounded fetch:**
  - HTTPS only;
  - manual redirects re-checked against the allowlist;
  - private-network (SSRF) guard, overridable only by `ALLOW_PRIVATE_SOURCE_HOSTS` in development/test;
  - robots.txt (RFC 9309 longest match);
  - size cap while streaming, MIME check and rate limit.
- **Connectors:** `http-document` and `pubchem` (CID allowlist → properties). Deduplication uses source + external ID + SHA-256 (DUPLICATE). A changed source creates a new artifact version. SNAPSHOT stores raw bytes privately in R2. Items end STAGED, DUPLICATE, REJECTED or NEEDS_REVIEW, and **nothing is ever published by ingestion**.
- **Content Release Importer** (`src/content-release.ts`, `npm run content:release`):
  - **Dry-run plan:** exact source and pack actions with every gate error.
  - **Apply:** only to the running environment; fixture releases can never target pilot/production. The approver must be an active admin, different from the initiator for baseline. One transaction creates source policy versions (new sources disabled) and pack versions, materializes a shared-library lesson pinned by `packVersionId`, writes the receipt and audits.
  - **Idempotency:** the same digest is a no-op. A changed pack becomes v2; v1 retires and its lesson archives (evidence kept).
  - **Retire** restores the superseded versions. A blocked manifest writes nothing.
- **Fixture manifest:** `content/releases/fixture-khtn8-energy.json` (synthetic pack plus a disabled PubChem policy).
- **Admin API and UI.** `/admin/sources` (create disabled, new versions, enable with gate check, disable, run ≤20 candidates), `/admin/ingestion/runs/:id`, `/admin/content/packs`, `/admin/content/coverage`, `/admin/releases` (list, dry-run plan, retire). New tabs "Nguồn & nhập liệu" and "Gói & phát hành". Apply stays CLI-only, with approval.

### CF-T4 — Practical activity and simulation pack registry (`src/sim-packs.ts`)

- **Migration `20261016110000_cf_simulation_packs`** adds `PracticalActivityVersion` (content-addressed, immutable, with subject and safety reviews), `SimulationPackVersion` (draft → active → retired), and `Attempt.packVersionId`.
- **Allowlisted model registry** (`circuit@1.0.0`, `chemistry@1.0.0`, `eye@1.0.0`) with output schema and required semantic IDs. `POST /attempts`, `/simulate/:labId`, golden cases and reproduction resolve the engine from the lab's `simulationModelRef` instead of a hardcoded lab switch; unknown references fail closed.
- **A pack pins** the activity version, model and engine version, template (units, ranges inside the model allowlist, initial state, limitations, golden cases with expected verdicts and outputs), optional GLB `AssetVersion`, semantic node map, declarative bindings and challenge templates.
- **Pack validation:**
  - unknown or mismatched model;
  - out-of-range template or challenge ranges;
  - missing required semantic IDs or duplicate nodes;
  - GLB missing mapped nodes or animations;
  - a binding reading an unknown output or targeting an unknown ID;
  - a binding that never fires on any golden output;
  - executable or remote values (`javascript:`, URLs, arrow functions, `eval`), which fail schema parsing;
  - golden cases not reproduced by the server engine.

  Activation needs a draft and, outside development/test, a Q-C2-04 range approval. The previous active pack retires; attempts pin the active pack; reproduction still explains earlier attempts.
- **Flagship fixtures:** `content/simulation-packs/flagship-fixture.json` holds activities and packs for circuit, chemistry and eye, all of which validate on the server engine.
- **UI.** The simulation tab lists packs per lab with golden-case results, GLB node counts and pinned attempts, and lets an admin activate with a reason.

## Verification (2026-10-16)

| Check | Result |
| --- | --- |
| BE build / lint | pass |
| Vitest | 144/144 (new `content-foundation.test.ts` 22: gates, coverage, policy/SSRF/robots/bounded fetch, media/GLB/VTT, pack registry, binding liveness) |
| `r2:check` (R2 dev) | 9/9 |
| `test:cf` (API + PostgreSQL + R2) | **60/60**: CF-T2 25, CF-T3 ingestion 15, importer 10, CF-T4 10; cleanup verified (0 leftovers) |
| `test:c2` with R2-backed assets | 80/80 + 1 justified SKIP |
| Playwright `cf-storage-live.spec.ts` (Chrome) | 1/1: browser PUT and 70 MB multipart straight to R2 through bucket CORS, ETags exposed, signed GET bytes match, no secret in responses; admin Tệp / Gói & phát hành / Nguồn tabs at 390 px without overflow |
| Playwright `c2-admin-live.spec.ts` | 1/1 |
| Regression (local, R2-backed uploads) | B0 9 pass (provider-delay SKIP), B1 172 (5 multi-IP SKIP: API on 127.0.0.1 only), B2 13/13, A1–A3 95/95, A5 53/53, C2 80/80, password-flow 6/6. `integration.mjs`/`b1-integration.mjs` now expect `assetv:` references, clean stored objects and run via tsx |

## Not claimed / gates

- **CF-T5 (corpus) is not started.** It needs the official Grade 8–9 outcome inventory, named editorial/subject/rights capacity (Q-DATA-02/03/04) and authored Vietnamese material. Only synthetic fixtures exist; the coverage denominator for released content is deliberately empty.
- **Production media** stays gated: Q-DATA-01/Q-C2-03 budgets (`ASSET_BUDGETS_APPROVED`) and a malware scanner (`MALWARE_SCANNER_URL`). Development records `not-configured-development`.
- **Pilot/production packs** need a Q-C2-04 range approval per pack. The flagship packs are development fixtures with synthetic reviewers.
- **Not built:** bounded crawl, the Smithsonian/Wikimedia connectors and a staging review UI. Policy and manifest files plus the CLI are the review path, as the companion document allows.
- **No DNS-rebinding protection.** The SSRF guard checks the URL host.
- Pilot/production R2 buckets and tokens are not created; shared Supabase migration of CF is pending owner approval.
