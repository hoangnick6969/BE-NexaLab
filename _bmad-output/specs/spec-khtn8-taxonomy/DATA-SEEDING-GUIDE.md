# KHTN 8 data processing and seed guide

**Status:** working guide for seed planning; not a release approval or a Prisma migration spec.

**Scope:** Khoa học tự nhiên lớp 8, using the current Kết nối tri thức textbook source map as a navigation/reference artifact.

## 1. The key boundary

Keep four things separate:

1. **Curriculum map** — official KHTN subject outcomes, strand, grade and topic. This defines what the course must cover.
2. **Source map** — a particular book edition's chapter/lesson titles, printed-page starts/ranges and source locators. It helps people return to a page; it is not the curriculum taxonomy or proof of reuse rights.
3. **Knowledge units** — reviewed facts, concepts, formulas and terms, with claim-level source references.
4. **Learning content** — NexaLab-authored reading, cards, quizzes, video links and optional activities, grouped into immutable lesson/pack versions.

The current [complete source map](../../../tools/nexalab-ingest/out/nxbgd-khtn8-20261015/extracted/sgk-khtn8-source-map-complete.json) combines the supplied `sgk.txt`, lesson-title boundaries and the book outline. It contains 8 chapters, 47 lessons and the glossary. Treat its text as **unreviewed OCR transcription**, and its page ranges as lesson navigation markers—not exact per-page text slices. The official outcome artifact is still missing; the source map cannot fill that gap.

**Rights gate:** the OCR/source map is reference and editorial evidence. The Content Foundation spec and D17 do not allow copying/rehosting publisher textbook text merely because it is locally available or can be viewed. Do not seed this full transcription as student-facing lesson content unless reuse rights are confirmed. Use permitted sources and/or original NexaLab explanations, with citations back to source locators.

## 2. Repeatable processing workflow

1. **Freeze source identity:** edition/book metadata, original file checksum, text checksum, source-map version, and extraction method. Never edit the raw OCR in place.
2. **Map structure:** keep stable machine IDs for chapter, lesson and section; retain Vietnamese titles as labels. Record printed-page starts and their evidence (`USER_TOC`, `OCR_HEADING`, or `INFERRED`), plus source text line spans. Do not equate printed page with physical PDF page unless verified.
3. **Segment by visible titles:** content after a lesson title belongs to that lesson until the next recognized lesson title. Preserve the source line locator and mark recovered/uncertain heading boundaries for review.
4. **Normalize conservatively:** UTF-8, Unicode NFC, and LF line endings are safe mechanical normalization. Do not silently repair Vietnamese words, formulae, units, table order, answer choices, or OCR symbols. Keep `rawText` and any reviewed/corrected representation as separate fields.
5. **Review high-risk material:** compare formulas, subscripts/superscripts, reaction arrows, ionic charges, units, tables, diagrams, multi-column text and answer keys with the source image. Record reviewer, status and locator.
6. **Create learning units:** select claims/concepts/formulas relevant to official outcomes; attach claim-level sources. Write age-appropriate original lesson prose and original assessment questions rather than turning unreviewed OCR into quiz content.
7. **Attach modalities by learning target:** map a video/card/question/activity to the same lesson/topic/outcome it supports—not just to a whole-book playlist or chapter label. Add simulations only when a reviewed practical and scientific model justify them.
8. **Validate then import:** validate manifest/schema, stable IDs, references, source/review evidence and rights. Dry-run first. Import development/pilot content through the planned Content Release Importer, never by hand-writing production rows or uploading binaries to PostgreSQL.

## 3. Special characters and equations

- Store text as UTF-8 and normalize to Unicode NFC. Vietnamese accents, `°C`, `→`, and Unicode subscripts are valid text, but do not use visual glyphs alone as machine semantics.
- Preserve OCR exactly: `rawOcr: "H20"` must not silently become `H2O`; zero and capital O can be confused. A correction belongs in a separate human-reviewed field with the source locator and reviewer.
- For reviewed chemistry display, use LaTeX with **mhchem**; for physics/math use ordinary LaTeX. Example JSON (the backslash is escaped because this is JSON):

