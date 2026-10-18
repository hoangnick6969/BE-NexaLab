---
increment: I3
epic: 03
status: draft
stories: 3.1–3.6
---

# I3 / Epic 03: Assign Tests and Coordinate Due Dates Across Roles

## Agent handoff

Before coding, read in order: `docs/product/prd.md` → `_bmad-output/planning-artifacts/sprint-change-proposal-2026-10-16.md` → `_bmad-output/planning-artifacts/architecture-spine-nexalab-release-1/ARCHITECTURE-SPINE.md` → the Open Learning/Class Space and Teacher specs → `../nexalab-fe/docs/design/08-STUDENT-P0-UX-DEFINITION.md`. Check `docs/product/open-questions.md` and this file's gates. If a rule conflicts or a gate is unresolved, stop and report it; do not invent a product decision.

Delegate one story per task. Use `$bmad-build` and implement only that story as a vertical BE/FE/API/schema slice. Keep NestJS/Zod/OpenAPI and FE types/UI aligned; enforce authorization in the backend. Follow the story dependencies. Parallelize only after shared contracts are frozen and file ownership is explicit. Do not commit or push unless requested.

**Copy/paste:**

> Use `$bmad-build` to implement only Story **[ID and title]** from `increment-i3-epic-03-assigned-test-lifecycle.md` . Read this file and the source documents above first. Check the story dependencies and readiness gates. Preserve its acceptance criteria and existing product decisions; do not extend into another story or guess unresolved rules. Implement the smallest complete vertical slice in the assigned files. Run relevant checks and report changed files, behavior/API/schema/UI, checks and results, and any blocker. Do not commit or push unless requested.
## Increment order

I3 starts after I2 defines and publishes the test-resource contract. Implement the state flow 3.1 → 3.2 → 3.3. After the server status/read-model contract is frozen, role surfaces 3.4, 3.5, and 3.6 can run in parallel with separate ownership.

**Readiness gates:** Decide whether an extension accepts an already pending late file or requires another submission, and define assignment/teacher-decision closing windows before Story 3.3. Set due-soon reminder timing/channel and parent-notice deduplication/update behavior before Stories 3.4/3.6. Freeze API/schema/migration, idempotency, and audit-event contracts before implementation.

Teachers can assign test content with a due date and resolve late submissions by rejecting them with zero or revising the same assignment deadline for its full target group. Students, teachers, and linked/approved parents see consistent server-derived states; attempts remain auditable and the latest submitted file/attempt is current.
**FRs covered:** FR-02, FR-04, FR-05, FR-08, FR-12 (Assignments), FR-15 (assignment-status input), FR-17 (assignment/late-decision portion), FR-18 (pending status slice), FR-19 (overdue notice slice only), FR-25.

### Student lesson hub integration boundary

The student `/lessons` hub displays I1-released shared lessons plus eligible assigned lesson content, with assigned items prominent and filterable; overlap is one card classified as assigned. Its action must open the eligible `/assignments/:id` flow. Lesson pathway reads from that flow must carry the selected assignment ID so duplicate assignments of one lesson retain assignment-specific progress/evidence. Do not duplicate assignment due/status/submission controls in Open Curriculum or create a shared lesson route for assignment-only content. A scored test remains in Assignments only when explicitly assigned; class-resource sharing alone is not assignment creation. Preserve server-side assignment authorization.

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
