---
id: SPEC-open-learning-catalog
status: draft
companions:
  - access-and-lab-discovery.md
  - class-space-assignment-contract.md
  - ../planning-artifacts/architecture-spine-nexalab-release-1/ARCHITECTURE-SPINE.md
  - ../spec-student-core-learning-materials/SPEC.md
  - ../spec-student-quiz-learning-gates/SPEC.md
  - ../spec-b1-teacher-operations/SPEC.md
  - ../spec-content-foundation/SPEC.md
  - ../../../../nexalab-fe/docs/design/08-STUDENT-P0-UX-DEFINITION.md
sources:
  - ../../../docs/product/prd.md
  - ../planning-artifacts/sprint-change-proposal-2026-10-16.md
---

> **Product direction confirmed; contract alignment pending.** The PRD is the product source of truth. This spec records open student access, independent course progress, two Lab scopes, teacher-created Class Space resources, assignment deadlines, and the Student/Teacher/Parent views affected by assignment status. It remains `draft` until the PRD, Architecture Spine, A2/A3/B1, and affected role UX are reconciled. Do not use it for story breakdown yet.

# Open Learning Catalog and Assignment-Private Work

## Why

Students need to explore published curriculum materials across subjects and grades without first joining a class or receiving an assignment. Teachers still need a private channel for supplemental work assigned to their own students. Separating those paths lets the product track course progress without turning foundational materials into gated assignments.

## Capabilities

- **CAP-1 — Open curriculum catalog**
  - **intent:** A student can discover and open released shared lesson content, video, lesson-level basic exercises, approved ebook/reference links, and foundational Labs where present across subjects and grades without enrollment, assignment, prior completion, or quiz prerequisites.
  - **success:** `/lessons` presents available subjects → grades with released content in ascending order → ordered chapter/topic table of contents → ordered lessons → lesson detail. An unaffiliated student can open released resources. Unreleased/empty curriculum coverage is shown separately, and draft, quarantined, rights-blocked, or class-private items are excluded.
- **CAP-2 — Course progress and subject achievement in profile**
  - **intent:** A student can see foundational progress against the fixed official course version by subject and grade, with drill-down to chapter, topic, lesson, and study activity, plus separate assigned-work status.
  - **success:** Foundational progress covers lesson content, video, basic exercises, and foundational Labs required by the fixed version. Assignment evidence is outside its denominator and separately reportable. The subject summary may show “Đạt mức cơ bản” when foundational requirements are complete, but remains “Chưa đạt” while any assignment target for the student linked to that subject remains actionable and is unsubmitted, in progress, awaiting a late-test decision, or not yet accepted by that item's evaluator. A rejected late test receives zero and remains unachieved. Preserve closed/archived history; stop holding the current rollup unmet when the item is no longer actionable to the student. Show both signals and their sources. Neither status changes access to shared content.
- **CAP-3 — Class Space study resources and assigned work**
  - **intent:** A teacher can create class-private study-card decks and unscored study quizzes, plus scored tests that enter assignment workflow only when explicitly assigned.
  - **success:** Only active, approved members can access class resources. Teachers directly create decks, unscored study quizzes, and tests; custom Lab authoring uses a separate future builder. Structured-file import is limited to decks, study quizzes, and test content; it does not create Labs. Imported content remains a teacher-reviewed draft until published. AI generation is deferred to a later sprint. Decks and study quizzes are unscored practice, never part of Open Curriculum. Scored tests require explicit assignment and follow due-date, late-reason, teacher-decision, same-assignment due-date revision for its assigned class/recipient set, immutable-history, answer-key privacy, and audit rules in `class-space-assignment-contract.md`.
- **CAP-4 — Subject Lab catalog and contextual discovery**
  - **intent:** A student can find all shared Labs for a subject and see Labs related to the chapter or topic currently being studied.
  - **success:** The Lab tab supports subject-wide search/filter by curriculum context. Selecting a chapter/topic or opening a lesson automatically surfaces matching Labs and a direct link to each; both views use the same stable taxonomy relations.
