# FL-20 blueprint: nhân tố và giới hạn sinh thái, đặc trưng quần thể

Status: technical design draft. Outcome, activity, illustrative data and scientific assumptions are PROPOSED / UNREVIEWED.

Template: FL-25 blueprint (`../spec-fl-25-em-induction/lab-definition.md`) and `../spec-lab-pipeline/foundational-lab-track.md` §Activity blueprint template.

## 1. Identity

| Field | Value |
|---|---|
| Discovery ID / slot | FL-20 / provisional slot 14 (KEEP, W4) |
| Lab key | `ecology-tolerance` |
| Subject / grade | `biology` (insert if missing, same pattern as FL-25 `physics`) / grade 8, chapter `KHTN8-CH08` |
| Model | `ecology-tolerance@1.0.0` (new allowlisted model in `packages/sim`) |
| Activity / rubric | `ecology-tolerance-checkpoints` v1 / `ecology-tolerance-checkpoints@1.0.0` |
| Renderer key | `ecology-tolerance` (FE allowlist) |
| Kit / tier | K8 Cảnh nhẹ + HUD / Tier C; 2D SVG only, no WebGL |
| Archetype | Parameter explorer (factor slider) + data reading (graph, table, pyramid) |

## 2. Learning intent and source

Outcomes:

| Code | Role | Statement (cleaned of OCR errors; reviewer confirms, SPEC D-3) |
|---|---|---|
| `KHTN8-B41-O03` | primary | Trình bày được khái niệm và lấy được ví dụ về giới hạn sinh thái. |
| `KHTN8-B42-O02` | primary | Nêu được các đặc trưng cơ bản của quần thể sinh vật và lấy được ví dụ minh hoạ. |
| `KHTN8-B41-O02` | supporting, not scored | Nêu được khái niệm nhân tố sinh thái; phân biệt nhân tố vô sinh và hữu sinh. |

Proposed Lesson bindings (SPEC D-2):
- `pack-structured-03b2dcaf5fd4851dbd229b2d01c7d14ac8c1544c-v1` (Bài 41);
- `pack-structured-af15f30afc3eb10589e674f9e38bc5aee174860b-v1` (Bài 42).

Virtual objective: the student changes one environmental factor (water temperature) and predicts whether a species can persist. They read the tolerance limits from a sweep and use them to choose a species suited to a site. They then compute a population density from SGK data and classify an age pyramid. This is evidence of reasoning about a qualitative ecological model, not of field-work competence.

## 3. Model `ecology-tolerance@1.0.0` (deterministic)

All temperatures are integers in tenths of a degree Celsius (`deciC`), so 5,6 °C is `56`. This keeps comparisons exact.

### 3.1 Fixed data inside the model version

Clients never send limits or counts. They send only identifiers, and the model looks up the data below.

| Id | Kind | Data | Source |
|---|---|---|---|
| `ca-ro-phi` | species | temperature limits 56 – 420 | SGK KHTN 8, `sgk-khtn8-nxbgd-2026-p0174-b0009` |
| `fish-a` | hypothetical species | 100 – 400 | ILLUSTRATIVE (SPEC D-4) |
| `fish-b` | hypothetical species | 20 – 380 | ILLUSTRATIVE |
| `fish-c` | hypothetical species | 50 – 300 | ILLUSTRATIVE |
| `site-demo` | site | water temperature through the year 80 – 360 | ILLUSTRATIVE |
| `lim-xanh` | population | 11 250 cây / 15 ha | SGK Bảng 42.1, `p0177-b0008..9` |
| `bap-cai` | population | 3 000 cây / 750 m² | SGK Bảng 42.1 |
| `ca-chep` | population | 120 000 con / 60 000 m³ | SGK Bảng 42.1 |
| `P1` | age sample | trước sinh sản 50, sinh sản 35, sau sinh sản 15 | ILLUSTRATIVE |
| `P2` | age sample | 38 / 40 / 22 | ILLUSTRATIVE |
| `P3` | age sample | 20 / 45 / 35 | ILLUSTRATIVE |

`ca-ro-phi` has no optimum range in v1, because the SGK text does not state one (SPEC D-4). The graph draws only the two limits.

### 3.2 State schema v1 (strict)

