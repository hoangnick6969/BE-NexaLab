# Brownfield Compatibility

## What the current code already supports

- `src/content.ts` defines `MATTER`, `ENERGY`, `LIVING`, and `EARTH_SKY`. Treat the current `domain` field as the taxonomy's curriculum `strand` during the transition.
- `CurriculumOutcome` stores `code`, `grade`, `domain`, `chapter`, and `statement`; current seeded `FX*` records are synthetic development fixtures and are not authoritative outcomes.
- `Lesson` stores `chapter`, `topic`, `domain`, and `outcomeCodes`, and B1 can filter the teacher library on those fields.
- Assignments pin a content hash/version, and B2 evidence is assignment-scoped. Released taxonomy/content versions must preserve those historical references.

## Gaps that Content Foundation must close

| Gap | Consequence | Taxonomy rule |
| --- | --- | --- |
| `Lesson.chapter` and `topic` are free text | Labels can drift and cannot safely join data from several sources | Import stable `chapterKey`/`topicKey`; keep Vietnamese labels separately |
| `Lesson.domain` is one optional string | Cross-cutting and multi-strand content can be forced into a false bucket | Treat it as a legacy primary strand only; canonical manifests allow zero or multiple strand mappings |
| `CurriculumOutcome.domain` is required | The introductory Bài 1 cannot be represented honestly as an outcome without an official mapping | Keep Bài 1 as a source/foundation section until official outcome mappings are reviewed |
| `outcomeCodes`, materials, and questions are JSON | References lack normalized integrity and independent versioning | CF-T1 introduces validated versioned manifests/relations before baseline release |
| No SourceArtifact/KnowledgeUnit version models exist | OCR text and source pages could be confused with learner-facing content | CF-T1/CF-T3 preserve source artifacts, claims, locators, mappings, and release records separately |
| `AssetFile` has no immutable R2 version/provenance | PDF, video, caption, image, and GLB references cannot be released safely | CF-T2 introduces Asset/AssetVersion/AssetSource and exact version pinning |

## Transition rule

Do not import the new SGK outline directly into `Lesson` or replace synthetic `CurriculumOutcome` rows. First encode and review versioned taxonomy/source manifests under Content Foundation; an importer may then project released fields into the current B1 read model until normalized relations become the runtime authority.
