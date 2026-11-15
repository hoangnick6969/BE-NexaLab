/**
 * Seeds the K2 Explore-first Labs (FL-13 acid–base, FL-14a metals) on an isolated database so they
 * appear in `GET /labs`. Explore Labs are unscored: no challenge, pack, LabRelease or LabRun is created.
 *
 * Source of truth for content: the kit configs in the sibling frontend
 * (`../FE-NexaLab/src/features/labs/chemistry/wet-bench/labs/*.config.ts`). Every write goes through
 * `publishExploreLab` (P0 C1.3), the same function behind `POST /admin/labs/:id/explore-versions`.
 *
 * Safety: `assertIsolatedDatabase()` runs before anything else, for every mode. The shared database
 * is only written through the Admin API (`scripts/publish-k2-explore.ts`).
 * `--dry-run` only reads. `--unpublish` hides both Labs again (status draft, CLASS_PRIVATE, releaseCleared=false).
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { publishExploreLab } from "../src/modules/labs/application/explore-labs";
import { loadK2ExploreTargets } from "./k2-explore-targets";

const ADMIN_ID = "admin";

async function main() {
  const { assertIsolatedDatabase } = await import("./assert-isolated-db.mjs");
  const target = assertIsolatedDatabase("K2 Explore seed");
  const dryRun = process.argv.includes("--dry-run");
  const unpublish = process.argv.includes("--unpublish");
  const items = await loadK2ExploreTargets();
  const db = new PrismaClient();
  try {
    const admin = await db.user.findUnique({ where: { id: ADMIN_ID }, select: { role: true, status: true } });
    if (!admin || admin.role !== "ADMIN" || admin.status !== "active") throw new Error("Admin account not found or not active");
    const report = [];
    for (const { config, topicCode } of items) {
      if (dryRun) {
        const lab = await db.lab.findUnique({ where: { id: config.labId }, select: { status: true, scope: true, releaseCleared: true, config: true } });
        report.push({ labId: config.labId, topicCode, current: lab });
      } else if (unpublish) {
        const lab = await db.lab.findUnique({ where: { id: config.labId }, select: { id: true } });
        if (lab) await db.lab.update({ where: { id: config.labId }, data: { status: "draft", scope: "CLASS_PRIVATE", releaseCleared: false } });
        report.push({ labId: config.labId, unpublished: Boolean(lab) });
      } else {
        report.push(await publishExploreLab(db, { config, topicCode, actor: { sub: ADMIN_ID, role: "ADMIN" }, reason: "K2 Explore seed (isolated database)" }));
      }
    }
    console.log(JSON.stringify({ target, mode: dryRun ? "dry-run" : unpublish ? "unpublish" : "write", labs: report }, null, 1));
  } finally {
    await db.$disconnect();
  }
}

main().catch((error) => {
  console.error(error?.getResponse?.() ?? (error instanceof Error ? error.message : error));
  process.exitCode = 1;
});
