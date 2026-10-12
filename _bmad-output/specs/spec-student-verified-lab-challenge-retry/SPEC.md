---
id: SPEC-student-verified-lab-challenge-retry
status: ready-for-implementation
companions:
  - tickets.md
  - ../../planning-artifacts/architecture-spine-nexalab-release-1/ARCHITECTURE-SPINE.md
  - ../../../../nexalab-fe/docs/design/08-STUDENT-P0-UX-DEFINITION.md
sources:
  - ../../../docs/product/prd.md
  - ../spec-student-quiz-learning-gates/SPEC.md
---

> **Canonical contract.** This SPEC and its companions define Epic A4. Implement after A3 runtime acceptance.

# Epic A4 — A Student Practices, Receives a Verified Verdict, and Retries

## Why

The representative circuit lab proves NexaLab's differentiator: a student changes model state, submits it, receives a deterministic server verdict, and learns through retry. Current attempt persistence is useful evidence but is not yet linked to the assigned lesson step or protected by the A3 gate.

## Capabilities

- **CAP-1 — Authorized circuit workspace:** an assigned student who passed the quiz opens the circuit step and usable controls; success means direct access before unlock or outside the assignment is rejected.
- **CAP-2 — Deterministic official attempt:** submitted circuit state is validated and recomputed by the backend `packages/sim`; success means client preview never determines persisted result/verdict.
- **CAP-3 — Recoverable result:** the student sees the official `passed | partial | needs_practice` result with evidence and no false-save state.
- **CAP-4 — Retry/history:** Retry starts a new attempt while preserving every prior attempt; success means official progress derives from immutable evidence and challenge completion unlocks the next configured step.

## Constraints

- A4 representative is the existing Grade 8 circuit lab/challenge only. Other labs remain outside A4 acceptance.
- Frontend and backend use the same explicitly versioned deterministic sim package for preview parity, but backend recomputation is authoritative.
- Accepted attempt data links `studentId`, `assignmentId`, `lessonStepId`, `challengeId`, submitted state, sim package/model version, official result, verdict, duration, and server timestamp.
- Submission is idempotent, transactional with progress projection, and rate-limited. Invalid/oversized state is rejected before simulation.
- Student input is preserved after dependency failure; mutation is not blindly retried with a new key.
- The canvas/control surface has keyboard/touch equivalents, WebGL/static fallback, reduced-motion support, and targets 30 FPS on the pilot device matrix without treating that target as already proven.

## Non-goals

- Additional lab subjects, open-ended teacher authoring, AI authority, physical-lab safety certification, multiplayer, gesture-only controls, or advanced analytics.

## Success signal

The A3-passed student opens the assigned circuit step, submits a valid state against the real API/Supabase database, receives a verdict recomputed by the backend, retries with changed state, reloads both immutable attempts, and cannot forge an official result, student identity, unlock, or verdict.

## Implementation contract

- Extend `Attempt` with `assignmentId`, `lessonStepId`, `simulationModelVersion`, and `idempotencyKey`; add unique `(studentId, idempotencyKey)` and indexes for student/step/time. Existing rows are retained with nullable trace fields and explicitly classified legacy.
- `GET /lessons/:lessonId/steps/:stepId/lab` returns sanitized circuit config/challenge only after applicability + quiz gate.
- `POST /attempts` accepts `{ lessonStepId, challengeId, labState, durationMs, idempotencyKey }`; actor and assignment derive server-side; challenge/step/lab relationship and gate are validated; server ignores any client result/verdict.
- Response returns immutable attempt, official result/verdict, attempt number, reconciled pathway/progress, and safe retry guidance. Stable errors distinguish validation, gate, ownership, conflict, rate limit, and dependency/system failure.
- A challenge step completes only on `passed`; `partial` and `needs_practice` remain in progress. Every retry creates new evidence unless it is the same idempotent delivery.

Canonical attempt contracts:

```ts
type CircuitAttemptRequest = { lessonStepId: string; challengeId: string; labState: Record<string, unknown>; durationMs: number; idempotencyKey: string };
type CircuitAttemptResponse = {
  attempt: { id: string; assignmentId: string; lessonStepId: string; challengeId: string; labState: Record<string, unknown>; simulationResult: Record<string, unknown>; verdict: "passed" | "partial" | "needs_practice"; durationMs: number; attemptNumber: number; simulationModelVersion: string; createdAt: string };
  pathway: PathwayResponse;
  retryGuidance: string | null;
};
```

Unknown fields are stripped or rejected consistently by the Zod contract. The backend constructs every response result/verdict field from its recomputation, never by echoing the request.

