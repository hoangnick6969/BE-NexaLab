/**
 * FL-27 gene-to-protein dev fixture for an ISOLATED loopback database only.
 *
 * Creates the Lab, challenge, activity, configuration and pack rows that a
 * `gene-expression@1.0.0` launch through a class assignment needs. Every row is
 * a labelled test fixture; it creates no LabRelease, no OWNER_SIGNOFF and never
 * sets releaseCleared. npm runs the isolated-DB guard first
 * (`db:seed:fl27-isolated`), and the script refuses non-loopback targets.
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { GENE_MODEL, GENE_RUBRIC } from "../src/modules/labs/application/evaluators/gene-protein-stations.evaluator";
import { GENE_FIXTURE_NOTICE, seedGeneProteinTuple } from "../src/modules/labs/interface/gene-protein-tuple.fixture";

function loopbackUrl(name: string): URL {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  const url = new URL(value);
  if (!["localhost", "127.0.0.1", "[::1]", "::1"].includes(url.hostname.toLowerCase())) throw new Error(`${name} must be loopback`);
  return url;
}

async function main() {
  const database = loopbackUrl("DATABASE_URL");
  const direct = loopbackUrl("DIRECT_URL");
  if (database.href !== direct.href) throw new Error("DATABASE_URL and DIRECT_URL must name the same isolated target");
  if (new URL(process.env.NEXALAB_ISOLATED_DATABASE_URL ?? "http://x").href !== database.href)
    throw new Error("DATABASE_URL does not match NEXALAB_ISOLATED_DATABASE_URL");

  const db = new PrismaClient({ datasourceUrl: database.href });
  try {
    const admin = await db.user.findFirst({ where: { role: "ADMIN" }, orderBy: { createdAt: "asc" } });
    if (!admin) throw new Error("Run the isolated db:seed first: an ADMIN account is required as creator");
    const tuple = await seedGeneProteinTuple(db, admin.id);
    console.log(JSON.stringify({
      seeded: "gene-protein (FL-27) isolated fixture", labId: tuple.lab.id, challengeId: tuple.challengeId,
      configVersionId: tuple.configVersionId, packVersionId: tuple.packVersionId, activityVersionId: tuple.activityVersionId,
      rubricRef: GENE_RUBRIC, modelRef: GENE_MODEL, notice: GENE_FIXTURE_NOTICE,
    }, null, 2));
  } finally {
    await db.$disconnect();
  }
}

main().catch((error) => {
  const response = (error as any)?.response;
  console.error(response ? JSON.stringify(response) : error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
