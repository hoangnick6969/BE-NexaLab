---
id: SPEC-foundational-lab-p3-1
status: needs-review
companions:
  - candidate-catalog.md
  - lab-definition.md
  - brownfield.md
  - implementation-plan.md
sources:
  - ../../../docs/product/rnd-lab3d-khtn8-research-brief.md
  - ../spec-khtn8-taxonomy/SPEC.md
  - ../spec-khtn8-taxonomy/taxonomy-catalog.md
---

# P3.1 Foundational Lab Discovery and Definition

## Why

NexaLab needs a small set of reviewed scientific simulations that can serve many Lessons and teacher activities. The current product already contains three deterministic demo models and a versioned server-authoritative Lab pipeline, but none is released as a Foundational Lab in the pilot database. Building assets or additional one-off Labs before selecting and defining the reusable scientific model would create avoidable scientific and product debt.

## Terms

- **Scientific Concept:** the phenomenon, law, or system being represented, independent of any software or lesson activity.
- **Foundational Lab:** a NexaLab-owned, reviewed, versioned simulation of one bounded scientific model. It is reusable by several Lessons and grades and has fixed equations, assumptions, ranges, units, limitations, golden cases, and release evidence.
- **Class Lab:** a teacher-configured learning activity that uses an approved Foundational Lab. A Class Lab may select an approved challenge, values, prompts, class assignment, and Lesson context; it cannot change equations, model constants, valid scientific ranges, or release status.

## Capabilities

- **CAP-1 — Evidence-based Lab portfolio**
  - **intent:** Product and science reviewers can compare a bounded set of reusable Lab candidates against released Lesson evidence, conditional cross-grade reuse, simulation value, model complexity, and implementation leverage.
  - **success:** The catalog ranks 8–12 candidates, identifies the exact KHTN 8 Lessons each candidate can serve, labels every unapproved Outcome mapping, and does not count unverified KHTN 9 evidence as a released binding.
- **CAP-2 — Implementable first scientific model**
  - **intent:** An engineer can implement the selected MVP without deciding new equations, units, ranges, boundary behavior, verdict rules, or safety claims.
  - **success:** The definition fixes inputs, outputs, equations, topology, valid ranges, observable behavior, limitations, safety constraints, and numerical golden cases with tolerances.
- **CAP-3 — Reusable learning bindings**
  - **intent:** One released Foundational Lab can be launched from several Lessons and reused in teacher-configured Class Labs without copying or mutating its scientific behavior.
  - **success:** The pilot binds one source-grounded, human-reviewed KHTN 8 Outcome to its Lesson and activity; further Lesson or grade bindings remain proposals until independently reviewed. Historical attempts retain their actual model/config/pack identity.
- **CAP-4 — Brownfield-first delivery**
  - **intent:** The MVP uses the current FE/BE simulation, attempt, access, versioning, and content contracts and adds only proven missing behavior.
  - **success:** The plan distinguishes existing capability from proven gaps, uses the smallest compatible change, and determines whether a migration is required only after exact version pinning and historical evidence have been designed.
- **CAP-5 — Controlled parallel Lab development**
  - **intent:** Multiple Lab teams can independently develop reviewed scientific activities against a stable shared platform.
  - **success:** A real pilot attempt persists the authoritative result, contract v1 is versioned, and a second-model fixture passes that contract before a second Lab implementation begins; at most two Labs are developed concurrently initially.

## Decision

Use **LED Current-Limiting DC Circuit** as the candidate for the first 2D Foundational Lab. The current definition is a scientific proposal, not approved behavior. Choose one applicable KHTN 8 Outcome with a named reviewer; B22 is a candidate, while B21–B25 and KHTN 9 remain possible later consumers, not automatic bindings. Preserve the existing circuit engine and generic infrastructure where their behavior is verified; replace prototype-only Lab definitions, demo entries, and unreviewed UI with reviewed content and interaction.

This decision does not declare the current `circuit` demo released. The pilot row is `CLASS_PRIVATE`, `releaseCleared = false`, has no `topicCode`, and has no activity, configuration, simulation-pack, or foundational-course version.

## Constraints

