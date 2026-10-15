# B1 Teacher Operations — implementation record

- **Spec:** `../specs/spec-b1-teacher-operations/SPEC.md`, `tickets.md`; prerequisites `../specs/spec-b0-platform`
- **Branch:** `feat/b1-teacher-operations` (BE + FE), from `origin/main` 46e2c92
- **Status:** in-progress — all tickets T1–T6 review (2026-10-15, round 2). Verified on isolated local PostgreSQL; committed on the branch, not pushed; shared Supabase migrations not applied (needs owner approval); production unverified. The epic moves to done after the suites pass on shared Supabase.
- **Last updated:** 2026-10-15 (round 2)

## Ticket status (audited against code 2026-10-15)

| Ticket | Status | Met | Gaps |
|---|---|---|---|
| B0P-T1 Stable error envelope | review | `src/errors.ts`, contract JSON updated | — |
| B0P-T2 Allowlisted AuditLog | review | `src/audit.ts`, same-transaction write, allowlist + redaction | — |
| B0P-T3 Real-dependency harness | in-progress | B1 harness `scripts/b1-integration.mjs` | Generic B/C harness |
| B0P-T4 Hint provider boundary | backlog | — | LLM call still inside the transaction |
| B1-T1 Class lifecycle | review | Create/edit/archive (confirm, reconciled counts), rotate/disable code, unique active name, uniform 403, audit, idempotency | — |
| B1-T2 Managed enrollment | review | Expand-only migration + `b1:preflight`; provision/enroll/approve/decline/remove; Q-B1-01 rejoin; access by status; evidence kept | Drop `Enrollment.approved` mirror later (contract phase) |
| B1-T3 Secure join code | review | Format, HMAC-only secret, shown once, collision retry (`withFreshJoinCode`), 4 limiter rules, uniform failure, dummy HMAC, idempotent join; integration covers concurrent joins, locator+IP and endpoint+IP aggregates, the account aggregate across three source IPs (127.0.0.1, ::1, LAN), timing medians 6.7–7.3 ms, API log free of secrets | — |
| B1-T4 Teacher content library | review (fixture lane) | Filters incl. KHTN domain and outcome; `CurriculumOutcome` map with coverage per grade × domain (numerator/denominator/gaps; released and fixture maps separate); clone with new IDs; baseline/other-owner read-only; challenge variants with allowlisted parameter ranges evaluated server-side; private assets owner-only; self-review + transcript + range gates; admin-only shared library with named, independent release reviews; preview with text alternatives and readiness; attribution on preview, library and student pathway | External: CF-T5 released map/corpus, Q-C2-04 reviewed ranges, CF-T2 R2 media |
| B1-T5 Assignment targets/lifecycle | review | `AssignmentTarget` snapshot, optional due date, duplicate rule on immutable `contentVersion` + targets + due date, update/archive, MSG-36, lab assignment identity, D3 items in `/me/progress`, **D-B1-01 implemented** | Contract phase only: stop writing/drop `studentIds` mirror |
| B1-T6 Teacher journey verification | review | Integration 172/172 incl. outsider denial on every class/member/assignment/preview route and student-role denial; `POST /users` admin-only and audited; Playwright 8/8 at 4 widths, loading/empty/retryable-error states and the content-library journey | Shared Supabase (pilot) run after migration approval |

## Verification (isolated local PostgreSQL, not Supabase) — 2026-10-15, round 2

- BE lint/build, Vitest 97/97 (new `src/content.test.ts`); FE lint/build
- `scripts/b1-integration.mjs` 172/172 (API with `HOST=::` so `::1` and the LAN address are extra source IPs; `API_LOG_FILE` set for the log check)
- `a5-integration.mjs` 53/53; `integration.mjs` 98/98 with A3 timing re-measured: p95 GET quiz 6.1 ms, GET quiz-attempts 7.8 ms, POST quiz-attempts 17.1 ms (targets 500/500/1000 ms)
- Playwright `tests/b1-teacher-live.spec.ts` 8/8 (Chrome; 390/768/1024/1440 px; loading/empty/error; content library journey)
- Playwright A2/A4 specs 6/7: the remaining `video-completion` "asset video" case fails identically without B1 changes (pre-existing; deferred-work.md)
- `prisma migrate diff` shows the new migration matches the schema (only pre-existing `updatedAt` default drift)
- Preflight + reconciliation on simulated legacy data (round 1)

