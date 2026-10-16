# KHTN 8 source content: development seed checklist and normalization flow

## Seed files and their roles

| File | Role | Database behavior |
|---|---|---|
| `tools/nexalab-ingest/out/nxbgd-khtn8-20261015/extracted/sgk-khtn8-chapter-01.content-seed.dev.json` | Local development payload for chapter 1. Contains extracted OCR text for six lesson sections plus source IDs, hashes, locators, and review state. | Imported only by the explicit development source-staging command after the migration is applied. Never creates `Lesson` rows. |
| `tools/nexalab-ingest/fixtures/sgk-khtn8-chapter-01.seed.fixture.json` | Version-controlled redacted fixture using the same `nexalab.textbook-content-seed/v1` structure; each section has `content.text: null` and `contentIncluded: false`. | Contract/parser fixture; not seedable because it deliberately omits OCR body text. |
| `tools/nexalab-ingest/out/nxbgd-khtn8-20261015/extracted/sgk-khtn8-source-map-complete.json` | Original assembled source map. Preserve unchanged as source evidence. | Not a seed command input. |
| `tools/nexalab-ingest/out/nxbgd-khtn8-20261015/extracted/sgk-khtn8-lessons.jsonl` | Original OCR section records and text hashes. Preserve unchanged as source evidence. | Not a seed command input. |

The content payload is under the ignored `out/` tree and is intentionally local development data. It is useful for source-staging import tests, but does **not** mean the content has been editorially approved or released.

`npm run db:seed` runs `prisma/seed.ts` and creates development accounts/product fixtures; it does not read the files above. The textbook staging path is separate: `npm run ingest:khtn8:dry-run` validates the content payload with zero writes, and `npm run ingest:khtn8:seed` explicitly imports it into `TextbookSource` / `TextbookSourceChunk`. The latter requires `APP_ENV=development`, `SEED_TARGET` matching `DIRECT_URL`, and the staging migration. It does not create student-facing `Lesson` rows.

## Acceptance checklist

### 1. Input integrity

- [ ] Exact book edition is identified: title, series, publisher, year/reprint, ISBN, language.
- [ ] Original PDF, text transcript, source map and JSONL files remain unchanged; hashes are recorded and verified.
- [ ] Input package declares a versioned schema and a clear purpose: source index, source staging, or student-facing lesson content.
- [ ] Every chapter and section has a stable source ID; IDs are unique and all parent links resolve.
- [ ] Titles use Unicode NFC and consistent whitespace. OCR body text is preserved as extracted; corrections are not silently mixed into it.
- [ ] Each section body hash matches the exact included text and its source JSONL record.

### 2. Chunk and locator quality

- [ ] Chunk by meaningful textbook structure: book → chapter → lesson/section → topic where an explicit heading supports it.
- [ ] Preserve order and parent IDs. Do not equate an arbitrary character window or source section with a NexaLab `Lesson` automatically.
- [ ] Keep printed-page range separate from physical PDF-page range.
- [ ] Each locator records evidence and verification scope. A checked heading/page range must not mark the whole OCR body as reviewed.
- [ ] No duplicate sections, orphan chunks, inverted/overlapping ranges, missing bodies where required, or unexplained gaps.
- [ ] Structural validation report lists counts and row-level failures.

### 3. Review and content states

- [ ] State is explicit and version-specific: `NEEDS_HUMAN_REVIEW`, `PARTIALLY_HUMAN_VERIFIED`, or an approved state supported by actual review evidence.
- [ ] Development source-staging records may contain unreviewed OCR only in a restricted non-student-facing path, preserving their warning/status.
- [ ] Unreviewed OCR is not used as an approved question, answer key, scientific claim, citation, or published lesson.
- [ ] OCR corrections produce a separate reviewed derivative with reviewer, timestamp, scope, and new hash.
- [ ] Curriculum mapping is a separate reviewed relation to authoritative outcomes. Do not infer official outcome codes from textbook chapter/topic titles.
- [ ] Rights/usage state is stored separately. Unknown rights block public display/release and bulk reproduction; development-only storage does not imply a reuse license.
- [ ] Student-facing content is authored/approved under the shared-content policy and has required subject, editorial, and rights review.

### 4. Importer and database checks

- [ ] Importer contract version is validated at the boundary (Zod/API or equivalent strict schema validation for a script).
- [ ] Database models preserve source edition, source IDs, hashes, locators, review/rights state and import-batch/version provenance.
- [ ] Import is idempotent by stable keys. A changed hash creates a tracked version or explicit conflict, never a silent overwrite of reviewed content.
- [ ] Import runs in a transaction and reports created, updated, skipped and rejected counts with reasons.
- [ ] Target environment/database identity is checked; production is rejected by default.
- [ ] Dry-run performs zero writes and lists proposed records and blockers.
- [ ] Development seed is visibly marked staging/test-only and excluded from released coverage and student-facing queries.
- [ ] Verify persisted rows, relations, API/Admin visibility, repeat-import behavior, and rollback/removal by import batch.

## Recommended flow before seed

1. **Freeze source evidence.** Record edition identity and verify PDF/transcript/source-map hashes. Do not edit originals.
2. **Parse to a staging contract.** Validate input shape; normalize IDs, titles, Unicode NFC, whitespace, line endings, nulls, and ordering. Retain exact extracted OCR separately with its hash.
3. **Build semantic chunks.** Create chapter/lesson/topic hierarchy from explicit source headings. Attach source IDs, sequence, parent ID, line ranges, printed pages, physical PDF pages, and page-evidence state.
4. **Validate structure.** Check required fields, unique IDs, parent-child references, section counts, page/line ranges, overlaps, text hashes, and content presence. Emit machine-readable dry-run results.
5. **Verify locators against the PDF.** Check headings and start/end pages. Record which pages and fields were inspected. This step does not assert OCR accuracy.
6. **Review OCR as content.** Compare the full text against page images, correct it in a derivative, record reviewer/scope/hash, then arrange scientific/editorial review as required.
7. **Map outcomes separately.** Use authoritative curriculum evidence; keep unresolved mappings null rather than guessing.
8. **Record usage decision.** Store allowed internal storage/display/reuse scope. Until resolved, keep OCR in restricted development staging and prevent release/public display.
9. **Run importer dry-run.** Validate every record against the implemented contract and current schema. Inspect row-level output; confirm zero writes.
10. **Seed a small development slice.** Import one chapter or a few reviewed topics into source-staging tables, separately from `Lesson` records. Confirm environment, transaction, idempotency and rollback.
11. **Verify and expand.** Read back database/API/Admin records, check the source trail and release exclusion, then expand to more sections. Production release is a separate review gate.

## Current chapter 1 snapshot

- Six sections (lessons 2–7) were visually checked for heading, printed page and physical PDF locator on pages 11–34.
- OCR bodies are included in the local development content payload and their hashes match the source JSONL records (40,815 characters total).
- OCR bodies have **not** been fully corrected or scientifically reviewed. Outcome mapping and reuse-rights decisions are not included.
- The source-staging importer is `tools/nexalab-ingest/import_chapter_seed.ts`; run `npm run ingest:khtn8:fixture-check`, then `npm run ingest:khtn8:dry-run`, and only after the dry-run and development DB/migration checks pass use `npm run ingest:khtn8:seed`.
- The importer writes only to `TextbookSource` / `TextbookSourceChunk` in a transaction. It refuses changed source/content hashes on re-import, and it never creates student-facing `Lesson` rows.
- Current `prisma/seed.ts` remains the separate user/product-fixture seeder and does not consume this payload.
