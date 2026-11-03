/** Owner-operated API workflow; no SQL, credentials in files, automatic approvals or DB bypass. */
import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
const canonical = (value) => Array.isArray(value) ? "[" + value.map(canonical).join(",") + "]" : value && typeof value === "object" ? "{" + Object.keys(value).sort().filter((key) => value[key] !== undefined).map((key) => JSON.stringify(key) + ":" + canonical(value[key])).join(",") + "}" : JSON.stringify(value);
const digest = (value) => createHash("sha256").update(canonical(value)).digest("hex");
const read = async (path) => JSON.parse(await readFile(path, "utf8"));
function assertRelease(release, candidate, hashes) {
  const snapshot = release?.snapshot;
  if (!release || digest(snapshot) !== release.digest || snapshot?.lab?.id !== "buoyancy" || snapshot?.execution?.modelRef !== candidate.pack.modelRef || snapshot?.execution?.rubricRef !== candidate.rubric.rubricRef || digest(snapshot?.execution?.template) !== digest(candidate.pack.template) || snapshot?.activity?.digest !== hashes.activityDigest || !snapshot?.lessonBindings?.some((binding) => binding.contentPackVersionDigest === hashes.contentDigest))
    throw new Error("Release snapshot model, activity, template or reviewed content differs from the local candidate");
}
const api = process.env.NEXALAB_API ?? "http://127.0.0.1:4000/api";
async function call(path, method, token, body) {
  const response = await fetch(api + path, { method, headers: { "content-type": "application/json", ...(token ? { authorization: "Bearer " + token } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const value = await response.text();
  if (!response.ok) throw new Error(`${method} ${path}: ${response.status} ${value}`);
  return value ? JSON.parse(value) : null;
}
async function main() {
  const [command, file = "content/fl05/review-receipt.local.json"] = process.argv.slice(2);
  if (!["draft", "signoff", "activate"].includes(command)) throw new Error("Usage: node scripts/release-fl05.mjs draft|signoff|activate [receipt-file]");
  const candidate = await read("content/fl05/release-candidate.json");
  const hashes = await read("content/fl05/digests.json");
  if (digest(candidate) !== hashes.candidateDigest) throw new Error("Candidate digest mismatch");
  const email = process.env.NEXALAB_ADMIN_EMAIL, password = process.env.NEXALAB_ADMIN_PASSWORD;
  if (!email || !password) throw new Error("Set the owner's NEXALAB_ADMIN_EMAIL and NEXALAB_ADMIN_PASSWORD in your terminal");
  const token = (await call("/auth/admin/login", "POST", null, { email, password })).accessToken;
  let receipt;
  if (command === "draft") {
    if (!process.env.FL05_LESSON_ID) throw new Error("Set FL05_LESSON_ID to the reviewed, released lesson ID");
    const release = await call("/admin/labs/buoyancy/releases", "POST", token, { reason: "Prepare FL-05 exact snapshot for owner review", lessonId: process.env.FL05_LESSON_ID });
    assertRelease(release, candidate, hashes);
    receipt = { ...await read("content/fl05/review-receipt.template.json"), releaseId: release.id, releaseDigest: release.digest };
    await writeFile(file, JSON.stringify(receipt, null, 2) + "\n", { flag: "wx" });
    console.log(JSON.stringify({ releaseId: release.id, releaseDigest: release.digest, candidateDigest: hashes.candidateDigest, receipt: file, signed: false }, null, 2));
    return;
  }
  receipt = await read(file);
  if (receipt.candidateDigest !== hashes.candidateDigest || !receipt.releaseId || !/^[a-f0-9]{64}$/.test(receipt.releaseDigest ?? "")) throw new Error("Receipt has no matching candidate/release digest");
  const releases = await call("/admin/labs/buoyancy/releases", "GET", token);
  const release = releases.find((item) => item.id === receipt.releaseId);
  assertRelease(release, candidate, hashes);
  if (release.digest !== receipt.releaseDigest) throw new Error("Release digest differs from the receipt");
  if (command === "signoff") {
    if (receipt.kind !== "OWNER_SIGNOFF" || receipt.decision !== "APPROVE" || receipt.note?.trim().length < 5) throw new Error("Fill the owner decision and note");
    for (const key of ["curriculumMapping", "scientificGoldenCases", "rubric", "safetyAssessment", "rightsAssessment"]) if (typeof receipt.evidence?.[key] !== "string" || receipt.evidence[key].trim().length < 10 || /TODO|PLACEHOLDER/i.test(receipt.evidence[key])) throw new Error(`Fill real review evidence: ${key}`);
    if (!Array.isArray(receipt.evidence?.sourceReferences) || !receipt.evidence.sourceReferences.length || receipt.evidence.sourceReferences.some((source) => typeof source !== "string" || source.trim().length < 5)) throw new Error("Fill reviewed sourceReferences");
    const { candidateDigest: _candidate, releaseId, ...body } = receipt;
    console.log(JSON.stringify(await call(`/lab-releases/${releaseId}/reviews`, "POST", token, body), null, 2));
    return;
  }
  console.log(JSON.stringify(await call(`/admin/labs/buoyancy/releases/${receipt.releaseId}/activate`, "POST", token, { reason: "Activate FL-05 after authenticated owner review" }), null, 2));
}
main().catch((error) => { console.error(error.message); process.exitCode = 1; });
