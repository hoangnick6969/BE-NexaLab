---
increment: I1
epic: 01
status: in-progress
stories: 1.1–1.5
---

# I1 / Epic 01: Browse Open Curriculum and Track Foundational Progress

## Agent handoff

Before coding, read in order: `docs/product/prd.md` → `_bmad-output/planning-artifacts/architecture-spine-nexalab-release-1/ARCHITECTURE-SPINE.md` → this increment → `../nexalab-fe/docs/design/08-STUDENT-P0-UX-DEFINITION.md`. Read `_bmad-output/specs/spec-open-learning-catalog/class-space-assignment-contract.md` only when the story touches Class Space assignments, deadlines, or late work. Check `docs/product/open-questions.md` and this file's gates. If a rule conflicts or a gate is unresolved, stop and report it; do not invent a product decision.

Delegate one story per task. Use `$bmad-build` and implement only that story as a vertical BE/FE/API/schema slice. Keep NestJS/Zod/OpenAPI and FE types/UI aligned; enforce authorization in the backend. Follow the story dependencies. Parallelize only after shared contracts are frozen and file ownership is explicit. Do not commit or push unless requested.

**Copy/paste:**

> Use `$bmad-build` to implement only Story **[ID and title]** from `increment-i1-epic-01-open-curriculum.md` . Read this file and the source documents above first. Check the story dependencies and readiness gates. Preserve its acceptance criteria and existing product decisions; do not extend into another story or guess unresolved rules. Implement the smallest complete vertical slice in the assigned files. Run relevant checks and report changed files, behavior/API/schema/UI, checks and results, and any blocker. Do not commit or push unless requested.
## Increment order

I1 can run alongside I2 after the curriculum/taxonomy and shared API contracts are frozen. Within I1, stories 1.3 and 1.4 can run in parallel after taxonomy identity is fixed; progress work in 1.5 can proceed alongside catalog/detail work after its evidence contract is agreed.

**Readiness gates:** Confirm stable subject/grade/chapter/topic/lesson IDs and canonical ordering; freeze the released-curriculum list/detail API and release-eligibility contract; identify the fixed official course-version denominator and evidence contract before Story 1.5; verify the configured book edition and approved locator contract before Story 1.3. A story may start once its named dependencies are frozen; unrelated story gates do not block it.

Students can navigate released subject learning in curriculum order, use lesson resources and optional foundational Labs, and see evidence-based foundational progress separately from assignment status.
**FRs covered:** FR-02, FR-04, FR-05, FR-09, FR-10, FR-12 (Open Curriculum), FR-13 (foundational Lab discovery only), FR-15 (foundational portion), FR-23.

### Story 1.1: Browse the Curriculum Hierarchy

As a student,
I want to select a subject, grade, chapter/topic, and lesson in curriculum order,
So that I can find released learning content without joining a class or receiving an assignment.

**Implements:** FR-02, FR-05, FR-09, UX-DR-01, UX-DR-02

 Increment I1. **Dependencies:** Existing identity/session and published curriculum/taxonomy. **Parallelization:** Implement as one vertical slice after the catalog API contract is frozen; do not split BE and FE stories with mismatched contracts.

**Acceptance Criteria:**

**Given** an authenticated student with no Class Space membership, **when** they open `/lessons`, **then** eligible content is grouped under ascending grade headings, with only subjects that have released shared lessons or eligible assigned lessons shown.
**Given** the student selects a grade and subject, **when** the table of contents loads, **then** chapters/topics and lessons follow canonical curriculum ordering and stable IDs, with lesson counts and return breadcrumbs.
**Given** content is draft, quarantined, rights-blocked, or class-private, **when** the student browses or requests it by direct URL/ID, **then** the content and identifying metadata are not disclosed.
**Given** a direct catalog link targets a subject/grade with no eligible released or assigned content, **when** the page loads, **then** a recoverable empty state distinguishes unavailable content from learner progress and never implies that an assignment is required.
**And** the hierarchy supports keyboard/touch and the specified 390/768/1024/1440 px viewports without horizontal overflow.

### Catalog latency acceptance (PRD QR-09)

At the pilot-shaped catalog dataset and from the pilot region, measure `GET /subjects`, released grade/chapter/lesson list reads, and shared lesson detail reads independently. After 50 warm-up requests, collect at least 500 requests per operation in each of three consecutive 10-minute windows, using 25 concurrent virtual students. Every window must have p95 server-observed API latency at or below 500 ms; each catalog mutation that records reading/video/basic-exercise/Lab evidence must be at or below 1,000 ms p95. Exclude ebook/video transfer and Lab simulation rendering; retain request counts, p50/p95/p99, error rate, dataset size, concurrency, and environment in the run report.

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
