# NexaLab workspace context

- This product spans sibling repositories: `nexalab-be` (NestJS 11, TypeScript, Node.js, PostgreSQL/Prisma) and `nexalab-fe` (React 18, TypeScript, Vite).
- Backend entry points live in `src/`; the deterministic shared simulation package and unit tests are in `packages/sim/`; schema, migrations and seed are in `prisma/`. Frontend routes and pages are in `src/`, with lab components in `src/labs/` and Playwright cases in `tests/`.
- Backend commands: `npm run dev`, `npm run lint`, `npm test`, `npm run build`; integration requires a running seeded API/database (`npm run test:integration`). Frontend commands (run from `../nexalab-fe`): `npm run dev`, `npm run lint`, `npm run build`, `npm run test:e2e` (requires the configured app/backend and Playwright browser).
- Validate request bodies with Zod and enforce roles at backend routes. Treat backend simulation results as authoritative; the server recomputes them. Keep `packages/sim` deterministic and version its tarball when syncing it to the frontend.
- Tutor output is advisory: rules-based templates work without credentials; the Claude adapter is optional and falls back to templates. Documented science models are software assumptions, not expert approval. Do not treat README or blueprint claims as proof of implementation.
- Shared product direction lives in `docs/product/`; the frontend has its own `../nexalab-fe/AGENTS.md` and pointer to these artifacts. Product requirements describe intent, not implementation evidence.
