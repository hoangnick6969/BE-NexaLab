// Admin API only. --apply prepares the candidate; --publish also signs the verified digest.
import "dotenv/config";
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import assert from "node:assert/strict";

const candidate = JSON.parse(readFileSync(new URL("../content/simulation-packs/fl06-candidate.json", import.meta.url), "utf8"));
const api = (process.env.NEXALAB_API ?? "http://127.0.0.1:4000/api").replace(/\/$/, "");
const publish = process.argv.includes("--publish");
const apply = publish || process.argv.includes("--apply");
const canonical = value => Array.isArray(value) ? `[${value.map(canonical).join(",")}]`
  : value && typeof value === "object" ? `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}` : JSON.stringify(value);
const same = (a, b) => canonical(a) === canonical(b);
const password = process.env.NEXALAB_ADMIN_PASSWORD;
if (!password) throw new Error("Set NEXALAB_ADMIN_PASSWORD; this script never stores or prints credentials.");
let token;
async function call(path, method = "GET", body) {
  const response = await fetch(api + path, {
    method, headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(30000),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(`${method} ${path}: ${response.status} ${JSON.stringify(data)}`);
  return data;
}
token = (await call("/auth/admin/login", "POST", { email: process.env.NEXALAB_ADMIN_EMAIL ?? "admin@nexalab.local", password })).accessToken;
assert.ok(token, "Admin login returned no token");
const labId = candidate.lab.id;
async function otherReleases() {
  const labs = await call("/admin/labs");
  const result = [];
  for (const lab of labs.filter(lab => lab.id !== labId)) {
    const releases = await call(`/admin/labs/${lab.id}/releases`);
    result.push({ id: lab.id, status: lab.status, scope: lab.scope, releaseCleared: lab.releaseCleared,
      releases: releases.map(release => ({ id: release.id, digest: release.digest, status: release.status })) });
  }
  return result.sort((a, b) => a.id.localeCompare(b.id));
}
const before = await otherReleases();
console.log(JSON.stringify({ api, labId, mode: publish ? "publish" : apply ? "prepare" : "read-only", schema: "Existing Lab/LabRunEvent tables; no FL-06 DDL required" }));
if (!apply) {
  console.log("Read-only preflight passed. Use --apply to prepare or --publish to prepare and approve the exact verified digest.");
} else {
  await call("/admin/labs", "POST", candidate.lab);
  const activity = await call("/admin/practicals", "POST", candidate.activity);
  assert.equal(activity.version, 1, "lever-investigation@1 must remain version 1");
  const configInput = {
    challengeParams: { [candidate.lab.challengeId]: {} }, reason: candidate.lab.reason,
    goldenCases: candidate.pack.template.goldenCases.map(golden => ({ challengeId: candidate.lab.challengeId, label: golden.label, labState: golden.state, expectedVerdict: golden.expectedVerdict })),
  };
  const versions = (await call(`/admin/labs/${labId}/versions`)).versions;
  let config = versions.find(version => ["draft", "active"].includes(version.status) && version.modelRef === candidate.lab.modelRef && same(version.challengeParams, configInput.challengeParams)
    && same(version.goldenCases.map(({ actual, ...golden }) => golden), configInput.goldenCases));
  if (!config) config = await call(`/admin/labs/${labId}/versions`, "POST", configInput);
  const packInput = { ...candidate.pack, activityVersionId: activity.id };
  const packs = (await call(`/admin/labs/${labId}/packs`)).packs;
  let pack = packs.find(pack => ["draft", "active"].includes(pack.status) && Object.entries(packInput).every(([key, value]) => same(pack[key], value)));
  if (!pack) pack = await call("/admin/sim-packs", "POST", packInput);
  if (config.status === "draft") await call(`/admin/labs/${labId}/versions/${config.version}/activate`, "POST", { reason: candidate.lab.reason });
  if (pack.status === "draft") await call(`/admin/sim-packs/${pack.id}/activate`, "POST", { reason: candidate.lab.reason });
  const release = await call(`/admin/labs/${labId}/releases`, "POST", { reason: candidate.lab.reason, lessonIds: candidate.lessonIds });
  const snapshot = release.snapshot;
  assert.equal(createHash("sha256").update(canonical(snapshot)).digest("hex"), release.digest, "Release snapshot digest mismatch");
  assert.equal(snapshot.execution.modelRef, candidate.lab.modelRef);
  assert.equal(snapshot.execution.activityKey, candidate.activity.key);
  assert.equal(snapshot.execution.activityVersion, 1);
  assert.equal(snapshot.execution.rubricRef, "lever-investigation@1.0.0");
  assert.equal(snapshot.execution.configVersionId, config.id);
  assert.equal(snapshot.execution.packVersionId, pack.id);
  const { reviews, ...activitySpec } = candidate.activity;
  assert.deepEqual(snapshot.activity.spec, activitySpec);
  assert.deepEqual(snapshot.outcomes, [...candidate.activity.outcomeCodes].sort());
  assert.deepEqual(snapshot.lessonBindings.map(binding => binding.lessonId).sort(), [...candidate.lessonIds].sort());
  assert.equal(snapshot.reviewPolicy, "OWNER_SIGNOFF_V1");
  assert.deepEqual(snapshot.requiredReviewKinds, ["OWNER_SIGNOFF"]);
  if (process.env.FL06_EXPECTED_DIGEST) assert.equal(release.digest, process.env.FL06_EXPECTED_DIGEST);
  console.log(`Verified release v${release.version} ${release.status}: ${release.digest}`);
  if (publish && release.status !== "ACTIVE") {
    await call(`/admin/labs/${labId}/releases/${release.id}/publish`, "POST", {
      reason: "Owner explicitly authorized automated FL-06 signoff and publication; approval binds to the verified digest below.",
      releaseDigest: release.digest, evidence: candidate.ownerEvidence,
    });
  }
  const stored = (await call(`/admin/labs/${labId}/releases`)).find(item => item.id === release.id);
  assert.equal(stored.digest, release.digest);
  if (publish) {
    assert.equal(stored.status, "ACTIVE");
    assert.ok(stored.reviews.some(review => review.kind === "OWNER_SIGNOFF" && review.decision === "APPROVE" && review.releaseDigest === release.digest));
    const lab = (await call("/admin/labs")).find(lab => lab.id === labId);
    assert.equal(lab.status, "published"); assert.equal(lab.scope, "SHARED_LIBRARY"); assert.equal(lab.releaseCleared, true);
  }
  const receipt = { labId, releaseId: release.id, version: release.version, digest: release.digest, status: stored.status,
    configVersionId: config.id, packVersionId: pack.id, activityVersionId: activity.id, verifiedAt: new Date().toISOString() };
  if (process.env.FL06_RECEIPT_PATH) writeFileSync(process.env.FL06_RECEIPT_PATH, JSON.stringify(receipt, null, 2) + "\n");
  console.log(JSON.stringify(receipt));
}
assert.deepEqual(await otherReleases(), before, "Another Lab's release or visibility changed");
console.log(`Preservation verified for ${before.length} other Labs.`);
