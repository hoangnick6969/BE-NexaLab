# Circuit pilot blueprint: closed/open circuit with a bulb

Status: technical design complete; outcome, teaching activity and scientific assumptions PROPOSED / UNREVIEWED. This defines a private engineering pilot, not an approved curriculum binding or a public Lab.

## Learning intent and source

Candidate: KHTN8 B22 simple electric circuit, source/lesson locator and precise official Outcome to be confirmed by the curriculum reviewer. Objective for the virtual activity: inspect a provided simple closed circuit, predict and compare the bulb's state when the switch is closed and open, and identify why the states differ. This can provide evidence of virtual reasoning, not physical handling competence. The complete Lesson and video are not prerequisites for the internal technical pilot; public practice remains open.

## Model and boundaries

Implement a new immutable allowlisted modelRef, proposed circuit-bulb@1.0.0, distinct from legacy circuit@1.0.0. State schema v1: component nodes battery, one generic bulb and one switch, and wires as undirected edges. Exactly one of each component; exactly one simple loop of those three nodes; no duplicate/self edges, extra components or alternate paths. A fixed circuit topology is supplied initially; the learner closes/opens the switch. Optional wiring interaction can be added only when separately defined and validated. Reject invalid/missing topology rather than generating plausible outputs.

The bulb is a qualitative, ideal low-voltage finite-resistance load. Output observation is circuitPath=OPEN|CLOSED and bulbState=OFF|ON; switch open gives OPEN/OFF, switch closed with the valid loop gives CLOSED/ON. No voltage/current value, polarity, brightness, heating, short-circuit energy, LED threshold or real circuit design is modeled. Do not equate a generic bulb with a 2 V LED. Review these assumptions and learner-facing safety text with a qualified scientific/model reviewer.

The existing model accepts LED, battery, resistor and switch, uses a fixed LED drop and produces raw verdicts for another activity; do not reuse its verdict as this rubric or modify its behavior in place.

## Activity: two checkpoints and structured explanation

One activity attempt contains these independently captured checkpoints in order. Each checkpoint includes the full submitted state and a learner prediction chosen BEFORE showing the authoritative observation in the assessment flow. FE can show an advisory preview only after the corresponding prediction is recorded. BE re-evaluates both states; client-provided observations cannot count as evidence.

1. CLOSED: switch closed in the valid loop; select predicted bulb state ON or OFF, then observe.
2. OPEN: open the same switch; select predicted bulb state ON or OFF, then observe.
3. Explanation: select one answer: A — an open switch interrupts the path, while a closed switch completes it; B — the battery disappears when the switch opens; C — a wire changes into an insulator.

Evidence JSON v1: checkpoints = [{id: CLOSED, state, prediction}, {id: OPEN, state, prediction}], explanation = A|B|C. The order and exact IDs are required; server verifies both states use the pinned model and each required switch state. A saved prediction is learner evidence, not proof of time/order unless captured by a server checkpoint protocol; the initial technical slice accepts a single final evidence envelope and does not claim anti-cheat verification of timing or intermediate physical manipulation.

## Rubric and result

Evaluate both states independently on the pinned model and compare predictions to computed outputs. Award one criterion each for CLOSED prediction ON, OPEN prediction OFF, and explanation A. PASS = all three criteria; NEEDS_PRACTICE = otherwise, with feedback for each unmet criterion. Invalid state/missing checkpoint is a validation error and creates no attempt; correct open-state observation is a valid successful criterion. Every valid incorrect submission creates a real non-passing attempt; retry uses a new idempotency key while preserving compatible workspace state.

Because the initial topology is supplied, this pilot tests interpretation and switch interaction, not independent circuit construction. Building wires and real-world practical skills are future activity outcomes, not claims of this pilot.

## Required cases and UX

Golden/invalid fixtures: closed→ON, open→OFF, all predictions correct + A→PASS; open/OFF must never itself cause failure; each wrong prediction, explanation B/C, missing checkpoint, wrong checkpoint state, duplicate node/wire, extra components and unsupported topology. Test replay, version activation during session, repeated submission and historical compatibility in the shared contract suite. Scientific reviewer validates the binary abstraction and reference values before reviewed use.

