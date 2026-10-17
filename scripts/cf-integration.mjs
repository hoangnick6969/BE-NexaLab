// Content Foundation on real dependencies (API + PostgreSQL + object storage).
// CF-T2: presigned single and multipart uploads straight to private storage,
// server-side validation, immutable versions, signed reads and cleanup.
//   TEST_API=http://127.0.0.1:4000/api npm run test:cf
import * as argon from "argon2";
import { createHash, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import { createHarness } from "./lib/harness.mjs";
import { objectKeys, storage } from "../src/infra/storage.ts";
import { cleanupExpiredUploads } from "../src/assets/asset-versions.ts";
import { applyRelease, planRelease } from "../src/content/content-release.ts";

const h = createHarness("Content Foundation");
const releaseFixture = JSON.parse(readFileSync(new URL("../content/releases/fixture-khtn8-energy.json", import.meta.url), "utf8"));
const flagshipFixture = JSON.parse(readFileSync(new URL("../content/simulation-packs/flagship-fixture.json", import.meta.url), "utf8"));
const created = { sources: [], packs: [], releases: [], practicals: [], simPacks: [], classes: [] };
let restorePack = null;
let fixtureBody = JSON.stringify({ title: "Tài liệu kiểm thử", rev: 1 });
const fixtureHits = [];
// Local source fixture: allowlisted JSON, oversized body, off-list redirect, HTML and a robots.txt disallow.
const fixtureServer = createServer((reqIn, res) => {
  fixtureHits.push(reqIn.url);
  if (reqIn.url === "/robots.txt") return res.end("User-agent: *\nDisallow: /docs/blocked\n");
  if (reqIn.url === "/docs/ok.json") return res.writeHead(200, { "content-type": "application/json" }).end(fixtureBody);
  if (reqIn.url === "/docs/big.json") return res.writeHead(200, { "content-type": "application/json" }).end("x".repeat(5000));
  if (reqIn.url === "/docs/redirect") return res.writeHead(302, { location: "http://evil.example/docs/x.json" }).end();
  if (reqIn.url === "/docs/page.html") return res.writeHead(200, { "content-type": "text/html" }).end("<html></html>");
  res.writeHead(200, { "content-type": "application/json" }).end("{}");
});
await new Promise((r) => fixtureServer.listen(0, "127.0.0.1", r));
const adminEmail = `${"cf-" + Date.now().toString(36)}-admin@example.test`;
const { db, req, check, envelope } = h;
const prefix = adminEmail.replace(/-admin@example\.test$/, "");
const createdUsers = [];
const sha = (b) => createHash("sha256").update(b).digest("hex");
const pdf = (n = 4096) => Buffer.concat([Buffer.from("%PDF-1.4\n"), randomBytes(n)]);

async function account(label, role) {
  const password = `CF-${label}-Password-2026!`;
  const user = await db.user.create({
    data: {
      email: label === "admin" ? adminEmail : `${prefix}-${label}@example.test`,
      fullName: `CF ${label}`,
      role,
      passwordHash: await argon.hash(password),
      consentAt: new Date(),
    },
  });
  createdUsers.push(user.id);
  let login = await req(role === "ADMIN" ? "/auth/admin/login" : "/auth/login", "POST", { email: user.email, password });
  if (login.status === 429) {
    await new Promise((r) => setTimeout(r, 61000));
    login = await req(role === "ADMIN" ? "/auth/admin/login" : "/auth/login", "POST", { email: user.email, password });
  }
  if (login.status !== 201) throw new Error(`${label} login ${login.status}`);
  return { id: user.id, token: login.data.accessToken };
}
/** Browser-equivalent upload: init → PUT bytes to the signed URL(s) → complete. */
async function upload(token, fileName, mime, bytes, extra = {}) {
  const init = await req("/assets/uploads", "POST", { fileName, mime, bytes: extra.declaredBytes ?? bytes.length, ...extra.body }, token);
  if (init.status !== 201) return { init };
  let parts;
  if (init.data.mode === "single") {
    const put = await fetch(init.data.upload.url, { method: "PUT", headers: init.data.upload.headers, body: bytes });
    if (!put.ok) throw new Error("PUT " + put.status);
  } else {
    parts = [];
    const numbers = Array.from({ length: init.data.partCount }, (_, i) => i + 1);
    const signed = await req(`/assets/uploads/${init.data.versionId}/parts`, "POST", { partNumbers: numbers }, token);
    for (const { partNumber, url } of signed.data.parts) {
      const res = await fetch(url, {
        method: "PUT",
        body: bytes.subarray((partNumber - 1) * init.data.partSize, partNumber * init.data.partSize),
      });
      parts.push({ partNumber, etag: res.headers.get("etag") });
    }
  }
  if (extra.skipComplete) return { init };
  const complete = await req(`/assets/uploads/${init.data.versionId}/complete`, "POST", parts ? { parts } : {}, token);
  return { init, complete };
}
const read = async (versionId, token) => {
  const access = await req(`/assets/versions/${versionId}/access`, "GET", undefined, token);
  if (access.status !== 200) return { status: access.status, code: access.data?.code };
  const res = await fetch(access.data.url);
  return { status: res.status, sha: sha(Buffer.from(await res.arrayBuffer())), url: access.data.url };
};

await h.run({
  async setup() {
    return { admin: await account("admin", "ADMIN"), owner: await account("owner", "TEACHER"), other: await account("other", "TEACHER") };
  },
  async journey({ admin, owner, other }) {
    const s = storage();
    console.log(`     object storage: ${s.kind} (${s.bucket})`);

    // ---------- presigned single upload ----------
    const body = pdf();
    const one = await upload(owner.token, "bai-doc.pdf", "application/pdf", body);
    check(
      "init returns a presigned PUT to a staging key and no storage credential",
      one.init.status === 201 && one.init.data.mode === "single" && !/SECRET|secret_access/i.test(JSON.stringify(one.init.data)),
    );
    check(
      "complete validates and returns an immutable assetv reference",
      one.complete?.status === 201 &&
        one.complete.data.status === "READY" &&
        one.complete.data.url === "assetv:" + one.complete.data.versionId,
    );
    const v1 = await db.assetVersion.findUnique({ where: { id: one.complete.data.versionId } });
    check(
      "server computed the full SHA-256; staging key cleared; released key set",
      v1.sha256 === sha(body) && !v1.stagingKey && v1.objectKey.includes("/assets/private/"),
    );
    check("the staging object no longer exists", !(await s.head(objectKeys(v1.assetId, v1.id, v1.fileName, "TEACHER_PRIVATE").staging)));
    const ownerRead = await read(v1.id, owner.token);
    check("owner reads through a short-lived signed URL with identical bytes", ownerRead.status === 200 && ownerRead.sha === sha(body));
    check("another teacher cannot read a private version", (await read(v1.id, other.token)).status === 403);
    check("admin can read it", (await read(v1.id, admin.token)).status === 200);
    check(
      "legacy /files/:id redirects to the same signed object",
      (await fetch(`${h.origin}/files/${v1.id}`, { headers: { authorization: "Bearer " + owner.token } })).status === 200,
    );

    // ---------- validation failures leave nothing reusable ----------
    const spoof = await upload(
      owner.token,
      "gia.pdf",
      "application/pdf",
      Buffer.concat([Buffer.from([137, 80, 78, 71]), randomBytes(512)]),
    );
    const spoofRow = await db.assetVersion.findUnique({ where: { id: spoof.init.data.versionId } });
    check(
      "signature mismatch → 422 ASSET_VALIDATION_FAILED, version FAILED, staging object deleted",
      envelope(spoof.complete, 422, "ASSET_VALIDATION_FAILED") &&
        spoofRow.status === "FAILED" &&
        !spoofRow.stagingKey &&
        !spoofRow.objectKey,
    );
    const lying = await upload(owner.token, "lech.pdf", "application/pdf", pdf(1000), { declaredBytes: 5000 });
    check(
      "declared size ≠ stored size → rejected",
      envelope(lying.complete, 422, "ASSET_VALIDATION_FAILED") && /kích thước/.test(lying.complete.data.message),
    );
    const wrongHash = await upload(owner.token, "hash.pdf", "application/pdf", pdf(), { body: { expectedSha256: "0".repeat(64) } });
    check(
      "client SHA-256 claim is checked against the server value",
      envelope(wrongHash.complete, 422, "ASSET_VALIDATION_FAILED") && /SHA-256/.test(wrongHash.complete.data.message),
    );
    check(
      "type/extension mismatch and oversize are refused at init",
      envelope(
        await req("/assets/uploads", "POST", { fileName: "x.exe", mime: "application/pdf", bytes: 10 }, owner.token),
        400,
        "ASSET_TYPE_REJECTED",
      ) &&
        envelope(
          await req("/assets/uploads", "POST", { fileName: "x.pdf", mime: "application/pdf", bytes: 999 * 1048576 }, owner.token),
          400,
          "ASSET_TOO_LARGE",
        ),
    );
    check(
      "teachers cannot upload 3D models or shared-library assets",
      envelope(
        await req("/assets/uploads", "POST", { fileName: "m.glb", mime: "model/gltf-binary", bytes: 100 }, owner.token),
        403,
        "MODEL_ADMIN_ONLY",
      ) &&
        envelope(
          await req(
            "/assets/uploads",
            "POST",
            { fileName: "a.pdf", mime: "application/pdf", bytes: 100, scope: "SHARED_LIBRARY" },
            owner.token,
          ),
          403,
          "SHARED_ASSET_REQUIRES_ADMIN_RIGHTS",
        ),
    );
    check(
      "completing before any bytes arrive → 409 UPLOAD_INCOMPLETE, still pending",
      await (async () => {
        const init = await req("/assets/uploads", "POST", { fileName: "cho.pdf", mime: "application/pdf", bytes: 100 }, owner.token);
        const early = await req(`/assets/uploads/${init.data.versionId}/complete`, "POST", {}, owner.token);
        const row = await db.assetVersion.findUnique({ where: { id: init.data.versionId } });
        const abort = await req(`/assets/uploads/${init.data.versionId}/abort`, "POST", undefined, owner.token);
        return envelope(early, 409, "UPLOAD_INCOMPLETE") && row.status === "PENDING" && abort.status === 201;
      })(),
    );
    check(
      "another user cannot complete someone else's upload",
      await (async () => {
        const init = await req("/assets/uploads", "POST", { fileName: "rieng.pdf", mime: "application/pdf", bytes: 100 }, owner.token);
        const res = await req(`/assets/uploads/${init.data.versionId}/complete`, "POST", {}, other.token);
        await req(`/assets/uploads/${init.data.versionId}/abort`, "POST", undefined, owner.token);
        return envelope(res, 404, "ASSET_VERSION_NOT_FOUND");
      })(),
    );
    const expiring = await upload(owner.token, "het-han.pdf", "application/pdf", pdf(), { skipComplete: true });
    await db.assetVersion.update({ where: { id: expiring.init.data.versionId }, data: { expiresAt: new Date(Date.now() - 1000) } });
    await cleanupExpiredUploads(db);
    const expiredRow = await db.assetVersion.findUnique({ where: { id: expiring.init.data.versionId } });
    check("an expired unfinished upload is cleaned up (FAILED, staging deleted)", expiredRow.status === "FAILED" && !expiredRow.stagingKey);

    // ---------- multipart ----------
    const big = Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from("ftypmp42"), randomBytes(65 * 1048576)]);
    const multi = await upload(owner.token, "video-lon.mp4", "video/mp4", big);
    check("a large file uses multipart with presigned parts", multi.init.data?.mode === "multipart" && multi.init.data.partCount === 5);
    check(
      "multipart completes with the server SHA-256 of the whole object (not the ETag)",
      multi.complete?.status === 201 && multi.complete.data.sha256 === sha(big),
    );
    check(
      "multipart complete without every part is refused",
      await (async () => {
        const init = await req("/assets/uploads", "POST", { fileName: "thieu.mp4", mime: "video/mp4", bytes: 70 * 1048576 }, owner.token);
        const res = await req(
          `/assets/uploads/${init.data.versionId}/complete`,
          "POST",
          { parts: [{ partNumber: 1, etag: "x" }] },
          owner.token,
        );
        await req(`/assets/uploads/${init.data.versionId}/abort`, "POST", undefined, owner.token);
        return envelope(res, 400, "PARTS_REQUIRED");
      })(),
    );

    // ---------- immutable versions, quarantine ----------
    const second = await upload(owner.token, "bai-doc-v2.pdf", "application/pdf", pdf(), { body: { assetId: one.complete.data.assetId } });
    const v2 = await db.assetVersion.findUnique({ where: { id: second.complete.data.versionId } });
    check(
      "replacement creates version 2 with a new key; version 1 is untouched and still readable",
      v2.version === 2 && v2.objectKey !== v1.objectKey && (await read(v1.id, owner.token)).sha === sha(body),
    );
    check(
      "a different kind cannot become a new version",
      envelope(
        await req(
          "/assets/uploads",
          "POST",
          { fileName: "a.png", mime: "image/png", bytes: 10, assetId: one.complete.data.assetId },
          owner.token,
        ),
        400,
        "ASSET_KIND_MISMATCH",
      ),
    );
    const quarantine = await req(
      `/admin/assets/${one.complete.data.assetId}/operations`,
      "POST",
      { action: "quarantine", reason: "kiểm tra bản quyền" },
      admin.token,
    );
    check(
      "a quarantined asset gets no read URL for its owner",
      quarantine.status === 201 && (await read(v1.id, owner.token)).status === 403 && (await read(v2.id, owner.token)).status === 403,
    );
    check("…an admin still reads it", (await read(v1.id, admin.token)).status === 200);
    check(
      "a quarantined asset cannot get a new version",
      envelope(
        await req(
          "/assets/uploads",
          "POST",
          { fileName: "v3.pdf", mime: "application/pdf", bytes: 100, assetId: one.complete.data.assetId },
          owner.token,
        ),
        409,
        "ASSET_NOT_ACTIVE",
      ),
    );
    check(
      "version READY and reject are audited",
      (await db.auditLog.count({ where: { action: "asset.version.ready", actorId: owner.id } })) >= 3 &&
        (await db.auditLog.count({ where: { action: "asset.version.reject", actorId: owner.id } })) >= 3,
    );

    // ---------- CF-T3 source registry and bounded ingestion ----------
    const fixtureHost = `127.0.0.1:${fixtureServer.address().port}`;
    const policy = {
      accessMode: "OPEN_BULK_IMPORT",
      connector: "http-document",
      allowedHosts: [fixtureHost],
      allowedPathPrefixes: ["/docs/"],
      allowedMime: ["application/json"],
      maxBytes: 2048,
      license: { code: "CC_BY", url: "https://creativecommons.org/licenses/by/4.0/", attribution: "Nguồn kiểm thử CF" },
      storagePolicy: "METADATA_ONLY",
      rateLimitPerMinute: 120,
      termsReviewedAt: new Date().toISOString().slice(0, 10),
      recheckAt: new Date(Date.now() + 90 * 86400000).toISOString().slice(0, 10),
    };
    const sourceKey = `${prefix}-src`;
    created.sources.push(sourceKey);
    const madeSource = await req(
      "/admin/sources",
      "POST",
      { key: sourceKey, title: "Nguồn kiểm thử", policy, reason: "kiểm thử nhập liệu" },
      admin.token,
    );
    check("a new source starts disabled", madeSource.status === 201 && madeSource.data.enabled === false);
    check(
      "duplicate source key → 409",
      envelope(
        await req("/admin/sources", "POST", { key: sourceKey, title: "x", policy, reason: "lặp lại" }, admin.token),
        409,
        "SOURCE_EXISTS",
      ),
    );
    const u = (path) => `http://${fixtureHost}${path}`;
    const disabledRun = await req(
      `/admin/sources/${sourceKey}/runs`,
      "POST",
      { reason: "thử khi tắt", items: [{ externalId: "ok", url: u("/docs/ok.json") }] },
      admin.token,
    );
    check(
      "a disabled source rejects every candidate without fetching",
      disabledRun.status === 201 && disabledRun.data.items.every((i) => i.status === "REJECTED") && fixtureHits.length === 0,
    );
    check(
      "teachers cannot touch the source registry",
      envelope(await req("/admin/sources", "GET", undefined, owner.token), 403, "FORBIDDEN"),
    );
    await req(`/admin/sources/${sourceKey}/enable`, "POST", { reason: "đã rà soát điều khoản" }, admin.token);
    const lessonsBefore = await db.lesson.count();
    const run = await req(
      `/admin/sources/${sourceKey}/runs`,
      "POST",
      {
        reason: "nhập thử",
        items: [
          { externalId: "ok", url: u("/docs/ok.json"), locator: "mục 1" },
          { externalId: "big", url: u("/docs/big.json") },
          { externalId: "redirect", url: u("/docs/redirect") },
          { externalId: "html", url: u("/docs/page.html") },
          { externalId: "robots", url: u("/docs/blocked/x.json") },
          { externalId: "outside", url: u("/other/x.json") },
          { externalId: "foreign", url: "https://example.org/docs/x.json" },
        ],
      },
      admin.token,
    );
    const status = Object.fromEntries((run.data?.items ?? []).map((i) => [i.externalId, i]));
    check(
      "an allowlisted candidate is STAGED with checksum and policy-pinned licence snapshot",
      status.ok?.status === "STAGED" && /^[0-9a-f]{64}$/.test(status.ok.sha256),
    );
    check("oversized → REJECTED", status.big?.status === "REJECTED" && /kích thước/.test(status.big.rejection));
    check(
      "redirect off the allowlist → REJECTED",
      status.redirect?.status === "REJECTED" && /ngoài danh sách/.test(status.redirect.rejection),
    );
    check("wrong MIME → REJECTED", status.html?.status === "REJECTED" && /text\/html/.test(status.html.rejection));
    check("robots.txt disallow → REJECTED", status.robots?.status === "REJECTED" && /robots/.test(status.robots.rejection));
    check("path and host outside the policy → REJECTED", status.outside?.status === "REJECTED" && status.foreign?.status === "REJECTED");
    const artifact = await db.sourceArtifactVersion.findUnique({ where: { id: status.ok.artifactVersionId } });
    check(
      "METADATA_ONLY keeps locator/checksum but no raw copy",
      artifact.storagePolicy === "METADATA_ONLY" &&
        artifact.rawObjectKey === null &&
        artifact.locator === "mục 1" &&
        artifact.licenseSnapshot.code === "CC_BY",
    );
    const rerun = await req(
      `/admin/sources/${sourceKey}/runs`,
      "POST",
      { reason: "chạy lại", items: [{ externalId: "ok", url: u("/docs/ok.json") }] },
      admin.token,
    );
    check(
      "re-ingesting the same bytes is a DUPLICATE of the same artifact version",
      rerun.data.items[0].status === "DUPLICATE" && rerun.data.items[0].artifactVersionId === artifact.id,
    );
    await req(
      `/admin/sources/${sourceKey}`,
      "PUT",
      { policy: { ...policy, storagePolicy: "SNAPSHOT" }, reason: "cho phép lưu bản sao" },
      admin.token,
    );
    fixtureBody = JSON.stringify({ title: "Tài liệu v2", rev: 2 });
    const snap = await req(
      `/admin/sources/${sourceKey}/runs`,
      "POST",
      { reason: "bản mới", items: [{ externalId: "ok", url: u("/docs/ok.json") }] },
      admin.token,
    );
    const snapVersion = await db.sourceArtifactVersion.findUnique({ where: { id: snap.data.items[0].artifactVersionId } });
    check(
      "a changed source creates version 2 under the new policy version and SNAPSHOT stores the raw bytes privately",
      snapVersion?.version === 2 &&
        Boolean(snapVersion.rawObjectKey) &&
        (await s.head(snapVersion.rawObjectKey))?.bytes === Buffer.byteLength(fixtureBody),
    );
    check("ingestion never creates learning content", (await db.lesson.count()) === lessonsBefore);
    check(
      "source changes and runs are audited",
      (await db.auditLog.count({ where: { targetId: sourceKey, action: { in: ["source.create", "source.enable", "source.update"] } } })) ===
        3,
    );

    // ---------- CF-T1/T3 content release importer ----------
    const manifest = structuredClone(releaseFixture);
    manifest.name = `${prefix}-release`;
    manifest.sources = manifest.sources.map((src) => ({ ...src, key: `${prefix}-${src.key}`.slice(0, 60) }));
    manifest.packs = manifest.packs.map((pk) => ({ ...pk, key: `${prefix}-${pk.key}`.slice(0, 80) }));
    created.sources.push(...manifest.sources.map((x) => x.key));
    created.packs.push(...manifest.packs.map((x) => x.key));
    const counts = () =>
      Promise.all([db.contentRelease.count(), db.contentPackVersion.count(), db.lesson.count(), db.sourcePolicyVersion.count()]).then((v) =>
        v.join("/"),
      );
    const beforePlan = await counts();
    const plan = await req("/admin/releases/plan", "POST", { manifest }, admin.token);
    check(
      "dry run lists exact changes and writes nothing",
      plan.status === 201 && !plan.data.blocked && plan.data.packs[0].action === "new-version" && (await counts()) === beforePlan,
    );
    check(
      "a fixture release can never target pilot",
      (await planRelease(db, manifest, "pilot")).blockers.some((b) => b.includes("fixture")),
    );
    const broken = structuredClone(manifest);
    broken.packs[0].sources[1].license = "CC_BY_ND";
    const brokenPlan = await req("/admin/releases/plan", "POST", { manifest: broken }, admin.token);
    check(
      "a pack failing a rights gate blocks the whole release",
      brokenPlan.data.blocked && brokenPlan.data.packs[0].errors.some((e) => e.includes("CC_BY_ND")),
    );
    let blockedApply = null;
    try {
      await applyRelease(db, broken, { target: "development", initiatedById: owner.id, approvedByEmail: adminEmail });
    } catch (error) {
      blockedApply = error;
    }
    check(
      "a blocked release applies nothing (no partial release)",
      blockedApply?.message === "RELEASE_BLOCKED" && (await counts()) === beforePlan,
    );
    const applied = await applyRelease(db, manifest, { target: "development", initiatedById: owner.id, approvedByEmail: adminEmail });
    created.releases.push(applied.receipt.id);
    const v1Pack = await db.contentPackVersion.findFirst({ where: { packKey: manifest.packs[0].key, version: 1 } });
    const v1Lesson = await db.lesson.findUnique({ where: { id: v1Pack.lessonId }, include: { steps: true } });
    check(
      "apply writes a receipt and a released, synthetic shared-library lesson pinned to the pack version",
      applied.receipt.status === "APPLIED" &&
        v1Pack.status === "released" &&
        v1Lesson.status === "published" &&
        v1Lesson.scope === "SHARED_LIBRARY" &&
        v1Lesson.synthetic === true &&
        v1Lesson.packVersionId === v1Pack.id &&
        v1Lesson.steps.some((st) => st.type === "QUIZ"),
    );
    const again = await applyRelease(db, manifest, { target: "development", initiatedById: owner.id, approvedByEmail: adminEmail });
    check(
      "re-applying the same manifest is idempotent",
      again.idempotent &&
        again.receipt.id === applied.receipt.id &&
        (await db.contentPackVersion.count({ where: { packKey: manifest.packs[0].key } })) === 1,
    );
    check(
      "the new source policy arrives disabled",
      (await db.sourcePolicy.findUnique({ where: { key: manifest.sources[0].key } })).enabled === false,
    );
    const v2Manifest = structuredClone(manifest);
    v2Manifest.name = `${prefix}-release-2`;
    v2Manifest.packs[0].title += " (bản 2)";
    const secondRelease = await applyRelease(db, v2Manifest, {
      target: "development",
      initiatedById: owner.id,
      approvedByEmail: adminEmail,
    });
    created.releases.push(secondRelease.receipt.id);
    const v2Pack = await db.contentPackVersion.findFirst({ where: { packKey: manifest.packs[0].key, version: 2 } });
    check(
      "a changed pack becomes version 2; version 1 retires and its lesson archives (evidence kept)",
      v2Pack?.status === "released" &&
        (await db.contentPackVersion.findUnique({ where: { id: v1Pack.id } })).status === "retired" &&
        (await db.lesson.findUnique({ where: { id: v1Pack.lessonId } })).status === "archived",
    );
    const retired = await req(
      `/admin/releases/${secondRelease.receipt.id}/retire`,
      "POST",
      { reason: "rút bản 2", confirm: true },
      admin.token,
    );
    check(
      "retiring release 2 restores version 1 and archives version 2",
      retired.status === 201 &&
        (await db.contentPackVersion.findUnique({ where: { id: v1Pack.id } })).status === "released" &&
        (await db.lesson.findUnique({ where: { id: v1Pack.lessonId } })).status === "published" &&
        (await db.lesson.findUnique({ where: { id: v2Pack.lessonId } })).status === "archived",
    );
    const coverage = await req("/admin/content/coverage", "GET", undefined, admin.token);
    const fixtureRow = coverage.data.rows.find((r) => r.synthetic && r.grade === 8 && r.domain === "ENERGY");
    const releasedRow = coverage.data.rows.find((r) => !r.synthetic && r.grade === 8 && r.domain === "ENERGY");
    check(
      "coverage reports five dimensions with numerator/denominator/gaps and keeps fixtures apart",
      fixtureRow.lessons_released.numerator >= 1 &&
        Array.isArray(fixtureRow.lessons_released.gaps) &&
        releasedRow.outcomes_mapped.denominator === null,
    );

    // ---------- CF-T4 practical activity and simulation pack ----------
    const flag = structuredClone(flagshipFixture.items[0]);
    flag.activity.key = `${prefix}-circuit`.slice(0, 60);
    const practical = await req("/admin/practicals", "POST", flag.activity, admin.token);
    created.practicals.push(flag.activity.key);
    const practicalAgain = await req("/admin/practicals", "POST", flag.activity, admin.token);
    check(
      "a practical activity version is immutable and content-addressed",
      practical.status === 201 && practicalAgain.data.id === practical.data.id && practicalAgain.data.unchanged,
    );
    const packBody = { ...flag.pack, key: `${prefix}-circuit`.slice(0, 60), activityVersionId: practical.data.id };
    created.simPacks.push(packBody.key);
    const badPack = await req(
      "/admin/sim-packs",
      "POST",
      { ...packBody, template: { ...packBody.template, ranges: { maxCurrentMa: { min: 1, max: 99 } } } },
      admin.token,
    );
    check("out-of-range template → 422 SIM_PACK_INVALID", envelope(badPack, 422, "SIM_PACK_INVALID"));
    check(
      "arbitrary executable binding → 400",
      envelope(
        await req(
          "/admin/sim-packs",
          "POST",
          {
            ...packBody,
            bindings: [
              { when: { output: "status", op: "eq", value: "x" }, target: "led", effect: { type: "label", value: "() => fetch('x')" } },
            ],
          },
          admin.token,
        ),
        400,
        "VALIDATION_FAILED",
      ),
    );
    const draftPack = await req("/admin/sim-packs", "POST", packBody, admin.token);
    check(
      "a valid pack stores a draft with server golden results",
      draftPack.status === 201 && draftPack.data.status === "draft" && draftPack.data.golden.every((g) => g.ok),
    );
    // GLB visual compatibility for the eye pack
    const glb = (nodes) => {
      const body = Buffer.from(JSON.stringify({ asset: { version: "2.0" }, nodes: nodes.map((name) => ({ name })) }));
      const padded = Buffer.concat([body, Buffer.alloc((4 - (body.length % 4)) % 4, 0x20)]);
      const header = Buffer.alloc(20);
      header.write("glTF", 0);
      header.writeUInt32LE(2, 4);
      header.writeUInt32LE(20 + padded.length, 8);
      header.writeUInt32LE(padded.length, 12);
      header.write("JSON", 16);
      return Buffer.concat([header, padded]);
    };
    const eyeFlag = structuredClone(flagshipFixture.items[2]);
    eyeFlag.activity.key = `${prefix}-eye`.slice(0, 60);
    const eyePractical = await req("/admin/practicals", "POST", eyeFlag.activity, admin.token);
    created.practicals.push(eyeFlag.activity.key);
    const partial = await upload(admin.token, "mat-thieu.glb", "model/gltf-binary", glb(["cornea", "lens"]));
    const full = await upload(admin.token, "mat.glb", "model/gltf-binary", glb(Object.values(eyeFlag.pack.semanticMap)));
    const eyeBody = { ...eyeFlag.pack, key: `${prefix}-eye`.slice(0, 60), activityVersionId: eyePractical.data.id };
    created.simPacks.push(eyeBody.key);
    const missingNodes = await req(
      "/admin/sim-packs",
      "POST",
      { ...eyeBody, visualAssetVersionId: partial.complete.data.versionId },
      admin.token,
    );
    check(
      "a GLB missing mapped semantic nodes → 422",
      envelope(missingNodes, 422, "SIM_PACK_INVALID") && /retina/.test(missingNodes.data.message),
    );
    check(
      "a GLB with every mapped node validates",
      (await req("/admin/sim-packs", "POST", { ...eyeBody, visualAssetVersionId: full.complete.data.versionId }, admin.token)).status ===
        201,
    );
    // Attempts pin the active pack; history keeps its own
    const classMade = await req("/classes", "POST", { name: `${prefix} lớp`, grade: 8 }, owner.token, {
      "Idempotency-Key": crypto.randomUUID(),
    });
    created.classes.push(classMade.data.class.id);
    const provisioned = await req(
      `/classes/${classMade.data.class.id}/students`,
      "POST",
      { username: `${prefix}-hs`, fullName: "CF học sinh", grade: 8, consent: true },
      owner.token,
      { "Idempotency-Key": crypto.randomUUID() },
    );
    createdUsers.push(provisioned.data.user.id);
    let sLogin = await req("/auth/student/login", "POST", {
      username: provisioned.data.credentials.username,
      password: provisioned.data.credentials.temporaryPassword,
    });
    if (sLogin.status === 429) {
      await new Promise((r) => setTimeout(r, 61000));
      sLogin = await req("/auth/student/login", "POST", {
        username: provisioned.data.credentials.username,
        password: provisioned.data.credentials.temporaryPassword,
      });
    }
    const studentToken = (
      await req(
        "/auth/password",
        "POST",
        { currentPassword: provisioned.data.credentials.temporaryPassword, password: "CF-Student-Password-2026!" },
        sLogin.data.accessToken,
      )
    ).data.accessToken;
    const previousActive = await db.simulationPackVersion.findFirst({ where: { labId: "circuit", status: "active" } });
    restorePack = previousActive?.id ?? null;
    const before = await req(
      "/attempts",
      "POST",
      { challengeId: "circuit_001", labState: flag.pack.template.goldenCases[2].state, durationMs: 1000 },
      studentToken,
    );
    const activated = await req(
      `/admin/sim-packs/${draftPack.data.id}/activate`,
      "POST",
      { reason: "kích hoạt gói kiểm thử" },
      admin.token,
    );
    const after = await req(
      "/attempts",
      "POST",
      { challengeId: "circuit_001", labState: flag.pack.template.goldenCases[2].state, durationMs: 1000 },
      studentToken,
    );
    check(
      "a future attempt pins the newly active pack; the earlier attempt keeps its own",
      activated.status === 201 &&
        after.data.packVersionId === draftPack.data.id &&
        before.data.packVersionId === (previousActive?.id ?? null),
    );
    check(
      "an active pack cannot be re-activated (immutable)",
      envelope(
        await req(`/admin/sim-packs/${draftPack.data.id}/activate`, "POST", { reason: "lặp lại" }, admin.token),
        409,
        "PACK_NOT_DRAFT",
      ),
    );
    const replay = await req(`/admin/attempts/${before.data.id}/reproduce`, "GET", undefined, admin.token);
    check("the earlier attempt still reproduces its original verdict", replay.data.matches === true);
    check(
      "the preview route resolves the model by its allowlisted reference",
      (await req("/simulate/circuit", "POST", flag.pack.template.goldenCases[2].state, studentToken)).data?.verdict === "passed",
    );
  },
  async cleanup() {
    fixtureServer.close();
    const s = storage();
    if (created.simPacks.length) {
      const packIds = (await db.simulationPackVersion.findMany({ where: { key: { in: created.simPacks } }, select: { id: true } })).map(
        (p) => p.id,
      );
      await db.attempt.updateMany({ where: { packVersionId: { in: packIds } }, data: { packVersionId: null } });
      await db.simulationPackVersion.deleteMany({ where: { id: { in: packIds } } });
      if (restorePack) await db.simulationPackVersion.update({ where: { id: restorePack }, data: { status: "active", retiredAt: null } });
    }
    await db.practicalActivityVersion.deleteMany({ where: { key: { in: created.practicals } } });
    const packVersions = await db.contentPackVersion.findMany({ where: { packKey: { in: created.packs } } });
    await db.contentReleaseItem.deleteMany({ where: { releaseId: { in: created.releases } } });
    await db.contentRelease.deleteMany({ where: { id: { in: created.releases } } });
    await db.contentPackVersion.deleteMany({ where: { packKey: { in: created.packs } } });
    await db.lesson.deleteMany({ where: { id: { in: packVersions.map((v) => v.lessonId).filter(Boolean) } } });
    await db.contentPack.deleteMany({ where: { key: { in: created.packs } } });
    const artifacts = await db.sourceArtifact.findMany({ where: { sourceKey: { in: created.sources } }, include: { versions: true } });
    for (const a of artifacts) for (const v of a.versions) if (v.rawObjectKey) await s.delete(v.rawObjectKey).catch(() => undefined);
    await db.sourceArtifactVersion.deleteMany({ where: { artifactId: { in: artifacts.map((a) => a.id) } } });
    await db.sourceArtifact.deleteMany({ where: { id: { in: artifacts.map((a) => a.id) } } });
    const runs = await db.ingestionRun.findMany({ where: { sourceKey: { in: created.sources } }, select: { id: true } });
    await db.ingestionItem.deleteMany({ where: { runId: { in: runs.map((r) => r.id) } } });
    await db.ingestionRun.deleteMany({ where: { id: { in: runs.map((r) => r.id) } } });
    await db.sourcePolicyVersion.deleteMany({ where: { key: { in: created.sources } } });
    await db.sourcePolicy.deleteMany({ where: { key: { in: created.sources } } });
    await db.assignment.deleteMany({ where: { classId: { in: created.classes } } });
    await db.classroom.deleteMany({ where: { id: { in: created.classes } } });
    await db.auditLog.deleteMany({ where: { targetId: { in: [...created.sources, ...created.releases, ...runs.map((r) => r.id)] } } });
    const assets = await db.asset.findMany({ where: { OR: [{ ownerId: { in: createdUsers } }] }, include: { versions: true } });
    for (const a of assets)
      for (const v of a.versions) {
        if (v.multipart && v.uploadId && v.stagingKey) await s.abortMultipart(v.stagingKey, v.uploadId);
        for (const key of [v.objectKey, v.stagingKey]) if (key) await s.delete(key).catch(() => undefined);
      }
    await db.assetVersion.deleteMany({ where: { assetId: { in: assets.map((a) => a.id) } } });
    await db.asset.deleteMany({ where: { id: { in: assets.map((a) => a.id) } } });
    await db.auditLog.deleteMany({ where: { OR: [{ actorId: { in: createdUsers } }, { targetId: { in: assets.map((a) => a.id) } }] } });
    await db.user.deleteMany({ where: { id: { in: createdUsers } } });
  },
});
