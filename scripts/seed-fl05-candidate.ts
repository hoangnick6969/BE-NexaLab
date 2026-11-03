/** Isolated DB by default; the exact 2026-11-03 owner-approved candidate has a scoped remote exception. Creates authoring rows only. */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { readFile } from "node:fs/promises";
import { digestOf } from "../src/modules/content/application/content-pack";
import { packInputSchema, activitySpecSchema } from "../src/modules/labs/application/sim-packs";

export async function seedFl05Candidate(remoteApprovalDigest?: string) {
  if (remoteApprovalDigest !== "3afb7388188b213bb8eb255093ff38db6a31f5ef972f024ba2a98530265f34cc") {
    const urls = ["DATABASE_URL", "DIRECT_URL", "NEXALAB_ISOLATED_DATABASE_URL"].map((key) => new URL(process.env[key] ?? ""));
    if (urls.some((url) => !["postgres:", "postgresql:"].includes(url.protocol) || !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) || url.pathname === "/postgres" || url.pathname === "/") || urls.some((url) => url.host !== urls[0].host || url.pathname !== urls[0].pathname)) throw new Error("All database URLs must match a dedicated isolated loopback database");
  }
  const bundle = JSON.parse(await readFile("content/fl05/release-candidate.json", "utf8"));
  const hashes = JSON.parse(await readFile("content/fl05/digests.json", "utf8"));
  if (digestOf(bundle) !== hashes.candidateDigest) throw new Error("Candidate digest mismatch; run prepare-fl05");
  if (remoteApprovalDigest && hashes.candidateDigest !== remoteApprovalDigest) throw new Error("Remote override does not approve this candidate");
  const pack = packInputSchema.parse(bundle.pack);
  const { reviews, ...activity } = activitySpecSchema.parse(bundle.activity);
  const db = new PrismaClient();
  try {
    const owner = await db.user.findFirstOrThrow({ where: { role: "ADMIN", status: "active", disabledAt: null }, orderBy: { createdAt: "asc" } });
    await db.subject.findUniqueOrThrow({ where: { id: bundle.lab.subjectId } });
    await db.$transaction(async (tx) => {
      const current = await tx.lab.findUnique({ where: { id: "buoyancy" } });
      if (current && (current.simulationModelRef !== pack.modelRef || current.subjectId !== bundle.lab.subjectId)) throw new Error("Existing Lab differs; no data overwritten");
      if (!current) await tx.lab.create({ data: { id: "buoyancy", subjectId: bundle.lab.subjectId, title: bundle.content.title, grade: 8, topic: bundle.content.topic, topicCode: bundle.lab.topicCode, learningObjective: bundle.activity.objective, status: "published", scope: "CLASS_PRIVATE", releaseCleared: false, synthetic: false, simulationModelRef: pack.modelRef, config: { candidateDigest: hashes.candidateDigest }, assets: [] } });
      await tx.challenge.upsert({ where: { id: "buoyancy-001" }, create: { id: "buoyancy-001", labId: "buoyancy", objective: activity.objective, constraints: { params: {} } }, update: {} });
      const existingActivity = await tx.practicalActivityVersion.findUnique({ where: { key_version: { key: activity.key, version: 1 } } });
      if (existingActivity && (existingActivity.id !== pack.activityVersionId || existingActivity.digest !== digestOf(bundle.activity) || digestOf(existingActivity.spec) !== digestOf(activity))) throw new Error("Immutable activity conflict");
      if (!existingActivity) await tx.practicalActivityVersion.create({ data: { id: pack.activityVersionId, key: activity.key, version: 1, digest: digestOf(bundle.activity), spec: activity as any, reviews: reviews as any, createdById: owner.id } });
      const configData = { challengeParams: { "buoyancy-001": {} }, goldenCases: pack.template.goldenCases.map((item) => ({ challengeId: "buoyancy-001", label: item.label, labState: item.state, expectedVerdict: item.expectedVerdict })), reason: pack.reason };
      const oldConfig = await tx.simulationConfigVersion.findUnique({ where: { labId_version: { labId: "buoyancy", version: 1 } } });
      if (oldConfig && (oldConfig.status !== "active" || oldConfig.modelRef !== pack.modelRef || digestOf(oldConfig.challengeParams) !== digestOf(configData.challengeParams) || digestOf(oldConfig.goldenCases) !== digestOf(configData.goldenCases))) throw new Error("Immutable configuration conflict");
      if (!oldConfig) await tx.simulationConfigVersion.create({ data: { id: "fl05-config-v1", labId: "buoyancy", version: 1, modelRef: pack.modelRef, status: "active", ...configData as any, createdById: owner.id } });
      const oldPack = await tx.simulationPackVersion.findUnique({ where: { key_version: { key: pack.key, version: 1 } } });
      if (oldPack) {
        const persisted = packInputSchema.parse({ key: oldPack.key, labId: oldPack.labId, modelRef: oldPack.modelRef, activityVersionId: oldPack.activityVersionId, template: oldPack.template, visualAssetVersionId: oldPack.visualAssetVersionId, semanticMap: oldPack.semanticMap, bindings: oldPack.bindings, challengeTemplates: oldPack.challengeTemplates, reviews: oldPack.reviews, reason: oldPack.reason });
        if (oldPack.status !== "active" || digestOf(persisted) !== digestOf(pack)) throw new Error("Immutable simulation pack conflict");
      }
      if (!oldPack) await tx.simulationPackVersion.create({ data: { id: "fl05-pack-v1", key: pack.key, version: 1, labId: "buoyancy", modelRef: pack.modelRef, engineVersion: "1.0.0", activityVersionId: pack.activityVersionId, template: pack.template as any, visualAssetVersionId: null, semanticMap: pack.semanticMap, bindings: pack.bindings, challengeTemplates: pack.challengeTemplates, reviews: pack.reviews as any, reason: pack.reason, status: "active", createdById: owner.id } });
    }, { timeout: 30000 });
    console.log(JSON.stringify({ labId: "buoyancy", candidateDigest: hashes.candidateDigest, scope: "CLASS_PRIVATE", releaseCleared: false, ownerSignoffCreated: false }));
  } finally { await db.$disconnect(); }
}
if (process.argv[1]?.replaceAll("\\", "/").endsWith("seed-fl05-candidate.ts")) seedFl05Candidate().catch((error) => { console.error(error.message); process.exitCode = 1; });
