# FL-21 food-web — implementation record

Spec: `../specs/spec-fl-21-food-web/` (SPEC, lab-definition, implementation-plan).
Branch: `feat/fl-21-food-web` in BE (from `e424524`) and FE (from `ab7776b`). Nothing committed or pushed.

## Session 2026-11-02

- Pulled `main` in both repos and created the branches.
- Read the source material from the shared environment. Access was read-only: admin GETs through the local API on :4000, nothing written. Sources: topics and outcomes for Bài 43–46, and the lesson text of Bài 43, 44 and 46.
- Wrote:
  - the SPEC: audit C1–C6 and decisions D-1–D-7;
  - the blueprint: illustrative web W1 with 11 species and 6 full chains; model `food-web@1.0.0`; 6 checkpoints plus an explanation; golden cases FW-01–FW-11 and FW-X1–X3;
  - the plan: tickets FL21-T0 to FL21-T9.
- Lessons carried over from FL-20, applied in advance:
  - release v1 binds one topic (Bài 44);
  - the Lab subject is `khtn`;
  - the FE must add `.fw-activity` to the LabSpace result-drawer rule.
- Build has not started; it waits for D-1, D-2 and D-6.

## Verification
Docs only. `sprint-status.yaml` validated with js-yaml.

## Session 2026-11-02 (build)

Owner: "đồng ý theo khuyến nghị".

### BE
- `packages/sim/food-web.ts` (`food-web@1.0.0`): web W1 of 11 species and 12 edges, causes, and the 1/10 energy convention, each with a source tag. The model covers roles, chain validity, energy levels and heat, first-order removal effects, chain counts and causes. `@nexalab/sim` is now 1.5.0; engine `VERSION` stays 1.0.0.
- `checkpoint-activities.ts`: `food-web-checkpoints` v1 (6 checkpoints plus an explanation). `CHAIN` is learner-built; the other states are fixed and compared with deep equality that ignores key order.
- Registered in `evaluators/registry.ts`, `sim-packs.ts` and `lesson-content.ts`.
- Tests:
  - `packages/sim/food-web.test.ts` (17);
  - `application/food-web-activity.test.ts`;
  - `interface/food-web.integration.test.ts`.

### FE
- `vendor/nexalab-sim-1.5.0.tgz` replaces 1.4.0.
- `biology/ecology/food-web/`:
  - evidence and phase machine;
  - board with species as real buttons and SVG arrows (food → eater);
  - energy pyramid, causes board;
  - panel, review-after-check, free explore (remove any species, chain counts);
  - CSS.
- Registered in `runtime/activity-renderers.tsx` and `checkpoint-views.tsx`; `.fw-activity` added to the LabSpace result-drawer rule.
- `tests/food-web-lab.spec.ts` (2 cases).

### Verification
See `sprint-status.yaml` `fl21_tracking.verification`. No commit, push, shared-database write or release.

## Session 2026-11-02 — release rehearsal (T9)

Isolated database `nexalab_fl21_release`, with curriculum stand-ins that match the shared Bài 44 lesson id, topic and outcomes.

### What was added
- Migration `20261102120000_fl21_food_web_lab`: Lab `food-web` (khtn, grade 8, `KHTN8-L44`, draft) and challenge `fw_001`.
- `scripts/release-food-web.mjs`: admin API only, idempotent. It binds Bài 44 with outcomes `B44-O02` and `B44-O03`.
- FE library card 10 ("Lưới thức ăn", Network icon).

### Problems found and fixed
- **Pack golden outputs:** pack `expectedOutputs` accept scalars only, so the energy golden case now checks `setup`.
- **Publish policy on main (`93681ce`):** publishing now requires `DEV_APPROVAL_V1` evidence of the strict shape `{ developerCheck, agentCheck }`. The script now sends that shape.

