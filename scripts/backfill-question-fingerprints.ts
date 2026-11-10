// TAI3-T1 backfill/reconcile of QuestionFingerprint (qdup@1) for every ClassResource and shared-library lesson.
//   npm run fingerprints:backfill        # guarded: isolated local database only (scripts/assert-isolated-db.mjs)
// Idempotent: a rerun reports created = deleted = 0. Output carries counts only, never question text.
// Running it against the shared database needs a separate PO approval (AGENTS.md).
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { backfillQuestionFingerprints } from "../src/modules/ai/application/question-fingerprints";

const db = new PrismaClient();
async function main() {
  const report = await backfillQuestionFingerprints(db);
  console.log(JSON.stringify(report, null, 2));
}
main().finally(() => db.$disconnect());
