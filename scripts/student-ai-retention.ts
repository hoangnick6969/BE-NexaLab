/**
 * Tutor conversation retention (PO decision 6: 12 months after last activity).
 *
 *   npm run retention:student-ai              # dry run: counts what would be deleted
 *   npm run retention:student-ai -- --apply   # deletes those conversations and their messages
 *
 * Uses DATABASE_URL. The owner runs --apply against shared environments; development sessions use the isolated database.
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { purgeTutorConversations, TUTOR_RETENTION_MONTHS } from "../src/modules/student-ai/application/tutor-chat";

const apply = process.argv.includes("--apply");
const db = new PrismaClient();
purgeTutorConversations(db, { apply })
  .then((result) => console.log(`${apply ? "Deleted" : "Dry run, would delete"} ${result.conversations} tutor conversations (${result.messages} messages) with no activity since ${result.cutoff} (${TUTOR_RETENTION_MONTHS} months).`))
  .catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; })
  .finally(() => db.$disconnect());
