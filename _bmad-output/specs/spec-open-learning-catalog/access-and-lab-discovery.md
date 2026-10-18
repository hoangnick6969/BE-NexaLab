# Access, Progress, Assignment, and Lab Discovery Contract

This companion makes the visibility and navigation rules precise. It does not replace API, release, and teacher contracts except where they conflict with the confirmed PRD direction: Open Curriculum has no Quizlet/cards/quiz step; class study resources are teacher-created and membership-scoped; and custom Labs belong to a Class Space lesson context. Historical A1–A5 implementation evidence remains valid for its original assigned-work scope.

## 1. Separate policy dimensions

| Dimension | Example values | Meaning |
|---|---|---|
| Audience scope | `SHARED`, class-private | Which learners may access the resource: all students for released shared curriculum, active, approved members for class resources |
| Publication lifecycle | `DRAFT`, `REVIEWED`, `PUBLISHED`, `ARCHIVED`, `QUARANTINED` | Whether and how the resource may be served |
| Creator/owner | platform/editorial team, teacher | Who may author or modify the resource |
| Rights/review evidence | source/license, editorial, subject, accessibility, model-safety review | Whether the resource may be released and used |
| Assignment | target snapshot, due date, immutable version | Which scored/due-dated task is assigned and to whom; class resource sharing does not imply assignment |

Do not infer audience from lifecycle, class membership, asset ownership, or rights. A public/SHARED resource still needs valid release evidence.

## 2. Student access matrix

| Resource/action | Student with no class | Student outside resource class | Active, approved class member / eligible target |
|---|---:|---:|---:|
| Published shared lesson reading | Allow | Allow | Allow |
| Published shared lesson video or transcript | Allow | Allow | Allow |
| Published shared ebook reference | Allow | Allow | Allow |
| Teacher-created Class Space study deck or unscored study quiz | Deny | Deny | Allow when the student is an active, approved member of the resource class |
| Teacher-created scored test | Deny | Deny | Allow the assigned test only to active, approved members included in its assignment targets |
| Published foundational Lab/simulation pack | Allow | Allow | Allow |
| Teacher-created custom Lab linked to a Class Space lesson | Deny | Deny | Allow as a class resource to active, approved members; scored submission only while assignment is active and student is an eligible target |
| Draft, quarantined, rights-blocked, or unreviewed shared content | Deny | Deny | Deny |

Direct-ID, detail, attempt, submission, and media routes enforce the same decision as list routes. An obscured UI element is not an authorization boundary.

## 3. Progress versus access

- Shared content is open independently of progress. Reading/video/basic-exercise evidence is measured separately; no quiz/card step exists in the public lesson path and no quiz gates shared materials or either Lab type by default.
- Student-facing “Bài đọc” step is labeled “Nội dung bài”; its section heading may be “Kiến thức”. Retain the current internal step identifier unless a separate migration is justified.
- Student profile shows course status by subject and grade, with drill-down through chapter → topic → lesson → activity. The projection uses student-owned evidence and the identified, fixed official curriculum version.
- The progress denominator is the complete required scope of that official course version. Teacher-created supplemental quizzes/cards, exercises, and simulation assignments never add to or change the course denominator.
- A student cannot receive `COMPLETED` for the whole course while required items in the fixed official version are missing/unreleased or unfinished. Show content-release coverage separately so curriculum availability is not mistaken for student progress.
- A new official curriculum revision receives a distinct version. Do not silently expand a student's existing course denominator when a teacher adds supplemental material.
- Reuse applicable server-side A2 rules for official lesson content/video/basic exercises; preserve explicit content completion and the existing video high-water rule. Study cards and quizzes do not contribute to open-course progress because they are teacher-created Class Space activities.
- Only foundational Labs included in the official curriculum belong in the shared Lab taxonomy/catalog and course denominator. A teacher-created Lab must belong to a specific Class Space, link to its class lesson and stable subject/grade/chapter/topic IDs, and remain outside the global catalog and official course progress.
- Assignment status and attempts are separate from foundational course progress and its fixed denominator. The subject summary may show “Đạt mức cơ bản” when foundational requirements are complete, but remains “Chưa đạt” while an active assignment linked to the subject is targeted to the student and unsubmitted, in progress, or not accepted by its evaluator. Archived assignments retain history but leave the current unmet rollup. Show status with a drill-down to source assignment/evidence; neither it nor foundational progress changes access to shared curriculum.
- Teacher-created decks and study quizzes are unscored Class Space practice. Scored tests require explicit assignment. Teachers may create class study content directly or import a supported file. AI generation is deferred to a later sprint; imported content stays a draft until reviewed and published.
- Preserve old assignment-linked `StepProgress`, `QuizAttempt`, and simulation attempts as assignment evidence. Do not merge them into open-course progress without a documented, reconciled migration rule.

## 4. Lab catalog and contextual synchronization

### Subject-wide Lab tab

- The Lab tab lists all released shared Labs, organized/filterable by subject and supporting grade, chapter, topic, and outcome filters plus text search.
- Teacher-created custom Labs appear only in their Class Space when posted as a class resource; they must not leak into the shared Lab catalog or search results.
- Opening a shared Lab from the catalog uses a stable Lab/pack route and keeps a clear subject and curriculum context.

### Current chapter/topic context

