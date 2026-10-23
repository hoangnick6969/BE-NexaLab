---
id: SPEC-c1-parent-progress
status: ready-for-implementation-with-consent-copy-release-gate
companions:
  - tickets.md
  - ../spec-b0-platform/SPEC.md
  - ../spec-b2-teacher-evidence/SPEC.md
  - ../../planning-artifacts/architecture-spine-nexalab-release-1/ARCHITECTURE-SPINE.md
  - ../../../../nexalab-fe/docs/design/10-PARENT-UX-DEFINITION.md
  - ../../../../nexalab-fe/docs/design/09-TEACHER-UX-DEFINITION.md
sources:
  - ../../../docs/product/prd.md
  - ../../planning-artifacts/increment-b-c-plan.md
---

> **Canonical contract.** This SPEC and its companions define Epic C1. Implement after B2 runtime acceptance.

# C1 — A Parent Follows a Linked Child Safely

## Why

Parents need a small, trustworthy read-only view of a child's assigned learning. Access must come from a school-verified guardian relationship, not from knowing a student identifier or controlling an email address.

## Capabilities

- **CAP-1 — Teacher-issued relationship invitation:** the responsible teacher verifies the guardian against school-held records and issues a one-time code; success means neither a student nor an admin can substitute for this verification step.
- **CAP-2 — Explicit link activation:** a parent redeems the code and completes email verification plus versioned consent; success means only an approved, non-revoked link grants progress access.
- **CAP-3 — Linked-children list:** a parent sees their approved children and their own pending links; success means no unrelated child existence or progress is disclosed.
- **CAP-4 — Read-only progress:** a parent sees assignment-scoped completion, remaining work, quiz summaries, practical summaries, and activity time; success means every value uses the same evidence derivation as the student and teacher views.
- **CAP-5 — Limited evidence detail:** a parent can understand a permitted score, count, or verdict; success means answer keys, selected answers, hints, raw lab state, and teacher-private notes never leave the server.
- **CAP-6 — Immediate unlink:** parent, responsible teacher, or admin can revoke a link; success means protected data disappears on the next read while learning evidence remains unchanged.

## Constraints

- Before redemption, the invitation is a `ParentLinkCode`, not a `ParentLink`. It records student, issuing teacher, owned active class, guardian-verification time, expiry, state, and a key-versioned HMAC of the code. Do not store guardian documents or the raw code.
- Display code format is `NP-XXXXX-XXXXX-XXXXX-XXXXX` using 20 Crockford Base32 secret characters (100 bits). It is shown once, expires after seven days, and becomes unusable after consume/revoke. Idempotent issuance may replay the same encrypted response to the same issuer for 10 minutes; plaintext never enters the link-code row, audit, or logs.
- Only a teacher with an approved student enrollment in an owned active class may issue. Admin may revoke or audit but may not assert guardian verification or issue in place of the teacher. Student-generated `POST /parent-code` and `User.linkCode` are removed.
- Redemption creates `ParentLink(status=pending)`. In the same transaction it becomes `approved` when the parent has a verified email and current `PARENT_CHILD_PROGRESS` consent. Completing either prerequisite later atomically re-evaluates the pending link. Code expiry after successful redemption does not cancel a pending link. Read access requires `status=approved` and `revokedAt=null`.
- Consent is append-only: `userId`, purpose, version, content hash, actor user ID, accepted timestamp, and withdrawn timestamp. The approved Vietnamese consent copy/version is a release input; code must not hardcode acceptance as an unversioned boolean.
- Code redemption uses a shared limiter: IP + parent account permits five failures/10 minutes then locks 15 minutes; account permits 15 failures/hour then locks one hour; IP permits 30 attempts/hour then locks one hour. Invalid, expired, used, and revoked codes return the same 400 `LINK_CODE_INVALID` response and equivalent verification path.
- One parent may link multiple children and one student may link multiple parents. An existing active pair is replay-safe; a revoked pair requires a newly issued code. `revokedAt` preserves link history while removing access.
- Parent child routes return the same 403 `PARENT_LINK_REQUIRED` for an unlinked, revoked, pending, or nonexistent student ID and write a safe denial audit. Parent methods that mutate learning data are forbidden.
- Progress is assignment-scoped. `latestQuiz` is newest by `(createdAt,id)`; `bestQuiz` is highest score with newest tie-break; practical count includes persisted attempts for that assignment and exposes the latest verdict plus whether any passed. `lastActivityAt` is the maximum timestamp of a StepProgress advance, QuizAttempt, or practical Attempt for that assignment. Overrides, page views, auth, and link events do not count.
- Active assignment summaries use required-step completion from B2/A5. Archived evidence may appear in cursor activity/history but not the active completion denominator. Parent detail returns only identifiers, label/title, time, score/pass or verdict/attempt number, and source availability.

## Non-goals

- Parent-teacher messaging, weekly/monthly reports, peer comparison, predictive labels, parent editing, relationship-document upload, answers, hint contents, raw simulation state, or using email verification as proof of parentage.

## Success signal

A responsible teacher issues a seven-day code after recording guardian verification; a verified and consented parent redeems it, sees only the allowed assignment-scoped progress and evidence for that child, then unlinks and loses access on the next read. Another parent and every guessed student ID receive the same non-enumerating denial.

## Release gate

- Product/legal must approve the exact Vietnamese consent text, purpose, version, and content hash before pilot activation. The versioned consent model and UI flow may be implemented against a clearly marked development copy first.

## Implementation notes

- 2026-10-23 (branch `test/codebase-flow-review-2026-10-22`, in review): email verification now uses a mailed one-time link (`POST /auth/email/verify/request`, public token-based `POST /auth/email/verify`); pending links are approved only when both the verified email and current consent exist and are re-evaluated when either completes; `GET /children/link-status` lists the parent's prerequisites and pending links (CAP-3); redemption follows the §40 limits with a uniform `LINK_CODE_INVALID`; parent denials return `PARENT_LINK_REQUIRED` and are audited (§42). Limits are per-process, in memory.

