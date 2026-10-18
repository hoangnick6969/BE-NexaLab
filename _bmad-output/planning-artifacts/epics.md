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

# NexaLab — Epic Breakdown

## Overview

This planning artifact captures the requirements and approved epic structure for the current Open Curriculum and Class Space change. Existing Release 1 foundation and historical A1–C2 scope are included for traceability, but must not be re-planned as new work unless the change proposal explicitly identifies impact. Full curriculum and teacher-custom Lab builders are separate R&D and excluded from this sprint; only their integration and access boundaries are in scope.

## Requirements Inventory

### Functional Requirements

FR-01: Represent Student, Teacher, Parent, and Admin identities with role-specific login and account lifecycle rules. (Shared foundation; preserve existing behavior.)

FR-02: Enforce role and resource ownership on every protected server operation. (Shared foundation; applies to all new catalog, Class Space, assignment, file, and notification routes.)

FR-03: Teachers own classes; classes contain approved student enrollments; assignments target a class or an approved subset of that class.

FR-04: Keep stable relationships among content, assignments, attempts, and progress so every displayed learning state traces to source evidence.

FR-05: Validate request bodies at API boundaries and use consistent, recoverable errors.

FR-06: Allow an authorized operator to provision/seed the minimum student, class, released content, and assignment data needed for the student journey. (Existing baseline.)

FR-07: Require a provisioned student to log in with username/password and change a valid temporary password before protected learning routes. (Existing baseline.)

FR-08: Show only assignments applicable to approved enrollment and the target snapshot. Assigned tests have due dates; late submissions require a reason and teacher decision; rejection records zero; expiry without submission does not auto-score zero. A teacher-approved extension revises the due date on the same assignment for its entire assigned recipient set, and every recipient may submit again, including those who already submitted. Preserve attempts and deadline/decision history. The latest submitted file/attempt is current; late work awaiting review remains pending.

FR-09: Allow authenticated students to browse released shared curriculum across available subjects/grades without assignment; `/lessons` follows subject → ascending available grades → ordered chapter/topic table of contents → ordered lessons → lesson detail. Show release gaps separately and include curriculum reference, objective, and prerequisites.

FR-10: Support shared lesson content, video or approved equivalent, and basic lesson exercises where present, with recoverable unavailable states. Public lessons contain no Quizlet decks or scored-quiz gate.

FR-11: Allow teachers to create study-card decks, unscored study quizzes, and tests in Class Space; direct authoring and supported structured-file import apply to decks, study quizzes, and test content only. Imported resources remain drafts until teacher review/publication. Generic file import does not create Labs. AI generation is deferred. Decks/study quizzes remain unscored; scored tests require explicit assignment and server-authoritative scoring, private answer keys, retry history, and target authorization.

FR-12: Keep Open Curriculum, Class Space, and Assignments distinct. Active approved class members can access class resources without assignment; assignment activities are target-scoped. No quiz completion gates shared content or foundational Labs.

FR-13: Make released foundational Labs available without enrollment, assignment, or quiz pass and link them to official subject/grade/chapter/topic/outcomes. Teacher-custom Labs belong to one class and link to its lesson and curriculum context; only active approved members may discover/run them, while scored submissions require assignment-target eligibility. This sprint excludes both Lab builders.

FR-14: Retain student, challenge, submitted state, simulation result, verdict, duration, and timestamp for each practical attempt. New Lab work must respect the existing server-authoritative, immutable-version boundaries.

FR-15: Show foundational subject progress and attempt history with evidence traceability. The fixed official course version defines the foundational denominator (lesson content, video, basic exercises, and required foundational Labs). Assigned work is separate and keeps the subject summary unmet while actionable and unsubmitted, in progress, awaiting late review, or not accepted; closed/archived work remains in history but no longer holds the current rollup unmet once not actionable.

FR-16: Allow teachers to manage their own classes and approved student membership. (Existing baseline; preserve ownership boundaries.)

FR-17: Allow teachers to author/import permitted study/test content, assign tests to an owned class or selected enrolled students with a due date, decide late requests, and revise the same assignment deadline for the full assigned recipient set while preserving attempts/deadline history. Teacher views show upcoming/overdue work and pending late reasons.

FR-18: Allow teachers to inspect student/class evidence only within their owned classes and students. (Existing evidence capability; integrate where assignment status changes.)

FR-19: Give parents read-only progress access for explicitly linked children. (Current change adds due-status visibility only as stated by FR-25.)

