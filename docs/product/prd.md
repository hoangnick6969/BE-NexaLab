# NexaLab Product Requirements Document

**Status:** Draft for product and technical review
**Inputs:** Product owner direction, [product brief](product-brief.md), current codebase evidence
**Scope:** Vietnamese THCS Natural Science, initially Grades 8–9

## 1. Purpose

NexaLab is a Vietnamese THCS Natural Science learning platform. It combines familiar LMS learning flows with interactive 3D/virtual labs, practical challenges, deterministic scientific evaluation and teacher-reviewed AI content assistance.

The product must close two gaps:

- **Practice gap:** students need to act, experiment, observe results and retry, rather than only consume content.
- **Diagnostic gap:** teachers need usable evidence of what a student attempted, where they struggled and why.

## 2. Users and access

| Role | Primary outcome | Access boundary |
| --- | --- | --- |
| Student | Learn, practice and improve through feedback | Sees own learning data and assigned content. |
| Teacher | Guide a class and act on student evidence | Manages only owned classes and their students. |
| Parent | Understand linked child progress | Read-only access to linked child data. |
| Admin | Operate platform content and users | Manages users, content, labs and assets. |

Students use teacher/school-provisioned usernames. Teachers, parents and admins use adult accounts. A class join code, temporary password and parent-link code are separate concepts.

## 3. Priority and release sequence

| Priority | Release | Included outcomes |
| --- | --- | --- |
| **P0** | **Release 1** | LMS learning flow, deterministic labs/challenges, assessment evidence, teacher/admin/parent role flows, and Teacher AI Content Assistant with mandatory human review. |
| **P1** | **After Release 1** | Student AI Tutor/Hint, after the P0 data, evaluator, audit and safety foundations have been validated. |
| **P2** | **Later research** | Advanced adaptive learning, computer vision, generated simulations, VR/AR, multiplayer and paid AI features. |

P0 is the scope used for architecture, epics and implementation planning. P1 and P2 must not be pulled into Release 1 without an explicit PRD update.

## 4. Release 1 experience

### Student learning loop

**Learn → Quiz → Practice/Simulation → Challenge → Retry → Progress**

Students can:

1. Browse assigned or available Grade 8–9 Physics, Chemistry and Biology lessons.
2. Read lesson content and use linked video/materials and study cards/flashcards.
3. Complete quizzes and see their own outcome.
4. Enter an interactive lab, change its state and run a practical challenge.
5. See a verified result, retry, and review progress and prior attempts.

### Teacher workflow

**Manage class/students → create or manage lessons → draft with AI → review/publish → assign → review/grade → monitor → inspect evidence**

Teachers can manage their classes and students, create or edit lesson content within permissions, assign lessons or labs to a class or selected students, and review progress, quiz outcomes, attempts, challenge results and misconception evidence.

### Parent and admin workflow

Parents can view a linked child’s progress without changing learning data. Admins manage users, content, lab metadata and assets.

## 5. Functional requirements

### Content and curriculum

- **FR-01 (P0):** The platform shall organize learning content by subject, grade, chapter and topic for Vietnamese THCS Natural Science.
- **FR-02 (P0):** Every published lesson and lab shall record curriculum reference, learning objective and prerequisite knowledge.
- **FR-03 (P0):** Initial curriculum coverage shall target GDPT 2018 Grades 8–9 with an approved textbook/content set. The exact approved sources are a release prerequisite.
- **FR-04 (P0):** Students shall be able to consume lesson text, attached learning materials/video, quizzes and study cards/flashcards.
- **FR-05 (P0):** Authorized teachers and admins shall create, edit, publish, archive and manage learning content under the final content-review policy.

### Classes, assignments and progress

