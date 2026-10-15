# C2 Admin Operations — Implementation Record

Date: 2026-10-15
Branch: merged to `origin/main` in both repositories (BE HEAD `8de28c0`)
Runtime acceptance: isolated local PostgreSQL 18 + shared-development Supabase runtime + real Nest API + dev SMTP mailbox + Chrome/Vite UI
Scope decision (owner, 2026-10-15): **C2 on the current foundation.** T1, T2, T4, T6 in full; T3 and T5 on the existing lab/challenge and `AssetFile` model, with Content Foundation surfaces (R2, `AssetVersion`, `SourceRegistry`, ingestion, topic packs) deferred until CF-T1..T4 exist.

## Delivered

- **Migration `20261015160000_c2_admin_operations`** (additive): `User.disabledAt`; Lesson quarantine fields; `CurriculumOutcome.status/updatedAt`; new `CurriculumChapter`, `CurriculumTopic`, `SimulationConfigVersion`; `Attempt.configVersionId`; `AssetFile.sha256/scope/status/source/license/quarantine*`. Pre-existing B2 schema drift was deliberately excluded (see deferred work).
- **Admin API (`src/admin.ts`, all `/admin/*`, class-level `@Roles("ADMIN")`).** Legacy admin routes in `routes.ts` (`/users*`, `/subjects` writes, `/admin/labs`, `PUT /labs/:id`) were removed.
- **C2-T1 user lifecycle (`src/admin-policy.ts`)**
  - Paginated (keyset cursor) list with search and role/status filters; detail view with active ownership and deletion eligibility.
  - Admin creates teacher/parent/admin accounts without an admin-known password: a one-time 60-minute setup link is emailed. `password` stays available for automation, and students may still be provisioned into a class.
  - **Disable** is transactional: advisory lock, last-active-admin guard, ownership resolution, `status=disabled`, all sessions revoked, allowlisted before/after audit.
    - Every active class must be explicitly reassigned/archived, every draft or published lesson reassigned/archived (shared: reassigned/quarantined), and every READY asset reassigned/quarantined. Otherwise the call returns 409 `OWNERSHIP_RESOLUTION_REQUIRED` with a problem list and changes nothing.
    - New owners must be active teachers; admins are allowed only for shared items.
  - **Reactivate** requires a reason.
  - **Hard delete** runs only when the eligibility query finds no reference: attempts, quiz attempts, step progress, progress, saved experiments, enrollments, assignment targets, parent links/codes, consents, gate overrides, owned classes/lessons/assets, or audit actor/target rows.
    - The account's own `user.*` lifecycle rows are excluded, so an empty admin-created account can be deleted.
    - Otherwise 409 `DELETE_INELIGIBLE`. A successful delete returns a reconciled dependency report.
  - Self-disable and self-delete return 409 `SELF_ACTION_FORBIDDEN`; the last active admin returns 409 `LAST_ACTIVE_ADMIN`.
- **C2-T2 taxonomy and content**
  - Subjects, chapters, topics and outcomes are created with immutable codes; a duplicate returns 409 (`SUBJECT_EXISTS`, `CHAPTER_EXISTS`, `TOPIC_EXISTS`, `OUTCOME_EXISTS`) instead of the old `upsert` overwrite (R11).
  - Topic → outcome mappings must match the chapter's grade and domain. A mapped outcome cannot be reworded (409 `OUTCOME_IN_USE`, archive instead). Archived outcomes stay on existing lessons but cannot be newly mapped.
  - Content operations (quarantine / release / archive / reassign) require a reason.
    - Quarantine and archive of assigned content first return 409 `ACTIVE_ASSIGNMENTS_WARNING` until acknowledged.
    - A quarantined lesson is unavailable to students, and nobody can edit it (`CONTENT_QUARANTINED`).
    - Admins cannot rewrite a teacher's private lesson body (`PRIVATE_CONTENT_READ_ONLY`).
    - The admin content list shows shared-release blockers; publishing still goes through the B1 named-review gates.
    - No operation touches evidence.
