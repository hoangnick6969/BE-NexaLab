# FL27 integration candidate

The owner authorized FL27 as the third engineering track on 2026-10-31. This does not approve the curriculum/scientific review or sign a LabRelease.

## Published data

`content/simulation-packs/fl27-candidate.json` contains the catalog subset with its existing provenance, Lab `gene-protein`, challenge `gene_protein_001`, activity `gene-protein-stations` v1, model `gene-expression@1.0.0`, config v1 and candidate pack v2. Pack v2 adds explicit expected mRNA observations for all four variants; v1 remains immutable. The Lab has scope `SHARED_LIBRARY` and topic `KHTN9-CH11-T01`. Config/pack remain `draft`, `releaseCleared=false`; no release, lesson binding, scientific approval or OWNER_SIGNOFF is fabricated.

Generate the manifest offline, using the Content tool's existing catalog export:

```powershell
npm run fl27:data:prepare -- --catalog "../NexaLAB_Content tool/catalog-registry.json"
```

Apply only to a dedicated, seeded, loopback integration database. Set `APP_ENV=development`, `NEXALAB_ISOLATED_DATABASE_URL`, `DATABASE_URL` and `DIRECT_URL` to exactly the same URL. `SEED_TARGET` must match its hostname/database. All commands below use the repository's isolated database guards:

```powershell
npm run db:migrate
npm run db:seed
npm run fl27:data:publish
npm run fl27:data:publish -- --apply
```

The importer validates the activity digest, pack schema, four golden cases and curriculum references. It imports in one transaction and allows identical reruns. Conflicting immutable activity content fails; it never activates data. Do not mix this candidate importer with the synthetic FL27 browser fixture in the same database.

Supabase `eiotlkegrejjhldsvaqp` already contains the five candidate records published at the owner's explicit request. Pack `fl27-pack-v2` was added separately through MCP and read back with four passing golden cases; previous rows were preserved. The guarded importer intentionally cannot target that shared database.

## Full-stack browser check

Use a separate dedicated database named `nexalab_fl27_isolated`. Set all three database URLs and `SEED_TARGET` consistently, plus an isolated `SEED_PASSWORD`/`SEED_FIXTURE_PASSWORD`.

```powershell
npm run db:migrate
npm run db:seed
npm run db:seed:fl27-isolated
```

This creates labelled synthetic data and assignment `assignment-fl27-fullstack` for `student.active` in `class-pilot-a`, with the exact activity/config/pack tuple and digest pinned. It creates no release.

Start BE on port 4127 with `WEB_ORIGIN=http://127.0.0.1:5176`. Explicitly set `ASSET_STORAGE=local`, a temporary `UPLOAD_DIR`, `API_PUBLIC_URL=http://127.0.0.1:4127/api` and disable external tutor credentials. Start FE on port 5176 with `VITE_API_URL=http://127.0.0.1:4127/api` to exercise real browser CORS rather than relying on the Vite proxy. Then, from FE:

```powershell
$env:TEST_WEB='http://127.0.0.1:5176'
$env:TEST_API='http://127.0.0.1:4127/api'
$env:FL27_REAL_STACK='1'
$env:FL27_STUDENT_PASSWORD=$env:SEED_FIXTURE_PASSWORD
npx playwright test tests/gene-protein-real-stack.spec.ts
```

The test uses no API mocks. It signs in, opens the assigned lab, accepts the server-pinned gene, completes six stations, submits, asserts a real 6/6 result in the UI and reads the persisted attempt from the API. The separate accessibility suite audits all six stations in 2D and 3D with axe and verifies actual renderer frame counters settle when paused.

After verification, stop the test servers and temporary PostgreSQL cluster before removing its checked absolute scratch directory. Remove Playwright reports, traces, screenshots and temporary local configuration; keep only source, reusable tests and the publication manifest.
