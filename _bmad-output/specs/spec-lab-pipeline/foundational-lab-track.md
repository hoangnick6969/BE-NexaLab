# Foundational Lab Track

## 1. Outcome Register (stage 1)

Proposed fields. These build on `CurriculumOutcome`, which already has `code`, `statement`, `sourceEvidence`, `synthetic`, `status` (`prisma/schema.prisma:337-351`).

| Field | Rule |
|---|---|
| `code` | Stable. Official code when the authority document provides one. Otherwise `KHTN8-Bxx-Oyy` is a **proposal handle** |
| `statement` | Exact text from the authority document, or marked `paraphrase` |
| `authority` | Identity and version of the official program document (open decision C-1) |
| `sourceEvidence[]` | Edition, sha256, physical page, printed page label, block ID, origin type (`OFFICIAL`, `SGK`, `SGV`, `SBT`, `NEXALAB`) |
| `reviewState` | `PROPOSED` → `REVIEWED` → `ACTIVE` / `ARCHIVED`. `ACTIVE` requires a curriculum `ReviewReceipt` |
| `provenanceStatus` | `VERIFIED` / `CONDITIONAL` (KHTN 9 today) / `MISSING` |

Coverage reports count only `ACTIVE` outcomes. They show `PROPOSED` outcomes as gaps, never as covered.

## 2. Mapping (stage 2)

`Outcome → Concept → LearningActivity → Lesson/Video → Lab`. Each arrow is a mapping row with its own review state. The Lab arrow is created only by stage 3 selection. A Lesson's `outcomeCodes` JSON stays a legacy projection until mapping rows exist.

## 3. Lab-need rubric (stage 3)

The P3.1 catalog scored K8 evidence, reuse, learning value, tractability and implementation leverage. This rubric keeps those dimensions and adds two gates that P3.1 lacked.

| Dimension | 0–5 | Gate |
|---|---|---|
| Interaction reveals what static content cannot (variable manipulation, prediction, failure) | | **must be ≥3** |
| Outcome evidence (ACTIVE outcomes served; PROPOSED count shown separately) | | ≥1 ACTIVE before blueprint receipts |
| Reuse across Lessons/grades by one model | | |
| Scientific tractability (bounded, reviewable model with golden cases) | | **must be ≥3** |
| Safety framing possible as virtual-only | | **must be pass** |
| Implementation leverage (existing engine/renderer) | | |
| Modality cost (2D=5 … heavy 3D=1) | | |

An entry below a gate goes to "Lesson/video only" or to the backlog with a reason.

## 4. Lab blueprint template (stage 4)

```
Identity:           labId, labKey, proposed modelRef, rendererKey, modality (+rationale)
Outcomes:           register codes (+ state), Lessons/videos that will launch it
Learning objective: one sentence, student-observable
Student actions:    ordered list (build, vary, predict, run, compare, explain)
Observations:       what the student must be able to see/read (with units)
Pass criteria:      exact rule over outputs, per challenge template; partial rules; needs_practice rules
Scoring map:        raw status → verdict table; what "partial" means pedagogically
Scientific model:   assumptions, equations, variables/units/ranges, valid topology/state domain, limitations
Fixtures:           golden, boundary, invalid (with expected error codes), tolerance
Class Lab surface:  which params/constraints teachers may narrow, challenge templates offered
Safety & copy:      virtual-only statement, real-world warnings from source, age framing
Assets:             list with license/provenance, semantic IDs, budget
Accessibility:      keyboard path, text alternatives, non-colour cues
Reviewers needed:   curriculum, subject, model, safety, rights (names assigned before receipts)
```

`spec-foundational-lab-p3-1/lab-definition.md` is the first instance of this template. It still needs: polarity decision, `SHORT_CIRCUIT` status for a no-LED zero-resistance branch, and a pedagogical meaning for `partial` on overload.

## 5. Build ownership (stage 5)