- **C2-T3 simulation versions (`src/simulation-versions.ts`)**
  - Immutable per-lab `SimulationConfigVersion` (draft → active → retired). Parameters are validated against the B1 allowlist/ranges; unknown model, foreign challenge, out-of-range or non-allowlisted keys → 422 `INVALID_SIMULATION_CONFIG`, and extra fields → 400.
  - Golden cases run on the server engine before storage; a mismatch → 422 `GOLDEN_CASE_MISMATCH`.
  - `POST /attempts` evaluates base challenges with the active version and pins `configVersionId` plus the engine version.
  - `GET /admin/attempts/:id/reproduce` re-evaluates a historical attempt with its pinned version.
  - Lab availability and labels are edited with a reason; scientific config changes only through new versions.
- **C2-T4 adult reset and admin login (`src/password-reset.ts`, `src/mail.ts`)**
  - `auth/forgot` answers before lookup or delivery (no existence or timing signal) and stores only the token hash, one live link per account, valid 60 minutes.
  - On delivery failure the token is removed.
  - `auth/reset` consumes atomically: expired, reused, unknown and concurrent second consume all give 400 `RESET_TOKEN_INVALID`. It then revokes every session.
  - Admin "send reset link" replaces the old temporary password returned to the admin.
  - `auth/login` rejects ADMIN (the team's earlier commit) and `auth/admin/login` stays separate. Student reset stays teacher-managed.
- **C2-T5 assets (on `AssetFile`)**
  - Configuration-driven type table (signature + extension + MIME + per-type size) and full SHA-256 on upload.
  - Quarantined files are served only to admins and cannot be attached to lessons.
  - Shared assets need a license and source and are readable by staff.
  - Reassign requires an active teacher or admin.
  - Delete is blocked while any lesson, step or lab references the asset (409 `ASSET_REFERENCED`).
  - Every operation is audited.
- **C2-T6 console and audit explorer**
  - `GET /admin/audit` is paginated and filterable by actor, action prefix, target, outcome and time. Stored diffs are re-filtered through the allowlist, and each read writes an `audit.read` row.
  - `GET /admin/overview` provides dashboard counts.
  - FE `Admin.tsx` was rebuilt with tabs Tổng quan / Người dùng / Phân loại / Nội dung / Mô phỏng / Tệp / Nhật ký.
    - Each tab shows loading, empty, error-with-retry and stale states, and status as text plus icon.
    - Every destructive or privilege-sensitive action opens a reason dialog naming its access and history effect.
    - The disable dialog collects one explicit resolution per owned item, and the version form states golden-case expectations.
- **Tooling**
  - `npm run test:c2` (`scripts/c2-integration.mjs`) and `npm run c2:preflight` (read-only, `RESULT ok|blocked`) were added; `npm run mailbox` is the dev SMTP.
  - `scripts/integration.mjs`, `b1-integration.mjs` and `password-flow.mjs` now use `/admin/*` and the admin login.
  - `integration.mjs` and `a5-integration.mjs` were broken on `main` by B2 (removed `studentId_stepId` key) and C1 (removed student `/parent-code`). Both were repaired.

## Verification (local runtime, 2026-10-15)

| Check | Result |
| --- | --- |
| BE build / lint | pass |
| BE Vitest | 122/122 (adds admin-policy 6, password-reset 4, simulation-versions 5) |
| Fresh DB | all 16 migrations applied; seed passed; `c2:preflight` RESULT ok |
| `test:c2` (real API + PostgreSQL + mailbox) | **80/80**, 1 SKIP (last-active-admin over the API is unreachable because the acting admin is always another active admin; covered by unit test and the advisory lock) |
| C2 p95 (local, 22 reads / 12 mutations) | read 8 ms, mutation 186 ms. Local only; not pilot proof |
| `password-flow.mjs` | 6/6 |
| Regression `test:b0` | 9 pass, provider-delay checks SKIP (API not started with the test delay) |
| Regression `test:b1` | 172 pass; the 5 multi-IP checks SKIP because this API listened on 127.0.0.1 only |
| Regression `test:b2` | 13/13 |
| Regression A1–A3 `integration.mjs` | 95/95 (4 legacy parent-code checks replaced by 1 C1-correct check) |
| Regression `a5-integration` | 53/53 |
| FE lint / build | pass |
| Playwright `c2-admin-live.spec.ts` (Chrome, 390 px) | 1/1: admin login → user search → disable with explicit class resolution → teacher 401 → audit explorer shows the reasoned `user.disable` diff; no horizontal overflow |

### Shared Supabase development (owner-approved, 2026-10-15)

| Check | Result |
| --- | --- |
| `c2:preflight` before | RESULT ok (1 active admin, 15 published lessons, 0 assets; only C2 pending; an old rolled-back 2026-10-12 attempt of `lesson_pathway_completion` with its successful rerun is normal history) |
| `prisma migrate deploy` | `20261015160000_c2_admin_operations` applied |
| `c2:preflight` after | RESULT ok (C2 applied, no simulation version, no pinned attempts) |
| `test:c2` against an API on Supabase | **80/80**, same justified SKIP; tier `shared-development` |
| Cleanup | 0 leftover c2 users/subjects/outcomes/lessons; no active circuit configuration version (restored) |
| `password-flow.mjs` | 6/6 |
| p95 from the dev machine | read 955 ms, mutation 2475 ms: **misses** QR-09 500/1000 ms (same ~176 ms pooler round-trip finding as B1); measure from the pilot region |

### Latest re-acceptance (2026-10-15)

| Check | Result |
| --- | --- |
| BE lint / build | pass |
| BE Vitest | 123/123 pass |
| FE lint / build | pass |
| Shared-development `test:c2` against current API | **80 passed, 1 justified SKIP** (last-active-admin API case; unit/advisory-lock coverage retained) |
| Post-test `c2:preflight` | `RESULT ok`; C2 migration present, one active admin, 14 published + 1 archived lesson, no leftover assets/simulation versions/pinned attempts |
| Cleanup / worktree diff | synthetic records cleaned; `git diff --check` clean; only pre-existing user source edits remain |
| Latest dev-network p95 (22 reads / 12 mutations) | read 1261 ms / mutation 2902 ms — **misses** QR-09 500/1000 ms; pilot/production latency unverified |

This completes C2 for the approved **current-foundation** scope and the code already merged to `origin/main`. Production upload budgets (Q-DATA-01/Q-C2-03), reviewed simulation parameter ranges (Q-C2-04), production migration/release, and pilot-region performance remain release gates. R2, `AssetVersion`, `SourceRegistry`/ingestion, and full topic packs remain explicitly deferred to Content Foundation and are not represented as delivered.

Dependencies named by the suites: API `http://127.0.0.1:4100/api`, PostgreSQL `127.0.0.1:55432`, SMTP mailbox `127.0.0.1:1025`, browser Vite `127.0.0.1:5173`. R2 is not used.

## Not claimed / external gates

- Production: not migrated or verified. Run `npm run c2:preflight`, then `prisma migrate deploy`, then `c2:preflight` again.
- Pilot/production latency and deployment remain unverified.
- Content Foundation dependencies are deferred (see `deferred-work.md`): R2 object storage, `AssetVersion`, `SourceRegistry`, ingestion runs/items, dry-run/release receipts, and full topic-pack versions.
- Release gates still apply: Q-DATA-01 / Q-C2-03 (production upload budgets; current type limits are development values), Q-C2-04 (per-template parameter ranges), and C1 consent copy.
- Admin identity is never recorded as a scientific or rights review. The B1 named-review route stays as is: reviewer = acting account, and subject ≠ rights.