```json
{
  "kind": "CHEMICAL_REACTION",
  "rawOcr": "2H2 + O2 -> 2H2O",
  "renderSource": "\\ce{2H2 + O2 -> 2H2O}",
  "sourceRef": { "sourceId": "vn-khtn8-ket-noi-tri-thuc-reprint-3", "lessonId": "lesson-02", "printedPage": 12 },
  "review": { "transcription": "HUMAN_VERIFIED", "reviewerId": "..." }
}
```

- Example physics markup: `\\(p = \\frac{F}{S}\\)`; use `\\mathrm{}` for upright unit labels where needed. Keep value, unit and formula fields separate if an exercise needs machine checking.
- `mhchem`/KaTeX/MathJax only renders notation. A successful render does not verify the OCR, equation balance, units or scientific correctness. Optional semantic data (reactants/products, coefficients, states, conditions) must be separately reviewed. Never auto-balance or rewrite the quoted source equation.
- The frontend currently has no KaTeX/MathJax dependency. The research recommendation is KaTeX + mhchem as a candidate, not an implemented renderer. Decide rendering and sanitization in a separate implementation story before placing markup in student-facing content.

## 4. Taxonomy and content relationships

Use one integrated subject and keep the curriculum strands distinct from discipline tags:

```text
Subject KHTN → Grade 8 → Chapter → Topic → CurriculumOutcome
                                           └─ KnowledgeUnitVersion
                                                └─ LearningUnit / LessonVersion
                                                     ├─ READING sections
                                                     ├─ VIDEO reference/asset
                                                     ├─ STUDY_CARDS
                                                     ├─ QUIZ question set
                                                     └─ PracticalActivity → optional simulation pack
```

- Subject key: `KHTN`; grade key: `KHTN-8`.
- Curriculum strands are `MATTER`, `ENERGY`, `LIVING`, `EARTH_SKY`. A lesson may map to more than one strand; do not force an inaccurate primary strand.
- `CHEMISTRY`, `PHYSICS`, `BIOLOGY`, `EARTH_SCIENCE` are search/discipline tags, not separate subjects.
- Use stable IDs for chapter/topic/outcome/knowledge unit/lesson/step/question/card/video reference. Treat display titles as mutable labels, not joins.
- A chapter is a navigation grouping, not sufficient evidence that every item in it belongs to one outcome. Link each lesson and its assets/questions to relevant topic/outcome IDs; keep source-page locators alongside, not instead of, curriculum references.

## 5. Suggested versioned data bundle

This is a proposed content-pack layout for seed planning, not a claim that the importer or all tables exist today:

```text
content-packs/khtn/grade-8/<pack-version>/
  manifest.json                 # subject, grade, taxonomy version, pack version
  outcomes.jsonl                # official outcome IDs/statements and curriculum locators
  knowledge-units.jsonl         # reviewed facts/concepts/formulas + claim-source links
  lessons/chapter-01/lesson-02.json
  media/video-refs.jsonl         # one video per record, with topic/outcome/lesson mapping
  reviews.jsonl                  # named editorial, subject and rights decisions
```

Keep the local textbook transcription/source map in its evidence/staging area. The release bundle should contain only material whose rights allow the intended use, plus provenance and attribution. Binary MP4, captions, images and GLB belong in private versioned R2 storage when allowed; PostgreSQL/manifest stores metadata and immutable object references, not the binary.

Each `lesson-02.json` should conceptually contain:

```json
{
  "id": "khtn8-g08-ch01-l02",
  "subject": "KHTN",
  "grade": 8,
  "chapterId": "khtn8-g08-ch01",
  "topicIds": ["..."],
  "strandCodes": ["MATTER"],
  "disciplineTags": ["CHEMISTRY"],
  "outcomeCodes": ["official-outcome-id"],
  "knowledgeUnitIds": ["..."],
  "sourceRefs": [{ "sourceArtifactVersionId": "...", "locator": { "printedPageStart": 11, "lessonId": "lesson-02" } }],
  "steps": ["ordered READING / VIDEO / STUDY_CARDS / QUIZ steps"]
}
```