- **CAP-5 — Distinct foundational and Class Space Labs**
  - **intent:** A student can explore released foundational Labs tied to official curriculum taxonomy. A teacher can create a custom Lab in Class Space tied to a class lesson and its subject/grade/chapter/topic context.
  - **success:** Foundational Labs are open to every student when released and appear in the global Lab catalog. Custom Labs remain within their class, link to stable curriculum IDs and the related class lesson, and never enter the global catalog or official course denominator. Only active, approved members of the owning class can discover or run them; nonmembers are denied on direct lookup and run routes. Scored submission is assignment-target-scoped only when explicitly assigned. No Lab has a default quiz prerequisite.
- **CAP-6 — Consistent assignment status across roles**
  - **intent:** Students, teachers, and explicitly linked parents see consistent assignment deadlines and status while each role retains its own permissions.
  - **success:** Students receive a due-soon reminder and can see overdue/unsubmitted or late-review-pending states; teachers see upcoming/overdue targets and late reasons awaiting a decision; an explicitly linked/approved parent sees an in-app notice when a linked child has not submitted after expiry. Parent views are read-only and never expose answer keys or teacher-only decisions. Expiry alone does not create a zero score. A reset revises the due date on the same assignment for its assigned recipient set and updates all three role views.
## Constraints

- Published shared content access is independent of class, enrollment, grade, assignment, reading/video completion, quiz result, and other course progress.
- Assignment eligibility continues to require the relevant teacher-owned class and eligible target membership. Assignment status, due date, and class archive/removal rules do not change shared catalog access.
- No study deck, study quiz, or scored test is part of Open Curriculum or the ordinary lesson flow. Teachers create decks and unscored study quizzes in Class Space; tests are scored only when explicitly assigned. Test completion never gates shared resources or any Lab by default.
- Keep audience scope, publication lifecycle, creator/owner, source rights, and review state distinct. `PUBLISHED` does not by itself mean shared, rights-cleared, scientifically reviewed, or safe to release.
- Every shared lesson/Lab discovery relationship uses stable subject, grade, chapter, topic, and outcome identifiers; free-text matching is not the source of truth for navigation or coverage.
- The official course denominator is fixed to an identified curriculum/course version. Supplemental teacher assignments do not change that denominator; an official curriculum revision is a separately identified version.
- Foundational course progress reuses server-side lesson-content, video, basic-exercise, and foundational-Lab evidence when required by the fixed official course version; do not create a parallel completion-threshold system. Assigned exercise/test/Lab evidence is outside its denominator, but any target assignment linked to the subject keeps the summary “Chưa đạt” until accepted by its evaluator while it remains actionable to the student, including while unsubmitted, in progress, or awaiting a late-test decision. A rejected late test records zero and remains unachieved. Preserve closed/archived history; stop holding the current rollup unmet when no longer actionable to the student. Show foundational progress and assignment status as distinct traceable signals. Class decks/study quizzes are unscored practice; assigned-test late review/reset and custom-Lab authorization follow `class-space-assignment-contract.md`; all assignments and custom Labs remain separately attributable.
- Only released foundational Labs that belong to the official curriculum participate in the shared Lab taxonomy, catalog, contextual discovery, or course denominator. Teacher-created custom Labs belong to a specific Class Space and class lesson and are excluded from the global catalog and official course progress.
- A course cannot show complete while required official-course items are unreleased or unfinished. Report official-content availability separately from student progress.
- Student-facing “Bài đọc” is renamed to the step label “Nội dung bài”; the section heading may say “Kiến thức”. Preserve the existing internal step identifier unless a separate migration is justified.
- Preserve current video URLs and seed behavior during this change. The system must continue to support lesson-level video mapping for later URL seeding; the current shared demo clip is not proof of lesson-specific content accuracy.
- Backend authorization and progress reconciliation remain authoritative. UI filtering, hidden controls, or client progress cannot grant access or official completion.
- Due dates, overdue states, teacher decisions, parent-link eligibility, and notification records are server-derived. UI surfaces for the current assignment lifecycle cover the affected Student, Teacher, and Parent screens only; this does not expand scope to the full Teacher or Parent product UX.
- Generic file import is limited to study decks, unscored study quizzes, and test content. A complete teacher-authored 3D Lab needs a separate guided authoring contract for model selection/configuration, assets, parameters, validation, and publication; do not treat it as a spreadsheet-import resource.
- Source rights, editorial/scientific review, accessibility, model safety, and applicable Content Foundation release gates remain required. Synthetic fixtures and staging/OCR rows do not count as released curriculum.

