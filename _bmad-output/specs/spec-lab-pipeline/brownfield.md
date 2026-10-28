# Current State Evidence (2026-10-28)

Read from BE `main` (= `DongResearch`), FE `main` (= `DongResearch`) and BE `origin/codex/foundational-lab-platform` (“fl”, 4 commits not on main).

Labels:
- `[SRC]` verified in source.
- `[TEST]` verified by running tests in this session. BE main sim/labs/foundational: 37/37 pass. fl branch: 40 pass, 1 skipped. `labs-pinning.integration.test.ts` skips without a database (`describe.skipIf(!db)`, fl `:37`).
- `[INF]` inferred.
- `[UNV]` unverified.

| ID | Finding | Evidence | Pipeline impact |
|---|---|---|---|
| E-01 | Server recomputes every Lab result. Attempt, step progress and projection are written in one transaction | `src/modules/labs/interface/labs.controller.ts:76-252` `[SRC]` | Keep as the submit boundary |
| E-02 | Main evaluates with `Lab.simulationModelRef`. Config and pack are read outside the transaction. The pack is only recorded by ID | `labs.controller.ts:158-167,193` `[SRC]` | P3.2 must route through LabRelease |
| E-03 | fl fixes submit-time selection: advisory locks on both activation keys, compatibility check, pack model and `_execution` snapshot inside `simulationResult`. Replay labels `pinned_execution` / `legacy_unverified` | fl `labs.controller.ts:170-198`; fl `simulation-versions.ts:40`; fl `admin-labs.controller.ts:222-269` `[SRC]`; unit tests `[TEST]`; PG integration `[UNV]` | Base for P3.2. Move the snapshot to `Attempt.execution` |
| E-04 | No version is chosen at launch. FE preview runs `simulate(labId)` from the vendored package | FE `src/features/labs/Lab.tsx:133-135,145`; BE `src/modules/learning/interface/learning.controller.ts:411-426` `[SRC]` | Activation mid-session can diverge `[INF]` → D-LP-03 |
| E-05 | Standalone Lab submit sends no idempotency key. The fast path reads outside the transaction. A concurrent duplicate hits P2002 → generic 409 | FE `Lab.tsx:163-172`; BE `labs.controller.ts:103-153`; `src/common/errors.ts:105` `[SRC]`; outcome `[INF]` | Contract v1 §4 rule 1 |
| E-06 | Pathway steps do send idempotency keys and preserve state on retry | FE `src/features/labs/CircuitPathwayStep.tsx:93,130,153-159`; `PracticalPathwayStep.tsx:95,116,126-131` `[SRC]` | Lift into the renderer host |
| E-07 | No code writes `Lab.releaseCleared/scope/topicCode`. The column defaults to false. `PUT admin/labs/:id` cannot set them. `topicCode` has no FK | grep `src`; `prisma/migrations/20261018130000_i1_ebook_locator_lab_release/migration.sql:3`; `src/modules/labs/interface/admin-labs.controller.ts:64-66`; `prisma/schema.prisma:468` `[SRC]` | Release endpoint required (stage 9) |
| E-08 | The Open Curriculum lesson API excludes `LAB` steps. Lesson `LAB` steps require an assignment | `learning.controller.ts:48`; `src/modules/progress/application/student-access.service.ts:34-35`; PRD path `docs/product/prd.md:78` `[SRC]` | D-LP-06 / P-1 |
| E-09 | Foundational progress counts any passed standalone attempt for `foundationalLabId` (free string, no FK, no release filter) | `src/modules/progress/application/foundational-progress.service.ts:44-56,99`; `prisma/schema.prisma:494` `[SRC]` | P-2. Add FK and context filter |
| E-10 | Model registry maps 1 model ↔ 1 labId. Challenge params are keyed by labId with a fixed modelRef and `rangeReview: "pending"`. One global engine `VERSION = "1.0.0"` | `src/modules/labs/application/sim-packs.ts:22-67,220`; `src/modules/lessons/application/lesson-content.ts:39-76`; `packages/sim/index.ts:2` `[SRC]` | ModelDescriptor per modelRef |
| E-11 | `chemistry@1.0.0` gained a pH mode in place | `packages/sim/index.ts:210-226` (commit `3f521d7`) `[SRC]` | T-4. Forbid in-place changes |
| E-12 | Reviews are typed `{name,email,at}` JSON. Only `subject.email ≠ model.email` is checked. Range approval is required only in pilot/production | `sim-packs.ts:70-79,102,180-185,293-294`; `admin-labs.controller.ts:319` `[SRC]` | Authenticated receipts |
| E-13 | Pack golden cases run without challenge params. Config golden cases compare the verdict only | `sim-packs.ts:256-280`; `src/modules/labs/application/simulation-versions.ts:72-88` `[SRC]` | Fixture format §8 |
| E-14 | Circuit engine: no LED polarity, resistor defaults to 330 Ω, 1–24 V without step. A no-LED zero-resistance branch reports `LED_OVERLOAD` | `packages/sim/index.ts:22,101-107,120` `[SRC]` | Blueprint S-1/S-2 |
| E-15 | FE hard-codes three Lab IDs, `challengeId = id + "_001"` and the label "v1.0.0". BE falls back to `circuit_001` | FE `Lab.tsx:40,168,200`; `lab-info.ts:18-37`; `LabLibrary.tsx:52`; `PracticalPathwayStep.tsx:65`; BE `learning.controller.ts:409,415` `[SRC]` | Renderer registry, launch envelope |
| E-16 | `ClassResource` provides owner/member checks, idempotent create, versioned revisions and a lesson link. Kinds are only DECK/STUDY_QUIZ/TEST | `src/modules/classes/application/class-resources.service.ts:22-59,97-108`; `prisma/schema.prisma:33-37,174-205` `[SRC]` | D-LP-05 substrate for Class Lab |
| E-17 | Teacher challenge variants are upserted in place on lesson save. The lab assignment `contentVersion` hashes only `simulationModelRef + config` | `src/modules/lessons/interface/lessons.controller.ts:199-207`; `lesson-content.ts:256-264`; `src/modules/classes/application/assignments.service.ts:13,35,388` `[SRC]` | Freeze variants. `class_lab` pins the release |
| E-18 | No local draft persistence in Lab code. State lives only in React state | grep `localStorage/sessionStorage` in `src/features/labs` (none); FE `Lab.tsx:132` `[SRC]` | Contract v1 §7 |
| E-19 | Admin FE manages config versions only. Packs/activities exist only as API | FE `src/features/admin/Simulations.tsx:130,153,298` `[SRC]` | JSON + CLI per Content Tool plan |
| E-20 | DB snapshot: 47 KHTN 8 + 51 KHTN 9 released shared Lessons, none with `labId`; 3 Labs private/uncleared; 4 version tables empty; 157 KHTN 8 + 135 KHTN 9 outcomes (33 duplicates), all textbook-derived. The Content Tool electricity proposal (13/6) is still unverified | Read-only query 2026-10-28 on the BE `.env` development database (`lab-catalog-khtn8-9.md` §1) | DB part verified for development only. Re-check the pilot/staging target before P3.4 |
