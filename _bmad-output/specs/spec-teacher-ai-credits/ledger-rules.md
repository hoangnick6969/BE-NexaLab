# Ledger Rules

## Accounts

| Account kind | Owner | Allowed balance |
| --- | --- | --- |
| `TEACHER_AVAILABLE` | one per teacher | ≥ 0 (DB CHECK) |
| `TEACHER_RESERVED` | one per teacher | ≥ 0 (DB CHECK) |
| `SYSTEM_ISSUANCE` | singleton | any (negative = credits issued) |
| `SYSTEM_CONSUMED` | singleton | any (positive = credits spent) |

Teacher accounts are created lazily on first grant or first estimate, inside the same transaction.

## Postings

Amounts are positive integers E (estimate), A (charge) and G (grant). A posting is applied atomically with its balance projections.

| Kind | Trigger | Entries |
| --- | --- | --- |
| `GRANT` | admin grant | ISSUANCE −G, AVAILABLE +G |
| `ADJUST` | admin signed adjustment g | ISSUANCE −g, AVAILABLE +g; rejected if AVAILABLE would be < 0 |
| `RESERVE` | AiJob create | AVAILABLE −E, RESERVED +E |
| `SETTLE` | job → `SUCCEEDED` | RESERVED −E, CONSUMED +A, AVAILABLE +(E−A) |
| `REFUND` | job → `FAILED` or `CANCELLED` | RESERVED −E, AVAILABLE +E |

Invariants:
- Σ entries per transaction = 0.
- For each job: one `RESERVE`, and one of `SETTLE` or `REFUND`, never both. This is enforced by a unique (`aiJobId`, `kind`) index and a check under the job row lock in code.
- 0 ≤ A ≤ E.

## Estimate and charge

The active `PricingVersion` for the job purpose supplies `baseCredits`, `perItemCredits`, `creditsPer1kInputTokens` and `creditsPer1kOutputTokens`.

- `estimate = baseCredits + perItemCredits × requestedCount`. This depends only on the request and the price, so the server can recompute it on create.
- `tokenCost = ⌈creditsPer1kInputTokens × inputTokens / 1000 + creditsPer1kOutputTokens × outputTokens / 1000⌉`
- `A = ⌈min(estimate, tokenCost) × validCount / requestedCount⌉`. A job that succeeds with 0 valid items cannot happen, because TAI-01 fails it instead.

Boundary fixtures:
- validCount = requestedCount → A = min(E, tokenCost).
- tokenCost > E → A = E.
- validCount = 1 of 20 → proration rounds up to ≥ 1.

## Concurrency

The create transaction takes the TAI-01 per-actor advisory lock, then checks quota, recomputes and compares the estimate, checks `AVAILABLE ≥ E`, inserts the `AiJob` and posts `RESERVE`. Terminal transitions lock the job row (`SELECT … FOR UPDATE`) before posting `SETTLE` or `REFUND`. Admin grants lock the teacher's account rows.

## Reconciliation (`npm run credits:reconcile`)

The script fails with a non-zero exit and lists the offending IDs when any of the following holds:
1. A transaction whose entries do not sum to zero.
2. An account whose cached balance ≠ Σ of its entries.
3. A teacher account with a negative balance.
4. A terminal `AiJob` with credits enabled that is missing `SETTLE`/`REFUND`, or has both.
5. A non-terminal job that has `SETTLE` or `REFUND`.
6. A `SETTLE` with A > E.
7. A job pinned to a price that does not exist.

The script only reads. A repair is a new `ADJUST` with a reason, never an edit.
