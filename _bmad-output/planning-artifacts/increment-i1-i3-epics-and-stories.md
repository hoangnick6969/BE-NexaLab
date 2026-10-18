---
status: draft
stepsCompleted:
  - step-01-validate-prerequisites
  - step-02-design-epics
  - step-03-create-stories
  - step-04-final-validation
inputDocuments:
  - docs/product/prd.md
  - _bmad-output/planning-artifacts/architecture-spine-nexalab-release-1/ARCHITECTURE-SPINE.md
  - ../nexalab-fe/docs/design/08-STUDENT-P0-UX-DEFINITION.md
  - _bmad-output/specs/spec-open-learning-catalog/SPEC.md
  - _bmad-output/specs/spec-open-learning-catalog/class-space-assignment-contract.md
  - _bmad-output/specs/spec-open-learning-catalog/access-and-lab-discovery.md
  - _bmad-output/planning-artifacts/sprint-change-proposal-2026-10-16.md
  - docs/product/open-questions.md
---

# NexaLab — Increment I1–I3 Epic and Story Plan

## Purpose

This is the single execution breakdown for the Open Curriculum and Class Space change. The PRD and linked specs remain the product/technical source of truth; use each story's FR links, dependencies, and acceptance criteria to scope implementation. Stories with unresolved gates remain `Not Ready`.

## Agent implementation guide

Read in this order before coding: `docs/product/prd.md` → `_bmad-output/planning-artifacts/sprint-change-proposal-2026-10-16.md` → `_bmad-output/planning-artifacts/architecture-spine-nexalab-release-1/ARCHITECTURE-SPINE.md` → the linked Open Learning/Class Space and Teacher specs → `../nexalab-fe/docs/design/08-STUDENT-P0-UX-DEFINITION.md`. Check `docs/product/open-questions.md` and this plan's readiness gates before implementing a gated story. If requirements disagree, stop and report the conflict; do not invent a new product rule.

**Delegate one story per agent/task.** Implement only the requested story, including its vertical BE/FE/API/schema work. Keep NestJS/Zod/OpenAPI and FE types/UI aligned; enforce access in the backend. Do not split implementation across agents until the shared contract is frozen and file ownership is explicit. I1 and I2 may run in parallel after that; I3 starts after the I2 test-resource contract. Follow the dependencies in the story. Do not add public cards/quizzes, AI generation, or either Lab builder to this sprint.

**Copy/paste task prompt:**

> Use `$bmad-build` to implement Story **[ID and title]** from `increment-i1-i3-epics-and-stories.md` only. First read the implementation guide and its linked source docs, then check the story's readiness gates and dependencies. Preserve its acceptance criteria and existing product decisions. Make the smallest complete vertical change in the explicitly assigned files; do not change another story's scope or resolve product decisions by assumption. Run only the checks relevant to this story and report changed files, API/schema/UI behavior, checks and results, and any remaining blocker. Do not commit or push unless separately requested.

After implementation, review the story against every acceptance criterion, test authorization and error/empty states relevant to the touched flow, and report evidence separately for backend, frontend, migration, and browser/runtime checks. A planning document or static check is not evidence that the app works.

## Execution Plan: Increments, Dependencies, and Parallel Work

| Increment | Epic | Order / dependency | Parallel execution |
|---|---|---|---|
| I1 | Epic 1 — Open Curriculum | Can start after curriculum/taxonomy/API contracts are confirmed. | I1 and I2 can proceed concurrently. Within I1, 1.3 and 1.4 can proceed after taxonomy contract; 1.5 can develop against the progress contract while catalog/detail work proceeds. Integrate against shared API contracts before closing stories. |
| I2 | Epic 2 — Class Space resources | Uses existing class ownership and approved enrollment. | I1 and I2 can proceed concurrently. Stories 2.1, 2.2, and 2.3 can proceed in parallel after the class-resource contract is frozen. Story 2.4 depends on the resource schemas from 2.1/2.2. |
| I3 | Epic 3 — Assigned tests | Starts after Epic 2 defines and publishes test resources; 3.1 establishes the assignment target/deadline contract. | Core assignment lifecycle proceeds 3.1 → 3.2 → 3.3. After the server status/read model and event contract is stable, 3.4/3.5/3.6 can be implemented as separate role-specific vertical slices in parallel, then integrated. |
| Separate R&D | Lab builders | Not part of I1–I3. | The curriculum and teacher-custom Lab research tracks may proceed separately. Do not start builder implementation from these stories. |

