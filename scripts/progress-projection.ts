// Ops-only check/rebuild of the Progress projection (Epic A5-T4).
//   npx tsx scripts/progress-projection.ts            # dry-run: report drift
//   npx tsx scripts/progress-projection.ts --apply    # rewrite drifted Progress rows only
//   ... --student <id>                                # limit to one student
// Output carries IDs and counts only, no answers or credentials.
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { checkProjection } from "../src/progress-projection";

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const studentIndex = args.indexOf("--student");
const studentId = studentIndex >= 0 ? args[studentIndex + 1] : undefined;
if (studentIndex >= 0 && !studentId) throw new Error("--student requires an id");

const db = new PrismaClient();
async function main() {
  const report = await db.$transaction((tx) => checkProjection(tx as any, { apply, studentId }), { timeout: 120000 });
  console.log(JSON.stringify(report, null, 2));
  if (!apply && report.driftCount) process.exitCode = 2;
}
main().finally(() => db.$disconnect());
