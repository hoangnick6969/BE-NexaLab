# NexaLab workspace context

- This product spans sibling repositories in one workspace: `BE-NexaLab` (NestJS 11, TypeScript, Node.js, PostgreSQL/Prisma) and `FE-NexaLab` (React 18, TypeScript, Vite); `nexalab-data/` beside them is local textbook/OCR processing and is not a repository. Layout: `docs/architecture/project-structure.md`.
- Backend code lives in domain folders under `src/`, one Nest module each (`auth`, `users`, `curriculum`, `lessons`, `classes`, `progress`, `learning`, `labs`, `parents`, `reports`, `assets`, `content`, `admin`, plus global `infra` and `common`). Admin routes live in the module of the domain they manage (`Admin<Domain>Controller`). Imports only go down the layering in `docs/architecture/project-structure.md`; a controller never imports another controller. `app.module.ts` only composes modules, `main.ts` only bootstraps. The deterministic shared simulation package and unit tests are in `packages/sim/`; schema, migrations and seed are in `prisma/`. Frontend pages live in `src/features/<domain>/` with the router in `src/app/App.tsx`; Playwright cases are in `tests/`.
- Before and after moving backend code, run `npx tsx scripts/route-manifest.ts src`; the route list (method, path, roles, public flag) must not change.
- Backend commands: `npm run dev`, `npm run lint`, `npm test`, `npm run build`; integration requires a running seeded API/database (`npm run test:integration`). Frontend commands (run from `../FE-NexaLab`): `npm run dev`, `npm run lint`, `npm run build`, `npm run test:e2e` (requires the configured app/backend and Playwright browser).
- Validate request bodies with Zod and enforce roles at backend routes. Treat backend simulation results as authoritative; the server recomputes them. Keep `packages/sim` deterministic and version its tarball when syncing it to the frontend.
- Student AI is advisory (AD-18, `_bmad-output/specs/spec-student-ai-llm/SPEC.md`): rules choose the step and level and give the fallback text; the LLM (`src/modules/student-ai`, Anthropic or the dev/test `fake` adapter) writes the wording and the SAI-04 tutor chat replies, only with `APP_ENV` development/test and `STUDENT_AI_LLM_ENABLED=true` until gate SG-2 closes. Without credentials everything still works rules-only. `npm run eval:student-ai` scores the SG-4 safety set (no database; `--provider anthropic --allow-external` only with owner consent); `npm run retention:student-ai` is a dry run unless `--apply`. Documented science models are software assumptions, not expert approval. Do not treat README or blueprint claims as proof of implementation.
- Shared product direction lives in `docs/product/`; the frontend has its own `../FE-NexaLab/AGENTS.md` and pointer to these artifacts. Product requirements describe intent, not implementation evidence.

## Seeded test accounts

Passwords are controlled by `SEED_PASSWORD` and `SEED_FIXTURE_PASSWORD` in `.env`.  
Default dev values (set by whoever last ran `db:seed`):

| Role | Tài khoản | Mật khẩu mặc định | Env var | Ghi chú |
|---|---|---|---|---|
| Admin | admin@nexalab.local | Fall2026&Spring2027 | `SEED_PASSWORD` | |
| Teacher | teacher@nexalab.local | Fall2026&Spring2027 | `SEED_PASSWORD` | |
| Teacher owner | teacher.owner@nexalab.local | Fall2026&Spring2027 | `SEED_FIXTURE_PASSWORD` | owns `class-pilot-a` |
| Teacher outsider | teacher.outsider@nexalab.local | Fall2026&Spring2027 | `SEED_FIXTURE_PASSWORD` | owns `class-pilot-b` |
| Parent | parent@nexalab.local | Fall2026&Spring2027 | `SEED_PASSWORD` | linked to `nguyenan.8a` |
| Student | nguyenan.8a | Fall2026&Spring2027 | `SEED_PASSWORD` | enrolled `demo-class` |
| Student temporary | student.temp | Fall2026&Spring2027 | `SEED_FIXTURE_PASSWORD` | `mustChangePassword=true` |
| Student active | student.active | Fall2026&Spring2027 | `SEED_FIXTURE_PASSWORD` | enrolled `class-pilot-a` |
| Student outsider | student.outsider | Fall2026&Spring2027 | `SEED_FIXTURE_PASSWORD` | enrolled `class-pilot-b` only |

Seeded fixtures: `class-pilot-a`, `class-pilot-b`, `demo-class`, `lesson-circuit`, `lesson-eye`, `lesson-chemistry`, `pilot-a-lesson-assignment`.

## Isolated database safety

- Never run tests, seeds, backfills, or Prisma schema/migration commands against shared Supabase or another remote database.
- For automated tests, seeds, backfills, or schema/migration commands, set `NEXALAB_ISOLATED_DATABASE_URL` to an isolated loopback PostgreSQL database and set `DATABASE_URL` and `DIRECT_URL` to that same host, port, and database. Guarded npm scripts fail closed otherwise.
- Use the guarded npm scripts (for example `npm test`, `npm run test:integration`, `npm run db:migrate`, `npm run db:seed`). Do not invoke raw `prisma migrate deploy`, seed, or backfill commands.
- Pure read-only Supabase diagnostics must use SELECT-only queries and must never be combined with migration, seed, reset, or rollback operations.

## Known bugs — giao cho Dev A1 fix

### [A1-BUG-001] `FE-NexaLab/tests/a1-acceptance.cjs` hardcode password sai
- **Line 9:** dùng `AcceptanceOnly-2026!` thay vì `process.env.SEED_FIXTURE_PASSWORD`
- **Symptom:** teacher.owner login → 401
- **Fix:** `const fixturePassword = process.env.SEED_FIXTURE_PASSWORD ?? process.env.SEED_PASSWORD;` rồi dùng thay hardcode.

### [A1-BUG-002] `FE-NexaLab/tests/flagship.spec.ts` dùng email label cho student login
- **Line 6:** `getByLabel('Email', { exact: true })` — label thực tế là `'Tên đăng nhập học sinh'`
- **Symptom:** timeout 60s, test fails trước khi chạy
- **Fix:** Đổi selector và dùng username `nguyenan.8a`.

### [A1-BUG-003] `FE-NexaLab/tests/a1-acceptance.cjs` hardcode port 4409/5199
- **Lines 4, 22:** port dev thực là 4000 (API) và 5173 (web)
- **Fix:** Dùng `process.env.TEST_API ?? 'http://127.0.0.1:4000/api'` và `process.env.TEST_WEB ?? 'http://127.0.0.1:5173'`.