**Cross-increment integration gates:** contract changes update backend Zod/OpenAPI, frontend API types/fixtures, authorization tests, and role-specific UI together. Freeze shared IDs and event/read-model payloads before parallel implementation. See story-specific readiness gates for decisions that must be resolved before coding.

## Epic 1: Browse Open Curriculum and Track Foundational Progress

Students can navigate released subject learning in curriculum order, use lesson resources and optional foundational Labs, and see evidence-based foundational progress separately from assignment status.
**FRs covered:** FR-02, FR-04, FR-05, FR-09, FR-10, FR-12 (Open Curriculum), FR-13 (foundational Lab discovery only), FR-15 (foundational portion), FR-23.

### Story 1.1: Browse the Curriculum Hierarchy

As a student,
I want to select a subject, grade, chapter/topic, and lesson in curriculum order,
So that I can find released learning content without joining a class or receiving an assignment.

**Implements:** FR-02, FR-05, FR-09, UX-DR-01, UX-DR-02

 Increment I1. **Dependencies:** Existing identity/session and published curriculum/taxonomy. **Parallelization:** Implement as one vertical slice after the catalog API contract is frozen; do not split BE and FE stories with mismatched contracts.

**Acceptance Criteria:**

**Given** an authenticated student with no Class Space membership, **when** they open `/lessons`, **then** they see only subjects with released curriculum content.
**Given** the student selects a subject, **when** grade options load, **then** only grades with released content appear in ascending numeric order.
**Given** the student selects a grade, **when** the table of contents loads, **then** chapters/topics and lessons follow canonical curriculum ordering and stable IDs, with lesson counts and return breadcrumbs.
**Given** content is draft, quarantined, rights-blocked, or class-private, **when** the student browses or requests it by direct URL/ID, **then** the content and identifying metadata are not disclosed.
**Given** a subject/grade has no released content, **when** the empty state appears, **then** it distinguishes a publication/coverage gap from learner progress and never implies that an assignment is required.
**And** the hierarchy supports keyboard/touch and the specified 390/768/1024/1440 px viewports without horizontal overflow.

### Story 1.2: Open Lesson Content, Video, and Basic Exercises

As a student,
I want to open the released content, video, and basic exercises for a lesson,
So that I can study the lesson in the public curriculum flow.

**Implements:** FR-02, FR-04, FR-05, FR-10, FR-12, UX-DR-03, UX-DR-11

 Increment I1. **Dependencies:** 1.1 navigation contract; detail and media APIs may be implemented in parallel with the catalog UI after their contracts are frozen, but the integrated story closes after both paths work.

**Acceptance Criteria:**

**Given** a released lesson, **when** the student opens it, **then** the page shows its objective, approved reading content, and available content/video/basic-exercise tabs or sections.
**Given** an approved video is available, **when** the student opens the video section, **then** playback does not autoplay and progress is server-persisted according to the approved completion rule.
**Given** a basic exercise is present, **when** the student opens it, **then** it is available without a quiz gate or assignment prerequisite.
**Given** content or media is unavailable or a progress write fails, **when** the failure is displayed, **then** the page offers a recoverable state, preserves recoverable input, and does not show unconfirmed progress as saved.
**And** public lesson detail contains no Class Space deck, Quizlet, or scored-quiz step.

### Story 1.3: Open the Configured Ebook at a Verified Lesson Locator

As a student,
I want to open an approved external ebook/reference at the page mapped to my lesson,
So that I can consult the corresponding source without guessing page positions.

**Implements:** FR-02, FR-09, FR-23

 Increment I1. **Dependencies:** Lesson detail context and the edition-specific locator/source-map migration contract. **Parallelization:** Can proceed with 1.4 once canonical taxonomy and lesson identity are fixed.

**Acceptance Criteria:**

