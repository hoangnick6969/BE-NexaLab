# NexaLab workspace context

- This product spans sibling repositories: `nexalab-be` (NestJS 11, TypeScript, Node.js, PostgreSQL/Prisma) and `nexalab-fe` (React 18, TypeScript, Vite).
- Backend entry points live in `src/`; the deterministic shared simulation package and unit tests are in `packages/sim/`; schema, migrations and seed are in `prisma/`. Frontend routes and pages are in `src/`, with lab components in `src/labs/` and Playwright cases in `tests/`.
- Backend commands: `npm run dev`, `npm run lint`, `npm test`, `npm run build`; integration requires a running seeded API/database (`npm run test:integration`). Frontend commands (run from `../nexalab-fe`): `npm run dev`, `npm run lint`, `npm run build`, `npm run test:e2e` (requires the configured app/backend and Playwright browser).
- Validate request bodies with Zod and enforce roles at backend routes. Treat backend simulation results as authoritative; the server recomputes them. Keep `packages/sim` deterministic and version its tarball when syncing it to the frontend.
- Tutor output is advisory: rules-based templates work without credentials; the Claude adapter is optional and falls back to templates. Documented science models are software assumptions, not expert approval. Do not treat README or blueprint claims as proof of implementation.
- Shared product direction lives in `docs/product/`; the frontend has its own `../nexalab-fe/AGENTS.md` and pointer to these artifacts. Product requirements describe intent, not implementation evidence.

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

> [!IMPORTANT]
> Để seed lên Supabase: đặt `APP_ENV=development`, `SEED_TARGET=<host>/<db>` (phải khớp `DIRECT_URL`), `sslmode=require` trong `DIRECT_URL`. Chạy `npm run db:seed`. Không dùng `SEED_RESET_FIXTURES=true` trên database production.

## Known bugs — giao cho Dev A1 fix

### [A1-BUG-001] `nexalab-fe/tests/a1-acceptance.cjs` hardcode password sai
- **Line 9:** dùng `AcceptanceOnly-2026!` thay vì `process.env.SEED_FIXTURE_PASSWORD`
- **Symptom:** teacher.owner login → 401
- **Fix:** `const fixturePassword = process.env.SEED_FIXTURE_PASSWORD ?? process.env.SEED_PASSWORD;` rồi dùng thay hardcode.

### [A1-BUG-002] `nexalab-fe/tests/flagship.spec.ts` dùng email label cho student login
- **Line 6:** `getByLabel('Email', { exact: true })` — label thực tế là `'Tên đăng nhập học sinh'`
- **Symptom:** timeout 60s, test fails trước khi chạy
- **Fix:** Đổi selector và dùng username `nguyenan.8a`.

### [A1-BUG-003] `nexalab-fe/tests/a1-acceptance.cjs` hardcode port 4409/5199
- **Lines 4, 22:** port dev thực là 4000 (API) và 5173 (web)
- **Fix:** Dùng `process.env.TEST_API ?? 'http://127.0.0.1:4000/api'` và `process.env.TEST_WEB ?? 'http://127.0.0.1:5173'`.

