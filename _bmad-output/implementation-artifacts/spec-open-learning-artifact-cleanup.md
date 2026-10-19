---
title: 'Prune superseded Open Learning planning artifacts'
type: 'chore'
created: '2026-10-19'
status: 'done'
route: 'oneshot'
review_loop_iteration: 0
context:
  - '{project-root}/docs/product/prd.md'
  - '{project-root}/_bmad-output/planning-artifacts/architecture-spine-nexalab-release-1/ARCHITECTURE-SPINE.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Open Learning decisions are repeated across a dated change proposal, assessment, draft development plan, discovery spec, memlog, and a second completed implementation spec. Their status and cross-references make obsolete drafts look authoritative and obscure the current PRD, architecture spine, increment plans, and implementation state.

**Approach:** Remove only artifacts whose decisions have been superseded by the current PRD, architecture spine, and I1–I3 increment plans; repair every live reference; retain the unique Class Space assignment contract and historical accepted specs; and leave one current I1 implementation record plus this cleanup record.

</frozen-after-approval>

## Implementation Notes

- Deleted seven superseded artifacts: the dated sprint-change proposal, the PRD assessment, the draft next-development plan, the Open Learning discovery `SPEC.md`, its access/discovery companion and memlog, and the duplicate completed student-hub implementation spec.
- Kept `class-space-assignment-contract.md` because it remains the unique detailed companion for PRD FR-18 and Architecture AD-15.
- Repointed I1-I3 handoff order, sprint tracking, historical precedence notes, and the Lab research brief to the current PRD, architecture spine, increment plans, and retained Class Space contract.
- Normalized the active I1 plan and implementation spec to `in-progress`; I2 and I3 remain `draft` because their documents still contain unresolved readiness gates.
- Removed an obsolete deferred-work entry whose AGENTS path issue has already been corrected; retained the explicit deferred UI information-architecture work.
- Replacement map: former discovery/catalog capability and public-release boundaries → PRD §8/FR-09..15 and I1 Stories 1.1–1.5; former access/progress/Lab discovery matrix → PRD FR-12..15 and Architecture AD-5/AD-6/AD-11/AD-14, with I1/I2 access acceptance; former class-resource authoring/import and scored-test lifecycle rules → retained `class-space-assignment-contract.md` §§1–4 and I2/I3; historical discovery rationale and proposed API shapes were not binding and are represented by the accepted product/architecture decisions only.
- Cleanup completion: all supplied cleanup review findings are resolved in the current tree; remaining product choices are explicitly retained as I2/I3 readiness gates, not cleanup tasks.

## Review Triage Log

| Finding | Verdict | Evidence / disposition |
|---|---|---|
| Open Questions points to a deleted discovery spec and says stories are still needed | Patched | Status now identifies PRD, Architecture, I1-I3 plans, retained contract, and actual increment lifecycle. |
| PRD Class Space contract path is unclear | Patched | Replaced `../../` with the repository-root `_bmad-output/...` path. |
| Hub completion checklist and verification evidence were removed | Patched | Preserved historical checklist, acceptance evidence, review triage, and latest check results in `student-lessons-class-space-hub-implementation.md`. |
| I3 stories omit actionable assignment input to subject achievement | Patched | Story 3.4 now covers actionable/unaccepted work, fixed foundational denominator, and closed/archived evidence behavior. |
| QR-09 targets lack measurable endpoint scope and method | Patched | I1/I2/I3 define operations, pilot region/data, concurrency, request count, windows, p95 thresholds, exclusions, and report fields. |
| Sprint tracking date is stale | Patched | `last_updated` is `2026-10-19`. |
| Deleted discovery assets lack a replacement map | Patched | Added capability/access/Lab/authoring mapping to PRD, Architecture, I1-I3, and retained contract sections. |
| I1 handoff refers to unnamed gates | Patched | Added named identity, taxonomy, release API, evidence/course version, and ebook locator gates. |
| I2/I3 contract handoffs do not identify applicable sections | Patched | I2 points to §§1, 3, 4; I3 points to §2 and §4 item 5, with conditional references to §§1 and 3. |
| Cleanup record remained in progress without closure criteria | Patched | Status is `done`; completion and still-open increment gates are distinguished. |
