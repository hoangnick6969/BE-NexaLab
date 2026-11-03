# FL-07 publication preparation

The production entry is `/labs/thermal-energy`, using the shared LabSpace and pinned LabRun. `/dev/lab-kits/thermal-energy` is a development preview and creates no learning evidence.

## Authoring inputs

- Manifest: `content/simulation-packs/fl07-candidate.json`.
- Model `thermal-bench@1.0.0`, activity `thermal-energy-investigation@1`, rubric `thermal-energy-investigation@1.0.0`.
- Read-only shared database lookup on 2026-11-03 confirmed topic `KHTN8-L27` active and non-synthetic Outcome `KHTN8-B27-O01`: “Đo được năng lượng nhiệt mà vật nhận được khi bị đun nóng.”
- Published Lesson: `pack-structured-08ed449d58fd5a1cbfa84a6fee3f2f0c88a7b95f-v1`.
- Released content pack: `cmvmmpjhd001rlw14azpwmk52`, digest `618b1e879742f149bfb04596061c2abb950a372845b5dcc929a62c51add94fb5`.
- Source provenance locator: PDF page 111, printed page 109, block `sgk-khtn8-nxbgd-2026-p0111-b0004`, source lesson `src-lesson-8c7e25fb8826`. Its `approved_internal` content provenance is not an FL-07 release approval.

## Operator procedure

Use the existing Admin API authoring/release lifecycle, as for FL-06. No new schema or direct SQL writes are part of this procedure. Set `NEXALAB_API`, `NEXALAB_ADMIN_EMAIL`, and `NEXALAB_ADMIN_PASSWORD` in the operator environment without committing credentials.

1. `npm run release:fl07` performs read-only login/inventory preflight.
2. With authorization for the named target, `npm run release:fl07 -- --apply` creates/reuses a private draft Lab, base challenge, activity, validated config/pack and immutable DRAFT release. Technical version activation does not publish the Lab. Set `FL07_RECEIPT_PATH` to retain the candidate digest/IDs outside tracked source.
3. Review the actual stored snapshot, mapping, model/rubric evidence, safety and rights. Prepare a real owner evidence JSON file containing `curriculumMapping`, `sourceReferences`, `scientificGoldenCases`, `rubric`, `safetyAssessment`, and `rightsAssessment`. The manifest intentionally contains no fabricated owner evidence.
4. Only after explicit owner approval of that digest, set `FL07_EXPECTED_DIGEST` and `FL07_OWNER_EVIDENCE_PATH`, then run `npm run release:fl07 -- --publish`. The script verifies the snapshot digest, exact tuple and bindings before recording OWNER_SIGNOFF and activation. It checks that other Labs' release/visibility inventory did not change.
5. Verify hosted FE/API rollout, student discovery, B27 navigation and a real run on the target environment. Representative device and accessibility evidence must be recorded separately from desktop emulation.

All numerical apparatus constants and ideal calorimeter assumptions remain technical assumptions. The learner does not calculate `mcΔT`. Code and isolated fixture checks do not create an owner approval, deployment receipt, or production acceptance.

## Technical verification — 2026-11-03

- Backend: 40/40 focused tests in 8 files passed, including real PostgreSQL integration, model, strict event order/reveal gating, controller/publication, registry/LabRun and FL-06 publication regression. BE lint/build passed.
- Frontend: strict parser examples from the spec passed 2/2 Playwright tests; lint/build passed. FE consumes versioned sim tarball 1.5.0.
- Dedicated PostgreSQL 18 database `127.0.0.1:55497/fl07_isolated` applied all 47 existing migrations through the guarded npm migration command. No FL-07 schema migration was added. The isolated fixture helper rejects non-loopback or mismatching target URLs.
- Persisted integration checks include outsider GET/POST denial, expired/revoked runs, immutable event rows, concurrent different-key submissions yielding one Attempt, changed evidence/wrong envelope rejection, authoritative Admin reproduction and replay after successor release activation.
- Browser used the production FE build at `http://127.0.0.1:5188/labs/thermal-energy`, API `4127`, and that isolated database. It logged in through the real student form, created a LabRun, completed all six steps and received server 6/6. Browser run `cmw02nok80002lwzgqsfqy1y1`; persisted Attempt `cmw02smi7000flw2wxhoyhwhv`, verdict `passed`, score 6. A database readback and browser restored-result view agreed.
- Reload at the 50 s measurement restored the same run and unfinished `2.100`, `30,0`, `5,0` inputs; invalid grouped energy remained blocked. Both 3D and 2D displayed the same server readings. At 390×844, document scroll width and LabSpace width were both 390 px. Screenshot: sibling FE `output/playwright/fl07-mobile-2d.png`.
- Static thumbnail uses the production `ThermalBench3D` via the common harness: 1280×720 WebP, 16,704 bytes, visually inspected. No API/database access during capture.
- Independent scoped code reviews covered server, frontend and authoring. Two concrete findings were fixed: an already-APPROVED candidate now uses activation after checking its exact owner receipt, and both expandable notebook/assumption summaries have 44 px touch targets. No remaining concrete defect was reported by those reviews. Final FE rebuild passed after the CSS correction.

The local fixture Lab/releases/users are explicitly TEST FIXTURE ONLY. No shared authoring, approval, publication, push or hosted deployment occurred. Remaining release operations are owner review of the prepared real B27 candidate, target-authorized DRAFT creation, exact-digest OWNER_SIGNOFF and rollout/target-environment acceptance. Physical-device and assistive-technology certification are not inferred from desktop viewport checks.
