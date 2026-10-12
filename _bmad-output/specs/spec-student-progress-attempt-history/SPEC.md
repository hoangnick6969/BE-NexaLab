---
id: SPEC-student-progress-attempt-history
status: ready-for-implementation
companions:
  - tickets.md
  - ../../planning-artifacts/architecture-spine-nexalab-release-1/ARCHITECTURE-SPINE.md
  - ../../../../nexalab-fe/docs/design/08-STUDENT-P0-UX-DEFINITION.md
sources:
  - ../../../docs/product/prd.md
  - ../spec-student-verified-lab-challenge-retry/SPEC.md
---

> **Canonical contract.** This SPEC and its companions define Epic A5. Implement after A4 runtime acceptance.

# Epic A5 — A Student Understands Official Progress and History

## Why

Completion is trustworthy only when the student can trace each status, count, score, and verdict to source evidence. The current aggregate progress response is not enough to distinguish learning steps, quiz attempts, assignment context, or legacy records.

## Capabilities

- **CAP-1 — Personal progress overview:** the authenticated student sees assigned lesson completion by step and a precise next action; success means summaries are server-derived and contain no other student's data.
- **CAP-2 — Evidence drill-down:** every displayed metric/status opens its contributing step, quiz, or practical evidence with timestamp and source link.
- **CAP-3 — Paginated history:** the student reviews immutable quiz and practical attempts in deterministic newest-first pages and opens a detail safely.
- **CAP-4 — Rebuildable consistency:** progress projection can be recomputed from source evidence; success means drift is detectable and repaired without changing immutable attempts.

## Constraints

- Student endpoints derive identity from the session (`/me/...`); clients do not send a student ID for their own data. Teacher/Parent views remain their later epics.
- `StepProgress`, `QuizAttempt`, and `Attempt` are evidence sources. `Progress` is a query projection/cache with explicit semantics, not an independent truth.
- Completion percentage denominator is the assigned published required steps in scope; archived assignment evidence remains in history but not active completion denominator.
- Scores label `latest` versus `best`; practical history uses verdicts rather than an invented percentage. Empty data shows a dash/explanation, not fabricated zero achievement.
- Cursor pagination is stable by `(createdAt, id)` and page size is bounded. Every detail route rechecks ownership.
- Evidence follows the 12-month last-activity pilot retention decision; expiry/deletion is an auditable operation and not silently performed by UI.

## Non-goals

- Teacher/class analytics, parent views, leaderboard, peer comparison, predictive analytics, AI conclusions, or long-term legal retention policy.

## Success signal

The real A1–A4 student opens Progress, sees an accurate active-assignment pathway and recent activity, drills every metric to source evidence, pages attempt history without duplicates/gaps, and receives no data for another student's probed IDs. A projection rebuild yields the same displayed status.

## Implementation contract

- `GET /me/progress` returns active assignment summaries, ordered required steps with evidence type/status/timestamps, completion numerator/denominator, next action, latest/best quiz summaries, and practical verdict summary. It is the Student replacement for passing own ID to `/progress/:studentId`.
- `GET /me/activity?cursor=&limit=` returns a bounded union of quiz/practical evidence sorted by `createdAt desc, id desc`, with typed source links and `nextCursor`.
- `GET /me/quiz-attempts/:id` and `GET /me/attempts/:id` return authenticated student's detail only. Unknown and unauthorized IDs use the same non-leaking not-found behavior.
- A backend projection service derives/updates `Progress` in the same transaction as evidence writes and exposes an implementation/ops-only rebuild/check command. Rebuild is idempotent and reports drift; it never rewrites immutable evidence.
- Frontend uses one Progress page with summary → completion table → paginated history → accessible inline/side-sheet detail. Every summary control has a source destination and keyboard/touch behavior.

Canonical progress/activity shapes:

```ts
type MyProgressResponse = {
  assignments: Array<{ assignmentId: string; lessonId: string; title: string; dueDate: string; overdue: boolean; completedRequired: number; totalRequired: number; percent: number | null; nextStepId: string | null; steps: Array<{ stepId: string; type: string; state: string; evidenceType: "STEP_PROGRESS" | "QUIZ_ATTEMPT" | "PRACTICAL_ATTEMPT" | null; evidenceId: string | null; updatedAt: string | null }> }>;
  summary: { activeAssignments: number; completedAssignments: number; practicalAttempts: number; passedPracticals: number; updatedAt: string | null };
};
type ActivityPage = { items: Array<{ id: string; kind: "QUIZ" | "PRACTICAL"; lessonId: string; stepId: string; title: string; occurredAt: string; score: number | null; passed: boolean | null; verdict: "passed" | "partial" | "needs_practice" | null; legacy: boolean }>; nextCursor: string | null };
```

`percent` is `null` when `totalRequired` is zero and the UI renders a dash/explanation. Cursor contents are opaque to the client.

