# Sprint Change Proposal — Open Curriculum and Class Learning Spaces

**Date:** 2026-10-16
**Project:** NexaLab
**Status:** Draft for Product Owner review; implementation planning is not started
**Workflow:** BMAD Correct Course
**Trigger:** Clarification of open curriculum, teacher class resources, and Quizlet-style study decks

## 1. Issue summary

The earlier proposal mixed three separate product concepts: public curriculum, materials shared to a class, and assignments. It also treated baseline quiz/cards as part of the open curriculum. The clarified direction is:

1. Released official THCS subject materials are open to all students across grades and subjects. The baseline includes lesson content, video, lesson-level basic practice, previously approved open ebook/reference links, and reviewed foundational Labs/simulations where present. Reading, course progress, class enrollment, quiz results, and assignments do not gate access. This access policy does not imply that every subject or grade already has a complete published corpus.
2. Keep reading/content and video in Bài học; remove the public quiz gate. The shared learning flow is knowledge/content → video → basic exercises for that lesson → optional open curriculum Lab when available. Do not make optional Lab completion a prerequisite for reading other open materials. The public curriculum has no Quizlet/study-card decks or scored quiz; teacher-created Quizlet and quizzes belong in Class Space/assigned work.
3. A teacher has a separate Class Space. Approved current class members can read materials and files the teacher posts or imports for that class without those materials being converted into assignments. Class-only advanced/enrichment materials live here and do not change the official shared curriculum.
4. A teacher may provide a Quizlet-style study deck in Class Space for learners in that class. Quizlet is available only to approved members of that class; it is not part of the public curriculum. AI-assisted deck creation is a future feature; importing a file as a class resource does not automatically create a deck. A Quizlet deck is a study resource, not a scored quiz or assignment.
5. Assignments remain a distinct workflow for explicitly assigned, due-dated, tracked, or scored work. Class membership determines access to class resources; assignment targeting determines access to assignment activity.
6. Open curriculum navigation must be scannable and hierarchical: subject within grade → chapters in that subject → lessons in each chapter → lesson detail. Use the same official taxonomy for navigation and progress.
7. Improve perceived and measured load time for the lesson catalog, video, and PDF ebook. Profile real query/media bottlenecks, avoid N+1/oversized requests, and agree measurable latency/transfer budgets before release.
8. Show course/subject progress in both the student profile and dashboard, while keeping open-curriculum progress distinct from class-assessed work.
9. Where a lesson maps to a textbook page, provide a verified link to the relevant ebook page. Store printed-page references separately from the PDF's physical page index; never assume a printed page number equals a PDF page index.

The issue is a product-boundary clarification and a correction to the previous proposal, not a request to roll back existing code. Content rights, scientific review, asset safety, and publication gates remain in force.

## 2. Codebase evidence

