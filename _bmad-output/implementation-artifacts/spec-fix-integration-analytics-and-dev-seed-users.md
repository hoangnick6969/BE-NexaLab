---
title: "Fix integration analytics assertion and add development seed users"
type: "bugfix"
created: "2026-10-12"
status: "done"
route: "oneshot"
review_loop_iteration: 0
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The integration assertion treats a teacher analytics response as empty even after that teacher provisions an approved student, causing a false CI failure. Local developers also need predictable, non-production accounts to exercise ownership and Student first-login states.

**Approach:** Assert that a pending join request is excluded without hiding already approved students, remove analytics ordering dependence, and extend the guarded idempotent seed with environment-configured development personas.

</frozen-after-approval>

## Implementation Notes

- Corrected the integration assertion to distinguish the approved provisioned student from the pending student, and selected the traced student by ID rather than result order.
- Added non-production, environment-configured seed personas for ownership, temporary-password, returning-student, and cross-class checks. Fixture credentials reset only when `SEED_RESET_FIXTURES=true`.
- Reviewed the seed path for stable primary keys and identity collisions; integration now confirms two seeded fixture login states.

## Review Triage Log

- `medium` — Fixed configurable identifier re-seeding by upserting each fixture through its stable fixture ID; a reset may then update the configured identity.
- `medium` — Fixed configured identity collisions by rejecting any email or username already owned by a different user before fixture creation or reset.
- `low` — Added integration coverage for seeded teacher-owner and temporary-student logins. Re-seed/reset behavior remains runtime verification because it requires the actual seeded database; local PostgreSQL is not available in this workspace.
