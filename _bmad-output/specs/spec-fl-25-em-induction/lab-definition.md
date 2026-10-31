# FL-25 blueprint: cảm ứng điện từ và nguyên tắc tạo dòng điện xoay chiều

Status: technical design draft; outcome, activity and scientific assumptions PROPOSED / UNREVIEWED. Follows the Circuit bulb blueprint template (`../spec-foundational-lab-p3-1/lab-definition.md`) and `../spec-lab-pipeline/foundational-lab-track.md` §Activity blueprint template.

## 1. Identity

| Field | Value |
|---|---|
| Discovery ID / slot | FL-25 / provisional slot 18 (KEEP, W4, K9 cond.) |
| Lab key | `em-induction` (new; not a mode of `circuit`) |
| Model | `em-induction@1.0.0` (new allowlisted model in `packages/sim`) |
| Activity / rubric | `em-induction-checkpoints` v1 / `em-induction-checkpoints@1.0.0` |
| Renderer key | `em-induction` (FE allowlist) |
| Kit / tier | K1 Bàn Điện–Từ / Tier A Scene-first; 2D schematic view required as equivalent |
| Archetype | Parameter explorer + spatial interaction |

## 2. Learning intent and source (proposed)

Candidate outcomes (register text truncated, see SPEC D-3):
- `KHTN-L9/dien-tu/1` (primary, proposed): thực hiện thí nghiệm để nêu được nguyên tắc tạo ra dòng điện xoay chiều (dòng điện luân phiên đổi chiều). The register row appears to merge or omit the induction-condition requirement (khi số đường sức từ xuyên qua tiết diện cuộn dây dẫn kín biến thiên thì trong cuộn dây xuất hiện dòng điện cảm ứng); a curriculum reviewer must confirm the exact official wording before mapping.
- `KHTN-L9/dien-tu/2` (supporting only): ví dụ về tác dụng của dòng điện xoay chiều. Not assessed by this activity.

Virtual objective: the student predicts, then observes, whether a closed coil carries induced current when a bar magnet is held still, pushed in or pulled out, compares the current's direction between push and pull, observes that a rotating magnet produces a current that reverses direction, and selects the causal explanation. This is evidence of virtual reasoning about a qualitative model, not of hands-on experimental competence.

## 3. Model `em-induction@1.0.0` (qualitative, deterministic)

### 3.1 State schema v1 (strict)

```ts
type EmInductionState =
  | { setup: "magnet-coil";
      circuit: "CLOSED" | "OPEN";
      poleFacingCoil: "N" | "S";
      magnetPosition: "OUTSIDE" | "INSIDE";      // position at the end of the action
      motion: "STILL" | "TOWARD" | "AWAY" }      // relative motion of magnet and coil during the action
  | { setup: "generator";
      circuit: "CLOSED" | "OPEN";
      rotation: "STILL" | "CW" | "CCW";
      turns: 0 | 1 };
```

Validation (reject, never coerce):
- `motion = TOWARD` requires `magnetPosition = INSIDE`; `AWAY` requires `OUTSIDE`; `STILL` accepts either.
- `generator`: `rotation = STILL` ⇔ `turns = 0`.
- Unknown keys, other setups, or extra fields → error.

### 3.2 Output (observations)

```ts
type EmInductionObservation =
  | { version: "1.0.0"; setup: "magnet-coil";
      fieldThroughCoil: "INCREASING" | "DECREASING" | "UNCHANGED";
      inducedCurrent: "PRESENT" | "ABSENT";
      direction: "D1" | "D2" | "NONE" }           // D1/D2 = the two directions of the fixed coil winding
  | { version: "1.0.0"; setup: "generator";
      inducedCurrent: "PRESENT" | "ABSENT";
      currentKind: "ALTERNATING" | "NONE";
      reversalsPerTurn: 0 | 2;
      phaseDirections: Array<"D1" | "D2" | "NONE">; } // 8 samples per turn, 45° apart, starting at 0°
```

### 3.3 Rules

