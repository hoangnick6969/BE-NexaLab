import { describe, expect, it } from "vitest";
import { digestOf } from "./content-pack";
import { planAdminDirectDraftRelease } from "./content-release";

function structuredLesson() {
  return {
    schemaVersion: 1,
    kind: "structured-lesson-candidate",
    status: "needs_review",
    book: {
      key: "book-8",
      title: "Textbook 8",
      author: "Publisher",
      version: "2026",
      sha256: "a".repeat(64),
      grade: 8,
    },
    chapter: { id: "chapter-1", title: "Chapter 1" },
    sourceLesson: { id: "source-lesson-1", title: "Lesson 1" },
    printedPageRange: { start: 10, end: 12 },
    pdfPageRange: { start: 12, end: 14 },
    sourcePdf: "source.pdf",
    ocrCoverage: [],
    sourceBlocks: [{ id: "block-1", text: "Evidence", pdfPage: 12 }],
    learningContent: {
      sections: [
        {
          id: "section-1",
          heading: "Section",
          content: "Grounded content",
          sourceBlockIds: ["block-1"],
        },
      ],
      summary: "Students can describe the source concept.",
      summarySourceBlockIds: ["block-1"],
      knowledgeUnits: [],
      definitions: [],
      formulas: [],
      tables: [],
      sourceImages: [],
      examples: [],
      basicExercises: [],
    },
    warnings: ["OCR warning retained"],
  };
}

function dbFor(manifest: any, digest = digestOf(manifest)) {
  return {
    subject: {
      findUnique: async () => ({ id: "khtn", name: "Khoa học tự nhiên" }),
    },
    contentPackVersion: {
      findMany: async () => [
        {
          id: "draft-1",
          packKey: "structured-book-one",
          version: 1,
          digest,
          manifest,
          status: "draft",
          synthetic: true,
          lessonId: null,
          releaseId: null,
          outcomeCodes: ["KHTN8-ENERGY-01"],
          curriculumChapterCode: "KHTN8-CH01",
          curriculumTopicCode: "KHTN8-CH01-T01",
          curriculumOrder: 1,
          classificationReview: { reviewerName: "Reviewer" },
          pack: {
            namespace: "fixture",
            subjectId: "khtn",
            grade: 8,
            domain: "ENERGY",
          },
        },
      ],
    },
    lesson: { findMany: async () => [] },
    contentRelease: { findUnique: async () => null },
  };
}

describe("ADMIN_DIRECT Structured Lesson release plan", () => {
  it("plans a source-integrity checked and curriculum-classified draft", async () => {
    const manifest = structuredLesson();
    const plan = await planAdminDirectDraftRelease(
      dbFor(manifest),
      {
        policy: "ADMIN_DIRECT",
        name: "Textbook release",
        subjectId: "khtn",
        draftIds: ["draft-1"],
      },
      "development",
    );

    expect(plan).toMatchObject({
      policy: "ADMIN_DIRECT",
      blocked: false,
      draftCount: 1,
      subject: { id: "khtn" },
    });
    expect(plan.drafts[0]).toMatchObject({
      digest: digestOf(manifest),
      sourceIdentity: "book-8:chapter-1:source-lesson-1",
      warningCount: 1,
      order: 1,
      domain: "ENERGY",
    });
  });

  it("blocks an invalid source digest before any release writes", async () => {
    const plan = await planAdminDirectDraftRelease(
      dbFor(structuredLesson(), "0".repeat(64)),
      {
        policy: "ADMIN_DIRECT",
        name: "Textbook release",
        subjectId: "khtn",
        draftIds: ["draft-1"],
      },
      "development",
    );

    expect(plan.blocked).toBe(true);
    expect(plan.blockers).toContain("draft-1: Digest không khớp nội dung nguồn");
  });

  it("blocks a source-valid draft until its KHTN curriculum mapping is reviewed", async () => {
    const manifest = structuredLesson();
    const db: any = dbFor(manifest);
    db.contentPackVersion.findMany = async () => [{ id: "draft-1", packKey: "structured-book-one", version: 1, digest: digestOf(manifest), manifest, status: "draft", synthetic: true, lessonId: null, releaseId: null, outcomeCodes: [], curriculumChapterCode: null, curriculumTopicCode: null, curriculumOrder: null, classificationReview: null, pack: { namespace: "fixture", subjectId: "khtn", grade: 8, domain: "UNCLASSIFIED" } }];
    const plan = await planAdminDirectDraftRelease(db, { policy: "ADMIN_DIRECT", name: "Textbook release", subjectId: "khtn", draftIds: ["draft-1"] }, "development");
    expect(plan.blocked).toBe(true);
    expect(plan.blockers).toEqual(expect.arrayContaining([
      "draft-1: Draft chưa có domain KHTN hợp lệ",
      "draft-1: Draft chưa mapping chuẩn đầu ra",
      "draft-1: Draft chưa mapping chapter/topic/order",
      "draft-1: Draft chưa có xác nhận review phân loại",
    ]));
  });

  it("allows a retry only when the exact released version is already linked to its receipt", async () => {
    const manifest = structuredLesson();
    const digest = digestOf(manifest);
    const releaseId = "release-1";
    const lessonId = "pack-structured-book-one-v1";
    const db: any = {
      subject: {
        findUnique: async () => ({ id: "khtn", name: "Khoa học tự nhiên" }),
      },
      contentPackVersion: {
        findMany: async () => [
          {
            id: "draft-1",
            packKey: "structured-book-one",
            version: 1,
            digest,
            manifest,
            status: "released",
            synthetic: false,
            lessonId,
            releaseId,
            pack: { namespace: "baseline", grade: 8, domain: "khtn8" },
          },
        ],
      },
      lesson: {
        findMany: async () => [{ id: lessonId, packVersionId: "draft-1" }],
      },
      contentRelease: {
        findUnique: async () => ({ id: releaseId, status: "APPLIED" }),
      },
    };

    const plan = await planAdminDirectDraftRelease(
      db,
      {
        policy: "ADMIN_DIRECT",
        name: "Textbook release",
        subjectId: "khtn",
        draftIds: ["draft-1"],
      },
      "development",
    );
    expect(plan).toMatchObject({ blocked: false, alreadyApplied: releaseId });
  });
});
