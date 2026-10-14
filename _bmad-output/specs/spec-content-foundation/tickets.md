# Content Foundation — Ordered Tickets

## CF-T1 (B0-T5) — Versioned content pack and provenance

- Define validated manifests for outcome, knowledge claims, source locators/license, learning unit, lesson materials, stable question IDs, practical activity, review attestations, lifecycle, and immutable version relations.
- Build idempotent import/validation against synthetic fixtures; keep fixtures in a non-production namespace.
- Enforce accuracy, rights, outcome mapping, accessibility, answer-key, and named-review gates before release.
- **Accept when:** report separates mapped outcomes, researched units, released lessons, and practicals; incomplete/unlicensed/unreviewed content cannot publish; reruns create no duplicate; fixture promotion is rejected.

## CF-T2 (B0-T6) — Private R2 media and asset versions

- Configure environment-specific private R2 bucket credentials, CORS, lifecycle, signed upload/read, multipart complete/abort, and metadata in PostgreSQL.
- Validate allowlisted type, filename/extension, size, magic bytes, checksum, malware/media status, caption/transcript, GLB safety/semantic metadata, and ownership.
- Stream full SHA-256 with bounded memory; never trust multipart ETag. Migrate existing local files only after object and reference reconciliation.
- **Accept when:** cross-owner reads/writes fail; client never receives R2 credentials; expired/failed uploads clean up; published asset version cannot be replaced in place; local-to-R2 counts/checksums reconcile.
- **Open gate:** Q-DATA-01 and Q-C2-03 specify final upload limits before production configuration.

## CF-T3 (B0-T7) — Source registry, ingestion, and release importer

- Version a source policy registry with access mode, permitted hosts/paths/types, license and attribution rules, storage policy, terms/robots review, rate limits, connector/parser, and enabled state.
- Ingest only bounded allowlisted candidates into staging with run/item identity, source version, checksum, parser version, license snapshot, locator, and rejection reason.
- Provide dry-run and approved Content Release Importer with environment allowlist, R2 upload, transactional metadata/reference writes, release receipt, retry, rollback/retire path, and idempotency.
- **Accept when:** disabled, redirected, oversized, unlicensed, or unclear-rights sources reject; partial failure cannot publish a partial release; rerun is idempotent; seed cannot target pilot/production; ingestion never auto-publishes.

## CF-T4 (B0-T8) — Practical and simulation pack registry

- Add immutable `PracticalActivitySpec`, reviewed `ScientificModelSpec`, `TopicSimulationPackVersion`, template, visual asset, semantic node map, binding manifest, and challenge versions.
- Replace hardcoded lab dispatch with allowlisted model/version resolution; validate schema, unit/range, golden cases, visual compatibility, and references.
- Migrate circuit, chemistry, and eye representations without changing historical attempt interpretation.
- **Accept when:** pack pins all required versions; golden outputs match before visual QA; arbitrary executable bindings, unknown models, out-of-range inputs, missing nodes, and mismatches reject; historic attempts remain explainable.
- **Open gate:** Q-C2-04 values are reviewed per model before that model is released.

## CF-T5 (B0-T9) — Grade 8–9 open baseline corpus

- Map all KHTN outcomes for Grades 8–9; research reusable sources and author/edit Vietnamese units and original assessments; author activities/simulations only where they support outcomes.
- Preserve item-level locators, claims, license/attribution, named subject review, named rights review, versions, and release evidence.
- Publish separate coverage report by grade/domain for mapped outcomes, reviewed knowledge units, released lessons, specified practicals, and available simulations.
- **Accept when:** each metric has numerator, denominator, and gap list; no pack bypasses rights/science/safety gates; no full-textbook completeness claim; the baseline release has a verified import/retire/rollback path.
- **Blocking inputs:** Q-DATA-02, Q-DATA-03, Q-DATA-04. This is a staffed editorial delivery, not only code.

## Dependencies

CF-T1 and CF-T2 may proceed in parallel. CF-T3 requires T1 and T2. CF-T4 requires T1 plus inventory of existing models. CF-T5 requires outcome inventory, T1, T3, and named capacity. B1 content UI can use fixtures before CF-T5 is released.
