---
title: 'I1 — Browse Open Curriculum and Track Foundational Progress'
type: 'feature'
created: '2026-10-18'
status: 'in-progress'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/planning-artifacts/increment-i1-epic-01-open-curriculum.md'
  - '{project-root}/docs/product/prd.md'
  - '{project-root}/_bmad-output/planning-artifacts/architecture-spine-nexalab-release-1/ARCHITECTURE-SPINE.md'
  - '{project-root}/../nexalab-fe/docs/design/08-STUDENT-P0-UX-DEFINITION.md'
---

<frozen-after-approval reason="human-owned I1 scope and acceptance criteria">

## Intent

**Problem:** Student lessons and progress are currently assignment-scoped, so a student without an assignment cannot use the released-curriculum journey or review foundational progress by subject and grade.

**Approach:** Implement the complete I1 scope as a coordinated backend/frontend/database slice: curriculum hierarchy, released lesson materials, verified ebook navigation, foundational Lab discovery, and a versioned foundational-progress read model. The user explicitly requested all five I1 stories; do not extend into I2/I3.

**Human decisions:** Implement contracts and logic without importing curriculum data; positive real-content acceptance waits for reviewed release data. A basic exercise is passed only when its score meets the configured threshold (~80% was an example, not a universal hard-coded value); submitted-but-not-passed evidence remains distinct.

**Boundaries & Constraints**

**Always:** Serve only released shared content to authenticated students regardless of class or assignment. Keep class resources, scored assignment work, and Open Curriculum separate. Use stable curriculum identities and official ordering. Backend authorization and evidence remain authoritative. Keep reading/video evidence, basic-exercise evidence, foundational-Lab evidence, and assignment evidence traceable and distinct. A verified ebook locator is edition-specific and keeps printed labels separate from physical PDF indexes.

**Never:** Expose draft, quarantined, rights-blocked, unreviewed, synthetic, or class-private content as released. Reuse assignment authorization as the public-catalog policy. Put study cards or scored quizzes in the public pathway. Guess taxonomy mappings, course denominator, exercise-completion rules, or ebook pages. Add Lab authoring or I2/I3 assignment lifecycle work.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Browse released hierarchy | Authenticated student, no class or assignment | Subjects, grades, chapters/topics, and lessons are ordered from released curriculum only | Empty state identifies a publication/coverage gap, not learner progress |
| Direct request for unavailable lesson | Draft, quarantined, rights-blocked, class-private, or unknown ID | No content or identifying metadata is disclosed | Safe not-found response |
| Open lesson resource | Released lesson with reading, video, exercise, or materials | Available resources are usable without assignment or quiz prerequisites; persisted state is server-confirmed | Recoverable unavailable/write state; unsaved evidence is not shown as complete |
| Open ebook | Configured HTTPS edition with verified, missing, or unverified lesson locator | Verified locator opens its edition-specific physical PDF page; otherwise use the approved safe edition fallback | No guessed page; keep external-resource labeling |
| Discover Lab | Released foundational Lab, class-private Lab, or no match | Only released foundational Labs appear in the public catalog and matching lesson context | Missing Lab stays optional; private Lab metadata is not exposed |
| Review progress | Student-owned evidence and fixed official-course version | Show foundational evidence and denominator separately from assignment status, with source timestamps | Unknown/missing version or evidence cannot be presented as complete |

</frozen-after-approval>

## Resolved Decisions

- Implement contracts and logic now without importing curriculum content; positive real-content acceptance waits for reviewed release data and the fixed course manifest.
- Basic exercise is passed at/above its configured score threshold. ~80% is an example, not a universal hard-coded default. Submitted-but-not-passed evidence is distinct; assignment quiz evidence is not reused.

The two option prompts retained below are historical; the user's decisions above supersede them.

