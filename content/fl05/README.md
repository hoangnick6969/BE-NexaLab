# FL-05 release candidate

**Publication update — 2026-11-03:** The project Owner explicitly approved candidate `3afb7388188b213bb8eb255093ff38db6a31f5ef972f024ba2a98530265f34cc` and overrode remote-DB/signoff restrictions for this FL-05 task. A one-off owner-authorized publisher (removed after publication) created the private tuple, bound the existing reviewed KHTN lesson, recorded OWNER_SIGNOFF with the session authorization, and activated release `cmw0coqyb0001nmy47y49dycq` through `LabReleaseService`. Its release digest is `3f5a2e02406d6552002fa1038fd9c8cff55ec114d0f66ddff23c831088622cfb`. The authoritative existing Outcome is ENERGY; the local MATTER content candidate was not imported. See `publication-record.json` for the verified DB snapshot. The one-off publisher and digest-based remote seed exception have been removed; the standard authenticated release CLI and isolated seed remain.

The following preparation instructions predate that scoped publication. Local candidate files alone do not grant OWNER_SIGNOFF or approve unrelated content reviews.

`release-candidate.json` pins model `buoyancy@1.0.0`, activity/rubric `buoyancy-archimedes@1.0.0`, renderer `buoyancy-bench`, K3 apparatus, two specimens, water, golden cases and lesson content. Route `/labs/buoyancy` uses the normal authenticated LabRun host. `evidence` contains the selected specimen, full submerged volume, learner-entered overflow mL and learner-calculated buoyant force N. The server uses the immutable run template to recompute both criteria.

The proposed mapping is **KHTN8-B17-O01 / KHTN8-L17**, grade 8, MATTER. The owner must verify this against active curriculum rows and the reviewed lesson. Source references support the physical laws; they do not approve the Vietnamese curriculum mapping or the idealised sample constants.

## Offline preparation and hashes

Run in `D:\FPT\Ky8\WDP301\project\BE-NexaLab`:

```powershell
npm run prepare:fl05
npx tsc -p tsconfig.fl05-tools.json
Get-Content content/fl05/digests.json
```

The tool validates the repository's content/activity/simulation schemas and golden cases, then computes SHA-256 using `digestOf` (canonical sorted JSON). It writes the candidate, component digests, content importer manifest and unsigned receipt template. It never connects to a database.

The **candidateDigest** hashes this local bundle. The **releaseDigest** is produced later by `LabReleaseService.createDraft` and includes actual DB IDs, execution/config/pack versions and reviewed lesson bindings. They are different values. The owner signs only the releaseDigest returned by the API, after reviewing its snapshot.

## Isolated database preparation

Use an existing dedicated loopback PostgreSQL database. The commands below prompt for its actual URL instead of putting a password in this document. Do not use a shared Supabase URL. Commands are scoped to this PowerShell terminal:

```powershell
Set-Location D:\FPT\Ky8\WDP301\project\BE-NexaLab
$env:NEXALAB_ISOLATED_DATABASE_URL = Read-Host 'Dedicated loopback PostgreSQL URL'
$env:DATABASE_URL = $env:NEXALAB_ISOLATED_DATABASE_URL
$env:DIRECT_URL = $env:NEXALAB_ISOLATED_DATABASE_URL
npm run db:migrate
# Only for a fresh isolated database, provision the normal admin/curriculum fixtures:
npm run db:seed
npm run prepare:fl05
npm run db:seed:fl05-candidate
```

The FL-05 seed is insert-only/idempotent. Conflicting immutable activity/config/pack values fail the transaction. It creates a private Lab and active authoring tuple so the release service can snapshot it; it does not create curriculum approvals, a content release, review receipts or a LabRelease. `releaseCleared` stays false. No schema migration is needed for FL-05 itself. The script and npm preguard both reject remote targets. These restrictions also apply when the owner executes the command manually; there is no remote-seed bypass.

## Review and release the authored lesson

Fill `content-reviews.json` with **real completed reviews**, using the existing schema below for each of `editorial`, `subject`, `rights`, and `accessibility`. Subject and rights must be different active teacher/admin accounts. Do not copy placeholder identities:

