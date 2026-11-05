---
id: SPEC-teacher-ai-credits
status: draft-blocked-on-one-month-tai-01-usage
companions:
  - implementation-contract.md
  - ledger-rules.md
  - tickets.md
  - ../spec-teacher-ai-authoring/implementation-contract.md
  - ../spec-teacher-ai-authoring/job-runtime-and-failure-modes.md
sources: []
---

> **Canonical contract.** This SPEC and the files in `companions:` are the complete, preservation-validated contract for what to build, test, and validate. Source documents listed in frontmatter are for traceability — consult them only if you need narrative rationale or prose color this contract intentionally omits.

# TAI-05 — Teacher AI Usage Runs on an Auditable Credit Ledger

## Why

Teacher AI operations cost very different amounts. Generating a quiz is cheap. Assessing essays or drafting simulations costs more. The product intends to charge teachers by usage. Before any money is involved, NexaLab needs a ledger that tells each teacher the cost up front and never double-charges on retries. A system failure must never cost the teacher anything, and every credit must reconcile. TAI-01 already records token usage per job. TAI-05 turns that into credits through versioned prices.

## Capabilities

- **CAP-1 — Confirmed estimate:** before creating an AI job, the teacher sees its estimated credits and submits the confirmed value. **Success:** create returns 409 `AI_ESTIMATE_CHANGED` when the confirmed value differs from the server estimate under the active price, and creates no job.
- **CAP-2 — Reserve, then settle or refund:** credits are reserved in the job-creation transaction and settled or refunded in the transaction that moves the job to a terminal status. **Success:** every terminal job has exactly one `RESERVE` and exactly one of `SETTLE` or `REFUND`, and no non-terminal job has either.
- **CAP-3 — No overdraft:** available balance never goes negative. **Success:** concurrent creates at the boundary, from tabs, retries or instances, cannot overdraw. This is enforced under the same per-actor lock as TAI-01 quota.
- **CAP-4 — Admin grants and adjustments:** an admin grants credits or posts a signed adjustment with a reason. **Success:** grants and adjustments are idempotent and audited, and an adjustment that would make available balance negative is rejected.
- **CAP-5 — Teacher credit view:** the teacher sees available, reserved and transaction history in credits. **Success:** no teacher response contains raw token counts, provider names or provider prices.
- **CAP-6 — Reconciliation:** a script proves ledger integrity. **Success:** it exits non-zero on any unbalanced transaction, cached-balance drift, terminal job without settlement, or settlement above reservation.

## Constraints

- The ledger is append-only, with double-entry style. Each `CreditTransaction` has entries whose signed integer amounts sum to zero. Entries are the source of truth, and the cached balance is a projection updated in the same transaction.
- Settlement is keyed by `AiJob.id` and runs inside the TAI-01 terminal-transition transaction. There is no separate settlement worker.
- A charge never exceeds the reserved estimate the teacher confirmed. Any `FAILED` or `CANCELLED` job refunds in full.
- Credits complement TAI-01 quota and do not replace it. Daily and concurrency limits remain abuse and provider-rate guards, while credits are the budget. Both are checked in the same create transaction.
- Prices are versioned per AI purpose. A job pins the `pricingVersionId` used at reserve, and activating a new price affects new jobs only.
- `AI_CREDITS_ENABLED=false` leaves TAI-01 behavior exactly as specified, with no estimate field required.
- Prices are set only after at least one month of measured TAI-01 token usage, recorded in a pricing evidence note.
- The one-month measurement gate is a pricing-calibration rule, not permission to expose a teacher-facing AI operation without a cost estimate. The product direction requires estimate-before-run and a reserve before provider work. Resolve whether an internal TAI-01 pilot may run with credits disabled; if not, move the minimum TAI-05 ledger/estimate/reserve path before TAI-01 launch.

## Non-goals

- Payment gateway, card or e-wallet top-up, invoices, tax, or cash refunds. Credits have no cash value.
- School or organization accounts, credit transfer between teachers, or student credits.
- Showing provider token prices or raw token counts to teachers.
- Credit expiry or monthly allowance automation (open question).

## Success signal

With credits enabled, a teacher holding 100 credits confirms a 12-credit estimate. The job succeeds with 8 of 10 items valid and settles at most 10 credits, with the remainder returned. A second job whose provider fails refunds 12 credits. A double-click creates one job and one reserve. The reconciliation script passes, an injected unbalanced entry makes it fail, and the teacher's view never shows tokens.

## Assumptions

- Credits are whole integers. Fractional costs round up per job after proration.
- If a no-charge provider tier is approved for a restricted pilot, provider cost may be zero while credits still act as an internal usage budget. Do not assume this pilot is permitted; provider eligibility is a separate release gate.

## Open Questions

- What initial grant does each pilot teacher receive, and who in the product team approves grants?
- Do credits expire or roll over monthly?
- May TAI-01 run as a restricted, no-credit internal pilot while prices are measured, or must estimate/reserve/refund be implemented before any teacher-facing AI operation? TAI-01 currently excludes credits while this spec waits for a month of usage.
