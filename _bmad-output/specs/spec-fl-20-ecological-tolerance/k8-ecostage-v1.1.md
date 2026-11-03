---
id: SPEC-fl-20-k8-ecostage-v1.1
status: in-review
date: '2026-11-03'
branch: feat/fl-20-k8-ecostage (FE from main bae1b00; BE docs only, from main ac4b8aa)
parent: SPEC.md
upstream:
  - ../spec-lab-pipeline/lab-catalog-and-shared-kits-khtn8-9.md
---
# FL-20 v1.1 — K8 EcoStage: 3D pond diorama

**Status:** built and verified locally; the owner reviews the 3D level before merge. Presentation only: model `ecology-tolerance@1.0.0`, activity `ecology-tolerance-checkpoints` v1, rubric and release v1 are unchanged.

## 1. Why

- Owner feedback 2026-11-03: the FL-20 scene "nhìn đơn giản mà không có 3D".
- The kit plan (`lab-catalog-and-shared-kits-khtn8-9.md` §6A, K8 row) kept FL-20 as "2D (HUD)" and allowed 3D "khi cải thiện học tập và qua QA". The owner asked for 3D (2026-11-03: "Bạn cứ làm đi tôi sẽ xem xét mức độ 3D"), and said school computers have adequate GPUs.

## 2. Decisions

| ID | Decision | Source |
|---|---|---|
| V-1 | Full 3D diorama for the pond steps (T_INSIDE, T_ABOVE, LIMITS, free explore); compare, density and pyramid stay 2D HUD views | owner "cứ làm đi", recommendation |
| V-2 | All geometry procedural: no GLB, HDR or downloaded textures, so no asset licence work | recommendation, not contradicted |
| V-3 | Default quality tier "high" on machines with ≥ 6 cores; `PerformanceMonitor` steps down | owner: GPUs are not weak |
| V-4 | The 2D SVG scene stays: learner toggle (stored per browser) and automatic fallback without WebGL | Lab rule (canvas decorative, 2D always available) |
| V-5 | No re-release: the release snapshot holds activity, pack template and `visualAssetVersionId` (null), not FE code, so digest `a2c26382…` stays valid | `lab-release.service.ts` snapshot fields |
| V-6 | Out of range fish show a temperature response instead of fading. Heat: crowd the surface gasping (bubbles, flushed), then sink and lie on the floor tipped on one side. Cold: slow, sink and rest on the floor, pale and frosted. Reverses when the water is back in range; never belly-up, floating or blood | owner 2026-11-03 "Phản ứng theo nhiệt" |
| V-7 | Per-question feedback: after each checkpoint is observed (LIMITS: after it is answered) the panel shows the learner's answer, a right / not-yet verdict with the correct answer, the observation, and waits for "Câu tiếp theo". The verdict is a local preview of the same model and rubric; the server still re-grades everything on submit. Answers stay locked once checked. The result drawer replaces the question panel while open | owner 2026-11-03: learners "không biết nó đúng hay sai", result drawer overlapped the panel |

## 3. Scene

- Cut-open pond between two banks with soil layers; muddy floor with pebbles; weeds bent in a vertex shader; additive procedural caustics; tinted water pane and rippling surface; lily pads; reeds with cattails; contact shadow under the diorama.
- School of procedural cá rô phi (instanced, tail bend shader). Mood from the activity: `hidden` → neutral grey and still; `persists` → swimming, liveliness from the illustrative growth curve; `gone` → heat or cold response (V-6); before a prediction is checked the fish stay neutral, so the response never hints at the answer.
- Glass thermometer with a 0–50 °C column and scale plate; the value chip repeats a DOM value.
- Water tint (cold blue → green → amber), frost below about 6 °C and steam above about 38 °C follow the temperature only, never the outcome.
- Framing keeps the subject in the space left by header, graph card, dock, submit bar and question panel (off-centre projection). Learner can orbit within limits and zoom; no pan. Phone: the diorama is a 300 px box above the graph.

## 4. Non-goals

- 3D for the density field, age pyramid or fish A/B/C comparison.
- Population dynamics, fish behaviour driven by anything but the existing observation.
- FL-21 scene (later, can reuse the K8 kit).

## 5. Verification

See `../../implementation-artifacts/fl-20-ecological-tolerance-implementation.md` § v1.1.
