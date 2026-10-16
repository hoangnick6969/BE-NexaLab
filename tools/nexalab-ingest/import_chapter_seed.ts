import "dotenv/config";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { Prisma, PrismaClient } from "@prisma/client";
import { z } from "zod";
import { seedUrl } from "../../src/database-config";

const inputPath = path.resolve(
  process.argv.find((arg) => arg.startsWith("--input="))?.slice(8) ??
    "tools/nexalab-ingest/out/nxbgd-khtn8-20261015/extracted/sgk-khtn8-chapter-01.content-seed.dev.json",
);
const apply = process.argv.includes("--apply");
const dryRun = process.argv.includes("--dry-run");
const validateOnly = process.argv.includes("--validate-only");
if ([apply, dryRun, validateOnly].filter(Boolean).length !== 1)
  throw new Error("Pass exactly one of --validate-only, --dry-run, or --apply");

const pageRange = z
  .object({
    start: z.number().int().positive(),
    end: z.number().int().positive(),
  })
  .passthrough();
const sectionSchema = z
  .object({
    sourceSectionId: z.string().min(1),
    lessonNumber: z.number().int().positive(),
    title: z.string().min(1),
    printedPageRange: pageRange,
    sourceText: z
      .object({
        lineStart: z.number().int().positive(),
        lineEnd: z.number().int().positive(),
        physicalPdfPageRange: pageRange,
      })
      .passthrough(),
    content: z
      .object({
        kind: z.literal("EXTRACTED_OCR_TEXT"),
        text: z.string().min(1).nullable(),
        contentIncluded: z.boolean(),
        sha256: z.string().regex(/^[A-F0-9]{64}$/),
        reviewStatus: z.literal("NEEDS_HUMAN_REVIEW"),
        editorialCorrectionsApplied: z.literal(false),
        studentFacing: z.literal(false),
      })
      .passthrough(),
  })
  .passthrough();
const payloadSchema = z
  .object({
    schema: z.literal("nexalab.textbook-content-seed/v1"),
    developmentOnly: z.literal(true),
    studentFacing: z.literal(false),
    releaseEligible: z.literal(false),
    importableToStaging: z.boolean(),
    source: z
      .object({
        sourceId: z.string().min(1),
        book: z
          .object({
            title: z.string().min(1),
            series: z.string().min(1),
            publisher: z.string().min(1),
            publicationYear: z.number().int(),
            reprint: z.number().int().optional(),
            isbn: z.string().optional(),
            language: z.string().min(1),
          })
          .passthrough(),
        pdfSha256: z.string().regex(/^[A-F0-9]{64}$/),
        sourceMapSchema: z.string().min(1),
      })
      .passthrough(),
    chapter: z
      .object({
        sourceChapterId: z.string().min(1),
        title: z.string().min(1),
        grade: z.number().int().positive(),
        sections: z.array(sectionSchema).min(1),
      })
      .passthrough(),
  })
  .passthrough();

