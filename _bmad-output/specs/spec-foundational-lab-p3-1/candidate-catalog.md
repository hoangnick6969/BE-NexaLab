> Historical discovery ranking: the LED recommendation below is superseded for the first pilot by the bulb activity in lab-definition.md. The master 30-candidate catalog and phase-plan.md govern current portfolio decisions; all mappings remain proposals.

# Ranked Foundational Lab Candidate Catalog

## Scoring method

Each dimension is scored 0–5; higher is better. `K8 evidence` measures coverage by the 47 released Structured Lessons. `Reuse` includes cross-Lesson and conditional cross-grade reuse. `Learning value` measures what interaction reveals beyond static content. `Tractability` rewards a bounded, testable scientific model. `Implementation leverage` rewards verified reuse of current NexaLab engine/UI/contracts. Total is out of 25.

KHTN 9 can increase the reuse score only when the concept and active Outcome statements align. It does not count as a verified Lesson binding in this catalog.

| Rank | Foundational Lab candidate | Scientific concept | Released KHTN 8 Lesson coverage | Conditional KHTN 9 reuse | K8 evidence | Reuse | Learning value | Tractability | Implementation leverage | Total |
| ---: | --- | --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | LED Current-Limiting DC Circuit | Closed/open circuits; current, voltage, resistance; series and independent parallel branches; LED current limiting | B21–B25: current/source, simple circuit, effects of current, current/voltage, electrical measurement | B11–B13: Ohm, series/parallel circuits, electrical energy/power | 5 | 5 | 5 | 4 | 5 | **24** |
| 2 | Reaction Quantity and Limiting Reactant | Conservation and stoichiometric extent; limiting/excess reactant | B2, B5, B6; selected contexts from B8, B10, B11 | Metals/acids and selected organic reactions after provenance review | 5 | 4 | 5 | 4 | 5 | **23** |
| 3 | Density, Pressure, and Buoyancy Bench | `D=m/V`, `p=F/S`, liquid pressure, Archimedes force, float/sink equilibrium | B13–B17 | Materials and Earth-resource contexts after review | 5 | 5 | 5 | 4 | 2 | **21** |
| 4 | Acid–Base Indicator and Neutralisation | Acid/base classification, pH order, qualitative indicator response, neutralisation | B8–B11 | Acetic acid and other chemistry contexts after review | 4 | 4 | 5 | 4 | 4 | **21** |
| 5 | Thermal Transfer and Calorimetry | Internal energy, `Q=mcΔT`, conduction/convection/radiation, thermal expansion | B26–B29 | Energy efficiency contexts after review | 4 | 4 | 5 | 3 | 1 | **17** |
| 6 | Torque and Lever Equilibrium | Moment of force and lever balance | B18–B19 | Work/mechanical energy contexts after review | 3 | 4 | 5 | 4 | 1 | **17** |
| 7 | Reaction Rate Factors | Qualitative/empirical effects of concentration, temperature, surface area, catalyst | B7 plus reaction contexts in B2 and B8 | Combustion and industrial chemistry after review | 3 | 4 | 5 | 3 | 1 | **16** |
| 8 | Ecosystem Population Dynamics | Carrying capacity, food-web dependencies, population change, disturbance and recovery | B41–B46 | Evolution/environment topics after review | 4 | 5 | 4 | 2 | 1 | **16** |
| 9 | Circulation and Gas Exchange | Flow through heart/vessels, ventilation, oxygen/carbon-dioxide exchange under a bounded compartment model | B33–B34; contextual links to B36 and B39 | Human genetics is not a direct reuse; later biology curricula may reuse anatomy | 4 | 4 | 5 | 2 | 1 | **16** |
| 10 | Geometric Optics Bench | Refraction, lenses, focal length and image formation | KHTN 8 B37 only provides eye/sensory context; it does not establish the full optics model | B5–B10: refraction, total internal reflection, prism, lenses, focal length, magnifier | 2 | 5 | 5 | 3 | 1 | **16** |

## Ranking notes

### 1. LED Current-Limiting DC Circuit — recommended MVP

- Five contiguous KHTN 8 Lessons are potential consumers of one model; the pilot binds only the one Lesson/Outcome a named curriculum reviewer confirms. Remaining bindings are proposals.
- The existing engine already computes topology and branch current deterministically. Prototype FE behavior can inform the reviewed interface; prototype-only UI and Lab definitions must be removed from product flows rather than automatically retained.
- The scientific simplification is explicit and testable: fixed red-LED forward drop, ideal source/wires/switch, and resistive branches.
- The main work is scientific review, release packaging, range enforcement, and removing FE metadata hard-coding—not inventing a simulation stack.

### 2. Reaction Quantity and Limiting Reactant

This is the strongest second candidate. `chemistry@1.0.0` already implements six balanced reactions and limiting/excess calculations, but the current FE combines a pH identification activity and stoichiometry in one model. Before release it should be split conceptually into reviewed activity packs so the same engine does not imply that pH classification and stoichiometric extent are one scientific model.

### 3. Density, Pressure, and Buoyancy Bench

This covers the most coherent KHTN 8 physics chapter and provides excellent experimental comparison. It ranks below the first two only because NexaLab has no current model or workspace for it. Its eventual model should be composed of small reviewed modes rather than one opaque “all fluids” simulator.

### Candidates not selected for the first MVP

- The current `eye@1.0.0` model grades anatomical labels; it is not a geometric-optics simulation and therefore gives no implementation leverage to the optics candidate.
- Biology system candidates need careful compartment assumptions and must avoid implying medical diagnosis or precise individual physiology.
- Ecosystem dynamics has high reuse but greater model-choice sensitivity: growth law, carrying capacity, predation, randomness, and timescale all need explicit review.

## Binding authority rule

The Bxx identifiers above refer to source Lesson order in the released KHTN 8 corpus. Current `KHTN8-Bxx-Oyy` values are useful proposal handles, but every one remains `PROPOSED_UNAPPROVED`. No score in this catalog treats those codes as official Outcome approval.