Provide accessible 2D controls with text labels, non-colour status, keyboard operation, explicit observe/predict/submit and a limitation notice. FE preview is advisory. Restore local drafts after F5 without creating attempts. A real BE assessment persists exact run/tuple, checkpoint states, computed observations and rubric version. Free Foundational access and assignment evidence follow the master contract.

## Review and later work

A curriculum reviewer confirms the exact official source, lesson/Outcome mapping and whether this activity provides primary or supporting evidence. A subject/science reviewer and a distinct model reviewer check the abstraction, rubric and golden cases; safety and rights review apply before release as needed. No reviewer, approval or source claim is fabricated.

The following historical appendix is discovery context only; its old pilot decision, model assumptions, bindings, ranges, UI and scoring do not govern the bulb pilot. Review it anew if an LED extension is later selected.

# Historical Appendix — LED current-limiting proposal
# Foundational Lab Definition: LED Current-Limiting DC Circuit

**Status: scientific candidate, not an approved pilot activity.** The first pilot must select one source-grounded KHTN 8 Outcome and one Lesson mapping with a named reviewer. B22 is a candidate; B21–B25 below are possible later consumers. A scientific/model reviewer must approve the exact assumptions, ranges, observations and cases relevant to the selected activity. This draft does not create a binding or authorize release.

## Identity

| Field | Definition |
| --- | --- |
| Working Lab key | `circuit` (reuse existing key) |
| Successor model reference | `circuit@1.1.0` after review; do not mutate `circuit@1.0.0` behavior in place |
| Modality | Deterministic simulation with a 2D circuit workspace |
| Grade focus | KHTN 8; conditional KHTN 9 reuse after provenance review |
| Scientific concept | Current in a closed low-voltage DC circuit containing an ideal source, ideal connections, switches, resistors, and red LEDs |
| Foundational Lab | The fixed model, valid state domain, computations, statuses, limitations, and reviewed challenge templates defined here |
| Class Lab | A Lesson/class/assignment context selecting an approved challenge and narrower approved thresholds without changing the model |

## Learning scope

The Lab lets a student construct a valid circuit, open and close it, vary low DC source voltage and resistance, compare one or more independent branches, predict whether an LED is off, lit in the modelled operating band, or overloaded, then submit the state for authoritative server evaluation.

The Lab is designed to support these observations:

1. No current flows through an open loop or open switch.
2. A closed loop containing a source and conducting components can carry current.
3. For this idealized LED branch, increasing source voltage increases current and increasing resistance decreases current.
4. A resistor limits LED current.
5. Independent parallel branches have their own current; total source current is the sum of branch currents.
6. Current and voltage use explicit units and can be compared with meter readings described in the Lesson.

The Lab does not claim to model household mains, transient behavior, battery discharge, thermal failure, arbitrary semiconductor I–V curves, or real component tolerances.

## Scientific assumptions

- Exactly one ideal DC voltage source is present.
- Wires, closed switches, and source internal resistance have zero resistance.
- An open switch breaks every path containing it.
- Each red LED is represented by a constant forward-voltage drop `V_f = 2.0 V` when forward biased. Polarity is not represented by `circuit@1.0.0`; the MVP must either add explicit LED polarity to `1.1.0` or clearly label the component as pre-oriented. Silent bidirectional conduction is not acceptable.
- Resistors obey Ohm's law and series resistances within one branch add.
- Supported parallel paths are independent branches sharing only the source. Bridge networks or branches sharing non-source components are rejected.
- The simulation is steady-state. Capacitance, inductance, switching transients, wire heating, LED temperature, and battery depletion are outside the model.
- Numeric calculations use SI base units internally. UI may display current in mA.

## Variables, units, and valid MVP ranges

These are release ranges, not merely HTML input limits. A reviewed pack may narrow them. A Class Lab cannot widen them.

