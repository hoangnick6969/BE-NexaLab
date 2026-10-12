---
title: NexaLab Release 1 Epic Breakdown
status: ready-for-implementation
created: 2026-10-12
updated: 2026-10-12
source: docs/product/prd.md
architecture: architecture-spine-nexalab-release-1/ARCHITECTURE-SPINE.md
active_specs:
  - ../specs/spec-provisioned-student-starts-assigned-learning/SPEC.md
  - ../specs/spec-student-core-learning-materials/SPEC.md
  - ../specs/spec-student-quiz-learning-gates/SPEC.md
  - ../specs/spec-student-verified-lab-challenge-retry/SPEC.md
  - ../specs/spec-student-progress-attempt-history/SPEC.md
---

# NexaLab Release 1 Epic Breakdown

Epics are grouped by user outcome. Shared Foundation decisions bind every epic; they are not a separate database/backend/frontend phase.

## Shared Foundation

### SF-1 — Every actor reaches only the learning resources they own

Student, Teacher, Parent, and Admin share one identity, session, ownership, and evidence model. Each vertical epic adopts the relevant foundation rather than building a disconnected role-specific stack.

**Coverage:** FR-01, FR-02, FR-03, FR-04, FR-05; QR-01–10.

**Envelope:** role-specific authentication, revocable sessions, server-side RBAC and ownership, shared domain relationships, API/error conventions, deterministic authority, and evidence-tiered verification.

## Increment A — Student Learning Core + Minimal Operations

### A1 — A provisioned student starts assigned learning

An authorized operator can prepare the minimum cohort and assignment, and the student can sign in, satisfy the temporary-password gate, see only applicable assigned work, and open the assigned published lesson.

**Coverage:** FR-01, FR-02, FR-03, FR-04, FR-05, FR-06, FR-07, FR-08, FR-09.

**Detailed spec:** `../specs/spec-provisioned-student-starts-assigned-learning/SPEC.md`.

### A2 — A student learns from complete core materials

The student follows reading, video, and study cards in a clear ordered lesson experience with loading, empty, unavailable, and accessible responsive states.

**Coverage:** FR-09, FR-10, FR-12; QR-04–07.

**Detailed spec:** `../specs/spec-student-core-learning-materials/SPEC.md`.

### A3 — A student proves understanding and unlocks practice

The student completes a scored quiz, receives a server-authoritative outcome, and sees the next learning step unlock without hiding the remaining pathway.

**Coverage:** FR-11, FR-12, FR-15; QR-02, QR-06.

**Detailed spec:** `../specs/spec-student-quiz-learning-gates/SPEC.md`.

### A4 — A student practices, receives a verified verdict, and retries

The student completes one representative lab/challenge, sees the server-recomputed result and verdict, and can retry while prior attempts remain intact.

**Coverage:** FR-13, FR-14, FR-15; QR-01, QR-07.

**Detailed spec:** `../specs/spec-student-verified-lab-challenge-retry/SPEC.md`.

### A5 — A student understands official progress and history

The student reviews completion and attempt history, and every visible metric can be traced to the underlying learning item or attempt.

**Coverage:** FR-04, FR-15; QR-02, QR-06.

**Detailed spec:** `../specs/spec-student-progress-attempt-history/SPEC.md`.

## Increment B — Teacher Operations

### B1 — A teacher operates an owned class and assigns learning

The teacher manages owned-class membership, permitted content, and assignments beyond the minimal operator slice used by Increment A.

**Coverage:** FR-16, FR-17.

**Envelope only:** detailed Teacher UX/spec/tickets are deferred.

### B2 — A teacher acts on traceable learning evidence

The teacher identifies students who need support and opens the exact quiz, attempt, or progress evidence behind the view.

**Coverage:** FR-18.

**Envelope only:** no advanced or AI-generated analytics.

## Increment C — Parent and Admin

### C1 — A parent follows a linked child's progress safely

The parent sees read-only progress for explicitly linked children and cannot mutate learning data.

**Coverage:** FR-19.

**Envelope only:** detailed Parent UX/spec/tickets are deferred.

### C2 — An admin operates the platform without bypassing controls

The admin manages users, subjects, content, labs, and assets through explicit authorized operations.

**Coverage:** FR-20.

**Envelope only:** detailed Admin UX/spec/tickets are deferred.

## Future

### F1 — A teacher creates reviewed AI-assisted content drafts

Structured Teacher AI drafts, human review, publication controls, audit, and safe provider failure.

**Coverage:** FR-21.

**Envelope only:** not Release 1.

### F2 — A student receives bounded advisory tutoring

Progressive hints use approved learning and attempt context while deterministic systems retain all scoring and verdict authority.

**Coverage:** FR-22.

**Envelope only:** not Release 1.

## Build order

`A1 → A2 → A3 → A4 → A5 → B1 → B2 → C1 → C2`

Shared Foundation is adopted and verified inside each epic. Future epics do not enter Release 1 build order.

## Readiness gate

Product Owner decisions for Increment A are closed in `docs/product/prd.md` Section 10. A1–A5 each have a detailed ready-for-implementation spec and ordered vertical tickets. Each epic still requires its predecessor's real runtime acceptance before implementation of the next begins; planning readiness is not implementation completion.