Magnet and coil:
1. `fieldThroughCoil` = INCREASING if `motion = TOWARD`, DECREASING if `AWAY`, UNCHANGED if `STILL`.
2. `inducedCurrent` = PRESENT only if `circuit = CLOSED` and `fieldThroughCoil ≠ UNCHANGED`; otherwise ABSENT and `direction = NONE`.
3. Direction sign table for the fixed winding: N + TOWARD → D1; N + AWAY → D2; S + TOWARD → D2; S + AWAY → D1. (Reversing either the pole or the motion reverses the direction; reversing both keeps it.)

Generator (two-pole magnet rotating about an axis perpendicular to the coil axis; coil fixed):
4. If `rotation = STILL` or `circuit = OPEN` → ABSENT, `currentKind = NONE`, `reversalsPerTurn = 0`, all phases NONE.
5. Otherwise the field through the coil follows cos θ, so the induced current follows the sign of sin θ for CW (and −sin θ for CCW): phase samples at θ = 0°, 45°, …, 315° are `NONE, D1, D1, D1, NONE, D2, D2, D2` for CW and the D1/D2 swap for CCW. `currentKind = ALTERNATING`, `reversalsPerTurn = 2`.

### 3.4 Assumptions and limits (learner-facing summary required)

- Qualitative only: no EMF, current magnitude, resistance, Faraday or Lenz formula, speed dependence, number of turns or field strength. Needle amplitude in the renderer is fixed and illustrative (SPEC D-4).
- Relative motion is what matters; moving the coil instead of the magnet is equivalent but is not a separate state in v1.
- An open coil shows no current; induced EMF in an open coil is not modelled or mentioned as a measured value.
- Field lines in the 3D/2D views are an illustrative picture of a bar magnet's field, not model output and not measured data.
- Virtual activity; no instruction to build a real generator or handle mains electricity.

## 4. Activity `em-induction-checkpoints` v1

Ordered checkpoints; each prediction is recorded BEFORE the observation is shown (same flow as Circuit bulb). Apparatus is fixed: coil connected to a zero-centre galvanometer and an antiparallel pair of LEDs; the circuit is CLOSED for all scored checkpoints.

| # | Checkpoint id | Learner action | Required state | Prediction choices | Correct (from model) |
|---|---|---|---|---|---|
| 1 | `STILL` | Hold the magnet still just outside the coil, N pole facing it | magnet-coil, N, OUTSIDE, STILL | `CURRENT` / `NO_CURRENT` | `NO_CURRENT` |
| 2 | `PUSH` | Push the N pole into the coil | magnet-coil, N, INSIDE, TOWARD | `CURRENT` / `NO_CURRENT` | `CURRENT` |
| 3 | `PULL` | Pull the N pole out of the coil | magnet-coil, N, OUTSIDE, AWAY | compared with PUSH: `SAME` / `OPPOSITE` / `NONE` | `OPPOSITE` |
| 4 | `ROTATE` | Turn the generator crank one turn | generator, CW, turns 1 | `ONE_DIRECTION` / `ALTERNATING` / `NONE` | `ALTERNATING` |
| 5 | explanation | Choose why current appears | — | A / B / C | A |

Explanation options (Vietnamese is primary copy):
- A — Dòng điện cảm ứng xuất hiện khi số đường sức từ xuyên qua tiết diện cuộn dây dẫn kín biến thiên.
- B — Cứ đặt nam châm gần cuộn dây là luôn có dòng điện.
- C — Dòng điện xuất hiện vì nam châm chạm vào dây dẫn.

Evidence JSON v1:

```json
{
  "checkpoints": [
    {"id": "STILL",  "state": {"setup":"magnet-coil","circuit":"CLOSED","poleFacingCoil":"N","magnetPosition":"OUTSIDE","motion":"STILL"},  "prediction": "NO_CURRENT"},
    {"id": "PUSH",   "state": {"setup":"magnet-coil","circuit":"CLOSED","poleFacingCoil":"N","magnetPosition":"INSIDE","motion":"TOWARD"}, "prediction": "CURRENT"},
    {"id": "PULL",   "state": {"setup":"magnet-coil","circuit":"CLOSED","poleFacingCoil":"N","magnetPosition":"OUTSIDE","motion":"AWAY"}, "prediction": "OPPOSITE"},
    {"id": "ROTATE", "state": {"setup":"generator","circuit":"CLOSED","rotation":"CW","turns":1}, "prediction": "ALTERNATING"}
  ],
  "explanation": "A"
}
```

