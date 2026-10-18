# Product and implementation questions

**Status:** The 2026-10-18 direction is recorded in the PRD and Open Curriculum spec. Current Class Space delivery includes teacher direct authoring, supported-file import, due-dated assigned tests with late-reason review, class-wide assignment reset, and membership-only custom-Lab access. AI generation is deferred to a later sprint. Existing A1–A5 and B1–C2 epics cover the earlier scope; the 2026-10-18 change still needs new technical stories.

## Contracts to finalize before story breakdown

- **Import contract:** Select the supported file formats and per-resource templates. Define file/row limits, field validation, all-or-nothing versus partial import, duplicate handling, preview/confirm, and safe error reporting. The current proposal is CSV/XLSX with validation preview and no persistence until teacher confirmation.
- **Late-test rounds and scores:** Confirm the reset's new due date, what happens to a previous score while the new round is open, and the effective score if a target does not resubmit by the reset deadline. The accepted invariant is that prior attempts/decisions are immutable and the reset applies to the whole eligible recipient set.
- **Late decision window:** Define how long a late reason can be submitted and when a teacher decision is due; define the student-facing state while the reason is pending. A pending late-test decision remains unachieved for the subject rollup.
- **Study-practice evidence:** Confirm whether unscored card/study-quiz interactions need persistence, answer feedback, retry state, or teacher-visible reporting. They must never affect grades or subject achievement.
- **Resource lifecycle:** Define edit/version, publish, archive, and withdrawal behavior for class decks, study quizzes, tests, and custom Labs. Published versions with attempts must remain immutable.
- **Curriculum links and migration:** Define stable IDs and behavior when a linked class lesson or taxonomy is revised/archived, and specify schema migration/backfill for existing progress and assignment evidence.
- **API and acceptance matrix:** Normalize author/import draft, class resource, assignment round, late reason/decision, immutable attempt, scored submission, and membership authorization across BE/FE. Cover member/nonmember, target/non-target, before/after due date, pending/approved/rejected/reset, retry/idempotency, and audit behavior.
- **Catalog empty states:** Define copy/navigation for a subject with no released grades and for coverage gaps inside an available curriculum.

## Deferred

- AI-generated Class Space content, including provider, prompting, lesson/version attribution, safety/evaluation, and recoverable AI failures; revisit in the following sprint.
- Legal/launch policy for export and deletion after the 12-month pilot retention window.
- Teacher override workflow and audit UX, detailed Admin UX, and remaining Teacher/Parent implementation interaction details.
- Production scale tier, final hosting region, disaster-recovery RPO/RTO, and paid Supabase backup/PITR options before pilot launch.
