# Pipeline, decisions and release boundaries

The canonical phase numbering and Build backlog are in lab-pipeline-phase-plan.md. This document describes stages rather than additional phase IDs.

For the operational handoff separating app-code deployment, Prisma schema migration and immutable Lab content publication, use the [Foundational Lab release and migration runbook](../spec-foundational-lab-release-operations/release-and-migration-runbook.md). Lab-specific implementation specs remain authoritative for model/activity requirements; the runbook records the shared lifecycle and current operational limits.

1. Record official program and textbook/teacher-guide source identity, edition, locator, provenance and rights. Register outcomes as proposed; obtain a qualified human decision before claiming approved curriculum coverage.
2. Map Outcome → concept → activity → Lesson/video → candidate Lab. Each mapping has its own review status. Inventory KHTN8–9 broadly; prioritise Circuit without blocking the technical pilot on the entire register.
3. Evaluate candidate benefit, model tractability, safety, reuse and evidence. Classify KEEP/MERGE/SHARE/SPLIT/DEFER/NO LAB with reasons. The 30 discovery IDs remain traceable; the proposed ~20 portfolio is not a quota or approval.
4. Write a bounded activity/model blueprint: learning action, observations, measurable rubric, evidence, model assumptions/limits, units, state schema, fixtures, accessibility and review roles.
5. Build the Lab module against the shared contract. Model, UI and assets can be developed in parallel from fixtures. A renderer is an allowlisted component; visuals never set scientific outputs or scores.
6. Integrate and verify launch pinning, authoritative checkpoint evaluation, stored attempt, replay, authorization, F5 draft, network retry and duplicate submissions in isolation.
7. During development, dev and agent check the exact Lab tuple, source/mapping, model, rubric, safety/rights and target compatibility. For a new draft, ADMIN reviews their check notes and approves the exact digest through `DEV_APPROVAL_V1` in the Admin release screen. The API authenticates ADMIN and stores the notes; it does not authenticate a separate agent. Historical release snapshots retain their `OWNER_SIGNOFF_V1` or delegated review policy.
8. Validate release compatibility, accessibility, device/performance, safety/rights and quarantine behavior. Production activation is independently gated and versioned per Lab; a staging technical pilot is not public release.
9. Monitor and maintain immutable releases. Retain the versions needed for active assignments and historical evidence; quarantine blocks new evaluation without deleting history.
10. Later, a teacher creates a Class Lab from an active Foundational release. Class membership, target snapshots, assignment pinning and teacher ownership stay server-enforced; class practice remains separate from scored assignments and open curriculum.

The 2D bulb Activity is the first engineering pilot. Its Outcome remains proposed and a digital activity cannot prove real-world wiring skill. A draft or prototype cannot unlock or complete an official course. Open Foundational practice is not gated by a quiz or assignment.