### Result
- Release v1 ACTIVE with `DEV_APPROVAL:APPROVE`.
- Lab `food-web`: published, `SHARED_LIBRARY`, releaseCleared.
- Rerunning the script changed nothing.
- Student library: card shown; launching from it gave `FOUNDATIONAL_RELEASE`.

The shared environment was not touched.

## Clean-up (2026-11-03, owner request "clean code, remove redundant")
- FE: `FoodWebActivity` gained `isRemoval`, `checkpointOf` and `rolesComplete`, which replace three repeated HUNT/DEFOREST checks, two checkpoint lookups and two role checks. `FoodWebScene` builds its two arrow markers from one template and drops an unused map parameter. Exports used only inside their file (`NODE_POSITIONS`, `SceneProps`, `FW_CHECKPOINT_IDS`, `SPECIES_IDS`, `FIXED_STATES`) are now private.
- BE: `checkpoint-activities.ts` uses `isDeepStrictEqual` from `node:util` (key-order insensitive, checked against reordered JSON) instead of the hand-written `sameValue` and its `sameState` wrapper. The effect enum and the `food-web@1.0.0` model reference are declared once. Rubric behaviour is unchanged.
- Kept as is: the release script follows the one-script-per-Lab convention. The 37 panel CSS rules shared with FL-20 are left for a common ecology panel stylesheet once both branches are merged.
- Verification: FE tsc ok, food-web spec 2/2. BE lint ok, labs application and sim unit tests 173/173, FL-21 and FL-20 integration on the throwaway loopback cluster 2/2. Not committed.

## v1.1 — K8 3D meadow (2026-11-03)

Owner review of the running Lab: "Tôi đang không thích giao diện của lab L21 này hãy làm 3D để mô tả rõ hơn". Owner chose "Đồng cỏ sa bàn" over a trophic-level tower. Presentation only: model, activity, rubric and release are unchanged.

### Branch work
- L21 committed locally (FE `de8d882`, BE `96d1cd2`), not pushed. The owner reviews before the push.
- BE merged `origin/main` (`c026d78`, FL-07 thermal, buoyancy, eye optics). Conflicts in `sim-packs.ts`, the evaluator registry and its test, the sim `package.json` and `sprint-status.yaml` were resolved by keeping both sides. `@nexalab/sim` is now 1.6.0, because main and FL-21 had each released a different 1.5.0. Lint ok; sim and labs application tests 277/277.
- FE merged `origin/feat/fl-20-k8-ecostage` (`a1d55b0`) to reuse the K8 kit. That branch already includes main. Resolved: `lab-info.ts` keeps both cards (food-web is number 11); the sim tarball is replaced by 1.6.0 and the lockfile integrity updated.
- Until the FL-20 v1.1 PR is merged, the FL-21 FE PR also shows those commits.

### What changed (FE)
- Kit:
  - `MeadowDiorama3D`;
  - `Critters3D` with 11 procedural organisms and `Placed` (the removed ghost);
  - `soilBlock` in `procedural.ts`, shared with the pond;
  - `FOOD_WEB_LINKS` colours;
  - `EcoStage.css`, which now holds the canvas box rules that were in the FL-20 stylesheet.
- `food-web/FoodWebView3D.tsx`: organisms placed in their habitats, arched arrows from food to eater, a dashed red missing link, dashed decomposer flows, and rings for the chain and for increase or decrease.
  - Labels are `.fw-node` buttons in a DOM overlay, keeping the 2D contract.
  - The 2D `FoodWebScene` is the fallback.
- `FoodWebActivity`:
  - 3D by default on desktop, phones start on 2D;
  - "Xem sơ đồ 2D" / "Xem cảnh 3D" toggle, stored per browser;
  - energy pyramid and causes float as a card.
- `tests/food-web-lab.spec.ts`: new 3D test (canvas `aria-hidden`, 11 label buttons, roles and chain on the labels, toggle remembered after F5).