STILL uses the OUTSIDE position (changed 2026-10-31 during build): the magnet then moves OUTSIDE → INSIDE (PUSH) → OUTSIDE (PULL) without an unshown repositioning that would itself induce current.

Server validation: exactly four checkpoints in this order; each state passes the model schema AND equals the required state of its checkpoint (any difference → validation error, no attempt), the same rule as the bulb `circuitPath` check. Evidence size limit as Circuit (20 000 chars).

## 5. Rubric `em-induction-checkpoints@1.0.0`

The server simulates every checkpoint on the pinned model, then:
- `STILL`: correct iff prediction = (`inducedCurrent = PRESENT` ? CURRENT : NO_CURRENT).
- `PUSH`: same mapping.
- `PULL`: correct iff prediction = (PULL.direction = NONE ? NONE : PULL.direction = PUSH.direction ? SAME : OPPOSITE).
- `ROTATE`: correct iff prediction = (`currentKind = ALTERNATING` ? ALTERNATING : `inducedCurrent = PRESENT` ? ONE_DIRECTION : NONE).
- Explanation: correct iff A.

Score = number of met criteria out of 5; PASS = 5/5, otherwise NEEDS_PRACTICE with one feedback line per unmet criterion (`prediction:STILL`, `prediction:PUSH`, `prediction:PULL`, `prediction:ROTATE`, `explanation`). A NO_CURRENT observation is a valid observation, never a failed experiment by itself.

## 6. Golden and invalid cases

Model (packages/sim unit tests):

| ID | State | Expected |
|---|---|---|
| EM-01 | N, INSIDE, STILL, CLOSED | UNCHANGED, ABSENT, NONE |
| EM-02 | N, INSIDE, TOWARD, CLOSED | INCREASING, PRESENT, D1 |
| EM-03 | N, OUTSIDE, AWAY, CLOSED | DECREASING, PRESENT, D2 |
| EM-04 | S, INSIDE, TOWARD, CLOSED | INCREASING, PRESENT, D2 |
| EM-05 | S, OUTSIDE, AWAY, CLOSED | DECREASING, PRESENT, D1 |
| EM-06 | N, INSIDE, TOWARD, OPEN | INCREASING, ABSENT, NONE |
| EM-07 | N, OUTSIDE, STILL, CLOSED | UNCHANGED, ABSENT, NONE |
| EM-08 | generator, CW, 1, CLOSED | ALTERNATING, 2 reversals, phases NONE,D1,D1,D1,NONE,D2,D2,D2 |
| EM-09 | generator, CCW, 1, CLOSED | phases NONE,D2,D2,D2,NONE,D1,D1,D1 |
| EM-10 | generator, STILL, 0, CLOSED | ABSENT, NONE, 0 |
| EM-11 | generator, CW, 1, OPEN | ABSENT, NONE, 0 |
| EM-X1 | TOWARD with OUTSIDE | rejected |
| EM-X2 | generator STILL with turns 1 | rejected |
| EM-X3 | unknown field / unknown setup | rejected |

Activity (lab-run tests): all correct + A → PASS 5/5; each single wrong prediction → NEEDS_PRACTICE with that criterion; explanation B or C; checkpoint missing, out of order or duplicated; checkpoint state differing from its required state (e.g. PUSH sent with S pole) → validation error, no attempt; replay of the stored attempt reproduces identical observations.

## 7. Modality, accessibility and assets

- Two views on one state and one event stream: 3D apparatus scene and 2D schematic (coil, magnet, galvanometer symbol, LED pair). Equivalence is a QA gate (implementation-plan FL25-T9).
- Every action has a DOM button with a text label; observation is text plus icon (for example "Kim điện kế lệch sang phải · đèn LED A sáng"), never colour alone; `aria-live` status; full keyboard path; `prefers-reduced-motion` honoured live.
- Assets: procedural geometry and canvas-drawn dial only; no GLB, HDR or external texture; any font file is local and licence-checked.

## 8. Review roles (not attestations)

Curriculum reviewer: exact outcome text and provenance (D-3). Science/model reviewer: rules 1–5, direction table, phase samples, limits. Owner: rubric, safety copy, rights, and the exception in SPEC D-1. No reviewer decision is implied by this document.