| Area | Current evidence | Consequence |
|---|---|---|
| Student lesson catalog | `GET /lessons` builds a student result from applicable lesson assignments; it does not return all released `SHARED_LIBRARY` lessons to students. | Open curriculum needs a distinct public-resource query and access policy. |
| Lesson pathway and quiz | `studentPathway` requires an applicable lesson assignment. Quiz retrieval and step-progress writes call it; A3 also gates quiz delivery on prior required steps. | Public content/video and class study resources cannot reuse assignment authorization as-is. Public study must not silently inherit the old quiz gate. |
| Progress | `/me/progress` starts from applicable assignments. `StepProgress` writes require an assignment ID; the schema has nullable `assignmentId` and a compound unique key containing it. | Course progress needs a separately defined identity and evidence reconciliation; the existing assignment report is not the requested subject/course view. |
| Content scope | `Lesson.scope` is `TEACHER_PRIVATE` or `SHARED_LIBRARY`; `Lesson` has no class relation. Chapter/topic are text and outcome links are JSON. | The current scope cannot express a teacher lesson visible only in one class, nor guarantee stable curriculum navigation/version membership. |
| Class resources | `Classroom` relates to enrollment and `Assignment`; no class-material/resource relation was found. The teacher class UI has roster and assignments. | A posted/uploaded resource currently has no assignment-independent class-sharing route or UI. |
| Uploads | Asset upload and immutable `AssetVersion` foundations exist, but asset scope is owner-private or `SHARED_LIBRARY`; access checks do not resolve class membership. | A teacher file must be attached to a class resource and downloads must authorize active class membership before issuing a signed URL. |
| Labs | `Lab` is public by `status = published` in `/labs`, but has no audience scope or chapter/topic/outcome FK. | Keep reviewed curriculum Labs open; define a separate private class/custom scenario reference and normalize official Lab taxonomy. |
| Frontend | Student has global Lessons/Lab/Assignments/Progress routes. Teacher class detail shows roster and assignments; no student Class Space resource view or Quizlet tab was found. Lesson UI currently renders study cards as pathway steps. | Add a class-space destination and class-resource tabs; remove platform cards from the public pathway while preserving assignment/private usage where explicitly needed. |
| Curriculum navigation and progress UI | Lessons are exposed through global routes and current progress UI is assignment-based; the new hierarchy and progress-on-dashboard/profile are not one consistent course view yet. | Build subject → grade → chapter → lesson navigation and expose the same course progress summary in profile and dashboard. |
| Ebook page mapping | The source map already contains per-lesson `printedPageStart`/`printedPageRange` and OCR/source locators; it was generated from the supplied text, lesson-heading boundaries, and book outline, so this does not require a person to manually enter every lesson. However, the source map is `NEEDS_HUMAN_REVIEW`, some ranges are TOC-derived rather than page-verified, and `sourceLocator.physicalPdfPage` is null. `Subject.ebookUrl` is subject-level; `Lesson` has no page mapping field. `EbookAnnotation.pageNumber` is one-based, the reader initializes at page 1, and lesson navigation passes a lesson ID, not a page. | Import/reuse the existing printed-page mapping, verify the edition-specific conversion to the PDF physical page index, and persist that locator for runtime navigation. Preserve provenance/confidence; do not treat TOC ranges as exact page mappings or guess a page. |
| Media/query performance | PDF.js attempts byte-range loading when the storage response supports ranges, with URL-loading fallback. No measured query, video, PDF first-page, or transfer-size baseline is recorded in this proposal. | Benchmark before and after; confirm storage range/cache behavior and eliminate identified query bottlenecks instead of assuming a code path is fast. |

These are source-level findings. They do not establish live database, production, or runtime behavior.

## 2.1 Product source of truth and document order

`docs/product/prd.md` is the product source of truth for learner journeys, audience rules, progress meaning, and release scope. It currently conflicts with this direction, so it must be updated first and explicitly record the approved decisions. Architecture and epic/spec documents must then derive from the updated PRD; they must not introduce competing product rules. UX definitions, API contracts, acceptance criteria, and stories follow those decisions. If a derived document still conflicts with the PRD, treat it as stale and do not start implementation from it.

## 3. Target product boundary

| Resource | Visibility rule | Assignment relationship |
|---|---|---|
| Official curriculum content, lesson video, lesson-level basic exercises, external ebook/reference link | Open to every authenticated student, including cross-grade access, once published and release-cleared | Never requires an assignment |
| Reviewed foundational curriculum Lab/simulation | Open to every authenticated student once released; discoverable by subject and official chapter/topic/outcomes | Never requires enrollment, a quiz pass, or an assignment |
| Public curriculum Quizlet/cards and scored quiz | Not provided in the baseline curriculum; do not insert a quiz gate into the shared learning flow | Not applicable |
| Teacher-posted class lesson/material/file | Active approved members of the relevant class can access; a teacher may author a class-specific lesson without changing the shared curriculum | Visible by class membership; not an assignment by default |
| Teacher Quizlet-style deck linked to class material | Active approved members of that class can study it when a deck exists | Class study resource; not a scored assessment or assignment by default. AI creation is future scope; file import alone does not generate a deck. |
| Explicit teacher assignment, scored quiz, supplemental exercise, or custom Lab scenario | Only eligible active assignment targets, under the existing class ownership and target rules | Assignment workflow owns due date, submission, score, completion, and reporting; teacher-evaluated work may contribute to that class's learning status without gating open curriculum |

Keep **audience**, **publication/review lifecycle**, **class membership**, and **assignment targeting** as separate policy dimensions. A class resource can be published to its class without becoming globally shared or being assigned. A public curriculum item does not become private because it is also referenced from a class or assignment.

Keep **Quizlet-style study deck** separate from **scored quiz** in names, API models, UI tabs, progress, and acceptance tests. The public curriculum has no baseline deck or scored quiz gate. Basic lesson exercises are part of the shared learning materials and are distinct from teacher-assigned scored quizzes. A teacher deck in Class Space is for study; a graded test remains an explicit assignment feature.

