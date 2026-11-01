# Foundational Lab release and migration runbook

**Verified against source and read-only release inventory: 2026-11-01.** Recheck the target before acting; this document is not a production authorization.

**FL-06 execution receipt:** publication completed through the authenticated Admin API at `2026-11-01T17:02:37.270Z`; Supabase readback confirms v1 ACTIVE, `SHARED_LIBRARY`, `releaseCleared=true`. Exact receipt: [`docs/operations/fl06-release-receipt.json`](../../../docs/operations/fl06-release-receipt.json). The operator's explicit authorization covered candidate creation, automated OWNER_SIGNOFF and publication. Credentials are not stored in the receipt or repository.

## Repeatable FL-06 publication (use this path)

Use the compatible BE checkout and FE renderer with the intended database already configured. An authorized local API connected to the shared Supabase database can perform this administrative content operation; a separate hosted deployment workflow is not needed to create the database release. Verify hosted FE/BE rollout separately before claiming the code is available on a hosted site. Push, schema migration, candidate creation and content activation are separate operations.

1. Set `NEXALAB_API`, `NEXALAB_ADMIN_EMAIL` and `NEXALAB_ADMIN_PASSWORD` in the current shell or secret store. Example API: `http://127.0.0.1:4000/api`. Use the actual Admin account password; `SEED_PASSWORD` only describes seed configuration and may differ from the current account. Never reset a shared Admin password or print tokens to repair a login failure.
2. Run `npm run release:fl06` for a read-only authentication/inventory preflight. Review `content/simulation-packs/fl06-candidate.json`, including owner evidence. It pins four real registry codes `KHTN8-B18-O01/O02`, `KHTN8-B19-O01/O02`, both released Lesson packs and the six model golden cases.
3. With authorization to create the candidate, run `npm run release:fl06 -- --apply`. `POST /admin/labs` checks the registered model, active topic and existing LabRunEvent schema, then creates an audited **private draft Lab + Challenge**. Existing different content is rejected. Existing APIs create/reuse the immutable practical, validate configuration and pack golden cases, activate their technical versions and snapshot the two Lesson bindings. No shared Lesson is edited. No SQL seed or direct database insert is used.
4. With explicit authorization to approve/publish, run `npm run release:fl06 -- --publish`. This includes step 3, verifies the snapshot SHA-256, exact model/rubric/config/pack/activity and Lesson/Outcome bindings, then submits the manifest's evidence through the authenticated ADMIN `/publish` endpoint. The server records OWNER_SIGNOFF for that exact digest and activates atomically. Set `FL06_EXPECTED_DIGEST` to enforce an externally supplied digest as an additional check. `--publish` is explicit authorization to sign the verified candidate automatically; no independent subject review is implied.
5. Optionally set `FL06_RECEIPT_PATH` to save the non-secret receipt. The script reads back ACTIVE status, shared visibility and matching approval receipt, and compares all other Labs' visibility and release fingerprints before/after. Running the same command again reuses the same candidate and ACTIVE release; it does not issue another approval or rewrite a snapshot. Changed candidates require a reviewed successor and compatible activity/rubric versions.
6. Use Supabase SELECT-only readback to independently verify the Lab, active config/pack, release digest and receipt. Verify discovery with a real authorized UI session; run scored/persistence E2E against isolated PostgreSQL, not the shared database. The FL-06 live UI smoke used the real student session and submitted no attempt.

**Migration precondition:** FL-06 adds no Prisma schema. The existing `20261031130000_fl10_run_events` migration supplies the generic `LabRunEvent` table (evidence isolated by runId), and the owner-signoff migration supplies approval evidence. Both were verified on Supabase. The candidate-create API fails with `LAB_SCHEMA_MIGRATION_REQUIRED` before writing a Lab if the event table is absent. Candidate provisioning is a data operation through Admin APIs; a schema migration never creates the Lab automatically. Do not invent a duplicate table or empty migration. For genuinely missing DDL use the approved schema deployment procedure below; the content script does not bypass the isolated migration guard.

## 1. Keep the three operations separate