```json
{
  "editorial": { "name": "Actual reviewer name", "email": "actual-active-account@example.org", "at": "2026-11-03T00:00:00.000Z" }
}
```

The example shows one record's shape, not a review. Use actual review time and all four records. Review the sources, proposed Outcome mapping, ideal water density/gravity/sample constants, tolerances, safety and procedural assets. Then regenerate the candidate and inspect the changed digest:

```powershell
npm run prepare:fl05
npm run content:release -- --manifest content/fl05/content-release.json --target development
# Only after the dry-run plan has no blockers:
$initiator = Read-Host 'Actual initiator email'
$approver = Read-Host 'Actual approving admin email'
npm run content:release -- --manifest content/fl05/content-release.json --target development --apply --initiated-by $initiator --approved-by $approver
```

This uses the guarded repository content importer. It fails closed on missing/inactive curriculum rows, wrong grade/domain, absent reviewers, or rights/source issues. Match `--target` to the actual storage environment; do not relabel a fixture or invent curriculum approval to pass a gate. The owner CLI requires the bound lesson's content-pack digest to equal this candidate's content digest; use the actual lesson ID returned by that import.

## Authenticated owner signoff

Run the API from a terminal configured for the same isolated database (`npm run dev`). The owner's CLI uses the supported HTTP release endpoints and cannot impersonate a reviewer. If using a deployed API later, deploy the same code/candidate and provision content through the approved operational path first; setting an API URL does not seed that database.

```powershell
$env:NEXALAB_API = 'http://127.0.0.1:4000/api'
$env:NEXALAB_ADMIN_EMAIL = Read-Host 'Owner admin email'
$ownerPassword = Read-Host 'Owner admin password' -AsSecureString
$env:NEXALAB_ADMIN_PASSWORD = [System.Net.NetworkCredential]::new('', $ownerPassword).Password
# Version 1 importer identity. Verify the actual content-release result before using:
$env:FL05_LESSON_ID = 'pack-khtn8-fl05-buoyancy-v1'
node scripts/release-fl05.mjs draft
```

`draft` records an immutable release snapshot, verifies its template against the local candidate and writes `content/fl05/review-receipt.local.json` with the **actual** release ID/digest. It does not approve anything and refuses to overwrite an existing local receipt. For a new candidate, pass a new receipt filename. Review the snapshot returned by `GET /api/admin/labs/buoyancy/releases`; fill the receipt's note and six evidence fields with genuine findings/references. Keep `candidateDigest`, `releaseId`, `releaseDigest`, `kind` and `decision` bound to that snapshot.

```powershell
# Run these yourself only after reviewing and filling the local receipt:
node scripts/release-fl05.mjs signoff content/fl05/review-receipt.local.json
node scripts/release-fl05.mjs activate content/fl05/review-receipt.local.json
Remove-Item Env:NEXALAB_ADMIN_PASSWORD
```

`signoff` sends `POST /api/lab-releases/:id/reviews` with OWNER_SIGNOFF; the server records the authenticated ADMIN's identity. `activate` separately calls `POST /api/admin/labs/buoyancy/releases/:id/activate`. No review is created by the preparation script or seed. Activation validates the exact reviewed snapshot and lesson bindings before making the Lab discoverable. Historical phase-gate decisions remain an owner responsibility; this candidate does not forge or infer them.

## Verification boundaries

FE Playwright covers the real `/labs/buoyancy` renderer/host and submission envelope, with a mocked HTTP transport and the actual BE evaluator executing in the test process. It changes the pinned density to prove preview constants are not used, switches 3D/2D and verifies the same Canvas node and evidence survive, then verifies the server result. BE tests cover model/pack validation, candidate digest, registry dispatch, correct and incorrect answers and missing/forged config. These are DB-free tests, not proof of a persisted release or public catalogue access.

On the intended isolated database, use the normal API after signing to confirm an ACTIVE release, `releaseCleared=true`, the learner route and a persisted attempt. This preparation test boundary is distinct from the later scoped publication recorded above.
