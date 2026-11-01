# Lab Catalog from KHTN 8–9 Outcomes (DEFINE)

**Status:** proposal for curriculum/science review. It is not an approved catalog.
- Every outcome cited below is `PROPOSED_UNAPPROVED`.
- No Lab here is approved, scheduled or released.
- This document replaces neither the P3.1 candidate catalog nor its LED decision. It extends that catalog to the whole KHTN 8–9 register, following `pipeline.md` stages 1–3.

## Portfolio v1 — provisional disposition

This table is the current triage view over the 30 discovery IDs below. It proposes 20 candidate slots for prioritisation, **not 20 approved or fixed Lab identities**. SHARE keeps identities separate unless a later explicitly reviewed MERGE says otherwise. SPLIT may increase the number of identities. No candidate has an approved Outcome or scientific model by virtue of this table. The legacy scores, waves, P/S/N and coverage numbers below are historical discovery estimates, not verified educational coverage, staffing commitments or release evidence. P3.2 and the first Circuit pilot do not wait for this portfolio to be complete.

The P3.5 Chemistry pH implementation is a `TECHNICAL_FIXTURE_ONLY` used for runtime compatibility regression checks. It does not add a portfolio identity or count toward any candidate total or curriculum coverage. The Chemistry proposals below were independently derived as unapproved discovery candidates; they do not inherit textbook mapping, review, model validation or release evidence from the fixture.

Decision meanings: KEEP = distinct proposed identity; SHARE = retain identity but propose reuse at the named layer; MERGE = combine identities only with demonstrated shared learning scope, model and workspace plus explicit mapping; SPLIT = boundaries too broad, produce separate scoped proposals; DEFER = insufficient evidence, tractability, rights or reviewer capacity; NO LAB = current candidate is better represented as another learning resource (reviewable decision, not deletion). Sharing only equipment, an engine library or a renderer never implies identity merging.

| Discovery ID | Decision | Proposed v1 slot | Reason and exact reuse boundary |
|---|---|---:|---|
| FL-01 | SHARE | 1 | Circuit family: K8 bulb first; K9 and LED are separate unapproved activities/models or versions as needed; share host and topology concepts, not automatic bindings |
| FL-02 | DEFER | — | Qualitative charging model and instructional gain need stronger evidence |
| FL-03 | SHARE | 2 | Density Lab: share fluid workspace/widgets with FL-04/05; retain distinct model/activity/identity |
| FL-04 | SHARE | 3 | Pressure Lab: share fluid workspace/widgets; preserve distinct model/activity and inspect B15 source gap |
| FL-05 | SHARE | 4 | Buoyancy Lab: share fluid workspace/widgets; may consume reviewed density data, distinct model/activity |
| FL-06 | KEEP | 5 | Lever equilibrium has a bounded interactive objective |
| FL-07 | SHARE | 6 | Calorimetry: share graph/measurement widgets with FL-08, not scientific model or identity |
| FL-08 | SHARE | 7 | Heat transfer: shared graph/measurement widgets with FL-07; review distinct modes |
| FL-09 | DEFER | — | Expansion has narrower coverage; review value after early thermal Labs |
| FL-10 | SPLIT | 8 | Scope mol/stoichiometry versus equation/yield activities before identity/model count is fixed; chemistry code is only reuse evidence |
| FL-11 | KEEP | 9 | Solution/concentration work has distinct experimental activity |
| FL-12 | KEEP | 10 | Reaction-rate model requires reviewed assumptions and fixtures |
| FL-13 | SHARE | 11 | Indicator/acid-base shares only reviewed bench components with other chemistry; separate model/rubric from FL-10 |
| FL-14 | SPLIT | 12 | Broad reaction family needs narrower modes and curated reaction data before model/identity decisions |
| FL-15 | KEEP | 13 | Safety scenarios need a separate safety review and evidence rubric |
| FL-16 | NO LAB | — | Current eye/anatomy labelling is provisionally a Lesson resource; reconsider a Lab only if interaction yields distinct learning evidence |
| FL-17 | DEFER | — | Circulation/respiration model tractability and health framing unresolved |
| FL-18 | DEFER | — | Nutrition table rights, child-facing framing and reviewer need unresolved |
| FL-19 | DEFER | — | Physiological feedback assumptions and tractability unresolved |
| FL-20 | KEEP | 14 | Ecology/tolerance activity proposed; review model assumptions |
| FL-21 | KEEP | 15 | Food web has distinct dependency interactions; share diagrams with FL-20 only if useful |
| FL-22 | DEFER | — | Climate model tractability and non-misleading abstraction need review |
| FL-23 | SPLIT | 16 | Optics combines refraction, prism and lenses; define bounded modes/models before final identity count; K9 provenance conditional |
| FL-24 | KEEP | 17 | Mechanical energy candidate is bounded; K9 provenance conditional |
| FL-25 | KEEP | 18 | Electromagnetic induction candidate; K9 provenance and qualitative model require review |
| FL-26 | KEEP | 19 | Genetics cross activity: review independent/linkage scope and K9 provenance |
| FL-27 | KEEP | 20 | Gene-to-protein candidate: review model data and K9 provenance |
| FL-28 | DEFER | — | Cell division learning interaction and evidence require review |
| FL-29 | DEFER | — | Selection dynamics model tractability and assumptions unresolved |
| FL-30 | DEFER | — | Molecular/polymer scope, 2D/3D value and reviewed valence data need definition |

No MERGE is asserted yet: the current source does not prove a shared model, workspace and learning scope for a safe identity merge. The decision remains available after review. The 20-slot view includes conditional KHTN9 exploration only; it never authorizes binding or release. Reviewers may change any disposition, keep fewer or more, or reorder work. Preserve lineage from each original FL ID to any later split/merge and give each eventual model and activity an independent version.

## Historical discovery data

The remainder is retained for provenance. Its W1 LED pilot and phase references are superseded by the bulb blueprint and canonical lab-pipeline-phase-plan.md. Its outcome statements are truncated, may contain OCR errors and do not themselves prove virtual assessment of real practical skills.
## 1. Input actually used

Read-only query on 2026-10-28 against the database configured in BE `.env` (development):

| Item | Value | Label |
|---|---|---|
| `CurriculumOutcome` non-synthetic, grade 8 | 157 rows, codes `KHTN8-Bxx-Oyy`, all `sourceEvidence.originType = textbook_derived_internal` | verified (DB) |
| `CurriculumOutcome` non-synthetic, grade 9 | 135 rows. 102 have `sourceEvidence` (`textbook_derived_internal`). 33 have **no** `sourceEvidence` and duplicate a statement under a longer slug (e.g. `ethylic-alcohol-va-acetic-acid/1` vs `ethylic-alcohol-va-acetic/1`) | verified (DB) |
| Shared released Lessons | KHTN 8: 47 published/released. KHTN 9: 51 published/released (+2 archived/retired). **No Lesson has `labId`** | verified (DB) |
| Labs | `circuit`, `chemistry`, `eye`: `CLASS_PRIVATE`, `releaseCleared=false`, `topicCode=null` | verified (DB) |
| Version tables | `SimulationConfigVersion`, `PracticalActivityVersion`, `SimulationPackVersion`, `FoundationalCourseVersion`: 0 rows each | verified (DB) |

This confirms the P3.1 snapshot claims that `brownfield.md` E-20 had marked unverified, at least for this database. The official curriculum authority document is still not identified (open decision C-1). The register is therefore SGK-derived, and none of its rows can become `ACTIVE` without a curriculum receipt.

### Register defects found (input for P3.3)

1. **OCR errors in statements.** Examples:
   - `KHTN8-B02-O03` "phần ứng" for "phản ứng";
   - `B13-O01`, `B18-O02` "Nếu được" for "Nêu được";
   - `B19-O01` "đơn bảy" for "đòn bẩy";
   - `B42-O01` "quản thể" for "quần thể";
   - `B25-O02` "vốn kế" for "vôn kế".

   They must be corrected against the source before any review.
2. **Bullet split.** `KHTN8-B07-O03` is the heading "Tiến hành được thí nghiệm và quan sát thực tiễn:" and `O04`–`O06` are its bullets. Merge them or re-parent them.
3. **B15 (Áp suất trên một bề mặt)** has only unit and discussion outcomes. No row states the pressure definition `p = F/S`. This is a likely extraction gap (inference), so check SGK p. 64.
4. **KHTN 9 duplicates.** 33 rows without evidence duplicate canonical rows. Archive them or merge them before mapping. This catalog uses only the 102 canonical rows.
5. **KHTN 9 provenance** is still `CONDITIONAL` per P3.1. KHTN 9 Labs below are reuse/expansion candidates, not release bindings.

## 2. Method

For each outcome (157 + 102):
1. Classify its evidence need.
   - **P** (primary): the Lab can produce the outcome's evidence: the student acts, observes, measures or predicts and the server evaluates it.
   - **S** (supporting): the Lab helps, but the outcome also needs explanation, recall or real practice.
   - **N** (no Foundational Lab), with a reason:

   | Code | Reason |
   |---|---|
   | R | concept/recall |
   | H | health/behaviour |
   | D | project/survey/discussion |
   | A | real-world application/reading |
   | X | a real practical or video fits better |
   | K | sensitive/child-safety topic |

2. Group P/S outcomes by **one bounded scientific model** (rule from `SPEC.md`: Lab = model, not Lesson).
3. Score each candidate on the historical discovery rubric (interaction I, tractability T, coverage C, reuse R, leverage L, modality M; 2D = 5). Note: `foundational-lab-track.md` establishes the principle in "Reuse and QA" that proposed budgets must be measured on target devices rather than asserted, while formalization of the quantitative rubric and budget table is a pending documentation task in P3.2.
   - Gates: interaction value I ≥ 3, tractability T ≥ 3, virtual-only safety framing possible.
   - Other dimensions: outcome coverage C, reuse R, implementation leverage L, modality cost M.
4. Assign a wave, respecting the cap of ≤ 2 concurrent Labs after the P3.5 gate.

The full per-outcome table is the **Appendix**. It was generated from the DB export by a script, so the counts below are exact for this mapping.

## 3. Coverage summary

| Grade | Outcomes | P | S | Lab-touched (P+S) | No Lab |
|---|---:|---:|---:|---:|---:|
| KHTN 8 | 157 | 51 | 47 | **98 (62 %)** | 59 |
| KHTN 9 (canonical) | 102 | 43 | 25 | **68 (67 %)** | 34 |

"No Lab" reasons:

| Grade | R | H | D | A | X | K |
|---|---:|---:|---:|---:|---:|---:|
| KHTN 8 | 16 | 15 | 9 | 10 | 4 | 5 |
| KHTN 9 | 26 | 0 | 4 | 2 | 0 | 2 |

"No Lab" does not mean "no learning resource". These outcomes are served by Lesson content, video, basic exercises or teacher projects. Health/behaviour (H) and sensitive (K) outcomes are deliberately kept out of simulations, to avoid implying medical or personal advice to children.

## 4. Catalog (30 candidates)

Notation used in the tables:
- Outcome codes are short: `B22-O01` = `KHTN8-B22-O01`, `9/dien/2` = `KHTN-L9/dien/2`.
- Score = I + T + C + R + L + M, each 0–5, out of 30.
- Wave: **W1** pilot, **W2–W4** after the P3.5 gate, **BL** backlog (fails a gate until the model is reduced or reviewed).
- "K9 cond." means it depends on KHTN 9 provenance.

### 4.1 Physics / ENERGY

| ID | Lab | Primary outcomes (P) | Supporting (S) | Model sketch | Mod. | I/T/C/R/L/M = Σ | Wave |
|---|---|---|---|---|---|---|---|
| FL-01 | **Mạch điện một chiều** (LED, đo I/U, Ohm, nối tiếp/song song, công suất) | B22-O01, B22-O02, B24-O01, B24-O02, B25-O01, B25-O02. K9 cond.: 9/dien/1, 2, 3, 4, 6 | B21-O01, B23-O01, B24-O03. K9: 9/dien/5 | Existing `circuit@1.0.0` → successor: ideal source, R, variable resistor, LED (polarity/fixed drop), ammeter/voltmeter readings, series/parallel. K9 adds `P = U·I`, `A = P·t` in a reviewed successor | 2D | 5/4/5/5/5/5 = **29** | **W1** (P3.1 pilot) |
| FL-02 | Nhiễm điện do cọ xát | B20-O01 | B20-O02 | Qualitative: triboelectric order table, charge sign, attract/repel rule; no Coulomb numerics | 2D | 3/3/1/1/1/5 = 14 | W4 |
| FL-03 | Khối lượng riêng | B13-O01, B14-O01 | B13-O02 | `D = m/V`. Virtual balance + graduated cylinder displacement; regular box and irregular object. Measurement resolution as reviewed constant | 2D | 4/5/2/3/1/5 = 20 | W2 (fluid family) |
| FL-04 | Áp suất chất lỏng, khí quyển | B16-O01, B16-O02, B16-O03 | B15-O01, B15-O02, B16-O05 | `p = F/S`, `p = d·h`, Pascal transmission, atmospheric pressure demo (qualitative). Needs register fix for B15 | 2D | 4/4/3/2/1/5 = 19 | W2 (fluid family) |
| FL-05 | Lực đẩy Archimedes, nổi/chìm | B17-O01 | (reuses FL-03 density) | `F_A = d·V`, float/sink by comparing weight and `F_A` (or densities). Dynamometer reading in and out of liquid | 2D | 5/4/1/3/1/5 = 19 | W2 (fluid family) |
| FL-06 | Moment lực và đòn bẩy | B18-O01, B18-O02, B19-O02 | B19-O01, B31-O02 (skeletal lever) | `M = F·d`, balance `F1·d1 = F2·d2`, three lever classes; ideal rigid bar | 2D | 5/5/3/3/1/5 = 22 | W3 |
| FL-07 | Năng lượng nhiệt (joulemeter) | B27-O01 | B26-O01, B26-O02 | Heater energy `Q = P·t` read by joulemeter, temperature rise `ΔT = Q/(m·c)` with reviewed c table and declared heat-loss assumption; particle-speed visual is illustrative only | 2D | 4/4/1/2/1/5 = 17 | W3 |
| FL-08 | Sự truyền nhiệt | B28-O01, B28-O02 | B28-O04 | Comparative conduction along rods of different materials (1-D model, reviewed conductivity ranking), insulation comparison; convection/radiation qualitative modes | 2D | 4/3/2/2/1/5 = 17 | W4 |
| FL-09 | Sự nở vì nhiệt | B29-O01 | B29-O02, B29-O03 | `ΔL = α·L0·ΔT` for solids, bimetal strip bend direction, liquids/gases qualitative ranking | 2D | 3/5/1/1/1/5 = 16 | W4 |
| FL-23 | **Quang học: khúc xạ, phản xạ toàn phần, lăng kính, thấu kính** (K9) | 9/anh-sang/1, 2, 3, 4, 7, 8, 9, 10 | 9/anh-sang/5, 6. K8 context B37-O04 | Snell `n1 sin i = n2 sin r`, `n = c/v`, critical angle, prism ray path, thin-lens ray construction and `1/f = 1/d + 1/d'` (or geometric construction only, decided in review), magnifier. Dispersion as qualitative mode | 2D | 5/5/5/3/1/5 = 24 | W3, K9 cond. |
| FL-24 | **Cơ năng, công, công suất** (K9) | 9/nang-luong-co-hoc/1, 2, 4, 5, 6 | 9/nang-luong-co-hoc/3 | `Wđ = ½mv²`, `Wt = P·h` (P = 10m per SGK convention, to be confirmed by reviewer), conservation on frictionless ramp/pendulum, `A = F·s`, `P = A/t` | 2D | 5/5/4/3/1/5 = 23 | W3, K9 cond. |
| FL-25 | Cảm ứng điện từ, dòng xoay chiều (K9) | 9/dien-tu/1 | 9/dien-tu/2 | Qualitative: induced current appears when the magnetic field through a coil changes; direction reverses with motion direction; rotating-coil generator gives alternating current. No Faraday numerics | 2D (3D optional) | 4/3/1/1/1/4 = 14 | W4, K9 cond. |