| Operation | Changes | Current mechanism/evidence | Must not be confused with |
|---|---|---|---|
| BE/FE code deployment | Server/API and browser code, model registry, renderer, shared environment | Repository commits, CI checks, approved deployment pipeline | A LabRelease or a DB migration |
| Prisma schema/data migration | Database structure and any explicitly defined migration data | `prisma/migrations/*`; local command is `npm run db:migrate`, whose pre-hook requires loopback DB | A content release; CI's ephemeral DB is not production |
| Lab content publication | Immutable snapshot of Lab + model/config + pack + activity + bindings; activates a version | ADMIN-only `/admin/labs/:id/releases` lifecycle and LabRelease digest | A code deploy or migration |

**Production migration limitation:** The checked repository has CI on ephemeral PostgreSQL and a local migration guard that rejects remote DB URLs. No approved production migration job/command was found. Do not run `npm run db:migrate`, raw Prisma, SQL or seed/backfill scripts against production. Before a production schema change, the service owner must identify and document the approved deployment pipeline, backup/restore evidence, migration monitoring and recovery owner. Until then, production schema deployment is not a reproducible, repository-documented procedure.

## 2. Candidate handoff (author → integrator)

Attach these to the candidate change before asking for deployment:

1. Lab ID, kit, activity key/version, model ref/version, config version, pack version and exact intended Lesson/Outcome bindings. Keep model/activity and their state/output contracts separate across Labs even when the room is shared.
2. Source identity, edition, locator, rights/provenance status, curriculum mapping status, learning objective, rubric, golden cases, explicit model limitations and safety assessment. Mark proposals and technical assumptions as such; never promote them to approved sources by inference.
3. FE renderer registry entry and a working route for the exact model/renderer pair; explain reuse of `LabSpace`, `PhysicalLabEnvironment` and/or `PhysicsStage`, plus kit-specific apparatus. Reject renderer-only evidence as scientific output or scoring evidence.
4. BE server-evaluator registration, deterministic/versioned model contract, pack/config validation, run-bound assignment tuple and replay compatibility. Confirm `packages/sim` version/tarball compatibility where used.
5. Tests/evidence appropriate to the slice: unit/contract, isolated BE+PostgreSQL, FE browser, and (where available) a real FE→BE→isolated DB flow. Label synthetic fixtures and mocked browser evidence. Do not imply one verifies the other.
6. List every Prisma migration needed (or “none”), code commit SHAs, known backward-compatibility requirements, and unresolved phase/device/accessibility/reviewer gates.

Use `lab-pipeline-phase-plan.md` as the phase authority and the Lab-specific spec as the scientific/activity authority. A prototype, build pass or isolated pilot is not curriculum approval or a production release.

## 3. Pre-deployment gates

Before scheduling the approved deployment pipeline, record a release ticket/checklist containing:

- Target environment and accountable operator; exact BE and FE commit SHAs; CI/build evidence; compatible FE renderer and BE model registry for the intended tuple.
- Migration IDs and compatibility/order assessment (or explicit none). Prefer additive/backward-compatible rollout when old and new app instances or assignments can overlap; destructive cleanup is a separately reviewed later step.
- Current active LabRelease/version/digest and active assignment impact. An active release is immutable; make a successor for content or tuple changes.
- Exact candidate digest from the target's Admin API; intended Lesson/Outcome binding readback; current required reviewer kinds; developer and agent check notes; and any independently completed review evidence. New drafts require `DEV_APPROVAL`.
- Isolated evidence for launch pinning, server recomputation, persistence/replay, authorization, idempotency, duplicate submission, F5/draft recovery, and quarantine as applicable. Never seed synthetic review receipts into production.
- Accessibility, representative-device/performance, safety/rights and monitoring status. Explicitly record open items; do not relabel phase acceptance as passed because a release is active.

If any prerequisite fails, stop before activation and resolve through a new candidate/change. Do not patch an active release snapshot.

## 4. Deploy and migrate (platform owner step)

1. Deploy compatible BE code and renderer support using the approved production pipeline; avoid activating content that requires code not yet serving traffic.
2. Apply only the reviewed, ordered Prisma migrations through the approved production migration job. The job must target the declared production database, capture migration output and `prisma migrate status`/equivalent evidence, and have documented backup/restore and failure ownership. These are required controls, not currently implemented commands in this repository.
3. Deploy/confirm FE support for the intended renderer and environment; verify FE/API compatibility and health/readiness in the target environment.
4. If the migration or deployment mechanism is not available, stop. Do not use local developer credentials or the loopback-guarded command as a workaround.

