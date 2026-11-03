# FL-21 blueprint: lưới thức ăn và cân bằng tự nhiên

Status: technical design draft. The outcomes, activity, illustrative data and scientific assumptions are PROPOSED / UNREVIEWED.

Template: FL-20 blueprint (`../spec-fl-20-ecological-tolerance/lab-definition.md`).

## 1. Identity

| Field | Value |
|---|---|
| Discovery ID / slot | FL-21 / provisional slot 15 (KEEP, W4) |
| Lab key | `food-web` |
| Subject / grade / topic | `khtn` / 8 / `KHTN8-L44` (SPEC C4, D-2) |
| Model | `food-web@1.0.0` (new allowlisted model in `packages/sim`) |
| Activity / rubric | `food-web-checkpoints` v1 / `food-web-checkpoints@1.0.0` |
| Renderer key | `food-web` (FE registry) |
| Kit / tier | K8 Cảnh nhẹ + HUD / Tier C, 2D SVG only |
| Archetype | Graph builder (tap species to build a chain) + perturbation explorer |

## 2. Learning intent and source

| Code | Role in release v1 | Statement (OCR cleaned; reviewer confirms) |
|---|---|---|
| `KHTN8-B44-O02` | bound, primary | Nêu được khái niệm chuỗi, lưới thức ăn; sinh vật sản xuất, sinh vật tiêu thụ, sinh vật phân giải, tháp sinh thái. Lấy được ví dụ chuỗi thức ăn, lưới thức ăn trong quần xã. |
| `KHTN8-B44-O03` | bound, primary | Trình bày được khái quát quá trình trao đổi chất và chuyển hoá năng lượng trong hệ sinh thái. |
| `KHTN8-B46-O02` | practised and scored, not bound | Trình bày được các nguyên nhân gây mất cân bằng tự nhiên. |
| `KHTN8-B46-O01`, `B46-O03`, `B43-O02` | supporting, not scored | Cân bằng tự nhiên, biện pháp duy trì, đặc trưng quần xã. |

Proposed lesson binding: `pack-structured-bad6c781d4a7acf408acdf249319f86758dbf66f-v1` (Bài 44).

Virtual objective: the student classifies organisms by role, builds a valid food chain inside a food web and computes the energy that reaches a high trophic level. They predict what happens to a species when its predator or its food disappears, and recognise the human activities that upset natural balance.

## 3. Model `food-web@1.0.0` (deterministic)

### 3.1 Fixed web W1 (ILLUSTRATIVE, SPEC D-4)

The web below is illustrative data, not SGK data.

| Id | Name (vi) | Role |
|---|---|---|
| `co` | Cỏ | PRODUCER |
| `cay-xanh` | Cây xanh | PRODUCER |
| `chau-chau` | Châu chấu | CONSUMER |
| `sau` | Sâu ăn lá | CONSUMER |
| `tho` | Thỏ | CONSUMER |
| `ech` | Ếch | CONSUMER |
| `chim-sau` | Chim sâu | CONSUMER |
| `ran` | Rắn | CONSUMER |
| `cao` | Cáo | CONSUMER |
| `dai-bang` | Đại bàng | CONSUMER |
| `nam-vi-khuan` | Nấm, vi khuẩn | DECOMPOSER |

Feeding edges, written as food → eater:
- `co` → `chau-chau`, `tho`
- `cay-xanh` → `sau`
- `chau-chau` → `ech`, `chim-sau`
- `sau` → `ech`, `chim-sau`
- `ech` → `ran`
- `chim-sau` → `ran`
- `tho` → `cao`, `dai-bang`
- `ran` → `dai-bang`

The decomposer has no feeding edges. The model states that it breaks down the remains and waste of every other organism into inorganic matter.

Full chains, from a producer to a top consumer with no eater (6 in total):
1. co → châu chấu → ếch → rắn → đại bàng
2. co → châu chấu → chim sâu → rắn → đại bàng
3. co → thỏ → cáo
4. co → thỏ → đại bàng
5. cây xanh → sâu → ếch → rắn → đại bàng
6. cây xanh → sâu → chim sâu → rắn → đại bàng

Disturbance causes (from SGK p0192-b0006; the mapping to species is illustrative):

| Cause id | Label | Disturbs | Species removed in W1 |
|---|---|---|---|
| `pha-rung` | Phá rừng | yes | `cay-xanh` |
| `san-bat` | Săn bắt động vật hoang dã | yes | `ran` |
| `khai-thac` | Khai thác tài nguyên quá mức | yes | `tho` |
| `o-nhiem` | Xả chất thải gây ô nhiễm | yes | `ech` |
| `trong-rung` | Trồng rừng | no (protective, B46-O03) | — |
| `bao-ton` | Lập khu bảo tồn | no (protective) | — |