**Given** a subject has a configured HTTPS ebook/reference, **when** the student opens lesson materials, **then** the link is labeled as an external resource and does not imply NexaLab hosts or owns the source.
**Given** the selected lesson has a verified locator for that exact ebook edition, **when** the student follows the lesson link, **then** the reader opens the mapped physical PDF page using the documented page-index conversion.
**Given** the locator is missing, unverified, or belongs to another edition, **when** the student opens the ebook, **then** the reader uses a safe edition start/fallback and never jumps to a guessed page.
**And** printed-page labels and physical PDF indexes remain distinct, with locator provenance/version retained by the server.

### Story 1.4: Discover Released Foundational Labs in Curriculum Context

As a student,
I want to find released foundational Labs by subject and current chapter/topic,
So that I can discover relevant practical learning without a quiz or assignment gate.

**Implements:** FR-02, FR-05, FR-12, FR-13, UX-DR-15

 Increment I1. **Dependencies:** Published Lab records and stable taxonomy links. **Parallelization:** Can proceed with 1.3 after taxonomy contracts are frozen. No Lab authoring UI is included.

**Acceptance Criteria:**

**Given** a released foundational Lab is mapped to an official topic/outcome, **when** the student browses the subject Lab catalog or its lesson context, **then** the Lab appears in the matching subject/topic context using the same stable taxonomy identity.
**Given** the Lab is unpublished, quarantined, class-private, or not release-cleared, **when** the student browses or opens it directly, **then** it is not exposed as a public Lab.
**Given** no released Lab matches a lesson, **when** the lesson is shown, **then** the Lab remains optional and its absence does not block content, video, exercise, or progress.
**And** this story does not implement either curriculum or teacher-custom Lab builder.

### Story 1.5: Review Foundational Progress by Subject and Grade

As a student,
I want to see foundational progress and its source evidence by subject and grade,
So that I understand what I have completed in the open curriculum.

**Implements:** FR-04, FR-05, FR-12, FR-15, UX-DR-05, UX-DR-12

 Increment I1. **Dependencies:** Fixed course-version identity and server-side lesson/video/exercise evidence. **Parallelization:** Progress read-model work may proceed in parallel with 1.1/1.2 once the evidence contract is frozen; UI integration waits for that read model.

**Acceptance Criteria:**

**Given** a student opens profile/progress, **when** foundational progress loads, **then** it uses the fixed official-course version and shows lesson content, video, basic-exercise, and required foundational-Lab evidence separately.
**Given** Class Space decks, study quizzes, custom Labs, or scored assignment evidence exist, **when** foundational progress is calculated, **then** those records do not change the official-course denominator.
**Given** a progress item is shown as complete/partial/not started, **when** the student drills down, **then** the contributing source evidence and timestamps are visible.
**And** this story reports foundational progress only; it neither waits for nor displays the future assignment-status signal from Epic 3, and assignment state does not change the foundational denominator. Epic 3 adds its separate assignment-status surface when that increment is delivered.

## Epic 2: Create and Share Class Learning Resources

Teachers can create and publish class-scoped decks, study quizzes, and test content directly or from validated structured files, while students discover only resources allowed by active approved class membership. Preserve class-Lab access and taxonomy contracts without delivering a Lab builder.
**FRs covered:** FR-02, FR-03, FR-04, FR-05, FR-11, FR-12 (Class Space), FR-13 (custom-Lab access boundary only), FR-16 (reuse existing class management), FR-17 (author/import portion), FR-24 (integration/access boundary only).

### Story 2.1: Create and Publish Class Study Decks and Unscored Study Quizzes

As a teacher,
I want to create study decks and practice quizzes for an owned Class Space,
So that approved students can practice lesson material without receiving a grade.

**Implements:** FR-02, FR-03, FR-04, FR-05, FR-11, FR-12, FR-16, FR-17, UX-DR-04, UX-DR-09, UX-DR-10

 Increment I2. **Dependencies:** Existing owned-class and membership foundation; class-resource contract. **Parallelization:** Can run with 2.2 and 2.3 after the shared resource/access contract is fixed.

**Acceptance Criteria:**

**Given** an authorized teacher owns a Class Space, **when** they create a deck or study quiz and link it to a class lesson, **then** the resource is saved as a class-owned draft with stable subject/grade/chapter/topic/lesson context.
**Given** the teacher reviews and publishes a valid draft, **when** an active approved class member opens the Class Space, **then** that member can discover and use the resource.
**Given** a student uses a deck or study quiz, **when** an answer/action is recorded, **then** it is unscored practice and never changes grades, assignment scores, or official course achievement.
**Given** a non-owner teacher, pending/removed member, or outsider requests the resource directly, **when** the server authorizes the request, **then** it denies access without leaking resource existence.
**And** AI generation and teacher Lab-builder controls are absent from this sprint's authoring flow.

