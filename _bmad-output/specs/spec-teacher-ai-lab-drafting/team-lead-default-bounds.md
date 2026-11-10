# TAI-06 T0: team-lead default bounds (2026-11-09)

**Status: team-lead default bounds 2026-11-09, pending PO/reviewer confirmation.**

This file records a **team-lead decision** (2026-11-09). It is **not** a product-owner approval, **not** a named-reviewer
approval of the parameter ranges (Q-C2-04), and **not** a legal/provider approval. It closes gates G-4 and G-6 for
development and test only, on the assumptions below. The PO and the named reviewers must still confirm; until they do,
no model's `rangeReview` is `"approved"`.

## Decision and assumptions

| Gate | Team-lead assumption | What it does not mean |
| --- | --- | --- |
| G-4 (scope and ranges) | v1 is AI-proposed challenge variants on the existing labs (no custom Lab builder). The default bounds below, taken unchanged from the current schema of `CHALLENGE_PARAMETERS`, are safe to offer to Teacher AI. | The PO has not accepted the scope. No reviewer has approved the ranges. |
| G-6 (provider) | The project's existing provider adapter behind the provider port. Tests, golden cases and e2e use the **fake, deterministic provider only**; no live network call is made. | No provider, tier, under-18 or data-boundary approval exists. A live provider still needs written G-6 approval. |

## How the bounds are wired (single source of validation)

- `CHALLENGE_PARAMETERS` in `src/modules/lessons/application/lesson-content.ts` stays the **only** definition of the
  allowed parameters and ranges. `challengeParamErrors`, `packConfigurationErrors`, `versionErrors` and the TAI-06
  validation all read it. No second copy of the numbers exists.
- `circuit`, `chemistry` and `eye` carry the new `rangeReview` value **`"team-lead-default"`** with `boundsRef` pointing
  to this file. `"approved"` is **not** used, because that value means a named reviewer approved the ranges.
- Teacher AI offers a model only when its `rangeReview` is `"approved"` or `"team-lead-default"` and it has at least one
  parameter (`aiOfferedLabs()`). Every other model stays `"pending"` and is never in the snapshot.
- The shared-library release gate in `publishBlockers` still requires `"approved"`, so a team-lead default **does not**
  unblock shared-library release.
- When PO and reviewers confirm (or change) the values, edit `CHALLENGE_PARAMETERS` and flip `rangeReview` to
  `"approved"`; nothing else needs to change.

## Derived bounds

Source of every number: `CHALLENGE_PARAMETERS` in `src/modules/lessons/application/lesson-content.ts` (the existing KHTN
lab schema). "Engine basis" is the code the bound protects.

| Lab (model) | Parameter | Type | Bound | Step | Unit | Engine basis |
| --- | --- | --- | --- | --- | --- | --- |
| `circuit` (`circuit@1.0.0`) | `maxCurrentMa` | number | 5 to 20 | 1 | mA | `packages/sim/index.ts` `circuit()` fixes the LED limit at 20 mA (`maxCurrentMa: 20`); `evaluateChallenge` counts an LED lit between 1 mA and 20 mA, so a ceiling above 20 mA is meaningless. |
| `circuit` | `minLitLeds` | number | 1 to 3 | 1 | LED | `evaluateChallenge` counts lit LEDs across branches; 3 is the schema ceiling. |
| `chemistry` (`chemistry@1.0.0`) | `experiment` | choice | `ph` | - | - | `chemistry()` litmus branch (`samples`). |
| `chemistry` | `reactionId` | choice | `mg-hcl`, `caco3-hcl`, `naoh-hcl`, `cuso4-naoh`, `nacl-agno3`, `fe-cuso4` | - | - | `reactions` table in `packages/sim/index.ts` (ratios, products). |
| `eye` (`eye@1.0.0`) | `minScore` | number | 50 to 100 | 10 | % | `eye()` score is `round(correct / 8 * 100)`, so 0 to 100; below 50 is not a meaningful pass bar. |

All other models in `CHALLENGE_PARAMETERS` (`thermal-energy`, `lever-equilibrium`, `mass-conservation`, `density`,
`buoyancy`, `gene-protein`, `eye-optics`, `em-induction`, `ecology-tolerance`, `food-web`) stay `"pending"` and are not
offered. The lesson schema (`lesson-schema.ts`) already restricts `labId` to `circuit`, `eye`, `chemistry`.

## Engine sweep (evidence, not invented)

`npx tsx scripts/tai06-derive-bounds.ts` (read-only, no database, no network) runs **every** value the schema allows
through `evaluate()` on the built-in reference states (below). A parameter set is "engine-verified" when at least one
state is `passed` and at least one is not. Result on 2026-11-09:

| Lab | Reference states | Parameter sets swept | Engine-verified | Not verified (reason) |
| --- | --- | --- | --- | --- |
| `circuit` | 4 (open circuit; 9 V 100 ohm over-current; 9 V 470 ohm about 15 mA; 9 V 1000 ohm about 7 mA) | 67 | 29 | 38 unsolvable: `maxCurrentMa` 5 and 6 (no reference state stays below 7 mA) and `minLitLeds` 2 or 3 (every reference circuit has one LED). Verified region: `maxCurrentMa` 7 to 20 with `minLitLeds` 1 or omitted. |
| `chemistry` | 14 (balanced and excess-reagent state per reaction; correct and wrong litmus) | 13 | 13 | none |
| `eye` | 3 (no part named; half; all) | 12 | 12 | none |

The engine check (LV-06, LV-07) therefore narrows the offered values per request. A teacher can still choose a value
outside the verified region by hand in the lesson editor (it passes `challengeParamErrors`), because the bounds above
stay the schema ranges.

## Reference states (assumption)

The SPEC reads reference states from the active `SimulationPackVersion.template.goldenCases`, else the active
`SimulationConfigVersion.goldenCases`. A fresh database has neither for these labs, so the team lead added a **third
source, BUILTIN**: engine-derived states in `src/modules/ai/application/lab-reference-states.ts` (`goldenTemplates` for
`circuit` and `eye`, and generated states for every `chemistry` reaction plus litmus). Pack or configuration states
always win when present. This deviates from "a lab with neither offers no proposals" and needs PO/reviewer confirmation
with the bounds.

## What remains open

- PO acceptance of the v1 scope (challenge variants, no custom Lab builder).
- Named-reviewer approval of the ranges above (Q-C2-04), then `rangeReview: "approved"`.
- Written G-6 provider approval before any live provider call.
- The supervising lecturer's rating of real proposals (TAI6-T5); only a synthetic, fake-provider evaluation exists.