The real importer must validate the exact schema before a seed plan adopts it. Do not invent official outcome codes; the current source map's `chapter-01`/`lesson-02` are edition-navigation IDs, not outcome IDs.

## 6. How lesson, cards, quiz and video fit the current runtime

The current backend already supports `Lesson` and ordered `LessonStep` rows. `LessonStep.type` includes `READING`, `VIDEO`, `STUDY_CARDS`, `QUIZ`, `LAB`, and `CHALLENGE`; each step has a typed JSON `config`. Current config shapes include:

- `READING`: `{ "html": "..." }`
- `VIDEO`: `{ "url": "https://..." | "asset:<uuid>", "title": "...", "transcript"?: "...", "equivalentText"?: "..." }`
- `STUDY_CARDS`: `{ "cards": [{ "id": "...", "front": "...", "back": "..." }] }`
- `QUIZ`: `{ "questions": [{ "id": "...", "prompt": "...", "options": [{ "id": "...", "text": "..." }], "answerOptionId": "..." }] }`

Use one ordered `VIDEO` step per selected video and map it to the target lesson/topic/outcome. A playlist is not itself a lesson or a chapter map: split it into individual video references, review each item's license/attribution and relevance, then attach only the appropriate items. Do not download/rehost a YouTube video without explicit reusable rights.

`STUDY_CARDS` are the current flashcard feature (front/back); they are not the same as a graded quiz. Keep answer keys in the quiz config/server path; students receive the sanitized question/options. The existing video progress supports resume/high-water progress and completion events, but the current `VIDEO` config has no chapter markers or in-video question checkpoints. For now, put a normal `QUIZ` step after the video. Coursera-style timed questions need a separate contract/story and must not be faked as metadata.

For 3D/virtual labs, link from the learning outcome through a reviewed activity and scientific model to the simulation pack. A GLB/video is a visual asset, not the scientific rules or scoring authority. Do not attach a simulation just because a chapter has a video.

## 7. Admin entry, PRD fit, and selected direction

**Code inspection date:** 2026-10-16. This is source evidence, not a live admin-session verification.

The PRD's FR-09 expects student content to be organized by subject, grade, chapter, topic, and curriculum reference; FR-20 gives Admin management of content and subjects. C2-T2 further calls for Subject/Domain, Chapter, Topic, Outcome mapping, and reviewed shared-content lifecycle. The current Admin taxonomy screen and `/admin/*` APIs provide part of this workflow:

- Admin can manually add subjects, chapters, topics, and outcomes. Duplicate codes are rejected; mutations are audited. Chapters and outcomes can be archived/restored in the UI. The chapter API can rename a chapter, but the current UI does not expose rename. Topic update/archive exists in the API, but the current UI only lists and creates topics.
- Admin can manage shared lesson/content operations. Teachers can author private lessons in the lesson library. These are manual editor paths; there is no JSON/CSV source-map importer or Admin bulk-import/dry-run screen.
- Admin can create an outcome using code, grade, domain, chapter label, and statement, but the current form/API does not capture the official curriculum artifact ID/version or a document/page locator. `CurriculumOutcome.synthetic` defaults to false, so manually entered unverified outcomes can look like authoritative outcomes in coverage. Do not enter guessed outcomes as production taxonomy.
- Shared-lesson review records reviewer identity and review kind, and requires different identities for subject and rights review. The current review API is Admin-only, while the publish gate checks that reviewer fields exist; there is no reviewer-capability/qualification model or claim-level evidence. C2 explicitly says Admin identity is not itself scientific or rights approval, so this boundary needs implementation before treating the gate as a verified expert review.
- C2-T5 specifies SourceRegistry, ingestion run/item status, dry-run, and release receipt. Those surfaces and a content-release importer are not present in the current source code. The existing crawler writes local staging artifacts and is not a database importer.