FR-20: Allow admins to manage users/content/subjects/Labs/assets within authorization and audit boundaries. Administrative quarantine/archive/reassignment requires a reason and audit and cannot bypass scientific, rights, or publication gates. (Preserve; no new full Lab builder scope.)

FR-21: In a later sprint, allow Teacher AI to create structured drafts only; an authorized human reviews and publishes. Outside this sprint.

FR-22: Keep Student AI hints advisory; AI never computes or overrides results, verdicts, scores, or progress. Outside this sprint.

FR-23: Allow admins to maintain optional HTTPS ebook/reference links per subject and show them as external resources without implying content rights. Existing curriculum/navigation context; preserve.

FR-24: Define the future teacher-custom Lab capability as a Class Space resource linked by stable subject/grade/chapter/topic/lesson identifiers, discoverable/runnable only by active approved class members, with scored submissions limited to assignment targets. Builder authoring is explicitly outside this sprint.

FR-25: Provide server-derived assignment status across Student, Teacher, and Parent roles. Students see due-soon/current-deadline and late-review status; Teachers see upcoming/overdue assignments and pending reasons; linked/approved Parents may see read-only in-app overdue notices. Expiry alone never records zero; explicit teacher rejection does.

### NonFunctional Requirements

NFR-01 / QR-01 Scientific authority: backend recomputes simulations; only deterministic simulation/evaluator logic produces official results/verdicts.

NFR-02 / QR-02 Progress authority: official progress is read/written through authorized backend operations; client preview is never official.

NFR-03 / QR-03 Privacy and ownership: parent access is read-only; teachers are restricted to owned classes; students see only their evidence and applicable assignments.

NFR-04 / QR-04 Accessibility: keyboard and touch support, minimum 44×44 px targets, WCAG AA rendered color pairs, reduced-motion support.

NFR-05 / QR-05 Responsive use: verify Increment A Student flow at 390, 768, 1024, and 1440 px without horizontal overflow or obscured primary actions.

NFR-06 / QR-06 Honest learning UX: one primary next action per learning screen; no fabricated metrics, peer ranking, shaming copy, or score without evidence drill-down.

NFR-07 / QR-07 Resilience: every async learning surface has loading, empty, and recoverable-error states; failed writes are never shown as saved.

NFR-08 / QR-08 Content governance and scientific accuracy: released shared content requires traceable source/rights evidence and named subject-matter approval. Important scientific claims, formulas, answer keys, and models use at least two independent references, including an appropriate authoritative scientific/educational source. Tests do not substitute for subject review. Scored Labs require approved models and golden cases.

NFR-09 / QR-09 Interaction performance: acknowledge supported Student input within 100 ms; keep primary actions usable during recoverable failures; pilot p95 API targets are 500 ms for reads and 1,000 ms for mutations, excluding file/video transfer and simulation rendering.

NFR-10 / QR-10 Runtime reliability: seeded A1–A5 journey targets ≥95% completion without unrecoverable error and ≥99% crash-free pilot sessions; these are measured pilot gates, not current-code claims.

### Additional Requirements

- Backend NestJS/Zod and generated OpenAPI are canonical for HTTP contracts. Every contract-changing vertical story updates BE route/schema, OpenAPI/contract tests, FE types/fixtures, and recoverable UI errors together.
- Enforce authorization server-side on collection, direct lookup, read, launch, mutation, attempt/result, and signed-file URL issuance. Class Lab access additionally checks active approved membership on each operation; scoring additionally checks immutable assignment target snapshots.
- Keep released curriculum, Class Space resources, and assignments as distinct domain/access/progress boundaries. Class sharing must not create assignment records; assignment targeting must not grant general class-resource access.
- Same-assignment deadline revision applies to its full assigned recipient set. Every recipient, including previously submitted students, may submit again. Link each attempt to the deadline revision that governed it; retain immutable attempts, scores, reasons, decisions, and deadline events. Use idempotency for retryable submissions and deadline changes.
- Late submissions require a student reason and remain pending until teacher action. Expiry without a submission does not auto-score zero. Explicit teacher rejection yields zero. Latest submitted file/attempt is current, subject to the pending/rejection rules above.
- Keep student due-soon, student overdue/late-review, teacher upcoming/overdue/pending-reason, and parent overdue surfaces consistent with backend state. Parent requires an explicitly linked/approved relationship and has read-only access.
- Import applies only to deck/study-quiz/test content. Preview and validate the complete structured file before persistence; invalid rows prevent partial creation; imported content remains a draft. Template/format and limits are still story-level decisions. Never execute uploaded formulas/macros; treat client MIME and filenames as untrusted.
- AI authoring is deferred. Both Lab builder tracks are deferred to separate R&D (first curriculum research target KHTN Grade 8). This sprint preserves taxonomy/ownership/access/version/runtime boundaries and must not assume a shared editor design.
- Existing scored simulation authority remains deterministic on the server, backed by allowlisted reviewed model/pack versions and immutable attempt version references. Do not treat Lab builder UI or a GLB as scientific logic.
- Use Prisma/PostgreSQL for schema/migrations; schema migrations must be reviewed and migration/backfill/rollback behavior considered before implementation. Do not use direct browser DB access or Supabase RLS as the authorization boundary.
- Private binary learning assets use Cloudflare R2; the backend authorizes access and issues temporary URLs. Published content pins immutable asset versions; validate uploads and provenance.
- Keep test/dev/staging/pilot/production environments isolated. Migrations deploy through reviewed `prisma migrate deploy`; guarded seed is non-production only. Do not claim current production readiness from planning or local checks.
- Cross-repository work should be vertically sliced around stable API contracts and explicit dependencies. The change touches backend/API/schema, frontend Student/Teacher/Parent surfaces, migrations, and role/authorization/release acceptance evidence.

