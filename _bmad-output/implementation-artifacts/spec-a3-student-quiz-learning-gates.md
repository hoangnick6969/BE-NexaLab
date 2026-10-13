---
title: 'Epic A3 student quiz and learning gate'
type: 'feature'
created: '2026-10-13'
status: 'in-progress'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: 'b47c8f176074bbf0fb1f606fa7c60feb6e9cebde'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-3-context.md'
  - '{project-root}/_bmad-output/specs/spec-student-quiz-learning-gates/SPEC.md'
  - '{project-root}/_bmad-output/specs/spec-student-quiz-learning-gates/tickets.md'
  - '{project-root}/_bmad-output/planning-artifacts/increment-a-agent-runbook.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The assignment learning pathway reaches a quiz boundary but has no assignment-scoped quiz delivery or durable attempt history. The legacy endpoint accepts positional answers, uses a 70% threshold, overwrites aggregate progress, and does not enforce assignment or A2 prerequisites.

**Approach:** Implement A3-T1 through A3-T4 as one cross-repository vertical feature. Deliver sanitized stable-ID questions only to an eligible student, persist immutable server-scored attempts with idempotency, reconcile quiz and practical-step gates from server evidence, and render a recoverable, accessible student flow.

**Always:** Preserve A1/A2 assignment and progress contracts; derive student identity from auth; validate with Zod; keep answer keys server-side; pass at 50%; retain best and latest semantics distinctly; treat `Progress` as a projection; distinguish source, automated, runtime, and production evidence.

**Never:** Add short-answer/manual grading, teacher override, authoring UX, random/adaptive quizzes, AI explanations, leaderboard, or A4 lab implementation. Do not trust client score, pass state, ownership, or unlock state. Do not claim live or production verification unless those dependencies actually ran.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Eligible student reads quiz | Published assigned lesson; all required A2 steps complete | Stable question/option IDs and prompts only; no answer keys | Recoverable stable error for unavailable content |
| Student is ineligible | Wrong role/student, no assignment, draft lesson, or A2 incomplete | No quiz or answer metadata disclosed | Stable non-leaking authorization/not-found error |
| Complete submission | Exact unique question and option IDs plus idempotency key | Server stores one immutable attempt and returns score, per-question correctness, and reconciled pathway | Invalid/partial/extra answers rejected atomically |
| Duplicate delivery | Same student/key and same payload, then same key with changed payload | First result returned without a second attempt; changed payload conflicts | No duplicate progress mutation |
| Retry and gate | Failed attempt followed by a passing attempt at 50% or more | History retained; latest and best labeled; pass completes Quiz and server unlocks LAB | Client shows retryable error and never claims unsaved success |

</frozen-after-approval>

## Code Map

- `src/pathway.ts` validates step config and computes pathway state; reuse ordering and `StepProgress`, but replace permissive QUIZ config validation and derive LAB access from passed quiz evidence.
- `src/routes.ts` owns lesson schemas, assignment checks, pathway reads, A2 progress mutations, legacy quiz scoring, and practical attempt submission. Reuse `applicableLessonAssignment`; guard both quiz routes and practical submission with shared server rules.
- `prisma/schema.prisma` and `prisma/migrations/` define `Lesson`, `LessonStep`, `StepProgress`, and projection `Progress`; add immutable quiz-attempt evidence with a unique student/idempotency-key constraint.
- `src/pathway.test.ts` and `scripts/integration.mjs` cover pathway and real API flows; extend with sanitization, authorization, exact scoring boundaries, idempotency, retries, and gate cases.
- `nexalab-fe/src/pages.tsx` renders assignment pathways and A2 step components; add question-by-question quiz UI and reconcile only from returned pathway/attempt data. Existing library quiz is a separate legacy flow.
- `nexalab-fe/src/api.ts`, `src/styles.css`, and `tests/study-cards.spec.ts` establish API error/retry, responsive step styles, and focused Playwright patterns; add explicit quiz contract types and focused behavior tests.

## Tasks & Acceptance

**Execution:**
- [x] Backend: validate stable quiz content at publication and add gated sanitized quiz retrieval; prevent answer-key leakage.
- [x] Frontend T1: add typed sanitized quiz retrieval and a one-question flow that requires a selection to advance and retains local answers.
- [ ] Backend: add attempt schema/migration and atomic score, snapshot, idempotency, and projection reconciliation.
- [ ] Backend: make the shared pathway and practical-attempt authorization honor the quiz pass; extend unit and integration coverage.
- [ ] Frontend: add typed quiz delivery/submission, one-question flow, recoverable retry with stable idempotency key, evidence and server-reconciled unlock UI.
- [ ] Frontend: add focused responsive/keyboard/error/reload coverage; record measured quiz API latency against PRD pilot targets.
- [ ] Update A3 implementation evidence and sprint tracking without marking production verified.

**Acceptance Criteria:**
- Given an ineligible student or incomplete A2 pathway, when quiz delivery or practical submission is requested, then the server rejects it without revealing quiz content or keys.
- Given an eligible student, when quiz content is fetched, then stable-ID multiple-choice questions contain no answer or correct option ID.
- Given valid complete answers, when submitted, then score and per-question evidence are computed and stored once by the server, with exact 50% passing.
- Given a repeated identical idempotency key, when the request is retried, then the original result is returned; a changed payload conflicts and history remains unchanged.
- Given a failed then passing attempt, when the student reloads, then both attempts remain visible, best/latest are correctly labeled, Quiz is complete, and the server pathway exposes LAB.
- Given a mutation failure or reload, when the student retries, then the same pending submission key is reused and the UI never implies unconfirmed success.
- Given the final UI at 390, 768, 1024, and 1440 px, when used by keyboard or touch with reduced motion, then there is no horizontal overflow and all primary actions remain accessible.

## Implementation Notes

**A3-T1 checkpoint (2026-10-13):** Added deterministic question/option IDs for legacy lesson content, strict multiple-choice quiz validation with a fixed 50% pass threshold, assignment/A2-gated sanitized quiz delivery, and the student question-by-question UI. Focused pathway tests (11/11), backend lint/build, and frontend lint/build passed. The Supabase development migration and seed completed; API integration reached and passed the quiz-delivery, key-redaction, prerequisite, wrong-role, and unrelated-student assertions before a later T2 duplicate-delivery failure stopped the full run. Browser verification was not completed because the local API/web ports were unavailable. A3-T2 through T4 remain pending; their current working-tree changes have not been certified.

## Design Notes

Legacy content stores question answers as array indexes. At the publication boundary, map them to stable IDs deterministically and keep accepted-attempt question snapshots so later content edits cannot rewrite historical evidence. Preserve the existing student lesson pathway; the library quiz is not the assignment-scoped contract.

## Verification

**Commands:**
- Backend `npm run lint`, `npm test`, `npm run build` -- all pass.
- Frontend `npm run lint`, `npm run build`, focused quiz Playwright test -- all pass.
- Backend `npm run test:integration` -- pass only with the intended non-production database, seeded API, frontend, and browser actually configured and run.
- Inspect contract and migration diff; measure quiz read/mutation latency and report against 500 ms / 1,000 ms pilot p95 targets when real runtime is available.