- **Model:** a new folder per `modelRef` version. The previous version is kept and never edited once a release references it.
- **Renderer:** one folder per `rendererKey`. Uses only the host APIs from `contract-v1.md` §6.
- **Assets:** registered as `AssetVersion` with license/provenance. Referenced by semantic ID through the pack `semanticMap`/`bindings` (already validated: `src/modules/labs/application/sim-packs.ts:237-254`).
- **Copy:** Vietnamese primary, English via `defineText`. Scientific engine messages are Vietnamese error codes mapped to copy keys.

## 6. 2D / 3D guidance

| Choose 2D when | Choose 3D only when |
|---|---|
| The outcome is about structure, quantity, graph, circuit, ray or ratio | The outcome requires spatial relationships that 2D cross-sections cannot show (e.g. heart chambers and vessels) |
| Low-end phones must run it | A 2D fallback giving equivalent evidence still exists |

Proposed budgets, to verify on the PRD device matrix:

| Modality | JS (lazy) | Assets | Memory | Frame rate |
|---|---|---|---|---|
| 2D | ≤ 300 KB gz | ≤ 500 KB | ≤ 150 MB tab | 60 fps on reference phone |
| 3D | ≤ 600 KB gz beyond three.js | ≤ 5 MB GLB | ≤ 300 MB tab | ≥ 30 fps on reference phone, with a 2D fallback |

Current catalog mapping (P3.1 ranks):
- **2D:** circuit, stoichiometry, acid–base, thermal, lever, reaction rate, ecosystem, optics.
- **2D-first, optional 3D:** density/pressure/buoyancy.
- **3D with a 2D fallback:** circulation/gas exchange.
- The existing `eye` 3D is anatomical labelling, not a simulation. It is a candidate for a Lesson resource rather than a Foundational Lab.

## 7. QA matrix (stage 8)

| Area | Evidence | Owner |
|---|---|---|
| Scientific correctness | Fixtures pass on server; independent reference values; dimensional check; boundary cases; model receipt | Model reviewer |
| Curriculum alignment | Outcome receipts; blueprint ↔ outcome trace | Curriculum reviewer |
| Scoring | Decision table test for every challenge template and narrowed-param edge | Lab team + subject reviewer |
| Accessibility | Keyboard-only run, screen-reader labels, non-colour status, reduced motion | QA |
| Device/performance | Budget measurements on the device matrix; slow-network launch | QA |
| Resilience | Contract integration suite (contract-v1 acceptance #2) on staging | Platform integrator |
| Regression | Fixture digest lock; previous releases still replay | CI |
| Safety/rights | Safety and rights receipts; virtual-only copy visible | Safety/rights reviewers |

## 8. Release & maintenance (stage 9)

- **Release endpoint** (new, audited): moves `APPROVED → ACTIVE`. It sets the Lab's public flags (`scope = SHARED_LIBRARY`, `releaseCleared`, `topicCode` with a real topic FK) in the same transaction. Today no code path writes these flags (`brownfield.md` E-07).
- **Bindings:** a Lesson `LAB` step, a `FoundationalCourseLesson.foundationalLabId` and catalog topic all point to the Lab. Launch resolves the active release.
- **Monitoring:**
  - sampled automatic replay of new attempts (expect `pinned_execution` match);
  - rates of 409 `LAB_RELEASE_CHANGED`, 422 out-of-range and model errors;
  - launch and submit latency;
  - FE renderer errors.
- **Update kinds:**

  | Change | Required |
  |---|---|
  | Copy only | new activity version + release, subject receipt |
  | Params/challenges | new pack + release, subject + range receipts |
  | Behaviour | new `modelRef` + fixtures + full receipts |
  | Asset | new asset version + pack + release, rights receipt |

- **Quarantine:** admin blocks new launches. Open sessions get 409 on submit. History stays readable.
- **Rollback:** activate the previous APPROVED release.
- **Progress policy** (open decision P-2): whether passes on SUPERSEDED releases still count toward foundational progress.
