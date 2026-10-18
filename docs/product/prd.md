# NexaLab Product Requirements Document

**Status:** Product Owner-approved Release 1 planning baseline

**Updated:** 2026-10-12

**Inputs:** Product owner direction, current repositories, product brief, discovery notes, and Student P0 UX definition

**Scope:** One Release 1 architecture for Vietnamese THCS Natural Science, delivered student-first. The MVP content catalog targets Grade 8–9; the initial measured pilot may remain a bounded Grade 8 sample as described in Section 9.

## 1. Product intent

NexaLab is a Vietnamese THCS Natural Science learning platform. It combines a familiar learning path with deterministic virtual labs and practical challenges so students can learn, act, observe, retry, and review evidence of their progress.

Release 1 closes two gaps:

- **Practice gap:** students need to do more than consume content.
- **Diagnostic gap:** the platform must retain trustworthy evidence that teachers can use later.

Student-first means the first detailed delivery increment is usable by students. It does not mean a Student-only architecture. Identity, ownership, authorization, and the shared domain must support Student, Teacher, Parent, and Admin from the start.

## 2. Users and access boundaries

| Role | Release 1 outcome | Access boundary |
| --- | --- | --- |
| Student | Explore released Open Curriculum; use their Class Spaces and complete explicitly assigned work | Own course progress, class-resource access, assignments, attempts, and evidence only |
| Teacher | Operate owned classes and act on student evidence | Owned classes and enrolled students only |
| Parent | Understand a linked child's progress | Read-only access to explicitly linked children |
| Admin | Operate users, content, labs, and assets | Administrative capability without bypassing audit or ownership rules |

Students use teacher or school-provisioned usernames. They do not self-register or reset through email. Teachers, parents, and admins use adult email accounts. A class join code, temporary password, and parent-link code are separate credentials with separate purposes.

## 3. Release structure

Release 1 uses one shared architecture and is delivered in increments:

### Shared Foundation

- Role-aware identity and session lifecycle.
- Server-side RBAC and resource ownership.
- Separate relationships for `Official Curriculum → Student Progress`, `Class → Class Resource → Enrolled Student`, and `Assignment → Target → Attempt → Assignment Evidence`.
- Deterministic simulation and official progress boundaries.
- API, validation, error, testing, and evidence conventions shared by both repositories.

### Increment A — Student Learning Core + Minimal Operations

The detailed planning scope for this cycle:

- student login with a provisioned account and mandatory temporary-password change when applicable;
- open catalog for released official curriculum, lesson content/video/basic exercises, and foundational Labs when present;
- subject/grade/chapter/topic/lesson navigation and course progress;
- class-private resources, with teacher-created study decks/unscored study quizzes and explicitly assigned scored tests in Class Space;
- optional foundational Labs and teacher-created class Labs linked to their class lesson and curriculum context;
- explicitly assigned scored work, retry, and attempt history, with teacher direct authoring and file import for class study content;
- retry, official progress, and attempt history;
- only the operations needed to seed or manage a student, class, content item, and assignment for the student flow.

### Increment B — Teacher Operations

Full teacher UX for owned-class management, direct content authoring, file import, assignment operations, and evidence review. AI-generated Class Space content is deferred to a later sprint. The MVP content catalog targets Grade 8–9 Natural Science. The initial pilot sample can remain Grade 8-only and does not narrow the product content target. Baseline/shared learning materials use NexaLab-authored or item-level openly reusable sources and pass the shared-content review gates. Teachers may publish class-private authored materials under the separate private-content policy in Section 10. Increment A may expose a minimal operator path but must not silently expand into the complete Teacher experience.

### Increment C — Parent and Admin

Read-only linked-child progress for parents and complete administrative operations for users, content, labs, and assets.

### Future

- AI-generated Class Space study-content extensions grounded in a lesson; explicitly deferred to the sprint after the current direct-authoring and file-import scope.
- General-purpose Teacher AI Content Assistant with broad draft, analytics, and workflow capabilities.
- Student AI Tutor with bounded progressive hints.

AI authoring is outside the current Class Space delivery. Leaderboard, gamification economies, and advanced analytics remain outside Increment A.

## 4. Student learning outcome

The open-curriculum journey is:

**Chọn môn → Chọn khối → Mục lục chương/chủ đề → Chọn bài → Nội dung bài → Video → Bài tập cơ bản → Lab nền tảng (nếu có)**