### UX Design Requirements

UX-DR-01: `/lessons` must use the hierarchy subject → available grades sorted ascending → ordered chapter/topic table of contents → ordered lessons; retain breadcrumbs and lesson context on return navigation.

UX-DR-02: Distinguish unpublished/coverage gaps from learner progress; only released resources appear available and empty states must not imply that the student needs assignment access.

UX-DR-03: Keep the public lesson path as content → video → basic lesson exercise → optional foundational Lab. Do not place cards, Quizlet, scored Quiz, or a default quiz gate in the public flow.

UX-DR-04: Separate Open Curriculum, Class Space, and Assignments in navigation and page hierarchy. Display decks/study quizzes only in the relevant Class Space; show tests in Assignments only when explicitly assigned.

UX-DR-05: Student progress screens must distinguish foundational course progress from actionable assignment status and link all scores/statuses to source evidence. Closed/archived assignments stay in history.

UX-DR-06: Student assignment UI shows due date and server-derived due-soon, overdue/unsubmitted, late-review, rejection-zero, and resubmission-history states. After deadline extension, show the same assignment and new deadline to every recipient; permit another submission even if the student had previously submitted; display latest-submission current result while retaining earlier attempts.

UX-DR-07: Teacher assignment surfaces distinguish upcoming/overdue work and pending late reasons, expose the reason for decision, and communicate class-wide deadline revision on the same assignment.

UX-DR-08: Parent surfaces show only linked/approved child's read-only overdue/status information; no answers, submission action, or teacher decision controls.

UX-DR-09: Class resources must distinguish “share to class” from “assign to targets”; share-only creates no due date, score, or assignment evidence.

UX-DR-10: Teacher direct authoring/import for decks, study quizzes, and tests has draft, preview/validation errors, review, and publish states. Import errors identify row/field and do not suggest Lab import. Do not design either Lab builder as part of the current sprint.

UX-DR-11: All new Student/Teacher/Parent states provide loading, populated, empty, unavailable, and recoverable-error handling. Failed writes preserve recoverable input and never signal success before server confirmation.

UX-DR-12: Student dashboard/profile show the same server-derived foundational progress and assigned-work status; due work and recent attempts have evidence-linked drill-downs.

UX-DR-13: Core Student interactions work with keyboard and touch, minimum 44×44 px targets, visible focus, WCAG AA contrast, reduced motion, and supported widths 390/768/1024/1440 px without horizontal overflow.

UX-DR-14: Use subject color only for subject context, never as score/due-date/verdict; avoid shaming red/error treatment for late or incorrect student work, fabricated metrics, ranking, and unsupported success indicators.

UX-DR-15: Preserve visible and server-derived distinctions between open foundational Labs and membership-restricted custom Class Space Labs; neither is locked behind a default Quiz gate. The current sprint covers only existing/integration-boundary UX, not authoring-builder UX.

## FR Coverage Map

