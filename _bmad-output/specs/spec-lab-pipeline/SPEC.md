---
id: SPEC-lab-pipeline
status: draft-for-review
companions:
  - pipeline.md
  - contract-v1.md
  - foundational-lab-track.md
  - class-lab-track.md
  - data-model-and-api.md
  - phase-plan.md
  - lab-catalog-khtn8-9.md
  - brownfield.md
sources:
  - ../spec-foundational-lab-p3-1/SPEC.md   # only on origin/codex/foundational-lab-platform (unmerged)
  - ../spec-khtn8-taxonomy/SPEC.md
  - ../spec-content-foundation/SPEC.md
  - ../spec-open-learning-catalog/class-space-assignment-contract.md
  - ../spec-nexalab-content-tool-mvp/SPEC.md
  - ../../../docs/product/prd.md
  - ../../../docs/product/rnd-lab3d-khtn8-research-brief.md
---

> **Design contract, not implementation evidence.** This SPEC defines the end-to-end Lab pipeline for both tracks. Nothing here is implemented unless `brownfield.md` cites source or test evidence. No review, approval or release has happened because this document exists.

# NexaLab Lab Pipeline — Foundational Lab and Class Lab

## Why

NexaLab already has a deterministic server-authoritative simulation runtime, immutable configuration/activity/pack versions and an attempt pipeline. It has no path that takes an official curriculum outcome to a reviewed, released, maintainable Lab. It also has no Class Lab capability. P3.1 selected the first Foundational Lab candidate (LED circuit). It did not define the pipeline that every later Lab, and every teacher Class Lab, will run through. Without that pipeline, parallel Lab teams would each invent their own versioning, launch, scoring and release conventions on top of hard-coded FE dispatch and a release gate that nothing in the code can open.

## Terms

- **Scientific model:** an allowlisted deterministic function `modelRef@version`. Given a valid state it produces outputs and a raw verdict. It is owned by NexaLab and is never authored by teachers or uploaded.
- **Foundational Lab:** a NexaLab-owned reviewed activity on one scientific model. It is mapped to official taxonomy, released publicly and open without assignment (PRD FR-13).
- **LabRelease:** an immutable, activatable tuple that fixes everything a student run depends on: activity version, pack version, configuration, model, engine, renderer and state schema. Students always run a LabRelease. They never run a bare Lab row.
- **Class Lab:** a teacher-owned Class Space resource that **references one active Foundational LabRelease**. It may only narrow approved parameters, pick an approved challenge template and add class prompts/instructions. It cannot change model, equations, ranges beyond the release, assets or release state. (Decision D-LP-01, accepted by the requester 2026-10-28.)
- **Practice vs scored:** active approved class members may practise a Class Lab without score. Scored evidence exists only for snapshotted targets of an explicit assignment that pins the Class Lab version.

## Capabilities

- **CAP-1 — Curriculum-grounded Lab demand**
  - **intent:** Curriculum staff decide which outcomes need a Lab from a provenance-backed Outcome Register, not from textbook headings or existing demos.
  - **success:** Every Lab candidate cites register outcome IDs with source edition, locator and review state. Unreviewed outcomes are visible as `PROPOSED` and never count as coverage or release evidence.
- **CAP-2 — Implementable Lab blueprint**
  - **intent:** A Lab team can build a Lab from a blueprint without inventing learning goals, equations, ranges, pass rules or 2D/3D modality.
  - **success:** The blueprint fixes objective, student actions, observations, pass criteria, scoring map, model contract, golden/invalid fixtures and modality rationale. It names the people who must review it.
- **CAP-3 — Shared platform contract v1**
  - **intent:** Several Labs with different science, scoring and UI can be built in parallel against one stable launch/submit/result/renderer/fixture contract.
  - **success:** A second model with a different state/output shape passes the same contract tests as the first. Adding a Lab touches exactly one BE registry entry and one FE renderer registry entry outside the Lab's own module.
- **CAP-4 — Exact version identity**
  - **intent:** What a student saw, what the server scored and what a replay reproduces are the same LabRelease.
  - **success:** Launch returns a `labReleaseId`. Submit must carry it, and the attempt persists it. Activation during a session cannot change the scoring of an open session without an explicit, user-visible refusal. Replay of a new attempt reproduces outputs within tolerance. Legacy attempts remain readable and are labelled `legacy_unverified`.
- **CAP-5 — Resilient student run**
  - **intent:** Refresh, network loss and duplicate clicks never lose work or duplicate evidence.
  - **success:** Every submit is idempotent, including concurrent duplicates. A local draft restores the workspace after F5 for the same user, Lab context and compatible release schema. A draft never creates an attempt, progress or evidence.
