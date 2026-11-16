import "dotenv/config";
import { parseArgs } from "node:util";
import { PrismaClient } from "@prisma/client";
import { K2_KIT } from "../packages/sim/wet-bench/contracts";
import { publishExploreLab } from "../src/modules/labs/application/explore-labs";
import { loadK2ExploreTargets } from "./k2-explore-targets";
import { FLUID_KIT } from "../packages/sim/fluid/contracts";
import { loadFluidExploreTargets } from "./fluid-explore-targets";

const targetsByKit = new Map<string, typeof loadK2ExploreTargets>([[K2_KIT, loadK2ExploreTargets], [FLUID_KIT, loadFluidExploreTargets]]);
const adminId = "admin";

export async function runExploreSeed(args: string[]) {
  try {
    const { kit, "dry-run": dryRun, unpublish } = parseArgs({
      args,
      options: { kit: { type: "string" }, "dry-run": { type: "boolean" }, unpublish: { type: "boolean" } },
    }).values;
    if (!kit) throw new Error("Usage: tsx scripts/seed-explore-labs.ts --kit <bench-id> [--dry-run | --unpublish]");
    const loadTargets = targetsByKit.get(kit);
    if (!loadTargets) throw new Error(`No Explore seed targets for ${kit}. Available: ${[...targetsByKit.keys()].join(", ")}`);

    const { assertIsolatedDatabase } = await import("./assert-isolated-db.mjs");
    const target = assertIsolatedDatabase(`${kit} Explore seed`);
    const datasourceUrl = process.env.DATABASE_URL || process.env.NEXALAB_ISOLATED_DATABASE_URL;
    const items = await loadTargets();
    if (items.some(({ config }) => config?.kit !== kit)) throw new Error(`An Explore seed config does not belong to ${kit}`);

    const db = new PrismaClient({ datasourceUrl });
    try {
      const admin = await db.user.findUnique({ where: { id: adminId }, select: { role: true, status: true } });
      if (!admin || admin.role !== "ADMIN" || admin.status !== "active") throw new Error("Admin account not found or not active");
      const report = [];
      for (const { config, topicCode } of items) {
        if (dryRun) {
          const current = await db.lab.findUnique({ where: { id: config.labId }, select: { status: true, scope: true, releaseCleared: true, config: true } });
          report.push({ labId: config.labId, topicCode, current });
        } else if (unpublish) {
          const { count } = await db.lab.updateMany({
            where: {
              id: config.labId,
              AND: [{ config: { path: ["mode"], equals: "explore" } }, { config: { path: ["kit"], equals: kit } }],
              challenges: { none: {} },
              releases: { none: {} },
            },
            data: { status: "draft", scope: "CLASS_PRIVATE", releaseCleared: false },
          });
          report.push({ labId: config.labId, unpublished: count > 0 });
        } else {
          report.push(await publishExploreLab(db, { config, topicCode, actor: { sub: adminId, role: "ADMIN" }, reason: `${kit} Explore seed (isolated database)` }));
        }
      }
      console.log(JSON.stringify({ kit, target, mode: dryRun ? "dry-run" : unpublish ? "unpublish" : "write", labs: report }, null, 1));
    } finally {
      await db.$disconnect();
    }
  } catch (error) {
    console.error((error as { getResponse?: () => unknown })?.getResponse?.() ?? (error instanceof Error ? error.message : error));
    process.exitCode = 1;
  }
}

if (require.main === module) void runExploreSeed(process.argv.slice(2));
