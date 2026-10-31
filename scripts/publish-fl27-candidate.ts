/** Integration candidate importer. Guarded loopback only; never activates a release. */
import "dotenv/config";
import { readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import {
  activitySpecSchema,
  activityDigest,
  packInputSchema,
  packValidation,
} from "../src/modules/labs/application/sim-packs";
import { seedUrl } from "../src/config/database-config";
import { canonical } from "../src/modules/labs/application/lab-run";

function assertUnchanged(existing: any, expected: Record<string, unknown>) {
  if (!existing) return;
  for (const [field, value] of Object.entries(expected)) {
    if (
      field !== "createdById" &&
      canonical(existing[field]) !== canonical(value)
    )
      throw new Error(
        `Existing candidate ${String(expected.id)} differs at ${field}; publish a new version instead`,
      );
  }
}

async function main() {
  const url = seedUrl(process.env);
  const target = new URL(url);
  if (
    !["localhost", "127.0.0.1", "[::1]"].includes(target.hostname) ||
    url !== process.env.NEXALAB_ISOLATED_DATABASE_URL
  )
    throw new Error(
      "Publication requires the exact isolated loopback database URL",
    );
  const data = JSON.parse(
    readFileSync("content/simulation-packs/fl27-candidate.json", "utf8"),
  );
  const activity = activitySpecSchema.parse({
    ...data.activity.spec,
    reviews: data.activity.reviews,
  });
  if (activityDigest(activity) !== data.activity.digest)
    throw new Error("Activity digest mismatch");
  const input = packInputSchema.parse(
    Object.fromEntries(
      Object.keys(packInputSchema.shape)
        .filter((k) => k in data.pack)
        .map((k) => [k, data.pack[k]]),
    ),
  );
  const validation = packValidation(input, {
    labModelRef: data.lab.simulationModelRef,
    activity: { spec: data.activity.spec },
    glb: null,
    visualReady: false,
  });
  if (validation.errors.length) throw new Error(validation.errors.join("; "));
  const db = new PrismaClient({ datasourceUrl: url });
  try {
    const admin = await db.user.findFirstOrThrow({
      where: { role: "ADMIN", status: "active" },
      orderBy: { createdAt: "asc" },
    });
    if (
      !activity.outcomeCodes.every((code) =>
        data.catalog.outcomes.some((o: any) => o.code === code),
      )
    )
      throw new Error("Required FL27 outcomes missing from registry export");
    if (!process.argv.includes("--apply")) {
      console.log("FL27 candidate dry-run valid; no data written");
      return;
    }
    await db.$transaction(async (tx) => {
      assertUnchanged(
        await tx.lab.findUnique({ where: { id: data.lab.id } }),
        data.lab,
      );
      assertUnchanged(
        await tx.challenge.findUnique({ where: { id: data.challenge.id } }),
        data.challenge,
      );
      assertUnchanged(
        await tx.practicalActivityVersion.findUnique({
          where: { id: data.activity.id },
        }),
        data.activity,
      );
      assertUnchanged(
        await tx.simulationConfigVersion.findUnique({
          where: { id: data.config.id },
        }),
        data.config,
      );
      assertUnchanged(
        await tx.simulationPackVersion.findUnique({
          where: { id: data.pack.id },
        }),
        data.pack,
      );
      await tx.curriculumChapter.upsert({
        where: { code: data.catalog.chapter.code },
        create: data.catalog.chapter,
        update: {},
      });
      for (const outcome of data.catalog.outcomes) {
        const old = await tx.curriculumOutcome.findUnique({
          where: { code: outcome.code },
        });
        if (
          old &&
          (old.statement !== outcome.statement || old.grade !== outcome.grade)
        )
          throw new Error(`Curriculum conflict: ${outcome.code}`);
        await tx.curriculumOutcome.upsert({
          where: { code: outcome.code },
          create: outcome,
          update: {},
        });
      }
      await tx.curriculumTopic.upsert({
        where: { code: data.catalog.topic.code },
        create: data.catalog.topic,
        update: {},
      });
      // Identical reruns are allowed; immutable version content is never silently overwritten.
      const existing = await tx.practicalActivityVersion.findUnique({
        where: { key_version: { key: data.activity.key, version: 1 } },
      });
      if (existing && existing.digest !== data.activity.digest)
        throw new Error(
          "Activity v1 already has different content; create a new reviewed candidate version",
        );
      await tx.lab.upsert({
        where: { id: data.lab.id },
        create: data.lab,
        update: {},
      });
      await tx.challenge.upsert({
        where: { id: data.challenge.id },
        create: data.challenge,
        update: {},
      });
      await tx.practicalActivityVersion.upsert({
        where: { id: data.activity.id },
        create: { ...data.activity, createdById: admin.id },
        update: {},
      });
      await tx.simulationConfigVersion.upsert({
        where: { id: data.config.id },
        create: { ...data.config, createdById: admin.id },
        update: {},
      });
      await tx.simulationPackVersion.upsert({
        where: { id: data.pack.id },
        create: { ...data.pack, createdById: admin.id },
        update: {},
      });
    });
    const lab = await db.lab.findUniqueOrThrow({
      where: { id: data.lab.id },
      include: { challenges: true },
    });
    const pack = await db.simulationPackVersion.findUniqueOrThrow({
      where: { id: data.pack.id },
    });
    if (lab.releaseCleared || pack.status !== "draft")
      throw new Error("Candidate state differs from the unactivated manifest");
    console.log(
      JSON.stringify({
        labId: lab.id,
        scope: lab.scope,
        releaseCleared: lab.releaseCleared,
        packId: pack.id,
        status: pack.status,
        verified: true,
      }),
    );
  } finally {
    await db.$disconnect();
  }
}
main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
