import { ConflictException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { AdminCurriculumController, curriculumTargetInfo } from "./admin-curriculum.controller";

const body = {
  id: "NX-FW-VN2018-2025-1234ABCD",
  frameworkKey: "VN2018",
  title: "Vietnam General Education Curriculum",
  version: "2025.1",
  sourceMetadata: {
    authority: "Ministry of Education",
    url: "https://example.gov.vn/curriculum.pdf",
    publishedAt: "2018-12-26",
    accessedAt: "2026-10-24",
    sha256: "a".repeat(64),
    checksumScope: "canonical_citation",
    citation: "Official curriculum citation supplied by the project owner",
    regulation: "Circular 32/2018",
    textbook: { title: "Khoa học tự nhiên", publisher: "Education Publisher", gradeRange: "6-9" },
  },
  subjects: [{ subjectId: "khtn", grade: 8 }],
  reason: "Verified framework source and review",
};

function harness(existing: any = null, existingOutcome: any = null) {
  const tx = {
    curriculumFramework: {
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn().mockResolvedValue(existing),
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockImplementation(async ({ data }) => ({ ...data, subjects: [{ subjectId: "khtn", grade: 8 }] })),
    },
    curriculumOutcome: {
      findUnique: vi.fn().mockResolvedValue(existingOutcome),
      create: vi.fn().mockImplementation(async ({ data }) => data),
      update: vi.fn().mockImplementation(async ({ data }) => ({ ...existingOutcome, ...data })),
    },
    subject: { findMany: vi.fn().mockResolvedValue([{ id: "khtn" }]) },
    auditLog: { create: vi.fn().mockResolvedValue({}) },
    $queryRaw: vi.fn().mockResolvedValue([{ present: true }]),
  };
  const db: any = { ...tx, $transaction: (callback: (client: typeof tx) => unknown) => callback(tx) };
  return { controller: new AdminCurriculumController(db), tx };
}

describe("AdminCurriculumController curriculum frameworks", () => {
  it("confirms only development with both database URLs on loopback", () => {
    const local = "postgresql://user:password@127.0.0.1:5432/nexalab";
    expect(curriculumTargetInfo({ APP_ENV: "development", DATABASE_URL: local, DIRECT_URL: local })).toEqual({ environment: "development", configuredConnections: 2, localDevelopmentTarget: true, remoteDevelopmentTarget: false, projectRef: null });
    expect(curriculumTargetInfo({ APP_ENV: "development", DATABASE_URL: local, DIRECT_URL: "postgresql://user:password@db.example.test:5432/nexalab" }).localDevelopmentTarget).toBe(false);
    expect(curriculumTargetInfo({ APP_ENV: "production", DATABASE_URL: local, DIRECT_URL: local }).localDevelopmentTarget).toBe(false);
  });

  it("confirms a remote development target only when both connections resolve to one allowlisted Supabase project", () => {
    const pooler = "postgresql://postgres.projectref:password@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres";
    const direct = "postgresql://postgres:password@db.projectref.supabase.co:5432/postgres";
    expect(curriculumTargetInfo({ APP_ENV: "development", DATABASE_URL: pooler, DIRECT_URL: direct, CURRICULUM_REMOTE_DEVELOPMENT_PROJECT_REFS: "projectref" })).toMatchObject({ remoteDevelopmentTarget: true, projectRef: "projectref" });
    expect(curriculumTargetInfo({ APP_ENV: "development", DATABASE_URL: pooler, DIRECT_URL: direct }).remoteDevelopmentTarget).toBe(false);
    expect(curriculumTargetInfo({ APP_ENV: "production", DATABASE_URL: pooler, DIRECT_URL: direct, CURRICULUM_REMOTE_DEVELOPMENT_PROJECT_REFS: "projectref" }).remoteDevelopmentTarget).toBe(false);
  });

  it("creates a framework version with source provenance and subject-grade links", async () => {
    const { controller, tx } = harness();
    const result = await controller.createFramework({ user: { sub: "admin-1", role: "ADMIN" } }, body);
    expect(tx.curriculumFramework.create).toHaveBeenCalledWith({
      data: {
        id: body.id,
        frameworkKey: body.frameworkKey,
        title: body.title,
        version: body.version,
        sourceMetadata: body.sourceMetadata,
        subjects: { create: body.subjects },
      },
      include: { subjects: { select: { subjectId: true, grade: true } } },
    });
    expect(tx.auditLog.create).toHaveBeenCalledOnce();
    expect(result).toMatchObject({ id: body.id, version: body.version });
  });

  it("refuses an existing framework identity instead of overwriting it", async () => {
    const { controller, tx } = harness({ id: body.id });
    await expect(controller.createFramework({ user: { sub: "admin-1", role: "ADMIN" } }, body)).rejects.toBeInstanceOf(ConflictException);
    expect(tx.curriculumFramework.create).not.toHaveBeenCalled();
    expect(tx.auditLog.create).not.toHaveBeenCalled();
  });
});

const evidence = {
  evidenceId: "b".repeat(64),
  originType: "textbook_derived_internal",
  sourceDigest: "a".repeat(64),
  sourceIdentity: "book@edition:lesson-1",
  sourceLocators: [{ sourceBlockId: "source-block-1", physicalPageIndex: 14, printedPageLabel: "12" }],
  reviewReference: {
    proposalVersion: "c".repeat(64),
    reviewId: "review-1",
    reviewerName: "Human Reviewer",
    reviewerEmail: "reviewer@example.test",
    reason: "Verified source statement and page evidence",
    reviewedAt: "2026-10-25T00:00:00.000Z",
    decision: "approved_internal",
  },
};

describe("AdminCurriculumController outcome provenance", () => {
  it("requires and stores source digest, block/page locator and human review reference", async () => {
    const { controller, tx } = harness();
    const req = { user: { sub: "admin-1", role: "ADMIN" } };
    const body = { code: "NXO-0123456789ABCDEF0123", grade: 8, domain: "MATTER", chapter: "Chapter one", statement: "Describe the source-backed model.", sourceEvidence: [evidence], reason: "Human-reviewed internal outcome" };
    await controller.createOutcome(req, body);
    const { reason: _reason, ...outcomeData } = body;
    expect(tx.curriculumOutcome.create).toHaveBeenCalledWith({ data: outcomeData });
    await expect(controller.createOutcome(req, { ...body, sourceEvidence: undefined })).rejects.toThrow();
  });

  it("appends source evidence idempotently without replacing prior provenance", async () => {
    const existing = { code: "NXO-0123456789ABCDEF0123", grade: 8, domain: "MATTER", chapter: "Chapter one", statement: "Describe the source-backed model.", status: "active", sourceEvidence: [evidence] };
    const { controller, tx } = harness(null, existing);
    const added = { ...evidence, evidenceId: "d".repeat(64), sourceIdentity: "other-book@edition:lesson-2" };
    const request = { statement: existing.statement, status: "active", sourceEvidence: [added], reason: "Attach reviewed cross-book provenance" };
    await controller.updateOutcome(existing.code, { user: { sub: "admin-1", role: "ADMIN" } }, request);
    await controller.updateOutcome(existing.code, { user: { sub: "admin-1", role: "ADMIN" } }, {
      statement: existing.statement, status: "active", sourceEvidence: [added], reason: "Attach reviewed cross-book provenance",
    });
    expect(tx.curriculumOutcome.update).toHaveBeenCalledWith({
      where: { code: existing.code },
      data: { statement: existing.statement, status: "active", sourceEvidence: [evidence, added] },
    });
  });

  it("reports provenance persistence only when the additive migration column exists", async () => {
    const { controller, tx } = harness();
    tx.$queryRaw.mockResolvedValueOnce([{ present: false }]);
    await expect(controller.curriculumTarget()).resolves.toMatchObject({ outcomeSourceEvidencePersisted: false });
    await expect(controller.curriculumTarget()).resolves.toMatchObject({ outcomeSourceEvidencePersisted: true });
  });
});