For local/CI verification only, use an isolated loopback PostgreSQL database and guarded `npm run db:migrate`; set `NEXALAB_ISOLATED_DATABASE_URL`, `DATABASE_URL` and `DIRECT_URL` to the same dedicated host, port and database. Never point those at Supabase or another remote database. CI's service database is temporary test evidence only.

## 5. Publish the immutable Lab content release

The current API is under `AdminLabsController` with class-level `@Roles("ADMIN")`:

1. Read the release list for the Lab in the intended environment. Create a draft via `POST /admin/labs/:id/releases`; the service snapshots the validated active tuple, bindings and review policy. Save the returned version and 64-character digest.
2. Review the snapshot and bindings against the handoff. Ensure the FE renderer and BE evaluator for this exact model are already deployed. Compare the intended digest exactly; do not rely on “latest” or a Lab title.
3. New drafts normally snapshot `reviewPolicy: "DEV_APPROVAL_V1"` and `requiredReviewKinds: ["DEV_APPROVAL"]`. FL-06 (`lever-equilibrium`) is the owner-decided exception: its new drafts snapshot `OWNER_SIGNOFF_V1` and require the exact-digest owner evidence (`curriculumMapping`, `sourceReferences`, `scientificGoldenCases`, `rubric`, `safetyAssessment`, `rightsAssessment`). In the Admin release screen, review the exact digest and submit the evidence for that snapshot policy. `POST /admin/labs/:id/releases/:releaseId/publish` records the authenticated ADMIN approval and activates atomically. Older snapshots retain their recorded policy and receipts.
4. Existing delegated review types (`CURRICULUM`, `SUBJECT`, `MODEL`, `SAFETY`, `RIGHTS`, `RANGE`) only gate activation when they are in that release snapshot's required kinds. Do not assume adding a review receipt manually changes the snapshot policy. Older releases preserve their own policy.
5. The lab-specific scripts `scripts/release-fl10-mass-conservation.mjs` and `scripts/release-em-induction.mjs` use the Admin API rather than direct DB writes. FL-10 is list-only by default and requires explicit draft/publish flags, exact expected digest and evidence for publication. FL-25 has a migration precondition and an opt-in publish flag. They are examples, not a generic production deploy pipeline; verify API target and authorization before any later use.

## 6. Post-activation verification and recovery

Record a read-only target readback of Lab ID/status/scope/releaseCleared, active release version/status/digest, pinned tuple and required review kinds; confirm the exact expected digest is active. Verify student discovery/access, assignment launch against the pinned tuple, server-side evaluation and stored attempt/replay with authorized test identities/environment. Do not create synthetic production attempts to satisfy a checklist. Capture API logs/health and operator/time.

Activation supersedes the previous active release; it does not rewrite its snapshot. The activation endpoint can reactivate a `SUPERSEDED` version after its review policy and digest checks, so a deliberate rollback must identify the exact old release and assess assignment/history implications. Quarantine is a containment action: it revokes evaluation for the pinned pack, can quarantine the dependent active release and clear `releaseCleared`; it is not equivalent to rollback. Preserve audit/history and follow the incident owner’s recovery decision.

## 7. Current completed-release baseline (read-only check, 2026-11-01)