```ts
type EcologyToleranceState =
  | { setup: "tolerance"; speciesId: "ca-ro-phi"; factor: "TEMPERATURE"; valueDeciC: number } // integer 0..500
  | { setup: "tolerance-sweep"; speciesId: "ca-ro-phi"; factor: "TEMPERATURE" }
  | { setup: "import-comparison"; siteId: "site-demo"; factor: "TEMPERATURE" }
  | { setup: "density"; populationId: "lim-xanh" | "bap-cai" | "ca-chep" }
  | { setup: "age-structure"; sampleId: "P1" | "P2" | "P3" };
```

Validation rejects input and never coerces it:
- `valueDeciC` must be an integer in [0, 500]. A float, a string or a value out of range is an error.
- Unknown ids, unknown setups or extra keys are errors.

### 3.3 Output (observations)

```ts
type EcologyToleranceObservation =
  | { version: "1.0.0"; setup: "tolerance";
      zone: "BELOW_MIN" | "WITHIN" | "ABOVE_MAX"; canPersist: boolean;
      limits: { minDeciC: number; maxDeciC: number } }
  | { version: "1.0.0"; setup: "tolerance-sweep";
      limits: { minDeciC: number; maxDeciC: number }; widthDeciC: number }
  | { version: "1.0.0"; setup: "import-comparison";
      site: { minDeciC: number; maxDeciC: number };
      candidates: Array<{ speciesId: "fish-a" | "fish-b" | "fish-c";
                          limits: { minDeciC: number; maxDeciC: number };
                          suitable: boolean; failsOn: "COLD" | "HEAT" | "BOTH" | null }> }
  | { version: "1.0.0"; setup: "density";
      count: number; amount: number; unit: "ha" | "m2" | "m3";
      density: { num: number; den: number } }       // reduced fraction, den ≥ 1
  | { version: "1.0.0"; setup: "age-structure";
      counts: { pre: number; reproductive: number; post: number };
      ratio: { num: number; den: number };            // pre / reproductive, reduced
      pyramid: "GROWING" | "STABLE" | "DECLINING" };
```

### 3.4 Rules

1. **Tolerance.** `zone` is BELOW_MIN if `value < min`, ABOVE_MAX if `value > max`, and WITHIN otherwise. Both limits count as inside (SPEC D-7). `canPersist` is true only when `zone = WITHIN`.
2. **Sweep.** The model returns the species limits; `widthDeciC = max − min` (for cá rô phi, 364, which is 36,4 °C).
3. **Import comparison.** A species is `suitable` when `limits.min ≤ site.min` and `site.max ≤ limits.max`. `failsOn` is COLD when `site.min < limits.min`, HEAT when `site.max > limits.max`, BOTH when both hold, and null when the species is suitable. With the v1 data: fish-a fails on COLD, fish-b is suitable, fish-c fails on HEAT.
4. **Density.** `density = count / amount`, as an exact reduced fraction. With the v1 data: lim xanh 750/1 cây/ha, bắp cải 4/1 cây/m², cá chép 2/1 con/m³.
5. **Age pyramid.** `r = pre / reproductive`. The pyramid is GROWING if r ≥ 6/5, DECLINING if r ≤ 4/5, and STABLE otherwise. The comparison uses exact fractions (SPEC D-5). With the v1 data: P1 is 10/7 (GROWING), P2 is 19/20 (STABLE), P3 is 4/9 (DECLINING).

### 3.5 Assumptions and limits (a learner-facing summary is required)

- Only one factor (temperature) changes at a time; the other factors are assumed to be favourable. The interaction between factors is not modelled.
- "Không tồn tại được" (cannot persist) is a statement about the population over time. The scene never shows animals dying. A fish outside its limits is drawn as a faded outline with a text label.
- The curve on the graph is an **illustrative** shape for "mức độ sinh trưởng". Its y-axis has no numbers and no optimum is marked in v1.
- Fish A/B/C, the site range and the age samples are illustrative data, labelled as such in the UI. They are not SGK data.
- The age-pyramid thresholds are a model convention for clear-cut samples, not a biological law.
- The activity is virtual. It gives no instruction to handle live animals.

## 4. Activity `ecology-tolerance-checkpoints` v1

Six ordered checkpoints plus an explanation. Wherever there is a prediction, it is recorded BEFORE the observation is shown, the same flow as FL-25.