### 4.2 Chemistry / MATTER

| ID | Lab | P | S | Model sketch | Mod. | I/T/C/R/L/M = Σ | Wave |
|---|---|---|---|---|---|---|---|
| FL-10 | **Mol, bảo toàn khối lượng, tính theo PTHH** | B03-O01, B03-O02, B03-O04, B05-O01, B05-O03, B06-O01, B06-O03. K9: 9/hydrocarbon-va-nguon-nhien/2 | B03-O03, B05-O02, B05-O04, B06-O02. K9: 9/khai-thac-tai-nguyen-tu-vo/4 | Existing `chemistry@1.0.0` stoichiometry → reviewed successor: molar mass table, `n = m/M`, `n = V/24.79` (1 bar, 25 °C), equation balancing check, limiting/excess, yield `H = actual/theoretical`, gas density ratio `d = M_A/M_B` | 2D | 4/5/5/5/4/5 = **28** | **W2** (P3.1 rank 2) |
| FL-11 | Dung dịch và nồng độ | B04-O03, B04-O04 | B04-O01, B04-O02. K9: 9/ethylic-alcohol-va-acetic/2 (độ cồn) | Solubility table vs temperature (reviewed), saturation, `C% = m_ct/m_dd·100`, `CM = n/V`, preparing a target solution; alcohol degree as volume-% mode | 2D | 4/5/2/3/1/5 = 20 | W3 |
| FL-12 | Tốc độ phản ứng và chất xúc tác | B07-O02, B07-O03, B07-O04, B07-O05 | B07-O01, B07-O06 | Semi-quantitative: reviewed relative-rate rules for concentration, temperature, surface area, catalyst; gas-volume-vs-time curve from an explicit simplified rate law. Model choice needs model review | 2D | 5/3/4/3/1/5 = 21 | W3 |
| FL-13 | **Acid – base, chất chỉ thị, thang pH** | B08-O02, B09-O02 | B08-O01, B09-O01 | Indicator colour by pH band (litmus, phenolphthalein; reviewed bands), unknown-sample identification, neutralisation `n(H⁺) = n(OH⁻)`. Existing pH mode was added in place to `chemistry@1.0.0`: register it as its own model version | 2D | 5/4/2/3/3/5 = 22 | W2 |
| FL-14 | Bàn phản ứng: oxide, acid, base, muối, dãy hoạt động kim loại | B10-O03, B11-O02, B11-O03. K9: 9/kim-loai/2, 3, 4 | B02-O05, B10-O01, B10-O02, B11-O01, B11-O04. K9: 9/kim-loai/5 | Rule-based reaction outcome from a **reviewed reaction database** (reagents → occurs?/products/phenomenon: gas, precipitate, colour), solubility table, metal activity series displacement. Database curation and safety framing are the main cost | 2D | 4/3/4/5/2/5 = 23 | W3 |
| FL-15 | An toàn phòng thí nghiệm | B01-O01 | B01-O02. K9: 9/mo-dau/1 | Rule-based scenario checker: hazard symbols, equipment choice, safe/unsafe actions. Virtual only; safety reviewer mandatory | 2D | 3/3/1/4/1/5 = 17 | W4 |
| FL-30 | Lắp ráp phân tử hữu cơ & polymer (K9) | 9/ethylic-alcohol-va-acetic/1, 9/hydrocarbon-va-nguon-nhien/1, 3, 9/lipid-carbohydrate-protein/9, 10 | 9/ethylic-alcohol-va-acetic/4, 9/gioi-thieu-ve-chat-huu-co/1, 2, 9/lipid-carbohydrate-protein/1, 7 | Valence-rule builder (C 4, H 1, O 2), formula/structure check, alkane vs alkene, functional group recognition, monomer → polymer repeat unit (PE, PP), ester formation as template | 3D + 2D fallback | 4/4/4/3/1/3 = 19 | W4, K9 cond. |

### 4.3 Biology / LIVING (and cross-cutting)

| ID | Lab | P | S | Model sketch | Mod. | I/T/C/R/L/M = Σ | Wave |
|---|---|---|---|---|---|---|---|
| FL-16 | Cấu tạo – chức năng cơ thể người (generalises `eye@1.0.0`) | B37-O04, B37-O05 | B30-O01, B31-O01, B32-O02, B35-O01, B37-O01, B38-O01, B39-O01 | Labelling + structure→function matching per organ system; light path to retina, sound path to cochlea as ordered-step model. Not a physiology simulation | 3D + 2D fallback | 3/4/2/4/3/2 = 18 | W4 |
| FL-17 | Tuần hoàn và hô hấp | B33-O05, B34-O01 | B33-O01, B33-O02 (ABO compatibility rule) | Flow-path ordering through heart/vessels, ventilation/gas-exchange compartment model, ABO transfusion compatibility rule. Must avoid individual/medical claims | 2D + 3D | 4/**2**/2/3/1/3 = 15 | **BL** (T < 3 until model reduced) |
| FL-18 | Xây dựng khẩu phần ăn | B32-O03 | — | Sum energy/nutrients from a reviewed, licensed food table vs age-group requirement; balance check. Needs data rights | 2D | 4/4/1/1/1/5 = 16 | W4 |
| FL-19 | Cân bằng môi trường trong, điều hoà thân nhiệt | B39-O05 | B36-O01, B36-O02 | Negative-feedback toy model (set point, sweating/shivering responses). Qualitative only | 2D | 3/**2**/1/1/1/5 = 13 | **BL** |
| FL-20 | Nhân tố sinh thái, giới hạn sinh thái, quần thể | B41-O03, B42-O02 | B41-O02 | Tolerance curve (min/optimum/max per factor, reviewed example species), population density = N/area, age-structure pyramid classification | 2D | 4/4/2/2/1/5 = 18 | W4 |
| FL-21 | Lưới thức ăn và cân bằng tự nhiên | B44-O02, B44-O03, B46-O02 | B43-O02, B46-O01, B46-O03 | Deterministic food-web builder; remove/add a species → qualitative effect; energy pyramid with declared transfer efficiency (~10 %). No stochastic population dynamics in v1 | 2D | 5/3/3/3/1/5 = 20 | W4 |
| FL-22 | Hiệu ứng nhà kính và chu trình carbon (K8 + K9) | B28-O03. K9: 9/khai-thac-tai-nguyen-tu-vo/8 | B47-O03. K9: 9/khai-thac-tai-nguyen-tu-vo/7, 9/nang-luong-voi-cuoc-song/1, 2 | Qualitative energy-flow diagram (incoming/outgoing radiation, greenhouse gas trapping), carbon reservoirs/fluxes. Any numeric climate model is out of scope | 2D | 4/**2**/2/4/1/5 = 18 | **BL** |
| FL-26 | **Lai Mendel, xác định giới tính, di truyền liên kết** (K9) | 9/hien-tuong-di-truyen-mendel/1, 2, 9/di-truyen-nhiem-sac-the/4, 5 | 9/di-truyen-hoc-voi-con-nguoi/1 | Punnett squares for monohybrid/dihybrid crosses, expected ratios (deterministic), optional seeded sampling of offspring counts; XY sex determination; complete linkage vs independent assortment | 2D | 5/5/3/3/1/5 = 22 | W3, K9 cond. |
| FL-27 | Từ gene đến protein (K9) | 9/tu-gene-den-protein/2, 4, 5, 6, 7 | 9/hien-tuong-di-truyen/2, 9/tu-gene-den-protein/8 | Base pairing (A–T, G–C; A–U in RNA), replication, transcription, translation with the standard codon table, point mutation → codon/amino-acid change | 2D | 4/5/4/2/1/5 = 21 | W4, K9 cond. |
| FL-28 | Nhiễm sắc thể, nguyên phân, giảm phân (K9) | 9/di-truyen-nhiem-sac-the/1, 9/nhiem-sac-the/2 | 9/di-truyen-nhiem-sac-the/3, 9/nhiem-sac-the/1, 3 | Stage ordering, chromosome count 2n → 2n (mitosis) / 2n → n (meiosis), diploid vs haploid, structural mutation examples | 2D (3D optional) | 4/4/2/2/1/4 = 17 | W4, K9 cond. |
| FL-29 | Chọn lọc tự nhiên và nhân tạo (K9) | 9/tien-hoa/2, 3, 6 | 9/tien-hoa/1, 5 | Population of variants under a selection rule over generations, seeded deterministic. Growth/selection law choice is review-sensitive | 2D | 5/**2**/3/2/1/5 = 18 | **BL** |

## 5. Rollout by wave

| Wave | Labs | Condition |
|---|---|---|
| W1 | FL-01 (K8 scope only) | P3.4 pilot as already defined in P3.1 |
| W2 | FL-10 and FL-13 (split the current `chemistry` engine into two reviewed models), then the **fluid family** FL-03 / FL-04 / FL-05 sharing one `fluid-bench-2d` renderer kit | P3.5 gate passed. ≤ 2 concurrent |
| W3 | FL-06, FL-12, FL-14, FL-11, FL-07. K9 (if provenance standard met): FL-01 K9 extension, FL-23, FL-24, FL-26 | Reviewer capacity for each subject area. KHTN 9 register deduplicated |
| W4 | FL-02, FL-08, FL-09, FL-15, FL-16, FL-18, FL-20, FL-21, FL-25, FL-27, FL-28, FL-30 | Lower coverage or extra data/rights work |
| BL | FL-17, FL-19, FL-22, FL-29 | Fail tractability gate until a reduced model passes model review |

Rationale:
- W1+W2 (6 Labs) cover **21 of the 51 KHTN 8 primary outcomes (41 %)**: FL-01 6, FL-10 7, FL-13 2, FL-03 2, FL-04 3, FL-05 1. Their supporting outcomes come on top of that.
- Chemistry and physics are front-loaded because their models are bounded and reviewable.
- Biology Labs carry more model-choice and health-framing risk.

## 6. 2D / 3D decision

- **2D** for 25 of 30 candidates. These outcomes are about quantities, graphs, circuits, rays, ratios or rules, which 2D shows as well as SGK diagrams do, at the lowest device/performance cost.
- **3D with a 2D fallback** for FL-16 (organ structures), FL-30 (molecular geometry) and FL-17 (heart chambers, backlog).
- **3D optional** for FL-25 and FL-28. Adopt it only after a 2D version passes QA.

Budgets as referenced in `foundational-lab-track.md` ("Reuse and QA": proposed budgets must be measured on agreed target devices; formal numeric budget table pending P3.2).

## 6A. Presentation tiers & shared kits (PROPOSED)

> **PROPOSED / UNAPPROVED:** Mục này là đề xuất kỹ thuật bổ sung, không thay thế §6 hiện tại và không làm thay đổi các mã định danh (Lineage ID), mô hình khoa học hay quyết định wave/cổng (I ≥ 3, T ≥ 3) của Catalog. Các outcome viện dẫn vẫn là đề xuất chưa duyệt (`PROPOSED_UNAPPROVED`).

### 6A.1. Ba tầng hiển thị (Presentation tiers — Đích đến)

* **Tier A — Scene-first:** Không gian 3 chiều là trung tâm thể hiện hiện tượng (từ trường trong không gian FL-25, liên kết phân tử FL-30, cấu trúc DNA FL-27).
* **Tier B — Bench:** Bàn thí nghiệm mô phỏng dụng cụ và thao tác thực tế ảo, kết hợp bảng hiển thị số đo/đồ thị.
* **Tier C — Light scene + HUD:** Khung cảnh 3D tối giản làm nền bối cảnh; tương tác trọng tâm diễn ra trên HUD bảng số liệu, ma trận hoặc đồ thị.

### 6A.2. Phân định Dual-View: Vẽ (Evidence) vs Đọc (Hiển thị)

Sơ đồ 2D trong mô phỏng cần được phân định rõ theo yêu cầu tương tác của outcome đề xuất:
* **Vẽ (chế độ nhập để sinh learning evidence):** Áp dụng cho các outcome đề xuất yêu cầu học sinh tạo ra sơ đồ/tia sáng: `B22-O01` (vẽ sơ đồ mạch điện), `B25-O02` (ký hiệu ampe kế/vôn kế), `9/anh-sang/4` (vẽ đường truyền qua lăng kính), `9/anh-sang/7, 10` (vẽ ảnh qua thấu kính). Học sinh thao tác đặt ký hiệu, nối mạch hoặc dựng tia; server đối soát kiểm tra tính tương đương (netlist/hình học) để chấm điểm. Sơ đồ tự sinh từ 3D chỉ dùng làm phản hồi sau nộp bài. Việc virtual lab có chấm kỹ năng vẽ hay không là quyết định cần phê duyệt (CAT-8).
* **Đọc (hiển thị sơ đồ cho sẵn):** Áp dụng cho các outcome yêu cầu quan sát/dựa vào sơ đồ: `9/tu-gene-den-protein/4, 5, 7`. Sơ đồ 2D được hiển thị đồng bộ từ trạng thái mô phỏng (`SimState`), học sinh không phải vẽ lại.
* **Tuỳ chọn:** Các lab còn lại có thể cung cấp sơ đồ hoặc đồ thị bổ trợ ở chế độ xem song song nếu hỗ trợ hiểu bài.

### 6A.3. Gom 30 ứng viên theo Shared Kits, Tiers & Modality phát hành đầu