All released shared-curriculum resources are available without class enrollment, assignment, or progress prerequisites. The course progress view records learning evidence; it never locks or unlocks shared content.

**Class Space** is a separate destination for members of an approved class. Teachers may post class resources and create class-linked study-card decks, unscored study quizzes, scored tests, and custom Labs. None appears in the open-curriculum lesson flow. Decks/study quizzes are practice without grades; scored tests are assignments only when explicitly assigned. Teachers may create study content directly or import a supported file. AI generation is deferred to a later sprint. The import template, validation, and publication workflow are defined by the Class Space technical contract. Custom Labs link to the class, lesson, subject, grade, chapter, and topic context. Sharing a resource does not by itself create an assignment. Only explicitly assigned/scored work uses assignment targets, due dates, and assignment evidence. The backend remains authoritative for access, results, and progress.

## 5. Functional requirements

### Shared Foundation

- **FR-01:** The platform shall represent Student, Teacher, Parent, and Admin identities with role-specific login and account lifecycle rules.
- **FR-02:** The server shall enforce role and resource ownership on every protected operation.
- **FR-03:** A teacher shall own classes; a class shall contain approved student enrollments; assignments shall target a class or an approved subset of that class.
- **FR-04:** Content, assignment, attempt, and progress records shall retain stable relationships sufficient to trace every displayed learning state to its source evidence.
- **FR-05:** Request bodies shall be validated at the API boundary and errors shall use a consistent, recoverable contract.

### Increment A — Student Learning Core + Minimal Operations

- **FR-06:** An authorized operator shall be able to provision or seed the minimum student, class, published content, and assignment data required for the student journey.
- **FR-07:** A provisioned student shall log in with username and password and shall change a valid temporary password before entering protected learning routes.
- **FR-08:** A student shall see only assignments applicable to their approved enrollment and target snapshot. Teacher-assigned tests have a due date; late submissions require a reason and teacher decision. A rejected late submission receives zero. If the teacher grants another submission, the assignment is reset for its whole eligible class/recipient set. Assignment access is separate from shared-curriculum access.
- **FR-09:** An authenticated student shall browse released shared curriculum across available subjects and grades without an assignment. `/lessons` shall navigate subject → available grades in ascending order → ordered chapter/topic table of contents → ordered lessons → lesson detail. Only released content is represented as available; curriculum coverage gaps are shown separately. Each lesson includes curriculum reference, learning objective, and prerequisites.
- **FR-10:** A shared lesson shall support lesson content, video or an approved equivalent, and lesson-level basic exercises when present, with recoverable unavailable states. Shared lessons do not contain Quizlet decks or scored-quiz gates.
- **FR-11:** Only a teacher may create study-card decks and unscored study quizzes in Class Space for approved class members. Teachers may create study content directly or import a supported file. AI generation is deferred to a later sprint. Import validation and publication follow the Class Space technical contract. Decks and study quizzes are unscored practice. A scored test requires an explicit assignment and follows server scoring, answer-key privacy, retry, and target authorization rules.
- **FR-12:** The UI shall keep Open Curriculum, Class Space, and Assignments as distinct destinations. Class resources are visible to active, approved members without assignment; assignment-only activities are visible only to eligible targets. No quiz completion gates shared content or foundational Labs.
- **FR-13:** A student may explore a released foundational Lab tied to the official subject/grade/chapter/topic/outcome taxonomy without enrollment, assignment, or quiz pass. A teacher-created custom Lab belongs to a class and is linked to its class lesson and subject/grade/chapter/topic context. Only active, approved members of that class may discover or run it; assignment targets further restrict scored submissions.
- **FR-14:** Each practical attempt shall retain student, challenge, submitted state, simulation result, verdict, duration, and timestamp.
- **FR-15:** A student shall review foundational subject progress and attempt history, with every score, count, or status linked to its evidence. Foundational progress covers lesson content, video, basic exercises, and foundational Labs required by the fixed official-course version. Assigned work is shown separately and does not change that denominator. The subject summary may show “Đạt mức cơ bản” when foundational requirements are complete, but remains “Chưa đạt” while any assignment targeted to the student, linked to that subject, and still actionable under the assignment lifecycle is unsubmitted, in progress, awaiting a late-submission decision, or not yet accepted under that item's evaluator. A rejected late test is recorded as a zero score and remains unachieved. Preserve evidence for closed/archived assignments; they stop holding the current summary unmet once no longer actionable for that student. Show the contributing signals separately; none gates access to open content.

