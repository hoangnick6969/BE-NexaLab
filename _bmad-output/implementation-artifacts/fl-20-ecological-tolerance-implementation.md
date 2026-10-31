# FL-20 ecology-tolerance — implementation record

Spec: `../specs/spec-fl-20-ecological-tolerance/` (SPEC, lab-definition, implementation-plan).
Branch: `feat/fl-20-ecological-tolerance` in BE (from `0ac700a`) and FE (from `0a8cf73`). Nothing committed or pushed.

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
