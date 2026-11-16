import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { afterAll, describe, expect, it } from "vitest";
import { publishExploreLab } from "../application/explore-labs";
import { AdminLabsController } from "./admin-labs.controller";
import { exploreConfig } from "./explore-lab.fixture";

// Only an explicitly provisioned throwaway database is eligible; no app .env fallback.
const testUrl = process.env.NEXALAB_PINNING_TEST_URL;
if (testUrl) {
  const url = new URL(testUrl);
  if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) || url.pathname !== "/nexalab_pinning_test")
    throw new Error("NEXALAB_PINNING_TEST_URL must name the isolated local nexalab_pinning_test database");
}
const db = testUrl ? new PrismaClient({ datasourceUrl: testUrl }) : null;
afterAll(async () => { await db?.$disconnect(); });

describe.skipIf(!db)("Explore publish on isolated PostgreSQL (P0 C1.3)", () => {
  it("API and seed share one version, attach Explore beside a Guided Lab (D-5), and Explore creates no LabRun, Attempt or Progress", async () => {
    const p = db!;
    const labId = `p0-explore-${randomUUID().slice(0, 8)}`;
    const guidedId = `${labId}-g`;
    const admin = await p.user.findFirstOrThrow({ where: { role: "ADMIN", status: "active" }, select: { id: true } });
    const topic = await p.curriculumTopic.findFirstOrThrow({ select: { code: true } });
    const actor = { sub: admin.id, role: "ADMIN" };
    const counts = () => Promise.all([p.labRun.count(), p.attempt.count(), p.progress.count()]);
    const before = await counts();
    try {
      const viaSeed = await publishExploreLab(p, { config: exploreConfig(labId), topicCode: topic.code, actor, reason: "P0 isolated test" });
      const viaApi = await new AdminLabsController(p as any, {} as any).publishExploreVersion(labId, { user: actor }, { config: exploreConfig(labId), topicCode: topic.code, reason: "P0 isolated test" });
      expect(viaSeed.activityCreated).toBe(true);
      expect(viaApi).toMatchObject({ activityCreated: false, activity: viaSeed.activity });
      expect(await p.practicalActivityVersion.count({ where: { key: `${labId}-explore` } })).toBe(1);
      const lab = await p.lab.findUniqueOrThrow({ where: { id: labId } });
      expect(lab.config).toEqual({ mode: "explore", kit: "k2-wet-bench@1", engine: "wet-bench@1.0.0", activity: viaSeed.activity });
      expect(lab).toMatchObject({ status: "published", scope: "SHARED_LIBRARY", releaseCleared: true });
      expect(await p.auditLog.count({ where: { action: "lab.explore.publish", targetId: labId } })).toBe(2);

      await p.lab.create({ data: { id: guidedId, subjectId: lab.subjectId, grade: lab.grade, title: "Guided fixture", topic: lab.topic, topicCode: lab.topicCode,
        learningObjective: "fixture", status: "draft", scope: "CLASS_PRIVATE", releaseCleared: false, synthetic: true, simulationModelRef: "wet-bench@1.0.0" } });
      await p.challenge.create({ data: { id: `${guidedId}-c`, labId: guidedId, objective: "fixture", constraints: {} } });
      // D-5 (lab-two-mode-d5-spec.md §2.3): Explore is attached to the Guided Lab as config.explore; its model, challenge,
      // status and scope stay, and publishing still creates no LabRun, Attempt or Progress.
      const attached = await publishExploreLab(p, { config: exploreConfig(guidedId), topicCode: topic.code, actor, reason: "P0 isolated test" });
      expect(attached).toMatchObject({ labId: guidedId, labCreated: false, modes: ["guided", "explore"] });
      const guided = await p.lab.findUniqueOrThrow({ where: { id: guidedId } });
      expect(guided).toMatchObject({ status: "draft", scope: "CLASS_PRIVATE", releaseCleared: false, simulationModelRef: "wet-bench@1.0.0" });
      expect(guided.config).toEqual({ explore: { kit: "k2-wet-bench@1", engine: "wet-bench@1.0.0", activity: attached.activity } });
      expect(await p.challenge.count({ where: { labId: guidedId } })).toBe(1);
      expect(await p.auditLog.count({ where: { action: "lab.explore.attach", targetId: guidedId } })).toBe(1);
      expect(await counts()).toEqual(before);
    } finally {
      await p.challenge.deleteMany({ where: { labId: guidedId } });
      await p.lab.deleteMany({ where: { id: { in: [labId, guidedId] } } });
      await p.practicalActivityVersion.deleteMany({ where: { key: { in: [`${labId}-explore`, `${guidedId}-explore`] } } });
    }
  });
});