| Variable | Symbol/state | Unit | Type | MVP range | Role |
| --- | --- | --- | --- | --- | --- |
| Source voltage | `U` | V | number | 1.5–12.0, step 0.5 | independent |
| Branch resistance | `R_b` | Ω | sum of resistor values | 100–10,000 per branch; each resistor at least 100 | independent |
| LED count in branch | `N_b` | LED | integer | 1–3 | independent |
| Independent branch count | `B` | branch | integer | 1–3 | independent/topology |
| Switch state | `closed` | none | boolean | open or closed | independent |
| Branch current | `I_b` | A internally; mA for display | number or null for invalid zero-resistance branch | derived | dependent |
| Total current | `I_total` | A internally; mA for display | number or null | derived | dependent |
| LED state | `ledState` | enum | `OFF`, `ON`, `OVERLOAD` | derived | dependent |
| Model status | `status` | enum | values below | derived | dependent |
| Maximum accepted LED current | `I_max` | mA | challenge threshold | 5–20, integer step 1; default 20 | Class Lab parameter |
| Minimum lit LEDs | `N_min` | LED | challenge threshold | 1–3, integer step 1; default 1 | Class Lab parameter |

The server engine may retain its broader defensive parser limits (one source at 1–24 V, at most 24 nodes and 48 edges), but a released Foundational Lab pack must reject or prevent states outside the narrower MVP ranges above.

## Input/output relationships

For every active independent branch `b`:

```text
V_LED,b = N_b × 2.0 V

I_b = 0                                      when the circuit/switch is open
I_b = null                                   when R_b = 0 (invalid/overload state)
I_b = max(0, U - V_LED,b) / R_b              otherwise

I_total = Σ I_b                              when every active branch has numeric current
I_total = null                               when any active branch has null current
```

Classification per branch:

- `lit`: branch has at least one LED and `0.001 A ≤ I_b ≤ 0.020 A`.
- `low current`: branch has an LED and `0 ≤ I_b < 0.001 A`.
- `overload`: `R_b = 0`, or an LED branch has `I_b > 0.020 A`.

Model-level state:

| Condition | `status` | `ledState` | Raw model verdict |
| --- | --- | --- | --- |
| No closed source cycle | `OPEN_CIRCUIT` | `OFF` | `not_passed` |
| Cycles exist but all contain an open switch | `SWITCH_OPEN` | `OFF` | `not_passed` |
| Any active branch overloads | `LED_OVERLOAD` | `OVERLOAD` | `partial` |
| Active branches contain no LED | `NO_LED` | `OFF` | `not_passed` |
| No overload and at least one LED is lit | `SAFE` | `ON` | `passed` |
| LED exists but none reaches 1 mA | `LOW_CURRENT` | `OFF` | `not_passed` |

The public attempt pipeline may normalize `not_passed` to `needs_practice`; the raw status and numerical result remain pinned with the attempt.

## User interactions and observable results

Minimum interactions:

- Add/remove one source, resistor, LED, and switch from a reviewed component tray.
- Connect components into a loop; delete and reconnect wires.
- Open/close a switch.
- Change source voltage and resistance within the reviewed ranges.
- Create up to three independent branches.
- Reset to a known initial state.
- Predict, run, and compare the official server result.

Minimum observations:

- Visual distinction among open circuit, closed safe circuit, low current, and overload.
- Per-branch resistance, LED count, current in mA, and state.
- Total current clearly labelled as total, never confused with the per-branch 20 mA limit.
- Source voltage and model limitation notice.
- Validation message for unsupported topology or out-of-range input.
- Attempt verdict, retry without losing the circuit, and existing rule-based hint flow.

## Scientific verification cases

All current comparisons use a tolerance of `1e-6 A` or `0.001 mA`, whichever is larger. Golden cases must run through the same server model used by attempts.

