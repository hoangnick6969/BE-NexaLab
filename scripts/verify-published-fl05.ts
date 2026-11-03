import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { writeFile } from "node:fs/promises";
const db = new PrismaClient();
async function main() {
  const lab = await db.lab.findUniqueOrThrow({ where: { id: "buoyancy" }, select: { id: true, title: true, scope: true, releaseCleared: true, status: true, topicCode: true } });
  const release = await db.labRelease.findFirstOrThrow({ where: { labId: lab.id, status: "ACTIVE" }, include: { reviews: true } });
  if (!lab.releaseCleared || lab.scope !== "SHARED_LIBRARY" || !release.reviews.some(r => r.kind === "OWNER_SIGNOFF" && r.decision === "APPROVE" && r.releaseDigest === release.digest)) throw new Error("Release verification failed");
  const record = { verifiedAt: new Date().toISOString(), candidateDigest: "3afb7388188b213bb8eb255093ff38db6a31f5ef972f024ba2a98530265f34cc", authorization: "Project Owner explicit session approval, 2026-11-03; scoped remote DB and signoff override", lab, release: { id: release.id, digest: release.digest, status: release.status, activatedAt: release.activatedAt }, reviews: release.reviews.map(r => ({ kind: r.kind, decision: r.decision, reviewerId: r.reviewerId, releaseDigest: r.releaseDigest })), lessonBindings: (release.snapshot as any).lessonBindings, mappingNote: "Existing approved curriculum ENERGY domain retained; local MATTER content candidate was not imported." };
  await writeFile("content/fl05/publication-record.json", JSON.stringify(record, null, 2) + "\n");
  console.log(JSON.stringify(record, null, 2));
}
main().catch(e => { console.error(e.message); process.exitCode = 1; }).finally(() => db.$disconnect());
