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
| Student | Complete assigned learning and review own evidence | Own assignments, attempts, and progress only |
| Teacher | Operate owned classes and act on student evidence | Owned classes and enrolled students only |
| Parent | Understand a linked child's progress | Read-only access to explicitly linked children |
| Admin | Operate users, content, labs, and assets | Administrative capability without bypassing audit or ownership rules |

Students use teacher or school-provisioned usernames. They do not self-register or reset through email. Teachers, parents, and admins use adult email accounts. A class join code, temporary password, and parent-link code are separate credentials with separate purposes.

## 3. Release structure

Release 1 uses one shared architecture and is delivered in increments:

### Shared Foundation

- Role-aware identity and session lifecycle.
- Server-side RBAC and resource ownership.
- Shared domain relationships for `Teacher → Class → Student` and `Content → Assignment → Attempt → Progress`.
- Deterministic simulation and official progress boundaries.
- API, validation, error, testing, and evidence conventions shared by both repositories.

### Increment A — Student Learning Core + Minimal Operations

The detailed planning scope for this cycle:

- student login with a provisioned account and mandatory temporary-password change when applicable;
- assigned learning;
- lesson content, video, and study cards;
- scored quiz and explicit learning-step gates;
- at least one representative lab/challenge;
- retry, official progress, and attempt history;
- only the operations needed to seed or manage a student, class, content item, and assignment for the student flow.

### Increment B — Teacher Operations

Full teacher UX for owned-class management, content and assignment operations, and evidence review. The MVP content catalog targets Grade 8–9 Natural Science. The initial pilot sample can remain Grade 8-only and does not narrow the product content target. Baseline/shared learning materials use NexaLab-authored or item-level openly reusable sources and pass the shared-content review gates. Teachers may publish class-private authored materials under the separate private-content policy in Section 10. Increment A may expose a minimal operator path but must not silently expand into the complete Teacher experience.

### Increment C — Parent and Admin

Read-only linked-child progress for parents and complete administrative operations for users, content, labs, and assets.

### Future

- Teacher AI Content Assistant with structured drafts, review, approval, publication, and audit.
- Student AI Tutor with bounded progressive hints.

AI, leaderboard, gamification economies, and advanced analytics are not Release 1 Increment A.

## 4. Student learning outcome

The canonical Student loop is:

**Learn → Quiz → Practice/Simulation → Challenge → Retry → Progress**

Within a lesson, the ordered path is:

**Reading → Video → Study cards → Quiz → Lab/Practice → Challenge**

Lab/Practice remains visible but locked until the quiz gate is met or an authorized server-side override exists. Challenge remains visible but locked until the required practical step is complete. The server, not hidden client UI, decides access and official completion.

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
- **FR-08:** A student shall see only assignments applicable to their approved enrollment and student targeting.
- **FR-09:** A student shall open assigned published content organized by subject, grade, chapter, and topic, with curriculum reference, learning objective, and prerequisites. The MVP content catalog targets Grade 8–9 Khoa học tự nhiên and reports coverage by grade and outcome.
- **FR-10:** A lesson shall support reading content, video or equivalent material with a recoverable unavailable state, and study cards.
- **FR-11:** A student shall complete a scored quiz; the server shall determine quiz outcome and the next unlocked learning step.
- **FR-12:** The UI shall show the complete ordered pathway, keep locked steps visible, and direct the primary action to the next unlocked step.
- **FR-13:** At least one representative lab/challenge shall let a student configure state, submit an attempt, receive the server-derived result and verdict, and retry without AI authority.
- **FR-14:** Each practical attempt shall retain student, challenge, submitted state, simulation result, verdict, duration, and timestamp.
- **FR-15:** A student shall review official progress and attempt history, and every score, count, or status shown shall drill into source content or attempts.

### Increment B — Teacher Operations capability envelope

- **FR-16:** A teacher shall manage owned classes and approved student membership.
- **FR-17:** A teacher shall manage permitted content and assign it to an owned class or selected enrolled students.
- **FR-18:** A teacher shall inspect student and class evidence without accessing unrelated classes or students.

### Increment C — Parent and Admin capability envelope

- **FR-19:** A parent shall have read-only progress access for explicitly linked children.
- **FR-20:** An admin shall manage users, content, subjects, labs, and assets under server-side authorization and audit boundaries. Explicit administrative recovery/operations may quarantine, archive, or reassign content/assets outside the actor's ownership only with a recorded reason and audit; these actions do not bypass scientific, rights, or publication gates.

### Future capability envelope

- **FR-21:** Teacher AI may create structured drafts only; an authorized human must review and publish them.
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
3. **Quiz gate:** a server-calculated score of at least 50% unlocks the representative practical step. Students may retry. Teacher override is deferred to Increment B and cannot be simulated by the client in Increment A.
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

## 11. Current implementation evidence note

Source inspection on 2026-10-12 found implementations or scaffolds for role identities, student username login, refresh-cookie sessions, temporary-password gating, class ownership, student provisioning, assignments, published lessons, multiple-choice quiz scoring, simulations, attempts, progress, parent links, and admin routes. The current schema and UI do not by themselves prove the full Increment A pathway, study-card model, server-enforced learning gates, evidence drill-down, responsive UX, or real integration behavior. Those remain work to verify or implement in later turns.
