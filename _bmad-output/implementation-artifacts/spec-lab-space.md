---
title: 'Immersive Lab Space with shared physics stage'
type: 'feature'
created: '2026-10-30'
status: 'done'
baseline_commit: 'a34df2c378dd37fb47d62a90acbe76d0c4663cf0'
route: 'dispatch'
review_loop_iteration: 0
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Labs are embedded in dashboard and assignment layouts, fragmenting the experiment. The new physics scene is an independent demo rather than the production pilot runtime.

**Approach:** Introduce a shared, viewport-filling Lab Space. Keep only the lab title and exit action at top left, with experiment controls, questions and results in compact overlays. Reuse one detailed physics room and bench while mounting model-specific apparatus. Support existing foundational and class entry points without changing assessment contracts.

## Boundaries & Constraints

**Always:** Preserve server grading, launch/version pinning, assignment ownership, checkpoint sequence, drafts, retry idempotency, save and pathway reconciliation. Preserve LED topology editing, component values, switch controls and arbitrary connections when replacing its 2D editor. Keep keyboard and touch alternatives to 3D interaction. Use installed R3F/drei and existing localization conventions. Questions must be dismissible/reopenable without changing evidence. Keep exit reachable during loading and errors. Return to the originating lesson section or assignment when known.

**Never:** Change science models, release state, published catalog eligibility, database contents or backend routes. Do not expose unreleased candidates. Do not reuse demo scores, hardcoded measurements or demo completion as official evidence. Do not build new biology/chemistry environments; their existing renderers use the shared space shell. No push or deployment.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| Pilot | Compatible circuit-bulb launch | Prediction, switch observation, second prediction, observation, explanation and submission remain in order | Server errors retain evidence and permit retry |
| Legacy circuit | circuit@1.0.0 state | 3D apparatus and controls edit the same nodes/edges and values | Unknown versions remain blocked by renderer registry |
| Foundational / direct assignment | Existing lab URL and context query | Full viewport space; exit returns to validated origin | Unreleased or inaccessible labs retain current denial behavior |
| Assigned lesson step | Mounted LAB/CHALLENGE workspace | Enter opens shared space; exit returns to same mounted assignment state | Keep lessonStepId, assignmentId and reconciliation callback |
| Draft / refresh | Compatible unfinished evidence | Existing restore/discard flow survives presentation changes | Incompatible drafts are never restored |
| Small screen / no WebGL | Narrow viewport or renderer failure | Reachable controls, scrollable questions, honest unavailable state | No blank canvas or fabricated success; allow retry/exit |

</frozen-after-approval>

## Code Map

All frontend paths below are relative to `D:/coding/NEXA/nexalab-fe`.

- `src/app/App.tsx`: authenticated shell and `/labs/:id`; preserve role checks while excluding sidebar/topbar/footer from active Lab Space.
- `src/features/labs/Lab.tsx`: canonical host; owns launch, validated lesson return link, direct assignment identity, reset, submit, feedback, hints and save. Preserve these operations while changing layout.
- `src/features/labs/lab-run-host.ts`: authoritative renderer compatibility, IndexedDB drafts and pinned submissions; keep contracts unchanged.
- `src/features/labs/physics/shared/PhysicsStage.tsx`: shared room, table and responsive camera. The obsolete `PhysicsBench3D.tsx` demo wrapper was removed after verifying it had no imports/callers.
- `src/features/labs/physics/electricity/CircuitBulb3DStage.tsx`: real pilot apparatus mounted inside the common physics environment.
- `src/features/labs/physics/electricity/CircuitBulbActivity.tsx` and CSS: evidence-driven phases; learner can select equivalent SVG 2D or R3F 3D, with 3D default and a local per-lab view preference. Both use the same switch and checkpoint semantics.
- `src/features/labs/physics/electricity/Circuit.tsx`: Circuit topology view selector and 3D apparatus.
- `src/features/labs/physics/electricity/Circuit2DEditor.tsx`: restored React Flow 2D topology editor from the pre-Lab-Space `Circuit.tsx`; it retains component placement, wire editing and circuit property controls.
- `src/features/labs/shared/LabRendererToggle.tsx`: shared accessible 2D/3D selector and device-local preference. Do not expose a mode before that Lab has an implemented equivalent renderer.
- `src/features/labs/shared/LabSpace.tsx`: shared full-screen shell.
- `src/features/labs/pathways/PracticalPathwayStep.tsx`, `physics/electricity/CircuitPathwayStep.tsx`: assigned-lesson submissions; share space without routing through a different attempt contract.
- `src/features/assignments/AssignedLearning.tsx`: multiple mounted pathway steps; only explicit entry opens one space.
- `tests/lab-run-host.spec.ts`, `circuit-lab.spec.ts`, `lesson-lab-navigation.spec.ts`: existing runtime and navigation checks to adapt/extend.

