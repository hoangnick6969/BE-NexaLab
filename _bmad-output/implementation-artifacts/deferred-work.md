- source_spec: `D:\coding\nexalab-be\_bmad-output\implementation-artifacts\spec-a2-t3-video-completion.md`
  summary: Define immutable lesson resource versions so evidence from an old published video cannot complete a replacement resource that reuses the same step ID.
  evidence: Published lessons are editable in place and deterministic step IDs preserve progress; settling this needs a product and API decision for version tokens, immutable publications, or progress invalidation across every step type.
- source_spec: `D:\coding\nexalab-be\_bmad-output\implementation-artifacts\spec-a2-t3-video-completion.md`
  summary: Reassess authenticated uploaded-video delivery if production files are large or slow enough that Blob loading and non-cancelled downloads materially hurt playback.
  evidence: The current authenticated file contract requires request headers and returns a Blob; real asset sizes and production delivery measurements are needed before choosing range support, signed URLs, or cancellation work.