### Story 2.2: Create Class Test Content for Later Assignment

As a teacher,
I want to author and publish test question content for an owned class,
So that I can later assign it as scored work to selected students or the class.

**Implements:** FR-02, FR-03, FR-05, FR-11, FR-12, FR-17, UX-DR-04, UX-DR-09, UX-DR-10

 Increment I2. **Dependencies:** Shared class-resource and question/answer-key contract. **Parallelization:** Can run with 2.1 and 2.3 after the resource and authorization contract is frozen; no assignment state machine is implemented here.

**Acceptance Criteria:**

**Given** the teacher owns the Class Space, **when** they create a test, **then** it is stored as a draft and is not yet an assignment, due-dated item, or scored student activity.
**Given** question content fails schema/domain validation, **when** the teacher saves or previews, **then** the server returns field-level errors and does not publish partial content.
**Given** a valid test is published to the class, **when** a member views the resource, **then** answer keys remain private and the test is not treated as assigned work until a separate explicit assignment is created.
**And** the test version/content identity is stable enough for a later assignment and immutable attempt snapshot.

### Story 2.3: Share Class Resources with Membership-Scoped Access

As a teacher,
I want to share a resource to my whole Class Space separately from assigning scored work,
So that all approved members can access class materials without creating assignment records.

**Implements:** FR-02, FR-03, FR-12, FR-13, FR-24, UX-DR-04, UX-DR-09, UX-DR-15

 Increment I2. **Dependencies:** Class-resource relation and approved-enrollment policy. **Parallelization:** Can run with direct authoring stories after the class-resource API contract is frozen.

**Acceptance Criteria:**

**Given** a teacher publishes a class resource, **when** an active approved member lists or opens the Class Space, **then** the member sees the shared resource without an assignment target.
**Given** the teacher shares but does not assign a resource, **when** the student views Assignments/progress, **then** no due date, scored attempt, or assignment record is created.
**Given** a student is pending, removed, in another class, or has only a stale URL/ID, **when** they request class resources, **then** every list/detail/download/launch route denies access server-side.
**Given** a class-linked custom Lab resource already exists, **when** membership and lesson-context checks are performed, **then** it is class-only and linked by stable IDs; scored actions additionally require an assignment target. This is an access/integration boundary only, not a builder deliverable.

### Story 2.4: Import Structured Files for Decks, Study Quizzes, and Tests

As a teacher,
I want to preview and import supported structured files for permitted Class Space resources,
So that I can prepare class materials efficiently and correct errors before publication.

**Implements:** FR-02, FR-05, FR-11, FR-17, UX-DR-10

 Increment I2. **Dependencies:** Resource schemas from 2.1/2.2 and class access contract from 2.3. **Parallelization:** Import adapters may be developed by resource type after the shared parser/preview contract is agreed; publication and validation are integrated before completion.

**Acceptance Criteria:**

**Given** an authorized teacher selects an allowed deck, study-quiz, or test template, **when** they upload a supported file, **then** the backend validates the entire file and returns a preview with row/field-level errors without persisting a resource.
**Given** any row is invalid or the file violates configured size/row/type limits, **when** the teacher confirms import, **then** no partial resource is created and actionable errors are returned.
**Given** the preview is valid and current, **when** the teacher confirms, **then** one idempotent draft is created and requires teacher review before publication.
**Given** the upload contains macros/formulas, an untrusted MIME/name, or a Lab/3D asset payload, **when** import validation runs, **then** executable content is never run and the file is rejected as an unsupported Lab-import path.
**Decision gate before implementation:** Freeze allowlisted format(s), per-resource templates, size/row/time limits, duplicate behavior, and supported question/card field schema in story refinement.

## Epic 3: Assign Tests and Coordinate Due Dates Across Roles

