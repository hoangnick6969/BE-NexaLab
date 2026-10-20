// CF-T2 migration: local AssetFile rows → Asset + immutable AssetVersion in
// object storage, then `asset:<fileId>` references → `assetv:<versionId>`.
// Dry run by default; --apply writes; --delete-local removes a local file only
// after its object and every reference were verified.
//   npm run cf:migrate-assets            (report only)
//   npm run cf:migrate-assets -- --apply [--delete-local]
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { createHash } from "node:crypto";
import { readFile, unlink } from "node:fs/promises";
import { resolve } from "node:path";
import { audit } from "../src/common/audit";
import { objectKeys, storage } from "../src/modules/storage/infrastructure/storage";

const apply = process.argv.includes("--apply");
const deleteLocal = process.argv.includes("--delete-local");
const db = new PrismaClient();
const root = resolve(process.env.UPLOAD_DIR ?? "uploads");
const kindOf = (mime: string) =>
  mime === "application/pdf"
    ? "pdf"
    : mime.startsWith("image/")
      ? "image"
      : mime === "video/mp4"
        ? "video"
        : mime === "model/gltf-binary"
          ? "model"
          : "caption";
const sha = (b: Buffer) => createHash("sha256").update(b).digest("hex");
async function legacyRefCount(fileId: string) {
  const needle = `%asset:${fileId}%`;
  const [[lessons], [steps], [labs]] = (await Promise.all([
    db.$queryRaw`SELECT count(*)::int AS n FROM "Lesson" WHERE materials::text LIKE ${needle}`,
    db.$queryRaw`SELECT count(*)::int AS n FROM "LessonStep" WHERE config::text LIKE ${needle}`,
    db.$queryRaw`SELECT count(*)::int AS n FROM "Lab" WHERE assets::text LIKE ${needle}`,
  ])) as any;
  return lessons.n + steps.n + labs.n;
}

async function main() {
  const s = storage();
  const files = await db.assetFile.findMany({ orderBy: { createdAt: "asc" } });
  const migrated = new Set(
    (await db.asset.findMany({ where: { legacyFileId: { not: null } }, select: { legacyFileId: true } })).map((a) => a.legacyFileId),
  );
  console.log(
    `storage=${s.kind} bucket=${s.bucket} mode=${apply ? "apply" : "dry-run"} legacyFiles=${files.length} alreadyMigrated=${migrated.size}`,
  );
  const report = { planned: 0, migrated: 0, skipped: 0, failed: 0, referencesRewritten: 0, localDeleted: 0 };
  for (const file of files) {
    if (migrated.has(file.id)) {
      report.skipped++;
      continue;
    }
    report.planned++;
    let bytes: Buffer;
    try {
      bytes = await readFile(resolve(root, file.id));
    } catch {
      console.log(`FAIL ${file.id}: local file missing`);
      report.failed++;
      continue;
    }
    const digest = sha(bytes);
    if (bytes.length !== file.size || (file.sha256 && file.sha256 !== digest)) {
      console.log(`FAIL ${file.id}: local bytes do not match the recorded size/checksum`);
      report.failed++;
      continue;
    }
    const refsBefore = await legacyRefCount(file.id);
    console.log(`${apply ? "MIGRATE" : "PLAN"} ${file.id} ${file.mime} ${file.size} B, ${refsBefore} reference(s)`);
    if (!apply) continue;
    const asset = await db.asset.create({
      data: {
        scope: file.scope,
        ownerId: file.ownerId,
        title: file.name,
        kind: kindOf(file.mime),
        status: file.status === "QUARANTINED" ? "QUARANTINED" : "ACTIVE",
        license: file.license,
        source: file.source,
        attribution: file.source,
        quarantinedAt: file.quarantinedAt,
        quarantineReason: file.quarantineReason,
        legacyFileId: file.id,
        createdAt: file.createdAt,
      },
    });
    const version = await db.assetVersion.create({
      data: {
        assetId: asset.id,
        version: 1,
        status: "PENDING",
        storage: s.kind,
        bucket: s.bucket,
        fileName: file.name,
        mime: file.mime,
        declaredBytes: file.size,
        expectedSha256: digest,
        createdById: file.ownerId,
      },
    });
    const key = objectKeys(asset.id, version.id, file.name, asset.scope).released;
    await s.put(key, bytes, file.mime);
    const hash = createHash("sha256");
    for await (const chunk of await s.stream(key)) hash.update(chunk as Buffer);
    const head = await s.head(key);
    if (head?.bytes !== file.size || hash.digest("hex") !== digest) {
      await db.assetVersion.update({ where: { id: version.id }, data: { status: "FAILED", failureReason: "object verification failed" } });
      console.log(`FAIL ${file.id}: stored object does not verify`);
      report.failed++;
      continue;
    }
    const from = `asset:${file.id}`;
    const to = `assetv:${version.id}`;
    const rewritten = await db.$transaction(async (tx) => {
      await tx.assetVersion.update({
        where: { id: version.id },
        data: {
          status: "READY",
          objectKey: key,
          bytes: head.bytes,
          sha256: digest,
          etag: head.etag,
          readyAt: new Date(),
          validation: { migratedFrom: "AssetFile" },
        },
      });
      const n =
        (await tx.$executeRaw`UPDATE "Lesson" SET materials = replace(materials::text, ${from}, ${to})::jsonb WHERE materials::text LIKE ${"%" + from + "%"}`) +
        (await tx.$executeRaw`UPDATE "LessonStep" SET config = replace(config::text, ${from}, ${to})::jsonb WHERE config::text LIKE ${"%" + from + "%"}`) +
        (await tx.$executeRaw`UPDATE "Lab" SET assets = replace(assets::text, ${from}, ${to})::jsonb WHERE assets::text LIKE ${"%" + from + "%"}`);
      await audit(tx, {
        actor: null,
        action: "asset.migrate",
        targetType: "Asset",
        targetId: asset.id,
        after: { kind: asset.kind, bytes: file.size, references: n, migrated: true },
      });
      return n;
    });
    const refsAfter = await legacyRefCount(file.id);
    report.migrated++;
    report.referencesRewritten += rewritten;
    console.log(`     rows rewritten ${rewritten}; legacy references before ${refsBefore} → after ${refsAfter}`);
    if (refsAfter !== 0) {
      console.log(`FAIL ${file.id}: legacy references remain; local file kept`);
      report.failed++;
      continue;
    }
    if (deleteLocal) {
      await unlink(resolve(root, file.id));
      report.localDeleted++;
    }
  }
  const remaining = (await db.assetFile.count()) - (await db.asset.count({ where: { legacyFileId: { not: null } } }));
  console.log(JSON.stringify({ ...report, legacyFilesWithoutAsset: remaining }));
  console.log(report.failed ? "RESULT failed" : apply ? (remaining ? "RESULT partial" : "RESULT ok") : "RESULT dry-run");
  process.exitCode = report.failed ? 1 : 0;
}
main().finally(() => db.$disconnect());
