# Epic A2 Vertical Tickets

> Historical accepted-flow tickets. Reading/video evidence remains applicable; public study-card and Quiz steps are superseded. Cards now belong to teacher-created Class Space decks; new behavior follows the Open Curriculum PRD/spec.

Build in order. Each ticket updates backend schema/API/tests and the frontend experience needed to demonstrate its outcome.

## A2-T1 — Return an authoritative ordered lesson pathway

**Acceptance criteria**

- Migration adds `LessonStep`/`StepProgress`, backfills seeded published lessons deterministically, and is reversible in an isolated database.
- Published lesson validation enforces ordered unique positions and valid step config; draft/invalid lesson content is never returned to a student.
- Applicable student receives sanitized pathway + official states + next step; unrelated student/direct URL receives no content metadata.
- UI renders every step in fixed order with complete/current/locked states and a precise Continue label; 390/768/1024/1440 layouts have no obscured action.

**Verification:** schema and ownership source trace; migration/backfill/unit/contract tests; real Supabase seeded pathway request and browser render; production separate.

## A2-T2 — Complete and resume reading

**Acceptance criteria**

- Reading content is semantic, keyboard navigable, and sanitized according to the chosen renderer; missing content blocks publication rather than producing a false complete state.
- Explicit completion is idempotent, tied to authenticated student + step, and persists across reload/device session.
- Duplicate/reordered requests cannot lower or duplicate progress; dependency failure shows retry and does not advance Continue.

**Verification:** transition/security tests, frontend state tests/lint/build, real completion + reload, unsupported/unauthorized negatives.

## A2-T3 — Resume and complete video or equivalent text

**Acceptance criteria**

- Video does not autoplay and exposes duration, controls, progress, transcript toggle, loading/unavailable/retry states.
- Server accepts bounded heartbeats, stores only a monotonic high-water mark, and completes at 90% or `ended`; seeking backward never reduces evidence.
- When video is unavailable, an approved published equivalent text is available; `complete-fallback` is accepted only for that configured fallback.
- Heartbeat batching avoids a write per playback frame and a recoverable write failure preserves the last unsent high-water value.

**Verification:** payload/property tests including malformed duration/position; accessible component checks; real playback or deterministic media fixture with API persistence/reload.

## A2-T4 — Review all study cards and advance to Quiz

**Acceptance criteria**

- Cards are sanitized structured data with stable IDs/front/back text and deterministic order; an empty required card set prevents publication.
- Previous/Next, arrow keys, touch, focus, count, and reduced-motion behavior work; one-card behavior follows the UX definition.
- Server records visited card IDs/indexes and completes only after all current published cards are visited; forged indexes and cards from another lesson fail.
- Continue changes to the Quiz action only after required A2 steps are server-confirmed complete; Lab/Challenge remain visible and locked.

**Verification:** schema/transition/authorization tests; frontend interaction and responsive checks; real end-to-end reading → video/fallback → cards → Quiz boundary.

## A2-T5 — Verify A2 resilience and interaction budgets

**Acceptance criteria**

- Loading preserves layout, input feedback is visible within 100 ms, and API pilot targets are measured rather than assumed.
- A browser run covers reload, expired-session refresh, one safe read retry, failed mutation recovery, reduced motion, keyboard, touch/mobile, and unavailable video.
- Source, automated, runtime, and production evidence are reported separately; E2E is pass only with actual Supabase/API/app/browser dependencies.

**Verification:** backend lint/test/build; frontend lint/build and relevant tests; contract snapshot; timed real-dependency E2E; no production claim without deployment.