## Changes from the 2026-10-15 review round

- D-B1-01: standalone LAB assignment attempts skip the lesson A3 gate, carry only the LAB assignment, never complete the lesson lab step (`src/routes.ts`)
- `POST /users` is ADMIN-only and writes `user.create` audit; teachers use `POST classes/:id/students`
- `withFreshJoinCode` retries locator collisions for class create (previously missing) and rotate
- FE `LoadError` with "Thử lại" on every read in the class workspace (no dead-end error state)
- `integration.mjs` A3 check now targets the lesson lab step (403 `STEP_LOCKED`)

## Round 2 changes (2026-10-15) — closing T3/T4/T5

- Migration `20261015120000_b1_content_customization` (expand-only): `Lesson.domain/outcomeCodes/challengeParams/releaseReview`, `Assignment.contentVersion`, table `CurriculumOutcome`
- `src/content.ts`: KHTN domains, `CHALLENGE_PARAMETERS` (ranges `rangeReview: pending` until Q-C2-04), `challengeParamErrors`, `evaluateChallenge`, named release-review gate, `lessonVersion`/`labVersion`, `attribution`
- Routes: `GET teacher/content` (domain/outcome filters, coverage, taxonomy), `GET teacher/content/:id/preview`, `POST lessons/:id/release-reviews` (ADMIN), admin-only `scope: SHARED_LIBRARY` on create, variant challenge step `CHALLENGE` with `${labId}_v-${lessonId}`, attribution in the student pathway, variant challenges hidden from `GET labs`
- Seed: synthetic `FX8-*`/`FX9-*` outcome map and taxonomy on fixture lessons (no reset needed)
- FE: `src/library.tsx` (filters, coverage table, taxonomy/challenge editor, preview, release reviews, attribution); challenge objective in `CircuitPathwayStep`; legacy specs log in at `/login`

## API contract changes

- `POST /classes` → `{ class, joinCode }` (code shown once)
- `POST /classes/:id/assignments` → `{ assignment, recipientCount, message }`
- Publishing teacher-private lessons requires `review`; video materials need a transcript
- Structural edits to a lesson in use → 409 `LESSON_STRUCTURE_LOCKED`
- All errors → `{ statusCode, code, message, details? }`
- Round 2 (additive): `GET /teacher/content` returns `coverage[]` per grade × domain (`releasedBaseline`, `ownPublished`, `fixture` as `{covered,total,gaps}|null`), `outcomes[]`, `taxonomy`; lesson body accepts `domain`, `outcomeCodes`, `challengeParams`; new errors `INVALID_CHALLENGE_PARAMS`, `INVALID_OUTCOME`, `NOT_SHARED_LIBRARY`, `NO_MODEL_TO_REVIEW`

## PO decisions (accepted 2026-10-15)

- **D-B1-01** Standalone LAB assignment may be attempted even if the lesson containing the lab has an unpassed quiz; the attempt counts only for the LAB assignment and never completes the lesson lab step. **Code: implemented 2026-10-15.**
- **D-B1-02** API contract changes accepted; BE and FE ship together, no compatibility shim. **Code: implemented.**
- **D-B1-03** Legacy plaintext join codes stop working; teachers issue a new code once, announced before deploy. **Code: implemented.**

## Deployment checklist

1. `npm run b1:preflight` against the target DB (read-only); resolve any reported rows
2. Owner approval, then `prisma migrate deploy` (applies `20261014120000_b1_teacher_operations` and `20261015120000_b1_content_customization`); `db:seed` without `SEED_RESET_FIXTURES` adds the synthetic outcome map
3. Set `JOIN_CODE_HMAC_KEYS` / `JOIN_CODE_HMAC_KEY_VERSION` (required in production)
4. Re-run `npm run b1:preflight` for post-migration reconciliation
5. Teachers rotate join codes for legacy classes