## Tasks & Acceptance

### Human-approved view-mode amendment — 2026-10-30

Where a Lab has two scientifically equivalent renderers, learners may choose 2D or 3D; 3D is the default when implemented and stable. View mode is presentation-only, saved locally per Lab and excluded from all attempt, assignment and release data. Only Circuit bulb and Circuit topology currently meet this criterion. Chemistry, biology and other candidate kits remain single-view until their renderers are actually built and verified. This amendment supersedes the original removal of the Circuit bulb 2D view.

**Execution:**
- [x] Add `src/features/labs/shared/LabSpace.tsx` and CSS for shared full viewport shell, exit, accessible question/result overlays and responsive layout.
- [x] Adapt `src/app/App.tsx` and `src/features/labs/Lab.tsx` to remove surrounding chrome and relocate existing controls into the space.
- [x] Refactor `PhysicsBench3D.tsx` and `CircuitBulb3DStage.tsx` into shared environment/stage and model apparatus. Add room details matching reference: light walls, tile floor, cabinets, sink, wood bench, credible shadows and cables.
- [x] Update `physics/electricity/CircuitBulbActivity.tsx` and CSS to use badges/pop-ups and preserve evidence transitions and accessible controls; keep an equivalent 2D schematic as a learner-selectable view alongside 3D.
- [x] Keep `physics/electricity/Circuit.tsx` topology/value controls and provide the original React Flow 2D editor plus interactive 3D equipment view.
- [x] Integrate shared shell into `PracticalPathwayStep.tsx` / `CircuitPathwayStep.tsx` using explicit entry and exit that preserve mounted state.
- [x] Extend focused Playwright coverage for matrix edge cases and full viewport desktop/mobile layout; update legacy selectors to real accessible controls.

**Acceptance Criteria:**
- Given a supported lab, when opened, then simulation occupies the viewport and application navigation is absent.
- Given a pilot checkpoint, when its badge is opened or closed, then evidence changes only through the existing prediction or interaction actions.
- Given a legacy LED circuit, when edited in 3D, then submitted state retains the existing model schema and server remains the result authority.
- Given an assigned lesson, when entering and exiting a lab, then its state and lesson-step submission context survive and progress reconciliation still works.
- Given another existing model, when opened, then it uses Lab Space without introducing a new science implementation.

## Implementation Notes

Checkpoint commits requested before implementation:
- Backend: `a34df2c378dd37fb47d62a90acbe76d0c4663cf0`.
- Frontend: `ae04cf69c95c1f00cdf72dea09c5c935e1684d40`.

No intent gaps or irreversible changes identified. Footprint spans shell, both circuit renderers, pathway callers and focused tests. No Three.js skill was found in the frontend skill inventory; use installed dependencies and owning source.

## Spec Change Log

## Review Triage Log

## Design Notes

Use a shared portal/viewport shell for assigned steps so entering a space does not switch from lesson-step attempts to LabRun attempts. Retain separate lab identities: sharing an environment does not approve or merge catalog candidates. FL-07 is thermal energy in the catalog; shared physics room reuse does not reclassify it as electromagnetism.

## Verification

- Frontend `npm run lint` and `npm run build`: pass.
- Focused mocked Playwright tests: pilot evidence payload, retry/draft compatibility, legacy editor actions, pathway state, exit navigation and shell isolation pass without remote database writes.
- Browser screenshots at desktop and mobile widths: verify scene, overlay readability, focus, touch targets, scrolling and viewport coverage. Mocked checks are not live pilot acceptance evidence.

Implementation complete 2026-10-30. Production-preview Playwright focused suite passed 22/22; lint, build and `git diff --check` passed. Screenshots: `../nexalab-fe/output/playwright/lab-space-desktop-verified-open.png`, `../nexalab-fe/output/playwright/lab-space-mobile-verified-open.png`, and `../nexalab-fe/output/playwright/lab-space-mobile-verified-closed.png`. Live production pilot and physical Chromebook/Celeron verification remain untested.