Order inside a checkpoint (as built): the answer comes before the observation, except `LIMITS`, where the learner sweeps first and then reads the range. The sweep counts as observed once the learner has crossed both edges (a value below 5,6 °C and one above 42 °C), or after "Quét tự động". The UI therefore has 13 steps (6 × 2 + explanation).

| # | Checkpoint id | Learner action | Required state | Answer choices | Correct (from model) |
|---|---|---|---|---|---|
| 1 | `T_INSIDE` | Set the pond water to 30,0 °C | tolerance, ca-ro-phi, 300 | `PERSISTS` / `NOT_PERSIST` | `PERSISTS` |
| 2 | `T_ABOVE` | Set the pond water to 44,0 °C | tolerance, ca-ro-phi, 440 | `PERSISTS` / `NOT_PERSIST` | `NOT_PERSIST` |
| 3 | `LIMITS` | Sweep the slider (free exploration), then read the range | tolerance-sweep, ca-ro-phi | `L1` 5,6–42 °C / `L2` 0–42 °C / `L3` 5,6–30 °C / `L4` 30–44 °C | the option equal to the observed limits (`L1`) |
| 4 | `IMPORT` | Compare the three hypothetical fish with the site's yearly water range | import-comparison, site-demo | `FISH_A` / `FISH_B` / `FISH_C` / `NONE` | the single suitable species (`FISH_B`) |
| 5 | `DENSITY` | Compute the density of the cabbage population (Bảng 42.1) | density, bap-cai | `{ value: decimal string, unit: PER_HA / PER_M2 / PER_M3 }` | `4`, `PER_M2` |
| 6 | `AGE` | Classify the age pyramid of sample P3 | age-structure, P3 | `GROWING` / `STABLE` / `DECLINING` | `DECLINING` |
| 7 | explanation | Choose the reason | — | A / B / C | A |

Option ranges for `LIMITS` are fixed in the activity version (L1 = 56–420, L2 = 0–420, L3 = 56–300, L4 = 300–440).

Explanation question: "Vì sao không thể nuôi cá rô phi ngoài trời quanh năm ở nơi mùa đông nước xuống dưới 5,6 °C?"
- A — Nhiệt độ đó nằm ngoài giới hạn sinh thái về nhiệt độ của cá rô phi.
- B — Vì mùa đông cá rô phi không có đủ thức ăn.
- C — Vì không loài cá nào sống được ở nước dưới 10 °C.

Unscored exploration, not part of the evidence: sort pictured factors (ánh sáng, nhiệt độ, nước, cây cỏ, con người, sâu bọ) into vô sinh / hữu sinh. This supports `B41-O02`.

Evidence JSON v1:

```json
{
  "checkpoints": [
    {"id": "T_INSIDE", "state": {"setup":"tolerance","speciesId":"ca-ro-phi","factor":"TEMPERATURE","valueDeciC":300}, "prediction": "PERSISTS"},
    {"id": "T_ABOVE",  "state": {"setup":"tolerance","speciesId":"ca-ro-phi","factor":"TEMPERATURE","valueDeciC":440}, "prediction": "NOT_PERSIST"},
    {"id": "LIMITS",   "state": {"setup":"tolerance-sweep","speciesId":"ca-ro-phi","factor":"TEMPERATURE"}, "prediction": "L1"},
    {"id": "IMPORT",   "state": {"setup":"import-comparison","siteId":"site-demo","factor":"TEMPERATURE"}, "prediction": "FISH_B"},
    {"id": "DENSITY",  "state": {"setup":"density","populationId":"bap-cai"}, "prediction": {"value":"4","unit":"PER_M2"}},
    {"id": "AGE",      "state": {"setup":"age-structure","sampleId":"P3"}, "prediction": "DECLINING"}
  ],
  "explanation": "A"
}
```

Server validation:
- Exactly six checkpoints, in this order.
- Each state passes the model schema AND equals the required state of its checkpoint. Any difference is a validation error and creates no attempt.
- `DENSITY.value` matches `^\d{1,9}([.,]\d{1,3})?$`; a comma is accepted as the decimal separator.
- Evidence size limit is 20 000 chars, as for Circuit.

## 5. Rubric `ecology-tolerance-checkpoints@1.0.0`

