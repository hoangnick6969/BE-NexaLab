# TAI-05 Pricing evidence: team-lead baseline 2026-11-09, pending 1 month of measured usage

> **Status.** Gate G-3 is closed by a **team-lead decision recorded 2026-11-09**, on the assumption of a baseline
> token-to-credit rate and default pricing tiers. It is **not** an approval by the product owner. **No measured TAI-01
> usage exists.** Every number below is an assumption chosen to be conservative and easy to change. The token counts the
> fake provider reports are character-based estimates (`ceil(characters / 4)`), not measurements of any real model.
> This note replaces the "one month of measured usage" input of TAI5-T0 until that usage exists; the ticket stays open
> in that respect (see "To close with real data").

## What is decided

| Item | Baseline | Where it is configured |
| --- | --- | --- |
| Pricing is data | `PricingVersion` rows per purpose. A job pins the version used at reserve. | Admin `POST admin/credits/pricing` then `.../:id/activate`, no code change |
| Seeding | With `AI_CREDITS_ENABLED=true`, boot seeds version 1 of any purpose without a row from the baseline below (audited, idempotent). | `AI_CREDITS_SEED_BASELINE` (default true) |
| Credit unit | Whole integers. Fractions round up per job after proration. Credits have no cash value. | ledger rules |
| Initial grant | **None automatic.** Admin grants only (non-goal: allowance automation). Suggested pilot grant: 100 credits per teacher, which funds about eight 10-question quizzes. | Admin grant route |
| Expiry | **No expiry, no monthly rollover logic** (open question stays open; nothing in the code expires credits). | not implemented |

## Baseline prices (version 1 per purpose)

| Purpose | `baseCredits` | `perItemCredits` | `creditsPer1kInputTokens` | `creditsPer1kOutputTokens` | Env overrides (read only when version 1 is seeded) |
| --- | --- | --- | --- | --- | --- |
| `GENERATE_RESOURCE` | 2 | 1 | 2 | 3 | `AI_CREDITS_GENERATE_RESOURCE_BASE`, `_PER_ITEM`, `_IN_1K`, `_OUT_1K` |
| `ASSESS_SUBMISSION` | 2 | 3 | 2 | 3 | `AI_CREDITS_ASSESS_SUBMISSION_BASE`, `_PER_ITEM`, `_IN_1K`, `_OUT_1K` |

`AI_CREDITS_EVIDENCE_REF` overrides the evidence path stored on the seeded rows (default: this file).

## Exact conversion (as implemented in `credits-pricing.ts`)

- **Estimate** (what the teacher confirms, depends only on the request and the active price):
  `estimate = baseCredits + perItemCredits x requestedCount`.
  - `GENERATE_RESOURCE`: `requestedCount` is the requested `itemCount` (1 to 30). 10 questions = 2 + 10 = **12**; 20 questions = **22**; 1 item = **3**.
  - `ASSESS_SUBMISSION`: one job per submission, `requestedCount = 1`, so **5** credits per submission. A request for N submissions confirms `5 x N` as a ceiling; a submission that is skipped (not gradeable, ineligible, already suggested) is not charged.
- **Token cost** (integers, no floating point):
  `tokenCost = ceil((creditsPer1kInputTokens x inputTokens + creditsPer1kOutputTokens x outputTokens) / 1000)`.
- **Charge** on success: `A = ceil(min(estimate, tokenCost) x validCount / requestedCount)`, so `0 <= A <= estimate`.
  - Full valid: `A = min(estimate, tokenCost)`. Token cost above the estimate: `A = estimate`. 1 of 20 valid: rounds up to at least 1.
  - No recorded usage (an assessment suppressed for injection makes no provider call): `tokenCost = 0`, `A = 0`.
- **Refund**: every `FAILED` or `CANCELLED` job, whatever the cause and whatever tokens were spent, returns the full reservation.
- Tokens come from the job's `inputTokens` / `outputTokens` (accumulated over attempts). They are never shown to a teacher.

## Worked examples (assumed token counts, not measurements)

| Case | Assumed tokens (in / out) | estimate | tokenCost | valid / requested | charged | returned |
| --- | --- | --- | --- | --- | --- | --- |
| 10-question quiz, all valid | 2000 / 2500 | 12 | 12 | 10 / 10 | 12 | 0 |
| 10-question quiz, 8 valid | 1500 / 1500 | 12 | 8 | 8 / 10 | 7 | 5 |
| 10-question quiz, 8 valid, long output | 40000 / 20000 | 12 | 140 | 8 / 10 | 10 | 2 |
| 20-question test, 1 valid | 5000 / 3000 | 22 | 19 | 1 / 20 | 1 | 21 |
| One essay submission, verified suggestion | 1500 / 600 | 5 | 5 | 1 / 1 | 5 | 0 |
| One essay submission, injection suppressed | none | 5 | 0 | 1 / 1 | 0 | 5 |
| Provider failure after two attempts | any | 12 | n/a | n/a | 0 | 12 |

## Why these numbers

- A 10-question quiz at 12 credits is the SPEC success-signal example, so the journey and tests read naturally.
- The token rates (2 and 3 credits per 1000 input and output tokens) were picked so that a typical call lands near the
  estimate: roughly 2000 input and 250 output tokens per item for authoring, and roughly 1500 input and 600 output
  tokens per essay submission. These typical sizes are **assumptions** from the prompt and snapshot structure, not logs.
- Estimating high and charging `min(estimate, tokenCost)` means a teacher is never charged above the confirmed value.

## To close with real data (TAI5-T0 stays partly open)

1. Run TAI-01 and TAI-02 for at least one month with the real provider tier that the product owner approves for
   NexaLab's under-18 context (gates G-2 and G-6 are team-lead assumptions today).
2. Export per purpose the p50, p90 and max `inputTokens` and `outputTokens` per item from `AiJob`, with the date range
   and job count, and append them here.
3. Create a new `PricingVersion` (evidence ref pointing to that appendix), have the product owner approve it together
   with the initial grant and the expiry policy, then activate it. Running jobs keep their pinned version.
4. Record the product-owner decisions in this spec's `.memlog.md` (the lead keeps that file).

## Evidence of the code path (tests, not usage)

Unit and in-memory journey tests cover the formula boundaries (`credits-pricing.test.ts`), reserve, settle and refund at
every terminal transition (`credits.lifecycle.test.ts`), the second purpose (`credits.assessment.test.ts`) and the SPEC
journey with reconciliation fault injection (`ai-credits.journey.test.ts`). `scripts/tai05-integration.mjs` is the
real-database version and has not been run.
