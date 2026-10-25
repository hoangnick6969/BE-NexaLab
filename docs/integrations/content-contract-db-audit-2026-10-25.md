# Content contract and Supabase audit — 2026-10-25

## Scope and target

This audit compares the local Content Tool pipeline, backend content/curriculum release code, Prisma migrations, and the development Supabase database selected by `BE-NexaLab/.env`.

The target contract is:

```text
PDF/source identity
  -> reviewed Structured Lesson (source truth and provenance)
  -> resolved Canonical Lesson (editorial truth)
  -> reviewed Curriculum mapping (framework/chapter/topic/outcomes)
  -> immutable ContentPackVersion draft
  -> release plan with hard gates
  -> transactional release
  -> published Lesson + LessonSteps
  -> read-only student catalog/progress APIs
```

No stage may infer approval from another stage. A published baseline lesson must retain both source provenance and curriculum mapping.

## Remediation result

Migration `20261025150000_unify_khtn_content_contract` was applied successfully to the backend's configured Supabase database on 2026-10-25.

| Invariant | Result after migration |
|---|---:|
| Grade 8–9 lessons with a subject other than `khtn` | 0 |
| Grade 8–9 curriculum chapters with a subject other than `khtn` | 0 |
| Content packs with a subject other than `khtn` | 0 |
| KHTN 9 lessons outside `ENERGY/MATTER/LIVING/EARTH_SKY` | 0 |
| Active topics without outcome mappings | 0 |
| Missing foreign-key indexes reported by the audit | 0 |
| Empty pilot chapter `khtn9-physics-energy` | 0 |
| KHTN 8 real Structured Lessons pending reviewed classification | 47 |

The 13 official KHTN 9 chapters use `subjectId = khtn` and aggregate domain `KHTN`. The 53 mapped KHTN 9 lessons retain their detailed domains: 17 `ENERGY`, 19 `MATTER`, and 17 `LIVING`. Chapter 1 intentionally spans `ENERGY` and `MATTER`, so validators treat chapter domain `KHTN` as an aggregate rather than overwriting lesson/outcome domains.

All 13 topics now contain the deterministic union of active, real outcomes used by their mapped lessons (102 active real outcome links). Archived and synthetic outcome rows remain unlinked by design.

The 47 KHTN 8 Structured Lessons are explicitly `UNCLASSIFIED` and are excluded from official student catalog, lesson, exercise, and progress routes until a reviewed chapter/topic/outcome mapping is attached. No evidence or human approval was fabricated during migration.

## Database identity and migration state

- The backend database uses Supabase project ref `eiotlkegrejjhldsvaqp` through the configured pooler.
- The connected Supabase MCP account exposes a different project (`fszfqxbagkoqlfvrnxul`), so MCP results must not be used for this database.
- Source control and database now both contain `20261024100000_curriculum_framework_registry`, `20261025100000_curriculum_outcome_source_evidence`, and `20261025150000_unify_khtn_content_contract`.

## Current content classification

| Class | Count | Current state | Contract status |
|---|---:|---|---|
| KHTN 8 Structured Lessons | 47 | `baseline`, released, non-synthetic, grade 8, subject `khtn` | Source-backed but curriculum-unclassified |
| KHTN 9 legacy/canonical packs | 53 | `baseline`, released, non-synthetic, outcomes present | Operational, but outcome provenance is missing |
| Fixture pack | 1 | released and synthetic | Test-only; must never enter the public catalog |
| Synthetic lessons without pack versions | 50 | published fixtures | Test-only; current public queries must continue excluding them |
| Curriculum outcomes | 143 | 106 active real, 33 archived real, 4/5+ synthetic fixtures | All 143 lack `sourceEvidence` |
| Curriculum frameworks | 0 | Tables exist but registry is empty | Framework linkage missing |
| Curriculum topics | 13 | All map active real outcomes used by their lessons | Relationship repaired |