- **Curriculum/version readiness:** Should I1 code proceed before Content Foundation T5 releases an authoritative Grade 8–9 outcome inventory and reviewed curriculum pack? Choose (A) provide/approve the official curriculum source/version and required-course manifest, then implement against that release; or (B) authorize contract-only implementation now against stable opaque taxonomy/course-version IDs, with no corpus import and with positive real-content acceptance deferred until T5. Current KHTN8 taxonomy is `draft-for-outcome-mapping`, T5 is backlog, and only synthetic fixtures are available.
- **Basic-exercise evidence:** What makes a basic exercise complete for foundational progress? Choose (A) a submitted attempt is completion and any correctness feedback is formative; (B) completion requires a correct answer or an explicitly supplied pass rule; or (C) defer exercise progress until its contract is decided. The current API has no basic-exercise step, and existing scored quizzes cannot be silently reinterpreted.

## Code Map

- `prisma/schema.prisma` — existing `Subject`, `Lesson`, `CurriculumChapter/Topic/Outcome`, `LessonStep`, `StepProgress`, `Lab`, `EbookAnnotation`, `ContentPackVersion`, and `ContentRelease`; missing stable lesson taxonomy relations, basic-exercise identity, ebook edition/locator, Lab taxonomy/release identity, and fixed course denominator.
- `src/routes.ts` — `GET /subjects` and `GET /lessons` currently expose assignment-oriented shapes; pathway and progress mutations require assignment applicability. Reuse auth/Zod/error patterns, but add public released-catalog/detail/evidence contracts without changing assignment behavior.
- `src/pathway.ts`, `src/progress.ts`, `src/progress-projection.ts` — reuse server-side reading/video reconciliation and evidence serialization; preserve assignment-scoped A2/A5 behavior.
- `src/content-pack.ts`, `src/content-release.ts` — reuse release validation/materialization and immutable release provenance; synthetic fixtures are not a release corpus.
- `../nexalab-fe/src/pages.tsx` — existing `/lessons` list and assigned detail flows; reuse loading/error patterns, replace guessed text grouping with server taxonomy hierarchy.
- `../nexalab-fe/src/App.tsx`, `../nexalab-fe/src/api.ts` — authenticated routes and API/type patterns for catalog, detail, locator, Lab, and course-progress responses.
- `../nexalab-fe/src/ebook.tsx` — reuse PDF.js range loading, annotations, and responsive reader; current route starts at displayed page 1 and has no edition locator.
- `../nexalab-fe/src/VideoLearningStep.tsx`, `../nexalab-fe/src/progress.tsx`, `../nexalab-fe/src/styles.css` — reuse non-autoplay video evidence, progress evidence UI, and responsive/accessibility styles; keep assignment summaries separate.
- `../nexalab-fe/tests/reading-completion.spec.ts`, `video-completion.spec.ts`, `progress-live.spec.ts` — existing assigned-flow coverage; no open-catalog, ebook-locator, foundational-Lab catalog, or course-progress tests were found.

## Tasks & Acceptance

**Execution:**
- [ ] Backend schema/migration and Zod/OpenAPI routes — add stable released-curriculum hierarchy/detail, assignment-free basic evidence, edition-specific locator, foundational Lab taxonomy/discovery, and fixed-course progress contracts while preserving current assignment behavior.
- [ ] Frontend API/types/routes/pages — implement the hierarchy, released lesson resources, safe ebook fallback/jump, optional Lab context, and separate foundational-progress view using the approved UX.
- [ ] Backend and frontend focused automated coverage — verify release filtering/direct-ID non-disclosure, ordering, evidence ownership/idempotency, locator conversion/fallback, Lab scope, progress denominator, and responsive keyboard/touch states.
- [ ] Run relevant lint/build/unit checks in both repositories and configured API/database/browser verification where dependencies are available; report each evidence tier separately.

**Acceptance Criteria:**

**Story 1.1 — Browse the Curriculum Hierarchy**
- Given an authenticated student with no Class Space membership, when they open `/lessons`, then they see only subjects with released curriculum content.
- Given the student selects a subject, when grade options load, then only grades with released content appear in ascending numeric order.
- Given the student selects a grade, when the table of contents loads, then chapters/topics and lessons follow canonical curriculum ordering and stable IDs, with lesson counts and return breadcrumbs.
- Given content is draft, quarantined, rights-blocked, or class-private, when the student browses or requests it by direct URL/ID, then the content and identifying metadata are not disclosed.
- Given a subject/grade has no released content, when the empty state appears, then it distinguishes a publication/coverage gap from learner progress and never implies that an assignment is required.
- The hierarchy supports keyboard/touch and the specified 390/768/1024/1440 px viewports without horizontal overflow.