Energy rule (ILLUSTRATIVE convention): the producer captures 10 000 kJ and each transfer keeps 1/10. The rest is used by the organism and returned to the environment as heat.

### 3.2 State schema v1 (strict)

```ts
type FoodWebState =
  | { setup: "roles"; webId: "W1" }
  | { setup: "chain"; webId: "W1"; nodes: SpeciesId[] }              // 2..6 distinct ids, learner-built
  | { setup: "energy"; webId: "W1"; chain: ["co", "chau-chau", "ech", "ran"] }
  | { setup: "remove"; webId: "W1"; speciesId: SpeciesId }
  | { setup: "causes"; webId: "W1" };
```

Rejected inputs (no coercion):
- unknown ids;
- duplicate nodes;
- fewer than 2 or more than 6 nodes;
- any `energy` chain other than the fixed one;
- removing the decomposer;
- extra keys.

### 3.3 Observations and rules

1. **roles**: `{ roles: Record<SpeciesId, Role> }` from the table.
2. **chain**:
   - `valid` is true iff every consecutive pair is a feeding edge.
   - `brokenAt` is the index of the first missing link, or null.
   - `startsWithProducer` reports whether the first node is a producer.
   - `length` is the number of nodes.
   - `levels` is 1 for the first node and +1 per link; the producer is level 1.
3. **energy**: for the fixed chain, `levelsKJ = [10000, 1000, 100, 10]` and `heatKJ = [9000, 900, 90]`. Values are computed as integer fractions, never floats.
4. **remove X**, first-order effects only (SPEC D-5):
   - every food of X (an organism X eats) is `INCREASE` (released from predation);
   - every eater of X is `DECREASE`, with `onlyFood: true` when X was its only food;
   - every other species is `NO_DIRECT_EFFECT`.
   - Chains through X are listed as `brokenChains`.
5. **causes**: for each cause, `{ disturbs, removes }` from the table.

### 3.4 Assumptions and limits (learner-facing summary required)

- The food web, species and energy figures are illustrative. Real ecosystems have many more species.
- Only direct effects are shown. Real knock-on effects spread further and change over time.
- The 10 % transfer is a teaching convention, not a measured value.
- Removing a species models a local, total loss. Partial decline is not modelled.

## 4. Activity `food-web-checkpoints` v1

| # | Id | Learner action | Required state | Answer | Correct |
|---|---|---|---|---|---|
| 1 | `ROLES` | Sort Cỏ, Ếch, Nấm và vi khuẩn into producer / consumer / decomposer, then check | roles, W1 | `{ co, ech, "nam-vi-khuan" }` → role | all three equal the model roles |
| 2 | `CHAIN` | Tap species in order to build one food chain, then check | chain, W1, learner nodes | `"CHAIN"` (the state is the answer) | `valid && startsWithProducer && length ≥ 4` |
| 3 | `ENERGY` | Compute the energy reaching Rắn in Cỏ → Châu chấu → Ếch → Rắn | energy, W1, fixed chain | `{ value: decimal }` in kJ | value equals the last element of `levelsKJ` (10) |
| 4 | `HUNT` | Rắn bị săn bắt hết. Predict what happens to Ếch | remove `ran` | `INCREASE` / `DECREASE` / `NO_DIRECT_EFFECT` | effect on `ech` (`INCREASE`) |
| 5 | `DEFOREST` | Cây xanh bị chặt phá. Predict what happens to Sâu ăn lá | remove `cay-xanh` | same choices | effect on `sau` (`DECREASE`) |
| 6 | `CAUSES` | Select every human activity that upsets natural balance | causes, W1 | set of cause ids | equals the set with `disturbs = true` |
| 7 | explanation | Choose the reason | — | A / B / C | A |

Only `CHAIN` accepts a learner-built state. Every other checkpoint must equal its required state, the same rule as FL-20.

Explanation question: "Vì sao săn bắt hết rắn có thể làm mất cân bằng tự nhiên?"
- A — Rắn là một mắt xích trong lưới thức ăn; mất rắn thì con mồi của nó không còn bị khống chế và kẻ thù của nó mất nguồn thức ăn.
- B — Vì rắn là sinh vật sản xuất của hệ sinh thái.
- C — Vì không còn rắn thì cỏ và cây xanh không mọc được.