Teachers can assign test content with a due date and resolve late submissions by rejecting them with zero or revising the same assignment deadline for its full target group. Students, teachers, and linked/approved parents see consistent server-derived states; attempts remain auditable and the latest submitted file/attempt is current.
**FRs covered:** FR-02, FR-04, FR-05, FR-08, FR-12 (Assignments), FR-15 (assignment-status input), FR-17 (assignment/late-decision portion), FR-18 (pending status slice), FR-19 (overdue notice slice only), FR-25.

### Story 3.1: Assign a Test with a Due Date and Fixed Recipient Set

As a teacher,
I want to assign a published test to my whole class or selected approved students with a due date,
So that each student has a clear, auditable submission obligation.

**Implements:** FR-02, FR-03, FR-04, FR-05, FR-08, FR-12, FR-17, FR-25, UX-DR-06

 Increment I3. **Dependencies:** Published test resource from 2.2 and approved class/target model. **Parallelization:** This story is the lifecycle foundation; subsequent submission and role-status work can start after its API contract is frozen.

**Acceptance Criteria:**

**Given** a teacher owns the class and selects a published test, **when** they assign it to the class or an approved subset with a valid due date, **then** the server creates one assignment with an immutable recipient snapshot and UTC due date.
**Given** the due date is missing/invalid or a target is not an approved member at assignment creation, **when** the teacher submits the assignment, **then** the API rejects the invalid request without partial targets.
**Given** the assignment is created, **when** a target student opens Assignments, **then** the student sees the same assignment identity and localized due date; non-targets cannot open or submit it.
**And** sharing a test resource alone never creates this assignment.

### Story 3.2: Submit an Assignment and Provide a Reason for Late Work

As a student,
I want to submit my test file/answers and explain a late submission,
So that my work is recorded and the teacher can make the required decision.

**Implements:** FR-02, FR-04, FR-05, FR-08, FR-17, FR-25, UX-DR-06

 Increment I3. **Dependencies:** Assignment/target snapshot from 3.1 and server scoring contract. **Parallelization:** Student UI and backend submission handling can proceed after the request/response contract is frozen; integrate before closing.

**Acceptance Criteria:**

**Given** an eligible target submits on or before `dueAt`, **when** the server accepts the submission, **then** it records an immutable attempt, computes the result server-side, and marks it on time.
**Given** an eligible target submits after `dueAt`, **when** they provide a non-empty late reason, **then** the server records the file/attempt and reason as `LATE_REVIEW_PENDING` without finalizing a score.
**Given** a late submission has no reason, an expired user is not a target, or an outsider submits, **when** the API validates it, **then** it rejects the request without creating a score or exposing answer keys.
**Given** multiple submissions exist, **when** the current assignment result is read, **then** the latest submitted file/attempt is current; a latest late attempt remains pending until the teacher decision is resolved.
**And** repeated requests are idempotent or return a stable conflict; client time cannot override server due-date state.

### Story 3.3: Reject Late Work or Revise the Same Assignment Deadline

As the owning teacher,
I want to reject a late submission or extend the same assignment deadline for the full recipient group,
So that late work is handled consistently without losing attempt history.

**Implements:** FR-02, FR-04, FR-05, FR-08, FR-17, FR-25, UX-DR-06, UX-DR-07

 Increment I3. **Dependencies:** Pending late attempt from 3.2; owner authorization and immutable target snapshot from 3.1.

**Acceptance Criteria:**

**Given** an owned assignment has a late submission awaiting review, **when** the teacher rejects it, **then** that student's assignment result is zero, the outcome is unachieved, and the reason/attempt/decision remain auditable.
**Given** an owned assignment has a pending late submission, **when** the teacher grants a class-wide extension, **then** the due date changes on the same assignment for every original recipient and no non-target gains access.
**Given** the deadline is revised, **when** any original recipient—including a student who already submitted—opens the assignment, **then** they may submit again against the new deadline and all earlier attempts/deadline revisions remain immutable.
**Given** an assignment expires with an unsubmitted recipient, **when** no teacher rejection has occurred, **then** the platform does not create a zero automatically.
**And** due-date revision commands are authorized, idempotent, timestamped, and recorded against the assignment. **Decision gate before implementation:** specify whether granting the extension also resolves/accepts the triggering pending late file or leaves it pending until the student submits again; document assignment-close and teacher-decision windows.

### Story 3.4: Show Student Due, Overdue, Pending, and Resubmission States