| ID | Lab | Decision & Wave (Catalog) | Kit đề xuất | Presentation Tier (đích đến) | Modality phát hành đầu | Dual-View | Minh hoạ ý tưởng (ngoài scope) |
|---|---|---|---|---|---|---|---|
| FL-01 | Mạch điện một chiều | SHARE / W1 | K1 Bàn điện | Tier B (Bench) | 2D (pilot Circuit bulb) | **Vẽ (evidence)** (`B22-O01`, `B25-O02`) | Khung bàn nguồn, khoá K, ampe kế, vôn kế, bóng đèn; pilot P3.4 |
| FL-02 | Nhiễm điện do cọ xát | DEFER / W4 | K1 Bàn điện | Tier B (Bench) | 2D | Tuỳ chọn | Thước nhựa, vải dạ, điện nghiệm tĩnh điện |
| FL-03 | Khối lượng riêng | SHARE / W2 | K3 Bàn chất lỏng | Tier B (Bench) | 2D (`bench-core` 2D) | Tuỳ chọn | Cân điện tử, bình tràn, ống đong; chia sẻ lõi kính với K2 |
| FL-04 | Áp suất chất lỏng, khí quyển | SHARE / W2 | K3 Bàn chất lỏng | Tier B (Bench) | 2D (`bench-core` 2D) | Tuỳ chọn | Cột áp kế, màng cao su, giác hút; cần bù lỗ hổng B15 |
| FL-05 | Lực đẩy Archimedes | SHARE / W2 | K3 Bàn chất lỏng | Tier B (Bench) | 2D (`bench-core` 2D) | Tuỳ chọn | Lực kế, quả nặng chìm/nổi trong chất lỏng |
| FL-06 | Moment lực và đòn bẩy | KEEP / W3 | K5 Cơ học | Tier B (Bench) | 2D | Tuỳ chọn | Thanh đòn chia vạch trên trục quay, các quả nặng móc treo |
| FL-07 | Năng lượng nhiệt (joulemeter) | SHARE / W3 | K4 Bàn nhiệt | Tier B (Bench) | 2D | Tuỳ chọn (HUD đồ thị) | Nhiệt lượng kế, que đun, joulemeter, nhiệt kế số |
| FL-08 | Sự truyền nhiệt | SHARE / W4 | K4 Bàn nhiệt | Tier B (Bench) | 2D | Tuỳ chọn | Giá đỡ các thanh dẫn nhiệt, nến sáp rụng |
| FL-09 | Sự nở vì nhiệt | DEFER / W4 | K4 Bàn nhiệt | Tier B (Bench) | 2D | Tuỳ chọn | Nguồn nhiệt, thanh kim loại nở dài, băng kép uốn cong |
| FL-10 | Mol & tính theo PTHH | SPLIT / W2 | K2 Bàn hoá ướt | Tier B (Bench + HUD) | 2D | Tuỳ chọn (bảng stoichiometry) | Cân đĩa kín phản ứng, bình tam giác, ống đong thu khí |
| FL-11 | Dung dịch và nồng độ | KEEP / W3 | K2 Bàn hoá ướt | Tier B (Bench) | 2D | Tuỳ chọn (đồ thị độ tan) | Cốc mỏ, đũa thuỷ tinh, thìa hoá chất màu, bình định mức |
| FL-12 | Tốc độ phản ứng & xúc tác | KEEP / W3 | K2 Bàn hoá ướt | Tier B (Bench) | 2D | Tuỳ chọn (đồ thị bọt khí) | Ống nghiệm sinh khí, bình thêm xúc tác, bình cách thuỷ |
| FL-13 | Acid – base, chỉ thị & pH | SHARE / W2 | K2 Bàn hoá ướt | Tier B (Bench) | 2D | Tuỳ chọn (bảng thang pH) | Khay ống nghiệm axit/bazo, giấy chỉ thị, bút đo pH |
| FL-14 | Bàn phản ứng vô cơ & kim loại | SPLIT / W3 | K2 Bàn hoá ướt | Tier B (Bench) | 2D | Tuỳ chọn (bảng tính tan) | Dãy ống nghiệm phản ứng trao đổi, dãy điện hoá kim loại |
| FL-15 | An toàn phòng thí nghiệm | KEEP / W4 | K2 Bàn hoá ướt | Tier B (Bench) | 2D (First-person tuỳ chọn) | Tuỳ chọn (biển báo) | Bàn kịch bản quy tắc an toàn, chọn dụng cụ/thiết bị bảo hộ |
| FL-16 | Cấu tạo mắt & cơ thể người | NO LAB / W4 | Explorer đề xuất | Tier A (Scene-first) | 3D xem (không tạo Lab) | Tuỳ chọn (đường truyền sáng) | Tài nguyên xem/bóc tách nhãn cầu 3D, không chấm điểm (*Lưu ý:* mâu thuẫn giữa Table 1 NO LAB vs §5 xếp W4 là điểm chờ reviewer chuẩn hoá) |
| FL-17 | Tuần hoàn và hô hấp | DEFER / BL | Explorer đề xuất | Tier A (Scene-first) | 3D xem (không tạo Lab) | Tuỳ chọn (sơ đồ vòng tuần hoàn) | Hoạt ảnh 3D dòng chảy qua tim và phổi; không chẩn đoán bệnh |
| FL-18 | Xây dựng khẩu phần ăn | DEFER / W4 | K8 Cảnh nhẹ + HUD | Tier C (Light scene + HUD) | 2D (HUD) | Tuỳ chọn (tháp dinh dưỡng) | HUD chọn món ăn, tính tổng calo và dưỡng chất |
| FL-19 | Điều hoà thân nhiệt | DEFER / BL | K8 Cảnh nhẹ + HUD | Tier C (Light scene + HUD) | 2D (HUD) | Tuỳ chọn (sơ đồ phản hồi) | Minh hoạ phản hồi thân nhiệt định tính |
| FL-20 | Nhân tố & giới hạn sinh thái | KEEP / W4 | K8 Cảnh nhẹ + HUD | Tier C (Light scene + HUD) | 2D (HUD) | Tuỳ chọn (đồ thị giới hạn) | Sa bàn sinh thái bối cảnh nhẹ; thanh trượt nhân tố môi trường |
| FL-21 | Lưới thức ăn & cân bằng | KEEP / W4 | K8 Cảnh nhẹ + HUD | Tier C (Light scene + HUD) | 2D (HUD) | Tuỳ chọn (sơ đồ lưới thức ăn) | Sa bàn sinh thái bối cảnh nhẹ; nối dòng năng lượng |
| FL-22 | Hiệu ứng nhà kính & Carbon | DEFER / BL | K8 Cảnh nhẹ + HUD | Tier C (Light scene + HUD) | 2D (HUD) | Tuỳ chọn (sơ đồ chu trình) | Sơ đồ bức xạ nhiệt và chu trình carbon |
| FL-23 | Quang học K9 | SPLIT / W3 (K9 cond.) | K6 Bàn quang học | Tier B (Bench) | 2D-first | **Vẽ (evidence)** (`9/anh-sang/4, 7, 10`) | Bàn quang học tối, đèn chiếu, lăng kính, thấu kính, màn hứng |
| FL-24 | Cơ năng, công, công suất K9 | KEEP / W3 (K9 cond.) | K5 Cơ học | Tier B (Bench + HUD) | 2D-first | Tuỳ chọn (thanh năng lượng) | Máng trượt, con lắc, cảm biến cổng quang điện |
| FL-25 | Cảm ứng điện từ & xoay chiều | KEEP / W4 (K9 cond.) | K1 Bàn điện | Tier A (Scene-first) | 2D-first (3D optional sau QA) | Tuỳ chọn (đồ thị AC) | Nam châm và cuộn dây di chuyển trong từ trường, đèn LED |
| FL-26 | Lai Mendel & NST K9 | KEEP / W3 (K9 cond.) | K8 Cảnh nhẹ + HUD | Tier C (Light scene + HUD) | 2D-first | Tuỳ chọn (ma trận Punnett) | Bối cảnh vườn thực nghiệm; HUD ma trận tổ hợp alen |
| FL-27 | Từ gene đến protein K9 | KEEP / W4 (K9 cond.) | K7 Procedural phân tử/gen | Tier A (Scene-first) | 2D-first | **Đọc (hiển thị)** (`9/tu-gene-den-protein/4, 5, 7`) | Mô hình DNA sinh bằng code; tháo xoắn; ribosome dịch mã |
| FL-28 | NST & phân bào K9 | DEFER / W4 (K9 cond.) | K7 Procedural phân tử/gen | Tier A (Scene-first) | 2D-first (3D optional sau QA) | Tuỳ chọn (sơ đồ phân bào) | Các kỳ nguyên phân/giảm phân; 2D trước, 3D sau khi đạt QA |
| FL-29 | Chọn lọc tự nhiên K9 | DEFER / BL (K9 cond.) | K8 Cảnh nhẹ + HUD | Tier C (Light scene + HUD) | 2D-first (BL do T=2) | Tuỳ chọn (đồ thị tần số alen) | Mô phỏng quần thể có lựa chọn quy luật; BL do T=2 |
| FL-30 | Phân tử hữu cơ & polymer K9 | DEFER / W4 (K9 cond.) | K7 Procedural phân tử/gen | Tier A (Scene-first) | 2D-first (3D fallback theo catalog) | Tuỳ chọn (CTCT 2D) | Ghép nối quả cầu hoá trị alkane/alkene; polymer mạch dài |

*Ghi chú:* Lò cao không có FL ID trong catalog và không có outcome P/S; đề xuất xem xét ở dạng Explorer candidate ngoài danh mục Lab chấm điểm.

### 6A.4. Cân nhắc kỹ thuật nền tảng và ranh giới mô hình – renderer

* **Ranh giới mô hình khoa học và renderer:** Mô hình khoa học độc lập hoàn toàn với lớp hiển thị; mô hình chỉ xuất ra trạng thái khai báo (`declarative scene state`: vật thể, vị trí tương đối, mức chất lỏng, màu sắc, sự kiện bọt khí/kết tủa, chỉ số đồng hồ đo). Renderer (dù là 2D hay 3D) chỉ đóng vai trò vẽ lại trạng thái đó. Bất biến kiến trúc: renderer không được phép làm thay đổi kết quả khoa học, dữ liệu checkpoint hay điểm số rubric; server luôn tính toán lại toàn bộ.
* **Tái cấu trúc bộ kit W2 (`bench-core` thay vì `fluid-bench-2d`):** Đổi tên kit dùng chung thành `bench-core` (quản lý trạng thái cảnh, khay mẫu, dụng cụ, widget đo lường) đi kèm hai renderer độc lập: `renderer-2d` và `renderer-3d`. W2 triển khai bằng `renderer-2d` để vượt cổng P3.5 an toàn; `renderer-3d` được tổ chức như một platform track riêng song song ngoài đường găng, không chiếm slot Lab trong giới hạn ≤ 2 Labs đồng thời. Quyết định mở rộng sang 3D cho K2/K3 sẽ dựa trên spike đo đạc thực tế trên thiết bị mục tiêu tại W3 theo nguyên tắc tại `foundational-lab-track.md` (mục Reuse and QA).
* **Chiến lược tạo hình Kit K7 (Procedural geometry):** Khuyến nghị sinh hình học bằng code (Three.js InstancedMesh, SplineCurve cho chuỗi xoắn DNA, liên kết phân tử đơn giản) thay vì tải mesh GLB lớn để tối ưu hoá thời gian tải trang; các đại phân tử phức tạp (ribosome, enzyme) có thể kết hợp mesh tối ưu hoá khi có kết quả đo hiệu năng thực tế.

### 6A.5. Quy hoạch Shared 3D Physics Lab Room (Họ Điện - Từ) & Bảo toàn tuyệt đối Class Lab

* **K1 — Bàn Điện–Từ (kit dùng chung theo danh mục, chưa đồng nghĩa đã implement):**
  1. `FL-01`: **Mạch điện một chiều** (pilot bóng đèn; các mode đo I/U, Ohm, nối tiếp/song song cần activity/model riêng khi được duyệt).
  2. `FL-02`: **Nhiễm điện do cọ xát & Tĩnh điện** (điện nghiệm, thước tích điện).
  3. `FL-25`: **Cảm ứng điện từ & Dòng xoay chiều** (nam châm, cuộn dây, cảm ứng và các phép đo tương ứng).
  Cả ba có thể dùng chung vỏ phòng, bàn và lighting; apparatus, interactions và model vẫn riêng. Chỉ Circuit bulb và circuit topology hiện có renderer frontend; FL-02/25 chưa được triển khai.
* **Không gộp K4 vào K1:** `FL-07` (Năng lượng nhiệt/Joulemeter), `FL-08` (Truyền nhiệt), `FL-09` (Nở vì nhiệt) thuộc **K4 Bàn nhiệt** theo §6A.3, không thuộc kit Điện–Từ. Có thể tái sử dụng hạ tầng phòng khi hợp lý, nhưng cần khay nhiệt và renderer/interaction theo từng Lab.
* **Tái dùng vỏ phòng có điều kiện:** `FL-06` (K5 Cơ học) và `FL-23` (K6 Quang học) có thể tái dùng geometry phòng/bàn sau review; không vì thế trở thành thành viên K1 hoặc được tính là 3D đã có.

* **Bảo toàn tuyệt đối Logic & Hợp đồng Class Lab (Class Lab Invariance):**
  - **Không thay đổi tuple thực thi:** Mọi assignment được giao trong Class Lab tiếp tục gắn với tuple bất biến: `modelRef`, `engineVersion`, `packVersionId`, `configVersionId`, `activityVersionId`, `activityDigest`, `rubricRef`.
  - **Mô hình tính toán độc lập:** Hàm mô phỏng (`packages/sim`) và engine đánh giá chấm điểm server (`lab-run.ts`, `evaluateCircuitBulbActivity`) giữ nguyên $100\%$ logic, chỉ xử lý dữ liệu thuần tuý (`checkpoint evidence` & `answers`).
  - **Renderer 2D/3D là View hoán đổi được (Swappable View):** Renderer nhận cùng state và phát cùng interaction events qua hợp đồng hiện có; không tự tính science/scoring. Khi cả hai view được xây và kiểm tra tương đương, học sinh có thể chọn 2D hoặc 3D, mặc định 3D cho Lab có 3D ổn định. Preference chỉ lưu cục bộ theo Lab, không đi vào attempt/assignment tuple; mode không làm thay đổi evidence payload hay kết quả chấm. Không hiện lựa chọn renderer chưa thực sự tồn tại.

### 6A.6. Runtime frontend dùng chung và phạm vi đã có (cập nhật 2026-10-31)