FR-01: Existing Shared Foundation/A1 — identity and lifecycle; no new change story.
FR-02: E1/E2/E3 — server authorization for catalog, class resource, assignment, file, and notice operations.
FR-03: Existing Shared Foundation/B1 — class ownership, enrollment, and assignment targets; reused by E2/E3.
FR-04: E1/E2/E3 — traceable course, class resource, assignment, attempt, and progress evidence.
FR-05: E1/E2/E3 — validated backend contracts and recoverable errors.
FR-06: Existing A1 — seed/operator setup; unchanged.
FR-07: Existing A1 — student login and temporary password; unchanged.
FR-08: E3 — due date, late reason/decision, class-wide same-assignment revision, resubmission, latest-file result, no expiry auto-zero.
FR-09: E1 — open subject/grade/chapter/topic/lesson hierarchy and released-resource access.
FR-10: E1 — lesson content, video/equivalent, basic exercises, and recoverable states without public cards/quiz.
FR-11: E2 — direct authoring/import and sharing of decks, unscored study quizzes, and test content; no Lab import.
FR-12: E1/E2/E3 — separate Open Curriculum, Class Space resources, and target-scoped Assignments.
FR-13: E1 — released foundational Lab discovery; E2 — class-only custom Lab access/context guard only, without either builder.
FR-14: Existing A4 — practical attempt evidence; no new simulation engine/builder story in this change.
FR-15: E1 — foundational progress denominator/evidence; E3 supplies separate assignment status inputs.
FR-16: Existing B1 — teacher class/member management; reused, not rebuilt.
FR-17: E2 — teacher content creation/import; E3 — test assignment, late decision, same-assignment revision, teacher status view.
FR-18: Existing B2 — teacher evidence access; E3 adds the pending late-reason/current assignment status slice.
FR-19: Existing C1 — linked-parent read-only progress; E3 adds only assignment overdue notice/status from FR-25.
FR-20: Existing C2 — admin operations; no new story unless required by a changed resource contract.
FR-21: Future AI sprint — explicitly excluded.
FR-22: Future AI tutor capability — explicitly excluded.
FR-23: E1 — subject external ebook/reference display and verified lesson locator behavior where configured.
FR-24: E2 — stable custom-Lab class/lesson/taxonomy linkage and class-only access contract; builder excluded.
FR-25: E3 — server-derived Student/Teacher/Parent assignment states and role-appropriate notices.

## Epic List

### Epic 1: Browse Open Curriculum and Track Foundational Progress
Students can navigate released subject learning in curriculum order, use lesson resources and optional foundational Labs, and see evidence-based foundational progress separately from assignment status.
**FRs covered:** FR-02, FR-04, FR-05, FR-09, FR-10, FR-12 (Open Curriculum), FR-13 (foundational Lab discovery only), FR-15, FR-23.
**Increment:** I1 — Open Curriculum.
**Dependencies:** Existing identity/session, published curriculum/taxonomy, and progress evidence foundations. Can run in parallel with Epic 2 after shared API/taxonomy contracts are agreed.

### Epic 2: Create and Share Class Learning Resources
Teachers can create and publish class-scoped decks, study quizzes, and test content directly or from validated structured files, while students discover only resources allowed by their active approved class membership. Preserve class-Lab access and taxonomy contracts without delivering a Lab builder.
**FRs covered:** FR-02, FR-03, FR-04, FR-05, FR-11, FR-12 (Class Space), FR-13 (custom-Lab access boundary only), FR-16 (reuse existing class management), FR-17 (author/import portion), FR-24 (integration/access boundary only).
**Increment:** I2 — Class Space resources.
**Dependencies:** Existing class ownership/enrollment foundation. Can run in parallel with Epic 1 after resource and authorization contracts are agreed.

### Epic 3: Assign Tests and Coordinate Due Dates Across Roles
Teachers can assign test content with a due date and resolve late submissions by rejecting them with zero or revising the same assignment deadline for its full target group. Students, teachers, and linked/approved parents see consistent server-derived states; attempts remain auditable and the latest submitted file/attempt is current.
**FRs covered:** FR-02, FR-04, FR-05, FR-08, FR-12 (Assignments), FR-15 (assignment-status input), FR-17 (assignment/late-decision portion), FR-18 (pending status slice), FR-19 (overdue notice slice only), FR-25.
**Increment:** I3 — Assigned test lifecycle.
**Dependencies:** Uses Epic 2's test-content and Class Space contracts. After the assignment API contract is frozen, backend state transitions and the Student/Teacher/Parent presentation work can proceed as parallel vertical slices and integrate against the shared contract.

**Separate from current sprint:** Lab builder R&D for curriculum and teacher-custom tracks (initial research focus KHTN Grade 8) and AI authoring. FR-13/FR-24 are limited here to catalog/access/integration boundaries; no builder stories are part of I1–I3.

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
