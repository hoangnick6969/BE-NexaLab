# Access, Progress, Assignment, and Lab Discovery Contract

This companion makes the visibility and navigation rules precise. It does not replace the API, release, and teacher contracts in the adopted specs; it narrows them where they conflict with open catalog access.

## 1. Separate policy dimensions

| Dimension | Example values | Meaning |
|---|---|---|
| Audience scope | `SHARED`, `TEACHER_PRIVATE` | Which learners may access the resource |
| Publication lifecycle | `DRAFT`, `REVIEWED`, `PUBLISHED`, `ARCHIVED`, `QUARANTINED` | Whether and how the resource may be served |
| Creator/owner | platform/editorial team, teacher | Who may author or modify the resource |
| Rights/review evidence | source/license, editorial, subject, accessibility, model-safety review | Whether the resource may be released and used |
| Assignment | class, target snapshot, due date, immutable version | Which private task is assigned and to whom |

Do not infer audience from lifecycle, class membership, asset ownership, or rights. A public/SHARED resource still needs valid release evidence.

## 2. Student access matrix

| Resource/action | Student with no class | Student outside assigning class | Active assignment target |
|---|---:|---:|---:|
| Published shared lesson reading | Allow | Allow | Allow |
| Published shared lesson video or transcript | Allow | Allow | Allow |
| Published shared ebook reference | Allow | Allow | Allow |
| Published baseline quiz/cards included in the official course | Allow | Allow | Allow |
| Published foundational Lab/simulation pack | Allow | Allow | Allow |
| Teacher-created private quiz/card variant | Deny | Deny | Allow while assignment is active and target is eligible |
| Teacher-created exercise or customized Lab scenario | Deny | Deny | Allow while assignment is active and target is eligible |
| Draft, quarantined, rights-blocked, or unreviewed shared content | Deny | Deny | Deny |

Direct-ID, detail, attempt, submission, and media routes enforce the same decision as list routes. An obscured UI element is not an authorization boundary.

## 3. Progress versus access

- Shared content is open independently of progress. Reading/video completion and quiz outcomes can be measured, but they do not unlock or hide other shared materials.
- Student-facing “Bài đọc” step is labeled “Nội dung bài”; its section heading may be “Kiến thức”. Retain the current internal step identifier unless a separate migration is justified.
- Student profile shows course status by subject and grade, with drill-down through chapter → topic → lesson → activity. The projection uses student-owned evidence and the identified, fixed official curriculum version.
- The progress denominator is the complete required scope of that official course version. Teacher-created supplemental quizzes/cards, exercises, and simulation assignments never add to or change the course denominator.
- A student cannot receive `COMPLETED` for the whole course while required items in the fixed official version are missing/unreleased or unfinished. Show content-release coverage separately so curriculum availability is not mistaken for student progress.
- A new official curriculum revision receives a distinct version. Do not silently expand a student's existing course denominator when a teacher adds supplemental material.
- Reuse the existing server-side A2 pathway completion rules for official-course activities: reading requires its explicit completion action; video uses the existing high-water rule and completes at 90% or `ended`; cards complete after every card has been visited. Do not introduce a second progress threshold system.
- Baseline quiz outcomes are tracked separately and count toward official course completion only when the fixed official course version marks that assessment required. Quiz status never gates access to shared content.
- Only foundational Labs included in the official curriculum belong in the shared Lab taxonomy/catalog and course denominator. Teacher-custom Labs/scenarios are private assignment work and are excluded from the curriculum catalog, contextual synchronization, and course progress.
- Assignment status and attempts are separate from open course progress. Teacher reports can show assigned work and outcomes without changing the student's access to shared curriculum.
- Preserve old assignment-linked `StepProgress`, `QuizAttempt`, and simulation attempts as assignment evidence. Do not merge them into open-course progress without a documented, reconciled migration rule.

## 4. Lab catalog and contextual synchronization

### Subject-wide Lab tab

- The Lab tab lists all released shared Labs, organized/filterable by subject and supporting grade, chapter, topic, and outcome filters plus text search.
- Teacher-private assigned scenarios are shown only in the assignment area for eligible targets; they must not leak into the shared Lab catalog or search results.
- Opening a shared Lab from the catalog uses a stable Lab/pack route and keeps a clear subject and curriculum context.

### Current chapter/topic context

