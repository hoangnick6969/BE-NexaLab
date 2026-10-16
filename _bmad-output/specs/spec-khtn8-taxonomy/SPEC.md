---
id: SPEC-khtn8-taxonomy
status: draft-for-outcome-mapping
companions:
  - taxonomy-catalog.md
  - source-evidence.md
  - brownfield.md
  - ../spec-content-foundation/SPEC.md
  - ../../planning-artifacts/content-data-foundation.md
sources: []
---

> **Canonical contract.** This SPEC and its companions define the KHTN Grade 8 taxonomy baseline. Source-book structure is evidence and navigation input, not curriculum-outcome authority.

# KHTN Grade 8 Dataset Taxonomy

## Why

NexaLab needs one stable classification system that lets SGK, SBT, SGV, video, quiz, and simulation material converge on the same Grade 8 Khoa học tự nhiên learning structure without turning Physics, Chemistry, and Biology into separate subjects or treating one book edition as the curriculum authority.

## Capabilities

- **CAP-1 — Stable integrated taxonomy**
  - **intent:** Content producers map every KHTN 8 item through one shared subject, grade, chapter, topic, and curriculum-outcome vocabulary while retaining strand and discipline facets.
  - **success:** Two independent imports of the same item resolve to the same stable keys, and no record creates Physics, Chemistry, or Biology as a separate subject.
- **CAP-2 — Source-to-learning traceability**
  - **intent:** Editors preserve the exact source edition, chapter, lesson, and printed-page locator independently from the canonical learning mapping.
  - **success:** Every reviewed knowledge unit can resolve back to one or more source-artifact versions and exact page or section locators, while every source section can list its candidate outcome mappings.
- **CAP-3 — Honest coverage management**
  - **intent:** Operators measure curriculum mapping, reviewed knowledge, released lessons, assessments, practicals, media, and simulations as separate coverage dimensions.
  - **success:** A coverage report exposes numerator, denominator, and gaps by grade, strand, chapter, and outcome without using source-page count as curriculum completion.

## Constraints

- The only subject key is `KHTN`; Grade 8 is `KHTN-8`. Physics, Chemistry, Biology, and Earth Science are searchable discipline tags, not parent subjects.
- `MATTER`, `ENERGY`, `LIVING`, and `EARTH_SKY` are curriculum-strand facets. A record may be cross-cutting or map to multiple strands; the importer must not invent a false primary strand merely to satisfy storage.
- Canonical learning hierarchy is `Subject → Grade → Chapter → Topic → CurriculumOutcome → LearningUnit`. Source outlines use their own keys and map into this hierarchy.
- Official outcome codes and statements must come from a versioned official curriculum artifact. SGK headings, objectives, and summaries are candidate evidence only.
- SGK Bài 1 is a cross-cutting foundation section covering laboratory safety, measurement, equipment, and science practice; it is not part of Chapter I and must not be classified as Chemistry-only.
- Stable machine keys do not contain mutable Vietnamese display text. Label changes and alternate book terminology do not change identities.
- Extracted PDF/OCR text remains a source artifact in staging. It cannot become a released LearningUnit, quiz, or answer key without source mapping and the Content Foundation review gates.
- Dataset and runtime lanes remain separate: taxonomy/source/knowledge versions feed released content; assignments and student evidence pin released immutable versions.

## Non-goals

- OCR every crawled page in this taxonomy pass.
- Declare the crawled publisher material eligible for release.
- Author complete lessons, quizzes, captions, or simulation packs.
- Modify Prisma, import data into Supabase, or replace the existing B1 fixture taxonomy.
- Claim complete official-outcome coverage before the official Grade 8 curriculum artifact is imported and reviewed.

## Success signal

The SGK baseline resolves to one introduction section, eight stable chapters, and forty-seven source lessons with printed-page locators and consistent strand/discipline facets. A later SGV, SBT, video, or alternate-book import can map into the same keys without changing existing identities, while unmapped official outcomes remain visible as gaps.

## Open Questions

- Which exact official Grade 8 KHTN curriculum document/version will supply authoritative outcome codes and statements? This blocks final outcome IDs and outcome-to-topic acceptance, but not source-outline ingestion.
