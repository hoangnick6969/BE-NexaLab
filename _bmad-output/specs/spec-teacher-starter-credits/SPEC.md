---
id: SPEC-teacher-starter-credits
status: implemented (2026-11-25, verified on an isolated DB — see Verification)
feature: F2 of the 2026-11-25 order F2 (starter credits) → F1 (TAI-08 prompt workspace) → F3 (MoMo/PayPal top-up, UAT demo)
companions:
  - ../spec-teacher-ai-credits/ (TAI-05 ledger, ledger-rules.md)
  - ../spec-teacher-ai-prompt-workspace/SPEC.md
---

# F2 — Every teacher starts with 10 free AI credits

## Tóm tắt (VI)

Mỗi giáo viên được tặng **10 tín dụng AI miễn phí**, đúng **một lần**: giáo viên mới nhận ngay khi admin tạo tài khoản; giáo viên đã có tài khoản nhận ở lần đầu mở trang tín dụng hoặc lần đầu dùng AI. Không bao giờ cấp trùng, kể cả khi nhiều yêu cầu chạy cùng lúc. Lịch sử tín dụng ghi rõ "Quà khởi đầu (miễn phí)", tách khỏi tín dụng admin cấp tay và (sau này) tín dụng mua bằng MoMo/PayPal, để doanh thu F3 không bị lẫn với quà tặng. Tín dụng tặng không hết hạn.

## Why

With `AI_CREDITS_ENABLED=true`, a new teacher has balance 0 and cannot try any AI feature until an admin grants credits by hand. The owner wants every teacher to try Teacher AI immediately. The research round (Antigravity, Codex, Claude, 2026-11-25) also found that a **system** grant cannot rely on the current idempotency guard: `CreditTransaction` has `@@unique([actorId, idempotencyKey])` with nullable `actorId` (`prisma/schema.prisma:1881,1889`), and PostgreSQL treats NULLs as distinct, so two system postings with the same key are both accepted. F2 fixes this once; F3 reuses it for payments.

## Decisions (owner defaults, 2026-11-25)

- Amount: `AI_STARTER_CREDITS` (default 10; 0 turns the feature off). Changing the value later does not top up teachers who already received a starter grant.
- Existing teachers receive it too (lazily, see S-3). No expiry.
- Posted whatever `AI_CREDITS_ENABLED` says; the UI shows it only when credits are enabled (unchanged rule). UAT runs with `AI_CREDITS_ENABLED=true`.

## Contract

### Data (expand-only migration)

- `CreditTransaction.systemKey String? @unique` — idempotency key of a **system** posting (no actor). NULL for every existing row and for admin/teacher postings. PostgreSQL allows many NULLs and enforces uniqueness on non-NULL values, which is exactly what is needed.
- Key formats: `starter:v1:<teacherId>` (F2), reserved for F3: `payment:<provider>:<orderId>`.
- The API derives `origin` from `systemKey`: `starter:` → `STARTER`, `payment:` → `PAYMENT`, otherwise `ADMIN` for GRANT/ADJUST and `null` for RESERVE/SETTLE/REFUND.

### Ledger operation

`grantStarterCredits(tx, teacherId, config): Promise<{ granted: boolean; credits: number }>` in `ai/application/credits-starter.ts`:

1. Return `{ granted: false }` when `config.starterCredits <= 0` or the user is not an active `TEACHER`.
2. `lock(tx, "ai-credits:<teacherId>")` (same lock as reserve and admin postings).
3. If a transaction with `systemKey = starter:v1:<teacherId>` exists → `{ granted: false }`.
4. `post(tx, { kind: "GRANT", actorId: null, reason: "Quà khởi đầu: <n> tín dụng miễn phí", systemKey, entries: [ISSUANCE −n, TEACHER_AVAILABLE +n] })`. `post()` gains an optional `systemKey` input; a unique violation on it is mapped to `LedgerError("DUPLICATE_POSTING")` (last defence; the lock makes it unreachable in normal flow).
5. Audit `ai_credits.starter_grant { teacherId, credits }` with actor `system`.

### Where it is called (revised after Antigravity review, see "Review notes")

`ensureStarterCredits(db, teacherId, config)` is the only entry point outside the ledger:
1. `findUnique({ where: { systemKey } })` **outside** any transaction; if found, return (the common case: one indexed read, no lock, no write transaction).
2. Otherwise `db.$transaction(tx => grantStarterCredits(tx, …), TX_LIMITS)` — its **own** transaction, committed before the caller continues. `grantStarterCredits` ensures `SYSTEM_ISSUANCE` and the teacher accounts with `getAccount` itself (they are not seeded at boot when credits are off), locks `ai-credits:<teacherId>`, re-checks the key under the lock, then posts.

