// Content Release Importer CLI (CF-T3). Dry run unless --apply.
//   npm run content:release -- --manifest content/releases/<file>.json --target development
//   npm run content:release -- --manifest <file> --target development --apply --initiated-by <email> --approved-by <admin email>
//   npm run content:release -- --retire <releaseId> --by <admin email> --reason "<why>"
import "dotenv/config";
import { readFile } from "node:fs/promises";
import { PrismaClient } from "@prisma/client";
import { applyRelease, planRelease, retireRelease } from "../src/content-release";

const arg = (name: string) => {
  const i = process.argv.indexOf("--" + name);
  return i > 0 ? process.argv[i + 1] : undefined;
};
const db = new PrismaClient();
async function main() {
  const retire = arg("retire");
  if (retire) {
    const by = await db.user.findUnique({ where: { email: String(arg("by") ?? "").toLowerCase() } });
    if (!by || by.role !== "ADMIN" || by.status !== "active") throw new Error("--by must be an active admin email");
    const reason = arg("reason");
    if (!reason || reason.length < 3) throw new Error("--reason is required");
    console.log(JSON.stringify(await retireRelease(db, retire, { sub: by.id }, reason), null, 2));
    return;
  }
  const file = arg("manifest");
  const target = arg("target");
  if (!file || !target) throw new Error("--manifest and --target are required");
  const manifest = JSON.parse(await readFile(file, "utf8"));
  if (!process.argv.includes("--apply")) {
    const plan = await planRelease(db, manifest, target);
    console.log(JSON.stringify(plan, null, 2));
    console.log(plan.blocked ? "PLAN blocked" : plan.alreadyApplied ? "PLAN already applied" : "PLAN ok (dry run; nothing written)");
    process.exitCode = plan.blocked ? 1 : 0;
    return;
  }
  const initiator = await db.user.findUnique({ where: { email: String(arg("initiated-by") ?? "").toLowerCase() } });
  if (!initiator || initiator.status !== "active") throw new Error("--initiated-by must be an active account email");
  try {
    const out = await applyRelease(db, manifest, {
      target,
      initiatedById: initiator.id,
      approvedByEmail: String(arg("approved-by") ?? ""),
    });
    console.log(
      JSON.stringify(
        { idempotent: out.idempotent, release: out.receipt?.id, status: out.receipt?.status, items: out.receipt?.items.length },
        null,
        2,
      ),
    );
    console.log(out.idempotent ? "APPLY no-op (already applied)" : "APPLY ok");
  } catch (error: any) {
    if (error.plan) console.log(JSON.stringify(error.plan, null, 2));
    throw error;
  }
}
main()
  .catch((error) => {
    console.error("FAILED " + (error?.message ?? error));
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