**Selected direction 1:** start with a small, controlled Admin-managed batch: load only outcome/chapter/topic information checked against a named official curriculum document, then author original NexaLab lesson content and questions mapped to those outcomes. Keep the SGK OCR as source/navigation evidence; do not bulk-copy it into student lessons. Before entering authoritative outcomes through the current UI, add source artifact/version/locator provenance and validate it, so the database does not label unverified manual entries as non-synthetic authority. After that, implement a validated import preview/dry-run for repeatable larger batches.

This is aligned with the PRD's taxonomy and Admin-management intent, but the current Admin implementation is only a manual first slice. It does not satisfy the source-ingestion and provenance portions of Content Foundation or C2-T5.

## 8. What exists today vs. what is still target architecture

**Present in the current Prisma/runtime:** `Lesson`, `LessonStep`, `CurriculumOutcome`, `CurriculumChapter`, `CurriculumTopic`, `QuizAttempt`, `StepProgress`, `Asset`, `AssetVersion`, and legacy `AssetFile`. `Lesson` still has free-text chapter/topic fields and JSON `materials`/`questions`; lesson content does not yet have a dedicated immutable `ContentPackVersion` relation. Step configs are validated in `src/pathway.ts`; asset versions have a separate upload/finalize lifecycle.

**Not present as versioned Prisma entities or importer workflow yet:** `ContentPackVersion`, `KnowledgeUnitVersion`, `SourceArtifactVersion`, `ContentAsset`, `ContentRelease`, and `SourceRegistry`. Source-map/JSON files remain local evidence/data manifests, not rows automatically managed by the database. Current `Asset`/`AssetVersion` implementation exists, but its ticket acceptance/runtime status must be reconciled with the sprint tracker, which still describes these surfaces as deferred.

**Seed boundary:** `npm run db:seed` is for guarded development/test fixtures, not the release corpus. The planned content-pack importer/release lane under CF-T1/CF-T3 is separate from today's generic seed. Do not write the full SGK OCR into `Lesson.content` or production tables as a shortcut.

## 9. Cleanup and current readiness

- Canonical local source package for this work: `tools/nexalab-ingest/out/nxbgd-khtn8-20261015/extracted/sgk-khtn8-source-map-complete.json`.
- Keep `sgk.txt`, original PDF/page images, manifest, normalized page output and Docling/RapidOCR pilot results as evidence until a reviewed extraction is accepted. The empty `extracted/docling/` folder and the superseded temporary draft from the previous turn were removed; no source or OCR pilot data was deleted.
- The KHTN8 taxonomy spec remains `draft-for-outcome-mapping`. The tracker and current code are not fully reconciled: Asset/AssetVersion and media upload/finalize code exist, while the versioned content pack, source registry/importer, and corpus workflow remain absent. Required decisions include official outcome source/version, first content-pack scope, named editor/subject/rights reviewers, and measurable acceptance/coverage thresholds (Q-DATA-02..04).
- Before a real seed plan: (1) decide the rights-safe use of this SGK transcription; (2) import/review the official outcome map; (3) approve the pack schema/IDs; (4) decide which video refs are display-only vs. reusable assets; (5) name reviewers and acceptance thresholds; (6) only then plan a development dry-run and later release-import path.

## References

- [KHTN8 taxonomy SPEC](SPEC.md) and [current source evidence](source-evidence.md).
- [Content Foundation SPEC](../spec-content-foundation/SPEC.md), [tickets](../spec-content-foundation/tickets.md), and [data foundation](../../planning-artifacts/content-data-foundation.md).
- [Increment B/C plan](../../planning-artifacts/increment-b-c-plan.md), especially D16–D24.
- [Equation-markup research](../../planning-artifacts/research/technical-math-equation-markup-for-khtn8-2026-10-15/research.md).
