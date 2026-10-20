# Project structure

NexaLab is three sibling folders in one workspace. Only the two application folders are git repositories.

```text
NexaLab/
  BE-NexaLab/      NestJS API, Prisma schema, BMAD planning and specs (this repository)
  FE-NexaLab/      React + Vite client
  nexalab-data/    local data processing (textbook OCR and exports); not a repository, never committed
```

## Backend (`src/`)

Feature modules split by layer (adopted 2026-10-21, branch `refactor/be-module-layers`):

```text
src/
  main.ts            bootstrap only (security headers, CORS, Swagger)
  app.module.ts      composition root, imports every module
  common/            global: error envelope, audit, idempotency, rate limits, @Public/@Roles, shared Zod fields, admin paging
  config/            environment guards (database URLs)
  db/                global DbModule: the one Prisma client (Db)
  modules/<feature>/
    interface/       HTTP: controllers, guards, request schemas and API contracts
    application/     use cases and domain rules: services, pure rules, ports (interfaces) for persistence and providers
    infrastructure/  adapters: Prisma repositories, R2/local storage, SMTP, LLM
    <feature>.module.ts   wires the layers through DI ({ provide: PORT, useClass: Adapter })
```

| Module | Responsibility | Controllers |
|---|---|---|
| `health` | Liveness | `HealthController` |
| `storage` | R2 or local object storage (`infrastructure/storage.ts`, see `docs/operations/r2-storage.md`) and the local driver's signed-URL endpoint | `LocalStorageController` |
| `mail` | SMTP delivery (`infrastructure/mail.ts`) | — |
| `auth` | JWT guard (`APP_GUARD`), login/session/refresh, remember-me policy, password change and reset, temporary passwords | `AuthController` |
| `users` | Admin user lifecycle and lifecycle policy; own profile, avatar and UI preferences | `AdminUsersController`, `ProfileController` |
| `curriculum` | Subject/chapter/topic/outcome taxonomy | `CatalogController`, `AdminCurriculumController` |
| `lessons` | Lesson model and steps (`pathway.ts`), authoring, library review, ebook annotations, admin content operations | `LessonsController`, `EbookController`, `AdminLessonsController` |
| `classes` | Classes and join codes, enrollment and roster, assignments and tests, class resources, visibility rules (`class-access.ts`) | `ClassesController`, `EnrollmentsController`, `AssignmentsController`, `ClassResourcesController` |
| `progress` | Progress derivation and projections, activity, evidence; `StudentAccessService` (exported) | `ProgressController` |
| `learning` | Student pathway delivery, quizzes and attempts, assigned work | `LearningController` |
| `labs` | Simulation preview and attempts, hints/tutor (LLM adapter in `infrastructure/llm.ts`), admin simulation versions and packs | `LabsController`, `AdminLabsController` |
| `parents` | Parent link codes, consent, children's progress | `ParentsController` |
| `reports` | Teacher progress board, analytics, evidence review | `ClassProgressController`, `ClassEvidenceController` |
| `assets` | Versioned assets, media inspection, legacy files, admin asset operations | `AssetsController`, `FilesController`, `AdminAssetsController` |
| `content` | Content packs, releases, source policies and ingestion | `AdminContentController` |
| `notifications` | In-app notifications (acc-3). **Reference module for the target shape**: thin controller → `NotificationsService` → `NotificationRepository` port ← `PrismaNotificationRepository`; `application/notify.ts` is the writer other modules call inside their transactions | `NotificationsController` |
| `admin` | Admin console overview and audit log | `AdminController` |

### Layer rules (`npm run check:layers`)

1. `application` never imports `interface` or `infrastructure`; it declares ports and receives adapters through DI
   (or as an explicit argument, e.g. `requestHint(..., explain)`).
2. `infrastructure` never imports `interface`.
3. A module never reaches into another module's `interface` or `infrastructure`; cross-module use goes through the other
   module's `application` (pure rules) or an exported provider. Shared exceptions: `auth/interface/auth.ts` (guard and
   public user shape), `storage/infrastructure/storage.ts` and `mail/infrastructure/mail.ts` (process-wide adapters).
4. `common`, `config` and `db` never import from `modules`.
5. Every constructor parameter of a Nest class uses `@Inject(...)`: the `tsx` dev runtime emits no decorator metadata,
   so an unannotated parameter is `undefined` at runtime although `tsc` and Vitest pass.

Other rules kept from the flat layout: imports go downwards (`common`/`db` ← `auth` ← content domains ← `classes` ←
`progress` ← `learning`/`labs`/`parents` ← `reports`); a controller never imports another controller; only `DbModule`
and `CommonModule` are `@Global()`; `Db` and `RequestRateLimiter` stay single instances.

Conventions:

- Unit tests sit next to the code as `*.test.ts` (Vitest). Integration suites live in `scripts/*-integration.mjs`.
- `scripts/route-manifest.ts src` prints every route with method, path, roles and public flag. Use it before and after a
  refactor: the output must not change. No two routes overlap, so module order does not change route matching.
- `npm run check:layers` before committing backend changes.

Other top-level folders: `prisma/` (schema, migrations, seed), `packages/sim/` (deterministic simulation engine shared with
the frontend), `content/` (release manifests and simulation packs), `tools/nexalab-ingest/` (textbook ingestion tooling),
`docs/` (product, contracts, references), `_bmad/` and `_bmad-output/` (planning, specs, sprint status).

### Known follow-ups

- `classes` (2026-10-21): controllers are thin and delegate to `ClassesService`, `EnrollmentsService`,
  `AssignmentsService` and `ClassResourcesService` in `application`; those services still use `Db` directly, so the
  next step there is repository ports like `notifications`.
- The other modules (except `notifications`) still have controllers that query Prisma through `Db` directly. Move each to the
  reference shape (service in `application`, repository port + Prisma adapter in `infrastructure`) one module at a time,
  keeping `route-manifest` identical: next are `learning/interface/learning.controller.ts` (≈760 lines) and
  `lessons/interface/lessons.controller.ts` (≈570).
- Several `application` files (`asset-versions.ts`, `content-release.ts`, `admin-policy.ts`, `student-access.service.ts`,
  `progress-projection.ts`, `hint.ts`) take `Db` directly; give them repository ports when their module is converted.
