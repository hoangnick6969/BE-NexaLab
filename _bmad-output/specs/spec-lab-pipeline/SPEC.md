---
id: SPEC-lab-pipeline
status: define-complete-build-ready
companions:
  - pipeline.md
  - contract-v1.md
  - foundational-lab-track.md
  - class-lab-track.md
  - data-model-and-api.md
  - phase-plan.md
  - lab-catalog-khtn8-9.md
  - brownfield.md
---
# NexaLab Lab Pipeline — master definition

This is the canonical design and phase authority for Foundational and Class Labs. P3.1's Circuit documents supply the first activity blueprint and historical discovery; the 30-candidate catalog is discovery input. Define is complete for starting the first isolated technical Build slice. This status is not scientific or curriculum approval, a release, or proof of implemented behavior.

## Product and curriculum

Source with provenance → proposed Outcome → concept → learning activity → lesson/video context → Lab selection and blueprint. Review mappings separately from Outcome statements. One model may serve multiple activities, Labs and grades; a Lab may compose separately bounded model modules. No fixed ratio of Lessons or Outcomes to Labs. A virtual activity can support an Outcome without proving real-world practical competence.

A Foundational Lab is NexaLab-owned, versioned and reviewed before public release. Practice remains accessible without an assignment, enrollment or quiz pass, subject to existing authentication. Class Lab is a future teacher-owned, class-private versioned activity referencing an approved Foundational release; it may select approved activities and narrow approved parameters, never alter science, widen constraints or enter the official course denominator. Practice and assignment evidence are distinct.

Keep all 30 candidates with stable source IDs. The portfolio is an editable proposed shortlist of approximately 20 identities, not a quota, approved coverage or a prerequisite to the first pilot. Record KEEP, MERGE, SHARE, SPLIT, DEFER and NO LAB decisions with reasons and explicit model, workspace, renderer, activity and identity relationships. KHTN9 remains discovery-only until its provenance and mappings are reviewed.

## Technical decisions

- One shared runtime coordinates authorization, model dispatch, validation, version resolution, attempts and evidence. Each model owns independently versioned deterministic behavior, state/output schema, limitations and fixtures. Assessment is owned by an independently versioned activity rubric; observation is not itself a pass/fail decision.
- Archetype describes interaction; modality describes visual presentation. Build shared host and reusable components as actual Labs need them; no obligation to implement every template.
- The server creates an immutable user/context-bound LabRun at launch that snapshots the exact model/engine, activity/rubric, pack, config, effective parameters, schema and evidence contract. Subsequent submissions evaluate that snapshot. This additive persisted session is the first Build design; existing version records remain components, existing attempts are retained and legacy routes stay compatible.
- New open practice uses the active reviewed tuple. Open-practice runs expire 24 hours after launch; an expired submission returns an explicit relaunch response and keeps the local draft. A class assignment pins its version at assignment publication and retains it while the assignment remains eligible under its actual close/archive rules. No blanket two-hour grace for assignments. Emergency quarantine/revocation overrides both and blocks new evaluation immediately; existing evidence remains readable. Idempotent retries of already committed attempts return the existing result even after expiry or revocation.
- FE preview is advisory; BE validates all checkpoints and recomputes observations and rubric results. Drafts are local recovery data, never evidence. Historical attempts are not rewritten.
- Production activation must bind curriculum, scientific/model, safety and rights reviews as applicable to exact immutable content and version identities. Engineering fixtures do not create such approvals.
- Preserve an isolated first technical pilot, then require a different-model fixture through both BE and FE shared contracts and real pilot curriculum/scientific-model approvals before authorizing two concurrent Lab implementation tracks.

### Compatibility fixture boundary

The P3.5 Chemistry pH compatibility fixture is `TECHNICAL_FIXTURE_ONLY`: it reuses an existing prototype solely to test that the shared runtime can dispatch a distinct state/output shape. It is not textbook-Outcome-derived, curriculum-reviewed, a Foundational Lab candidate by itself, or a student product surface. Keep its existing regression tests, but exclude fixture records from portfolio totals, curriculum coverage, release creation/activation, Lesson bindings and student discovery. Chemistry candidates in `lab-catalog-khtn8-9.md` remain separate unapproved discovery proposals and do not inherit evidence from this fixture. Circuit is the sole Foundational Lab pilot for P3.6.

## First pilot and scope

The candidate pilot is a low-voltage circuit with a battery, switch and generic bulb. Students predict and observe closed and open states and select an explanation. A bounded ideal on/off bulb model is specified in P3.1, not represented as the existing LED model. Outcome B22 is a candidate only. This activity does not claim physical wiring competence, measured current/voltage or scientific approval.

The existing LED definition, 2 V approximation and golden cases remain an unapproved future extension, not prerequisites for the bulb pilot. Teacher builders, general model authoring, wholesale 3D, bulk migrations, publication and changes to published Lessons are outside Define and the initial Build slice.

## Completion and gate boundary

Define DONE means an implementer can start the P3.2a isolated BE version-pinning slice using the named contract, initial data choice, acceptance checks and ownership in phase-plan.md. Human approval is not needed to build private fixtures; qualified curriculum and distinct scientific/model review are required before a pilot is represented as reviewed, and actual release requires release evidence. Open review decisions and operational retention controls remain tracked in phase-plan.md and do not authorize production.
