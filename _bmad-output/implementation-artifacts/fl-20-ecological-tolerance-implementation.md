# FL-20 ecology-tolerance — implementation record

Spec: `../specs/spec-fl-20-ecological-tolerance/` (SPEC, lab-definition, implementation-plan).
Branch: `feat/fl-20-ecological-tolerance` in BE (from `0ac700a`) and FE (from `0a8cf73`). Committed and pushed 2026-10-31 on owner request: BE `96af96d` (rendererKey fix), `91318b6` (FL-20); FE `4533838`. The owner opens the PRs.

## Session 2026-10-31

- Pulled `main` in both repos (BE PR #42 and FE PR #33, FL-10) and created the branches.
- Read the source data from the shared environment. Access was read-only: admin GET requests through the local API on port 4000, and nothing was written. Sources: the KHTN8-L41/L42 taxonomy, the outcome codes, and the text of Bài 41 and Bài 42.
- Wrote the SPEC (audit B1–B8, decisions D-1–D-7), the blueprint (model `ecology-tolerance@1.0.0`, activity of 6 checkpoints plus an explanation, golden cases EC-01–EC-11 and EC-X1–X3) and the implementation plan (tickets FL20-T0 to FL20-T10).
- Build has not started. It waits for owner decision D-1.

## Verification

Docs only. `sprint-status.yaml` validated with js-yaml. No code, test, migration or database change.

## Session 2026-10-31 (build)

Owner decision D-1: "đồng ý D-1 theo khuyến nghị". FL-25 counts as done for development, so FL-20 is the second track alongside FL-10. D-2 to D-7 follow the SPEC recommendations until reviewed.

### BE
- `packages/sim/ecology-tolerance.ts` (new): `ecologyToleranceSchema` and `ecologyTolerance` (`ecology-tolerance@1.0.0`), implementing blueprint rules 1–5.
  - Temperatures are integer deci-°C; densities and ratios are exact fractions.
  - The fixed data carries a `source` field: an SGK block or `ILLUSTRATIVE`.
  - Exported from `index.ts`. Package bumped to 1.3.0; engine `VERSION` stays 1.0.0.
- `checkpoint-activities.ts`: `ecology-tolerance-checkpoints` v1.
  - 6 checkpoints, each with a fixed required state.
  - The density answer is a `{value, unit}` object; a decimal comma is accepted and compared as an exact fraction.
  - `IMPORT` refuses data with more than one suitable species.
- `sim-packs.ts`: model registered (`observationOnly`). `lesson-content.ts`: no challenge parameters.
- Tests:
  - `packages/sim/ecology-tolerance.test.ts`: 26 cases.
  - `application/ecology-tolerance-activity.test.ts`: 15 cases.
  - `interface/ecology-tolerance.integration.test.ts`: isolated DB.
- Regression fix, not part of FL-20: `labs.controller.ts` launch now resolves `rendererKey` from the checkpoint registry again. The FL-10 merge had made `main` return `null` for the released FL-25 Lab.

### FE
- `vendor/nexalab-sim-1.3.0.tgz` replaces 1.2.0; the lockfile changes only for this package.
- `biology/ecology/tolerance/` (new):
  - evidence and phase machine (LIMITS is observed before it is answered; 13 UI steps);
  - pond scene, tolerance and comparison graphs, population plot with table 42.1, age pyramid;
  - panel with free explore (temperature, densities, P1–P3, vô sinh/hữu sinh sorting, unscored).
- `runtime/lab-run-host.ts` and `runtime/checkpoint-views.tsx`: renderer `ecology-tolerance`. `Lab.tsx`: default evidence and an allowed route id.
- `tests/ecology-tolerance-lab.spec.ts`: 2 cases. `tests/ecology-tolerance-real-stack.spec.ts`: opt-in, `FL20_REAL_STACK=1`.
- Not yet added: the library card in `lab-info.ts`, deferred to the release ticket T10.

### Verification
See `sprint-status.yaml` `fl20_tracking.verification`. No commit, push, shared-database write or release.

### Fix after the owner's manual run (2026-10-31)
- Owner report: "đến khi nộp kết quả lại load lâu". The server answered in about 14 ms, but the result drawer opened behind the question panel. From the owner's side, the submit button only greyed out and nothing appeared.
- Cause: `shared/LabSpace.css` raises the result drawer above the panel only for `.bulb-activity` and `.em-activity`. Added `.eco-activity` to both selectors.
- `tests/ecology-tolerance-lab.spec.ts` now checks with `elementFromPoint` that the drawer is not covered. FL-20 and FL-25 mock specs: 8/8 pass.

### Merge with main (2026-10-31, after PR conflicts)
Main gained FL-03 (density) and FL-10 release work, plus two registry refactors: the BE `LabEvaluator` registry and the FE `activity-renderers` registry.

**BE merge (`c262d84`)**
- `labs.controller.ts`: took main's `rendererKey` resolution through `labEvaluators`. Main fixed the FL-25 `rendererKey` regression in its own way (`f202ce4`), so this branch's `96af96d` is superseded.
- `sim-packs.ts`: kept both `density-bench` and `ecology-tolerance`. `observationOnly` now uses main's `{ unsupportedParams }` shape.
- `evaluators/registry.ts`:
  - a `checkpointEvaluator(rubricRef)` helper now builds the FL-25 evaluator;
  - FL-20 is registered through the same helper;
  - `registry.test.ts` lists the FL-20 rubric.

**FE merge**
- Took main's `Lab.tsx` and `lab-run-host.ts`.
- FL-20 is registered in `runtime/activity-renderers.tsx` (checkpoints envelope; guided result through `CircuitBulbResult`, as FL-25 does).
- `vendor/nexalab-sim-1.3.0.tgz` was repacked from the merged sim (now includes FL-03 `densityBench`); the lockfile integrity was updated.

**Verification**
- BE: 379 tests passed, including the FL-20 and FL-25 integrations. Lint, build and check:layers ok.
- Remaining BE failure: `density-e2e.integration.test.ts` (FL-03) refuses every isolated URL except `nexalab_fl03_isolated`. It fails at import whenever `NEXALAB_ISOLATED_DATABASE_URL` is set, so on main and in CI too. Not changed here.
- FE: lint and build ok. Playwright passed 18/18: FL-20 2, FL-25 6, FL-03 density 10.

### CI fix and second merge (2026-10-31)
- CI "API checks" failed on `density-e2e.integration.test.ts`, the FL-03 suite from main. Its guard threw at import whenever the isolated URL was not `nexalab_fl03_isolated`, so it also failed on CI's `nexalab_pinning_test`.
- Fix: the suite now skips (`describe.skipIf`) outside the loopback FL-03 database. It still never runs anywhere else.
- Local run with the CI database: 57 files passed, 2 skipped; 381 tests passed, 3 skipped.
- FE merged main again (`522cf5e`, catalog thumbnails). `package.json` conflict resolved by keeping main's `capture:lab-thumbnails` script together with the sim 1.3.0 tarball. FE lint and build ok.

## Session 2026-11-02 — release (T10)

The owner asked for "Rehersal và publish lab fl20" and then said "bỏ qua review", so D-2…D-7 use the SPEC recommendations, subject to the server constraints below.

### Server constraints found
- A release maps one curriculum topic, and every bound lesson must hold every activity outcome. The release therefore binds only Bài 41 (`KHTN8-L41`, `KHTN8-B41-O03`); `KHTN8-B42-O02` cannot join.
- Release binding requires the Lab subject to match the lesson subject. The lessons use `khtn`, so the Lab subject is `khtn`.

### What was added
- BE migration `20261102090000_fl20_ecology_tolerance_lab`: Lab `ecology-tolerance` (draft, CLASS_PRIVATE) and challenge `eco_001`.
- BE `scripts/release-ecology-tolerance.mjs`: admin API only and idempotent. Env: `NEXALAB_API`, `NEXALAB_ADMIN_EMAIL`, `NEXALAB_ADMIN_PASSWORD`, `FL20_LESSON_ID`, `FL20_PUBLISH`.
- FE: library card (`lab-info.ts`, entry 07) and a fish icon (`LabLibrary.tsx`).

### Rehearsal (isolated `nexalab_fl20_release`)
- The curriculum rows were stand-ins with the same lesson id, topic and outcomes as the shared environment.
- Results: draft created → published v1 ACTIVE; a rerun changed nothing.
- Student check: the library listed the card; the launch was FOUNDATIONAL_RELEASE; the submit returned 201, passed 7/7, with no page errors.

### Shared environment
1. The first script run hit `LAB_NOT_FOUND`: the migration was not yet applied to the database the API uses. That run had already created only the activity version.
2. The owner then ran `prisma migrate deploy`, which applied `20261102090000_fl20_ecology_tolerance_lab`.
3. The API on :4000 had stopped. It was restarted on this branch (`tsx src/main.ts`), and the script was run with `FL20_PUBLISH=true`.

Verified result:

| Check | Value |
|---|---|
| Release | v1 ACTIVE, digest `a2c2638296dd4048b2b0fdde119cf9e8fdff9f30fa721a37006929c8078e7ef0` |
| Review | OWNER_SIGNOFF:APPROVE |
| Outcome | `KHTN8-B41-O03` |
| Lesson binding | Bài 41 |
| Lab | published, SHARED_LIBRARY, releaseCleared |
| `GET /labs` | lists the Lab |
| Bài 41 foundational-labs | returns `ecology-tolerance` |

No student run was made on the shared environment.

## v1.1 — K8 EcoStage 3D pond (2026-11-03)

Spec: `../specs/spec-fl-20-ecological-tolerance/k8-ecostage-v1.1.md`. FE branch `feat/fl-20-k8-ecostage` (worktree). Committed and pushed 2026-11-03 on owner request "Publish lại L20"; the owner opens the PRs. The server release v1 was not re-run because the activity is unchanged and the digest stays valid (V-5). Learners see v1.1 once the FE PR is merged and deployed.

### What changed (FE only)
- New kit `src/features/labs/biology/ecology/kit/`: `EcoStage`, `PondDiorama3D`, `FishSchool3D` + `fish-geometry.ts`, `Thermometer3D`, tiers, palette, motion tokens, dev preview `/dev/lab-kits/k8`.
- `tolerance/PondView3D.tsx` renders the diorama with the same `.eco-pond[data-fish]` contract; `EcologyToleranceActivity` shows it by default, the tolerance graph becomes a card, "Xem sơ đồ 2D" toggles to the SVG scene.
- READMEs (`labs/README.md`, `ecology/README.md`) updated.
- 2026-11-03 owner review: the dev preview now follows the tilapia model by default ("auto" mood); out of range fish no longer fade but show the heat / cold response of V-6 (`FishSchool3D` moods `heat`, `cold`, `ECO_MOTION.stressSeconds` 6). Lab copy for `gone` updated.
- 2026-11-03 owner review (V-7): per-question review block (`eco-review`, `eco-next`, chosen answer kept in view during the act phase); the result drawer now takes the question panel's box with one title and hides the panel underneath. Spec test updated for the extra "Câu tiếp theo" step; 3/3.

### Verification
| Check | Result |
|---|---|
| `tsc --noEmit`, `npm run build` | ok |
| `tests/ecology-tolerance-lab.spec.ts` (separate Vite 5301, mocked API) | 3/3, including the new 3D/2D toggle test; re-run 3/3 after V-6 |
| `tests/gene-protein-lab.spec.ts` (shared 3D code paths) | 4/4 |
| Screenshots light 1440, dark 1280, phone 390 | no page errors; headless swiftshader runs tier low, shadows not judged |
| sloplint | 0 FAIL |

- 2026-11-03 owner request "Sửa luôn cho Lab bóng đèn và cảm ứng điện từ": the result drawer rules moved from the FL-20 CSS to `shared/LabSpace.css` for all three guided labs (FL-25 bulb, FL-25 induction, FL-20). The drawer is a solid card in the panel's box with one title, and the question panel and badge are hidden while it is open. `EmInductionActivity.css` matches the drawer width and surface to `--em-panel-w` and `--em-panel-solid`. Specs `lab-run-host` (bulb) and `em-induction-lab` now assert that the panel is hidden after submit. Run on Vite 5302: 16 of 18 passed in lab-run-host, em-induction, ecology-tolerance and circuit. The 2 failures, `Lab Space pilot fills viewport` at 1440 and 390 (`toBeFocused`), fail the same way without this change. Not committed.

### PR conflicts and CI (2026-11-03)
- FE: merged `origin/main` (`6421596`, FL-07). The conflict in `src/features/labs/README.md` was resolved by keeping main's EX-A anatomy line and the v1.1 ecology line. Merge `1304d34` pushed. tsc and build ok. `lab-run-host` P3.2b and `Lab Space pilot fills viewport` (1440, 390) fail the same way on a clean `origin/main` checkout, so they are not caused by this branch.
- BE: merged `origin/main` (`9618c70`, FL-07). CI "API checks" failed on `fl-07.integration.test.ts`, which throws in CI without `NEXALAB_FL07_TEST_URL`. Its fixture only accepts the loopback database `fl07_isolated`, with every URL equal to it. `ci.yml` now excludes the file from `npm test` and runs it in its own step against a new `fl07_isolated` database.
- Reproduced both steps on the throwaway loopback cluster (127.0.0.1:55432, CI=true): `npm test` 70 files passed, 3 skipped (470 tests); FL-07 step 1/1. Lint and build ok.

### Clean-up (2026-11-03, owner request "clean code, remove redundant")
- New `kit/procedural.ts` holds `seeded` and `paint`. The pond (soil layers, floor, weeds) and the fish now share them instead of four hand-written vertex-colour loops and two seeded generators. `paint` copies each colour at once, so the per-vertex `Color.clone()` calls are gone.
- `FishSchool3D` uses three's `smoothstep` and `clamp`. Unused or redundant pieces removed: `bodyTop` export, the lily-pad `useMemo` (now a module constant), and the thermometer's zero position.
- `PondView3D` exports `POND_VIEW`, `THERMOMETER_AT`, `stressAt` and `vigorAt`, which the Lab and the dev preview had each copied. The preview uses `formatDeciC`.
- The dev-only `.k8-*` styles moved from the Lab stylesheet to `kit/dev/K8KitPreview.css`, so they no longer ship with the Lab. The redundant `[data-limit]` rule is merged.
- `EcologyToleranceActivity`: `checkpointOf` and `awaitingCheck` replace repeated lookups and conditions.
- Verification: tsc and build ok; no unused locals in ecology files; ecology-tolerance and em-induction specs 9/9; K8 preview screenshot without page errors; sloplint 0 FAIL. Not committed.

### Not done
- Owner visual review of the 3D level; real-GPU check of the high tier (shadows, frame rate) on a school machine.
- No change to BE code, release or shared data.
