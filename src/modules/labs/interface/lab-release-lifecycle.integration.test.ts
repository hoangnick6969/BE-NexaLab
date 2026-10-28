import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { ConflictException } from "@nestjs/common";
import { afterAll, describe, expect, it } from "vitest";
import { digest } from "../application/lab-run";
import { LabReleaseService } from "../application/lab-release.service";

const testUrl = process.env.NEXALAB_PINNING_TEST_URL;
if (process.env.CI && !testUrl) throw new Error("CI requires NEXALAB_PINNING_TEST_URL for Lab release lifecycle integration");
if (testUrl) {
  const url = new URL(testUrl);
  if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) || url.pathname !== "/nexalab_pinning_test")
    throw new Error("Lab release lifecycle integration only accepts isolated local nexalab_pinning_test");
}

const db = testUrl ? new PrismaClient({ datasourceUrl: testUrl }) : null;
afterAll(async () => { await db?.$disconnect(); });

describe.skipIf(!db)("isolated Foundational Lab release lifecycle", () => {
  it("keeps a draft private and refuses activation without recorded human review receipts", async () => {
    const p = db!;
    const suffix = randomUUID().slice(0, 8);
    const labId = `p36-release-gate-${suffix}`;
    const subjectId = `p36-subject-${suffix}`;
    await p.subject.create({ data: { id: subjectId, name: "Private P3.6 release-gate fixture" } });
    const lab = await p.lab.create({ data: {
      id: labId, subjectId, title: "Private release-gate fixture", topic: "fixture",
      learningObjective: "Verify that unreviewed releases stay private", status: "draft",
      scope: "CLASS_PRIVATE", releaseCleared: false, synthetic: true,
      simulationModelRef: "chemistry@1.0.0",
    } });
    const snapshot = { requiredReviewKinds: ["CURRICULUM", "SUBJECT", "MODEL", "SAFETY", "RIGHTS"] };
    const release = await p.labRelease.create({ data: {
      labId, version: 1, digest: digest(snapshot), snapshot, status: "DRAFT",
      reason: "Private lifecycle gate test", createdById: `fixture-admin-${suffix}`,
    } });

    const service = new LabReleaseService(p as any);
    let thrown: unknown;
    try {
      await service.activate(labId, release.id, { user: { sub: `fixture-admin-${suffix}` } }, { reason: "Must remain blocked without human review" });
    } catch (error) { thrown = error; }

    expect(thrown).toBeInstanceOf(ConflictException);
    expect((thrown as ConflictException).getResponse()).toMatchObject({ code: "LAB_RELEASE_NOT_APPROVED" });
    const [unchangedLab, unchangedRelease, activeRelease, reviews] = await Promise.all([
      p.lab.findUniqueOrThrow({ where: { id: labId } }),
      p.labRelease.findUniqueOrThrow({ where: { id: release.id } }),
      p.labRelease.findFirst({ where: { labId, status: "ACTIVE" } }),
      p.labReleaseReview.count({ where: { releaseId: release.id } }),
    ]);
    expect(unchangedLab).toMatchObject({ status: lab.status, scope: lab.scope, releaseCleared: false });
    expect(unchangedRelease.status).toBe("DRAFT");
    expect(activeRelease).toBeNull();
    expect(reviews).toBe(0);
  });
});
