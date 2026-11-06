# TAI-05 — Ordered Vertical Tickets

## TAI5-T0 — Pricing evidence from TAI-01 usage

- After at least one month of TAI-01 in use, export per-purpose token distributions (p50, p90 and max input/output per item). Propose `PricingVersion` values and record them in `_bmad-output/implementation-artifacts/tai-05-pricing-evidence.md`. Record the initial grant and expiry decisions in `.memlog.md`.
- **Accept when:** the evidence note cites the date range and job count; the product owner approves prices, the initial grant and the expiry policy.
- **Depends on:** TAI-T6 (TAI-01 golden evaluation and journey) plus one month of usage.
- **Sequencing decision still open:** the one-month sample can calibrate prices, but TAI-01's no-credit launch conflicts with the product requirement to show an estimate and reserve before each operation. The product owner must explicitly allow an internal pilot without credits or move the minimum ledger path before teacher-facing launch.

## TAI5-T1 — Ledger schema and posting primitives

- Migrations for `CreditAccount`, `CreditTransaction`, `CreditEntry`, `PricingVersion`, the `AiJob` credit columns and the balance CHECK constraints. Add a `post(tx, kind, entries)` helper that asserts the zero sum and updates cached balances.
- **Accept when:** unit and integration tests reject a non-zero-sum posting, a negative teacher balance and a duplicate (`aiJobId`, `kind`); system accounts are seeded idempotently.
- **Depends on:** TAI5-T0.

## TAI5-T2 — Pricing versions and estimate

- Admin pricing routes (draft, activate, retire), estimate function and `POST classes/:id/ai-jobs/estimate`.
- **Accept when:** estimate is deterministic for the same request and price; activation retires the previous price atomically; a job created before activation keeps its pinned price.
- **Depends on:** TAI5-T1.

## TAI5-T3 — Reserve, settle and refund in the AI job lifecycle

- Hook `RESERVE` into TAI-01 create (estimate check, balance check, same lock) and `SETTLE`/`REFUND` into every terminal transition (runner success or failure, cancel, sweeper fail), applying the proration formula. Gate everything behind `AI_CREDITS_ENABLED`.
- **Accept when:**
  - Fixtures cover the full valid, partial valid, tokenCost > estimate and 1-of-20 rounding cases.
  - A provider failure, validation failure, cancel before run and cancel during run each refund in full.
  - A replayed create posts one reserve.
  - Two concurrent creates at the balance boundary let only one through.
  - A reclaimed job settles once.
  - With the flag off, TAI-01 integration tests pass unchanged.
- **Depends on:** TAI5-T2, TAI-01 TAI-T2.

## TAI5-T4 — Admin grants and adjustments

- Grant and adjustment routes with idempotency, reason, audit and admin UI panel.
- **Accept when:** a replayed key posts once; an overdrawing adjustment returns 409; a non-admin is denied; audit rows contain no free-text beyond the reason.
- **Depends on:** TAI5-T1.

## TAI5-T5 — Teacher credit view and estimate confirmation UX

- `GET /me/credits`, generate-form estimate and confirm flow, and the history page.
- **Accept when:** Playwright covers confirm → success, estimate changed → re-confirm, insufficient balance and failure-refund visible in history; no token or provider strings appear in teacher DOM or responses.
- **Depends on:** TAI5-T3.

## TAI5-T6 — Reconciliation script and failure-injection proof

- `npm run credits:reconcile` implementing the checks in `ledger-rules.md`. An integration test injects each class of corruption in a disposable database.
- **Accept when:** a clean ledger exits 0; each injected fault exits non-zero naming the ID; the SPEC success-signal journey passes against a real API and database.
- **Depends on:** TAI5-T3, TAI5-T4.
