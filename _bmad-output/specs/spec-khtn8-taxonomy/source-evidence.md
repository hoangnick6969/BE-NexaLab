# Source Evidence and Extraction Status

## Inspected SGK artifact

- Local PDF: `tools/nexalab-ingest/out/nxbgd-khtn8-20261015/assets/SGK Khoa học tự nhiên 8-mau.pdf`
- Visible identity: *Khoa học tự nhiên 8*, Nhà xuất bản Giáo dục Việt Nam, “Tái bản lần thứ ba”.
- PDF structure: 200 pages, untagged, no bookmarks, and zero extractable text characters across all 200 pages.
- Table-of-contents evidence: printed pages 4–5 list one introductory lesson, eight chapters, and lessons 1–47. The catalog companion transcribes this outline.
- Crawl manifest: `status=NEEDS_REVIEW`, `releaseEligible=false`, 197 page-image assets. The normalized sections file is empty and reports `EMPTY_EXTRACTION` and `OCR_NOT_REQUESTED`.

The PDF is an image-only wrapper assembled from page images. Direct PDF text extraction therefore offers no quality advantage over OCR for this artifact.

## Extraction policy

1. OCR by page batch, beginning with table of contents, chapter openings, learning objectives, summaries, glossary, and pages selected for a pilot LearningUnit.
2. Preserve `sourceArtifactVersionId`, printed page number, PDF page index, image checksum, OCR engine/version, language, and block/region locator for every text block.
3. Keep OCR output in staging. Normalize Unicode NFC but do not silently correct equations, chemical formulae, units, tables, labels, or answer options.
4. Require human checks for equations, subscripts/superscripts, chemical notation, diagrams, tables, multi-column order, and any low-confidence text.
5. Use SGV and SBT as separate source artifacts and mappings. They may support pedagogy and assessment authoring but must not overwrite the SGK outline or official curriculum outcomes.

## Current crawled inventory observations

| Artifact | Current local form | Manifest observation | Taxonomy use now |
| --- | --- | --- | --- |
| SGK KHTN 8 | Page images plus 200-page image-only PDF | 197 page assets; normalized extraction empty | Source outline and page locators |
| SBT KHTN 8 | Page images | 7 assets in current manifest | Incomplete candidate source; inventory/re-crawl review required |
| SGV KHTN 8 | Page images | 244 assets | Candidate pedagogy/outcome-mapping support after extraction review |
| Tài liệu tập huấn | Page images | 60 assets | Candidate editorial/reference support; not learner content by default |

## Remaining authoritative input

The crawled folder does not contain a reviewed, versioned official Grade 8 KHTN curriculum-outcome dataset. Import that artifact separately before assigning authoritative outcome IDs or claiming curriculum coverage.