### Verification
- tsc and build ok.
- FL-20 and FL-21 specs 6/6 on a separate Vite (5303, mocked API).
- Review stack screenshots at 1440 and 390 px through roles, chain, energy and hunt: no page errors. Headless swiftshader, tier low.
- sloplint 0 FAIL: WARN 29 for the glass card and panel (waived in the stamp), F7 answered.
- Review stack for the owner: Vite 5298 → API 4298 (this branch) → loopback `nexalab_fl21_release`.

### Owner review 2026-11-03: links unclear, answering felt hard
Owner: "Các đường nối giữa các con vật vẫn chưa rõ cảm giác trả lời các câu hỏi cứ khó khăn".
- **Arrows:** bolder lines, darker base colour and larger heads. In 3D, three dots run along each arrow from food to eater; they stay still under reduced motion. The 2D edges are thicker as well.
- **Reading aid:** hovering, focusing or tapping an organism brings its direct links forward, dims the rest, and writes them out in `.fw-relation` (aria-live), e.g. "Ếch ăn: Châu chấu, Sâu ăn lá. Ếch là thức ăn của: Rắn." It works the same in 2D and 3D (`boardFocus`, `nodeHandlers`). The text never states a role or a removal effect.
- **Question focus,** limited to what the wording already gives:
  - ROLES brings Cỏ, Ếch and Nấm, vi khuẩn forward until checked;
  - HUNT and DEFOREST bring forward every link of the species to be removed, until observed;
  - ENERGY now draws the question's chain Cỏ → Châu chấu → Ếch → Rắn instead of the learner's own chain.
- Snake moved away from the frog so their arrow is visible.
- **Verification:** tsc and build ok; specs 6/6, including the reading aid in the 3D test; screenshots of hover and of the HUNT question without page errors.

## Catalog thumbnails (2026-11-04)

- FE `dev/lab-thumbnail-capture.tsx` gained fixtures for both K8 Labs, captured with `npm run capture:lab-thumbnails -- <lab-id>` (local Vite, `/api/**` blocked, no DB writes).
- FL-20 `ecology-tolerance.webp` (29 KB): the production `PondView3D` at 28 °C with the school swimming. Committed on `feat/fl-20-k8-ecostage` as `c9b6fde` and merged into `feat/fl-21-food-web`; not pushed yet.
- FL-21 `food-web.webp` (27 KB): the production `FoodWebView3D` meadow with every arrow and the energy chain lit, labels hidden so the card is language-neutral. It ships with the uncommitted v1.1 3D work.
- 2026-11-04: owner approved; FE committed as `f3acc7c` and pushed with BE on `feat/fl-21-food-web`; FL-20 pushed `c9b6fde`. `fl-21-v11-t1-3d-meadow-scene` moved to review (PR by the owner).

## Session 2026-11-05 — shared-environment publish (T9)

The owner asked to publish FL-21, overriding the "no shared-database writes" rule for this release.

- The owner ran `npx prisma migrate deploy` on Supabase. It applied `20261102120000_fl21_food_web_lab` only. The DB also has `20261103090000_ebook_edition_cover_asset_version` from main, which this branch doesn't have yet.
- API :4000 had been running since 2026-11-02, before the FL-21 code, so `MODEL_REGISTRY` had no `food-web@1.0.0`. It was restarted on `feat/fl-21-food-web`.
- `FL21_PUBLISH=true node scripts/release-food-web.mjs`: activity `food-web-checkpoints` v1, configuration v1 and pack `food-web-k8` v1 were created and activated. Release v1 is ACTIVE, digest `b06b1da8…bfda7`, under DEV_APPROVAL_V1.
- Student `nguyenan.8a`: `/api/labs` lists `food-web` as published, `SHARED_LIBRARY`, releaseCleared.
- Still open: T8 device QA, and the review of the T1 blueprint and v1.1 3D meadow. The shared API now runs a branch that isn't merged into main yet.