### Increment B — Teacher Operations capability envelope

- **FR-16:** A teacher shall manage owned classes and approved student membership.
- **FR-17:** A teacher shall directly author or import permitted content, assign tests to an owned class or selected enrolled students with a due date, decide late-submission requests, and reset an assignment for its whole eligible recipient set while preserving immutable attempt history.
- **FR-18:** A teacher shall inspect student and class evidence without accessing unrelated classes or students.
- **FR-24:** A teacher shall be able to post a custom Lab in a Class Space with stable links to the relevant subject, grade, chapter/topic, and class lesson. Only active, approved members of the owning class may discover or run it, including through direct-ID routes. Nonmembers are denied. Assignment targets further restrict scored submission; due-date and late-test handling follow the technical contract.

### Increment C — Parent and Admin capability envelope

- **FR-19:** A parent shall have read-only progress access for explicitly linked children.
- **FR-20:** An admin shall manage users, content, subjects, labs, and assets under server-side authorization and audit boundaries. Explicit administrative recovery/operations may quarantine, archive, or reassign content/assets outside the actor's ownership only with a recorded reason and audit; these actions do not bypass scientific, rights, or publication gates.

### Future capability envelope

- **FR-21:** In a later sprint, Teacher AI may create structured drafts only; an authorized human must review and publish them. This capability is outside the current direct-authoring/file-import scope.
- **FR-22:** Student AI may provide bounded advisory hints only; it shall never calculate or override result, verdict, score, or progress.
- **FR-23:** An admin may maintain an optional HTTPS ebook/reference link for each subject; the student subject library shall display configured links as external resources. A link does not grant rights to copy, host, or reproduce the linked content.

## 6. Quality and policy requirements

- **QR-01 — Scientific authority:** the backend recomputes simulations. Only the deterministic simulation engine and evaluator determine official result and practical verdict.
- **QR-02 — Progress authority:** official progress is written and read through authorized backend operations; client-derived preview state is never official.
- **QR-03 — Privacy and ownership:** parent access is read-only; teacher access is restricted to owned classes; students access only their own evidence and applicable assignments.
- **QR-04 — Accessibility:** the core student path works with keyboard and touch, uses at least 44×44 px targets, meets WCAG AA for final rendered color pairs, and respects reduced motion.
- **QR-05 — Responsive use:** Increment A is verified at 390, 768, 1024, and 1440 px without horizontal overflow or obscured primary actions.
- **QR-06 — Honest learning UX:** one primary next-step action per learning screen; no fabricated metrics, peer ranking, shame language, or score without evidence drill-down.
- **QR-07 — Resilience:** every async learning surface has loading, empty, and recoverable-error states; a failed verdict/progress write must not be presented as saved.
- **QR-08 — Content governance and scientific accuracy:** every released shared/baseline unit has traceable source and rights evidence plus named subject-matter approval. Important scientific claims, answer keys, formulas, and models are cross-checked against at least two independent references, including an appropriate authoritative scientific/educational reference. Software tests do not constitute subject-matter approval. Teacher-private content uses the distinct, scoped review policy in Section 10; a scored lab must still use an approved scientific model and golden cases.
- **QR-09 — Interaction performance:** supported Student screens acknowledge input within 100 ms, keep the primary action usable during recoverable failures, and target p95 API latency of 500 ms for reads and 1,000 ms for mutations in the pilot environment, excluding file/video transfer and simulation rendering.
- **QR-10 — Runtime reliability:** the A1–A5 seeded journey targets at least 95% successful completion without an unrecoverable application error and at least 99% crash-free pilot sessions. These are measured pilot gates, not claims about the current code.

## 7. Architecture and delivery constraints

- `nexalab-be` is the product coordination root, API, persistence, and authoritative simulation boundary.
- `nexalab-fe` is the React client and owns Student UX artifacts and client rendering.
- `packages/sim` stays deterministic and is versioned when synchronized to the frontend.
- The two repositories are delivered against explicit API contracts; no frontend-only authorization or progress truth.
- Supabase is the managed PostgreSQL provider for MVP environments. Prisma remains the schema, migration, and query boundary; Supabase Auth, browser database access, and RLS are not substitutes for NexaLab backend authentication, RBAC, or ownership checks.
- Runtime API traffic uses a pooled Supabase connection and Prisma migration/seed/admin commands use a direct or session-pooled connection. Database secrets are server-only and never use a `VITE_` prefix.
- Cloudflare R2 Standard is the private object store for video and binary learning assets. PostgreSQL stores metadata/provenance and immutable object references; API-issued temporary access, upload finalization, file validation, and immutable versioning are required. Upload implementation details belong to the architecture/epic specs.
- Existing routes, schema, UI, tests, mockups, and README statements are evidence of current shape, not automatic proof that a requirement is complete.