As a student,
I want to see the current deadline, submission state, and attempt history,
So that I know what action is required and whether late work is awaiting review.

**Implements:** FR-02, FR-04, FR-05, FR-08, FR-12, FR-15, FR-25, UX-DR-05, UX-DR-06

 Increment I3. **Dependencies:** Server read model and events from 3.1–3.3. **Parallelization:** Can run with teacher/parent role surfaces after the shared status contract is frozen.

**Acceptance Criteria:**

**Given** an assigned test is approaching its due date, **when** the due-soon policy window is met, **then** the student sees an in-app reminder and the current deadline.
**Given** a test expires without a submission, **when** the student views it, **then** the status is overdue/unsubmitted with no automatic zero.
**Given** a late submission awaits review, **when** the student views the assignment, **then** they see pending status and the required next step without a finalized score.
**Given** a deadline is extended or another submission is made, **when** the student reopens the same assignment, **then** the new deadline/current latest file result and earlier attempt history are visible.
**Decision gate before implementation:** set reminder lead time/cadence and confirm in-app versus additional channels.

### Story 3.5: Give Teachers an Assignment and Late-Reason Queue

As a teacher,
I want to see upcoming/overdue assignments and review late reasons in my owned classes,
So that I can make timely, auditable decisions and communicate class-wide extensions.

**Implements:** FR-02, FR-04, FR-05, FR-08, FR-17, FR-18, FR-25, UX-DR-07

 Increment I3. **Dependencies:** Assignment status/read model from 3.1–3.3. **Parallelization:** Can run with 3.4 and 3.6 after shared API contracts are stable.

**Acceptance Criteria:**

**Given** a teacher views an owned class, **when** assignments are listed, **then** upcoming, expired/unsubmitted, pending-late-review, rejected, and extended states are distinguishable and server-derived.
**Given** a late submission is pending, **when** the owning teacher opens its queue item, **then** the student reason, submission timestamp, current assignment deadline, and permitted decisions are visible.
**Given** a teacher is not the assignment owner, **when** they request the queue or decision action, **then** access is denied without revealing student evidence.
**Given** the teacher extends the assignment, **when** the change succeeds, **then** the same assignment shows the new deadline for the whole original recipient set and records the event.

### Story 3.6: Notify Linked Parents of Child Overdue Work

As a linked, approved parent,
I want to see an overdue notice for my child,
So that I can support the student without accessing answers or controlling school decisions.

**Implements:** FR-02, FR-04, FR-05, FR-08, FR-19, FR-25, UX-DR-08

 Increment I3. **Dependencies:** Expiry/status event from 3.1 and verified ParentLink authorization. **Parallelization:** Can run with 3.4/3.5 after notification/read-model contracts are stable.

**Acceptance Criteria:**

**Given** an assigned test expires without the child's submission, **when** the overdue event is processed, **then** each explicitly linked and approved parent may see an in-app notice for that child.
**Given** a parent is unlinked, pending, or linked to a different student, **when** they request the notice or assignment detail, **then** access is denied and no other child's data is exposed.
**Given** the parent opens an authorized notice, **when** the detail is displayed, **then** it is read-only and contains status/deadline context only, with no answer key, submission control, or teacher decision action.
**And** expiry/notification alone never creates a zero score.
**Decision gate before implementation:** confirm in-app as the sole MVP channel, notice deduplication, and whether a later extension updates/retracts an existing overdue notice.

## Story Readiness Gates

The epic boundaries are approved. These decisions do not change the epic map, but the affected stories must remain `Not Ready` until resolved:

1. File-import format/template allowlist, size/row/time limits, duplicate handling, and validation rules (Story 2.4).
2. Late-decision/assignment-close windows and whether a class-wide extension accepts the triggering pending late file or requires a new submission (Story 3.3).
3. Due-soon reminder timing/cadence/channel; parent-notice deduplication and update/retraction on extension (Stories 3.4/3.6).
4. Minimum persistence/resume behavior for unscored study practice and edit/version/archive/withdrawal lifecycle for class resources (Stories 2.1–2.3).
5. Final API/schema/migration mapping, idempotency, audit events, and migration/backfill/rollback evidence for impacted models (stories as applicable).
6. Full design of both Lab builders remains in separate R&D; KHTN Grade 8 is the initial curriculum research target.
