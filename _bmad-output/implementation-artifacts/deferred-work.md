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
