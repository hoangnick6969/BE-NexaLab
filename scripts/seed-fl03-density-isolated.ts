/**
 * FL-03 density dev fixture for an ISOLATED loopback database only.
 *
 * Creates the Lab, challenge, activity, configuration and pack rows that a
 * `density-bench@1.0.0` launch needs. Every row is marked as a test fixture and
 * is NOT a curriculum approval, scientific approval, release or OWNER_SIGNOFF.
 * It never creates a LabRelease and never sets releaseCleared, so students
 * cannot discover or launch the Lab through the public catalogue.
 *
 * Idempotent: rerunning updates the same identities. npm runs the isolated-DB
 * guard before this script (`db:seed:fl03-isolated`), and the script refuses to
 * start unless DATABASE_URL and DIRECT_URL are the same loopback target.
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { VERSION as ENGINE_VERSION, DENSITY_INSTRUMENTS } from "../packages/sim";
import { DENSITY_ACTIVITY_KEY, DENSITY_MODEL, DENSITY_RUBRIC } from "../src/modules/labs/application/evaluators/density-stations.evaluator";
import { digest } from "../src/modules/labs/application/lab-run";
import { seedDensityReleaseFixture } from "../src/modules/labs/interface/density-release.fixture";

const LAB_ID = "density";
const CHALLENGE_ID = "density_001";
const NOTICE = "TEST FIXTURE ONLY: isolated development data. Not curriculum, scientific or rights approval; not a release.";

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
  if (process.env.NEXALAB_ISOLATED_DATABASE_URL !== database.href && new URL(process.env.NEXALAB_ISOLATED_DATABASE_URL ?? "http://x").href !== database.href)
    throw new Error("DATABASE_URL does not match NEXALAB_ISOLATED_DATABASE_URL");

  const db = new PrismaClient({ datasourceUrl: database.href });
  try {
    const admin = await db.user.findFirst({ where: { role: "ADMIN" }, orderBy: { createdAt: "asc" } });
    if (!admin) throw new Error("Run the isolated db:seed first: an ADMIN account is required as creator");
    const subject = await db.subject.findUnique({ where: { id: "khtn" } });
    if (!subject) throw new Error("Run the isolated db:seed first: subject khtn is required");

    const lab = await db.lab.upsert({
      where: { id: LAB_ID },
      create: {
        id: LAB_ID, subjectId: subject.id, title: "Xác định khối lượng riêng (FL-03, dữ liệu thử)", grade: 8,
        topic: "Khối lượng riêng", learningObjective: "Đo khối lượng và thể tích, tính khối lượng riêng theo SGK KHTN 8 Bài 13–14.",
        status: "published", scope: "CLASS_PRIVATE", releaseCleared: false, topicCode: null, synthetic: true,
        simulationModelRef: DENSITY_MODEL, config: { notice: NOTICE }, assets: [],
      },
      // Release state (synthetic, releaseCleared) belongs to the release chain below; never reset it here.
      update: { simulationModelRef: DENSITY_MODEL },
    });

    await db.challenge.upsert({
      where: { id: CHALLENGE_ID },
      create: { id: CHALLENGE_ID, labId: lab.id, objective: lab.learningObjective, constraints: { params: {} } },
      update: { objective: lab.learningObjective },
    });

    const activitySpec = {
      key: DENSITY_ACTIVITY_KEY,
      outcomeCodes: ["KHTN8-B14-O01 (proposed, unapproved)"],
      objective: "TEST FIXTURE ONLY: four textbook stations, readings and calculation of density",
      materials: ["TEST FIXTURE ONLY: wood block, pebble, water, cylinder, balance, ruler"],
      setup: "Virtual instruments with the declared resolutions.",
      procedure: ["Explore m/V with iron, aluminium and copper bars", "Wood block: three edges and mass", "Water: volume and cup masses", "Pebble: levels before and after dropping"],
      variables: [{ name: "specimen", unit: "pinned per run", role: "independent" }, { name: "density", unit: "g/cm3", role: "dependent" }],
      observations: ["Readings within one division", "Density calculated from the learner's own readings"],
      expectedResult: "TEST FIXTURE ONLY: density consistent with the reference values",
      explanation: "Synthetic data for a mechanics test; not a curriculum or scientific approval.",
      safety: "Virtual instruments only.", limitations: "Idealised instruments; no uncertainty propagation.",
      modality: "deterministic-simulation", sources: [{ title: "Synthetic test fixture", license: "TEST_ONLY" }],
    };
    const activityDigest = digest(activitySpec);
    const activity = await db.practicalActivityVersion.upsert({
      where: { key_version: { key: DENSITY_ACTIVITY_KEY, version: 1 } },
      create: { key: DENSITY_ACTIVITY_KEY, version: 1, digest: activityDigest, spec: activitySpec as any, reviews: { testFixtureOnly: true, notice: NOTICE }, createdById: admin.id },
      update: {},
    });

    const configData = {
      labId: lab.id, modelRef: DENSITY_MODEL, challengeParams: { [CHALLENGE_ID]: {} }, goldenCases: [] as any,
      reason: NOTICE, createdById: admin.id,
    };
    const config = await db.simulationConfigVersion.upsert({
      where: { labId_version: { labId: lab.id, version: 1 } },
      create: { ...configData, version: 1, status: "active" },
      update: {},
    });

    const packTemplate = { ranges: {}, initialState: null, limitations: NOTICE, units: { mass: "g", volume: "cm3", density: "g/cm3" }, instruments: DENSITY_INSTRUMENTS };
    const packKey = `density-bench-fixture`;
    const pack = await db.simulationPackVersion.upsert({
      where: { key_version: { key: packKey, version: 1 } },
      create: {
        key: packKey, version: 1, labId: lab.id, modelRef: DENSITY_MODEL, engineVersion: ENGINE_VERSION,
        activityVersionId: activity.id, template: packTemplate as any, semanticMap: {} as any, bindings: [] as any,
        challengeTemplates: [] as any, reviews: { testFixtureOnly: true, notice: NOTICE } as any, status: "active", reason: NOTICE, createdById: admin.id,
      },
      update: {},
    });

    const release = await seedDensityReleaseFixture(db, admin.id);
    console.log(JSON.stringify({
      seeded: "density (FL-03) isolated fixture",
      labId: lab.id, challengeId: CHALLENGE_ID, configVersionId: config.id, packVersionId: pack.id,
      activityVersionId: activity.id, rubricRef: DENSITY_RUBRIC, modelRef: DENSITY_MODEL,
      releaseId: release.id, releaseStatus: release.status, releaseVersion: release.version, notice: NOTICE,
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
