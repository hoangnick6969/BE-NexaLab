// Audited Admin API authoring only. No SQL, schema migration, seed or automatic approval.
import "dotenv/config";
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import assert from "node:assert/strict";

const candidate = JSON.parse(readFileSync(new URL("../content/simulation-packs/fl07-candidate.json", import.meta.url), "utf8"));
const api = (process.env.NEXALAB_API ?? "http://127.0.0.1:4000/api").replace(/\/$/, "");
const publish = process.argv.includes("--publish");
const apply = publish || process.argv.includes("--apply");
const canonical = value => Array.isArray(value) ? `[${value.map(canonical).join(",")}]` : value && typeof value === "object"
  ? `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}` : JSON.stringify(value);
const same = (a, b) => canonical(a) === canonical(b);
const evidence = publish ? JSON.parse(readFileSync(process.env.FL07_OWNER_EVIDENCE_PATH ?? "", "utf8")) : null;
if (publish) assert.match(process.env.FL07_EXPECTED_DIGEST ?? "", /^[a-f0-9]{64}$/, "Publication requires the owner's reviewed FL07_EXPECTED_DIGEST and evidence file");
assert.ok(process.env.NEXALAB_ADMIN_PASSWORD, "Set NEXALAB_ADMIN_PASSWORD; credentials are never printed");
let token;
async function call(path, method = "GET", body) {
  const response = await fetch(api + path, { method, headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(30000) });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(`${method} ${path}: ${response.status} ${JSON.stringify(data)}`);
  return data;
}
token = (await call("/auth/admin/login", "POST", { email: process.env.NEXALAB_ADMIN_EMAIL ?? "admin@nexalab.local", password: process.env.NEXALAB_ADMIN_PASSWORD })).accessToken;
assert.ok(token);
const labId = candidate.lab.id;
async function otherReleases() {
  const labs = await call("/admin/labs");
  const result = [];
  for (const lab of labs.filter(item => item.id !== labId)) {
    const releases = await call(`/admin/labs/${lab.id}/releases`);
    result.push({ id: lab.id, status: lab.status, scope: lab.scope, releaseCleared: lab.releaseCleared,
      releases: releases.map(release => ({ id: release.id, digest: release.digest, status: release.status })) });
  }
  return result.sort((a, b) => a.id.localeCompare(b.id));
}
const before = await otherReleases();
console.log(JSON.stringify({ api, labId, mode: publish ? "publish" : apply ? "prepare" : "read-only" }));
if (apply) {
  await call("/admin/labs", "POST", candidate.lab);
  const activity = await call("/admin/practicals", "POST", candidate.activity);
  assert.equal(activity.version, 1, "Activity v1 content must not drift");
  const configInput = { challengeParams: { [candidate.lab.challengeId]: {} }, reason: candidate.lab.reason,
    goldenCases: candidate.pack.template.goldenCases.map(g => ({ challengeId: candidate.lab.challengeId, label: g.label, labState: g.state, expectedVerdict: g.expectedVerdict })) };
  const versions = (await call(`/admin/labs/${labId}/versions`)).versions;
  let config = versions.find(item => ["draft", "active"].includes(item.status) && item.modelRef === candidate.lab.modelRef && same(item.challengeParams, configInput.challengeParams)
    && same(item.goldenCases.map(({ actual, ...g }) => g), configInput.goldenCases));
  if (!config) config = await call(`/admin/labs/${labId}/versions`, "POST", configInput);
  const packInput = { ...candidate.pack, activityVersionId: activity.id };
  const packs = (await call(`/admin/labs/${labId}/packs`)).packs;
  let pack = packs.find(item => ["draft", "active"].includes(item.status) && Object.entries(packInput).every(([key, value]) => same(item[key], value)));
  if (!pack) pack = await call("/admin/sim-packs", "POST", packInput);
  if (config.status === "draft") await call(`/admin/labs/${labId}/versions/${config.version}/activate`, "POST", { reason: candidate.lab.reason });
  if (pack.status === "draft") await call(`/admin/sim-packs/${pack.id}/activate`, "POST", { reason: candidate.lab.reason });
  const release = await call(`/admin/labs/${labId}/releases`, "POST", { reason: candidate.lab.reason, lessonIds: candidate.lessonIds });
  const snapshot = release.snapshot;
  assert.equal(createHash("sha256").update(canonical(snapshot)).digest("hex"), release.digest);
  assert.equal(snapshot.execution.modelRef, candidate.lab.modelRef);
  assert.equal(snapshot.execution.rubricRef, "thermal-energy-investigation@1.0.0");
  assert.equal(snapshot.execution.configVersionId, config.id);
  assert.equal(snapshot.execution.packVersionId, pack.id);
  assert.equal(snapshot.execution.activityVersion, 1);
  const { reviews, ...spec } = candidate.activity;
  assert.deepEqual(snapshot.activity.spec, spec);
  assert.deepEqual(snapshot.outcomes, candidate.activity.outcomeCodes);
  assert.deepEqual(snapshot.lessonBindings.map(binding => binding.lessonId), candidate.lessonIds);
  for (const expected of candidate.sourceBindings) {
    const actual = snapshot.lessonBindings.find(binding => binding.lessonId === expected.lessonId);
    assert.ok(actual, "Expected B27 source binding is missing");
    assert.equal(actual.contentPackVersionId, expected.contentPackVersionId, "B27 content pack changed since preparation");
    assert.equal(actual.contentPackVersionDigest, expected.contentPackVersionDigest, "B27 content digest changed since preparation");
  }
  assert.equal(snapshot.reviewPolicy, "OWNER_SIGNOFF_V1");
  assert.deepEqual(snapshot.requiredReviewKinds, ["OWNER_SIGNOFF"]);
  if (publish) {
    assert.equal(release.digest, process.env.FL07_EXPECTED_DIGEST, "Candidate changed since owner review");
    if (release.status === "APPROVED") {
      assert.ok(release.reviews?.some(review => review.kind === "OWNER_SIGNOFF" && review.decision === "APPROVE" && review.releaseDigest === release.digest), "Approved release is missing its exact-digest owner receipt");
      await call(`/admin/labs/${labId}/releases/${release.id}/activate`, "POST", { reason: "Activate FL-07 after explicit owner approval of this exact digest" });
    } else if (release.status === "DRAFT") await call(`/admin/labs/${labId}/releases/${release.id}/publish`, "POST", {
      reason: "Owner explicitly approves FL-07 publication on the reviewed exact digest", releaseDigest: release.digest, evidence,
    });
    else assert.equal(release.status, "ACTIVE", "Release must be DRAFT, APPROVED or ACTIVE for publication");
  }
  const stored = (await call(`/admin/labs/${labId}/releases`)).find(item => item.id === release.id);
  assert.equal(stored.digest, release.digest);
  if (publish) {
    assert.equal(stored.status, "ACTIVE");
    assert.ok(stored.reviews.some(review => review.kind === "OWNER_SIGNOFF" && review.decision === "APPROVE" && review.releaseDigest === release.digest));
  }
  const receipt = { labId, releaseId: release.id, digest: release.digest, status: stored.status, configVersionId: config.id, packVersionId: pack.id, activityVersionId: activity.id, verifiedAt: new Date().toISOString() };
  if (process.env.FL07_RECEIPT_PATH) writeFileSync(process.env.FL07_RECEIPT_PATH, JSON.stringify(receipt, null, 2) + "\n");
  console.log(JSON.stringify(receipt));
}
assert.deepEqual(await otherReleases(), before, "Another Lab changed during FL-07 preparation");
