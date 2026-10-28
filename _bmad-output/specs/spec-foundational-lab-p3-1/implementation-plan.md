# Foundational Lab Delivery Plan

This is a plan, not authorization to publish or to claim that a human review has occurred. P3.1 remains `needs-review` until reviewer and pilot Outcome questions are resolved.

## 0. Correct P3.1 and identify reviewers

- [ ] Remove prototype-only Lab definitions, demo entries and unreviewed UI from product flows; preserve historical attempts/saved experiments and retain the Circuit engine and generic infrastructure only where verified reusable.
- [ ] Identify an actual qualified curriculum reviewer and a qualified scientific/model reviewer, record their agreement and any conflicts of interest before running the real pilot. Subject and model review roles must satisfy the existing distinct-review rule; do not invent names or approvals.
- [ ] Treat the LED definition, B22 and other B21–B25 mappings as candidates; choose exactly one KHTN 8 Outcome and one Lesson mapping for the first pilot after source review.
- [x] Commit the corrected P3.1 decision record independently from implementation changes.

**Gate:** identities and availability must be real for the pilot. Technical fixtures and source inventory may proceed while reviewer assignment is pending; no pilot approval or release is implied.

## 1. Two independent preparation tracks

### Track A — Platform and contract

- [x] Add a reproducible pinning regression test before changing production logic. `labs-pinning.test.ts` characterizes a synthetic divergent fixture; its expected-failure case is a pending contract assertion, not a green release gate or live-database proof.
- [x] Convert the expected-failure case to a normal passing assertion and add an isolated PostgreSQL controller/Prisma integration test using the actual version activation and persistence path. This is not HTTP or live-environment evidence.
- [ ] Version contract v1: Lab/activity/pack/model identity, input and output schema versions, allowed ranges, units, errors, verdict and versioned fixtures. Each scientific model owns its state/output schema; renderer modality is independent.
- [x] For submission and reproduction, evaluate the pack model and reject incompatible config model/numeric ranges; record the actual version tuple and parameters without a Prisma schema migration. Preserve historical attempts and label unsnapshotted replay `legacy_unverified`.
- [ ] Decide whether a reviewed pack must pin an exact configuration and whether pack selection must be fixed at launch. Current code permits independently activated compatible configurations and selects the pack at submission; it does not prove individual pair approval.
- [ ] Require idempotency for standalone submissions and persist recoverable local drafts across refresh, keyed by user, Lab, learning context and compatible model/schema version. Drafts never count as evidence.
- [ ] Replace the FE three-ID dispatch with a small allowlisted renderer registry and a common launch/submit envelope. Do not execute arbitrary manifest code or require 3D.

### Track B — Curriculum and activity

- [ ] Inventory the KHTN8–9 Outcome Register at a source/coverage level using the Content Tool. The KHTN8 electricity cluster now has 13 proposed source-text candidates and six proposed B20–B25 mappings; the rest remains to be inventoried and no human approval is implied.
- [ ] In parallel, prioritize the KHTN 8 Circuit cluster and obtain a qualified human's source-grounded approval for one Outcome and Lesson mapping. Do not promote textbook-derived proposal handles to official codes.
- [ ] Prepare one 2D activity with pupil action, expected observation, pass criteria, valid states, assumptions, safety, source locators and scientific golden/invalid cases. Review LED polarity, ranges and branch results where the selected activity requires them.
- [ ] Treat KHTN 9 as discovery-only until source provenance, mapping and reviews meet the accepted standard.

**Preparation outcome:** the platform and curriculum tracks do not block one another. Platform fixture tests may run before reviewer sign-off; a real pilot or release must not be represented as reviewed without it.

## 2. First real pilot

- [ ] Freeze the reviewer-approved one-Outcome activity and exact model/config/pack version. Preserve reviewed Circuit behavior via a new model version only when behavior changes; do not mutate historical model behavior in place.
- [ ] Deliver one accessible 2D experience with server-authoritative evaluation, valid-state errors and learner-facing limitations. Do not reuse unreviewed prototype UI merely because it exists.
- [ ] Validate an actual lesson/video → Lab → real server attempt → pass/fail → persisted result flow. Public Foundational Lab discovery remains open without assignment or quiz pass; assignment-scoped evidence stays separate.
- [ ] Exercise F5 recovery, network retry, duplicate submit, invalid state, failed then successful attempt, authorization and pack activation while work is in progress. Ensure a draft never creates an attempt or progress.
- [ ] Have the named scientific/model and curriculum reviewers sign the exact reviewed versions and source mapping. Record the existing required range approval.

**Pilot gate:** one real persisted authoritative attempt uses and records the same reviewed model/config/activity/pack; progress and retry semantics are verified in the appropriate learning context.

## 3. Gate before a second Lab implementation

All of the following must be true before opening work on a second Lab:

1. The first pilot has a real server-authoritative attempt with a persisted result and verified version identity.
2. Contract v1 is explicitly versioned and its shared launch/submit/model/renderer fixtures pass.
3. A fixture for a second scientific model with a different state/output shape passes the same contract; the fixture does not have to be a released Lab.
4. Required human reviewers are identified and the pilot's Outcome and model have their actual approvals.

After this gate, cap work at **two Labs concurrently** initially, with separate owned modules/worktrees and one platform integrator responsible for small registry changes. Curriculum and platform preparation are not counted as additional Lab implementations. Reassess coordination cost before increasing the cap.

## 4. Integrate and release each Lab independently

- [ ] Each Lab supplies its own reviewed activity/model/config/pack versions, schema, golden and invalid cases, UI renderer and asset evidence as applicable.
- [ ] Run model and contract checks, FE/BE compatibility, authorization, scientific review and staging end-to-end checks per Lab. Record reviewer identity and version/digest.
- [ ] Activate the reviewed pack for that Lab; verify it does not change another Lab or historical attempts. An independently activated pack still requires its model and renderer to have been deployed in compatible BE/FE versions.
- [ ] Record release evidence and provide a quarantine/retirement path without silently rewriting past evidence.

## Deferred

- General Class Lab Builder, arbitrary user-authored models and unbounded 3D scene authoring.
- 3D polish before the 2D pilot and its logic are validated.
- KHTN 9 release bindings before provenance and curriculum review.
- Broad OCR correction, unrelated content releases and deletion of historical attempts or saved experiments.
