---
id: SPEC-provisioned-student-starts-assigned-learning
status: ready-for-implementation
companions:
  - tickets.md
  - implementation-contract.md
  - ../../planning-artifacts/architecture-spine-nexalab-release-1/ARCHITECTURE-SPINE.md
  - ../../../../nexalab-fe/docs/design/08-STUDENT-P0-UX-DEFINITION.md
sources:
  - ../../../docs/product/prd.md
  - ../../../docs/product/open-questions.md
---

> **Historical accepted contract.** This SPEC and its companions define the original provisioned/assigned-learning Epic A1. For amended product behavior, the 2026-10-17 PRD and Open Curriculum spec take precedence. A1 remains the prior accepted baseline; this change has not been decomposed into stories.

> **Open Curriculum precedence (2026-10-17):** A1 records the completed provisioned/assigned-learning journey. It remains valid for explicitly assigned work, but assignment is no longer the only/default route into released shared curriculum. Open Curriculum access follows the PRD and `spec-open-learning-catalog`; treat this epic's tickets as historical acceptance, not new implementation work.

# Epic A1 — A Provisioned Student Starts Assigned Learning

## Why

Increment A cannot validate learning UX until a real student identity can enter an owned class context and reach applicable assigned content. This epic creates the smallest end-to-end handoff from operator preparation to a student opening assigned learning, without expanding into full Teacher or Admin UX.

## Capabilities

- **CAP-1**
  - **intent:** An authorized operator can prepare the minimum class, student, published lesson, and assignment needed for a student journey.
  - **success:** A repeatable supported path creates or manages those records without granting access to an unrelated class or student.
- **CAP-2**
  - **intent:** A provisioned student can authenticate with a username credential and complete the temporary-password gate.
  - **success:** The student reaches protected learning only after valid authentication and required password change; invalid, expired, revoked, or wrong-role credentials do not.
- **CAP-3**
  - **intent:** A student can see assignments applicable to their approved enrollment and direct targeting.
  - **success:** The API and UI return the applicable set and reject or omit assignments from unrelated classes and students.
- **CAP-4**
  - **intent:** A student can open an assigned published lesson from the Student landing experience.
  - **success:** The assignment resolves to the correct lesson and the student sees its title, subject, objective, prerequisites, and first available learning action with accessible loading, empty, and recoverable-error states.

## Constraints

- The backend is authoritative for authentication, role, ownership, assignment applicability, published-content visibility, and official progress.
- Students do not self-register or use email recovery; teacher or school provisioning is the identity source.
- The operator surface is the minimum needed for Increment A and may reuse a repeatable seed or existing owned-class flow; it is not full Teacher/Admin UX.
- Authentication/session hardening is the first functional A1 prerequisite. It may be owned on an independent branch but must integrate through the same Supabase/Prisma/API contract before later A1 tickets start.
- Seeded Teacher/Student personas exist only in guarded non-production environments, use credentials supplied through environment variables, and exercise the real login/ownership paths. No frontend quick-login or mock-auth bypass is accepted.
- Request bodies use Zod validation and ownership derives from the authenticated actor, not a client-supplied user or teacher identifier.
- The frontend must not treat route hiding as authorization and must not expose unrelated assignment metadata.
- This epic stops when the assigned lesson is opened; reading/video/cards/quiz behavior belongs to later Increment A epics.
- Source, automated, runtime, and production evidence are reported separately. Runtime/E2E requires a real seeded PostgreSQL/API/frontend/browser stack.

## Non-goals

- Full Teacher, Parent, or Admin experiences.
- Lesson reading/video/study-card completion, quiz gates, labs, attempts, or progress history.
- Student AI Tutor, Teacher AI Content Assistant, leaderboard, gamification, and advanced analytics.
- A second auth stack or a BMAD installation in `nexalab-fe`.

## Success signal

Using real local dependencies, an authorized operator prepares one cohort and assignment; a provisioned student signs in, changes a temporary password when required, sees only the applicable assignment, and opens the assigned published lesson. Negative ownership and wrong-role cases are rejected by the API, and no claim is made about production until a deployed environment is exercised.

## Bound decisions

- Enrollment is teacher/school-provisioned only; the Student join-code route is not part of the accepted P0 journey.
- Both an idempotent seed and the minimal teacher-owned operator path are supported.
- Active applicable assignments sort by due date, creation time, then stable ID; the first is the primary action.
- Overdue assignments remain actionable and labeled. Archived assignments leave the primary queue but remain traceable from retained evidence.
- Supabase managed PostgreSQL is the MVP database; Prisma and the NestJS API remain the only application data/auth authority.
- Authentication delivery order is `A1-T0 data path → A1-T1 auth/session → A1-T2 assignment → A1-T3 student open → A1-T4 journey`; A1-T0 and A1-T1 may be assigned independently as the authentication foundation branch.
