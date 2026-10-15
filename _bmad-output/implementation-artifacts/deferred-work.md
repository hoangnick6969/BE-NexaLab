- source_spec: `D:\coding\nexalab-be\_bmad-output\implementation-artifacts\spec-a2-t3-video-completion.md`
  summary: Define immutable lesson resource versions so evidence from an old published video cannot complete a replacement resource that reuses the same step ID.
  evidence: Published lessons are editable in place and deterministic step IDs preserve progress; settling this needs a product and API decision for version tokens, immutable publications, or progress invalidation across every step type.
- source_spec: `D:\coding\nexalab-be\_bmad-output\implementation-artifacts\spec-a2-t3-video-completion.md`
  summary: Reassess authenticated uploaded-video delivery if production files are large or slow enough that Blob loading and non-cancelled downloads materially hurt playback.
  evidence: The current authenticated file contract requires request headers and returns a Blob; real asset sizes and production delivery measurements are needed before choosing range support, signed URLs, or cancellation work.
- source_spec: `../specs/spec-b1-teacher-operations/SPEC.md` (B1 round 2, 2026-10-15)
  summary: FE `tests/video-completion.spec.ts` "asset video refreshes authentication, creates a blob URL, and revokes it on cleanup" expects 2 `/files` requests and receives 3.
  evidence: Fails identically on the FE tree without the B1 round-2 changes (stash check against the local API); the other A2/A4 specs pass after pointing their student login at `/login` (the public landing page now owns `/`). Likely a dev-mode double mount or an extra refresh retry; needs an A2 owner to decide whether the count or the client is wrong.
- source_spec: `../specs/spec-b1-teacher-operations/SPEC.md` (B1 final run, 2026-10-15)
  summary: On the shared dev link a graded practical attempt takes ~5 s and join ~2 s; pilot latency targets are not met there.
  evidence: ~176 ms per round trip from the dev machine to the Supabase pooler and ~30 sequential queries per attempt; measure from the pilot region before optimising (fewer round trips in the attempt transaction would help everywhere).
- source_spec: `../specs/spec-c2-admin-operations/SPEC.md` (C2, 2026-10-15)
  summary: C2-T5 R2 object storage, immutable `AssetVersion`, `SourceRegistry`, ingestion runs/items, dry-run and release receipts are not built; C2 governs the existing `AssetFile` (checksum, scope, license/source, quarantine/reassign/share, reference-blocked delete).
  evidence: Content Foundation CF-T1..T4 is still backlog (no R2 bucket/credentials, no content-pack or source tables). The owner chose "C2 on the current foundation"; these surfaces are built on top of CF when it lands.
- source_spec: `../specs/spec-c2-admin-operations/SPEC.md` (C2, 2026-10-15)
  summary: C2-T3 versions per-lab challenge parameters (`SimulationConfigVersion`, pinned on `Attempt.configVersionId`) but not the full CF-T4 topic-pack set (activity/model/template/visual asset/semantic binding manifest).
  evidence: CF-T4 pack registry does not exist yet; the engine version (`simulationModelVersion`) and parameter version together reproduce historical attempts today. Per-template ranges remain pending under Q-C2-04, so versions stay development configuration.
- source_spec: `../specs/spec-c2-admin-operations/SPEC.md` (C2, 2026-10-15)
  summary: `prisma migrate diff` shows pre-existing schema/database drift from the B2 migrations (TeacherGateOverride foreign keys present in SQL but not in schema.prisma; StepProgress index name; updatedAt defaults on Assignment/User).
  evidence: Not introduced by C2 and deliberately left out of `20261015160000_c2_admin_operations`; needs a B2 owner to decide whether schema.prisma or the database is authoritative before the contract migration.