- When the student selects a chapter/topic, opens a lesson in one, or changes the active subject/grade context, the matching Lab section updates automatically from the same curriculum relations used by the subject-wide catalog.
- Each match links directly to the corresponding Lab detail/launch route. Returning from a Lab preserves the prior subject/grade/chapter/topic context where supported by navigation.
- Mapping uses stable IDs, never title substring matching. The data contract must represent the Lab's subject, grade applicability, canonical chapter/topic/outcome alignment, and optional related curriculum links.
- Shared Lab pack/model is the reusable educational resource. A teacher-created class Lab references an approved pack/model version and a specific class lesson plus subject/grade/chapter/topic context. It may be posted to all active, approved members; due dates, scoring, and submission targets apply only when explicitly assigned.
- No quiz gates either Lab type by default. An explicitly assigned activity may define its own prerequisites only if a later approved product/API contract specifies them.

### Current schema finding and recommended normalization

- `CurriculumTopic` has a stable code and belongs to one `CurriculumChapter`; Content Foundation defines simulation packs in the topic/outcome layer.
- Current `Lab` stores `grade` and free-text `topic`, with no relation to `CurriculumChapter`, `CurriculumTopic`, or `CurriculumOutcome`. `Lesson.labId` is a single optional link and cannot power the full subject-wide catalog or contextual discovery by itself.
- Required normalized contract for shared foundational curriculum Labs: each pack has one canonical topic, explicit links to applicable learning outcomes, and chapter derived from its topic. Add explicit related-topic links only when curriculum evidence supports discovery from another topic. Do not duplicate the same Lab pack to make it appear in multiple contexts. A Lab related to several topics resolves to the same pack/version and direct route in every context.
- Teacher-custom Labs do not receive official curriculum taxonomy membership and do not appear in this catalog or affect course progress. They retain stable contextual links to the class lesson and its subject/grade/chapter/topic, and are surfaced in that Class Space independent of assignment when shared with the class.

## 5. Video handling in this scope

- Preserve current video URLs, shared demo URL seed, and UI behavior during the catalog/progress change.
- Keep the lesson-level video resource model so later user-provided URLs can be seeded against the intended lesson.
- When lesson-specific URLs are seeded, verify the lesson-to-URL mapping. Distinguish a shared UI demo clip from a lesson-accurate video in coverage and release reporting.
- This scope does not introduce a video replacement, content audit, or production reseed.

## 6. Existing spec precedence

- **A2 core materials:** open lesson content/video/basic-exercise progress remains applicable. The student-facing step is “Nội dung bài” and its section may be titled “Kiến thức”. Assignment authorization no longer applies to released shared lesson resources. Study cards are removed from the public pathway and are teacher-created Class Space resources.
- **A3 quiz learning gates:** answer-key privacy, immutable attempts, retries, and server scoring remain applicable to explicitly assigned tests. No baseline shared quiz exists in Open Curriculum. Class Space decks/study quizzes are unscored; tests are scored/due-dated only when explicitly assigned. No quiz/test status gates shared content or Labs by default.
- **B1 teacher operations:** class ownership, enrollment eligibility, assignment target snapshots, archive behavior, and private variants remain applicable to teacher-created work. A lesson assignment is supplemental and is not required to open shared baseline lessons.
- **Content Foundation:** rights, scientific/editorial review, immutable versions, simulation validation, and release receipts remain gates for publishing shared resources. The open-catalog rule does not bypass them.
- If a future PRD, UX, or architecture update changes one of these boundaries, update this spec and the affected adopted contract together before implementation.

## 7. Acceptance checklist

- [ ] Student with no enrollment can discover and open shared resources across grades.
- [ ] `/lessons` navigates subject → available grades ascending → ordered chapter/topic table of contents → ordered lessons → detail.
- [ ] Reading/video/basic-exercise status does not block shared content or either Lab type.
- [ ] Profile displays subject/grade course status and chapter/topic/lesson progress independently of assignment queue.
- [ ] Student outside the class is denied private teacher resources and custom-Lab discovery/run through list, direct-ID, launch, and result-write operations; only eligible assignment targets may submit scored work.
- [ ] Student subject Lab tab supports complete shared catalog, search, and curriculum filters.
- [ ] No cards or quiz appear in the Open Curriculum flow; teacher-created Class Space decks/study quizzes are unscored and available only to active, approved class members; scored tests require explicit assignment and eligible targets.
- [ ] Course progress uses a fixed official curriculum version; teacher supplementary assignments do not alter its denominator, and unreleased required curriculum prevents full-course completion.
- [ ] Open-course progress excludes Class Space cards/quizzes, custom Labs, and assignment evidence.
- [ ] Core lesson step is labeled “Nội dung bài” and its section may be titled “Kiến thức” without changing internal IDs absent a justified migration.
- [ ] Active chapter/topic automatically surfaces matching Labs and provides direct navigation.
- [ ] Lab catalog and contextual results resolve through the same stable curriculum IDs.
- [ ] Teacher-created Lab is linked to its Class Space, class lesson, subject/grade/chapter/topic context, and approved model version.
- [ ] Only foundational official-course Labs appear in the shared catalog/taxonomy and affect official course progress; custom class Labs remain inside Class Space.
- [ ] Current video URLs/seeds are unchanged; later per-lesson URL seed remains representable.
- [ ] Existing assignment evidence remains traceable and content-release gates remain enforced.

- [ ] A late assigned-test attempt includes a student reason; teacher approval resets the whole original target set in a new round, while rejection records zero and preserves history.
