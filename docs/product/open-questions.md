# Product and implementation questions

**Status:** The 2026-10-17 product direction is recorded in `docs/product/prd.md` and the Open Curriculum spec. The prior Increment A–C epics remain the accepted baseline for their original scope, but they do not decompose this change. Do not start story breakdown until the product and implementation contracts below are resolved and reflected in the affected specs.

## Product scope decisions still needed

- **Increment boundary:** Confirm whether the next increment includes only student consumption plus minimal teacher authoring for Class Space resources, or the full authoring paths (direct authoring, data entry/import, and AI-generated advanced extensions). The PRD describes the capability envelope but does not assign each path to a delivery increment.
- **Teacher-created resource lifecycle:** Define supported import formats, validation/partial-import behavior, and how study decks, unscored study quizzes, tests, and custom Labs are reviewed, published, edited, archived, or withdrawn. AI output must remain a teacher-reviewed draft; provider, source/version attribution, validation, safety, and recoverable failure behavior remain architecture decisions.
- **Study practice behavior:** Confirm whether unscored study quiz/card interactions need persistence, answer feedback, retry state, or teacher-visible reporting. They must never affect grades or subject achievement.

## Implementation contracts needed before story breakdown

- **Assignment achievement:** Map each assignment type to its existing evaluator and define the accepted terminal state used by the subject summary. Confirm whether scheduled/not-yet-open work is actionable and how due, excused, canceled, archived, or class-removed work changes actionability. Preserve closed evidence without keeping the current rollup unmet after the student can no longer act.
- **Course progress denominator:** The fixed official course version determines required foundational evidence. A foundational Lab contributes when that version marks the Lab as required; optional catalog Labs remain open and do not block course completion. Confirm the versioned data representation and migration/backfill for existing progress.
- **Class resource access:** Active approved members may discover and use class-shared resources. For a custom Lab shared to the class but scored only for explicit targets, define whether non-target members may launch an unscored attempt and which attempt data is retained.
- **Curriculum links and versioning:** Define stable IDs and change behavior for a teacher Lab linked to a specific class lesson and its subject, grade, chapter, and topic. Define what happens when taxonomy or the source lesson is revised or archived.
- **API, schema, and lifecycle mapping:** Normalize resource types, audience, publication/review states, assignment targets, attempt types, authorization, rollup evaluation, and UI states across BE and FE. Specify migration/backfill and an acceptance matrix for member/outsider, target/non-target, open/assigned, actionable/closed, and scored/unscored cases.
- **Catalog empty states:** Available grades are the released grades in ascending order. Define the copy and navigation behavior for a subject with no released grades and for gaps inside an available curriculum.

## Deliberately deferred

- Legal/launch policy for export and deletion after the 12-month pilot retention window.
- Teacher override workflow and audit UX, detailed Admin UX, and remaining Teacher/Parent implementation interaction details.
- Production scale tier, final hosting region, disaster-recovery RPO/RTO, and paid Supabase backup/PITR options before pilot launch.
- The general-purpose Teacher AI Content Assistant and Student AI Tutor remain future scope; the narrower lesson-grounded Class Space drafting capability is in the product direction above.
