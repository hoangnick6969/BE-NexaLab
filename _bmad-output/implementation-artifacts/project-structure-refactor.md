# Project structure refactor — implementation record

Branch `refactor/project-structure` in BE (from main 5446e68) and FE (from main 3ed54cb). Uncommitted; behaviour-preserving moves only.
Target layout and conventions: [BE](../../docs/architecture/project-structure.md), FE `docs/architecture/project-structure.md`,
workspace `../README.md` (outside git).

## 2026-10-16

### Backend

- 46 files moved with `git mv` from flat `src/` into domain folders (`auth`, `lessons`, `learning`, `labs`, `progress`, `parents`,
  `classes`, `ebook`, `assets`, `content`, `admin`, `common`); relative imports rewritten in `src/`, `scripts/`, `tools/`, `prisma/`.
- `routes.ts` (2382 lines, 57 routes) split by route into nine controllers: `HealthController`, `AuthController`, `EbookController`,
  `CatalogController`, `LessonsController`, `LearningController`, `LabsController`, `ProgressController`, `ParentsController`,
  `ClassProgressController`. Handler bodies are verbatim. No handler called another handler.
- Helpers used by several controllers became providers: `StudentAccessService` (`applicableLessonAssignment`, `lessonStarted`,
  `studentPathway`, `retryGuidance`, `readableStudent`) and `RequestRateLimiter` (`rate`). Both are singletons, so the in-memory
  login/attempt rate buckets stay shared exactly as in the former single controller.
- Module-level definitions from `routes.ts` moved to `common/validation.ts`, `lessons/lesson-schema.ts`, `parents/parent-codes.ts`.
- `AppModule` extracted to `app.module.ts`; `B2Controller` renamed `ClassEvidenceController`; `b2-support` → `classes/evidence-support`;
  `content.ts` → `lessons/lesson-content.ts`.
- New `scripts/route-manifest.ts`: prints method, path, roles, public flag, argument count and handler for every route.

### Frontend

- 18 files moved into `app/`, `lib/`, `components/`, `features/<domain>/`; `App.tsx` (1180 lines) and `pages.tsx` (1290 lines) split
  into `app/App.tsx`, `features/auth/Login`, `features/dashboard/Dashboard`, `features/labs/{LabLibrary,lab-info}`,
  `components/PageHeading`, `features/lessons/Lessons`, `features/learning/{AssignedLearning,StudentAssignments}`,
  `features/progress/ProgressPage`, `features/saved/Saved`, `features/settings/SettingsPage`.
- `queryClient` moved to `app/query-client.ts`, removing the `main.tsx` ↔ `App.tsx` import cycle. The unused
  `AdminPage` re-export in `pages.tsx` was dropped (App lazy-loads Admin directly).
- The API client is `lib/api.ts`, not `api/client.ts`: a Playwright run showed that in Vite dev mode `/src/api/client.ts` matched the
  test mock `**/api/**` and the page loaded JSON instead of a module (blank page). Production bundles were never affected.

### Verification

- Route manifest before/after: 140 routes, identical (`diff` empty). Swagger on the running API: 140 operations; Nest DI resolves.
- BE: `tsc` 0, Vitest 145/145 (same count as main), `npm run lint`, clean `npm run build` pass.
- BE integration on local Postgres (`nexalab_c2`, API from this branch): B0 9 + 2 skipped, B2 13/13, C2 80 + 1 skipped, CF 60/60,
  password flow pass. `test:integration` (student.temp no longer requires a password change) and B1 (chemistry objective text) fail —
  and fail identically when the same suites run against an API started from main on the same database, so they are local
  fixture state, not regressions.
- FE: `tsc` 0, build pass. Playwright (circuit, progress-history, study-cards, reading, quiz-learning, video) on main vs this branch
  against the same backend data: every failure on this branch also fails on main (6 shared, data-dependent); none is new.
- Pre-existing, unchanged: three type errors in `tools/nexalab-ingest/{attach_ui_test_video,seed_chapter_ui_test}.ts` (also on main);
  14 lines of `prisma migrate diff` drift unrelated to this work.

## 2026-10-17 — pass 2: one Nest module per domain

Review feedback: pass 1 grouped files into folders but kept one `AppModule`, an `admin/` folder organised by role (eight
domains in one 1535-line controller), a 1225-line `classes` controller, a grab-bag `common/` and two-way domain imports.

- 15 modules: global `InfraModule` (`Db`, health, local storage endpoint) and `CommonModule` (`RequestRateLimiter`);
  `Auth` (APP_GUARD), `Users`, `Curriculum`, `Lessons`, `Classes`, `Progress` (exports `StudentAccessService`),
  `Learning`/`Labs`/`Parents` (import `ProgressModule`), `Reports`, `Assets`, `Content`, `Admin`. `app.module.ts` only composes.
- `admin.controller.ts` split by domain, URLs unchanged: `AdminUsersController` (users), `AdminCurriculumController`
  (curriculum), `AdminLessonsController` (lessons), `AdminLabsController` (labs), `AdminAssetsController` (assets),
  `AdminContentController` (content); `AdminController` keeps overview + audit. Shared admin inputs and keyset pagination
  → `common/admin-api.ts`; `lessonOperationData` (used by user disabling and content operations) → `lessons/lesson-moderation.ts`.
- `classes.controller.ts` split into `ClassesController`, `EnrollmentsController`, `AssignmentsController` + `class-common.ts`;
  teacher reports (`ClassProgressController`, `ClassEvidenceController`, `evidence-support`) → new `reports/`.
- `assets.controller.ts`: helpers other files imported from a controller → `asset-versions.ts`; `LocalStorageController` → `infra/`.
- Moves: `common/{db,database-config,mail}` and `assets/storage` → `infra/`; `common/access` → `classes/class-access`;
  `admin/admin-policy` → `users/`; `lessons/catalog.controller` → `curriculum/`; `ebook/` → `lessons/`;
  `learning/pathway` → `lessons/` (lesson step model); `learning/student-access.service` → `progress/`;
  `temporaryPassword` (was exported by a controller) → `auth/temporary-password.ts`; `@Public`/`@Roles` → `common/decorators.ts`.
- Dead code dropped: `uploadRoot` and its `unlink`/`resolve` imports in the former admin controller (unused on main too).
- Import graph: no file cycles; domain imports go one way except `classes ↔ lessons` through two pure helpers (documented).

Verification (pass 2): handler bodies compared line-multiset old vs new — only class shells, the moved helper and
`uploadRoot` differ. Route manifest 140/140 identical to the main `routes.ts` manifest; API boots with 24 controllers,
140 mapped routes, 140 Swagger operations. `tsc`, lint, clean build, Vitest 145/145. Integration (local `nexalab_c2`):
B0 9 + 2 skipped, B2 13/13, C2 80 + 1 skipped, CF 60/60, password flow 6/6; B1 stops after 125 PASS at the chemistry
objective check and `test:integration` at the student.temp password-change check — the same pre-existing failures as on
main (see 2026-10-16). Run twice: after the controller split and after the final moves.

### Open

- Services per domain (controllers still query Prisma through `Db`), starting with `classes`, `users`, `progress`.
- FE `features/admin/Admin.tsx`, `features/classes/classes.tsx`, `features/lessons/Lessons.tsx` are still large.
- The paused textbook work (`feat/textbook-lesson-extract`, stashed) still targets the old flat paths (`tools/` only imports
  `src/database-config` and `src/storage`); rebase it onto this branch and change them to `src/infra/database-config` and
  `src/infra/storage`.
