# TAI-06 — Ordered Vertical Tickets

## TAI6-T0 — Gates: range approval and v1 scope decision

- The product owner confirms v1 scope: challenge variants on existing labs, not a custom Lab builder. Named reviewers approve the parameter ranges of at least one model (Q-C2-04), which flips its `rangeReview` to `approved` with a review reference.
- **Accept when:** both decisions are recorded in `.memlog.md`; at least one `CHALLENGE_PARAMETERS` entry is `approved` with a reference; the lab has reference golden states (pack or config version).
- **Depends on:** none.

## TAI6-T1 — Extract lesson challenge-variant application function

- Move the challenge-param validation and variant write logic from `lessons.controller.ts` into a lessons application function, used by the existing routes and later by the `ai` module.
- **Accept when:** `npx tsx scripts/route-manifest.ts src` is identical before and after; the existing lesson integration and pathway tests pass unchanged; `npm run check:layers` passes.
- **Depends on:** TAI6-T0.

## TAI6-T2 — Proposal prompt, output schema and engine validation

- Snapshot builder `lab-challenge-input@1`, prompt `draft-lab-challenge@1` with pinned-digest test, Zod schema `lab-challenge-proposals@1`, and a pure `validateProposals` implementing LV-01..LV-09 with `evaluate()`.
- **Accept when:**
  - Fixtures cover each LV rule pass and fail, using a range boundary of min, max and off-step, and an unsolvable or non-discriminating parameter set.
  - Engine results equal those of a direct `evaluate()` call.
  - A model with `rangeReview: "pending"` is never in the snapshot.
- **Depends on:** TAI6-T0, TAI-01 TAI-T1 and TAI-T3.

## TAI6-T3 — `DRAFT_LAB_CHALLENGE` job purpose, review and apply routes

- Expand-only migration (`AiJob.targetKind` nullable, `appliedLessonId`, `appliedItemId`). Create validation for editable lessons, reject decision, and an apply route with re-validation, idempotency and audit.
- **Accept when:**
  - An outsider teacher, a student, a published or structure-locked lesson and a shared-library lesson are each denied per contract.
  - A replayed apply key replays, and a second apply returns 409.
  - Apply after a range change returns `AI_PROPOSAL_NO_LONGER_VALID`.
  - No `Lab`, `Challenge` or simulation-version row is written by the AI module.
- **Depends on:** TAI6-T1, TAI6-T2, TAI-01 TAI-T2 and TAI-T4.

## TAI6-T4 — Teacher proposal review UX

- Lesson-editor panel per the frontend contract.
- **Accept when:** a Playwright journey covers request → review with engine results → apply → teacher preview shows the deterministic objective. The disabled-state copy appears when no model is approved. The rationale never appears in any student-facing response or DOM.
- **Depends on:** TAI6-T3.

## TAI6-T5 — Golden evaluation and end-to-end proof

- Generate at least 15 proposals across approved models with the real provider. The supervising lecturer labels each as pedagogically sensible yes/no and appropriate to the lesson yes/no. Run the SPEC success-signal journey, including a student attempt evaluated with the applied parameters.
- **Accept when:** 100% of kept proposals are in range and engine-verified (by construction); at least 70% are labelled sensible and appropriate; the journey passes against a real API and database; results are stored in `_bmad-output/implementation-artifacts/tai-06-golden-evaluation.md`.
- **Depends on:** TAI6-T4.
