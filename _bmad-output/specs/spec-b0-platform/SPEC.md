---
id: SPEC-b0-platform
status: done  # 2026-10-15: T1–T4 done; local + shared Supabase dev verified, production unverified; see implementation-artifacts/b0-platform-implementation.md
companions:
  - tickets.md
  - ../../planning-artifacts/architecture-spine-nexalab-release-1/ARCHITECTURE-SPINE.md
sources:
  - ../../../docs/product/prd.md
  - ../../planning-artifacts/increment-b-c-plan.md
---

# B0 Platform — Shared Delivery Foundation

## Why

Increment B/C needs stable API errors, auditable mutations, reliable cross-repository verification, and safe external-provider calls before teacher, parent, and admin workflows can be trusted.

## Capabilities

- **CAP-1 — Stable API error contract:** clients receive a consistent HTTP status, machine-readable code, message, and optional safe details; success means current A APIs remain compatible while new B/C consumers can branch on `code`.
- **CAP-2 — Transactional audit evidence:** security-sensitive mutations record actor, target, outcome, reason, and allowlisted before/after fields; success means the business mutation and its audit record commit or roll back together.
- **CAP-3 — Real-dependency journey harness:** B/C journeys run against configured API, database, and browser using environment-driven identities; success means results identify the actual evidence tier and never rely on mock authentication.
- **CAP-4 — Bounded hint provider boundary:** external provider latency does not hold database transactions or advisory locks; success means authorization is rechecked before persisting or returning provider output.

## Constraints

- Zod and existing route conventions remain the request boundary; backend owns authorization and persisted outcomes.
- Audit before/after uses an explicit allowlist and redaction. Never log passwords, tokens, one-time codes, answer keys, hint bodies, raw simulation payloads, or unnecessary sensitive data. Audit reads are admin-only and themselves auditable.
- Audit write failure aborts a protected mutation. Rejected unauthenticated requests and ordinary malformed inputs are not automatically audit events unless policy requires it.
- Preserve `message` during error-envelope migration. Do not repeat A5 auth-guard optimization or benchmark work in B0.
- Report source, automated, local runtime, pilot, and production evidence separately.

## Non-goals

- New product screens or domain workflows; generalized observability platform; AI/provider redesign; production readiness claims based on local checks.

## Success signal

Existing and new API clients receive stable error codes; sentinel secrets are absent from AuditLog; a forced audit write failure rolls back the protected mutation; real B/C journey harnesses use configured seeded identities; a delayed hint provider call holds no database transaction and cannot persist after authorization is revoked.

## Open questions

- No product decision remains open for this track. Route-level choices must follow the error and audit contracts below and the plan's D14/D15.