## 4. Impact assessment

### Product requirements and epics

- **PRD:** Keep the existing allowance for teacher-authored class-private materials, but define Class Spaces as a separate student destination from both Open Curriculum and Assignments. Add membership-scoped posting/upload without requiring assignment. Remove platform baseline Quizlet/cards and scored-quiz gates from public curriculum; define shared lesson-level basic practice separately from teacher-assigned scored quizzes.
- **A1:** Student onboarding must lead to open curriculum independently of teacher provisioning or assignment; class membership is shown as additional context.
- **A2:** Public core pathway is lesson content, video, and lesson-level basic exercises; an optional published reference/Lab may be present. Remove `QUIZ` as the shared pathway gate. Keep study decks out of the public curriculum; Class Space Quizlet is separate from A2.
- **A3/A4:** Keep server-scored quizzes and private supplemental exercises/Labs as explicit teacher-assigned work. Do not use them to gate public content or foundational public Labs. Preserve server scoring and answer-key privacy.
- **A5:** Track open subject progress from reading, video, and basic lesson exercises, with optional open Lab evidence where relevant. Also show teacher-evaluated assigned work in the enrolled class context and define how it contributes to that class/course status. Keep these evidence sources attributable and do not let assignments gate open access.
- **B1:** Build Class Space foundations for both teacher and student roles: teacher can post/import resources for the class; enrolled students can discover and open them. Sharing with approved members is distinct from assigning work. Quizlet authoring/import UX and other small features can follow after this foundation.
- **F1 / future:** AI-assisted Quizlet deck authoring belongs to a future reviewed content workflow, not the first implementation slice.
- **Content Foundation:** Preserve immutable assets, rights/provenance, scientific review, release receipts, and curriculum Lab taxonomy. Platform infrastructure work may use fixtures; fixtures do not count as released curriculum.
- **Current open-learning SPEC:** It still labels baseline quiz/cards as shared and says `ready-for-story-breakdown`; after this correction is approved, rederive it from `.memlog.md` before any downstream story work.

### Architecture and data

The architecture should represent at least these relationships without overloading `Assignment`:

```text
Open Curriculum ──> published lesson/video/basic exercise/reference/foundational Lab ──> Subject Progress
Classroom ──> approved Enrollment ──> Class Resource ──> Lesson or AssetVersion
                                             └──────────> Quizlet-style Deck (private class study)
Classroom ──> Assignment ──> AssignmentTarget ──> Quiz / Supplemental Exercise / Custom Lab ──> Evaluated Evidence
                                                                                                  └──> Class learning status
```

Before stories are written, the architecture contract must resolve:

- a stable official course/curriculum version and the exact required denominator;
- stable lesson-to-chapter/topic/outcome relations and version membership;
- hierarchical catalog queries for subject → grade → chapter → topic → lesson, with pagination and indexes sized from measured query plans;
- a verified, ebook-edition-specific lesson locator that stores printed page labels/ranges separately from zero-based PDF page indexes and the reader's one-based displayed page number; record evidence/confidence and define the fallback when no mapping is verified;
- profile and dashboard progress summaries that share the same backend source of truth and distinguish course progress from class assessment;
- query and media performance budgets (catalog first response, lesson detail, video start, PDF first page, and transfer volume), set after a baseline measurement on the supported storage/runtime;
- a class-resource relation that can reference a lesson or immutable `AssetVersion`, while being authorized by active approved enrollment rather than assignment target;
- how existing `TEACHER_PRIVATE` authored lessons are exposed to one class without becoming globally shared;
- how public foundational Lab packs are distinguished from class-private custom scenarios, and whether an optional official Lab counts toward course completion;
- separate identities for reading/video/basic-exercise subject progress, optional foundational-Lab evidence, class Quizlet study progress, and teacher-evaluated assignment evidence; define the class learning-status rollup and migration reconciliation without using any of them as an access gate;
- **database update is required for ebook page navigation:** introduce a versioned ebook/edition identity and a lesson-to-edition page-locator relation. Do not keep this only in frontend state, append page numbers to an unversioned subject URL, or overload `EbookAnnotation.pageNumber` (that field belongs to student annotations);
- the ebook locator data contract must preserve stable lesson/source-map IDs, ebook edition/document identity and fingerprint, printed page label/start/end, zero-based physical PDF page index/start/end when verified, mapping evidence/provenance, and verification status. Printed page and PDF page index are separate fields; page ranges from TOC remain unverified until checked against the exact PDF edition;
- runtime navigation resolves `(lesson, selected ebook edition) → verified locator → PDF.js one-based page number`. Convert a verified zero-based PDF index with the reader's defined offset exactly once. If a locator is absent, unverified, out of range, or belongs to another edition, open the ebook without claiming an exact jump and show a safe fallback;
- signed media authorization for class materials, so knowing an asset/version ID cannot bypass class membership;
- whether teacher-imported files are attachments only or can also be promoted into a reviewed class lesson. They must not be promoted into the global curriculum implicitly.

