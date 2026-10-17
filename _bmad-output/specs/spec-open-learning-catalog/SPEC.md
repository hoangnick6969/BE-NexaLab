---
id: SPEC-open-learning-catalog
status: draft
companions:
  - access-and-lab-discovery.md
  - ../planning-artifacts/architecture-spine-nexalab-release-1/ARCHITECTURE-SPINE.md
  - ../spec-student-core-learning-materials/SPEC.md
  - ../spec-student-quiz-learning-gates/SPEC.md
  - ../spec-b1-teacher-operations/SPEC.md
  - ../spec-content-foundation/SPEC.md
  - ../../../../nexalab-fe/docs/design/08-STUDENT-P0-UX-DEFINITION.md
sources:
  - ../planning-artifacts/sprint-change-proposal-2026-10-16.md
---

> **Product direction confirmed; contract alignment pending.** The PRD is the product source of truth. This spec records open student access, independent course progress, two Lab scopes, and teacher-created Class Space study resources. It is intentionally `draft` until the PRD, Architecture Spine, A2/A3/B1, and UX contracts are reconciled. Do not use it for story breakdown yet.

# Open Learning Catalog and Assignment-Private Work

## Why

Students need to explore published curriculum materials across subjects and grades without first joining a class or receiving an assignment. Teachers still need a private channel for supplemental work assigned to their own students. Separating those paths lets the product track course progress without turning foundational materials into gated assignments.

## Capabilities

- **CAP-1 — Open curriculum catalog**
  - **intent:** A student can discover and open released shared lesson content, video, lesson-level basic exercises, approved ebook/reference links, and foundational Labs where present across subjects and grades without enrollment, assignment, prior completion, or quiz prerequisites.
  - **success:** `/lessons` presents available subjects → grades with released content in ascending order → ordered chapter/topic table of contents → ordered lessons → lesson detail. An unaffiliated student can open released resources. Unreleased/empty curriculum coverage is shown separately, and draft, quarantined, rights-blocked, or class-private items are excluded.
- **CAP-2 — Course progress and subject achievement in profile**
  - **intent:** A student can see foundational progress against the fixed official course version by subject and grade, with drill-down to chapter, topic, lesson, and study activity, plus separate assigned-work status.
  - **success:** Foundational progress covers lesson content, video, basic exercises, and foundational Labs required by the fixed version. Assignment evidence is outside its denominator and separately reportable. The subject summary may show “Đạt mức cơ bản” when foundational requirements are complete, but remains “Chưa đạt” while any assignment target for the student linked to that subject remains actionable and is unsubmitted, in progress, or not yet accepted by that item's evaluator. Preserve closed/archived history; stop holding the current rollup unmet when the item is no longer actionable to the student. Show both signals and their sources. Neither status changes access to shared content.
- **CAP-3 — Class Space study resources and assigned work**
  - **intent:** A teacher can create class-private study-card decks and unscored study quizzes, plus scored tests that enter assignment workflow only when explicitly assigned.
  - **success:** Only active, approved members can access class resources. Teachers may author content directly, enter or import source data, or request AI-generated advanced extensions grounded in the linked lesson; AI output remains a teacher-reviewed draft until published. Decks and study quizzes are unscored practice, never part of Open Curriculum. Scored tests require explicit assignment and follow assignment-target, immutable-version, retry, answer-key privacy, and audit rules.
- **CAP-4 — Subject Lab catalog and contextual discovery**
  - **intent:** A student can find all shared Labs for a subject and see Labs related to the chapter or topic currently being studied.
  - **success:** The Lab tab supports subject-wide search/filter by curriculum context. Selecting a chapter/topic or opening a lesson automatically surfaces matching Labs and a direct link to each; both views use the same stable taxonomy relations.
- **CAP-5 — Distinct foundational and Class Space Labs**
  - **intent:** A student can explore released foundational Labs tied to official curriculum taxonomy. A teacher can create a custom Lab in Class Space tied to a class lesson and its subject/grade/chapter/topic context.
  - **success:** Foundational Labs are open to every student when released and appear in the global Lab catalog. Custom Labs remain within their class, link to stable curriculum IDs and the related class lesson, and never enter the global catalog or official course denominator. Class sharing is membership-scoped; scored submission is assignment-target-scoped only when explicitly assigned. No Lab has a default quiz prerequisite.
## Constraints