| Lab | Active release | Scope/clearance | Current review requirement | Limits |
|---|---:|---|---|---|
| Circuit (K1) | v2 | `SHARED_LIBRARY` / true | `OWNER_SIGNOFF` | Does not close P3.5; representative-device/accessibility and other P3.6 acceptance remain |
| Density / FL-03 (K3) | v1 | `SHARED_LIBRARY` / true | `OWNER_SIGNOFF` | Active limited-scope activity; curriculum/source and QA gates remain |
| EM Induction / FL-25 (K1) | v1 | `SHARED_LIBRARY` / true | `OWNER_SIGNOFF` | Active does not imply P3.5/P3.6 gate completion; outcome/source, device, accessibility remain |
| Mass Conservation / FL-10 (K2) | v1 | `SHARED_LIBRARY` / true | `OWNER_SIGNOFF` | One activity only; does not complete broader mol/stoichiometry portfolio |
| Gene Protein / FL-27 | v1 | `SHARED_LIBRARY` / true | `OWNER_SIGNOFF` | Fresh Supabase readback; independent subject/device acceptance is a separate claim |
| Lever Equilibrium / FL-06 (K5) | v1 | `SHARED_LIBRARY` / true | `OWNER_SIGNOFF` | Digest `fff052879326482b47f5eeb59cc01852ccf11df228e8f3b4f3117b8b082f99bd`; Technical Assumption B18/B19; full receipt linked above |
| Chemistry, Eye | none | `CLASS_PRIVATE` / false | n/a | No active shared LabRelease in this readback; prototypes/rows are not shared releases |

These are current database facts, not proof of production FE/API deployment, school-device acceptance, independent review or all curriculum outcomes. Re-query the target before a release decision.

**FL-20 check:** The portfolio documents FL-20 as a proposed KEEP/W4 ecology activity (tolerance curve, population density and age-structure concepts), with source/mapping and model assumptions still requiring review. `gene-protein` is the separate FL-27 release; its ACTIVE status does not count as FL-20 acceptance.

## 8. P3.1–P3.7 status and reuse map

| Phase | Verified status from canonical phase plan (2026-11-01) | What a Lab developer should carry forward |
|---|---|---|
| P3.1 Define | Technical definition complete; portfolio/outcome decisions remain proposals | Start from the canonical catalog and bounded activity spec; do not treat candidate counts as approved curriculum |
| P3.2 Platform Build | Complete for documented isolated slices | Use launch-bound tuple, server-authoritative deterministic evaluator, shared host/registry and compatibility contract; isolated completion is not production evidence |
| P3.3 Curriculum/science | Open | Keep source authority, exact Outcome text, mapping and qualified reviewer status explicit |
| P3.4 Technical pilot | Isolated Circuit pilot passed | Reuse verified attempt/replay/recovery patterns; keep synthetic fixture evidence labelled |
| P3.5 Compatibility | Technical fixture passed; phase gate still NOT MET | Chemistry pH is regression-only technical fixture; active shared releases do not retroactively satisfy the genuine pilot mapping/model review gate |
| P3.6 Release/Class Lab | Four shared releases active; acceptance remains open | Reuse release lifecycle and class assignment pinning; confirm target FE/API, accessibility and representative-device evidence |
| P3.7 Expansion | Still gated | Do not infer portfolio completion; preserve ≤2 concurrent tracks and close review/QA gates |

Shared code boundaries: `LabSpace` is the product shell; `PhysicalLabEnvironment`/`PhysicsStage` provides room/bench presentation reused across K1/K2/K3. Each kit retains its apparatus, model, state/output, rubric, activity and release identity. Shared environment reuse demonstrates implementation reuse, not scientific equivalence or kit readiness.

## 9. Sources of truth and update rule

- Phase gates: [`lab-pipeline-phase-plan.md`](../spec-lab-pipeline/lab-pipeline-phase-plan.md).
- Pipeline contract and review semantics: [`pipeline.md`](../spec-lab-pipeline/pipeline.md), [`contract-v1.md`](../spec-lab-pipeline/contract-v1.md).
- Kit/portfolio and component boundaries: [`lab-catalog-and-shared-kits-khtn8-9.md`](../spec-lab-pipeline/lab-catalog-and-shared-kits-khtn8-9.md).
- Lab behavior/readiness: the relevant FL-03, FL-10, FL-25 and Circuit specifications and implementation evidence listed in `SPEC.md`.
- Executable release semantics: `src/modules/labs/application/lab-release.service.ts`, `src/modules/labs/interface/admin-labs.controller.ts`, and the guarded migration check `scripts/assert-isolated-db.mjs`.

Update this runbook whenever release policy, migration/deploy pipeline, tuple contract or lifecycle endpoints change. Update date-stamped inventory only after a fresh read-only query. If independent review becomes policy, first change the release snapshot policy and tests; do not document it as a gate before code enforces it.
