---
id: SPEC-b2-teacher-evidence
status: ready-for-implementation-after-b1
companions:
  - tickets.md
  - ../../planning-artifacts/architecture-spine-nexalab-release-1/ARCHITECTURE-SPINE.md
  - ../../../../nexalab-fe/docs/design/09-TEACHER-UX-DEFINITION.md
  - ../../../../nexalab-fe/docs/design/08-STUDENT-P0-UX-DEFINITION.md
sources:
  - ../../../docs/product/prd.md
  - ../../planning-artifacts/increment-b-c-plan.md
---

# B2 — Teacher Acts on Traceable Learning Evidence

## Why

Teachers need to see which students may need support and inspect the exact evidence behind each signal, without turning noisy metrics into rankings or AI judgments.

## Capabilities

- **CAP-1 — Assignment-scoped tracking board:** show applicable roster progress by lesson step or standalone-lab verdict; success means every value derives from evidence for that assignment under an explicit aggregation rule.
- **CAP-2 — Deterministic support signals:** flag overdue incomplete work, two or more failed quiz attempts, three or more practical attempts without a pass, or seven days without activity; success means each signal names the rule, evidence IDs, and next step.
- **CAP-3 — Evidence drill-down:** an authorized teacher opens the relevant quiz/practical evidence; success means ownership and approved-enrollment rules apply and every displayed metric can be traced to source records.
- **CAP-4 — Scoped teacher quiz-gate override:** a teacher may unlock one student's one assignment gate with a reason and revoke it; success means it changes access only, never score, verdict, or evidence.
- **CAP-5 — Understandable evidence UX:** a teacher can move from class board to neutral support flag to exact evidence; success means no ranking, ambiguous aggregate, or irrecoverable navigation.
- **CAP-6 — Assignment-scoped evidence integrity:** new learning evidence is tied to the assignment that authorized it; success means assigning the same lesson twice cannot reuse another assignment's progress accidentally.

## Constraints

- Migrate `StepProgress` to a surrogate ID plus nullable `assignmentId` and unique `(studentId, assignmentId, stepId)`. New assigned work requires `assignmentId`; null is legacy/free-practice only. Backfill only when one applicable assignment is unambiguous; emit an exception report and stop on ambiguous rows. Assignment reads filter `StepProgress`, `QuizAttempt`, and `Attempt` by the same assignment. New assigned quiz/practical writes require `assignmentId`; free practice remains explicitly unassigned and never enters a class board.
- Removed students are not visible from the former class; evidence remains for the student/admin. Teacher detail access for missing or unauthorized evidence uses the same 404 contract and safe audit policy.
- Support rules are deterministic and non-AI. Qualifying activity is a persisted StepProgress state/progress advance, QuizAttempt creation, or practical Attempt creation for that assignment. Page views, link events, and teacher overrides do not count. Inactivity is rolling 7×24 hours from the latest qualifying event, or assignment creation when none exists; archived assignments/classes have no active flags. Due-date edits and new evidence recalculate flags.
- Override identity is student × assignment × gate step; persist actor/reason/created/revoked data and audit. It does not edit quiz score, attempt, practical verdict, or other pathway.
- Revoke checks for downstream evidence created through the override. If any exists, return 409 `OVERRIDE_IN_USE` and keep the override active; otherwise revoke atomically and relock the target gate. Repeated create/revoke with the same idempotency key replays the prior result.
- Read targets follow PRD QR-09: p95 500 ms read / 1000 ms mutation in pilot, measured with representative 40-student × 6-step workload. Local measurements are not pilot proof.

## Non-goals

- Predictive analytics, student ranking, AI-generated intervention, parent reports, editing evidence, override without a reason, score/verdict changes.

## Success signal

For an active assignment, a teacher sees counts that reconcile to source evidence, opens each flagged student's exact evidence, and can create/revoke a narrowly scoped gate override. An outsider or removed student is denied; override never changes evidence or score; board latency is measured under the approved workload.

## Implementation gate

- B2-T0 must complete its preflight, migration, and A5 regression reconciliation before the board or override schema is built. Ambiguous legacy evidence is reported for explicit repair; it is never attached to an assignment by guesswork.