- Published shared content access is independent of class, enrollment, grade, assignment, reading/video completion, quiz result, and other course progress.
- Assignment eligibility continues to require the relevant teacher-owned class and eligible target membership. Assignment status, due date, and class archive/removal rules do not change shared catalog access.
- No study deck, study quiz, or scored test is part of Open Curriculum or the ordinary lesson flow. Teachers create decks and unscored study quizzes in Class Space; tests are scored only when explicitly assigned. Test completion never gates shared resources or any Lab by default.
- Keep audience scope, publication lifecycle, creator/owner, source rights, and review state distinct. `PUBLISHED` does not by itself mean shared, rights-cleared, scientifically reviewed, or safe to release.
- Every shared lesson/Lab discovery relationship uses stable subject, grade, chapter, topic, and outcome identifiers; free-text matching is not the source of truth for navigation or coverage.
- The official course denominator is fixed to an identified curriculum/course version. Supplemental teacher assignments do not change that denominator; an official curriculum revision is a separately identified version.
- Foundational course progress reuses server-side lesson-content, video, basic-exercise, and foundational-Lab evidence when required by the fixed official course version; do not create a parallel completion-threshold system. Assigned exercise/test/Lab evidence is outside its denominator, but any target assignment linked to the subject keeps the summary “Chưa đạt” until accepted by its evaluator while it remains actionable to the student, including while unsubmitted or in progress. Preserve closed/archived history; stop holding the current rollup unmet when no longer actionable to the student. Show foundational progress and assignment status as distinct traceable signals. Class decks/study quizzes are unscored practice; assignments and custom Labs remain separately attributable.
- Only released foundational Labs that belong to the official curriculum participate in the shared Lab taxonomy, catalog, contextual discovery, or course denominator. Teacher-created custom Labs belong to a specific Class Space and class lesson and are excluded from the global catalog and official course progress.
- A course cannot show complete while required official-course items are unreleased or unfinished. Report official-content availability separately from student progress.
- Student-facing “Bài đọc” is renamed to the step label “Nội dung bài”; the section heading may say “Kiến thức”. Preserve the existing internal step identifier unless a separate migration is justified.
- Preserve current video URLs and seed behavior during this change. The system must continue to support lesson-level video mapping for later URL seeding; the current shared demo clip is not proof of lesson-specific content accuracy.
- Backend authorization and progress reconciliation remain authoritative. UI filtering, hidden controls, or client progress cannot grant access or official completion.
- Source rights, editorial/scientific review, accessibility, model safety, and applicable Content Foundation release gates remain required. Synthetic fixtures and staging/OCR rows do not count as released curriculum.

## Non-goals

- Replacing or reseeding current video URLs in this change.
- Making teacher-private assignments available across classes or to non-target students.
- Requiring a quiz or completed lesson before a student can browse shared resources or foundational Labs.
- Completing the full Content Foundation importer, baseline corpus production, or production content seed; those remain governed by the Content Foundation spec and release gates.
- Forcing every chapter/topic to have a Lab, video, quiz, or 3D simulation.
- Providing shared-curriculum Quizlet/cards or a public scored-quiz step.

## Success signal

A student without class enrollment can choose a subject and grade, navigate the ordered table of contents, open released lessons, and access a foundational Lab. Matching Labs appear in the lesson's curriculum context. A class member can find a teacher-created deck, unscored study quiz, and custom Lab attached to the relevant Class Space lesson; an outsider cannot. The profile shows foundational progress and assigned-work status separately, with the subject achievement summary at “chưa đạt” while applicable assigned work is not achieved. No quiz/test state blocks shared content or Labs.

## Assumptions

- Course status is a student-facing projection over shared subject/grade curriculum progress, not an enrollment or access entitlement.
- A foundational simulation pack may be linked to its applicable curriculum topic/outcome and reused by more than one lesson when the curriculum mapping supports it.
- The catalog progress denominator comes from the full fixed official curriculum version; teacher-added supplementary work is excluded.
- Current video URL and seed data are retained as-is until the user seeds lesson-specific URLs.

## Progress and Lab contract decisions

- **Progress evidence:** Foundational course progress uses lesson-content, video, basic-exercise, and foundational-Lab evidence when required by the official course version and server rules. Assigned exercise/test/Lab evidence is separate and never changes its denominator; any target assignment linked to the subject keeps the summary “Chưa đạt” until accepted by its existing evaluator while actionable to the student, including while unsubmitted or in progress. Preserve closed/archived history and stop holding the current rollup unmet only when no longer actionable. Show both source signals. Class decks/study quizzes are unscored practice.
- **Curriculum Lab taxonomy:** Each shared foundational Lab pack has one canonical official topic, links to applicable learning outcomes, derives its chapter from that topic, and may include reviewed related-topic links for contextual discovery. Do not duplicate a pack to place it in multiple topics.
- **Teacher-custom Labs:** A custom Lab belongs to a Class Space and must link to a class lesson plus its subject, grade, chapter, and topic through stable IDs. It can be shared with active, approved class members as a resource. If explicitly assigned/scored, submission is restricted to eligible targets. It remains excluded from the global Lab catalog and official course progress.