- When the student selects a chapter/topic, opens a lesson in one, or changes the active subject/grade context, the matching Lab section updates automatically from the same curriculum relations used by the subject-wide catalog.
- Each match links directly to the corresponding Lab detail/launch route. Returning from a Lab preserves the prior subject/grade/chapter/topic context where supported by navigation.
- Mapping uses stable IDs, never title substring matching. The data contract must represent the Lab's subject, grade applicability, canonical chapter/topic/outcome alignment, and optional related curriculum links.
- Shared Lab pack/model is the reusable educational resource. A teacher's task text, selected parameters, constraints, and scoring target are an assignment-private scenario version that references the shared pack/model version.
- Quiz gates may apply within a teacher-private assignment flow only where explicitly configured by that assignment's spec. They never gate access to the shared Lab catalog or foundational simulation pack.

### Current schema finding and recommended normalization

- `CurriculumTopic` has a stable code and belongs to one `CurriculumChapter`; Content Foundation defines simulation packs in the topic/outcome layer.
- Current `Lab` stores `grade` and free-text `topic`, with no relation to `CurriculumChapter`, `CurriculumTopic`, or `CurriculumOutcome`. `Lesson.labId` is a single optional link and cannot power the full subject-wide catalog or contextual discovery by itself.
- Required normalized contract for shared foundational curriculum Labs: each pack has one canonical topic, explicit links to applicable learning outcomes, and chapter derived from its topic. Add explicit related-topic links only when curriculum evidence supports discovery from another topic. Do not duplicate the same Lab pack to make it appear in multiple contexts. A Lab related to several topics resolves to the same pack/version and direct route in every context.
- Teacher-custom Labs/scenarios do not receive official curriculum taxonomy membership and do not appear in this catalog or affect course progress; they are surfaced only through their eligible assignment.

## 5. Video handling in this scope

- Preserve current video URLs, shared demo URL seed, and UI behavior during the catalog/progress change.
- Keep the lesson-level video resource model so later user-provided URLs can be seeded against the intended lesson.
- When lesson-specific URLs are seeded, verify the lesson-to-URL mapping. Distinguish a shared UI demo clip from a lesson-accurate video in coverage and release reporting.
- This scope does not introduce a video replacement, content audit, or production reseed.

## 6. Existing spec precedence

- **A2 core materials:** ordered content/video progress remains applicable to recording study evidence. The student-facing step is “Nội dung bài” and its section may be titled “Kiến thức”. Assignment authorization no longer applies to published shared reading/video/ebook resources. Baseline course cards are shared; teacher-created private card variants remain assignment-only.
- **A3 quiz learning gates:** answer-key privacy, immutable attempts, retries, and server scoring remain applicable. Baseline course quizzes are shared assessments with attempts tracked separately; they count toward official course completion only if marked required in that course version. Teacher-created quizzes are private assignments. A quiz pass cannot unlock shared catalog/Lab access.
- **B1 teacher operations:** class ownership, enrollment eligibility, assignment target snapshots, archive behavior, and private variants remain applicable to teacher-created work. A lesson assignment is supplemental and is not required to open shared baseline lessons.
- **Content Foundation:** rights, scientific/editorial review, immutable versions, simulation validation, and release receipts remain gates for publishing shared resources. The open-catalog rule does not bypass them.
- If a future PRD, UX, or architecture update changes one of these boundaries, update this spec and the affected adopted contract together before implementation.

## 7. Acceptance checklist

- [ ] Student with no enrollment can discover and open shared resources across grades.
- [ ] Reading/video/quiz status does not block shared content or base Labs.
- [ ] Profile displays subject/grade course status and chapter/topic/lesson progress independently of assignment queue.
- [ ] Student without assignment target is denied private teacher activity through list and direct-ID operations.
- [ ] Student subject Lab tab supports complete shared catalog, search, and curriculum filters.
- [ ] Published baseline quiz/cards are shared; teacher-created quiz/card variants remain private to their assignment targets.
- [ ] Course progress uses a fixed official curriculum version; teacher supplementary assignments do not alter its denominator, and unreleased required curriculum prevents full-course completion.
- [ ] Official-course progress reuses existing A2 reading/video/cards completion rules; baseline quiz completion counts only when explicitly required by the official course version.
- [ ] Core lesson step is labeled “Nội dung bài” and its section may be titled “Kiến thức” without changing internal IDs absent a justified migration.
- [ ] Active chapter/topic automatically surfaces matching Labs and provides direct navigation.
- [ ] Lab catalog and contextual results resolve through the same stable curriculum IDs.
- [ ] Teacher-private Lab scenario cannot expose or mutate its shared base pack.
- [ ] Only foundational official-course Labs appear in the shared catalog/taxonomy and affect official course progress; custom teacher Labs remain assignment-only.
- [ ] Current video URLs/seeds are unchanged; later per-lesson URL seed remains representable.
- [ ] Existing assignment evidence remains traceable and content-release gates remain enforced.