## Non-goals

- Replacing or reseeding current video URLs in this change.
- Making teacher-private assignments available across classes or to non-target students.
- Requiring a quiz or completed lesson before a student can browse shared resources or foundational Labs.
- Completing the full Content Foundation importer, baseline corpus production, or production content seed; those remain governed by the Content Foundation spec and release gates.
- Forcing every chapter/topic to have a Lab, video, quiz, or 3D simulation.
- Providing shared-curriculum Quizlet/cards or a public scored-quiz step.
- AI-generated Class Space content in the current delivery; AI authoring is deferred to the following sprint.

## Success signal

A student without class enrollment can choose a subject and grade, navigate the ordered table of contents, open released lessons, and access a foundational Lab. Matching Labs appear in the lesson's curriculum context. A class member can find a teacher-created deck, unscored study quiz, and custom Lab attached to the relevant Class Space lesson; a nonmember cannot discover or run that Lab, including by direct URL/ID. A late assigned-test outcome requires a reason and teacher decision: rejection records zero for that submission, while approval revises the deadline on the same assignment for all of its assigned recipients. Expiry without submission remains unscored. Student, Teacher, and linked/approved Parent views show consistent assignment status with role-appropriate reminders/queues/notices. The profile shows foundational progress and assigned-work status separately, with the subject achievement summary at “chưa đạt” while applicable assigned work is not achieved. No quiz/test state blocks shared content or Labs.

## Assumptions

- Course status is a student-facing projection over shared subject/grade curriculum progress, not an enrollment or access entitlement.
- A foundational simulation pack may be linked to its applicable curriculum topic/outcome and reused by more than one lesson when the curriculum mapping supports it.
- The catalog progress denominator comes from the full fixed official curriculum version; teacher-added supplementary work is excluded.
- Current video URL and seed data are retained as-is until the user seeds lesson-specific URLs.

## Progress and Lab contract decisions

- **Progress evidence:** Foundational course progress uses lesson-content, video, basic-exercise, and foundational-Lab evidence when required by the official course version and server rules. Assigned exercise/test/Lab evidence is separate and never changes its denominator; any target assignment linked to the subject keeps the summary “Chưa đạt” until accepted by its existing evaluator while actionable to the student, including while unsubmitted or in progress. Preserve closed/archived history and stop holding the current rollup unmet only when no longer actionable. Show both source signals. Class decks/study quizzes are unscored practice.
- **Curriculum Lab taxonomy:** Each shared foundational Lab pack has one canonical official topic, links to applicable learning outcomes, derives its chapter from that topic, and may include reviewed related-topic links for contextual discovery. Do not duplicate a pack to place it in multiple topics.
- **Two Lab builder tracks:** Foundational curriculum Labs are released, shared assets aligned with official subject/grade/chapter/topic/lesson context; the first research target is Grade 8 Natural Science. Teacher-custom Labs belong to one Class Space and link to a class lesson and its subject, grade, chapter, and topic through stable IDs. Both require purpose-built builders. Full builder design and implementation are deferred from this sprint; preserve their data, ownership, membership, taxonomy, versioning, and runtime integration contracts. Only active, approved members of the owning class may discover and run a custom Lab. A nonmember is denied on list, direct lookup, launch, and result-write routes. If explicitly assigned/scored, only eligible targets may submit scored work. Custom Labs stay excluded from the global Lab catalog and official course progress.
- **Class Space authoring and tests:** In this sprint, teachers create decks, unscored study quizzes, and tests directly. File import is for decks, study quizzes, and test content only; AI generation and both Lab builders are deferred. Assigned tests have a due date. Late submissions include a student reason and await the owning teacher's decision. Approval revises the due date of the same assignment for its assigned recipient set, and every recipient may submit again, including recipients who already submitted; preserve all attempts in history. The latest submitted file/attempt determines the current result; a late submission awaiting review remains pending, and rejection records zero for that assignment. Expiry without submission never auto-scores zero. Keep Student, Teacher, and Parent status/notice surfaces consistent and preserve attempts, deadline revisions, and decisions as immutable, auditable records. See `class-space-assignment-contract.md` for state and persistence rules.
