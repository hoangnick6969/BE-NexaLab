# Existing Capability Reuse and Proven Gaps

## Current evidence snapshot

The snapshot below was read from the configured pilot database and current BE/FE source during P3.1. It is evidence for planning, not an instruction to publish.

- 47 non-synthetic released KHTN 8 Structured Lesson packs carry `sgk-khtn8` review/provenance metadata.
- 51 non-synthetic released KHTN 9 packs exist, but use a different manifest shape and sampled review metadata records the publisher textbook as `ORIGINAL`; exact KHTN 8-style source blocks/pages were absent from the sample.
- `circuit`, `chemistry`, and `eye` Lab rows exist, all `CLASS_PRIVATE`, `releaseCleared = false`, with no `topicCode`.
- There are zero pilot records in `SimulationConfigVersion`, `PracticalActivityVersion`, `SimulationPackVersion`, and `FoundationalCourseVersion`.
- KHTN 8 B21–B25 have `labId = null` and only `READING` steps.

## Reuse matrix

| Capability | Existing evidence | Reuse decision |
| --- | --- | --- |
| Deterministic scientific engine | `packages/sim/index.ts`; `circuit@1.0.0`, `chemistry@1.0.0`, `eye@1.0.0` | Reuse package and add a versioned circuit successor only where this definition differs |
| Server-authoritative result | `POST /simulate/:labId` resolves allowlisted `simulationModelRef`; `POST /attempts` recomputes results | Reuse unchanged behavior |
| Idempotent attempts and evidence | Attempts optionally record idempotency, config and pack IDs. The scoped fix evaluates the pack model, validates numeric config ranges/model compatibility and records an execution snapshot | Reuse this verified submission-time tuple; standalone idempotency and launch-time selection remain open |
| Student release gate | Published + `SHARED_LIBRARY` + `releaseCleared` + non-synthetic + `topicCode` | Reuse; do not bypass |
| Open Foundational practice | Existing attempt logic distinguishes open released foundational practice from assignment-gated Lesson activity | Reuse |
| Class/Lesson practical gate | Lesson `LAB`/`CHALLENGE` step, assignment, pathway, and progress reconciliation already exist | Reuse |
| Configuration versions | `SimulationConfigVersion` plus golden-case validation and activation API | Reuse contract; create data only during implementation |
| Reviewed activity | `PracticalActivityVersion.spec` already contains objective, materials, procedure, variables, observations, result, explanation, safety, limitations, modality, Outcome codes, sources, and reviews | Reuse directly |
| Simulation pack | `SimulationPackVersion` already pins model, engine, activity, ranges, initial state, limitations, golden cases, semantic map, bindings, challenges, and reviews | Reuse directly |
| FE circuit workspace | Prototype React Flow component tray, wiring, parameter editing, reset and preview | Remove unreviewed prototype experience from product flows; reuse components only after suitability review |
| FE attempt UX | Submit, server result, retry state, hints, saved experiment, Lesson practical step | Reuse |
| Visual asset decoupling | Pack semantic map and output bindings already separate visuals from simulation logic | Use 2D semantic elements for MVP; no GLB required |

## Proven gaps only

### GAP-1 — No reviewed/released Foundational Lab evidence in the pilot

The schema and APIs exist, but the four version/course tables are empty and all current Lab rows are private and uncleared. Implementation must create and validate immutable activity/config/pack data before any release decision. This is data/review work, not a schema gap.

### GAP-2 — Released state-variable ranges are not fully enforceable by the current pack allowlist

`packValidation` validates `template.ranges` against `CHALLENGE_PARAMETERS`. The circuit allowlist currently exposes only `maxCurrentMa` and `minLitLeds`; voltage, resistance, LED count, and branch count are parser/UI state rather than reviewed release ranges. Add code-level allowlisted state constraints for the model/pack validator. No database migration is needed because the pack template is JSON.

### GAP-3 — LED polarity is not represented

The current circuit engine counts LED nodes and applies a fixed drop regardless of orientation. The KHTN 8 source explicitly describes correct LED direction. The reviewed successor must add polarity/orientation or constrain and label LEDs as pre-oriented. This is a scientific model contract gap.

### GAP-4 — FE discovery and renderer selection are hard-coded to three Lab IDs

`lab-info.ts`, `Lab.tsx`, and the library icon/renderer branches recognize only `circuit`, `eye`, and `chemistry`; `Lab.tsx` rejects every other ID before a renderer can be selected. The first MVP can reuse `circuit`, but later catalog candidates cannot be added through the existing pack contract alone. Replace metadata conditionals with API data and a small allowlisted renderer registry keyed by `modelRef`. This is a bounded FE extensibility gap, not a request for a general builder.

### GAP-5 — Circuit results do not expose the minimum observation set

The engine returns branch resistance/current/LED count, but the main FE result panel shows only total current and global status. The definition requires per-branch current and a clear per-branch-versus-total threshold distinction. Extend presentation; keep the server payload authoritative.

### GAP-6 — Released KHTN 8 Lessons have no Lab step/binding

B21–B25 currently have only `READING` steps and `labId = null`. The pilot should bind only one Lesson/Outcome after a named curriculum reviewer approves it; the other lessons remain candidates. P3.1 does not modify release content.

### GAP-7 — KHTN 9 provenance is insufficient for a release binding in this task

The data is useful for reuse forecasting, but the sampled manifest/review shape is inconsistent with KHTN 8 source-block/page provenance, and the `ORIGINAL` rights label is not adequate evidence for a publisher textbook. This does not invalidate the KHTN 9 curriculum topics; it blocks only treating them as verified Lab release bindings here.

### GAP-8 — Pack/config consistency and historical reproduction

Before the fix, `POST /attempts` read active config and pack independently and evaluated `Lab.simulationModelRef`. An isolated PostgreSQL controller/Prisma integration test reproduced an out-of-range config being accepted under the pack. The scoped fix evaluates the pack model, rejects mismatched model/numeric ranges, and snapshots the actual model/config/pack/params in the existing result JSON; reproduce uses that snapshot and reports output comparison with numeric tolerance. Existing results without the snapshot are retained and explicitly labelled `legacy_unverified`.

Pack and config can still be independently activated: compatibility within a pack's numeric ranges is not evidence of individual approval for that exact pair, and the pack does not define allowed string choices. Submission now shares both activation advisory locks; the isolated PostgreSQL test verifies the wait for each. Selection is still at submission rather than at launch; a stricter pair/launch contract remains a separate decision. The integration test did not exercise HTTP or a live environment.

## Items that are not gaps

- A new Lab/ClassLab table is not presumed necessary for the first MVP; exact version pinning and historical preservation may require an additive migration after design and tests.
- No new simulation transport protocol is required.
- No browser-side authoritative scoring is required.
- No 3D engine or new asset store is required.
- No Outcome Normalizer or Content Tool change is required.
- No public release endpoint bypass is required.