Flow: each answer is recorded before the observation is shown. The chain is locked once it has been checked. Free explore unlocks after the explanation and is not scored. It lets the learner remove any species and see its effects, count the chains each species belongs to ("mắt xích chung"), and view the energy pyramid.

Evidence JSON v1:

```json
{
  "checkpoints": [
    {"id": "ROLES", "state": {"setup": "roles", "webId": "W1"}, "prediction": {"co": "PRODUCER", "ech": "CONSUMER", "nam-vi-khuan": "DECOMPOSER"}},
    {"id": "CHAIN", "state": {"setup": "chain", "webId": "W1", "nodes": ["co", "chau-chau", "ech", "ran"]}, "prediction": "CHAIN"},
    {"id": "ENERGY", "state": {"setup": "energy", "webId": "W1", "chain": ["co", "chau-chau", "ech", "ran"]}, "prediction": {"value": "10"}},
    {"id": "HUNT", "state": {"setup": "remove", "webId": "W1", "speciesId": "ran"}, "prediction": "INCREASE"},
    {"id": "DEFOREST", "state": {"setup": "remove", "webId": "W1", "speciesId": "cay-xanh"}, "prediction": "DECREASE"},
    {"id": "CAUSES", "state": {"setup": "causes", "webId": "W1"}, "prediction": ["khai-thac", "o-nhiem", "pha-rung", "san-bat"]}
  ],
  "explanation": "A"
}
```

`CAUSES.prediction` is a sorted, duplicate-free list of 0 to 6 known cause ids. `ENERGY.value` uses the same decimal pattern as FL-20 (a comma is accepted).

## 5. Rubric `food-web-checkpoints@1.0.0`

- The score is the number of criteria met out of 7. PASS is 7/7 (SPEC D-6).
- Each unmet criterion is reported as `prediction:<ID>` or `explanation`.
- A state that fails validation creates no attempt.

## 6. Golden and invalid cases

| ID | Input | Expected |
|---|---|---|
| FW-01 | roles | co, cay-xanh PRODUCER; nam-vi-khuan DECOMPOSER; the other 8 CONSUMER |
| FW-02 | chain co, chau-chau, ech, ran, dai-bang | valid, starts with a producer, length 5, levels 1..5 |
| FW-03 | chain co, tho, cao | valid, length 3 (fails the CHAIN criterion only by length) |
| FW-04 | chain co, ech, ran | invalid, brokenAt 1 |
| FW-05 | chain chau-chau, ech, ran, dai-bang | valid links, startsWithProducer false |
| FW-06 | energy | levels 10000/1000/100/10, heat 9000/900/90 |
| FW-07 | remove ran | ech, chim-sau INCREASE; dai-bang DECREASE (onlyFood false); 4 broken chains |
| FW-08 | remove cay-xanh | sau DECREASE (onlyFood true); 2 broken chains |
| FW-09 | remove tho | co INCREASE; cao DECREASE (onlyFood true); dai-bang DECREASE (onlyFood false) |
| FW-10 | causes | exactly pha-rung, san-bat, khai-thac, o-nhiem disturb |
| FW-11 | the chain count per species | rắn 4, đại bàng 5, cáo 1, châu chấu 2 |
| FW-X1 | unknown id, duplicate node, 1 or 7 nodes | rejected |
| FW-X2 | remove nam-vi-khuan; energy with another chain | rejected |
| FW-X3 | extra key, other webId | rejected |

Activity tests cover:
- 7/7 when every answer is correct;
- each single wrong answer, reported as its own criterion;
- a 3-node chain, a chain broken in the middle, and a chain that does not start with a producer;
- "10,0" accepted as an energy value;
- a `CAUSES` answer with an extra or a missing cause;
- a state that differs from the required one: rejected, no attempt;
- replaying a stored attempt.

## 7. Modality, accessibility and assets

- 2D SVG food web: species nodes with simple drawn icons and labels, and arrows that point from food to eater (the SGK convention).
- Each species node is a DOM `button`. Building a chain works with keyboard and touch. The current chain is shown as text ("Cỏ → Châu chấu → …"), with an undo and a clear button.
- Removed species appear faded with a text label. Effects are shown as text plus an up or down icon, never by colour alone. Updates are announced through `aria-live`.
- Assets are hand-drawn SVG only: no photos and no external icons beyond `lucide-react`.

## 8. Review roles (not attestations)

- Curriculum reviewer: outcome text and OCR fixes; whether the illustrative web suits grade 8.
- Science reviewer: feeding edges, first-order effect rules, the 10 % convention and its wording.
- Owner: D-1, D-2 and D-6.
