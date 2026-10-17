---
id: SPEC-open-learning-catalog
status: ready-for-story-breakdown
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

> **Canonical change contract.** This spec defines open student access, independent course progress, Lab discovery, and assignment-private teacher activities. Where the adopted A2/A3/B1 specs require an assignment to access a lesson or apply quiz gates to a Lab, this spec narrows those rules: they apply only to teacher-private assigned work. Shared resources and foundational curriculum Labs remain open. The adopted specs remain authoritative for their other behavior.

# Open Learning Catalog and Assignment-Private Work

## Why

Students need to explore published curriculum materials across subjects and grades without first joining a class or receiving an assignment. Teachers still need a private channel for supplemental work assigned to their own students. Separating those paths lets the product track course progress without turning foundational materials into gated assignments.

## Capabilities

- **CAP-1 — Open curriculum catalog**
  - **intent:** A student can discover and open every published shared lesson/knowledge content, video, ebook reference, baseline quiz/cards, and foundational simulation across grades without enrollment, assignment, prior completion, or quiz prerequisites.
  - **success:** An authenticated student with no class enrollment can browse and open released shared resources across grades. Draft, archived-not-started, quarantined, rights-blocked, and teacher-private items are not returned as open catalog resources.
- **CAP-2 — Course progress in profile**
  - **intent:** A student can see progress against the fixed official course version by subject and grade, with drill-down to chapter, topic, lesson, and study activity.
  - **success:** Progress is stored per student and official course/content version independently of assignment; reload returns reconciled state. Teacher-created supplemental assignments do not change the course denominator. Status changes never grant or revoke access to shared content, and assignment evidence remains separately reportable.
- **CAP-3 — Teacher-private assigned activities**
  - **intent:** A teacher can assign teacher-created quiz/card variants, exercises, and customized simulation scenarios to eligible students in an owned class.
  - **success:** Baseline quiz/cards from the official course are shared. Only active assignment targets can read or submit teacher-created private variants through list and direct-ID routes; another student cannot access them. Class ownership, target snapshot, activity version, and attempts remain auditable.
- **CAP-4 — Subject Lab catalog and contextual discovery**
  - **intent:** A student can find all shared Labs for a subject and see Labs related to the chapter or topic currently being studied.
  - **success:** The Lab tab supports subject-wide search/filter by curriculum context. Selecting a chapter/topic or opening a lesson automatically surfaces matching Labs and a direct link to each; both views use the same stable taxonomy relations.
- **CAP-5 — Distinct shared simulation and teacher scenario**
  - **intent:** A student can explore a reviewed foundational simulation, while teachers can create private assignment scenarios using an approved shared simulation model.
  - **success:** The base pack is available to every student when published; teacher-defined prompt, parameters, challenge, or scored scenario is visible only to assignment targets and remains pinned to the model/content version used.
## Constraints

- Published shared content access is independent of class, enrollment, grade, assignment, reading/video completion, quiz result, and other course progress.
- Assignment eligibility continues to require the relevant teacher-owned class and eligible target membership. Assignment status, due date, and class archive/removal rules do not change shared catalog access.
- Baseline quiz/cards included in the official course version are `SHARED`; teacher-created quiz/card variants, exercises, and customized simulation scenarios are `TEACHER_PRIVATE` and do not appear in the shared catalog.
- Keep audience scope, publication lifecycle, creator/owner, source rights, and review state distinct. `PUBLISHED` does not by itself mean shared, rights-cleared, scientifically reviewed, or safe to release.
- Every shared lesson/Lab discovery relationship uses stable subject, grade, chapter, topic, and outcome identifiers; free-text matching is not the source of truth for navigation or coverage.
- The official course denominator is fixed to an identified curriculum/course version. Supplemental teacher assignments do not change that denominator; an official curriculum revision is a separately identified version.
- Course progress reuses the existing server-side A2 pathway completion rules for applicable official-course activities; do not create a parallel set of completion thresholds. Reading requires the existing explicit completion action, video uses the existing high-water/completion rule (90% or ended), and cards are complete only after all cards are visited. A baseline quiz result is tracked separately and counts toward course completion only if the official course version explicitly marks that assessment required. None of these signals gates access to shared resources.
- Only released foundational Labs that belong to the official curriculum participate in the shared Lab taxonomy, catalog, contextual discovery, or course denominator. Teacher-custom Labs/scenarios remain assignment-private and are excluded from all four.
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

## Success signal

A student without class enrollment can browse a different grade's released lessons and open a foundational Lab. While browsing a chapter, matching Labs appear and open directly. The profile shows course progress separately from teacher assignments, and none of the progress or quiz states blocks shared content. A non-target student who guesses a teacher-assignment URL is denied while the assigned student can complete it.

## Assumptions

- Course status is a student-facing projection over shared subject/grade curriculum progress, not an enrollment or access entitlement.
- A foundational simulation pack may be linked to its applicable curriculum topic/outcome and reused by more than one lesson when the curriculum mapping supports it.
- The catalog progress denominator comes from the full fixed official curriculum version; teacher-added supplementary work is excluded.
- Current video URL and seed data are retained as-is until the user seeds lesson-specific URLs.

## Progress and Lab contract decisions

- **Progress evidence:** Reuse existing A2 pathway completion rules for official-course activities. Preserve explicit reading completion, the current video high-water/90%-or-ended rule, and all-cards-visited completion. Baseline quiz outcomes are tracked separately and affect course completion only when the official course version marks that assessment required. These are progress signals, never access gates.
- **Curriculum Lab taxonomy:** Each shared foundational Lab pack has one canonical official topic, links to applicable learning outcomes, derives its chapter from that topic, and may include reviewed related-topic links for contextual discovery. Do not duplicate a pack to place it in multiple topics.
- **Teacher-custom Labs:** Excluded from the curriculum Lab catalog, taxonomy synchronization, and official course progress. They remain private assignment work for eligible targets.
