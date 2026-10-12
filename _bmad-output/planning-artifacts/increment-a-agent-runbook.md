---
title: Increment A Agent Runbook
status: ready
updated: 2026-10-12
scope: A1-A5 implementation handoff only
---

# Increment A Agent Runbook

This file tells a coding agent what to implement; it does not authorize skipping predecessor gates or marking unavailable integration/E2E as passed.

## Branch and merge model

Each epic touches both sibling repositories. Create the same logical branch name in each repository, for example `codex/a1-assigned-learning` in both `nexalab-be` and `nexalab-fe`. A Git branch cannot span two repositories, so an epic normally produces two coordinated branches/PRs linked to the same spec and API contract.

Merge order is `A1 → A2 → A3 → A4 → A5`. Do not start A2 implementation from main until A1 schema/API contract is merged and its real runtime gate passes; repeat for every successor. If the team must work in parallel, downstream agents may prepare review-only UI/tests against frozen contract fixtures, but they must rebase and run real integration after the predecessor merges.

Within A1, authentication is the first functional prerequisite after database configuration. If one member owns authentication independently, use coordinated branch `codex/a1-auth-foundation` in both repositories for A1-T0 and A1-T1. Merge and runtime-verify that branch before starting `codex/a1-assigned-learning` for A1-T2 through A1-T4. Do not build a second auth stack or a mock-login bypass.

## Standard instruction prefix

Paste this before the epic-specific block in a fresh Codex task:

```text
Use $bmad-build. Work across D:\coding\nexalab-be and D:\coding\nexalab-fe for exactly this epic. Before editing, read both AGENTS.md files, the PRD, Architecture Spine, the epic SPEC.md and tickets.md, then inspect current source and Git status. Preserve existing changes. Implement tickets in order as vertical slices. Backend is authoritative for auth, RBAC, ownership, learning gates, simulation result/verdict and official progress. Supabase is managed PostgreSQL only; Prisma/NestJS remain the application boundary. Never put database or service credentials in VITE_* variables or frontend code. Update backend route schema/OpenAPI/contracts and frontend consumers in the same ticket. Distinguish source, automated, runtime and production verification. Do not mark integration/E2E passed unless Supabase, seed, API, frontend and browser actually ran. Stop and report before expanding scope or changing a Product Owner decision.
```

## A1 command to the agent

Branch in both repos: `codex/a1-assigned-learning`

```text
Implement Epic A1 from D:\coding\nexalab-be\_bmad-output\specs\spec-provisioned-student-starts-assigned-learning\SPEC.md. Read implementation-contract.md and tickets.md. Execute A1-T0 through A1-T4 in order. First establish the non-production Supabase pooled runtime URL versus direct/session migration URL, guarded migration/seed behavior and idempotent seed. Then complete provisioned student login/password gate, applicable assignment ordering/direct-open authorization, and the real A1 browser verification. Do not implement A2 materials.
```

If authentication is assigned separately, give the authentication agent this narrower command first:

```text
Use $bmad-build to implement only A1-T0 and A1-T1 from the A1 SPEC, implementation-contract.md and tickets.md on coordinated branch codex/a1-auth-foundation in both repositories. Configure the guarded Supabase/Prisma data path, non-production seed personas, provisioned Student username login, temporary-password gate, refresh/logout/revocation and negative ownership/session cases. Students must not self-register. Seed personas must use real API guards and environment-provided credentials; do not add quick-login or mock-auth bypasses. Run real Supabase/API/frontend/browser verification and stop before assignment work.
```

After that branch is merged, the A1 assignment agent starts from updated main and executes only A1-T2 through A1-T4.

Required completion commands, adjusted only if the repository scripts change:

```powershell
# backend
npm run db:generate
npm run db:migrate
npm run db:seed
npm run lint
npm test
npm run build
npm run test:integration

# frontend, with the real API configured and running
npm run lint
npm run build
npm run test:e2e
```

`db:migrate`, `db:seed`, integration and E2E are runtime gates only when the intended non-production Supabase project and all dependencies are actually configured. Never use `prisma migrate dev`, `db push`, or reset against pilot/production.

## A2 command to the agent

Branch in both repos: `codex/a2-core-learning-materials`

```text
Implement Epic A2 from D:\coding\nexalab-be\_bmad-output\specs\spec-student-core-learning-materials\SPEC.md and tickets.md. Confirm A1 runtime acceptance first. Execute A2-T1 through A2-T5 in order: authoritative ordered pathway, reading evidence, video/equivalent high-water completion, study cards, then resilience/performance verification. Preserve the A1 contract and do not implement quiz scoring or lab execution beyond the visible locked boundary.
```

Run the same backend/frontend command groups as A1 plus the A2-specific migration/backfill, contract, component, accessibility and real browser scenarios named in the tickets.

## A3 command to the agent

Branch in both repos: `codex/a3-quiz-learning-gate`

```text
Implement Epic A3 from D:\coding\nexalab-be\_bmad-output\specs\spec-student-quiz-learning-gates\SPEC.md and tickets.md. Confirm A2 runtime acceptance first. Execute A3-T1 through A3-T4 in order. Retain every quiz attempt, keep answer keys server-only, enforce the 50% gate on the backend, make submissions idempotent, and update the frontend only from the reconciled server response. Do not add teacher override or short-answer grading.
```

Run the common command groups and the exact-boundary, duplicate-delivery, privacy, contract and failed→passed→unlocked real-dependency scenarios in A3 tickets.

## A4 command to the agent

Branch in both repos: `codex/a4-circuit-lab-retry`

```text
Implement Epic A4 from D:\coding\nexalab-be\_bmad-output\specs\spec-student-verified-lab-challenge-retry\SPEC.md and tickets.md. Confirm A3 runtime acceptance first. Execute A4-T1 through A4-T4 in order for the circuit representative only. Enforce the quiz gate, version the shared deterministic sim package, ignore client result/verdict, recompute and persist official evidence atomically, preserve input on failure and retain every retry. Do not expand to other labs or AI.
```

Run the common command groups plus `packages/sim` tests, tamper/idempotency/rollback tests, preview-versus-server parity corpus, accessibility/fallback checks and the real partial→retry→passed browser flow.

## A5 command to the agent

Branch in both repos: `codex/a5-progress-history`

```text
Implement Epic A5 from D:\coding\nexalab-be\_bmad-output\specs\spec-student-progress-attempt-history\SPEC.md and tickets.md. Confirm A4 runtime acceptance first. Execute A5-T1 through A5-T5 in order. Build self-scoped evidence-backed progress, drill-down and stable cursor history, then projection drift check/rebuild. Finish by running the complete A1→A5 real-dependency journey and negative authorization/tamper/recovery suite. Do not implement teacher analytics, parent views or leaderboard.
```

Run the common command groups plus pagination, ownership, rebuild idempotency, responsive/accessibility and full Increment A runtime scenarios named in A5 tickets.

## What every agent must report

1. Tickets completed and files changed in each repository.
2. Schema/migration/API contract changes and backward-compatibility notes.
3. Source verification performed.
4. Automated commands with actual pass/fail output.
5. Runtime dependencies that really ran and their results.
6. Production verification status, normally `not run` until deployed.
7. Remaining risks or decisions; never silently invent a new Product Owner choice.