**Story 1.2 — Open Lesson Content, Video, and Basic Exercises**
- Given a released lesson, when the student opens it, then the page shows its objective, approved reading content, and available content/video/basic-exercise tabs or sections.
- Given an approved video is available, when the student opens the video section, then playback does not autoplay and progress is server-persisted according to the approved completion rule.
- Given a basic exercise is present, when the student opens it, then it is available without a quiz gate or assignment prerequisite.
- Given content or media is unavailable or a progress write fails, when the failure is displayed, then the page offers a recoverable state, preserves recoverable input, and does not show unconfirmed progress as saved.
- Public lesson detail contains no Class Space deck, Quizlet, or scored-quiz step.

**Story 1.3 — Open the Configured Ebook at a Verified Lesson Locator**
- Given a subject has a configured HTTPS ebook/reference, when the student opens lesson materials, then the link is labeled as an external resource and does not imply NexaLab hosts or owns the source.
- Given the selected lesson has a verified locator for that exact ebook edition, when the student follows the lesson link, then the reader opens the mapped physical PDF page using the documented page-index conversion.
- Given the locator is missing, unverified, or belongs to another edition, when the student opens the ebook, then the reader uses a safe edition start/fallback and never jumps to a guessed page.
- Printed-page labels and physical PDF indexes remain distinct, with locator provenance/version retained by the server.

**Story 1.4 — Discover Released Foundational Labs in Curriculum Context**
- Given a released foundational Lab is mapped to an official topic/outcome, when the student browses the subject Lab catalog or its lesson context, then the Lab appears in the matching subject/topic context using the same stable taxonomy identity.
- Given the Lab is unpublished, quarantined, class-private, or not release-cleared, when the student browses or opens it directly, then it is not exposed as a public Lab.
- Given no released Lab matches a lesson, when the lesson is shown, then the Lab remains optional and its absence does not block content, video, exercise, or progress.
- This story does not implement either curriculum or teacher-custom Lab builder.

**Story 1.5 — Review Foundational Progress by Subject and Grade**
- Given a student opens profile/progress, when foundational progress loads, then it uses the fixed official-course version and shows lesson content, video, basic-exercise, and required foundational-Lab evidence separately.
- Given Class Space decks, study quizzes, custom Labs, or scored assignment evidence exist, when foundational progress is calculated, then those records do not change the official-course denominator.
- Given a progress item is shown as complete/partial/not started, when the student drills down, then the contributing source evidence and timestamps are visible.
- This story reports foundational progress only; it neither waits for nor displays the future assignment-status signal from Epic 3, and assignment state does not change the foundational denominator.

## Implementation Notes

Do not import or promote the current KHTN8 source map: its locators/outcome mapping remain human-review-only. Any structural implementation must treat absent/unverified content as absent, keep the source map out of student responses, and avoid claiming real-corpus/runtime acceptance until the release gate is met.

## Spec Change Log

## Review Triage Log

## Design Notes

The I1 dependency order is catalog/taxonomy identity before Lab contextual discovery; lesson detail and the edition locator contract before ebook jumps; the fixed-course evidence contract before foundational progress. The documented video completion rule is already settled by A2-T3: server high-water evidence, completion at 90% or `ended`, and explicit completion only for an approved equivalent.

## Verification

**Commands:**
- Backend: `npm test`, `npm run lint`, `npm run build`; run `npm run test:integration` only against the configured seeded development API/database.
- Frontend: `npm run lint`, `npm run build`, and focused Playwright tests for the new catalog/detail/progress flows and responsive states.

**Manual checks:**
- Exercise a no-class student through subject → ascending grades → ordered contents → released lesson; probe direct IDs for each unreleased/private state; confirm evidence and progress reload from the API; test ebook verified/unverified fallback; inspect 390/768/1024/1440 px layouts and keyboard/touch operation.
