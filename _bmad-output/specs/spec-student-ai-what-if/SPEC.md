---
id: SPEC-student-ai-what-if
status: review
slice: B3 rules part (what-if@1 FL-21/FL-20; what-if@2 six more Labs) ("Nếu… thì sao?" on the Lab scene); free-text questions stay with SAI-04 (SG-2)
ideas: B3 (student-ai idea list; owner 2026-11-06: "làm B3 bằng luật trước")
companions:
  - ../spec-student-ai-checkpoint-hints/SPEC.md
  - ../spec-student-ai-tutor/student-ai-roadmap.md
  - ../spec-fl-21-food-web/
---

# B3 — "Nếu… thì sao?" on the Lab's Own Model (rules only, FE)

## Why

After finishing a Lab, students want to try other cases ("nếu mất ếch thì sao?"). An LLM could invent species,
links or numbers; the Lab's pinned model already knows the answer. B3 answers preset questions from the model
itself, with a short "why" built from the model's data.

## Decisions (owner 2026-11-06)

- **D1:** rules-only first; typed questions wait for SAI-04 / SG-2.
- **D2:** offered only inside each Lab's existing free explore, which opens after every checkpoint is done, so no
  what-if answers a question still to be predicted. No server call, no storage, not graded (FR-22).

## Capabilities

- **CAP-1 — FL-21 (food-web@1.0.0).** "Nếu mất <loài> thì sao?" for every species the model can remove (not the
  decomposers). The answer comes from `foodWeb({ setup: "remove" })` and `FOOD_WEB_EDGES`: what the species eats and
  may increase, who eats it and may decrease (only-food case named), "no species eats it", the number of broken
  chains, and the model limit (direct effects only, illustrative web). Picking a species on the board selects the
  same question; the board shows the effects.
- **CAP-2 — FL-20 (ecology-tolerance@1.0.0).** Pond at 4, 20, 43 °C (tolerance zone vs tilapia limits, SGK);
  farming fish A, B, C at the demo site (suitable or fails on cold/heat, with the numbers); age samples P1–P3
  (pyramid from the model). The scene follows the question (slider value, sample); changing it by hand clears the
  answer so the two never disagree. Illustrative data is labelled as such.
- **CAP-3 — Versioned rules.** `what-if@1` in `FE-NexaLab/src/features/labs/biology/ecology/what-if.ts`, pure, VI
  and EN. Uses only `@nexalab/sim` exports; no thresholds or data copied into the FE.

## what-if@2 — six more Labs (owner 2026-11-06: "làm tiếp bước 3")

`FE-NexaLab/src/features/labs/runtime/what-if-labs.ts` + `LabWhatIf`. Answers come from each Lab's model in
`@nexalab/sim`; where the model needs an object the Lab pins at run time (FL-05), a labelled example object is used
with the model's own formula.

| Lab | Where | Questions |
| --- | --- | --- |
| FL-25 em-induction | free explore (after every checkpoint) | S pole pushed in / pulled out (direction vs N), open circuit, magnet still inside, turning anticlockwise |
| FL-03 density | after a passed attempt | iron block twice as big, aluminium of the same size, 80 mL instead of 40 mL of water |
| FL-05 buoyancy | after a passed attempt | half submerged, salt water, twice as heavy with the same volume (example object) |
| FL-27 gene | after a passed attempt | UGG→UGA (nonsense), UUC→UUU (silent), GGA→GAA (missense) from the standard code |
| FL-06 lever | after a passed attempt (floating panel) | three weight layouts: balanced, right down, left down, with N·m moments |
| FL-07 thermal | after a passed attempt (floating panel) | heating 25 s and 75 s, compared with 50 s |

- **D3:** Labs without a free explore show what-ifs only after a **passed** attempt: several answers would otherwise
  let a not-passed learner infer a graded answer (for example the N-pole direction from the S-pole one).
- Not offered: FL-01 (the model has only the two graded states), FL-10 (one fixed reaction, no other scenario),
  FL-16 (eye-optics model not in the FE sim package).

## Non-goals

- Typed what-if questions, FL-01, FL-10, FL-16, any LLM call.
- Second-order effects (the model is first-order by design).

## Success signal

FL-21: after the last checkpoint, "Khám phá thêm" → "Nếu mất ếch thì sao?" answers that frogs eat grasshoppers and
leaf caterpillars (may increase), snakes also eat frogs (may decrease, other food left), 2 chains broken; clicking
the eagle on the board answers "Không loài nào trong lưới ăn đại bàng". FL-20: "43 °C" moves the slider to 43,0 °C
and says it is above the 42 °C upper limit. The submission payload is unchanged.