- P3.1 is a planning/specification phase; production simulation changes, 3D assets, schema changes, seeds and publication require subsequent implementation work. A narrowly scoped pinning regression test may characterize the current implementation before a fix.
- Do not create one Lab per Lesson or Outcome.
- Reuse existing server-authoritative deterministic simulation and immutable version contracts.
- Treat every KHTN 8 Outcome reference in this spec as `PROPOSED_UNAPPROVED`, even when the current Lesson row already carries the code.
- A real curriculum reviewer must explicitly confirm the pilot Outcome and Lesson mapping; a named qualified scientific/model reviewer must review the model before the real pilot. Identities and approvals remain open until real people are assigned.
- Treat KHTN 9 only as conditional reuse evidence until its source/rights/review metadata is reconciled with the provenance standard used by the 47 KHTN 8 Structured Lessons.
- Keep simulation logic independent from visual assets and localized copy.
- A Class Lab may narrow an approved range or choose an approved challenge; it may not modify scientific equations or widen ranges.
- Student-facing release continues to require a published, non-synthetic, `SHARED_LIBRARY`, release-cleared Lab with a valid topic binding.
- Free Foundational Lab access does not require an assignment or quiz pass; course completion and assignment evidence remain separate.
- Remove prototype-only Labs from product flows without deleting historical attempts or saved experiments. Preserve tested shared infrastructure and Circuit engine behavior where appropriate.
- Run curriculum review for the Circuit cluster in parallel with platform contract/version-pinning work; do not wait for all KHTN8–9 mappings before preparing the pilot.
- The attempt must evaluate the exact immutable model/config/activity selected by its pinned pack; a stored pack ID alone is insufficient. Keep retry idempotency and F5 draft recovery, with drafts excluded from learning evidence.
- Initial parallel Lab development is capped at two, after the real-attempt, versioned contract-v1 and second-model-fixture gate in CAP-5; platform and curriculum preparation may proceed in parallel before that gate.

## Non-goals

- General Lab Builder or no-code model authoring.
- Bulk Outcome approval or Outcome Normalizer implementation. This spec cannot itself approve an Outcome; the pilot requires a real reviewer to approve its selected Outcome and mapping.
- Content Tool, OCR, Content Release, SGK Viewer, or ebook changes.
- 3D-first interaction, photorealistic equipment, or a new asset pipeline.
- Retrofitting all candidate Labs or publishing the MVP.
- Replacing current assignment, attempt, progress, or Class Space rules.

## Evidence boundary

- **Verified for selection:** the pilot contains exactly 47 non-synthetic, released KHTN 8 Structured Lesson packs with SGK provenance. The five electricity Lessons are released but currently have only `READING` steps and no Lab binding.
- **Conditional only:** the pilot contains 51 released KHTN 9 packs and active Outcome rows, but sampled manifests do not contain the KHTN 8 Structured Lesson source-block/page shape and their review metadata labels the publisher textbook as `ORIGINAL`. P3.1 uses their topics only to estimate reuse and creates no KHTN 9 release binding.
- **Not released:** the three prototype Lab rows (`circuit`, `chemistry`, `eye`) were private and uncleared in the P3.1 pilot snapshot. That snapshot contained zero `SimulationConfigVersion`, `PracticalActivityVersion`, `SimulationPackVersion`, and `FoundationalCourseVersion` records; recheck the target environment before release.
- **Pinning gap reproduced in isolated PostgreSQL:** controller/Prisma integration activated a pack and configuration, then an out-of-range configuration; before the fix an attempt recorded the pack while using that incompatible configuration. After the fix the incompatible combination is refused and versioned attempts reproduce with their recorded execution snapshot. The test does not exercise HTTP or a live environment.
- **Composition limit:** a pack constrains numeric config parameters by reviewed ranges; it does not attest that a particular pack/config pair was individually reviewed or define pack-specific allowed string choices. Pack selection remains at submission, not launch. Historical attempts without an execution snapshot remain available but are labelled `legacy_unverified` on reproduction.
- **Curriculum preparation:** the Content Tool has a local KHTN8 electricity proposal with 13 source-text candidates and six B20–B25 mapping proposals, all requiring human review; source authenticity/current version and Lesson locators remain to be confirmed.

## Success signal

The updated catalog, scientific definition and plan are accepted; a named curriculum reviewer approves one pilot Outcome and a named scientific/model reviewer approves its model. One real pilot attempt uses and records the same reviewed versions and survives the defined retry/recovery checks. A second-model fixture passes the versioned contract before a second Lab begins.

## Approval still required before implementation release

- A named subject reviewer accepts the fixed 2.0 V red-LED approximation, current thresholds, state ranges, and golden cases.
- A distinct model reviewer accepts the deterministic implementation against the definition.
- The existing range-approval reference required by the pack contract is supplied.
- A qualified curriculum reviewer confirms the one pilot Outcome and its source/Lesson mapping separately; other Outcome proposals remain unapproved.

## Open questions

- Who are the actual curriculum and scientific/model reviewers, and have they accepted responsibility for the pilot?
- Which specific KHTN 8 Outcome will the reviewer approve for the first Circuit activity?
- Does reliable historical model/config/pack pinning require an additive schema migration after the existing contracts are exercised?