## 8. Verification and release evidence

Every ticket and release claim distinguishes four evidence levels:

1. **Source verification:** implementation and authorization paths are traced in code.
2. **Automated verification:** relevant unit, typecheck, lint, and build commands pass.
3. **Runtime verification:** real configured API, database, seed data, and browser or client path are exercised.
4. **Production verification:** deployed environment is exercised; this is never inferred from local success.

Integration and E2E are marked passed only when their actual database, API, seed, and browser dependencies ran successfully.

## 9. Release 1 outcome gates

Increment A is ready for pilot review when a provisioned student can complete the assigned path from login through progress using real seeded dependencies; unauthorized cross-user and cross-class access is rejected; the representative simulation result and verdict are server-authoritative; and required responsive/accessibility checks have evidence.

The pilot gate is measured with one school, up to two Grade 8 classes and at most 80 students, on the supported device/browser matrix in Section 10. Targets are: at least 70% assigned-path completion, at least 60% of students who submit the representative lab make a second attempt when the first is not passed, at least 95% successful A1–A5 seeded journeys without an unrecoverable application error, zero verified cross-user/cross-class authorization leaks, and zero mismatches between persisted official simulation verdicts and backend recomputation. These are acceptance targets and remain unproven until measured with real dependencies.

## 10. Product Owner decisions

