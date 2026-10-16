import { createHash } from "node:crypto";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const extractedDir = path.join(here, "out/nxbgd-khtn8-20261015/extracted");
const sourcePath = path.join(extractedDir, "sgk-khtn8-source-map-complete.json");
const source = JSON.parse(await readFile(sourcePath, "utf8"));
const sha256 = (value) => createHash("sha256").update(value, "utf8").digest("hex").toUpperCase();
const sourceId = "vn-khtn8-ket-noi-tri-thuc-reprint-3";
const outputDir = path.join(extractedDir, "full-book-seed.dev");
await mkdir(outputDir, { recursive: true });

const groups = [
  { id: "chapter-00", title: "MỞ ĐẦU", lessons: source.standaloneLessons },
  ...source.chapters.map(({ id, title, lessons }) => ({ id, title, lessons })),
];
const report = [];
const allIds = new Set();

for (const group of groups) {
  if (!Array.isArray(group.lessons) || !group.lessons.length) throw new Error(`Empty lesson group ${group.id}`);
  const sections = group.lessons.map((lesson) => {
    if (!lesson.content?.text || !lesson.content.sourceLocator) throw new Error(`Missing text or locator: ${lesson.id}`);
    if (allIds.has(lesson.id)) throw new Error(`Duplicate source section: ${lesson.id}`);
    allIds.add(lesson.id);
    const actualHash = sha256(lesson.content.text);
    if (actualHash !== lesson.content.textSha256) throw new Error(`Source text hash mismatch: ${lesson.id}`);
    const pages = lesson.printedPageRange;
    const locator = lesson.content.sourceLocator;
    if (!Number.isInteger(locator.lineStart) || !Number.isInteger(locator.lineEnd) || locator.lineEnd < locator.lineStart) throw new Error(`Invalid line locator: ${lesson.id}`);
    if (!Number.isInteger(pages?.start) || !Number.isInteger(pages?.end) || pages.end < pages.start) throw new Error(`Invalid printed page range: ${lesson.id}`);
    return {
      sourceSectionId: lesson.id,
      lessonNumber: lesson.lessonNumber,
      title: lesson.title,
      printedPageRange: { start: pages.start, end: pages.end, basis: pages.basis },
      sourceText: {
        file: locator.sourceTextPath,
        lineStart: locator.lineStart,
        lineEnd: locator.lineEnd,
        alignment: locator.pageAlignment,
        physicalPdfPageRange: {
          start: pages.start,
          end: pages.end,
          basis: "PRINTED_PAGE_APPROXIMATION_FOR_DEVELOPMENT_UI_ONLY",
        },
      },
      content: {
        kind: "EXTRACTED_OCR_TEXT",
        text: lesson.content.text,
        contentIncluded: true,
        sha256: actualHash,
        reviewStatus: "NEEDS_HUMAN_REVIEW",
        editorialCorrectionsApplied: false,
        studentFacing: false,
      },
    };
  });
  const payload = {
    schema: "nexalab.textbook-content-seed/v1",
    purpose: "development-only full textbook UI seed; source OCR remains unreviewed",
    developmentOnly: true,
    studentFacing: false,
    releaseEligible: false,
    importableToStaging: true,
    source: {
      sourceId,
      book: source.book,
      pdfSha256: source.provenance.pdf.sha256,
      sourceMapSchema: source.schema,
      sourceMapStatus: source.status,
      sourceMapPath: "sgk-khtn8-source-map-complete.json",
    },
    chapter: {
      sourceChapterId: group.id,
      title: group.title,
      grade: 8,
      subjectIdCandidate: "khtn",
      reviewStatus: "NEEDS_HUMAN_REVIEW",
      sections,
    },
  };
  const filename = `sgk-khtn8-${group.id}.content-seed.dev.json`;
  await writeFile(path.join(outputDir, filename), `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  report.push({ chapter: group.id, title: group.title, lessons: sections.length, contentCharacters: sections.reduce((sum, s) => sum + s.content.text.length, 0), file: filename });
}

if (allIds.size !== source.counts.lessonCount) throw new Error(`Expected ${source.counts.lessonCount} source lessons, found ${allIds.size}`);
console.log(JSON.stringify({ mode: "GENERATED_DEVELOPMENT_PAYLOADS_NO_DATABASE_WRITES", sourceStatus: source.status, totalLessons: allIds.size, chapters: report, totalContentCharacters: report.reduce((sum, item) => sum + item.contentCharacters, 0), locatorNote: "The source map does not provide physical PDF page numbers for lessons; payloads preserve printed page locators and label physical page values as development-only approximations." }, null, 2));
