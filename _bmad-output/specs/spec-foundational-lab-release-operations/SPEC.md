---
id: SPEC-foundational-lab-release-operations
companions:
  - release-and-migration-runbook.md
sources:
  - ../spec-lab-pipeline/SPEC.md
  - ../spec-lab-pipeline/pipeline.md
  - ../spec-lab-pipeline/contract-v1.md
  - ../spec-lab-pipeline/lab-pipeline-phase-plan.md
  - ../spec-lab-pipeline/lab-catalog-and-shared-kits-khtn8-9.md
  - ../spec-lab-pipeline/fl-03-density-k3-plan.md
  - ../spec-lab-pipeline/fl-10-k2-implementation-spec.md
  - ../spec-fl-25-em-induction/SPEC.md
  - ../../implementation-artifacts/fl-25-em-induction-implementation.md
  - ../../../src/modules/labs/application/lab-release.service.ts
  - ../../../src/modules/labs/interface/admin-labs.controller.ts
  - ../../../scripts/assert-isolated-db.mjs
  - ../../../scripts/release-fl10-mass-conservation.mjs
  - ../../../scripts/release-em-induction.mjs
  - ../../../.github/workflows/ci.yml
---

# Foundational Lab release and migration operations

## Why

Foundational Lab implementation specs exist, but production release, schema migration and content activation instructions were scattered across phase plans and lab-specific scripts. Developers repeatedly rediscover the difference between a code deploy, a Prisma migration and a versioned Lab release. This contract gives Lab authors one evidence-based handoff and operational sequence while making unimplemented production deployment steps explicit.

## Capabilities

- **CAP-1**
  - **intent:** A Lab team can determine whether a candidate is ready for code integration, schema deployment, content activation or broader portfolio claims.
  - **success:** Every release record names its immutable LabRelease version and digest, code commits, model/activity/pack/config tuple, migration IDs (or none), required review kinds, environment evidence, and unresolved acceptance gates.
- **CAP-2**
  - **intent:** An operator can deploy compatible BE/FE code, migrate schema and activate content in a safe, ordered, auditable way.
  - **success:** The runbook distinguishes the three operations, refuses to treat the isolated-database guard as a production migration path, defines preflight/postflight evidence and quarantine/rollback semantics, and contains no invented production command.
- **CAP-3**
  - **intent:** A developer can reuse the completed K1/K2/K3 pilot patterns without claiming shared apparatus or scientific validation that does not exist.
  - **success:** The runbook maps the current Circuit, Density, EM Induction and Mass Conservation releases and states the P3.1–P3.7 gates accurately.

## Constraints

- A `LabRelease` is an immutable snapshot of the executable Lab tuple and review policy. It is not the same operation as deploying BE/FE code or applying a Prisma migration.
- New release drafts require `DEV_APPROVAL` (`DEV_APPROVAL_V1`): an authenticated ADMIN approves the exact digest after recording developer and agent check notes. The notes are attestations by the ADMIN; the API does not authenticate an agent separately. Older snapshots keep their original review policy and receipts.
- Never run tests, seeds, backfills or Prisma migrations against shared Supabase or another remote DB. Database scripts are guarded for dedicated loopback PostgreSQL only; use those guarded npm scripts, never raw Prisma migration commands.
- Do not mark P3.5 complete, P3.6 complete or P3.7 open for portfolio expansion based solely on active releases.
- `PhysicalLabEnvironment`/`PhysicsStage` and `LabSpace` are shared presentation components. Kit apparatus, model state/output, rubric, activity, release identity and evidence remain Lab-specific.
- Production deployment/migration infrastructure is not evidenced by the repository workflow inspected on 2026-11-01. The production operator and deployment mechanism remain an explicit unresolved operational dependency.

## Non-goals

- This specification does not authorize a production deploy, migration, database mutation or Lab publication.
- It does not add independent reviewer gates, certify science/curriculum/safety/rights, or change the current release policy.
- It does not claim that every Lab in the portfolio is implemented, rendered or production-ready.
- It does not define a direct SQL production data migration or bypass the Admin Lab Release API.

## Success signal

A Lab author can hand off a candidate with one complete tuple and evidence bundle; an operator can identify the exact compatible app code and schema prerequisites, use an approved production pipeline, activate only the intended digest, and verify or quarantine it without confusing a technical pilot with curriculum approval.

## Assumptions

- The target remains the existing NexaLab Lab Release lifecycle and ADMIN-only API described by the current source.
- Current release inventory was checked using SELECT-only Supabase readback on 2026-11-01 and may change; repeat the readback before any later operational action.
- Existing lab-specific specs remain authoritative for scientific content and individual acceptance criteria; this spec centralizes lifecycle and handoff only.

## Open Questions

- Which approved production deployment system owns the BE/FE rollout, migration job, backup/restore verification and production health checks?
- If independent CURRICULUM, SUBJECT, MODEL, SAFETY or RIGHTS reviews are needed later, which must become mandatory? Developer/agent check notes currently do not authenticate separate reviewers.
- What representative school devices, accessibility checks and performance thresholds close the remaining P3.6 acceptance work?