async function main() {
  const payload = payloadSchema.parse(
    JSON.parse(await readFile(inputPath, "utf8")),
  );
  const ids = new Set<string>();
  for (const section of payload.chapter.sections) {
    if (ids.has(section.sourceSectionId))
      throw new Error(`Duplicate section ID: ${section.sourceSectionId}`);
    ids.add(section.sourceSectionId);
    if (
      section.printedPageRange.end < section.printedPageRange.start ||
      section.sourceText.physicalPdfPageRange.end <
        section.sourceText.physicalPdfPageRange.start ||
      section.sourceText.lineEnd < section.sourceText.lineStart
    )
      throw new Error(`Invalid locator range: ${section.sourceSectionId}`);
    if (section.content.text === null) {
      if (section.content.contentIncluded)
        throw new Error(`Missing included content: ${section.sourceSectionId}`);
      continue;
    }
    if (!section.content.contentIncluded)
      throw new Error(
        `Content is present but marked omitted: ${section.sourceSectionId}`,
      );
    const digest = createHash("sha256")
      .update(section.content.text, "utf8")
      .digest("hex")
      .toUpperCase();
    if (digest !== section.content.sha256)
      throw new Error(`Content hash mismatch: ${section.sourceSectionId}`);
  }

  if (validateOnly) {
    console.log(
      JSON.stringify(
        {
          mode: "CONTRACT_VALIDATION_ONLY_NO_WRITES",
          input: inputPath,
          schema: payload.schema,
          sections: payload.chapter.sections.length,
          validation: "PASS",
        },
        null,
        2,
      ),
    );
    return;
  }
  if (!payload.importableToStaging)
    throw new Error("Payload is explicitly marked non-importable");
  if (
    payload.chapter.sections.some(
      (section) => !section.content.contentIncluded || !section.content.text,
    )
  )
    throw new Error(
      "Content bodies are required for dry-run/import; use --validate-only for a redacted fixture",
    );
  if (process.env.APP_ENV !== "development")
    throw new Error("Dry-run/import requires APP_ENV=development");
  const targetUrl = new URL(seedUrl(process.env));

  const preview = {
    mode: dryRun ? "DRY_RUN_NO_WRITES" : "DEVELOPMENT_SOURCE_STAGING_IMPORT",
    input: inputPath,
    targetModels: ["TextbookSource", "TextbookSourceChunk"],
    sourceId: payload.source.sourceId,
    databaseTarget: `${targetUrl.hostname}${targetUrl.pathname}`,
    chapter: payload.chapter.sourceChapterId,
    sectionCount: payload.chapter.sections.length,
    sections: payload.chapter.sections.map((section) => ({
      sourceSectionId: section.sourceSectionId,
      lessonNumber: section.lessonNumber,
      title: section.title,
      printedPages: section.printedPageRange,
      physicalPdfPages: section.sourceText.physicalPdfPageRange,
      lineRange: {
        start: section.sourceText.lineStart,
        end: section.sourceText.lineEnd,
      },
      contentCharacters: section.content.text?.length ?? 0,
      sha256: section.content.sha256,
      reviewStatus: section.content.reviewStatus,
      studentFacing: section.content.studentFacing,
    })),
    contentCharacters: payload.chapter.sections.reduce(
      (sum, section) => sum + (section.content.text?.length ?? 0),
      0,
    ),
    validation: "PASS",
    studentFacing: false,
    releaseEligible: false,
    writes: dryRun ? 0 : "pending database transaction",
  };
  if (dryRun) {
    console.log(JSON.stringify(preview, null, 2));
    return;
  }

  if (process.env.APP_ENV !== "development")
    throw new Error("Import requires APP_ENV=development");
  const db = new PrismaClient({ datasourceUrl: seedUrl(process.env) });
  try {
    const result = await db.$transaction(
      async (tx) => {
        const sourceData = {
          sourceId: payload.source.sourceId,
          title: payload.source.book.title,
          series: payload.source.book.series,
          publisher: payload.source.book.publisher,
          publicationYear: payload.source.book.publicationYear,
          reprint: payload.source.book.reprint ?? null,
          isbn: payload.source.book.isbn ?? null,
          language: payload.source.book.language,
          pdfSha256: payload.source.pdfSha256,
          sourceMapSchema: payload.source.sourceMapSchema,
        };
        const existingSource = await tx.textbookSource.findUnique({
          where: { sourceId: sourceData.sourceId },
        });
        if (existingSource) {
          const sourceFields = [
            "title",
            "series",
            "publisher",
            "publicationYear",
            "reprint",
            "isbn",
            "language",
            "pdfSha256",
            "sourceMapSchema",
          ] as const;
          if (
            sourceFields.some((key) => existingSource[key] !== sourceData[key])
          )
            throw new Error(
              "Source metadata/hash conflict; refusing to overwrite existing source",
            );
        }
        if (!existingSource)
          await tx.textbookSource.create({ data: sourceData });

        let created = 0;
        let skipped = 0;
        for (const section of payload.chapter.sections) {
          const contentText = section.content.text;
          if (contentText === null)
            throw new Error(
              `Content body is absent: ${section.sourceSectionId}`,
            );
          const unique = {
            sourceId_sourceSectionId: {
              sourceId: sourceData.sourceId,
              sourceSectionId: section.sourceSectionId,
            },
          };
          const existing = await tx.textbookSourceChunk.findUnique({
            where: unique,
          });
          if (existing) {
            if (existing.contentSha256 !== section.content.sha256)
              throw new Error(
                `Content hash conflict; refusing overwrite: ${section.sourceSectionId}`,
              );
            const sameMetadata =
              existing.chapterId === payload.chapter.sourceChapterId &&
              existing.chapterTitle === payload.chapter.title &&
              existing.grade === payload.chapter.grade &&
              existing.lessonNumber === section.lessonNumber &&
              existing.title === section.title &&
              existing.printedPageStart === section.printedPageRange.start &&
              existing.printedPageEnd === section.printedPageRange.end &&
              existing.physicalPdfPageStart ===
                section.sourceText.physicalPdfPageRange.start &&
              existing.physicalPdfPageEnd ===
                section.sourceText.physicalPdfPageRange.end &&
              existing.sourceTextLineStart === section.sourceText.lineStart &&
              existing.sourceTextLineEnd === section.sourceText.lineEnd;
            if (!sameMetadata)
              throw new Error(
                `Locator/metadata conflict; refusing overwrite: ${section.sourceSectionId}`,
              );
            skipped++;
            continue;
          }
          await tx.textbookSourceChunk.create({
            data: {
              sourceId: sourceData.sourceId,
              sourceSectionId: section.sourceSectionId,
              chapterId: payload.chapter.sourceChapterId,
              chapterTitle: payload.chapter.title,
              grade: payload.chapter.grade,
              lessonNumber: section.lessonNumber,
              title: section.title,
              content: contentText,
              contentSha256: section.content.sha256,
              reviewStatus: "NEEDS_HUMAN_REVIEW",
              ocrReviewed: false,
              studentFacing: false,
              printedPageStart: section.printedPageRange.start,
              printedPageEnd: section.printedPageRange.end,
              physicalPdfPageStart:
                section.sourceText.physicalPdfPageRange.start,
              physicalPdfPageEnd: section.sourceText.physicalPdfPageRange.end,
              sourceTextLineStart: section.sourceText.lineStart,
              sourceTextLineEnd: section.sourceText.lineEnd,
              locatorEvidence: JSON.parse(
                JSON.stringify({
                  alignment: section.sourceText.alignment,
                  review: section.review,
                }),
              ) as Prisma.InputJsonValue,
            },
          });
          created++;
        }
        return {
          sourceCreated: existingSource ? 0 : 1,
          chunksCreated: created,
          chunksSkipped: skipped,
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
    console.log(
      JSON.stringify({ ...preview, mode: "IMPORTED", writes: result }, null, 2),
    );
  } finally {
    await db.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(
    error instanceof Error ? error.message : "Textbook seed failed",
  );
  process.exitCode = 1;
});