- **FR-06 (P0):** Teachers shall create and manage classes, provision students, approve membership and assign content to a class or selected students.
- **FR-07 (P0):** Students shall see applicable assignments, due dates and their own completion/progress state.
- **FR-08 (P0):** The platform shall retain student progress, quiz outcomes, practical attempts and challenge outcomes.
- **FR-09 (P0):** Teachers shall see class and student evidence sufficient to identify students needing support and the reason indicated by the evidence.
- **FR-10 (P0):** Parents shall see only read-only progress for a child linked through the approved relationship flow.

### Assessment and practical learning

- **FR-11 (P0):** Lessons shall support scored quizzes. Multiple-choice is the verified current format; additional assessment types require explicit specification before implementation.
- **FR-12 (P0):** Labs shall support practical challenges that can evaluate student-configured simulation state.
- **FR-13 (P0):** The simulation engine shall compute the scientific result. A Challenge Evaluator shall derive pass, partial or fail from that verified result and persisted challenge constraints.
- **FR-14 (P0):** Each practical attempt shall retain the verified lab state, result, verdict, duration and time needed for student progress and teacher evidence.
- **FR-15 (P0):** The product shall support linking learning content and practical activity, but a formal mixed quiz-plus-lab assessment flow is deferred until its rules are specified.

### Teacher AI Content Assistant

- **FR-16 (P0):** A teacher shall be able to select a source lesson or topic and request one draft artifact: quiz/test questions, flashcards/study cards, or learning material.
- **FR-17 (P0):** Each request shall include the intended grade, subject, curriculum reference, learning objective, prerequisite knowledge, source lesson/topic and requested artifact type. The system shall reject incomplete context rather than generate a generic draft.
- **FR-18 (P0):** The assistant shall return a structured, editable draft that conforms to the same content schema used by the relevant authoring form. It shall include a clear source-context reference and remain associated with its teacher owner.
- **FR-19 (P0):** Every generated artifact shall start in `draft` state. It shall never appear to students or be assigned until an authorized teacher explicitly reviews, edits as needed, approves and publishes it.
- **FR-20 (P0):** The system shall retain an audit record for each generation: source-context identifiers, requested artifact type, draft identifier, generation time, provider/model or template version, and subsequent teacher approval, edit, publish or discard action.
- **FR-21 (P0):** The assistant shall not use student personal data as generation context. On validation/provider failure it shall show a recoverable error and shall not publish or partially overwrite existing content.
- **FR-22 (P0):** AI-generated drafts shall be presented as teacher-review material; the product shall require human verification of scientific accuracy, curriculum alignment and appropriateness before publication.

### Student AI Tutor and evidence analysis

- **FR-23 (P1):** Student tutoring shall provide bounded progressive support: **Question → Concept Hint → Action Hint → Explanation**.
- **FR-24 (P1):** Student tutoring shall use only relevant lesson, lab, challenge, verified result, attempt and hint-history context. It shall not reveal the solution before the permitted support level.
- **FR-25 (P1):** AI shall never calculate, override or alter a scientific result, challenge verdict or official score. Deterministic systems remain authoritative.
- **FR-26 (P1):** AI-assisted learning-evidence analysis may surface observations to teachers, but it shall not automatically assign grades or make high-impact student decisions.

### Analytics and administration

- **FR-27 (P0):** Student progress views shall include completion, quiz scores, practical attempts and challenge outcomes appropriate to the student.
- **FR-28 (P0):** Teacher analytics shall prioritize actionable progress, completion, quiz score, attempt, simulation/challenge result and misconception evidence.
- **FR-29 (P0):** Admins shall manage users, subjects, content, labs and assets without bypassing auditability or role boundaries.

## 6. Product constraints and quality requirements

- **QR-01 Scientific integrity:** only the deterministic simulation engine and evaluator determine scientific result and practical verdict.
- **QR-02 Authorization:** server-side role and resource-ownership checks protect all role-specific data and actions.
- **QR-03 Privacy:** parent views are read-only; student data is disclosed only through authorized role relationships. Camera/gesture interaction remains optional and must not be required to complete a lab.
- **QR-04 Explainability:** teacher-facing analytics and AI observations must show the underlying attempt or evidence that supports them.
- **QR-05 Reliability:** AI content generation must fail safely: provider errors or invalid output cannot create published content or overwrite existing content. The P1 tutor must provide bounded fallback guidance when its provider is unavailable, times out or returns invalid output.
- **QR-06 Content governance:** scientific models and published curriculum content require the approved review process; implementation tests do not substitute for subject-matter approval.
- **QR-07 Accessibility and responsive use:** core learning, assessment and class workflows must work without 3D gestures/camera and on supported desktop and mobile layouts.

