---
id: SPEC-teacher-ai-lab-drafting
status: draft-blocked-on-range-approval-and-lab-builder-scope
companions:
  - implementation-contract.md
  - tickets.md
  - ../spec-teacher-ai-authoring/implementation-contract.md
  - ../spec-teacher-ai-authoring/job-runtime-and-failure-modes.md
  - ../../planning-artifacts/architecture-spine-nexalab-release-1/ARCHITECTURE-SPINE.md
sources: []
---

> **Canonical contract.** This SPEC and the files in `companions:` are the complete, preservation-validated contract for what to build, test, and validate. Source documents listed in frontmatter are for traceability — consult them only if you need narrative rationale or prose color this contract intentionally omits.

# TAI-06 — AI Proposes Engine-Verified Lab Challenges for a Teacher Lesson

## Why

Setting a practical challenge requires a teacher to pick a lab model and parameter values that are scientifically sensible, solvable and meaningful for the lesson. That is the costliest kind of authoring in NexaLab. The platform already guards this path: teachers choose `labId` and `challengeParams` on their own lesson, values are checked against allowlisted ranges, and publishing creates a variant challenge whose objective text is generated deterministically. TAI-06 lets AI propose those values for review. The engine stays the only authority (AD-7, AD-14), and AI never writes simulation code or creates labs.

## Capabilities

- **CAP-1 — Proposal request:** the owning teacher requests up to 3 challenge proposals for a draft teacher-private lesson that is linked to an owned, active class. **Success:** the request runs as an `AiJob` with purpose `DRAFT_LAB_CHALLENGE` on the TAI-01 runtime, with idempotency, quota and snapshot as in TAI-01.
- **CAP-2 — Allowlist and range validation:** each proposal names a lab whose `CHALLENGE_PARAMETERS` entry has `rangeReview: "approved"` and parameters that pass `challengeParamErrors`. It must also lie inside the active pack `template.ranges` when one exists. **Success:** anything else is dropped with a reason code before the teacher sees it.
- **CAP-3 — Engine-verified solvability:** the server runs the deterministic engine with the proposed parameters on the model's reference golden states. **Success:** a proposal is kept only when at least one reference state passes and at least one does not, and per-state results are shown to the teacher.
- **CAP-4 — Review and apply:** the teacher compares proposals (parameters, deterministic objective preview, engine results, AI rationale), rejects or applies one to the draft lesson. **Success:** apply re-runs validation in the lessons application layer and sets the lesson's `labId` and `challengeParams`. Students see only the deterministic `challengeObjective` after the normal lesson publish and assignment.

## Constraints

- v1 plugs into the existing lesson challenge-variant contract only (`Lesson.labId`, `Lesson.challengeParams`, `challengeParamErrors`, `challengeObjective`, `writeSteps`). It never creates or edits `Lab`, `Challenge`, `SimulationConfigVersion`, `SimulationPackVersion` or `PracticalActivityVersion` rows directly.
- AI never produces code, formulas, engine state or student-facing text. The student objective is always `challengeObjective(labId, params)`. The AI rationale stays teacher-only and is never stored on the lesson.
- The engine is authoritative. Proposal verification uses `evaluate()` from `labs/application/simulation-versions.ts` on the server. Preview results are never attempts and never evidence.
- Only models with `rangeReview: "approved"` are offered (gate Q-C2-04). Today every model is `pending`, so no proposal can pass until ranges are approved.
- Scope stays owner-only. The lesson must be authored by the caller, `TEACHER_PRIVATE`, `draft`, not structure-locked, and linked to the class used in the route. It reaches students only through the existing class assignment path.
- Input is lesson text, outcome statements and the model allowlist. No student-record field is sent, but this does not make any provider or tier acceptable: provider calls wait for gate G-6 (written provider/legal approval for NexaLab's under-18 context, input boundaries, source rights, transfer, retention and deletion), exactly as TAI-01 (`../spec-teacher-ai-authoring/provider-and-data-flow.md`). Until then only the fake provider runs.

## Non-goals

- Teacher custom Lab builder: new labs, 3D/GLB assets, semantic maps, packs or new simulation models.
- Editing shared or curriculum labs, admin configuration versions or packs.
- AI-written challenge objectives, hints or explanations shown to students.
- Proposals for released shared-library lessons.

## Success signal

After range approval for `circuit`, the owner teacher of `class-pilot-a` requests proposals for a draft private copy of `lesson-circuit`. Every returned proposal has parameters inside the approved range, at least one passing and one failing reference state, and a deterministic objective preview. Applying one sets the lesson's `challengeParams`. After the normal publish and assign, a student attempt is evaluated by the server with those parameters. Out-of-range or unsolvable proposals never reach the review list.

## Assumptions

- Reference states come from the active `SimulationPackVersion.template.goldenCases` for the lab, or else from the active `SimulationConfigVersion.goldenCases`. A lab with neither offers no proposals.
- At most 3 proposals per job and one apply per job.

## Open Questions

- **BLOCKING:** does the product owner accept v1 as AI-proposed challenge variants on existing labs, rather than a teacher custom Lab builder (which has no contract under AD-14)?
- **BLOCKING:** who approves the parameter ranges for `circuit`, `chemistry` and `eye` (Q-C2-04, currently `pending`), and when?
