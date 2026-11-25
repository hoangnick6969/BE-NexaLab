// TAI5-T6 ledger reconciliation (ledger-rules.md). READ ONLY: it issues SELECTs and never writes, so it may be pointed
// at any database; a repair is a new ADJUST with a reason, never an edit of a posting.
//   npm run credits:reconcile            # human report, exit 1 on any violation
//   npm run credits:reconcile -- --json  # machine report
// Output carries IDs and counts only: never reasons, free text, tokens or teacher names.
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { reconcileCredits } from "../src/modules/ai/application/credits-reconcile";

const db = new PrismaClient();

async function main() {
  const [accounts, transactions, entries, jobs, prices, users] = await Promise.all([
    db.creditAccount.findMany({ select: { id: true, kind: true, ownerId: true, balance: true } }),
    db.creditTransaction.findMany({ select: { id: true, kind: true, aiJobId: true, actorId: true, systemKey: true } }),
    db.creditEntry.findMany({ select: { id: true, transactionId: true, accountId: true, amount: true } }),
    db.aiJob.findMany({ select: { id: true, status: true, estimatedCredits: true, chargedCredits: true, pricingVersionId: true } }),
    db.pricingVersion.findMany({ select: { id: true } }),
    db.user.findMany({ select: { id: true } }),
  ]);
  const report = reconcileCredits({ accounts, transactions, entries, jobs, pricingVersionIds: prices.map((p) => p.id), userIds: users.map((u) => u.id) });
  if (process.argv.includes("--json")) console.log(JSON.stringify(report, null, 2));
  else {
    console.log(`credits reconcile: ${report.counts.accounts} accounts, ${report.counts.transactions} transactions, ${report.counts.entries} entries, ${report.counts.jobsWithCredits} jobs with credits`);
    if (report.ok) console.log("OK: the ledger reconciles.");
    for (const v of report.violations) console.error(`FAIL check ${v.check} ${v.code}: ${v.detail}\n  ids: ${v.ids.join(", ")}`);
  }
  process.exitCode = report.ok ? 0 : 1;
}

main()
  .catch((error) => {
    console.error(`credits reconcile failed: ${error instanceof Error ? error.name : "error"}`);
    process.exitCode = 2;
  })
  .finally(() => db.$disconnect());