| ID | State | Expected result |
| --- | --- | --- |
| GC-01 | 9 V; one 470 Ω resistor; one LED; incomplete loop | `OPEN_CIRCUIT`, `I_total=0`, `OFF`, `needs_practice` |
| GC-02 | Same components in a closed loop; switch open | `SWITCH_OPEN`, `I_total=0`, `OFF`, `needs_practice` |
| GC-03 | 9 V; 470 Ω; one LED; closed | `I=(9-2)/470=0.014893617 A`, display `14.894 mA`, `SAFE`, `ON`, `passed` |
| GC-04 | 9 V; 330 Ω; one LED; closed | `I=0.021212121 A`, `LED_OVERLOAD`, `OVERLOAD`, `partial` |
| GC-05 | 3 V; 1000 Ω; one LED; closed | `I=0.001 A`, lower lit boundary inclusive, `SAFE`, `ON`, `passed` |
| GC-06 | 3 V; 2000 Ω; one LED; closed | `I=0.0005 A`, `LOW_CURRENT`, `OFF`, `needs_practice` |
| GC-07 | 1.5 V; 330 Ω; one LED; closed | `I=0 A` after clamp, `LOW_CURRENT`, `OFF`, `needs_practice` |
| GC-08 | 9 V; 330 Ω; two series LEDs; closed | `I=(9-4)/330=0.015151515 A`, `SAFE`, `ON`, `passed` |
| GC-09 | Two independent 9 V branches: 470 Ω + one LED, and 1000 Ω + one LED | Branch currents `0.014893617 A` and `0.007 A`; total `0.021893617 A`; no overload because threshold is per branch; `SAFE`, `ON`, `passed` |
| GC-10 | 9 V; zero resistance; one LED; closed | null current, `LED_OVERLOAD`, `OVERLOAD`, `partial`; UI must not display null as a finite value |
| GC-11 | 25 V source | rejected as outside the defensive engine range |
| GC-12 | Shared non-source component/bridge topology | rejected with unsupported-topology error; no attempt result is recorded as scientific output |
| GC-13 | Duplicate component ID or duplicate/self wire | rejected as invalid state |
| GC-14 | A valid state inside engine limits but outside released pack range, e.g. 15 V | rejected by the Foundational Lab range gate before evaluation |

## Model limitations and safety constraints

- This is an educational idealization, not a circuit-design calculator.
- The 2.0 V LED drop is a reviewed fixed approximation for a red LED, not a universal LED characteristic.
- The 1–20 mA “lit” band is a model observation band, not permission to operate a physical LED without its datasheet.
- The model does not simulate reverse bias, component tolerance, temperature, source internal resistance, short-circuit energy, fire, electric shock, or equipment ratings.
- No interaction or copy may instruct a student to connect household mains. Real activities must use school-approved low-voltage equipment and a separate reviewed practical safety procedure.
- KHTN 8 source content warns against contact with household voltage; the virtual Lab must keep that warning visible wherever students can infer real-world action.
- Unsupported or invalid states fail closed with an explanatory error; they are never coerced into a plausible-looking result.

## Reusable Lesson and Outcome bindings

### KHTN 8 source Lessons — candidate bindings

These Lesson records were released in the P3.1 pilot snapshot and have source provenance. Their Lab/Outcome bindings remain proposals, not verified bindings. The first pilot uses one Lesson and one Outcome only after curriculum review; P3.1 does not modify them.

| Lesson ID | Lesson | Lab use |
| --- | --- | --- |
| `pack-structured-c6b80ff49fe27ce2f15878ff2550999a54a9d86f-v1` | B21 — Dòng điện, nguồn điện | Open/closed path, source, conductor context |
| `pack-structured-38f03d31878e58fc0d8a31b8c8aa9fab4af866f7-v1` | B22 — Mạch điện đơn giản | Core construction, switch, symbols, circuit direction context |
| `pack-structured-cf688e5131cdb5af4ea07696b3eb213488f20d44-v1` | B23 — Tác dụng của dòng điện | LED emission and need for a protective resistor |
| `pack-structured-c9544b5c4dadff1e4621579d63aa871dd91ee2ed-v1` | B24 — Cường độ dòng điện và hiệu điện thế | Observe and compare `I` and `U`, units A/mA and V |
| `pack-structured-744d41cbf1bea66b5fae35903b35c3a45b0fced5-v1` | B25 — Thực hành đo cường độ dòng điện và hiệu điện thế | Prediction/measurement-style Class Lab using virtual readings |

