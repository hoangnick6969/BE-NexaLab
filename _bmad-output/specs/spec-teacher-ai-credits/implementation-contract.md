# TAI-05 Implementation Contract

## Current evidence and required delta

TAI-01 creates an `AiJob` under a per-actor advisory lock with quota checks. It records `inputTokens`/`outputTokens` and moves jobs to terminal states through conditional transactions in the runner and the cancel route (`job-runtime-and-failure-modes.md`). `IdempotencyRecord`, `idempotent()` and `audit()` exist, and admin routes live in the owning domain module (`Admin<Domain>Controller`). TAI-05 adds a `credits` application area inside `src/modules/ai` (or its own module if layering requires), new tables, hooks in the TAI-01 create and terminal transactions, and an admin controller. The TAI-01 behavior is unchanged when `AI_CREDITS_ENABLED=false`.

## Data contract

```prisma
enum CreditAccountKind { TEACHER_AVAILABLE TEACHER_RESERVED SYSTEM_ISSUANCE SYSTEM_CONSUMED }
enum CreditTxKind { GRANT ADJUST RESERVE SETTLE REFUND }

model CreditAccount {
  id        String            @id @default(cuid())
  kind      CreditAccountKind
  ownerId   String?           // teacher id; null for system accounts
  balance   Int               @default(0) // cached projection of entries
  createdAt DateTime          @default(now())
  entries   CreditEntry[]

  @@unique([kind, ownerId])
}

model CreditTransaction {
  id               String       @id @default(cuid())
  kind             CreditTxKind
  aiJobId          String?
  pricingVersionId String?
  actorId          String?      // admin for GRANT/ADJUST, teacher for RESERVE, null (system) for SETTLE/REFUND
  reason           String?      // required for GRANT/ADJUST
  idempotencyKey   String?
  createdAt        DateTime     @default(now())
  entries          CreditEntry[]

  @@unique([aiJobId, kind])
  @@unique([actorId, idempotencyKey])
  @@index([createdAt])
}

/// Immutable. Amounts are signed integers; entries of one transaction sum to zero.
model CreditEntry {
  id            String            @id @default(cuid())
  transactionId String
  transaction   CreditTransaction @relation(fields: [transactionId], references: [id])
  accountId     String
  account       CreditAccount     @relation(fields: [accountId], references: [id])
  amount        Int

  @@index([accountId])
}

model PricingVersion {
  id                       String    @id @default(cuid())
  purpose                  String    // matches AiJob.purpose
  version                  Int
  baseCredits              Int
  perItemCredits           Int
  creditsPer1kInputTokens  Int
  creditsPer1kOutputTokens Int
  evidenceRef              String    // path to pricing evidence note
  status                   String    @default("draft") // draft | active | retired
  createdById              String
  createdAt                DateTime  @default(now())
  activatedAt              DateTime?
  retiredAt                DateTime?

  @@unique([purpose, version])
}
```

- The migration adds `CHECK (balance >= 0)` for teacher account kinds, written as raw SQL in the migration.
- `AiJob` gains `pricingVersionId String?`, `estimatedCredits Int?` and `chargedCredits Int?` (expand-only, null when credits are disabled).
- No route updates or deletes entries, transactions or active prices.

## HTTP contract

| Operation | Roles | Contract |
| --- | --- | --- |
| `POST classes/:id/ai-jobs/estimate` | TEACHER (owner) | Same body as TAI-01 create. Returns `{ credits, pricingVersion, available }`. Writes nothing. |
| `POST classes/:id/ai-jobs` (TAI-01) | TEACHER | When credits are enabled, the body adds required `confirmedCredits`. Mismatch returns 409 `AI_ESTIMATE_CHANGED` with the new estimate. Insufficient balance returns 402 `AI_CREDITS_INSUFFICIENT`. Success posts `RESERVE` in the create transaction. |
| `GET /me/credits` | TEACHER | `{ available, reserved, transactions: [{ id, kind, credits, jobId, createdAt }] }`, cursor-paginated, newest first. No tokens. |
| `GET admin/credits/accounts?teacherId=` | ADMIN | Balances and recent transactions for one teacher. |
| `POST admin/credits/accounts/:teacherId/grants` | ADMIN | `Idempotency-Key` required. Body `{ credits > 0, reason (5–500) }`. |
| `POST admin/credits/accounts/:teacherId/adjustments` | ADMIN | `Idempotency-Key` required. Body `{ credits ≠ 0, reason }`. A negative result returns 409 `CREDIT_BALANCE_NEGATIVE`. |
| `GET admin/credits/pricing` / `POST admin/credits/pricing` / `POST admin/credits/pricing/:id/activate` | ADMIN | Create a draft price (requires `evidenceRef`) and activate it. Activation retires the previous active price for that purpose in one transaction. |

Terminal settlement has no route. It runs inside TAI-01 transitions (runner persist, cancel and sweeper fail).

## Error codes

| HTTP | Code | When |
| --- | --- | --- |
| 400 | `VALIDATION_FAILED` | Bad body, or missing `confirmedCredits` when enabled |
| 402 | `AI_CREDITS_INSUFFICIENT` | `available < estimate`; includes `available`, `required` |
| 404 | `NOT_FOUND` | Unknown teacher, price or class |
| 409 | `AI_ESTIMATE_CHANGED` | Confirmed value differs; includes the new `credits` |
| 409 | `CREDIT_BALANCE_NEGATIVE` | Adjustment would overdraw |
| 409 | `PRICING_NOT_ACTIVE` | No active price for the purpose while credits are enabled (create also refused) |
| 409 | `IDEMPOTENCY_KEY_REUSED` | Existing helper |

## Audit

| Action | `after` allowlist |
| --- | --- |
| `credits.grant` / `credits.adjust` | `teacherId, credits, balanceAfter` (reason in `reason`) |
| `credits.pricing.create` / `.activate` | `purpose, version, baseCredits, perItemCredits, evidenceRef` |
| `ai_job.complete` (TAI-01) | adds `chargedCredits` or `refundedCredits` |

`RESERVE`, `SETTLE` and `REFUND` are ledger rows themselves and are not duplicated into `AuditLog`.

## Frontend contract

The TAI-01 generate form calls estimate on change (debounced) and shows "≈ N tín dụng — còn M". Submit sends `confirmedCredits`. On `AI_ESTIMATE_CHANGED` the form shows the new value and asks again, and on 402 it shows the balance. The teacher header or settings shows available credits with a history page. The admin user detail gains a credits panel with grant and adjust forms that require a reason. Tokens and provider names never render outside admin pricing.
