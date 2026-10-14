# B1 Teacher Operations — implementation record

- **Spec:** `../specs/spec-b1-teacher-operations/SPEC.md`, `tickets.md`; prerequisites `../specs/spec-b0-platform`
- **Branch:** `feat/b1-teacher-operations` (BE + FE), from `origin/main` 46e2c92
- **Status:** in-progress — re-audited 2026-10-15: T1, T2, T3, T5, T6 review; T4 in-progress (Content Foundation). Verified on isolated local PostgreSQL only; uncommitted; shared Supabase migration not applied; production unverified
- **Last updated:** 2026-10-15

## Ticket status (audited against code 2026-10-15)

| Ticket | Status | Met | Gaps |
|---|---|---|---|
| B0P-T1 Stable error envelope | review | `src/errors.ts`, contract JSON updated | — |
| B0P-T2 Allowlisted AuditLog | review | `src/audit.ts`, same-transaction write, allowlist + redaction | — |
| B0P-T3 Real-dependency harness | in-progress | B1 harness `scripts/b1-integration.mjs` | Generic B/C harness |
| B0P-T4 Hint provider boundary | backlog | — | LLM call still inside the transaction |
| B1-T1 Class lifecycle | review | Create/edit/archive (confirm, reconciled counts), rotate/disable code, unique active name, uniform 403, audit, idempotency | — |
| B1-T2 Managed enrollment | review | Expand-only migration + `b1:preflight`; provision/enroll/approve/decline/remove; Q-B1-01 rejoin; access by status; evidence kept | Drop `Enrollment.approved` mirror later (contract phase) |
| B1-T3 Secure join code | review | Format, HMAC-only secret, shown once, collision retry (`withFreshJoinCode`), 4 limiter rules, uniform failure, dummy HMAC, idempotent join; integration covers concurrent joins, locator+IP and endpoint+IP aggregates across accounts and a second IP, timing medians 7.8–9.8 ms, API log free of secrets | Account rule across 3+ IPs unit-tested only |
| B1-T4 Teacher content library | in-progress | Library filters (grade/subject/chapter/topic/text/scope/status), coverage without fake %, clone with new IDs, baseline/other-owner read-only, self-review + transcript gate, D7 lock | No domain/outcome filter or denominator (CF-T5); no challenge/parameter customization or private asset upload; no reviewer/model/scientific-range gate or shared-library workflow; no preview fallback; attribution not rendered |
| B1-T5 Assignment targets/lifecycle | review | `AssignmentTarget` snapshot, optional due date, duplicate rule, update/archive, MSG-36, lab assignment identity, D3 items in `/me/progress`, **D-B1-01 implemented** | Duplicate rule uses lessonId/labId (D7 lock stands in for a version); `studentIds` mirror still written (contract phase) |
| B1-T6 Teacher journey verification | review | Integration 137/137 incl. outsider denial on every class/member/assignment route and student-role denial; `POST /users` admin-only and audited; Playwright 6/6 at 4 widths plus loading/empty/retryable-error states | Pilot evidence after migration approval |

## Verification (isolated local PostgreSQL, not Supabase) — 2026-10-15

- BE lint/build, Vitest 89/89; FE lint/build
- `scripts/b1-integration.mjs` 137/137 (API started with `HOST=::` so `::1` acts as a second source IP; `API_LOG_FILE` set for the log check)
- `a5-integration.mjs` 53/53; `integration.mjs` 98/98 (`RUN_A3_TIMING_SAMPLES=false`)
- Playwright `tests/b1-teacher-live.spec.ts` 6/6 (Chrome channel; 390/768/1024/1440 px; loading/empty/error states)
- Preflight + reconciliation on simulated legacy data

## Changes from the 2026-10-15 review round

- D-B1-01: standalone LAB assignment attempts skip the lesson A3 gate, carry only the LAB assignment, never complete the lesson lab step (`src/routes.ts`)
- `POST /users` is ADMIN-only and writes `user.create` audit; teachers use `POST classes/:id/students`
- `withFreshJoinCode` retries locator collisions for class create (previously missing) and rotate
- FE `LoadError` with "Thử lại" on every read in the class workspace (no dead-end error state)
- `integration.mjs` A3 check now targets the lesson lab step (403 `STEP_LOCKED`)

## API contract changes

- `POST /classes` → `{ class, joinCode }` (code shown once)
- `POST /classes/:id/assignments` → `{ assignment, recipientCount, message }`
- Publishing teacher-private lessons requires `review`; video materials need a transcript
- Structural edits to a lesson in use → 409 `LESSON_STRUCTURE_LOCKED`
- All errors → `{ statusCode, code, message, details? }`

## PO decisions (accepted 2026-10-15)

- **D-B1-01** Standalone LAB assignment may be attempted even if the lesson containing the lab has an unpassed quiz; the attempt counts only for the LAB assignment and never completes the lesson lab step. **Code: implemented 2026-10-15.**
- **D-B1-02** API contract changes accepted; BE and FE ship together, no compatibility shim. **Code: implemented.**
- **D-B1-03** Legacy plaintext join codes stop working; teachers issue a new code once, announced before deploy. **Code: implemented.**

## Deployment checklist

1. `npm run b1:preflight` against the target DB (read-only); resolve any reported rows
2. Owner approval, then `prisma migrate deploy`
3. Set `JOIN_CODE_HMAC_KEYS` / `JOIN_CODE_HMAC_KEY_VERSION` (required in production)
4. Re-run `npm run b1:preflight` for post-migration reconciliation
5. Teachers rotate join codes for legacy classes