**Định hướng 8 Shared Kits + 1 Explorer:** Giữ cách phân nhóm K1–K8 ở §6A.3 làm kế hoạch tái sử dụng presentation. Explorer là tài nguyên xem/khám phá không sinh evidence, không tự động là Lab hay một trong 20 slot đề xuất. Bảng này vẫn là proposal: dùng chung phòng, mesh, dụng cụ, HUD hoặc renderer **không** gộp Lab identity, outcome, model khoa học, activity/rubric, quyền truy cập hay assignment. Portfolio vẫn là 30 discovery IDs/20 provisional slots cho tới khi reviewer quyết định; con số 8 kits không phải 8 Lab, 8 release, cũng không chứng minh phủ kín curriculum.

**Physical Room Environment dùng chung xuyên kit — hợp đồng scene:** Đây là lớp không gian vật lý nền, dùng lại giữa các Lab cần cùng kiểu phòng thực hành. Đây không phải kit dụng cụ, không phải Lab Space UI, và không chứa vật dụng riêng cho một thí nghiệm.

Danh sách đầu ra theo đúng 20 slot ưu tiên, chia theo môn học, kit dụng cụ và trạng thái dùng phòng nền, nằm trong [lab-portfolio-20-slots-v1.md — mục 3](lab-portfolio-20-slots-v1.md#3-phan-nhom-20-lab-uu-tien-theo-mon-kit-va-phong-nen). Bảng đó không ghi tiến độ cho candidate ngoài 20 slot.

| Lớp | Nội dung / chủ sở hữu | Không bao gồm |
|---|---|---|
| Lab Space UI | Fullscreen viewport, thoát, bảng câu hỏi/kết quả, renderer toggle — `shared/LabSpace.tsx` và component liên quan | Mesh phòng 3D hoặc apparatus |
| Phòng nền vật lý | Tường, sàn gạch, tủ lưu trữ chung, lababo/vòi nước, bàn thao tác nâu/chân bàn, ánh sáng nền — `shared/PhysicalLabEnvironment.tsx` | Kệ hoá chất, chai reagent, rack ống nghiệm, cân, cốc, dây điện, cuộn dây, bể, cảm biến hay props riêng của kit/Lab |
| Host/camera | Canvas lifecycle, camera, OrbitControls, WebGL fallback — thuộc stage/host của renderer đang dùng | Hình học phòng và nội dung khoa học |
| Kit/Lab apparatus | Dụng cụ cần cho activity, đặt trên bàn và render từ folder kit/activity; model/state vẫn riêng theo Lab | Không sửa room shell chỉ để thêm dụng cụ cho một bài |

K1 Circuit/FL-25, FL-03/K3 và FL-10/K2 hiện cùng compose `PhysicalLabEnvironment`; K1 thêm apparatus điện–từ, FL-03 thêm dụng cụ đo mật độ, FL-10 thêm cân điện tử và hai cốc. FL-10 **không cần** kệ chai, chai hoá chất stock, ống đong, bình rửa hay rack ống nghiệm nên không đưa các props này vào room hoặc scene FL-10. Lab K2 khác chỉ được reuse apparatus khi activity đã chọn thực sự cần nó; membership cùng kit không tự động thêm mọi props. K3–K6 có thể dùng chung room shell khi thiết kế là cảnh phòng thực hành vật lý; K7/K8/Explorer chỉ dùng nếu đúng archetype scene.

**Quy ước phát triển:** Room shell là component ổn định xuyên kit. Dev của kit chỉ import/composition, giữ props trong folder kit/activity và không thêm conditional props/config riêng vào `PhysicalLabEnvironment`. Thay đổi tường, sàn, tủ, lababo, bàn, ánh sáng hoặc tọa độ mặt bàn là thay đổi cross-kit có chủ đích; phải rà tất cả consumer hiện hành, kiểm tra K1 Circuit và FL-10/K2 tối thiểu, cập nhật contract và ghi ảnh/evidence QA. Nếu cần một loại phòng khác, tạo variant/environment ID rõ ràng sau quyết định kiến trúc; không âm thầm làm biến dạng room chung.

**Tải và hiệu năng:** FE dùng chung source module để tránh nhân bản code/geometry definitions và cho phép bundler chia sẻ/cache chunk; chỉ nạp apparatus của Lab hiện hành. Nếu sau này chuyển mesh tĩnh sang GLB/texture, asset cần version/digest bất biến và loader cache. Geometry procedural vẫn khởi tạo theo từng Canvas; không tuyên bố dùng chung GPU buffers. Đo riêng cold/warm download bytes, thời gian đến tương tác, GPU memory, frame pacing và context loss trên thiết bị mục tiêu trước khi kết luận tiết kiệm tải/đạt performance.

**Tra cứu danh mục theo shared kit (proposal, đối chiếu §6A.3):**

| Nhóm/kit | Lab IDs trong catalog | Phạm vi môn/chủ đề | Trạng thái pipeline và view |
|---|---|---|---|
| K1 Bàn Điện–Từ | FL-01, FL-02, FL-25 | Vật lý: mạch điện, tĩnh điện, cảm ứng điện từ | FL-01 Circuit và FL-25 EM Induction có active shared releases (readback 2026-11-01). FL-25 provenance/thiết bị còn follow-up; FL-02 chưa triển khai. Circuit topology dùng lại React Flow 2D editor và 3D stage. Phòng nền vật lý dùng chung qua `PhysicsStage`. |
| K2 Bàn hoá ướt | FL-10–FL-15 | Hoá học: mol/PTHH, dung dịch, tốc độ phản ứng, acid–base, phản ứng vô cơ, an toàn | FL-10 Mass Conservation v1 đang active cho một activity; không đại diện toàn bộ FL-10. FL-11–15 chưa triển khai; pH compatibility fixture `chemistry` vẫn private và không phải Lab phát hành. |
| K3 Bàn chất lỏng | FL-03, FL-04, FL-05 | Vật lý: khối lượng riêng, áp suất, Archimedes | FL-03 Density v1 có active shared release và renderer K3. FL-04/05 chưa triển khai; 3D vẫn cần QA trên thiết bị đại diện. |
| K4 Bàn nhiệt | FL-07, FL-08, FL-09 | Vật lý: năng lượng nhiệt, truyền nhiệt, nở vì nhiệt | Kit quy hoạch; chưa có scene Lab production. |
| K5 Cơ học | FL-06, FL-24 | Vật lý: moment/đòn bẩy; cơ năng, công, công suất | Kit quy hoạch; chưa có scene Lab production. |
| K6 Bàn quang học | FL-23 | Vật lý: quang học K9 | Một candidate SPLIT; cần chốt modes/model. 2D evidence drawing là yêu cầu riêng, không thể thay bằng chỉ đổi camera. |
| K7 Phân tử/gen | FL-27, FL-28, FL-30 | Sinh học: gene–protein, phân bào; Hoá học: phân tử hữu cơ/polymer | Kit quy hoạch; chưa có scene production. FL-28/30 deferred theo catalog. |
| K8 Cảnh nhẹ + HUD | FL-18–FL-22, FL-26, FL-29 | Sinh học/sinh thái, dinh dưỡng, khí hậu, di truyền | Kit quy hoạch; chưa có scene production. Phần lớn là HUD/2D-first; 3D chỉ thêm khi cải thiện học tập và qua QA. |
| Explorer (không phải kit/Lab) | FL-16, FL-17 (đề xuất) | Sinh học/cơ thể người | Nội dung xem/khám phá, không tạo evidence và không phải release Lab; giữ đúng trạng thái NO LAB/DEFER trong catalog. |

Các ID giữ nguyên decision/wave/provisional status ở bảng §6A.3 và bảng portfolio; bảng trên chỉ trả lời “dùng chung presentation kit nào”, không nâng status `DEFER`, `SPLIT`, `NO LAB` thành `SHARE`/`implemented`. Nếu một candidate chưa có state schema/model/activity đã review, mock-up 2D/3D cũng không được ghi là pipeline implementation.

| Layer | Reuse boundary | Current evidence / next work |
|---|---|---|
| Shared FE directory map | Nhóm code theo runtime, pathway, discipline và kit để đặt shared environment gần các Labs dùng chung | `../../../../nexalab-fe/src/features/labs/README.md` ánh xạ cấu trúc code với đúng 20 provisional portfolio slots. Kit folders chưa có renderer chỉ chứa README/status, không giả lập implementation. |
| Physical Room Environment | Phòng nền dùng chung cho các Lab có cảnh phòng thực hành: tường, sàn gạch, tủ, lababo, bàn nâu và ánh sáng nền; độc lập với kit và Lab Space UI | `shared/PhysicalLabEnvironment.tsx` được `PhysicsStage` dùng cho K1 và K3; `WetBenchStage.tsx` dùng trực tiếp cho K2. Source được dùng chung, nhưng chưa có benchmark Chromebook về bytes/memory/frame-time. |
| K1 apparatus / host | Nguồn, dây, công tắc, bóng đèn, cuộn dây, nam châm và thiết bị điện–từ theo từng Lab | `CircuitBulb3DStage.tsx` và `EmInduction3DStage.tsx` compose room K1; `Circuit.tsx` chọn renderer topology. Apparatus riêng theo activity. FL-02 chưa implement. |
| Pilot apparatus | Nguồn, dây, công tắc, bóng đèn và thiết bị circuit | `physics/electricity/CircuitBulb3DStage.tsx` hiển thị pilot bulb. `Circuit.tsx` chọn renderer topology; `Circuit2DEditor.tsx` khôi phục React Flow 2D component editor từ pre-Lab-Space `Circuit.tsx`; state/evidence vẫn theo contract caller và server tiếp tục chấm. Đây chưa phải Lab successor hay release mới được duyệt. |
| Lab Space shell | Viewport, thoát, renderer fallback, panel câu hỏi/kết quả dùng chung cho entry points | `shared/LabSpace.tsx` chạy cho standalone Lab và assigned lesson; `shared/LabRendererToggle.tsx` chọn view; `runtime/lab-run-host.ts` giữ launch/draft/submit contract. Không đổi model registry hoặc release policy. |
| K2–K8 apparatus kits | Props, dụng cụ và widgets theo archetype; chỉ thay apparatus/config khi learning interaction và model cho phép | K2 FL-10 và K3 FL-03 có active releases với phạm vi activity giới hạn; FL-11–15, FL-04/05 và K4–K8 chưa production. Chemistry compatibility fixture vẫn `TECHNICAL_FIXTURE_ONLY`, độc lập với FL-10. |

**Ranh giới K2:** Có thể đề xuất reuse các dụng cụ bench/pipet/ống nghiệm/đồ đo giữa FL-10–15; không coi một căn phòng hay bộ prop hiện thực hóa cả sáu Lab. FL-10 và FL-14 còn `SPLIT`; các models/reactions, state, safety framing, activity/rubric và candidate IDs cần được chốt riêng. Với hoạt động pH → tốc độ phản ứng, chỉ tái dùng room/asset catalog sau khi từng model được review; chất lỏng, bọt khí, màu chỉ là output presentation từ kết quả model có version.

**Ranh giới K3:** FL-03/04/05 có thể chia sẻ bể, cân, ống đong và dụng cụ đo. Density, pressure và buoyancy giữ model, activity, parameters, rubric và outcome mapping riêng. Việc dùng chung kết quả density chỉ được phép nếu được khai báo/version hóa; renderer không tính công thức thay simulation server.

**Low-end device, asset delivery và caching (yêu cầu cho P3.7 design/QA):**

- Lazy-load scene/model theo Lab route; dùng shared room module/chunk hoặc asset và chỉ nạp apparatus của kit đang dùng. Cache chunk và asset bất biến theo version/digest, đặt kích thước và content type rõ, cho phép CDN/browser cache; manifest mới trỏ sang asset version mới thay vì thay file tại chỗ. Không định nghĩa lặp mesh phòng trong từng kit; không cache attempt/evidence như asset công khai. Đo riêng bytes tải, GPU memory và frame-time vì reuse source không đồng nghĩa với chia sẻ GPU geometry giữa các Canvas.
- Ưu tiên procedural geometry/primitive hoặc mesh GLB ít node; dùng instancing cho vật thể lặp, texture KTX2 và Draco khi pipeline hỗ trợ, giới hạn texture/triangles theo thiết bị. Giải phóng GPU geometry/material/texture khi rời Lab hoặc thay kit.
- Hạ DPR/quality, shadow map, postprocessing và particle count trên thiết bị yếu; giữ tương tác input và server evaluation hoạt động khi WebGL mất/lỗi. Không buộc GPU rời; Explorer có thể là scene xem nhẹ và không sinh evidence.
- Đo lạnh/ấm: download bytes, thời gian đến tương tác, memory, frame pacing, context loss và thời gian khởi tạo trên Chromebook/Celeron, tablet và máy mục tiêu đã thống nhất. Ghi actual baseline và ngưỡng trước activation; không suy ra performance pass từ Playwright desktop, bundle size hay cache hit đơn lẻ.
- Search/indexing: trang Lab có route/deep-link và metadata văn bản qua DOM để app/search nội bộ tìm được title/objective; không dựa vào label nằm trong canvas. Không index route private/Class Lab hoặc nội dung chưa phát hành vào public search/robots; đây là indexing nội dung, không phải index GPU/assets.

**P3.6/P3.7 application:** P3.6 chỉ ghi nhận shell + Circuit 2D/3D frontend là presentation/compatibility progress; source được nhóm theo discipline/kit nhưng không khẳng định các folder đó đã có Lab renderer. Release mới cần exact digest, dev/agent double check, ADMIN `DEV_APPROVAL`, quyền truy cập và device QA như phase-plan. Các release cũ giữ receipt theo snapshot của chúng. P3.7 xây từng Lab theo thứ tự 20 slot sau gate: scope model/activity trước, chọn kit reuse, thêm asset/thao tác cần thiết, kiểm tra đúng device, rồi review và release từng identity. Không triển khai đồng loạt 8 kits như điều kiện để khép phase và không mở song song quá cap roadmap.

## 7. Decisions needed from reviewers

| ID | Type | Question |
|---|---|---|
| CAT-1 | Curriculum | Accept the P/S/N classification per outcome (Appendix) or change it. Every row needs a decision before P3.3 can mark mappings `REVIEWED` |
| CAT-2 | Curriculum | Fix register defects §1 (OCR, B07 split, B15 gap, KHTN 9 duplicates) before review |
| CAT-3 | Product | Confirm wave order and the "fluid family" grouping (3 Labs, one renderer kit) vs one Lab with 3 modes |
| CAT-4 | Science | For each W2 Lab: reviewed constants/tables (molar masses, indicator pH bands, densities, `g` or `P = 10m` convention) and their sources |
| CAT-5 | Science | Whether FL-23 uses the thin-lens formula or geometric construction only at KHTN 9 level |
| CAT-6 | Product/safety | Confirm H/K outcomes stay out of simulations (B31–B40 health, B40 reproduction) |
| CAT-7 | Technical | Split `chemistry@1.0.0` into `stoichiometry@…` and `acid-base@…` models before FL-10/FL-13 releases (relates to T-4) |
| CAT-8 | Product/Curriculum | Dual-View cho kỹ năng vẽ: Thí nghiệm ảo có chấm điểm tương tác vẽ sơ đồ của học sinh (`B22-O01`, `B25-O02`, `9/anh-sang/4, 7, 10`) để sinh learning evidence trong `lab-contract/1` hay chỉ hiển thị sơ đồ 2D đồng bộ làm phản hồi quan sát? |
| CAT-9 | Architecture/Product | Định danh Explorer: Có bổ sung phân loại tài nguyên học tập 3D không sinh evidence (như FL-16, FL-17 hoặc mô hình lò cao) vào mô hình dữ liệu Lesson không, hay giữ nguyên phạm vi Lab hiện tại? (Cần ADR nếu thay đổi schema). |
| CAT-10 | Architecture/Platform | Phạm vi kit chất lỏng W2 và hạch toán cap ≤ 2 Labs: Giữ nguyên `fluid-bench-2d` hay đổi thành `bench-core` (2D trước, cắm 3D sau)? *(Proposed resolution: W2 ra mắt bằng renderer 2D trên `bench-core`; renderer-3d là platform track riêng, không chiếm slot Lab trong cap ≤ 2 và không nằm trong đường găng cổng P3.5. Lab chỉ tính vào cap khi đang trong pipeline review khoa học/chương trình. Quyết định mở rộng 3D cho K2/K3 để W3, dựa trên spike đo trên thiết bị mục tiêu).* |

## Appendix — per-outcome mapping

Generated from the DB export (2026-10-28). "Statement" is truncated and keeps the register's OCR errors.

### KHTN 8

| Outcome | Chương | Lab | Vai trò | Statement (rút gọn) |
|---|---|---|---|---|
| `B01-O01` | Mở đầu | FL-15 | chính | Nhận biết được một số dụng cụ, hoá chất và nêu được quy tắc sử dụng hoá chất an toàn. |
| `B01-O02` | Mở đầu | FL-15 | hỗ trợ | Nhận biết được các thiết bị điện trong môn Khoa học tự nhiên 8 và trình bày được cách sử dụng điện an toàn. |
| `B02-O01` | Chương I. Phản ứng hoá học | — | không cần Lab: khái niệm/ghi nhớ | Nêu được khái niệm, đưa ra được ví dụ minh hoạ và phân biệt được biến đổi vật lí, biến đổi hoá học. |
| `B02-O02` | Chương I. Phản ứng hoá học | — | không cần Lab: thực hành thật/video phù hợp hơn | Tiến hành được một số thí nghiệm về biến đổi vật lí và biến đổi hoá học. |
| `B02-O03` | Chương I. Phản ứng hoá học | — | không cần Lab: khái niệm/ghi nhớ | Nêu được khái niệm phần ứng hoá học, chất đầu và sản phẩm. |
| `B02-O04` | Chương I. Phản ứng hoá học | — | không cần Lab: khái niệm/ghi nhớ | Nêu được sự sắp xếp khác nhau của các nguyên tử trong phân tử chất đầu và sản phẩm. |
| `B02-O05` | Chương I. Phản ứng hoá học | FL-14 | hỗ trợ | Chỉ ra được một số dấu hiệu chứng tổ có phần ứng hoá học xảy ra. |
| `B02-O06` | Chương I. Phản ứng hoá học | — | không cần Lab: khái niệm/ghi nhớ | Nêu được khái niệm, đưa ra được ví dụ minh hoạ về phần ứng toả nhiệt, thu nhiệt và trình bày được các ứng dụng |
| `B03-O01` | Chương I. Phản ứng hoá học | FL-10 | chính | Nêu được khái niệm mol, tính được khối lượng mol và chuyển đổi được giữa số mol và khối lượng. |
| `B03-O02` | Chương I. Phản ứng hoá học | FL-10 | chính | Nêu được khái niệm tỉ khối, viết được công thức tính tỉ khối của chất khí và so sánh được chất khí này nặng ha |
| `B03-O03` | Chương I. Phản ứng hoá học | FL-10 | hỗ trợ | Nêu được khái niệm thể tích mol của chất khí ở áp suất 1 bar và 25 °C. |
| `B03-O04` | Chương I. Phản ứng hoá học | FL-10 | chính | Sử dụng được công thức n(mol) = $\frac{V(L)}{24,79(L/mol)}$ để chuyển đổi giữa số mol và thể tích chất khí ở đ |
| `B04-O01` | Chương I. Phản ứng hoá học | FL-11 | hỗ trợ | Nêu được dung dịch là hỗn hợp lồng đồng nhất của các chất đã tan trong nhau. |
| `B04-O02` | Chương I. Phản ứng hoá học | FL-11 | hỗ trợ | Nêu được định nghĩa độ tan của một chất trong nước, nông độ phần trăm, nông độ mol. |
| `B04-O03` | Chương I. Phản ứng hoá học | FL-11 | chính | Tính được độ tan, nông độ phần trăm; nông độ mol theo công thức. |
| `B04-O04` | Chương I. Phản ứng hoá học | FL-11 | chính | Tiến hành được thí nghiệm pha một dung dịch theo một nóng độ cho trước. |
| `B05-O01` | Chương I. Phản ứng hoá học | FL-10 | chính | Tiến hành được thí nghiệm để chứng minh: trong phần ứng hoá học khối lượng được bảo toàn. |
| `B05-O02` | Chương I. Phản ứng hoá học | FL-10 | hỗ trợ | Phát biểu được định luật bảo toàn khối lượng. |
| `B05-O03` | Chương I. Phản ứng hoá học | FL-10 | chính | Nếu được khái niệm phương trình hoá học và các bước lập phương trình hoá học. |
| `B05-O04` | Chương I. Phản ứng hoá học | FL-10 | hỗ trợ | Trình bày được ý nghĩa của phương trình hoá học. |
| `B06-O01` | Chương I. Phản ứng hoá học | FL-10 | chính | Tính được lượng chất trong phương trình hoá học theo số mol, khối lượng hoặc thể tích ở điều kiện 1 bar và 25  |
| `B06-O02` | Chương I. Phản ứng hoá học | FL-10 | hỗ trợ | Nêu được khái niệm hiệu suất của phần ứng. |
| `B06-O03` | Chương I. Phản ứng hoá học | FL-10 | chính | Tính được hiệu suất của một phần ứng dựa vào lượng sản phẩm thu được theo lí thuyết và lượng sản phẩm thu được |
| `B07-O01` | Chương I. Phản ứng hoá học | FL-12 | hỗ trợ | Nêu được khái niệm về tốc độ phần ứng (chỉ mức độ nhanh hay chậm của phần ứng hoá học). |
| `B07-O02` | Chương I. Phản ứng hoá học | FL-12 | chính | Trình bày được một số yếu tố ảnh hưởng đến tốc độ phần ứng và nêu được một số ứng dụng thực tế. |
| `B07-O03` | Chương I. Phản ứng hoá học | FL-12 | chính | Tiến hành được thí nghiệm và quan sát thực tiễn: |
| `B07-O04` | Chương I. Phản ứng hoá học | FL-12 | chính | + So sánh được tốc độ một số phần ứng hoá học; |
| `B07-O05` | Chương I. Phản ứng hoá học | FL-12 | chính | + Nếu được các yếu tố làm thay đổi tốc độ phần ứng; |
| `B07-O06` | Chương I. Phản ứng hoá học | FL-12 | hỗ trợ | + Nêu được khái niệm về chất xúc tác. |
| `B08-O01` | Chương II. Một số hợp chất thông | FL-13 | hỗ trợ | Nêu được khái niệm acid (tạo ra ion H⁺). |
| `B08-O02` | Chương II. Một số hợp chất thông | FL-13 | chính | Tiến hành được thí nghiệm của hydrochloric acid (làm đổi màu chất chỉ thị; phần ứng với kim loại), nêu và giải |
| `B08-O03` | Chương II. Một số hợp chất thông | — | không cần Lab: ứng dụng/đọc hiểu | Trình bày được một số ứng dụng của một số acid thông dụng (HCl, H₂SO₄, CH₃COOH). |
| `B09-O01` | Chương II. Một số hợp chất thông | FL-13 | hỗ trợ | Nêu được khái niệm base (tạo ra ion OH $^{-}$ ), kiểm là các hydroxide tan tốt trong nước. |
| `B09-O02` | Chương II. Một số hợp chất thông | FL-13 | chính | Tiến hành được các thí nghiệm của base (làm đối màu chất chỉ thị, phần ứng với acid tạo muối); nêu và giải thí |
| `B10-O01` | Chương II. Một số hợp chất thông | FL-14 | hỗ trợ | Nêu được khái niệm oxide và phân loại được các oxide theo khả năng phản ứng với acid/base. |
| `B10-O02` | Chương II. Một số hợp chất thông | FL-14 | hỗ trợ | Viết được phương trình hoá học tạo oxide từ kim loại/phi kim với oxygen. |
| `B10-O03` | Chương II. Một số hợp chất thông | FL-14 | chính | Tiến hành được thí nghiệm oxide kim loại phần ứng với acid; oxide phi kim phần ứng với base; nêu và giải thích |
| `B11-O01` | Chương II. Một số hợp chất thông | FL-14 | hỗ trợ | Nêu được khái niệm về muối, đọc được tên một số loại muối thông dụng và trình bày được một số phương pháp điều |
| `B11-O02` | Chương II. Một số hợp chất thông | FL-14 | chính | Chỉ ra được một số muối tan và muối không tan từ bằng tính tan. |
| `B11-O03` | Chương II. Một số hợp chất thông | FL-14 | chính | Tiến hành được thí nghiệm muối phản ứng với kim loại, acid, base, muối; nêu và giải thích được hiện tượng xảy  |
| `B11-O04` | Chương II. Một số hợp chất thông | FL-14 | hỗ trợ | Trình bày được mối quan hệ giữa acid, base, oxide và muối và rút ra được kết luận về tính chất hoá học của aci |
| `B12-O01` | Chương II. Một số hợp chất thông | — | không cần Lab: ứng dụng/đọc hiểu | Trình bày được vai trò của phân bón đối với cây trồng. |
| `B12-O02` | Chương II. Một số hợp chất thông | — | không cần Lab: khái niệm/ghi nhớ | Nêu được thành phần và tác dụng cơ bản của một số loại phần bón hoá học đối với cây trồng. |
| `B12-O03` | Chương II. Một số hợp chất thông | — | không cần Lab: dự án/điều tra/thảo luận | Trình bày được ảnh hưởng của việc sử dụng phân bón hoá học đến môi trường của đất, nước và sức khoẻ của con ng |
| `B13-O01` | Chương III. Khối lượng riêng và  | FL-03 | chính | Nếu được định nghĩa khối lượng riêng, xác định được khối lượng riêng qua khối lượng và thể tích tương ứng. Khố |
| `B13-O02` | Chương III. Khối lượng riêng và  | FL-03 | hỗ trợ | Liệt kê được một số đơn vị đo khối lượng riêng thường dùng. |
| `B14-O01` | Chương III. Khối lượng riêng và  | FL-03 | chính | Thực hiện thí nghiệm để xác định được khối lượng riêng của một khối hộp chữ nhật, của một vật có hình dạng bắt |
| `B15-O01` | Chương III. Khối lượng riêng và  | FL-04 | hỗ trợ | Liệt kê được một số đơn vị đo áp suất thông dụng. |
| `B15-O02` | Chương III. Khối lượng riêng và  | FL-04 | hỗ trợ | Thảo luận được công dụng của việc tăng, giảm áp suất qua một số hiện tượng thực tế. |
| `B16-O01` | Chương III. Khối lượng riêng và  | FL-04 | chính | Thực hiện thí nghiệm khảo sát tác dụng của chất lỏng lên vật đặt trong chất lỏng. |
| `B16-O02` | Chương III. Khối lượng riêng và  | FL-04 | chính | Nếu được áp suất tác dụng vào chất lỏng sẽ được chất lỏng truyền đi nguyên vẹn theo mọi hướng. Lấy ví dụ minh  |
| `B16-O03` | Chương III. Khối lượng riêng và  | FL-04 | chính | Thực hiện được thí nghiệm để chứng tổ tổn tại áp suất khí quyền và áp suất này tác dụng theo mọi phương. |
| `B16-O04` | Chương III. Khối lượng riêng và  | — | không cần Lab: khái niệm/ghi nhớ | Mô tả được sự tạo thành tiếng động trong tai khi tai chịu sự thay đổi áp suất đột ngọt. |
| `B16-O05` | Chương III. Khối lượng riêng và  | FL-04 | hỗ trợ | Giải thích được một số ứng dụng về áp suất không khí trong đời sống (ví dụ như: giác mút, bình xịt, tàu đêm kh |
| `B17-O01` | Chương III. Khối lượng riêng và  | FL-05 | chính | Thực hiện thí nghiệm khảo sát tác dụng của chất lỏng lên vật đặt trong chất lỏng, rút ra được: điều kiện định  |
| `B18-O01` | Chương IV. Tác dụng làm quay của | FL-06 | chính | Thực hiện thí nghiệm để mô tả được tác dụng làm quay của lực. |
| `B18-O02` | Chương IV. Tác dụng làm quay của | FL-06 | chính | Nếu được: tác dụng làm quay của lực lên một vật quanh một điểm hoặc một trực được đặc trưng bằng moment lực. |
| `B19-O01` | Chương IV. Tác dụng làm quay của | FL-06 | hỗ trợ | Lấy được ví dụ về một số loại đơn bảy khác nhau trong thực tiễn. |
| `B19-O02` | Chương IV. Tác dụng làm quay của | FL-06 | chính | Sử dụng kiến thức, kĩ năng về dòn bảy để giải quyết được một số vấn đề thực tiễn. |
| `B20-O01` | Chương V. Điện | FL-02 | chính | Giải thích được sơ lược nguyên nhân một vật cách điện nhiễm điện do cơ xát. |
| `B20-O02` | Chương V. Điện | FL-02 | hỗ trợ | Giải thích được một vài hiện tượng thực tế liên quan đến sự nhiễm điện do cơ xát. |
| `B21-O01` | Chương V. Điện | FL-01 | hỗ trợ | Nếu được định nghĩa dòng điện là dòng chuyển dồi có hướng của các hạt mang điện; phân loại được vật dẫn điện,  |
| `B21-O02` | Chương V. Điện | — | không cần Lab: khái niệm/ghi nhớ | Nếu được nguồn điện có khả năng cung cấp năng lượng điện và liệt kê được một số nguồn điện thông dụng trong đờ |
| `B22-O01` | Chương V. Điện | FL-01 | chính | Vẽ được sơ đồ mạch điện với các kí hiệu mô tả: điện trở, biến trở, chương điện, ampe kê, vốn kê, diốt và diốt  |
| `B22-O02` | Chương V. Điện | FL-01 | chính | Mắc được mạch điện đơn giản với: pin, công tắc, dây nổi, bóng đèn. |
| `B22-O03` | Chương V. Điện | — | không cần Lab: khái niệm/ghi nhớ | Mô tả được sơ lược công dụng của cấu chỉ, rôle, cấu dao tự động, chương điện. |
| `B23-O01` | Chương V. Điện | FL-01 | hỗ trợ | Thực hiện thí nghiệm để minh hoạ được các tác dụng cơ bản của dòng điện: nhiệt, phát sáng, hoá học, sinh lí. |
| `B24-O01` | Chương V. Điện | FL-01 | chính | Thực hiện thí nghiệm để nêu được số chỉ của ampe kế là giá trị của cường độ dòng điện. |
| `B24-O02` | Chương V. Điện | FL-01 | chính | Thực hiện thí nghiệm để nêu được khả năng sinh ra dòng điện của pin (hay acquy) được đo bằng hiệu điện thế (cò |
| `B24-O03` | Chương V. Điện | FL-01 | hỗ trợ | Nếu được đơn vị đo cường độ dòng điện và đơn vị đo hiệu điện thể. |
| `B25-O01` | Chương V. Điện | FL-01 | chính | Đo được cường độ dòng điện và hiệu điện thế bằng dụng cụ thực hành. |
| `B25-O02` | Chương V. Điện | FL-01 | chính | Vẽ được sơ đồ mạch điện với các kí hiệu mô tả ampe kế và vốn kế. |
| `B26-O01` | Chương VI. Nhiệt | FL-07 | hỗ trợ | Nêu được khái niệm năng lượng nhiệt; khái niệm nội năng. |
| `B26-O02` | Chương VI. Nhiệt | FL-07 | hỗ trợ | Nêu được: Khi một vật được làm nóng, các phân tử của vật chuyển động nhanh lên và nội năng của vật tăng. |
| `B27-O01` | Chương VI. Nhiệt | FL-07 | chính | Đo được năng lượng nhiệt mà vật nhận được khi bị đun nóng. |
| `B28-O01` | Chương VI. Nhiệt | FL-08 | chính | Lấy được ví dụ về hiện tượng dẫn nhiệt, đối lưu, bức xạ nhiệt và mô tả sơ lược sự truyền năng lượng trong mỗi  |
| `B28-O02` | Chương VI. Nhiệt | FL-08 | chính | Phân tích được một số ví dụ về công dụng của vật dẫn nhiệt tốt, công dụng của vật cách nhiệt tốt. |
| `B28-O03` | Chương VI. Nhiệt | FL-22 | chính | Mô tả được sự truyền năng lượng trong hiệu ứng nhà kính. |
| `B28-O04` | Chương VI. Nhiệt | FL-08 | hỗ trợ | Vận dụng kiến thức về sự truyền nhiệt giải thích một số hiện tượng đơn giản thường gặp. |
| `B29-O01` | Chương VI. Nhiệt | FL-09 | chính | Thực hiện thí nghiệm để chứng tỏ được các chất khác nhau nở vì nhiệt khác nhau. |
| `B29-O02` | Chương VI. Nhiệt | FL-09 | hỗ trợ | Lấy được một số ví dụ về công dụng và tác hại của sự nở vì nhiệt. |
| `B29-O03` | Chương VI. Nhiệt | FL-09 | hỗ trợ | Vận dụng kiến thức về sự nở vì nhiệt, giải thích một số hiện tượng đơn giản thường gặp trong thực tế. |
| `B30-O01` | Chương VII. Sinh học cơ thể ngườ | FL-16 | hỗ trợ | Nêu được tên và vai trò chính của các cơ quan, hệ cơ quan trong cơ thể người. |
| `B31-O01` | Chương VII. Sinh học cơ thể ngườ | FL-16 | hỗ trợ | Nêu được cấu tạo, chức năng và phân tích được sự phù hợp giữa cấu tạo với chức năng của hệ vận động. |
| `B31-O02` | Chương VII. Sinh học cơ thể ngườ | FL-06 | hỗ trợ | Mô tả được cấu tạo sơ lược các cơ quan của hệ vận động. Liên hệ được kiến thức đơn bảy vào hệ vận động. Giải t |
| `B31-O03` | Chương VII. Sinh học cơ thể ngườ | — | không cần Lab: sức khoẻ/hành vi | Trình bày được một số bệnh, tật và bệnh học đường liên quan đến hệ vận động. Nêu được biện pháp bảo vệ các cơ  |
| `B31-O04` | Chương VII. Sinh học cơ thể ngườ | — | không cần Lab: sức khoẻ/hành vi | Nêu được ý nghĩa của tập thể dục, thể thao và chọn phương pháp luyện tập thể thao phù hợp. Vận dụng hiểu biết  |
| `B32-O01` | Chương VII. Sinh học cơ thể ngườ | — | không cần Lab: khái niệm/ghi nhớ | Nêu được khái niệm dinh dưỡng, chất dinh dưỡng và mối quan hệ giữa tiêu hoá, dinh dưỡng. |
| `B32-O02` | Chương VII. Sinh học cơ thể ngườ | FL-16 | hỗ trợ | Trình bày được chức năng của hệ tiêu hoá; kể tên được các cơ quan của hệ tiêu hoá, nêu được chức năng của mối  |
| `B32-O03` | Chương VII. Sinh học cơ thể ngườ | FL-18 | chính | Trình bày được chế độ dinh dưỡng của con người ở các độ tuổi; nêu được nguyên tắc lập khẩu phần ăn cho con ngư |
| `B32-O04` | Chương VII. Sinh học cơ thể ngườ | — | không cần Lab: sức khoẻ/hành vi | Nêu được một số bệnh về đường tiêu hoá và cách phòng chống các bệnh đó; vận dụng để phòng chống các bệnh về ti |
| `B32-O05` | Chương VII. Sinh học cơ thể ngườ | — | không cần Lab: sức khoẻ/hành vi | Trình bày được một số vấn đề về an toàn thực phẩm. |
| `B32-O06` | Chương VII. Sinh học cơ thể ngườ | — | không cần Lab: sức khoẻ/hành vi | Vận dụng được hiểu biết về an toàn vệ sinh thực phẩm để để xuất các biện pháp lựa chọn, bảo quản, chế biến, ch |
| `B32-O07` | Chương VII. Sinh học cơ thể ngườ | — | không cần Lab: dự án/điều tra/thảo luận | Thực hiện được dự án điều tra về vệ sinh an toàn thực phẩm tại địa phương; dự án điều tra một số bệnh đường ti |
| `B33-O01` | Chương VII. Sinh học cơ thể ngườ | FL-17 | hỗ trợ | Nêu được chức năng của máu; nêu tên các thành phần của máu và chức năng của mỗi thành phần. |
| `B33-O02` | Chương VII. Sinh học cơ thể ngườ | FL-17 | hỗ trợ | Nêu được khái niệm nhóm máu; phân tích được vai trò của việc hiểu biết về nhóm máu trong thực tiễn. |
| `B33-O03` | Chương VII. Sinh học cơ thể ngườ | — | không cần Lab: khái niệm/ghi nhớ | Nêu được khái niệm miễn dịch, kháng nguyên, kháng thể; vai trò của vaccine và tiêm vaccine trong việc phòng bệ |
| `B33-O04` | Chương VII. Sinh học cơ thể ngườ | — | không cần Lab: sức khoẻ/hành vi | Nếu được một số bệnh về máu, tìm mạch và cách phòng chống; vận dụng được hiểu biết về máu và tuần hoàn để bảo  |
| `B33-O05` | Chương VII. Sinh học cơ thể ngườ | FL-17 | chính | Kế tên được các cơ quan của hệ tuần hoàn; nêu được chức năng của mối cơ quan và sự phối hợp các cơ quan thể hi |
| `B33-O06` | Chương VII. Sinh học cơ thể ngườ | — | không cần Lab: thực hành thật/video phù hợp hơn | Thực hiện được tình hướng giả định cấp cứu người bị chảy máu, tai biến, đột quy; bằng bó vết thương khi bị chả |
| `B33-O07` | Chương VII. Sinh học cơ thể ngườ | — | không cần Lab: dự án/điều tra/thảo luận | Thực hiện được dự án, bài tập: Điều tra một số bệnh liên quan đến máu và hệ tuần hoàn; tìm hiểu được phong trà |
| `B34-O01` | Chương VII. Sinh học cơ thể ngườ | FL-17 | chính | Nêu được cấu tạo và chức năng của hệ hô hấp; nêu được chức năng của mối cơ quan và sự phối hợp các cơ quan thể |
| `B34-O02` | Chương VII. Sinh học cơ thể ngườ | — | không cần Lab: sức khoẻ/hành vi | Nêu được một số bệnh về phối, đường hô hấp và cách phòng chống bệnh; vận dụng được hiểu biết về hô hấp để bảo  |
| `B34-O03` | Chương VII. Sinh học cơ thể ngườ | — | không cần Lab: sức khoẻ/hành vi | Trình bày được vai trò của việc chống ô nhiễm không khí liên quan đến các bệnh về hô hấp. |
| `B34-O04` | Chương VII. Sinh học cơ thể ngườ | — | không cần Lab: dự án/điều tra/thảo luận | Điều tra được một số bệnh về đường hô hấp trong trường học hoặc tại địa phương, nêu được nguyên nhân và cách p |
| `B34-O05` | Chương VII. Sinh học cơ thể ngườ | — | không cần Lab: thực hành thật/video phù hợp hơn | Thực hiện được tình huống giả định hô hấp nhân tạo, cấp cứu người đuôi nước; thiết kế được áp phích tuyên truy |
| `B35-O01` | Chương VII. Sinh học cơ thể ngườ | FL-16 | hỗ trợ | Nêu được chức năng của hệ bài tiết; kể tên được các cơ quan của hệ bài tiết nước tiểu và các bộ phận chủ yếu c |
| `B35-O02` | Chương VII. Sinh học cơ thể ngườ | — | không cần Lab: sức khoẻ/hành vi | Trình bày được một số bệnh về hệ bài tiết và cách phòng chống bệnh; vận dụng kiến thức về hệ bài tiết để bảo v |
| `B35-O03` | Chương VII. Sinh học cơ thể ngườ | — | không cần Lab: ứng dụng/đọc hiểu | Tím hiểu được một số thành tựu: ghép thận, chạy thận nhân tạo. |
| `B35-O04` | Chương VII. Sinh học cơ thể ngườ | — | không cần Lab: dự án/điều tra/thảo luận | Thực hiện được dự án, bài tập: Điều tra bệnh về thận như sỏi thận, viêm thận,... trong trường học hoặc địa phư |
| `B36-O01` | Chương VII. Sinh học cơ thể ngườ | FL-19 | hỗ trợ | Nêu được khái niệm môi trường trong của cơ thể. |
| `B36-O02` | Chương VII. Sinh học cơ thể ngườ | FL-19 | hỗ trợ | Nêu được khái niệm cân bằng môi trường trong và vai trò của sự duy trì ổn định môi trường trong của cơ thể (ví |
| `B36-O03` | Chương VII. Sinh học cơ thể ngườ | — | không cần Lab: ứng dụng/đọc hiểu | Đọc và hiểu được thông tin một ví dụ cụ thể về kết quả xét nghiệm nông độ glucose và uric acid trong máu. |
| `B37-O01` | Chương VII. Sinh học cơ thể ngườ | FL-16 | hỗ trợ | Nêu được cấu tạo và chức năng của hệ thần kinh; nêu được chức năng của các giác quan, giác quan thị giác và th |
| `B37-O02` | Chương VII. Sinh học cơ thể ngườ | — | không cần Lab: sức khoẻ/hành vi | Trình bày được một số bệnh về hệ thần kinh và cách phòng chống các bệnh đó. |
| `B37-O03` | Chương VII. Sinh học cơ thể ngườ | — | không cần Lab: sức khoẻ/hành vi | Nếu được tác hại của các chất gây nghiên đối với hệ thần kinh; không sử dụng các chất gây nghiên và tuyên truy |
| `B37-O04` | Chương VII. Sinh học cơ thể ngườ | FL-16 | chính | Kế tên được các bộ phận của mắt và sơ đồ đơn giản quá trình thu nhận ánh sáng; liên hệ được kiến thức truyền á |
| `B37-O05` | Chương VII. Sinh học cơ thể ngườ | FL-16 | chính | Kể tên được các bộ phận của tai và sơ đồ đơn giản quá trình thu nhận âm thanh; liên hệ được cơ chế truyền âm t |
| `B37-O06` | Chương VII. Sinh học cơ thể ngườ | — | không cần Lab: sức khoẻ/hành vi | Trình bày được một số bệnh về thị giác, thính giác, cách phòng chống các bệnh đó; vận dụng để bảo vệ bản thân  |
| `B37-O07` | Chương VII. Sinh học cơ thể ngườ | — | không cần Lab: dự án/điều tra/thảo luận | Tìm hiểu được các bệnh và tật về mắt trong trường học, tuyên truyền chăm sóc và bảo vệ đôi mắt. |
| `B38-O01` | Chương VII. Sinh học cơ thể ngườ | FL-16 | hỗ trợ | Kế được tên và nêu được chức năng của các tuyến nội tiết. |
| `B38-O02` | Chương VII. Sinh học cơ thể ngườ | — | không cần Lab: sức khoẻ/hành vi | Nêu được một số bệnh liên quan đến hệ nội tiết và cách phòng chống các bệnh đó; vận dụng được hiểu biết về các |
| `B38-O03` | Chương VII. Sinh học cơ thể ngườ | — | không cần Lab: dự án/điều tra/thảo luận | Tím hiểu được các bệnh nội tiết ở địa phương (tiểu đường, buóu cổ do thiếu iodine,...). |
| `B39-O01` | Chương VII. Sinh học cơ thể ngườ | FL-16 | hỗ trợ | Nêu được cấu tạo sơ lược và chức năng của da. |
| `B39-O02` | Chương VII. Sinh học cơ thể ngườ | — | không cần Lab: sức khoẻ/hành vi | Trình bày được một số bệnh về da và các biện pháp chăm sóc, bảo vệ, làm đẹp da an toàn; vận dụng được hiểu biế |
| `B39-O03` | Chương VII. Sinh học cơ thể ngườ | — | không cần Lab: dự án/điều tra/thảo luận | Tím hiểu được một số thành tựu ghép da trong y học, các bệnh về da trong trường học hoặc trong khu dân cư. |
| `B39-O04` | Chương VII. Sinh học cơ thể ngườ | — | không cần Lab: thực hành thật/video phù hợp hơn | Nêu được khái niệm thân nhiệt; thực hành được cách đo thân nhiệt và nêu được ý nghĩa của việc đo thân nhiệt. |
| `B39-O05` | Chương VII. Sinh học cơ thể ngườ | FL-19 | chính | Nêu được vai trò và cơ chế duy trì thân nhiệt ổn định ở người; vai trò của da và hệ thần kinh trong điều hoà t |
| `B39-O06` | Chương VII. Sinh học cơ thể ngườ | — | không cần Lab: sức khoẻ/hành vi | Trình bày được một số phương pháp chống nóng, lạnh cho cơ thể; nêu được một số biện pháp chống cảm lạnh, cảm n |
| `B40-O01` | Chương VII. Sinh học cơ thể ngườ | — | không cần Lab: nhạy cảm/an toàn trẻ em | Nếu được chức năng của hệ sinh dục; kể tên và trình bày được chức năng của các cơ quan sinh dục nam, cơ quan s |
| `B40-O02` | Chương VII. Sinh học cơ thể ngườ | — | không cần Lab: nhạy cảm/an toàn trẻ em | Nêu được khái niệm thụ tỉnh và thụ thai; nêu được hiện tượng kinh nguyệt và cách phòng tránh thai. |
| `B40-O03` | Chương VII. Sinh học cơ thể ngườ | — | không cần Lab: nhạy cảm/an toàn trẻ em | Kế tên và trình bày được cách phòng chống một số bệnh lây truyền qua đường sinh dục. |
| `B40-O04` | Chương VII. Sinh học cơ thể ngườ | — | không cần Lab: nhạy cảm/an toàn trẻ em | Nếu được ý nghĩa và các biện pháp bảo vệ sức khoẻ sinh sản vị thành niên; vận dụng được hiểu biết về sinh sản  |
| `B40-O05` | Chương VII. Sinh học cơ thể ngườ | — | không cần Lab: nhạy cảm/an toàn trẻ em | Điều tra được sự hiểu biết của học sinh trong trường học về sức khoẻ sinh sản vị thành niên (an toàn tình dục) |
| `B41-O01` | Chương VIII. Sinh vật và môi trư | — | không cần Lab: khái niệm/ghi nhớ | Nêu được khái niệm môi trường sống của sinh vật; phân biệt được bốn loại môi trường sống chủ yếu và lấy được v |
| `B41-O02` | Chương VIII. Sinh vật và môi trư | FL-20 | hỗ trợ | Nêu được khái niệm nhân tố sinh thái; phân biệt được nhân tố vô sinh và hữu sinh; lấy được ví dụ minh hoạ các  |
| `B41-O03` | Chương VIII. Sinh vật và môi trư | FL-20 | chính | Trình bày được khái niệm và lấy được ví dụ về giới hạn sinh thái. |
| `B42-O01` | Chương VIII. Sinh vật và môi trư | — | không cần Lab: khái niệm/ghi nhớ | Phát biểu được khái niệm quản thể sinh vật. |
| `B42-O02` | Chương VIII. Sinh vật và môi trư | FL-20 | chính | Nêu được các đặc trưng cơ bản của quản thể sinh vật và lấy được ví dụ minh hoạ. |
| `B42-O03` | Chương VIII. Sinh vật và môi trư | — | không cần Lab: ứng dụng/đọc hiểu | Nêu được một số biện pháp bảo vệ quản thể. |
| `B43-O01` | Chương VIII. Sinh vật và môi trư | — | không cần Lab: khái niệm/ghi nhớ | Phát biểu được khái niệm quân xã sinh vật. |
| `B43-O02` | Chương VIII. Sinh vật và môi trư | FL-21 | hỗ trợ | Nêu được một số đặc trưng cơ bản của quản xã. Lấy được ví dụ minh hoạ. |
| `B43-O03` | Chương VIII. Sinh vật và môi trư | — | không cần Lab: ứng dụng/đọc hiểu | Nếu được một số biện pháp bảo vệ đa dạng sinh học trong quân xã. |
| `B44-O01` | Chương VIII. Sinh vật và môi trư | — | không cần Lab: khái niệm/ghi nhớ | Phát biểu được khái niệm hệ sinh thái. Lấy được ví dụ về các kiểu hệ sinh thái. |
| `B44-O02` | Chương VIII. Sinh vật và môi trư | FL-21 | chính | Nêu được khái niệm chuỗi, lưới thức ăn; sinh vật sản xuất, sinh vật tiêu thụ, sinh vật phân giải, thấp sinh th |
| `B44-O03` | Chương VIII. Sinh vật và môi trư | FL-21 | chính | Trình bày được khái quát quá trình trao đổi chất và chuyển hoá năng lượng trong hệ sinh thái. |
| `B44-O04` | Chương VIII. Sinh vật và môi trư | — | không cần Lab: ứng dụng/đọc hiểu | Nêu được tấm quan trọng của việc bảo vệ một số hệ sinh thái diễn hình tại Việt Nam. |
| `B45-O01` | Chương VIII. Sinh vật và môi trư | — | không cần Lab: khái niệm/ghi nhớ | Nêu được khái niệm sinh quyền. |
| `B45-O02` | Chương VIII. Sinh vật và môi trư | — | không cần Lab: khái niệm/ghi nhớ | Nhận biết được các khu sinh học trên Trái Đất. |
| `B46-O01` | Chương VIII. Sinh vật và môi trư | FL-21 | hỗ trợ | Nêu được khái niệm cân bằng tự nhiên. |
| `B46-O02` | Chương VIII. Sinh vật và môi trư | FL-21 | chính | Trình bày được các nguyên nhân gây mất cân bằng tự nhiên. |
| `B46-O03` | Chương VIII. Sinh vật và môi trư | FL-21 | hỗ trợ | Phân tích được một số biện pháp bảo vệ, duy trì cân bằng tự nhiên. |
| `B47-O01` | Chương VIII. Sinh vật và môi trư | — | không cần Lab: ứng dụng/đọc hiểu | Trình bày được tác động của con người đối với môi trường qua các thời kì phát triển xã hội; tác động của con n |
| `B47-O02` | Chương VIII. Sinh vật và môi trư | — | không cần Lab: ứng dụng/đọc hiểu | Nêu được khái niệm ô nhiễm môi trường. Trình bày được một số nguyên nhân và biện pháp hạn chế ô nhiễm môi trườ |
| `B47-O03` | Chương VIII. Sinh vật và môi trư | FL-22 | hỗ trợ | Nêu được khái niệm khái quát về biến đổi khí hậu và biện pháp thích ứng. |
| `B47-O04` | Chương VIII. Sinh vật và môi trư | — | không cần Lab: ứng dụng/đọc hiểu | Trình bày được sự cần thiết phải bảo vệ động vật hoang đã có nguy cơ tuyệt chủng. |
| `B47-O05` | Chương VIII. Sinh vật và môi trư | — | không cần Lab: dự án/điều tra/thảo luận | Điều tra được hiện trạng ô nhiễm môi trường ở địa phương. |

### KHTN 9

| Outcome | Chương | Lab | Vai trò | Statement (rút gọn) |
|---|---|---|---|---|
| `9/anh-sang/1` | Ánh sáng | FL-23 | chính | Thực hiện được thí nghiệm để rút ra và phát biểu được định luật khúc xạ ánh sáng. |
| `9/anh-sang/10` | Ánh sáng | FL-23 | chính | Vẽ được sơ đồ tỉ lệ để giải các bài tập đơn giản về thấu kính hội tụ. |
| `9/anh-sang/2` | Ánh sáng | FL-23 | chính | Nêu được chiết suất có giá trị bằng tỉ số tốc độ ánh sáng trong không khí (hoặc chân không) với tốc độ ánh sán |
| `9/anh-sang/3` | Ánh sáng | FL-23 | chính | Thực hiện thí nghiệm để rút ra được điều kiện xảy ra phản xạ toàn phần và xác định được góc tới hạn. |
| `9/anh-sang/4` | Ánh sáng | FL-23 | chính | Vẽ được sơ đồ đường truyền của tia sáng qua lăng kính. |
| `9/anh-sang/5` | Ánh sáng | FL-23 | hỗ trợ | Giải thích được một cách định tính sự tán sắc ánh sáng Mặt Trời qua lăng kính. |
| `9/anh-sang/6` | Ánh sáng | FL-23 | hỗ trợ | Nêu được các khái niệm: quang tâm, trục chính, tiêu điểm chính và tiêu cự của thấu kính. |
| `9/anh-sang/7` | Ánh sáng | FL-23 | chính | Vẽ được ảnh qua thấu kính. |
| `9/anh-sang/8` | Ánh sáng | FL-23 | chính | Đo được tiêu cự của thấu kính hội tụ bằng dụng cụ thực hành. |
| `9/anh-sang/9` | Ánh sáng | FL-23 | chính | Mô tả được cấu tạo và sử dụng được kính lúp. |
| `9/di-truyen-hoc-voi-con-nguoi/1` | Di truyền học với con người | FL-26 | hỗ trợ | Nêu được một số ví dụ về tính trạng ở người. |
| `9/di-truyen-hoc-voi-con-nguoi/2` | Di truyền học với con người | — | không cần Lab: khái niệm/ghi nhớ | Nêu được khái niệm về bệnh và tật di truyền ở người. |
| `9/di-truyen-hoc-voi-con-nguoi/3` | Di truyền học với con người | — | không cần Lab: nhạy cảm/an toàn trẻ em | Nêu được vai trò của di truyền học với hôn nhân và trình bày được quan điểm về lựa chọn giới tính trong sinh s |
| `9/di-truyen-nhiem-sac-the/1` | Di truyền nhiễm sắc thể | FL-28 | chính | Phân biệt được nguyên phân và giảm phân; nêu được ý nghĩa của nguyên phân, giảm phân trong di truyền và mối qu |
| `9/di-truyen-nhiem-sac-the/2` | Di truyền nhiễm sắc thể | — | không cần Lab: ứng dụng/đọc hiểu | Trình bày được các ứng dụng và lấy được ví dụ của nguyên phân và giảm phân trong thực tiễn. |
| `9/di-truyen-nhiem-sac-the/3` | Di truyền nhiễm sắc thể | FL-28 | hỗ trợ | Nêu khái niệm nhiễm sắc thể giới tính và nhiễm sắc thể thường. |
| `9/di-truyen-nhiem-sac-the/4` | Di truyền nhiễm sắc thể | FL-26 | chính | Trình bày được cơ chế xác định giới tính. |
| `9/di-truyen-nhiem-sac-the/5` | Di truyền nhiễm sắc thể | FL-26 | chính | Dựa vào sơ đồ phép lai trình bày được khái niệm di truyền liên kết và phân biệt với quy luật phân li độc lập. |
| `9/dien-tu/1` | Điện từ | FL-25 | chính | Thực hiện thí nghiệm để nêu được nguyên tắc tạo ra dòng điện xoay chiều (dòng điện luân – Tác dụng của dòng đi |
| `9/dien-tu/2` | Điện từ | FL-25 | hỗ trợ | Lấy được ví dụ chứng tỏ dòng điện xoay chiều có tác dụng nhiệt, phát sáng, tác dụng từ, tác dụng sinh lí. |
| `9/dien/1` | Điện | FL-01 | chính | Thực hiện thí nghiệm đơn giản để nêu được điện trở có tác dụng cản trở dòng điện trong mạch. |
| `9/dien/2` | Điện | FL-01 | chính | Thực hiện thí nghiệm để xây dựng được định luật Ohm: cường độ dòng điện đi qua một đoạn dây dẫn tỉ lệ thuận vớ |
| `9/dien/3` | Điện | FL-01 | chính | Thực hiện thí nghiệm để rút ra được: Trong đoạn mạch điện mắc nối tiếp, cường độ dòng điện là như nhau cho mọi |
| `9/dien/4` | Điện | FL-01 | chính | Tính được cường độ dòng điện trong đoạn mạch một chiều mắc nối tiếp, mắc song song, trong một số trường hợp đơ |
| `9/dien/5` | Điện | FL-01 | hỗ trợ | Nêu được công suất điện định mức của dụng cụ điện (công suất mà dụng cụ tiêu thụ khi hoạt động bình thường). |
| `9/dien/6` | Điện | FL-01 | chính | Tính được năng lượng của dòng điện và công suất điện trong trường hợp đơn giản. |
| `9/ethylic-alcohol-va-acetic/1` | Ethylic alcohol và acetic acid | FL-30 | chính | Viết được công thức phân tử, công thức cấu tạo và nêu được đặc điểm cấu tạo của ethylic alcohol. |
| `9/ethylic-alcohol-va-acetic/2` | Ethylic alcohol và acetic acid | FL-11 | hỗ trợ | Nêu được khái niệm và ý nghĩa của độ cồn. |
| `9/ethylic-alcohol-va-acetic/3` | Ethylic alcohol và acetic acid | — | không cần Lab: khái niệm/ghi nhớ | Trình bày được phương pháp điều chế acetic acid bằng cách lên men ethylic alcohol. |
| `9/ethylic-alcohol-va-acetic/4` | Ethylic alcohol và acetic acid | FL-30 | hỗ trợ | Nêu được khái niệm ester và phản ứng ester hoá. |
| `9/gioi-thieu-ve-chat-huu-co/1` | Giới thiệu về chất hữu cơ | FL-30 | hỗ trợ | Nêu được khái niệm hợp chất hữu cơ, hoá học hữu cơ. |
| `9/gioi-thieu-ve-chat-huu-co/2` | Giới thiệu về chất hữu cơ | FL-30 | hỗ trợ | Trình bày được sự phân loại sơ bộ hợp chất hữu cơ gồm hydrocarbon (hiđrocacbon) và dẫn xuất của hydrocarbon. |
| `9/hien-tuong-di-truyen-mendel/1` | Hiện tượng di truyền (Mendel và  | FL-26 | chính | Dựa vào công thức lai 1 cặp tính trạng và kết quả lai trong thí nghiệm của Mendel, phát biểu được quy luật phâ |
| `9/hien-tuong-di-truyen-mendel/2` | Hiện tượng di truyền (Mendel và  | FL-26 | chính | Dựa vào công thức lai 2 cặp tính trạng và kết quả lai trong thí nghiệm của Mendel, phát biểu được quy luật phâ |
| `9/hien-tuong-di-truyen/1` | Hiện tượng di truyền | — | không cần Lab: khái niệm/ghi nhớ | Nêu được khái niệm di truyền, khái niệm biến dị. |
| `9/hien-tuong-di-truyen/2` | Hiện tượng di truyền | FL-27 | hỗ trợ | Nêu được gene quy định di truyền và biến dị ở sinh vật, qua đó gene được xem là trung tâm – Gene của di truyền |
| `9/hydrocarbon-va-nguon-nhien/1` | Hydrocarbon và nguồn nhiên liệu | FL-30 | chính | Nêu được khái niệm hydrocarbon, alkane. |
| `9/hydrocarbon-va-nguon-nhien/2` | Hydrocarbon và nguồn nhiên liệu | FL-10 | chính | Viết được phương trình hoá học phản ứng đốt cháy của butane. |
| `9/hydrocarbon-va-nguon-nhien/3` | Hydrocarbon và nguồn nhiên liệu | FL-30 | chính | Nêu được khái niệm về alkene. |
| `9/hydrocarbon-va-nguon-nhien/4` | Hydrocarbon và nguồn nhiên liệu | — | không cần Lab: ứng dụng/đọc hiểu | Trình bày được một số ứng dụng của ethylene: tổng hợp ethylic alcohol, tổng hợp nhựa polyethylene (PE). |
| `9/hydrocarbon-va-nguon-nhien/5` | Hydrocarbon và nguồn nhiên liệu | — | không cần Lab: khái niệm/ghi nhớ | Nêu được khái niệm, thành phần, trạng thái tự nhiên của dầu mỏ, khí thiên nhiên và khí mỏ dầu. |
| `9/hydrocarbon-va-nguon-nhien/6` | Hydrocarbon và nguồn nhiên liệu | — | không cần Lab: khái niệm/ghi nhớ | Nêu được khái niệm về nhiên liệu, các dạng nhiên liệu phổ biến (rắn, lỏng, khí). |
| `9/khai-thac-tai-nguyen-tu-vo/1` | Khai thác tài nguyên từ vỏ Trái  | — | không cần Lab: khái niệm/ghi nhớ | Nêu được hàm lượng các nguyên tố hoá học chủ yếu trong vỏ Trái Đất. |
| `9/khai-thac-tai-nguyen-tu-vo/2` | Khai thác tài nguyên từ vỏ Trái  | — | không cần Lab: khái niệm/ghi nhớ | Phân loại được các dạng chất chủ yếu trong vỏ Trái Đất (oxide, muối, ...). |
| `9/khai-thac-tai-nguyen-tu-vo/3` | Khai thác tài nguyên từ vỏ Trái  | — | không cần Lab: dự án/điều tra/thảo luận | Trình bày được những lợi ích cơ bản về kinh tế, xã hội từ việc khai thác vỏ Trái Đất (nhiên liệu, vật liệu, ng |
| `9/khai-thac-tai-nguyen-tu-vo/4` | Khai thác tài nguyên từ vỏ Trái  | FL-10 | hỗ trợ | Trình bày được nguồn đá vôi, thành phần chính của đá vôi trong tự nhiên; các ứng dụng từ đá vôi: sản phẩm đá v |
| `9/khai-thac-tai-nguyen-tu-vo/5` | Khai thác tài nguyên từ vỏ Trái  | — | không cần Lab: khái niệm/ghi nhớ | Trình bày được sơ lược ngành công nghiệp silicate. |
| `9/khai-thac-tai-nguyen-tu-vo/6` | Khai thác tài nguyên từ vỏ Trái  | — | không cần Lab: khái niệm/ghi nhớ | Mô tả được các công đoạn chính sản xuất đồ gốm, thuỷ tinh, xi măng. |
| `9/khai-thac-tai-nguyen-tu-vo/7` | Khai thác tài nguyên từ vỏ Trái  | FL-22 | hỗ trợ | Nêu được khái niệm nhiên liệu hoá thạch. |
| `9/khai-thac-tai-nguyen-tu-vo/8` | Khai thác tài nguyên từ vỏ Trái  | FL-22 | chính | Nêu được khí carbon dioxide và methane là nguyên nhân chính gây hiệu ứng nhà kính, sự ấm lên toàn cầu |
| `9/kim-loai/1` | Kim loại | — | không cần Lab: khái niệm/ghi nhớ | Nêu được tính chất vật lí của kim loại. |
| `9/kim-loai/2` | Kim loại | FL-14 | chính | Trình bày được tính chất hoá học cơ bản của kim loại: Tác dụng với phi kim (oxygen, lưu huỳnh, chlorine), nước |
| `9/kim-loai/3` | Kim loại | FL-14 | chính | Nêu được dãy hoạt động hoá học (K, Na, Ca, Mg, Al, Zn, Fe, Pb, H, Cu, Ag, Au). |
| `9/kim-loai/4` | Kim loại | FL-14 | chính | Trình bày được ý nghĩa của dãy hoạt động hoá học. |
| `9/kim-loai/5` | Kim loại | FL-14 | hỗ trợ | Nêu được phương pháp tách kim loại theo mức độ hoạt động hoá học của chúng. |
| `9/kim-loai/6` | Kim loại | — | không cần Lab: khái niệm/ghi nhớ | Nêu được khái niệm hợp kim. |
| `9/kim-loai/7` | Kim loại | — | không cần Lab: khái niệm/ghi nhớ | Trình bày được các giai đoạn cơ bản sản xuất gang và thép trong lò cao từ nguồn quặng chứa iron (III) oxide. |
| `9/lipid-carbohydrate-protein/1` | Lipid – Carbohydrate – Protein;  | FL-30 | hỗ trợ | Nêu được khái niệm lipid, khái niệm chất béo, trạng thái thiên nhiên, công thức tổng quát của chất béo đơn giả |
| `9/lipid-carbohydrate-protein/10` | Lipid – Carbohydrate – Protein;  | FL-30 | chính | Viết được các phương trình hoá học của phản ứng điều chế PE, PP từ các monomer. |
| `9/lipid-carbohydrate-protein/2` | Lipid – Carbohydrate – Protein;  | — | không cần Lab: khái niệm/ghi nhớ | Nêu được vai trò của lipid tham gia vào cấu tạo tế bào và tích lũy năng lượng trong cơ thể. |
| `9/lipid-carbohydrate-protein/3` | Lipid – Carbohydrate – Protein;  | — | không cần Lab: khái niệm/ghi nhớ | Nêu được thành phần nguyên tố, công thức chung của carbohydrate. |
| `9/lipid-carbohydrate-protein/4` | Lipid – Carbohydrate – Protein;  | — | không cần Lab: khái niệm/ghi nhớ | Trình bày được tính chất hoá học của glucose (phản ứng tráng bạc, phản ứng lên men rượu), của saccharose (phản |
| `9/lipid-carbohydrate-protein/5` | Lipid – Carbohydrate – Protein;  | — | không cần Lab: khái niệm/ghi nhớ | Nêu được trạng thái tự nhiên, tính chất vật lí của tinh bột và cellulose. |
| `9/lipid-carbohydrate-protein/6` | Lipid – Carbohydrate – Protein;  | — | không cần Lab: khái niệm/ghi nhớ | Nêu được tầm quan trọng của sự tạo thành tinh bột, cellulose trong cây xanh. |
| `9/lipid-carbohydrate-protein/7` | Lipid – Carbohydrate – Protein;  | FL-30 | hỗ trợ | Nêu được khái niệm, đặc điểm cấu tạo phân tử (do nhiều amino acid tạo nên, liên kết peptit) và khối lượng phân |
| `9/lipid-carbohydrate-protein/8` | Lipid – Carbohydrate – Protein;  | — | không cần Lab: khái niệm/ghi nhớ | Trình bày được vai trò của protein đối với cơ thể con người. |
| `9/lipid-carbohydrate-protein/9` | Lipid – Carbohydrate – Protein;  | FL-30 | chính | Nêu được khái niệm polymer, monomer, mắt xích..., cấu tạo, phân loại polymer (polymer thiên nhiên và polymer t |
| `9/mo-dau/1` | Mở đầu | FL-15 | hỗ trợ | Nhận biết được một số dụng cụ và hoá chất sử dụng trong dạy học môn Khoa học tự nhiên 9. |
| `9/mo-dau/2` | Mở đầu | — | không cần Lab: dự án/điều tra/thảo luận | Trình bày được các bước viết và trình bày báo cáo; làm được bài thuyết trình một vấn đề khoa học. |
| `9/nang-luong-co-hoc/1` | Năng lượng cơ học | FL-24 | chính | Viết được biểu thức tính động năng của vật. |
| `9/nang-luong-co-hoc/2` | Năng lượng cơ học | FL-24 | chính | Viết được biểu thức tính thế năng của vật ở gần mặt đất. |
| `9/nang-luong-co-hoc/3` | Năng lượng cơ học | FL-24 | hỗ trợ | Nêu được cơ năng là tổng động năng và thế năng của vật. |
| `9/nang-luong-co-hoc/4` | Năng lượng cơ học | FL-24 | chính | Vận dụng khái niệm cơ năng phân tích được sự chuyển hoá năng lượng trong một số trường hợp đơn giản. |
| `9/nang-luong-co-hoc/5` | Năng lượng cơ học | FL-24 | chính | Phân tích ví dụ cụ thể để rút ra được: công có giá trị bằng lực nhân với quãng đường dịch chuyển theo hướng củ |
| `9/nang-luong-co-hoc/6` | Năng lượng cơ học | FL-24 | chính | Tính được công và công suất trong một số trường hợp đơn giản. |
| `9/nang-luong-voi-cuoc-song/1` | Năng lượng với cuộc sống | FL-22 | hỗ trợ | Nêu được sơ lược ưu điểm và nhược điểm của năng lượng hoá thạch. |
| `9/nang-luong-voi-cuoc-song/2` | Năng lượng với cuộc sống | FL-22 | hỗ trợ | Lấy được ví dụ chứng tỏ việc đốt cháy các nhiên liệu hoá thạch có thể gây ô nhiễm môi trường. |
| `9/nang-luong-voi-cuoc-song/3` | Năng lượng với cuộc sống | — | không cần Lab: dự án/điều tra/thảo luận | Nêu được sơ lược ưu điểm và nhược điểm của một số dạng năng lượng tái tạo (năng lượng Mặt Trời, năng lượng từ  |
| `9/nang-luong-voi-cuoc-song/4` | Năng lượng với cuộc sống | — | không cần Lab: dự án/điều tra/thảo luận | Thảo luận để nêu được một số biện pháp sử dụng hiệu quả năng lượng và bảo vệ môi trường. |
| `9/nhiem-sac-the/1` | Nhiễm sắc thể | FL-28 | hỗ trợ | Nêu được khái niệm nhiễm sắc thể. |
| `9/nhiem-sac-the/2` | Nhiễm sắc thể | FL-28 | chính | Phân biệt được bộ nhiễm sắc thể lưỡng bội, đơn bội. |
| `9/nhiem-sac-the/3` | Nhiễm sắc thể | FL-28 | hỗ trợ | Nêu được khái niệm đột biến nhiễm sắc thể. |
| `9/su-khac-nhau-co-ban-giua-phi/1` | Sự khác nhau cơ bản giữa phi kim | — | không cần Lab: khái niệm/ghi nhớ | Nêu được ứng dụng của một số đơn chất phi kim thiết thực trong cuộc sống (than, lưu phi kim và kim loại huỳnh, |
| `9/su-khac-nhau-co-ban-giua-phi/2` | Sự khác nhau cơ bản giữa phi kim | — | không cần Lab: khái niệm/ghi nhớ | Chỉ ra được sự khác nhau cơ bản về một số tính chất giữa phi kim và kim loại: Khả năng dẫn điện, nhiệt độ nóng |
| `9/tien-hoa/1` | Tiến hoá | FL-29 | hỗ trợ | Phát biểu được khái niệm tiến hoá. |
| `9/tien-hoa/2` | Tiến hoá | FL-29 | chính | Phát biểu được khái niệm chọn lọc nhân tạo. |
| `9/tien-hoa/3` | Tiến hoá | FL-29 | chính | Phát biểu được khái niệm chọn lọc tự nhiên. |
| `9/tien-hoa/4` | Tiến hoá | — | không cần Lab: khái niệm/ghi nhớ | Nêu được quan điểm của Lamark về cơ chế tiến hoá. |
| `9/tien-hoa/5` | Tiến hoá | FL-29 | hỗ trợ | Trình bày được quan điểm của Darwin về cơ chế tiến hoá. |
| `9/tien-hoa/6` | Tiến hoá | FL-29 | chính | Trình bày được một số luận điểm về tiến hoá theo quan niệm của thuyết tiến hoá tổng hợp hiện đại (cụ thể: nguồ |
| `9/tien-hoa/7` | Tiến hoá | — | không cần Lab: khái niệm/ghi nhớ | Dựa vào sơ đồ, trình bày được khái quát sự phát triển của thế giới sinh vật trên Trái Đất; sự sống trên Trái Đ |
| `9/tien-hoa/8` | Tiến hoá | — | không cần Lab: khái niệm/ghi nhớ | Dựa vào sơ đồ, trình bày được khái quát sự hình thành loài người. |
| `9/tu-gene-den-protein/1` | Từ gene đến protein | — | không cần Lab: khái niệm/ghi nhớ | Nêu được khái niệm nucleic acid. |
| `9/tu-gene-den-protein/2` | Từ gene đến protein | FL-27 | chính | Thông qua hình ảnh, mô tả được DNA có cấu trúc xoắn kép, gồm các đơn phân là 4 loại nucleotide, các nucleotide |
| `9/tu-gene-den-protein/3` | Từ gene đến protein | — | không cần Lab: khái niệm/ghi nhớ | Nêu được khái niệm gene. |
| `9/tu-gene-den-protein/4` | Từ gene đến protein | FL-27 | chính | Quan sát hình ảnh (hoặc sơ đồ), mô tả sơ lược quá trình tái bản của DNA gồm các giai đoạn: tháo xoắn tách hai  |
| `9/tu-gene-den-protein/5` | Từ gene đến protein | FL-27 | chính | Dựa vào sơ đồ, hình ảnh quá trình phiên mã, nêu được khái niệm phiên mã. |
| `9/tu-gene-den-protein/6` | Từ gene đến protein | FL-27 | chính | Nêu được khái niệm mã di truyền, giải thích được từ 4 loại nucleotide tạo ra được sự đa dạng của mã di truyền; |
| `9/tu-gene-den-protein/7` | Từ gene đến protein | FL-27 | chính | Dựa vào sơ đồ, nêu được mối quan hệ giữa DNA – RNA – protein – tính trạng thông qua phiên mã, dịch mã và ý ngh |
| `9/tu-gene-den-protein/8` | Từ gene đến protein | FL-27 | hỗ trợ | Phát biểu được khái niệm đột biến gene. |
| `9/ung-dung-cong-nghe-di-truyen/1` | Ứng dụng công nghệ di truyền vào | — | không cần Lab: khái niệm/ghi nhớ | Nêu được một số ứng dụng công nghệ di truyền trong y học, pháp y, làm sạch môi trường, truyền vào đời sống nôn |
| `9/ung-dung-cong-nghe-di-truyen/2` | Ứng dụng công nghệ di truyền vào | — | không cần Lab: nhạy cảm/an toàn trẻ em | Nêu được một số vấn đề về đạo đức sinh học trong nghiên cứu và ứng dụng công nghệ di truyền. |