### Proposed Outcome references — not approval

| Lesson | Proposal handles | Authority state |
| --- | --- | --- |
| B21 | `KHTN8-B21-O01`, `KHTN8-B21-O02` | `PROPOSED_UNAPPROVED` |
| B22 | `KHTN8-B22-O01`–`KHTN8-B22-O03` | `PROPOSED_UNAPPROVED` |
| B23 | `KHTN8-B23-O01` | `PROPOSED_UNAPPROVED` |
| B24 | `KHTN8-B24-O01`–`KHTN8-B24-O03` | `PROPOSED_UNAPPROVED` |
| B25 | `KHTN8-B25-O01`, `KHTN8-B25-O02` | `PROPOSED_UNAPPROVED` |

The activity/pack may preserve these proposal handles for traceability, but public coverage and release approval must not count them as verified Outcomes.

### Conditional KHTN 9 reuse

The concept aligns with current KHTN 9 records for “Điện trở. Định luật Ohm,” “Đoạn mạch nối tiếp, song song,” and “Năng lượng của dòng điện và công suất điện.” Do not create bindings until KHTN 9 provenance, rights labels, source locators, and review evidence meet the accepted content standard. Power/energy is outside this MVP output contract and would require a reviewed successor model or derived-output extension.

## Required assets, separate from simulation logic

No 3D asset is required for the MVP.

| Asset | Requirement | Scientific logic dependency |
| --- | --- | --- |
| Battery/source symbol | 2D SVG/React element with polarity and voltage label | None; maps to semantic ID `battery` |
| Resistor symbol | 2D symbol with Ω value | None; maps to `resistor` |
| Red LED symbol | 2D symbol with explicit orientation or “pre-oriented” label | None; maps to `led` |
| Switch symbol | Open/closed visual state | None; maps to `switch` |
| Wire/edge style | Visually distinguishes connected path; color must not be the only signal | None |
| Current/status presentation | Text plus icon for off/on/overload and per-branch table | Reads outputs only |
| Localized copy | Vietnamese primary, English supported by current FE conventions | None |

Every asset is replaceable if semantic IDs and accessibility labels remain stable. Visual binding cannot alter equations or verdicts.

## Minimum FE experience

- Replace the unreviewed prototype Lab experience with a reviewed 2D interface. Reuse generic React Flow infrastructure or components only where they meet the new activity contract.
- Load Lab title, objective, model/pack version, limitations, challenge copy, and release availability from the API rather than `lab-info.ts` or the three-ID conditional in `Lab.tsx`.
- Keep the circuit renderer in an allowlisted FE renderer registry keyed by `modelRef`; do not download or execute model code from a manifest.
- Preview may use the pinned `@nexalab/sim` package, but the server result remains authoritative and must replace the preview after submission.
- Display per-branch results, total current, unit conversions, limitations, and invalid-state errors.
- Preserve current retry state, hints, saved experiment behavior, keyboard access, and non-color status cues.
- If the Lab is not release-cleared, students receive the existing not-found/unavailable behavior; teachers may preview according to current authorization.

## Class Lab reuse contract

A teacher may configure:

- one of the reviewed challenge templates;
- `maxCurrentMa` within 5–20 mA;
- `minLitLeds` within 1–3;
- a narrower source-voltage/resistance subset if the implementation exposes those reviewed state-range controls;
- Lesson context, instructions, assignment audience, and due date.

A teacher may not configure:

- LED forward voltage, current formula, topology rules, verdict normalization, or server model reference;
- values outside the approved pack range;
- a public Foundational Lab release state;
- a verified Outcome mapping merely by selecting an Outcome proposal.

The intended Class Lab contract pins the same immutable model/config/pack versions used for evaluation. Current attempt IDs alone do not prove this behavior; version resolution and historical reproduction must be fixed and verified before that claim is made. Free foundational practice remains separate from assignment-scoped evidence unless an explicit Lab assignment applies.
