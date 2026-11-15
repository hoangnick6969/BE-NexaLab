import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { captureCurrentLabExecution } from "../src/modules/labs/application/assignment-lab-execution";
import { digest } from "../src/modules/labs/application/lab-run";
import { goldenTemplates } from "../src/modules/labs/application/simulation-versions";
const url = process.env.NEXALAB_ISOLATED_DATABASE_URL;
if (!url || url !== process.env.DATABASE_URL || url !== process.env.DIRECT_URL ||
    !["127.0.0.1", "localhost", "[::1]"].includes(new URL(url).hostname) || new URL(url).pathname !== "/nexalab_tai74")
  throw new Error("Use the dedicated loopback nexalab_tai74 database for this T4 test");
const db = new PrismaClient({ datasourceUrl: url });
async function main() {
  await db.$transaction(async (tx) => {
    if (await tx.labRelease.findFirst({ where: { labId: "circuit", status: "ACTIVE" } })) return;
    const admin = await tx.user.findUniqueOrThrow({ where: { email: "admin@nexalab.local" } });
    const labId = "circuit";
    const modelRef = "circuit@1.0.0";
    const lab = await tx.lab.update({ where: { id: labId }, data: { status: "published", scope: "SHARED_LIBRARY", releaseCleared: true, synthetic: false, topicCode: "TAI74_TEST_FIXTURE" } });
    const challenge = await tx.challenge.findFirstOrThrow({ where: { labId } });
    const activity = await tx.practicalActivityVersion.create({ data: { key: "tai74-test-only", version: 1, digest: "tai74-isolated-browser", spec: {}, reviews: {}, createdById: admin.id } });
    await tx.simulationConfigVersion.create({ data: { labId, version: 97, modelRef, challengeParams: { [challenge.id]: { minLitLeds: 1, maxCurrentMa: 20 } }, goldenCases: [], status: "active", reason: "TAI74 test only", createdById: admin.id } });
    const template = { ranges: { minLitLeds: { min: 1, max: 2 }, maxCurrentMa: { min: 1, max: 20 } }, initialState: goldenTemplates(labId)[0].labState };
    await tx.simulationPackVersion.create({ data: { labId, key: "tai74-test-only", version: 97, modelRef, engineVersion: "1.0.0", activityVersionId: activity.id, template, semanticMap: {}, bindings: [], challengeTemplates: [], reviews: {}, status: "active", reason: "TAI74 test only", createdById: admin.id } });
    const snapshot = { lab: { id: lab.id }, execution: await captureCurrentLabExecution(tx, labId) };
    const release = await tx.labRelease.create({ data: { labId, version: 97, digest: digest(snapshot), snapshot, status: "ACTIVE", reason: "TAI74 mechanics fixture", createdById: admin.id } });
    console.log({ challengeId: challenge.id, releaseId: release.id });
  });
}
main().finally(() => db.$disconnect());