The 47 Structured Lessons were released by two `ADMIN_DIRECT` releases. Their source book is `sgk-khtn8`, so grade 8 is correct for these rows. The defect is that the backend importer hardcodes grade/domain and cannot safely import any other book.

## Historical violations found by the audit

1. **Structured release bypasses curriculum classification.** All 47 released Structured Lessons have no chapter code, topic code, or outcome codes.
2. **Taxonomy and outcomes are disconnected.** All 13 topics have empty outcome arrays; all 143 outcomes are unreferenced by topics.
3. **Outcome provenance migration was not backfilled.** Every `CurriculumOutcome.sourceEvidence` is null.
4. **Framework registry is empty.** There is no authoritative framework/version row explaining the active curriculum.
5. **Content Tool sync could report false success.** `apply_approved_mappings` previously appended a pack to `applied` even when local evidence gates prevented pack creation.
6. **The Structured Lesson contract omitted grade.** Backend compensated by hardcoding grade 8 and domain `khtn8`.
7. **No database checks protect state strings or grades.** Content status, namespace, lesson status/scope and curriculum grades have no CHECK constraints.
8. **Data API access needed verification.** The post-migration audit confirms RLS is enabled and neither `anon` nor `authenticated` has SELECT on inspected public tables. The product accesses Postgres through Nest/Prisma.
9. **Missing foreign-key indexes exist.** Content-relevant missing indexes include `Lesson.subjectId` and `Lesson.curriculumTopicCode`; six other application FKs are also unindexed.
10. **Timestamp semantics are inconsistent with the desired contract.** Prisma-created dates are stored as `timestamp without time zone`; timestamps cross system boundaries and should be normalized deliberately before changing types.

## Canonical classifications

### Source content status

- `draft_source`: imported source, private, not curriculum classified.
- `reviewed_source`: content review accepted with reviewer identity and source digest.
- `resolved_content`: canonical merge has no unresolved or stale decisions.

### Curriculum status

- `unclassified`: no approved framework/chapter/topic/outcomes.
- `proposed`: machine/operator proposal only.
- `approved`: source-verified human approval persisted with review reference.

### Release status

- `draft`: private pack version, no lesson/release links.
- `released`: immutable version with release and lesson backlinks, source review, resolved content and approved curriculum.
- `retired`: historical evidence retained; no new enrollment/assignment use.

`synthetic` is orthogonal to status and means fixture/test data only. A synthetic row can never become a baseline public lesson without an explicit conversion that creates a new non-synthetic version.

## Required release invariants

A release transaction must reject a draft unless all are true:

- `book.grade` is explicit and supported; no backend grade fallback.
- subject, domain, chapter, topic and order are explicit.
- every lesson and knowledge unit outcome exists, is active, non-synthetic and belongs to the same grade/domain.
- the topic contains exactly the selected active outcomes.
- the framework version exists and links the selected subject/grade.
- source digest, source blocks, page locators and content review are present and current.
- canonical input fingerprint and content hash are current.
- pack digest matches the exact persisted manifest.
- draft is private and has no existing lesson/release link.
- retry is idempotent by environment and digest.

## Remaining reviewed-data work

1. Create and approve the authoritative curriculum framework/version with source metadata.
2. Attach reviewed `sourceEvidence` to active real outcomes; all 102 active KHTN 9 outcome rows still lack it.
3. Review and classify the 47 KHTN 8 Structured Lessons through the new draft-classification endpoint.
4. Retire or keep historical fixtures according to test-environment retention policy; they remain excluded from public APIs.

## Decisions applied and remaining human ownership

- Applied: KHTN is the integrated lesson/curriculum subject `khtn` for grades 8–9. Physics, chemistry and biology subject rows remain available for non-lesson resources but no longer partition KHTN lessons.
- Which official curriculum document/version is authoritative and who approves it.
- Applied: the 47 KHTN 8 lessons are hidden from official student curriculum flows until review is complete.
- Confirmed: repository clients use backend APIs; no browser Supabase client was found.