- **CAP-6 — Governed release and maintenance**
  - **intent:** A Lab reaches students only through an audited release that verifies authenticated review receipts. It can later be updated, quarantined or retired without rewriting history.
  - **success:** No student-visible Lab exists without a release record that carries authenticated subject, model and curriculum receipts bound to the exact digests. A new behaviour always means a new model version and a new release. Quarantine blocks new launches and keeps historical evidence readable.
- **CAP-7 — Class Lab on released science**
  - **intent:** A teacher adapts a released Foundational Lab to a class lesson without being able to alter its science or leak it outside the class.
  - **success:** A Class Lab can only reference an active LabRelease, narrow ranges within it and choose its challenge templates. Every list/detail/launch/submit/result call checks ownership or active approved membership. Score writes additionally check assignment target membership. Class Labs never appear in the open catalog or the foundational course denominator.
- **CAP-8 — Honest evidence boundaries**
  - **intent:** Foundational practice, lesson-step evidence, Class Lab practice and assignment evidence stay separate and attributable.
  - **success:** Each attempt records exactly one context (`FOUNDATIONAL`, `LESSON_STEP`, `CLASS_PRACTICE`, `ASSIGNMENT`) and its pinned release. Progress projections read only the contexts they are defined over.

## Constraints

- Preserve current contracts listed in the R&D brief §9: `POST /attempts` as the authoritative boundary, `POST /simulate/:labId`, `LessonStep` resource identity, `AssignmentTarget` snapshots, immutability of config/pack versions and readable old attempts. All changes are additive. Old clients receive explicit errors, not silent re-scoring.
- The server computes every score. Client preview is advisory and must use the same released model version.
- No executable code, formulas or URLs in any manifest, pack, Class Lab or asset binding.
- One model behaviour per `modelRef@version`. Changing behaviour in place (as `chemistry@1.0.0` received the pH mode) is forbidden from contract v1 onward. Existing in-place changes are recorded as legacy, not repeated.
- Review receipts carry the authenticated reviewer's user ID and role and bind the reviewed digest. JSON names/emails typed by the creator are not receipts.
- Subject and model reviewers are distinct people. A release manager cannot attest scientific validity. An admin may quarantine but may not approve.
- KHTN 8 outcome codes remain `PROPOSED_UNAPPROVED` until a named curriculum reviewer approves them. KHTN 9 is reuse evidence only until provenance meets the KHTN 8 standard.
- Class Lab follows D-LP-01: configuration on an active LabRelease only. No teacher-authored models, assets or ranges outside the release. Generic file import never creates a Lab.
- Free Foundational Lab access never requires assignment, enrollment or a quiz pass. Class Lab access never grants public access.
- Initial parallel Lab development is capped at two after the P3.5 gate (inherits P3.1).

## Non-goals

- General Lab Builder, model DSL, teacher-uploaded GLB/assets for Class Labs, multi-class sharing of Class Labs.
- Automatic outcome approval, OCR or Content Tool changes, KHTN 9 release bindings.
- Rewriting historical attempts, deleting saved experiments or removing prototype history.
- Implementing any Lab or publishing anything as part of this spec.

## Success signal

The pipeline is accepted when the team can follow `phase-plan.md` from DEFINE exit through the first pilot without needing to decide any of the following again: what version a run uses, how a Lab is released, what a Lab module owns, how a Class Lab is constrained and scored, and which review is required at which gate. The success signal is not a released Lab.

## Decisions recorded

| ID | Decision | Status |
|---|---|---|
| D-LP-01 | Class Lab = teacher configuration on an active Foundational LabRelease (narrow params, choose challenge, prompts, lesson context). No teacher-authored models/assets. | accepted (requester, 2026-10-28) |
| D-LP-02 | Students run a LabRelease. Activation points at a release, never at a config or pack separately. A pack pins its configuration. | proposed (ADR-LAB-01) |
| D-LP-03 | Launch pins the release. Submit is accepted for that release while it is `ACTIVE`, or `SUPERSEDED` within a grace window (proposed 2 h). Otherwise it returns 409 `LAB_RELEASE_CHANGED`. | proposed |
| D-LP-04 | Execution tuple stored outside `simulationResult` (additive Attempt columns), not returned as part of scientific output. | proposed |
| D-LP-05 | Class Lab persisted as `ClassResource` kind `LAB` (reuses class membership checks, versions and idempotent create) rather than a new top-level table. | proposed |
| D-LP-06 | Foundational Lab inside an Open Curriculum Lesson is a `LAB` step that launches the same LabRelease with context `LESSON_STEP` and `assignmentId = null`. | proposed, needs PO |

## Open questions

See `phase-plan.md` §Open decisions. They are split into product, curriculum, scientific review and technical decisions, each with an owner and the phase it blocks.
