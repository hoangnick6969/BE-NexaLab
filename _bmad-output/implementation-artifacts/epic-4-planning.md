# Epic A4 Planning: A Student Practices, Receives a Verified Verdict, and Retries

**Date:** 2026-10-13  
**Status:** In Progress (Downstream UI & Contract-First Phase)  
**Author:** Downstream Agent (A4)  
**Baseline:** A2 Complete (`a2-t5-resilience-interaction-budgets: done`)  
**Scope:** Parallel implementation plan for Epic A4 without conflicting with concurrent Epic A3 development.

---

## 1. Context & Parallel Development Strategy

### The Constraint
- Epic A3 (`spec-student-quiz-learning-gates`) is currently being developed concurrently on the upstream branch, modifying `prisma/schema.prisma` (adding `QuizAttempt`) and backend route controllers (`src/routes.ts`).
- Modifying backend migrations, schemas, or routes directly in branch `A4` before A3 merges will cause severe Prisma migration drift and merge conflicts.

### The Downstream Strategy
Per the project runbook ([increment-a-agent-runbook.md](../planning-artifacts/increment-a-agent-runbook.md)), the downstream A4 agent operates in **Contract-First Mode**:
1. **Define Frozen Contract Fixtures:** Pin the exact request/response schemas specified in [A4 SPEC.md](../specs/spec-student-verified-lab-challenge-retry/SPEC.md).
2. **Develop Frontend UI & Interactions:** Build the interactive Circuit Lab step, canvas layout, verdict display, state preservation, and retry flow in `FE-NexaLab`.
3. **Write Automated E2E/Component Tests:** Test the complete student journey (loading, circuit construction, submission, verdict rendering, retry) against the frozen contract fixtures.
4. **Rebase & Wire Backend:** Once A3 merges into `main`, rebase branch `A4`, apply the database migration for `Attempt`, hook into the authoritative server simulation, and run the real end-to-end integration gate.

---

## 2. Story Breakdown (Vertical Slices)

### Story A4-T1: Open Only the Unlocked Circuit Workspace
- **Goal:** The student reaches the circuit step within the assigned lesson pathway. The workspace renders with high visual fidelity, meeting accessibility and device constraints.
- **Frontend Scope:**
  - Embed the circuit workbench directly in the lesson pathway under step type `LAB` / `CHALLENGE`.
  - Ensure workspace height is $\ge 70\%$ of viewport height on supported screens.
  - Implement loading state (>4s fallback notification) and WebGL/static fallback.
  - Position circuit toolbox and controls so they never obscure the verdict or primary action buttons.
- **Contract Boundary:** `GET /lessons/:lessonId/steps/:stepId/lab` returns sanitized circuit config and challenge metadata.

### Story A4-T2: Persist Server-Recomputed Official Attempt
- **Goal:** Submitting circuit state sends raw component/wire data to the backend, which re-evaluates physics deterministically and derives an official verdict (`passed` | `partial` | `needs_practice`).
- **Frozen Contract:**
  ```ts
  // Request
  type CircuitAttemptRequest = {
    lessonStepId: string;
    challengeId: string;
    labState: {
      nodes: Array<{ id: string; type: string; value?: number; closed?: boolean }>;
      edges: Array<{ source: string; target: string }>;
    };
    durationMs: number;
    idempotencyKey: string;
  };

  // Response
  type CircuitAttemptResponse = {
    attempt: {
      id: string;
      assignmentId: string;
      lessonStepId: string;
      challengeId: string;
      labState: Record<string, unknown>;
      simulationResult: {
        closed: boolean;
        current_A: number;
        ledLit: boolean;
        overcurrent: boolean;
        message?: string;
      };
      verdict: "passed" | "partial" | "needs_practice";
      durationMs: number;
      attemptNumber: number;
      simulationModelVersion: "1.0.0";
      createdAt: string;
    };
    pathway: PathwayResponse;
    retryGuidance: string | null;
  };
  ```

### Story A4-T3: Show Official Result & Retry Without Losing State
- **Goal:** Display the server's verdict with clear, supportive scientific feedback, and enable instant retry without wiping the student's canvas.
- **Frontend UX Rules:**
  - **Zero State Loss:** If an attempt returns `partial` or `needs_practice`, the circuit nodes, values, and connections remain on the canvas so the learner can tweak and re-test.
  - **Supportive Feedback:** Use constructive pedagogical tone (e.g., "Mạch chưa kín hoặc thiếu điện trở bảo vệ LED"). Avoid alarmist red or punitive phrasing.
  - **Fresh Idempotency on Retry:** Clicking "Thử lại" (Retry) generates a new UUID idempotency key for the next attempt.
  - **Gate Progression:** Only a `passed` verdict marks the step `COMPLETED` and unlocks the subsequent step.

### Story A4-T4: Simulation Parity, Accessibility & Performance
- **Goal:** Verify that client previews match server simulation results within deterministic tolerance, and prove the flow with Playwright tests.
- **Frontend Test Suite:** `FE-NexaLab/tests/circuit-lab.spec.ts` exercising:
  - Correct rendering of pathway step and canvas layout ($\ge 70\%$ height).
  - Component addition, parameter adjustment, and wire connection.
  - Submission receiving `passed`, `partial`, and `needs_practice` fixtures.
  - State preservation across retries.
  - Network failure / retry recovery with the same idempotency key.

---

## 3. Implementation Checklist & Deliverables

- [x] **Artifact 1:** Planning document (`epic-4-planning.md`)
- [ ] **Artifact 2:** Frozen Contract Fixtures (`FE-NexaLab/tests/fixtures/circuit-contract-fixtures.ts`)
- [ ] **Artifact 3:** Frontend Pathway Circuit Lab Component (`FE-NexaLab/src/pages.tsx` / `FE-NexaLab/src/labs/circuit.tsx`)
- [ ] **Artifact 4:** Frontend Tests (`FE-NexaLab/tests/circuit-lab.spec.ts`)
- [ ] **Quality Gate:** Frontend `npm run lint` & `npm run build` passing cleanly
- [ ] **Integration Gate:** Ready for clean rebase onto `main` once Epic A3 is merged.