The server simulates every checkpoint on the pinned model, then grades each criterion:
- `T_INSIDE`, `T_ABOVE`: correct iff the prediction equals `canPersist ? PERSISTS : NOT_PERSIST`.
- `LIMITS`: correct iff the chosen option's range equals `limits` exactly.
- `IMPORT`: correct iff the choice is the species with `suitable = true` when exactly one is suitable, or `NONE` when none is. If the data has more than one suitable species, the activity version is invalid and the golden test fails.
- `DENSITY`: correct iff the value parses to a decimal exactly equal to `density.num / density.den` and the unit matches the population's unit. The comparison is exact in fractions; floats are never used.
- `AGE`: correct iff the choice equals `pyramid`.
- Explanation: correct iff A.

Score = number of criteria met out of 7. PASS = 7/7 (SPEC D-6). Otherwise the result is NEEDS_PRACTICE, with one feedback line per unmet criterion: `prediction:T_INSIDE`, `prediction:T_ABOVE`, `prediction:LIMITS`, `prediction:IMPORT`, `prediction:DENSITY`, `prediction:AGE`, `explanation`. (Changed during build, 2026-10-31: every criterion uses the shared `prediction:<id>` form of the checkpoint registry, the same as FL-25.)

## 6. Golden and invalid cases

Model unit tests (`packages/sim`):

| ID | State | Expected |
|---|---|---|
| EC-01 | tolerance 300 | WITHIN, canPersist true |
| EC-02 | tolerance 440 | ABOVE_MAX, false |
| EC-03 | tolerance 40 | BELOW_MIN, false |
| EC-04 | tolerance 56 | WITHIN (lower limit inclusive) |
| EC-05 | tolerance 420 | WITHIN (upper limit inclusive) |
| EC-06 | tolerance 55 / 421 | BELOW_MIN / ABOVE_MAX |
| EC-07 | tolerance-sweep | limits 56–420, width 364 |
| EC-08 | import-comparison | A COLD, B suitable, C HEAT; exactly one suitable |
| EC-09 | density lim-xanh / bap-cai / ca-chep | 750/1 ha, 4/1 m2, 2/1 m3 |
| EC-10 | age P1 / P2 / P3 | GROWING 10/7, STABLE 19/20, DECLINING 4/9 |
| EC-11 | age thresholds with synthetic counts 6/5 and 4/5 | GROWING, DECLINING (boundary rule) |
| EC-X1 | valueDeciC 30.5, "300", -1, 501 | rejected |
| EC-X2 | unknown speciesId / populationId / sampleId / setup | rejected |
| EC-X3 | extra key (for example a client-supplied `limits`) | rejected |

Activity tests (`lab-run`):
- all correct + A → PASS 7/7;
- each single wrong answer → NEEDS_PRACTICE with that criterion only;
- `DENSITY` "4,0" and "4.000" → correct; "4.01", unit `PER_HA`, and "abc" → wrong or validation error as specified;
- a checkpoint missing, out of order or duplicated → validation error, no attempt;
- a state that differs from the required one (for example `T_ABOVE` sent with 430) → validation error, no attempt;
- replaying the stored attempt reproduces identical observations.

## 7. Modality, accessibility and assets

- 2D only: SVG pond scene + tolerance graph; SVG population plot + age-pyramid HUD. No WebGL, so no context-loss fallback is needed.
- The temperature slider is a native `<input type="range">` with ±0,1 °C keyboard steps and ±1 °C on PageUp/PageDown. Its value is shown as text ("30,0 °C").
- Observations are given as text plus an icon (for example "Cá rô phi không tồn tại được ở 44,0 °C: cao hơn giới hạn trên 42 °C"), never by colour alone. Status is announced through `aria-live`, there is a full keyboard path, and `prefers-reduced-motion` is honoured live.
- The graph has an accessible table alternative (min, max, current value).
- Assets: hand-written SVG only. There are no photos, no GLB, and no external fonts beyond the existing app fonts. Fish and plant drawings are simple procedural shapes, so there is no licensing question.

## 8. Review roles (not attestations)

- Curriculum reviewer: outcome text, OCR fixes, pyramid names from Hình 42.3, optional SGK data for fish A/B/C and the optimum (SPEC D-3, D-4, D-5).
- Science/model reviewer: rules 1–5, inclusive limits, thresholds, limits copy.
- Owner: the exception in D-1, bindings (D-2), the rubric (D-6).

No reviewer decision is implied by this document.
