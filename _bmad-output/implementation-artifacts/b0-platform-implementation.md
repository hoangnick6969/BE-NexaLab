# B0 Platform — implementation record

- **Spec:** `../specs/spec-b0-platform/SPEC.md`, `tickets.md`
- **Branch:** `feat/b1-teacher-operations` (BE), delivered with Epic B1
- **Status:** done (2026-10-15) — T1–T4 done; verified on isolated local PostgreSQL and shared Supabase development; production unverified

## Tickets

| Ticket | Status | Evidence |
|---|---|---|
| B0P-T1 Stable error envelope | done | `src/errors.ts`; `errors.test.ts`; `b0-integration` 401 UNAUTHENTICATED, 403 FORBIDDEN, 400 VALIDATION_FAILED (no internals), 404 route code, 409 idempotency conflict; A suites unchanged |
| B0P-T2 Allowlisted AuditLog | done | `src/audit.ts` writes inside the business transaction; `b0-integration` on the real DB: forced audit failure rolls the mutation back, sentinel secrets absent, failed validation writes no event; B1 audit coverage in `b1-integration` |
| B0P-T3 Real-dependency harness | done | `scripts/lib/harness.mjs` — env-driven API/DB/browser, dependency banner, evidence tier, SETUP vs PRODUCT failure, SKIP, cleanup; used by `b0-integration`, tier reported by `b1-integration` |
| B0P-T4 Hint provider boundary | done | `src/hint.ts` `requestHint`: read → provider (no transaction/lock) → short locked transaction rechecking session, user status, assignment applicability, latest attempt and level; `hint.test.ts` 6/6; `b0-integration` with a 3 s delayed provider |

## Verification — 2026-10-15

- BE lint/build; Vitest 103/103
- Local PostgreSQL: `npm run test:b0` 13/13 (API with `APP_ENV=test HINT_PROVIDER_TEST_DELAY_MS=3000`: no advisory lock, no idle-in-transaction session and no hint row during the provider call; revoked session → 401 and nothing persisted); `a5-integration` 53/53; `integration` 98/98; `b1-integration` 172/172
- Shared Supabase dev: `test:b0` 13/13 (the idle-in-transaction probe runs only on a local DB because other clients share Supabase; the per-student advisory-lock probe ran)
- Production: unverified

## Notes

- `HINT_PROVIDER_TEST_DELAY_MS` is honoured only when `APP_ENV` is `development`/`test` and `NODE_ENV` is not `production` (max 30 s).
- A changed attempt history while the provider runs returns 409 `HINT_CONTEXT_CHANGED` (retryable); a parallel request's stored hint is returned instead of a second row.
- Admin audit read is C2-T6 by ticket.