Call sites (all in the `ai` module, so no module imports upwards):
- **S-1 Teacher's first contact:** `GET /me/credits` (the sidebar `TeacherCreditsNav` calls it on every teacher page load, so a new teacher sees 10 credits on first login) and `POST classes/:id/ai-jobs/estimate`. Only when credits are enabled. This is a documented write-on-read exception to TAI-05 "estimate writes nothing": idempotent, at most once per teacher, never visible as a side effect other than the gift itself.
- **S-2 AI job creation:** at the start of every create path, **before** its main transaction: `AiJobsService.create` (GENERATE_RESOURCE), lab challenges, assessment drafts, and `AiAssessmentsService.request` (once, before its per-submission loop). Because the gift commits first, a request that is still too expensive (0 → 10 < 12) returns 402 with `available: 10` and the gift stays.
- **S-3 Admin view:** `GET admin/credits/accounts?teacherId=` calls it for that teacher (credits enabled only), so the admin never sees 0 for a teacher who simply has not logged in yet and does not grant by hand by mistake.
- **S-4 Seed:** `prisma/seed.ts` (outside `src/`, no layering rule) calls `grantStarterCredits` for seeded teachers.
- Not hooked into `users` (`POST admin/users`): `users` sits below `ai` in the import order (`docs/architecture/project-structure.md`), and S-1 already covers a new teacher on first login. No teacher is created any other way (no self-signup, no role change to TEACHER).

### Ledger and lifecycle details

- `post()` gains optional `systemKey`. The duplicate guard is the check **under the lock** (a P2002 aborts the PostgreSQL transaction, so it cannot be caught and continued); the unique index is the last defence and maps to `DUPLICATE_POSTING`.
- `AiCreditsConfig` gains `starterCredits` (`AI_STARTER_CREDITS`, integer 0..1000, default 10).
- Audit: `audit(tx, { actor: null, action: "ai_credits.starter_grant", targetType: "User", targetId: teacherId, after: { credits } })` (system actor is `null`, as in existing system postings).
- `users/application/admin-policy.ts` `deletionBlockers` counts the teacher's credit transactions: a teacher with ledger history cannot be hard-deleted (disable instead), so the append-only ledger never loses an account.
- `credits-reconcile.ts` adds: every `systemKey` posting is a `GRANT` with `actorId = null`; at most one `starter:` key per teacher; every teacher credit account has an existing `User` owner.
- Existing suite `scripts/tai05-integration.mjs` assumes new teachers start at 0 (`poor` → 402, `racer` with 14 credits wins exactly 2 of 6). Its API runs with `AI_STARTER_CREDITS=0`; F2 has its own suite.

### API changes

- `GET /me/credits` — each transaction view gains `origin: "STARTER" | "PAYMENT" | "ADMIN" | null`; the response gains `starterGrant: { credits: number; grantedAt: string } | null`. Shape otherwise unchanged; still `{ enabled: false, … }` when credits are off.
- `GET admin/credits/accounts?teacherId=` history rows gain the same `origin`.
- No new route.

### Frontend

- `/credits`: when `starterGrant` exists, a dismissible welcome banner "Thầy cô đã nhận <n> tín dụng miễn phí để dùng thử Trợ lý AI" (dismissal remembered in `localStorage`, try/catch). History label for `origin = STARTER`: "Quà khởi đầu (miễn phí)"; `ADMIN` GRANT keeps "Được cấp thêm". Empty-state text no longer says only the admin grants credits.
- Sidebar `TeacherCreditsNav` unchanged (already shows the balance).
- Admin `AdminCreditsPanel`: history label "Quà khởi đầu (tự động)" for `STARTER`, so admins see where the 10 came from.
- Text via `defineText({vi, en})`, tokens only.

## Acceptance