The suggested model names are concepts, not an approved schema. The architect should choose the smallest normalized model that enforces the boundaries and supports immutable versions.

### UX

- Global student navigation opens subject → grade → chapter/topic → lesson; Bài học presents knowledge/content, video, and lesson-level basic practice, with an optional Lab when the published curriculum has one. Progress appears in the profile and never locks public materials.
- Subject and grade pages show compact chapter groups and lesson counts; chapter pages show ordered lessons and completion state so students can scan the syllabus without opening each lesson. Keep filters secondary to the curriculum hierarchy.
- The dashboard and account profile show a consistent course-progress summary with a drill-down to subject/chapter/lesson; teacher-evaluated work is labeled as class progress and does not silently alter the open-curriculum denominator.
- Ebook links from a lesson open the correct verified page for the configured book edition. If page mapping is missing or unverified, show the book without claiming an exact lesson-page jump.
- Student sees their enrolled Class Spaces separately; each has class context and teacher-posted resources/files. A Quizlet tab/resource is private to that class and available when a teacher deck exists. Class materials are available to approved members even when no assignment exists. Open curriculum remains available outside Class Space, including to students with no class.
- The Assignment area lists explicitly assigned scored/graded work only. Do not represent every class resource as an assignment.
- Teacher class detail gains a resource area to post lessons/files to all approved members; an explicit “assign” action remains separate.
- Empty state for a student with no classes must not hide or restrict public curriculum.

## 5. Recommended path

**Selected approach: Hybrid product-contract correction, then story breakdown.** Do not roll back the current A2/B1 implementation. First align requirements and data/access ownership; then break implementation into vertical stories. This is a significant cross-epic change, not a UI-only adjustment.

1. **Update `docs/product/prd.md` first.** Record the open-curriculum flow, no public Quizlet/scored-quiz gate, private Class Space, separate share/assign actions, progress evidence, teacher evaluation, and the explicit non-goals. This is the product source of truth.
2. Update the Architecture Spine from the approved PRD. Define audience/publication/membership/assignment policy boundaries, course-version identity, progress model, class-resource and file authorization, and migration strategy.
3. Reconcile A1–A5/B1 specs and tickets to the PRD and architecture. Keep teacher-assigned quizzes/private practicals, but remove their use as gates for open curriculum. Update this open-learning SPEC and access companion; its `ready-for-story-breakdown` state must be revoked until contradictions are resolved.
4. Update Student and Teacher UX definitions, route map, navigation, empty states, share-vs-assign affordances, and access matrix.
5. Produce one traceable acceptance/test matrix from PRD → architecture → specs → API/UI/database tests. Only then break work into stories in dependency order: open catalog and curriculum taxonomy; independent progress; class-resource model and protected file delivery; teacher and student Class Space UI; class-only Quizlet as a later feature; assignment integration.
6. Establish query/media performance baselines and page-mapping fixtures before implementation acceptance is finalized. Implement only after the product and architecture contracts agree. Use staged, reversible migrations and one vertical slice at a time. Preserve current demo video seed behavior; do not seed or release textbook corpus as part of this contract correction.

**Effort:** High. **Risk:** High until access and evidence ownership are separated; manageable with API-level authorization matrices, immutable version references, reversible migrations, and separate test personas for un-enrolled student, enrolled class member, removed/pending member, assignment target, and non-target.

## 5.1 Risk register and controls

