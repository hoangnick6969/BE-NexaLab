---
increment: I2
epic: 02
status: review
stories: 2.1–2.4
---

# I2 / Epic 02: Create and Share Class Learning Resources

## Agent handoff

Before coding, read in order: `docs/product/prd.md` → `_bmad-output/planning-artifacts/sprint-change-proposal-2026-10-16.md` → `_bmad-output/planning-artifacts/architecture-spine-nexalab-release-1/ARCHITECTURE-SPINE.md` → the Open Learning/Class Space and Teacher specs → `../nexalab-fe/docs/design/08-STUDENT-P0-UX-DEFINITION.md`. Check `docs/product/open-questions.md` and this file's gates. If a rule conflicts or a gate is unresolved, stop and report it; do not invent a product decision.

Delegate one story per task. Use `$bmad-build` and implement only that story as a vertical BE/FE/API/schema slice. Keep NestJS/Zod/OpenAPI and FE types/UI aligned; enforce authorization in the backend. Follow the story dependencies. Parallelize only after shared contracts are frozen and file ownership is explicit. Do not commit or push unless requested.

**Copy/paste:**

> Use `$bmad-build` to implement only Story **[ID and title]** from `increment-i2-epic-02-class-space-resources.md` . Read this file and the source documents above first. Check the story dependencies and readiness gates. Preserve its acceptance criteria and existing product decisions; do not extend into another story or guess unresolved rules. Implement the smallest complete vertical slice in the assigned files. Run relevant checks and report changed files, behavior/API/schema/UI, checks and results, and any blocker. Do not commit or push unless requested.
## Increment order

### Student hub integration boundary

The student sidebar exposes `/classes` as the separate Class Space destination; the existing student membership screen owns membership states, and this increment adds membership-authorized resource discovery there. `/lessons` combines I1-released shared lessons with eligible lesson assignments while keeping class resources out of the public catalog. A class resource remains available to active, approved members without creating an assignment; scored tests appear in Assignments only when explicitly assigned. Follow the I2 class/resource authorization contract; the student-hub navigation change does not invent a resource API.

I2 can run alongside I1 after the class-resource and authorization contracts are frozen. Stories 2.1–2.3 can run in parallel with clear file ownership; 2.4 follows the resource schemas from 2.1/2.2. I3 depends on the published test-resource contract from this increment.

Implementation gates are closed by the frozen contract below. Lab builders and AI authoring remain excluded; preserve only their access/integration boundaries.

Teachers can create and publish class-scoped decks, study quizzes, and test content directly or from validated structured files, while students discover only resources allowed by active approved class membership. Preserve class-Lab access and taxonomy contracts without delivering a Lab builder.

## Frozen implementation contract for this increment

- A resource is linked to one lesson and belongs to one Class Space. Only its owning teacher can author, revise, publish, or archive it. The server checks active class ownership and approved student membership on every list/detail/practice request.
- Drafts are editable. Publishing freezes that version. “Create new version” clones the published resource into the next draft version; archive hides the version from student access and retains its practice evidence.
- Unscored deck/quiz practice stores only the student's latest interaction state per resource; it has no grade, verdict, assignment, or teacher analytics. A test resource keeps its answer key server-side and is not playable or scored before a later explicit assignment.
- Import MVP accepts UTF-8 CSV only, at most 1 MB. Decks allow up to 200 data rows; study quizzes and tests allow up to 100. Headers are exact and ordered: deck `front,back`; study quiz `prompt,optionA,optionB,optionC,optionD,explanation`; test adds `correctOption` before `explanation`. Blank optional options/explanations are ignored. Duplicate normalized rows reject the entire file. Preview is non-persistent; confirmation validates the entire file again and creates one idempotent draft or nothing. XLSX and Lab/3D imports are out of scope.
- Each imported/directly authored item must be linked to an available lesson. Deck/quiz/test payloads are schema-validated; the test key must reference an existing option and is stripped from all student resource responses.

These choices close the I2 implementation gates for import format/limits, unscored practice persistence, and published-resource version/archive behavior. They do not implement I3 assignment, scoring, late decisions, or notifications.
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

**Student UI integration:** keep the student entry at `/classes` as the separate Class Space destination; extend its existing membership screen with resource discovery rather than adding class resources to `/lessons`. Show pending/removed membership state without resource actions; list/open resources only through the server-authorized class resource routes for active, approved members. Resource sharing remains unscored and must not create assignment rows or progress evidence.

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
**Implementation status:** Stories 2.1–2.4 are implemented in the current branch and verified locally. Shared database migration and product acceptance remain release review items.
