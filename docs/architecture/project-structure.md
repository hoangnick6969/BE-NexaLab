# Project structure

NexaLab is three sibling folders in one workspace. Only the two application folders are git repositories.

```text
NexaLab/
  BE-NexaLab/      NestJS API, Prisma schema, BMAD planning and specs (this repository)
  FE-NexaLab/      React + Vite client
  nexalab-data/    local data processing (textbook OCR and exports); not a repository, never committed
```

## Backend (`src/`)

Each domain folder is one Nest module (`<domain>.module.ts`) that owns its controllers, providers, pure rules and their unit
tests. Admin routes keep their `/admin/...` URLs but live in the module of the domain they manage (`Admin<Domain>Controller`).
`app.module.ts` only composes modules; `main.ts` only bootstraps (security headers, CORS, Swagger).

| Module | Responsibility | Controllers | Providers / exports |
|---|---|---|---|
| `infra/` (global) | Prisma client, database URL guards, SMTP, object storage (R2 or local) and the local driver's signed-URL endpoint, health | `HealthController`, `LocalStorageController` | `Db` (exported) |
| `common/` (global) | Error envelope, audit log, idempotency, join/request rate limits, `@Public`/`@Roles`, shared Zod fields, `/admin` input and keyset pagination (`admin-api.ts`) | — | `RequestRateLimiter` (exported) |
| `auth/` | JWT guard (registered as `APP_GUARD`), login/session/refresh, password change and reset, temporary passwords | `AuthController` | `AuthGuard` |
| `users/` | Admin user lifecycle: create, edit, disable with ownership resolution, reactivate, delete, reset links; lifecycle policy | `AdminUsersController` | — |
| `curriculum/` | Subject/chapter/topic/outcome taxonomy: public catalog and admin curation | `CatalogController`, `AdminCurriculumController` | — |
| `lessons/` | Lesson model and steps (`pathway.ts`), authoring, library review and coverage, ebook annotations, admin content operations | `LessonsController`, `EbookController`, `AdminLessonsController` | — |
| `classes/` | Classes and join codes, enrollment and roster, assignments, assignment visibility rules (`class-access.ts`) | `ClassesController`, `EnrollmentsController`, `AssignmentsController` | — |
| `progress/` | Progress derivation and projections, activity history, evidence reads; student visibility rules | `ProgressController` | `StudentAccessService` (exported) |
| `learning/` | Student pathway delivery: reading/video/cards progress, quizzes and attempts, assigned work | `LearningController` | imports `ProgressModule` |
| `labs/` | Simulation preview and attempts, hints/tutor, saved experiments; admin simulation versions, practicals, sim packs | `LabsController`, `AdminLabsController` | imports `ProgressModule` |
| `parents/` | Parent link codes, consent, linked children and their progress | `ParentsController` | imports `ProgressModule` |
| `reports/` | Teacher reports: assignment progress board, analytics, evidence review with support flags | `ClassProgressController`, `ClassEvidenceController` | — |
| `assets/` | Versioned assets: upload/finalize/read grants (`asset-versions.ts`), media inspection, legacy files, admin asset operations | `AssetsController`, `FilesController`, `AdminAssetsController` | — |
| `content/` | Content packs, coverage, releases, source policies and ingestion | `AdminContentController` | — |
| `admin/` | Admin console shell: overview counts and the audit log | `AdminController` | — |

### Dependency rules

Imports go downwards only; this is checked by the import graph (no file cycles, one documented folder exception):

```text
infra, common            ← everything
auth                     ← every domain below
curriculum, lessons, assets, content, users
classes                  (assignments pin lesson/lab versions from lessons)
progress                 (StudentAccessService: assignment rules + pathway + derived completion)
learning, labs, parents  (inject StudentAccessService via ProgressModule)
reports                  (reads progress, labs tutor misconceptions, classes)
admin                    (common, infra only)
```

- Known exception: `lessons/lessons.controller.ts` filters the student lesson list with `classes/class-access.ts`, while
  `classes/assignments.controller.ts` reads lesson versions. Both are pure helpers, not module imports.
- A controller never imports another controller. Code shared by several controllers is a provider (`StudentAccessService`,
  `RequestRateLimiter`) or a plain module (`*-common.ts`, `class-access.ts`, `asset-versions.ts`, `lesson-moderation.ts`).
- Only `infra` and `common` are `@Global()`. Any other cross-module provider must be exported by its module and imported
  explicitly (today only `ProgressModule` → `StudentAccessService`).
- `Db` stays one instance (one connection pool) and `RequestRateLimiter` one instance (shared login/attempt buckets).

Conventions:

- Unit tests sit next to the code as `*.test.ts` (Vitest). Integration suites live in `scripts/*-integration.mjs`.
- `scripts/route-manifest.ts src` prints every route with method, path, roles and public flag. Use it before and after a
  refactor: the output must not change. No two routes overlap, so module order does not change route matching.

Other top-level folders: `prisma/` (schema, migrations, seed), `packages/sim/` (deterministic simulation engine shared with
the frontend), `content/` (release manifests and simulation packs), `tools/nexalab-ingest/` (textbook ingestion tooling),
`docs/` (product, contracts, references), `_bmad/` and `_bmad-output/` (planning, specs, sprint status).

### Known follow-ups

- Controllers still query Prisma directly through `Db`; services per domain (thin controllers) are the next step, starting
  with `classes`, `users` and `progress`.
- Largest handlers files: `lessons/lessons.controller.ts` (≈570 lines), `classes/enrollments.controller.ts` (≈490),
  `learning/learning.controller.ts` (≈460).