| ID | Risk | Likelihood / impact | Required control before release |
|---|---|---|---|
| R1 | Class-only lesson, Quizlet, Lab, or file leaks to a student outside the class through list, direct ID, cached response, or signed URL. | Medium / Critical | Central server-side policy checks active approved enrollment and class ownership on every read/write and URL issuance; test member, pending, removed, outsider, and other-class identities. |
| R2 | Open lessons remain inaccessible because catalog, pathway, progress, quiz, or Lab APIs still require an assignment. | High / High | Define separate public-resource and assignment paths; API tests must prove direct access and progress work with no class and no assignment. |
| R3 | Existing assignment progress/attempts are lost, duplicated, or incorrectly reclassified as course progress during migration. | Medium / Critical | Inventory and snapshot legacy evidence; never infer completion from missing evidence; add idempotent preflight/backfill, reconciliation report, rollback, and post-migration count/hash checks. |
| R4 | Course/class completion is wrong because denominator or the effect of basic exercises, available Labs, or teacher-evaluated assignments is ambiguous. | High / High | Freeze versioned denominator and per-evidence rules in PRD before schema work; display open-curriculum progress separately from class evaluation until a combined rule is approved. |
| R5 | Removing public quiz/card steps breaks valid teacher-assigned quiz/card workflows or historical evidence. | Medium / High | Separate shared lesson versions from class/assignment activities; preserve old versions and attempts; regression-test assignment quizzes, answer-key privacy, retries, and teacher reports. |
| R6 | A `published` teacher-custom Lab or lesson is mistaken for an open curriculum resource. | Medium / Critical | Do not equate status with audience; add explicit scope/release policy and taxonomy membership; deny private items in shared catalog and direct-resource routes. |
| R7 | Teacher “share” silently creates an assignment, or assignment targeting is lost when adding class-wide resources. | Medium / High | Separate commands, models, permission checks, and UI actions; verify sharing creates no due date, target snapshot, attempt, or assignment progress. |
| R8 | Taxonomy/course-version changes create missing chapters, duplicate progress, or incorrect coverage across grades. | Medium / High | Use stable chapter/topic/outcome/version IDs; report released-content availability independently from learner completion; test version upgrade and archived content behavior. |
| R9 | Open catalog across more grades causes slow or oversized responses and poor navigation. | Medium / Medium | Paginate/filter by subject, grade, chapter; verify indexes and representative catalog query latency with realistic data volume. |
| R10 | Publication becomes broader while rights/review gates are accidentally weakened. | Low / Critical | Keep Content Foundation release blockers unchanged; test rights/review/quarantine denial and audit receipts before any public release. |
| R11 | Lesson links jump to the wrong ebook page because printed page, PDF zero-based index, and displayed one-based page are conflated or the locator belongs to another edition. | Medium / High | Version the ebook locator; store verified mapping and edition fingerprint; test known mappings and safe fallback for missing/inferred mappings. |
| R12 | UI still feels slow after superficial query changes, or PDF/video stalls due to missing range/cache behavior, oversized assets, or N+1 requests. | Medium / High | Record a repeatable baseline and budgets; inspect query plans and browser network timings; test supported storage range requests and fallback behavior with realistic assets. |
| R13 | Progress appears on one screen but is stale or inconsistent between dashboard, profile, and lesson detail. | Medium / High | Use one backend-derived progress contract, invalidate/reconcile all views after evidence writes, and test parity after reload and cross-device updates. |

## 5.2 Required test plan

Tests below are release gates for this cross-frontend/backend/database change, not optional smoke checks.

### A. Product-rule and unit tests

- Public pathway contains knowledge/content, video, lesson-level basic practice, and a curriculum Lab when mapped; it contains no baseline Quizlet deck or scored-quiz gate.
- Completion state is computed from server evidence, remains idempotent across retry/reload/device, and never grants or revokes access to open materials.
- Reading, video, basic-practice, Lab, Quizlet-study, and teacher-evaluated assignment evidence remain distinct; optionality/requiredness follows the pinned course version.
- Teacher “share to class” and “assign” are distinct actions with distinct outcomes.
- Subject → chapter → lesson ordering and displayed progress use stable taxonomy/version IDs, not title matching or filter labels.
- Profile, dashboard, and lesson detail derive progress from the same authoritative response and reconcile after read/video/practice/Lab evidence changes.

### B. Backend/API authorization integration tests

