---
id: SPEC-student-core-learning-materials
status: ready-for-implementation
companions:
  - tickets.md
  - ../../planning-artifacts/architecture-spine-nexalab-release-1/ARCHITECTURE-SPINE.md
  - ../../../../nexalab-fe/docs/design/08-STUDENT-P0-UX-DEFINITION.md
sources:
  - ../../../docs/product/prd.md
  - ../spec-provisioned-student-starts-assigned-learning/SPEC.md
---

> **Historical accepted contract.** This SPEC and its companions define the original assigned-learning Epic A2. For amended product behavior, the 2026-10-17 PRD and Open Curriculum spec take precedence. A2 remains the prior accepted baseline; this change has not been decomposed into stories.

> **Open Curriculum precedence (2026-10-17):** A2's completed reading/video evidence rules remain applicable. Its study-card step and transition to Quiz describe the old assigned pathway only; public lessons contain no cards or quiz. Study-card decks are teacher-created Class Space resources. For new Open Curriculum behavior, follow the PRD and `spec-open-learning-catalog`; existing A2 tickets are historical acceptance.

# Epic A2 — A Student Learns from Complete Core Materials

## Why

NexaLab must provide complete core materials before it differentiates with simulation. In the historical assigned pathway, a student opens reading, video or equivalent text, and study cards in order, with progress that survives reloads and does not falsely unlock later assigned work. New Open Curriculum lessons omit the card step; new study decks are teacher-created Class Space resources.

## Capabilities

- **CAP-1 — Ordered pathway:** the server returns the published lesson's ordered steps and the student's official state; success means all steps are visible, only valid steps are actionable, and Continue always names the next server-authorized action.
- **CAP-2 — Reading evidence:** the student can read accessible lesson content and explicitly complete the required reading; success means completion is idempotently persisted and reload-safe.
- **CAP-3 — Video/equivalent evidence:** the student can watch a non-autoplay video with transcript/equivalent text and resume; success means the backend records a monotonic playback high-water mark and completes at 90% or `ended`, while the approved fallback has an explicit completion action.
- **CAP-4 — Study cards:** the student can review every published card with keyboard/touch controls; success means an explicit completed review is persisted only after all cards have been visited in the current or prior sessions.

## Constraints

- Adopt AD-10 through AD-12. Add ordered `LessonStep` and per-student `StepProgress`; do not encode official gates only in React state.
- Allowed A2 step types are `READING`, `VIDEO`, and `STUDY_CARDS`; A3/A4 step records may be visible but locked.
- Content is the approved NexaLab-authored Grade 8 pilot set with explicit curriculum metadata. No subject-approval claim comes from software tests.
- `StepProgress.progressValue` is a validated 0–100 high-water mark; updates are monotonic and idempotent. Server timestamps are authoritative.
- All async states are loading, populated, empty/unavailable, and recoverable error. Failed writes never show saved completion.
- Video does not autoplay; transcripts are keyboard accessible; cards work without flip motion and use 44×44 px actions.

## Non-goals

- Quiz scoring/unlock, lab/challenge execution, history dashboards, full teacher authoring, AI tutoring, offline media download, or DRM.

## Success signal

Against the real seeded API/database/browser stack, the A1 student opens the assigned lesson, completes reading, video/equivalent, and study cards in order, reloads between steps without losing official state, and sees Quiz as the next visible locked/unlocked boundary without accessing practical work.

## Implementation contract

- `LessonStep`: `id`, `lessonId`, `type`, `position`, `required`, `config` JSON, timestamps; unique `(lessonId, position)`. Published lesson validation rejects duplicate positions, unsupported types, missing required resources, or invalid refs.
- `StepProgress`: `studentId`, `stepId`, `status: NOT_STARTED | IN_PROGRESS | COMPLETED`, `progressValue`, `lastPosition?`, `startedAt?`, `completedAt?`, `updatedAt`; unique `(studentId, stepId)`.
- `GET /lessons/:id/pathway` authorizes assignment applicability and returns lesson summary, ordered sanitized steps, per-step state, `nextStepId`, and lock reasons. It never returns quiz answers or hidden authoring data.
- `PUT /lessons/:lessonId/steps/:stepId/progress` accepts a step-type-specific Zod union plus optional idempotency key. Server validates the step belongs to the lesson/student path, applies monotonic state transition, updates the `Progress` projection transactionally, and returns the full reconciled step/pathway state.
- Reading payload: `{ action: "complete" }`. Video payload: `{ action: "heartbeat" | "ended" | "complete-fallback", positionSeconds, durationSeconds }`; fallback completion requires a published equivalent. Cards payload: `{ action: "visit" | "complete", cardIndex }` and completion requires every valid index visited.
- Frontend uses the same assignment-authorized pathway response across separate student destinations: **Bài học** owns reading, video, and study cards; **Bài tập** owns quiz and practical steps. Bài tập links back to Bài học while required core steps remain incomplete. Local state may make controls responsive but reconciles on mutation response and preserves unsent video/card state after recoverable failure.

Canonical pathway response:

```ts
type PathwayResponse = {
  lesson: { id: string; title: string; subject: { id: string; name: string }; grade: number; chapter: string; topic: string; learningObjective: string; prerequisites: string; curriculum: string };
  assignment: { id: string; dueDate: string; overdue: boolean };
  steps: Array<{
    id: string;
    type: "READING" | "VIDEO" | "STUDY_CARDS" | "QUIZ" | "LAB" | "CHALLENGE";
    position: number;
    required: boolean;
    state: "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED" | "LOCKED";
    progressValue: number;
    lockReasonCode: "PREREQUISITE_INCOMPLETE" | "QUIZ_NOT_PASSED" | "PRACTICE_NOT_PASSED" | null;
    resource: Record<string, unknown> | null;
  }>;
  nextStepId: string | null;
  updatedAt: string;
};
```

The progress mutation returns `{ step: PathwayResponse["steps"][number], pathway: PathwayResponse }`; clients replace reconciled server state rather than deriving an unlock.

