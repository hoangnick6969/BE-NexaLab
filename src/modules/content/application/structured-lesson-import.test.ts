import { describe, expect, it } from "vitest";
import { importStructuredLessons, structuredLessonSchema } from "./structured-lesson-import";

function lesson(id = "lesson-a"): any {
  return {
    schemaVersion: 1,
    kind: "structured-lesson-candidate",
    status: "needs_review",
    book: {
      key: "khtn8",
      title: "Synthetic fixture",
      author: "NexaLab",
      version: "1",
      sha256: "a".repeat(64),
      grade: 8,
    },
    chapter: { id: "chapter-1", title: "Fixture chapter" },
    sourceLesson: { id, title: "Fixture lesson", tocProvenance: { row: 3 } },
    printedPageRange: { start: 1, end: 2 },
    pdfPageRange: { start: 0, end: 1 },
    sourcePdf: "fixture.pdf",
    ocrCoverage: [
      {
        pdfPage: 0,
        sourceVersion: "1",
        sourceSha256: "a".repeat(64),
        sourceBlockIds: ["block-1"],
      },
    ],
    sourceBlocks: [
      {
        id: "block-1",
        text: "fixture",
        physicalPageIndex: 1,
        extractionMethod: "test",
        sourceSha256: "a".repeat(64),
      },
    ],
    learningContent: {
      sections: [
        {
          id: "section-1",
          heading: "Heading",
          content: "Body",
          sourceBlockIds: ["block-1"],
        },
      ],
      summary: "Summary",
      summarySourceBlockIds: ["block-1"],
      knowledgeUnits: [
        {
          id: "unit-1",
          title: "Unit",
          claims: [{ id: "claim-1", text: "Claim" }],
          sourceBlockIds: ["block-1"],
        },
      ],
      definitions: [{ text: "Definition" }],
      formulas: [{ id: "formula-1", text: "x = 1" }],
      tables: [{ id: "table-1", rows: [["a", "b"]] }],
      sourceImages: [{ id: "image-1", sourceBlockIds: ["block-1"] }],
      examples: [{ text: "Example" }],
      basicExercises: [],
    },
    warnings: [],
    contentReview: { status: "needs_review", history: [] },
  };
}

function memoryDb(existingLessonIds: string[] = []) {
  const packs = new Map<string, any>();
  const versions: any[] = [];
  let next = 1;
  const db: any = {
    $transaction: (work: (tx: any) => unknown) => work(db),
    lesson: {
      findUnique: async ({ where }: any) => (existingLessonIds.includes(where.id) ? { id: where.id } : null),
    },
    contentPack: {
      findUnique: async ({ where }: any) => packs.get(where.key) ?? null,
      create: async ({ data }: any) => {
        packs.set(data.key, data);
        return data;
      },
    },
    contentPackVersion: {
      findUnique: async ({ where }: any) => versions.find((item) => item.packKey === where.packKey_digest.packKey && item.digest === where.packKey_digest.digest) ?? null,
      findFirst: async ({ where }: any) => versions.filter((item) => item.packKey === where.packKey).sort((a, b) => b.version - a.version)[0] ?? null,
      create: async ({ data }: any) => {
        const item = { id: `draft-${next++}`, ...data };
        versions.push(item);
        return item;
      },
    },
  };
  return { db, versions };
}

describe("Structured Lesson draft import", () => {
  it("accepts and stores the full payload without dropping formulas, tables, source blocks or provenance", async () => {
    const candidate = lesson();
    expect(structuredLessonSchema.parse(candidate)).toEqual(candidate);
    const { db, versions } = memoryDb();
    const first = await importStructuredLessons(db, [candidate]);
    expect(first).toMatchObject({ imported: 1, conflicts: 0 });
    expect(versions[0]).toMatchObject({
      status: "draft",
      synthetic: true,
      manifest: candidate,
    });
    expect(versions[0].manifest.learningContent.formulas).toEqual(candidate.learningContent.formulas);
    expect(versions[0].manifest.learningContent.tables).toEqual(candidate.learningContent.tables);
    expect(versions[0].manifest.sourceBlocks).toEqual(candidate.sourceBlocks);
    expect(versions[0].manifest.ocrCoverage).toEqual(candidate.ocrCoverage);
  });

  it("is idempotent and reports seed Lesson ID collisions without writing over them", async () => {
    const { db, versions } = memoryDb(["seeded-lesson"]);
    const candidate = lesson("new-lesson");
    const first = await importStructuredLessons(db, [candidate]);
    const retry = await importStructuredLessons(db, [candidate]);
    const conflict = await importStructuredLessons(db, [lesson("seeded-lesson")]);
    expect(first.imported).toBe(1);
    expect(retry.unchanged).toBe(1);
    expect(conflict.results[0]).toMatchObject({
      status: "conflict",
      reason: "Lesson ID already exists",
    });
    expect(versions).toHaveLength(1);
    expect(versions[0].manifest.sourceLesson.id).toBe("new-lesson");
  });

  it("imports a 47-item synthetic batch as drafts", async () => {
    const { db, versions } = memoryDb();
    const batch = Array.from({ length: 47 }, (_, index) => lesson(`fixture-${index + 1}`));
    const result = await importStructuredLessons(db, batch);
    expect(result).toMatchObject({
      count: 47,
      imported: 47,
      unchanged: 0,
      conflicts: 0,
    });
    expect(versions).toHaveLength(47);
    expect(versions.every((item) => item.status === "draft" && item.synthetic)).toBe(true);
  });
});