- Student with no class and no assignment can list, open by ID, and record progress on every released shared item across grades; unpublished, quarantined, rights-blocked, or unreviewed items are denied.
- Active approved member can list/open class resources; pending, removed, archived-class, non-member, and other-class users are denied on collection, detail, mutation, quiz/deck, Lab, and file-download routes.
- Test class teacher/owner, another teacher, student target, non-target, and admin separately; verify denial responses do not leak resource titles or existence.
- Share-only creates no assignment/due date/attempt; assignment-only remains target-scoped and retains current due-date, retry, score, and reporting behavior.
- Shared foundational Labs are open only after release; private/custom Labs do not appear in `/labs` and direct access is rejected without the matching membership/assignment.
- Signed URLs are issued only after policy validation; expired or revoked class membership cannot obtain a new URL. Verify already-issued URL lifetime policy is explicitly documented.
- Quiz answers/answer keys stay server-private; public quiz endpoint has no baseline resource; class/assignment quiz follows its own authorization and scoring contract.
- Query catalog and course-progress endpoints with realistic chapter/lesson counts; assert no N+1 query pattern and capture query plans/index use for the slow paths found in profiling.

### C. Database and migration tests

- Validate constraints, indexes, foreign keys, uniqueness, and deletion/archive behavior for course versions, class resources, enrollment, asset versions, and progress evidence.
- Run migration against a production-like snapshot in dry-run/preflight mode; compare row counts and evidence totals before/after; ensure repeat execution is idempotent.
- Preserve every legacy assignment, quiz attempt, practical attempt, and audit row. Backfill only from explicit evidence; report ambiguous or orphaned rows instead of guessing.
- Verify progress uniqueness under concurrent writes, including the existing nullable `assignmentId` case; ensure class/course progress cannot collide with assignment progress.
- Exercise rollback on a disposable snapshot and confirm old assignment flows remain usable. Do not run migration on production as part of this change without a separately approved release procedure.
- Validate ebook locator fields and edition association, uniqueness/version behavior, and separate printed-page label from PDF index; reject impossible indices and retain unverified mappings without using them for automatic jumps.
- Migration/import must map the existing source-map lesson key to a stable lesson ID and the exact configured ebook edition; dry-run reports unmapped lessons, ambiguous editions, TOC-derived ranges, invalid PDF indexes, and duplicate locators before writes. Preserve source map version and provenance for audit.

### D. Frontend tests and accessibility

- Student without a class can browse subject → grade → chapter/topic → lesson and see progress; no “locked until assigned/passed quiz” messaging remains for open curriculum.
- Teacher can post/import to the class and can separately assign; student member can open resources; non-member direct navigation receives a safe denial/empty state.
- Class Space works for empty, loading, error, archived class, and removed enrollment states. Assignment list still lists only actual assigned work.
- Verify all current supported viewports (390, 768, 1024, 1440 px), keyboard/touch navigation, focus states, empty states, reduced motion, and no horizontal overflow.
- Verify subject → grade → chapter → lesson scanability, chapter ordering/counts, profile/dashboard progress parity, and deep links back to the same course context.
- Measure catalog and progress request timings in the browser; verify video does not eagerly download the full file before playback and starts within the agreed budget.
- On the target storage/browser matrix, verify PDF range requests return partial content (206) when supported, the first visible page renders within the agreed budget, page-turns fetch only needed ranges, and the full-download fallback remains usable when ranges are unavailable.
- From a lesson with a reviewed locator, open the configured ebook edition at the expected physical page; test printed-page/PDF-index offsets, first/last page boundaries, reload/deep-link behavior, and missing/unverified mapping fallback. Reader UI is one-based; any external `#page=` adapter must apply the correct zero-based conversion.
- Verify the backend response returns the locator for the chosen ebook edition, not another edition's mapping; verify switching ebook edition invalidates the old locator and does not reuse cached page state.

### E. End-to-end regression and release evidence

- Run API integration against a real migrated test database and seeded personas; run browser E2E through real authentication for no-class student, class member, non-member, teacher owner, teacher outsider, and assignment target/non-target.
- Regression-test existing A2/A3/A4/B1 assignment completion, quiz retry/scoring, Lab recomputation, teacher evidence views, asset upload/review, and Content Foundation release gates.
- Test curriculum version change, lesson archive/unpublish, class removal, assignment revoke, interrupted upload, retry/idempotency, and refresh/deep-link behavior.
- Record test results by layer (unit, API/DB integration, E2E, migration rehearsal, accessibility/performance). A build or unit pass alone does not satisfy release acceptance.

## 6. Proposed acceptance conditions

