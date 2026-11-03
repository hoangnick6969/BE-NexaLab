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
