---
id: SPEC-c2-admin-operations
status: ready-for-implementation-with-per-asset-and-content-release-gates
companions:
  - tickets.md
  - ../spec-b0-platform/SPEC.md
  - ../spec-content-foundation/SPEC.md
  - ../spec-c1-parent-progress/SPEC.md
  - ../../planning-artifacts/architecture-spine-nexalab-release-1/ARCHITECTURE-SPINE.md
sources:
  - ../../../docs/product/prd.md
  - ../../planning-artifacts/increment-b-c-plan.md
---

> **Canonical contract.** This SPEC and its companions define Epic C2. Implement after C1 runtime acceptance.

# C2 — An Admin Operates the Platform Without Bypassing Controls

## Why

NexaLab needs a highest-priority operator who can recover accounts and govern shared taxonomy, content, simulations, sources, and assets while preserving evidence, ownership history, review gates, and scientific authority.

## Capabilities

- **CAP-1 — Safe user lifecycle:** admin lists, creates, disables, reactivates, and conditionally deletes users; success means session revocation and referential integrity never erase protected evidence.
- **CAP-2 — Taxonomy and shared-content operations:** admin manages Grade 8–9 KHTN taxonomy and released shared content; success means duplicate identifiers conflict and no admin action substitutes for required subject/rights review.
- **CAP-3 — Versioned simulation operations:** admin manages availability and technical compatibility of reviewed practical/model/topic packs; success means new changes affect future attempts and old attempts remain reproducible.
- **CAP-4 — Adult account recovery:** adults reset through a one-time 60-minute link; success means email existence is not disclosed and all existing sessions are revoked after reset.
- **CAP-5 — Asset and source governance:** admin curates shared assets and source policies and may quarantine/reassign private assets with reason; success means referenced versions and attribution cannot be silently broken.
- **CAP-6 — Auditable admin console:** every destructive or privilege-sensitive action is explicit and traceable; success means non-admin roles are denied and admin audit reads are also audited.

## Constraints

- Disable is the default for any user with evidence, audit references, enrollment/link history, or ownership. It sets `status=disabled`, revokes all sessions in the same transaction, preserves evidence for the PRD retention window, and writes allowlisted before/after audit fields.
- Hard delete is allowed only when a server-side eligibility query finds no Attempt, QuizAttempt, StepProgress, Progress, SavedExperiment, Enrollment, ParentLink/ParentLinkCode, ConsentRecord, class/content/asset ownership, or AuditLog actor/target reference. Sessions and unused auth tokens are revoked/deleted as part of the same transaction. Never delete the acting admin or the last active admin.
- Disabling an owner requires explicit resolution for every active owned class: reassign to an active teacher or archive it. Shared content/assets must be reassigned or quarantined; private drafts may be reassigned or archived. Missing resolution returns 409 `OWNERSHIP_RESOLUTION_REQUIRED`; no implicit owner rewrite is allowed.
- Admin may inspect, quarantine, archive, or reassign content/assets with a reason and audit. Admin may publish only a version whose editorial, named subject, rights, and applicable scientific/safety gates already pass. Admin identity is never a scientific or rights attestation.
- Published content, asset, model, binding, challenge, and configuration versions are immutable. Changes create new versions for future assignments/attempts; historical evidence keeps exact version references.
- `auth/login` rejects ADMIN; admins use `auth/admin/login`. Forgot-password always returns the generic message, stores a hashed one-time token expiring after 60 minutes, and revokes every session on successful reset. Students continue teacher-managed password reset.
- Asset validation is configuration-driven by type and includes extension/MIME/magic bytes, size, full SHA-256, security/media status, ownership/scope, and reference checks. Video follows Q-DATA-01; non-video production limits require Q-C2-03 approval. Per-template simulation units/ranges/golden cases require named subject review; the common validator can ship before individual packs.
- SourceRegistry changes only govern allowed ingestion. Ingestion stages candidates and never auto-publishes. A crawl or API connector remains bounded to approved hosts/paths/types/rates and item licenses.
- Audit reads are admin-only, paginated, filterable by actor/action/target/time, redact protected fields, and create their own access audit event. Teacher/Parent/Student admin-route calls return 403.

## Non-goals

- Admin-authored scientific approval, forced publication, evidence editing, unrestricted crawling, publisher-viewer scraping, binary replacement in place, automatic GLB LOD generation/visual-quality scoring, or permanent deletion that bypasses the eligibility query.

## Success signal

An admin safely disables and recovers a user, is prevented from deleting a referenced user or the last admin, manages taxonomy and a reviewed shared release, versions a simulation configuration without changing old attempts, resets an adult account by one-time link, and quarantines/reassigns an asset without orphaning content. Every action and audit read is traceable; non-admin roles are denied.

## Release gates

- Product/legal approves the C1 consent copy/version before parent activation.
- Q-DATA-01 and Q-C2-03 approve production size/type budgets before production uploads are enabled.
- Each released simulation template supplies subject-reviewed units, ranges, golden cases, and compatibility metadata under Q-C2-04.