Performance targets, retention periods, approved device/browser matrix and detailed content-review roles are not yet set; architecture and release planning must propose them for approval.

## 7. Scope boundaries

### P0: Release 1 scope

- LMS learning flow, classes, assignments, progress, normal quizzes and deterministic practical challenges.
- Interactive 3D/virtual labs for the approved initial content set.
- Teacher AI Content Assistant: structured draft generation, mandatory teacher review and publish controls, and generation audit records.
- Read-only parent tracking and admin user/content/lab management.

### P1: After Release 1

- Student AI Tutor/Hint and AI-assisted learning-evidence observations, after validation of P0 foundations.

### P2: Deferred research or later scope

- Computer vision/gesture interaction as a required control path.
- Advanced adaptive learning, competency prediction and claims that a score represents true ability.
- Advanced answer similarity/cheating detection, AI-generated 3D/models/challenges, multiplayer, VR/AR and advanced parent features.
- Paid AI features for students or parents.

### Non-goals for this product stage

- NexaLab does not replace classroom teaching.
- AI is not an autonomous teacher and does not make final learning or grading decisions.
- A simulation is not a real-world experiment.
- A score is not interpreted as true competency.
- Computer vision/gesture interaction is not a primary interaction path.
- AI-generated content is never auto-published.

## 8. Success measures and release gates

The following are **proposed 6-week pilot targets**. They are planning assumptions, not observed results, and need product-owner approval before they become release criteria.

| Outcome | Measurement | Proposed target |
| --- | --- | --- |
| Assigned learning completion | Assigned students completing an assigned lesson or lab ÷ assigned students | ≥ 70% |
| Practical engagement | Students who create at least two attempts in an assigned lab ÷ students who start that lab | ≥ 60% |
| Teacher diagnosis | Teachers who identify a student needing support and cite the relevant quiz/attempt evidence within 5 minutes in a task test ÷ participating teachers | ≥ 80% |
| AI draft governance | AI-created drafts published without an explicit teacher approval event | 0 |
| Teacher AI usefulness | Generated drafts that receive a teacher action (edit, approve/publish, or discard with reason) ÷ generated drafts | ≥ 80% |
| Deterministic assessment integrity | Automated cases where the stored practical verdict differs from the server evaluator result | 0 |
| P0 AI reliability | Generation requests that produce either a schema-valid draft or a clear recoverable error ÷ all generation requests | ≥ 95% |

Release is blocked until the Grade 8–9 content set and curriculum references are approved, subject-matter review is complete for included science models/content, the target measurements are approved, and role/ownership, scientific-result, content-publication and AI-boundary tests pass.

## 9. Open decisions for planning

1. Which approved textbook/content set supplies the initial Grade 8–9 material?
2. Who may approve AI-generated content, and what audit retention and discard-reason policy is required?
3. Are the proposed six-week pilot targets appropriate for the intended schools and cohort?
4. Which P0 student and teacher workflows will be validated first in a real classroom pilot?
5. What acceptance criteria must P1 satisfy before Student AI Tutor/Hint can begin?

## 10. Current implementation note

The existing repositories already demonstrate parts of P0: lessons, multiple-choice quizzes, classes, assignments, progress, three labs, deterministic evaluation, attempts, basic analytics, parent linking and admin management. A rules-first student tutor with optional model augmentation exists in code, but is P1 product scope. Flashcards/study cards, Teacher AI Content Assistant, formal mixed assessment and many release-quality decisions are requirements, not proof of current implementation.