1. A student with no class can open all released curriculum content, video, lesson-level basic exercises, references, and foundational Labs across grades; no progress/assignment/quiz state gates them.
2. Public curriculum has no baseline Quizlet deck or scored quiz gate. The public learning flow is content → video → basic lesson exercises → optional Lab when available; completion of one step does not gate access to the next released material.
3. An approved active class member can open teacher-posted lesson/files without an assignment. Pending/removed students and students outside the class cannot read resource metadata or obtain signed file URLs.
4. A class Quizlet-style deck, when present, is discoverable in Class Space and visible only to approved active class members; it is not treated as a scored quiz or assignment unless a teacher separately creates an assignment.
5. A teacher can distinguish “share to class” from “assign to targets”; sharing a resource does not create due dates, submissions, or assignment progress.
6. Teacher-created advanced lessons/materials remain class-scoped and cannot mutate or replace the official shared curriculum.
7. Explicit scored quizzes and custom Lab assignments remain target-scoped, server-authorized, version-pinned, and separate from course progress.
8. Subject progress is based on an identified official course version and tracks reading, video, basic exercises, and applicable optional Lab evidence. Class Quizlet activity is separate; teacher-evaluated assigned work is visible in class status and contributes only under an explicit teacher-evaluation rule. None of these status signals gate open content.
9. Existing assignment evidence remains auditable; subject progress, class Quizlet study evidence, and teacher-evaluated assignment evidence have clear identities and are not double-counted.
10. Asset/file reads enforce the correct public, class-membership, or assignment policy server-side; client hiding is not authorization.
11. Content Foundation rights, editorial/scientific review, safety, and release receipts remain required for global curriculum publication.
12. Open catalog hierarchy is stable and understandable at supported viewports; dashboard and profile show consistent server-derived course progress.
13. Lesson-to-ebook jumps use verified edition-specific locators and correct page-number conversion; unverified locators never send students to a guessed page.
14. Query, video-start, PDF-first-page, and transfer-size budgets are measured against an agreed baseline and pass on representative data/assets; no unprofiled optimization is accepted as proof of performance.
15. Database schema/migration stores versioned ebook editions and lesson page locators with provenance and verification state; the migration dry-run reconciles source-map keys and reports unresolved mappings before any write.

## 7. BMAD change-navigation checklist

| Checklist area | Status | Finding |
|---|---|---|
| Trigger and evidence | Done | Product boundary was clarified after the prior proposal; current route/schema/UX show the assignment and class-resource conflation. |
| Epic impact | Action-needed | A1–A5 and B1 contracts need changes; future AI authoring remains out of scope. Exact story IDs should be assigned only after contract alignment. |
| PRD conflicts | Action-needed | PRD §§4–5 and §10 preserve assignment-first lesson access, public study cards, and quiz-gated practice. Update PRD first as source of truth. |
| Architecture conflicts | Action-needed | Existing `Assignment` is the only class-resource relation; no versioned course denominator or class-resource entity exists. |
| UX conflicts | Action-needed | Current UX locks Labs and lessons, includes study cards and quiz in the ordinary pathway, and class UI lacks shared materials. |
| Technical impacts | Action-needed | Backend catalog/pathway/progress/file authorization, Prisma schema, staged migration, FE routes, class UI, API contracts, and cross-layer test evidence change. |
| Direct adjustment | Viable | Update contracts and introduce new vertical stories; do not roll back existing work. Effort high, risk high until model decisions are frozen. |
| Rollback | Not recommended | The current code remains useful for assignment/private flows; this is a separation and extension, not removal of the work. |
| MVP review | Viable as a scope guard | Build the basic teacher and student Class Space foundation first. Keep AI deck generation and Quizlet authoring/import workflows as later features; keep any class Quizlet private to approved members. |

### Open decision before story breakdown

- **Subject-status rollup:** Specify the course-version denominator and how reading, video, basic exercises, optional open Labs, and teacher-evaluated assigned work affect the visible subject/class status. Keep class assignment evidence separate and attributable, and never make it an access prerequisite.
- **Class Quizlet follow-up:** The first Class Space slice builds teacher posting/import and student access. Define manual deck authoring/import, Quizlet tab behavior, and later AI assistance in a follow-up scope; uploaded files remain files unless explicitly converted through a reviewed deck workflow.

## 8. Decision requested

Review this proposal as a product-contract correction. If approved, the next step is to update `docs/product/prd.md` first as the product source of truth, then Architecture Spine, affected specs/tickets, and UX contracts; reconcile them and approve the test matrix before story breakdown. **No application code, database migration, seed, or implementation sprint plan is included here.**