1. **Curriculum/content:** Increment A's representative pilot set is NexaLab-authored Grade 8 Natural Science mapped to the official subject-specific KHTN curriculum. The MVP content target for B/C is Grade 8–9 KHTN; this expands the Grade 8-only content scope recorded on 2026-10-12. Every lesson records subject, grade, curriculum outcome/reference, learning objective, prerequisites, source evidence, and review state. The baseline/shared catalog uses NexaLab-authored or item-level openly reusable sources; free-to-view textbook content is not ingested or reproduced without explicit reuse rights.
2. **Enrollment:** Increment A uses teacher/school provisioning only. Student join-code enrollment is not exposed in Student P0 and does not count as an accepted A1 path.
3. **Quiz scope:** the former Increment A 50% quiz gate is superseded for Open Curriculum. No shared-curriculum quiz or Quizlet/card step gates public content or foundational Labs. Teacher-created decks/study quizzes belong in Class Space and are unscored practice. Tests are scored only when explicitly assigned and use server-calculated scoring, retry, answer-key privacy, and eligible-target rules. No default quiz prerequisite applies to a Lab.
4. **Representative practical:** the Grade 8 circuit lab and its existing deterministic circuit model are the A4 representative lab/challenge.
5. **Video completion:** a required video completes at 90% watched or on the media `ended` event, whichever happens first. Seeking cannot reduce the recorded high-water mark. When video is unavailable, the published transcript/equivalent text is the required fallback and has an explicit completion action. Video never autoplays.
6. **Retention:** refresh sessions keep their configured expiry and are revocable. Learning attempts, quiz attempts, step evidence, progress, assignment evidence, and authorization audit records are retained for 12 months after the student's last activity in the pilot. Deletion/export policy beyond the pilot remains a launch/legal review item and cannot be inferred from this technical retention default.
7. **Pilot matrix:** one school, up to two Grade 8 classes and at most 80 students; latest two stable Chrome and Edge desktop releases, latest two stable Chrome Android releases, and latest two stable Safari iOS releases. Responsive evidence is required at 390, 768, 1024, and 1440 px.
8. **Assignment behavior:** active applicable assignments are ordered by due date ascending, then creation time ascending, then stable ID. Overdue assignments remain actionable and labeled overdue. Archived assignments are excluded from the primary queue but remain available through history where evidence exists.
9. **Minimal operations:** A1 supports both an idempotent seed for development/E2E and the smallest existing teacher-owned operator path for provisioning, publishing/choosing content, and assigning it. This is not approval for full Teacher/Admin UX.
10. **MVP data platform:** Supabase supplies managed PostgreSQL only. NexaLab continues to own identity/session logic in NestJS and all clients access data through the backend API.
11. **Authentication delivery and fixtures:** authentication/session hardening is the first functional prerequisite inside A1 and may be implemented on an independent coordinated branch, but it is not a separate product epic. Development and E2E use environment-driven seeded Teacher/Student personas; these accounts never enable Student self-registration, bypass backend auth, or ship as production credentials.
12. **Content scope and review:** shared/baseline catalog content must pass editorial, scientific-accuracy, and rights review. Teacher-private authored content can be self-reviewed and published only to the teacher's owned classes; it cannot enter the shared library or bypass source/rights declarations, child-safety checks, or the approved scientific-model gate for scored labs. Admin may quarantine/reassign content or assets for operations with reason and audit, but cannot attest scientific correctness or force-release an item.
13. **Parent ID privacy:** on parent child-progress detail routes, any student ID not linked to the authenticated parent returns the same 403 response and audited denial, whether the ID exists or not. This overrides the conflicting generic SRS CR-11 not-found wording for this route to prevent student-existence enumeration.
14. **Parent-link lifecycle:** the relationship status is `pending` or `approved`; only `approved` links grant progress access. The responsible teacher verifies the guardian relationship against school-held records before issuing a single-use, seven-day code. Parent email verification proves mailbox control, not parentage; required consent and email-verification prerequisites must be complete before activation. The C1 SPEC defines the exact `pending → approved` transition and invitation persistence.
15. **Open Curriculum and Class Space:** Open Curriculum includes only released shared lessons, videos, lesson-level basic exercises, references, and foundational Labs when present. The student catalog navigates subject → available grades (ascending) → ordered chapter/topic table of contents → ordered lessons. Quizlet/cards and quizzes are teacher-created Class Space activities; none is in the public lesson flow. Foundational Labs are shared across students and tied to official curriculum taxonomy. Teacher-created Labs are class-private and must link to the class lesson and its subject/grade/chapter/topic context; they enter scored assignment workflow only when explicitly assigned. These rules supersede decision 3's public quiz gate and the previous public-card assumptions.
16. **Progress and Class Space authoring:** Foundational subject progress covers lesson content, video, basic exercises, and foundational Lab activity when required by the fixed official course version. It is distinct from assigned-work status. An assignment target linked to the subject keeps the summary “Chưa đạt” until accepted by its evaluator while it remains actionable to the student, including while unsubmitted or in progress; preserve closed/archived evidence and stop holding the current rollup unmet only when it is no longer actionable for that student. Class Space decks and study quizzes are unscored practice; tests are scored only when explicitly assigned. Teachers may author content directly, enter or import source data, or ask AI to draft advanced extensions grounded in a linked lesson; AI output requires teacher review and publication.

17. **Class Space authoring scope:** For the current delivery, teachers create study-card decks, unscored study quizzes, and test content directly or import supported files. AI-generated content is deferred to a subsequent sprint; do not include provider, prompt, safety, or generation work in the current technical contract.
18. **Late teacher-assigned tests:** Each assigned test has a due date. A late submission includes a student reason and awaits the owning teacher's decision. Approval starts a new assignment round for the whole eligible recipient set; rejection records zero for that student. Preserve each submission and decision as immutable, audited evidence. The round/score aggregation details are specified in `../../_bmad-output/specs/spec-open-learning-catalog/class-space-assignment-contract.md`.
19. **Class Lab authorization:** A custom Lab is available only to active, approved members of its owning Class Space. A nonmember cannot discover, open, or run it, even by direct URL or ID. Scored submission remains restricted to the assignment target snapshot.

## 11. Current implementation evidence note

Source inspection on 2026-10-12 found implementations or scaffolds for role identities, student username login, refresh-cookie sessions, temporary-password gating, class ownership, student provisioning, assignments, published lessons, multiple-choice quiz scoring, simulations, attempts, progress, parent links, and admin routes. The current schema and UI do not by themselves prove the full Increment A pathway, Class Space resources, the Open Curriculum catalog/progress, evidence drill-down, responsive UX, or real integration behavior. The 2026-10-18 authoring/import, late-test, and class-Lab authorization amendment extends the 2026-10-17 Open Curriculum and Class Space contract; it is product direction; it is not evidence that the corresponding changes are implemented or runtime-verified.