1. Admin creates teacher T → T logs in → the sidebar shows "Tín dụng AI · 10"; `/credits` shows 10 available, one history row "Quà khởi đầu (miễn phí)" and the welcome banner. The admin credit panel for T shows 10 even before T logs in.
2. A seeded/existing teacher with no starter grant opens `/credits` → receives 10 exactly once; reload shows still one starter row.
3. 10 parallel `GET /me/credits` + `estimate` calls for a teacher without a grant → exactly one starter transaction, balance +10 (integration test).
4. A teacher who already had admin grants also receives the starter grant once; admin grants keep `origin = ADMIN`.
5. With 10 credits, a fake-provider Quiz of 10 items (estimate 12) is refused with `AI_CREDITS_INSUFFICIENT`; a Quiz of 5 items (estimate 7) runs, settles and the balance drops accordingly; a cancelled job refunds.
6. `AI_STARTER_CREDITS=0` → no grant anywhere. A STUDENT, PARENT, ADMIN or disabled teacher never receives one.
6b. A teacher with 0 credits requesting a 12-credit job gets 402 with `available: 10`, and the 10 credits remain afterwards. Each create path (GENERATE_RESOURCE, DRAFT_LAB_CHALLENGE, GENERATE_ASSESSMENT, ASSESS_SUBMISSION) grants before reserving.
6c. `scripts/tai05-integration.mjs` still passes (run with `AI_STARTER_CREDITS=0`); a teacher with ledger history cannot be hard-deleted.
7. `npm run credits:reconcile` (or the existing reconcile script) reports a balanced ledger after the E2E run.
8. BE lint/tests, FE lint/build/`test:regression` green; Playwright flow with screenshots under `teacher-ai-screenshots/starter-credits/`.

## Tickets (build order: skeleton → backend → E2E)

- **F2-T1 Skeleton (FE, Antigravity):** banner, `origin` labels, empty-state text, admin label, built against the new response shape; screenshots with mocked `/api/me/credits` responses (Playwright route mocks). No backend change.
- **F2-T2 Backend (Codex):** migration `systemKey` (unique), `post()` systemKey support, `credits-starter.ts` (`grantStarterCredits`, `ensureStarterCredits`), call sites S-1..S-4, `origin` + `starterGrant` in teacher and admin views (select `systemKey`), config `AI_STARTER_CREDITS`, deletion blocker, reconcile checks, `AI_STARTER_CREDITS=0` for the TAI-05 suite, unit tests + new `scripts/f2-starter-integration.mjs` for acceptance 2, 3, 4, 6, 6b, 6c.
- **F2-T3 Wire + E2E (Claude):** remove mocks, run on the isolated DB with `AI_CREDITS_ENABLED=true` and the fake provider, Playwright acceptance 1, 2, 5, screenshots, reconcile.

## Review notes (Antigravity, 2026-11-25)

All six findings were checked against the code and accepted: TAI-05 suite assumes a 0 start (run it with `AI_STARTER_CREDITS=0`); `users` must not import `ai` (dropped the user-creation hook, first contact covers it); write-on-read kept but with a pre-check outside any transaction; granting inside `reserve()` would be rolled back by a 402, so the grant commits in its own transaction before each create path; `SYSTEM_ISSUANCE` is not seeded when credits are off (grant creates accounts itself); deletion blocker and reconcile checks added.

## Verification (2026-11-25, isolated loopback Postgres, fake provider)

- Who did what: Antigravity — spec review and UI skeleton (banner, origin labels); Codex — backend (migration, `credits-starter.ts`, call sites, views, reconcile, seed, tests); Claude — spec, review, fixes to the integration fixtures (admin login route, student username), E2E capture.
- `npm run test:f2` passes: once-only, 10 parallel calls → one grant, admin origin, roles/status, 402 keeps the gift. BE lint pass; Vitest 435 passed (1 skipped, pre-existing); route manifest unchanged; layer check shows only the 4 pre-existing session-cache violations. FE lint, build, `test:regression` 95/95 pass.
- Browser E2E (`teacher-ai-screenshots/starter-credits/2-e2e/`): existing teacher gets 10 on first visit; Quiz 10 items (12) blocked up front; Quiz 5 items reserves 7, uses 3, refunds 4 → 7 left; admin sees "Quà khởi đầu (tự động)". `npm run credits:reconcile` OK.
- `npm run test:tai05` (API with `AI_STARTER_CREDITS=0`): every functional check passes. Three pre-existing defects of that never-run suite were found: admin signed in through `/auth/login` (fixed: `/auth/admin/login`), the check-3 undo forced balance 0 (fixed: restores the real balance), the race check required balance 0 although the live runner refunds early (fixed: 2 won, 4 lost, balance within 0..14). Still open: its reconcile-injection step for check 5 sets a cancelled job back to PENDING, which the live runner then picks up, so the report shows check 4 instead of 5 — the suite needs `AI_RUNNER_ENABLED=false` for that step or a different injection.
