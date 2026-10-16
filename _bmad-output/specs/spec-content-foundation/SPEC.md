---
id: SPEC-content-foundation
status: platform-implemented-review-cf-t5-corpus-pending
companions:
  - tickets.md
  - ../../planning-artifacts/content-data-foundation.md
  - ../../planning-artifacts/architecture-spine-nexalab-release-1/ARCHITECTURE-SPINE.md
sources:
  - ../../../docs/product/prd.md
  - ../../planning-artifacts/increment-b-c-plan.md
---

# Content Foundation — Curriculum, Media, Ingestion, and Simulation Packs

## Why

NexaLab needs a reusable, reviewable Grade 8–9 KHTN baseline so teachers can customize lessons, quizzes, tests, and practical activities without being responsible for authoring every topic or scientific model.

## Capabilities

- **CAP-1 — Traceable curriculum-aligned packs:** every released learning unit maps to official KHTN outcomes and has claim-level sources, rights evidence, version, and named reviews; success means coverage gaps are reported separately by grade/domain and deliverable.
- **CAP-2 — Safe media lifecycle:** private versioned media is uploaded to R2 and referenced by PostgreSQL metadata; success means only validated, immutable versions can be used by released content.
- **CAP-3 — Controlled source ingestion and release:** an allowlisted registry and importer stage source records and publish only reviewed manifests; success means ingestion is repeatable, auditable, idempotent, and never auto-publishes.
- **CAP-4 — Activity-grounded simulations:** a reviewed practical activity and scientific model define any scored simulation; success means server engine, golden cases, visual binding, and immutable version references agree.
- **CAP-5 — Open baseline corpus:** the content team produces original Vietnamese material for the full Grade 8–9 outcome map using verified reusable sources; success means curriculum map, knowledge units, released lessons, practicals, and simulations each expose numerator, denominator, and gaps.

## Constraints

- Curriculum is taxonomy/reference, not permission to reproduce textbooks. Do not crawl publisher viewers or ingest content whose reuse rights are unclear. Open/public availability is not reuse permission.
- Supabase PostgreSQL stores metadata, provenance, review state, and evidence; private Cloudflare R2 stores binary objects. Dev seed, source ingestion, release importer, and authenticated runtime authoring are separate lanes.
- Accuracy and rights are independent hard publish gates. Important claims need two independent references, including one appropriate authoritative science/education reference; named subject and rights reviewers approve release. Automation alone cannot attest scientific validity.
- The path is `outcome → learning unit → activity (when appropriate) → modality`. Not every outcome requires a practical, video, or 3D simulation. GLB is visual media, not simulation logic.
- Use private R2 Standard, MP4 720p with WebVTT and transcript, multipart upload for proposed 300 MB maximum; the exact media budget remains open. Finalize checks object size, signature, full streaming SHA-256, and media/security validation; ETag is not a checksum.
- Simulation manifests cannot execute arbitrary scripts. Every released lesson/attempt pins immutable content, asset, model, binding, and challenge versions as applicable.
- Synthetic fixtures are test-only and cannot be promoted as baseline content.

## Non-goals

- Buying or requesting textbook rights; claiming a complete copy of any textbook; general web crawling; automatic scientific review; embeddings/RAG; forcing 3D for every topic; AI-generated authoritative material; automatic LOD/visual-quality scoring in MVP.

## Success signal

A dry-run release shows exact changes; approved re-import creates no duplicates; a synthetic pack cannot enter the pilot lane; an open-source/original pack is blocked when provenance or either review is absent; a validated 3D pack passes model golden cases and semantic-map checks; report shows separate Grade 8–9 coverage denominators and gaps.

## Open questions and implementation gates

- **Q-DATA-01:** final per-video duration/size/bitrate budget (proposal: 15 minutes, 300 MB, 720p H.264/AAC).
- **Q-DATA-02:** choose the first six flagship topics after outcome mapping; this does not reduce the full curriculum map.
- **Q-DATA-03:** name content producer/editor, subject reviewers, rights reviewer, and capacity; blocks a credible corpus delivery schedule and release, not importer work.
- **Q-DATA-04:** content lead sets measurable pack and coverage acceptance thresholds before baseline corpus acceptance.
- **Q-C2-03/Q-C2-04:** per-media non-video limits and per-model scientific parameter ranges are set for each applicable asset/template before release.

## Ticket readiness

T5–T8 define implementable platform contracts with per-asset/per-model gates. T9 is a content production workstream, not a software-only ticket; do not schedule corpus acceptance until Q-DATA-03 and Q-DATA-04 are resolved.
