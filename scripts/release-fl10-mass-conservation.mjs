// FL-10 release lifecycle via the existing admin API; never writes directly to the database.
// Required env: NEXALAB_API, NEXALAB_ADMIN_EMAIL, NEXALAB_ADMIN_PASSWORD.
// Optional: FL10_EXPECTED_DIGEST, FL10_CREATE_DRAFT=true, FL10_LESSON_ID,
//           FL10_PUBLISH=true, FL10_OWNER_EVIDENCE_JSON (JSON string).
// Safe default is list-only. Draft creation and OWNER_SIGNOFF publication each require
// explicit opt-in. Publication must match FL10_EXPECTED_DIGEST exactly.

const api = process.env.NEXALAB_API ?? "http://127.0.0.1:4000/api";
const email = process.env.NEXALAB_ADMIN_EMAIL;
const password = process.env.NEXALAB_ADMIN_PASSWORD;
const expectedDigest = process.env.FL10_EXPECTED_DIGEST;
const createDraft = process.env.FL10_CREATE_DRAFT === "true";
const publish = process.env.FL10_PUBLISH === "true";
const labId = "mass-conservation";

if (!email || !password) throw new Error("Set NEXALAB_ADMIN_EMAIL and NEXALAB_ADMIN_PASSWORD.");
if (publish && !/^[a-f0-9]{64}$/.test(expectedDigest ?? "")) {
  throw new Error("FL10_PUBLISH requires FL10_EXPECTED_DIGEST with the exact 64-character release digest.");
}
if (createDraft && !process.env.FL10_LESSON_ID) {
  throw new Error("FL10_CREATE_DRAFT requires FL10_LESSON_ID to pin the intended shared lesson.");
}

let token;
async function call(path, method = "GET", body) {
  const response = await fetch(api + path, {
    method,
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(`${method} ${path} returned ${response.status}: ${JSON.stringify(data)}`);
  return data;
}

token = (await call("/auth/admin/login", "POST", { email, password })).accessToken;
if (!token) throw new Error("Admin login returned no access token.");

let releases = await call(`/admin/labs/${labId}/releases`);
if (!Array.isArray(releases)) throw new Error("Unexpected release list response.");

let release;
if (createDraft) {
  release = await call(`/admin/labs/${labId}/releases`, "POST", {
    reason: "FL-10 mass conservation: create candidate from the currently active pinned Lab tuple.",
    lessonId: process.env.FL10_LESSON_ID,
  });
  console.log(`Candidate v${release.version} ${release.status} digest ${release.digest}${release.unchanged ? " (unchanged)" : ""}`);
} else {
  release = expectedDigest
    ? releases.find((item) => item.digest === expectedDigest)
    : releases[0];
  if (!release) throw new Error("No matching FL-10 release found. Set FL10_EXPECTED_DIGEST or explicitly set FL10_CREATE_DRAFT=true.");
  console.log(`Release v${release.version} ${release.status} digest ${release.digest}`);
}

if (expectedDigest && release.digest !== expectedDigest) {
  throw new Error("Release digest does not match FL10_EXPECTED_DIGEST; refusing to publish.");
}
if (release.status === "ACTIVE") {
  console.log("Release is already ACTIVE; no review or database write was requested.");
  process.exit(0);
}
if (!publish) {
  console.log("Not published. Set FL10_PUBLISH=true, the exact FL10_EXPECTED_DIGEST, and Owner evidence JSON to publish.");
  process.exit(0);
}
if (release.status !== "DRAFT") throw new Error(`Cannot publish release status ${release.status}.`);

let evidence;
try {
  evidence = JSON.parse(process.env.FL10_OWNER_EVIDENCE_JSON ?? "");
} catch {
  throw new Error("FL10_PUBLISH requires FL10_OWNER_EVIDENCE_JSON to contain valid JSON.");
}
const evidenceFields = ["curriculumMapping", "sourceReferences", "scientificGoldenCases", "rubric", "safetyAssessment", "rightsAssessment"];
if (!evidence || typeof evidence !== "object" || Array.isArray(evidence)
  || evidenceFields.some((field) => !(field in evidence))
  || evidenceFields.filter((field) => field !== "sourceReferences").some((field) => typeof evidence[field] !== "string" || evidence[field].trim().length < 10)
  || !Array.isArray(evidence.sourceReferences) || !evidence.sourceReferences.length
  || evidence.sourceReferences.some((source) => typeof source !== "string" || source.trim().length < 5)) {
  throw new Error(`Owner evidence JSON must include: ${evidenceFields.join(", ")}.`);
}

const published = await call(`/admin/labs/${labId}/releases/${release.id}/publish`, "POST", {
  reason: "FL-10: Owner explicitly authorized publication for the exact supplied release digest.",
  releaseDigest: expectedDigest,
  evidence,
});
console.log(`Release v${published.version ?? release.version} ${published.status ?? "published"} digest ${published.digest ?? expectedDigest}`);
