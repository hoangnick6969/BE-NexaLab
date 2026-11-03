/**
 * FL-16 release through the real admin API, run by the OWNER with their own admin login.
 *
 * The OWNER_SIGNOFF receipt records the authenticated reviewer, so nobody else
 * (and no agent) should run `publish` for the owner. Two steps, so the owner checks
 * the digest of the exact snapshot before signing it:
 *
 *   NEXALAB_API=https://<api-host>/api NEXALAB_ADMIN_EMAIL=... NEXALAB_ADMIN_PASSWORD=... \
 *     node scripts/release-fl16-eye-optics.mjs draft
 *   ...  node scripts/release-fl16-eye-optics.mjs publish <releaseId> <digest>
 *
 * `draft` binds the reviewed lesson (DIRECT_LESSON) in the release snapshot; `publish`
 * records OWNER_SIGNOFF with the evidence below and activates the release, which turns
 * the Lab into SHARED_LIBRARY with releaseCleared = true. Nothing is written directly
 * to the database.
 */
const LAB_ID = "eye-optics";
/** "Hệ thần kinh và các giác quan ở người" (topic KHTN8-L37), published, pack released, outcome KHTN8-B37-O04. Read-only check 2026-11-03. */
const LESSON_ID = "pack-structured-224cf04f147bbd206755a21b6189dda45903460d-v1";

const EVIDENCE = {
  curriculumMapping: "KHTN8-B37-O04 (topic KHTN8-L37, chapter KHTN8-CH07), bound to lesson " + LESSON_ID + ". Phase 2 (accommodation, mild myopia, hyperopia) extends the outcome; SME checklist fl-16-sme-review-checklist.md is not yet signed and the owner approves on owner authority.",
  sourceReferences: [
    "BE-NexaLab _bmad-output/specs/spec-lab-pipeline/fl-16-eye-anatomy-kit-plan.md",
    "BE-NexaLab _bmad-output/specs/spec-lab-pipeline/fl-16-sme-review-checklist.md",
    "BE commit dba9021 (model, rubric, seed); FE commit 814b158 (EX-A kit, activity)",
  ],
  scientificGoldenCases: "Reduced-eye model eye-optics@1.0.0: P = n/L + 1/d, n = 1.336, cornea 43 D, lens 16-26 D, tolerance 0.5 D. Golden cases: full answer passed 11/11, names only partial, empty needs_practice. BE vitest 343/343; FE parity 7/7; E2E graded 11/11 by the server rubric.",
  rubric: "eye-anatomy-optics@1.0.0: 8 part-name criteria (retina accepts Võng mạc or Màng lưới, case and diacritics ignored) + 3 optics scenarios (in focus within 0.5 D, distance within 2 cm, glasses sign, relaxed lens when far). Passed 11/11, partial from 6.",
  safetyAssessment: "Virtual model only; on-screen disclaimer that it is illustrative and not an eye examination or medical advice.",
  rightsAssessment: "All geometry and textures are procedural code in the repository; no third-party images, meshes or HDR files are shipped. Reference pictures were used only as visual guidance.",
};

const api = process.env.NEXALAB_API ?? "http://127.0.0.1:4000/api";

async function call(path, method, token, body) {
  const response = await fetch(api + path, {
    method,
    headers: { "content-type": "application/json", ...(token ? { authorization: "Bearer " + token } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) throw new Error(`${method} ${path} → ${response.status} ${text}`);
  return data;
}

async function login() {
  const email = process.env.NEXALAB_ADMIN_EMAIL;
  const password = process.env.NEXALAB_ADMIN_PASSWORD;
  if (!email || !password) throw new Error("Set NEXALAB_ADMIN_EMAIL and NEXALAB_ADMIN_PASSWORD to the owner's admin account");
  return (await call("/auth/admin/login", "POST", null, { email, password })).accessToken;
}

async function main() {
  const [command, releaseId, digest] = process.argv.slice(2);
  if (command === "draft") {
    const token = await login();
    const release = await call(`/admin/labs/${LAB_ID}/releases`, "POST", token, {
      reason: "FL-16 Showcase Pilot (Kit EX-A): release candidate from BE dba9021 / FE 814b158",
      lessonId: LESSON_ID,
    });
    console.log(JSON.stringify({
      releaseId: release.id, version: release.version, status: release.status, digest: release.digest,
      reviewPolicy: release.snapshot?.reviewPolicy, requiredReviewKinds: release.snapshot?.requiredReviewKinds,
      lessonBindings: release.snapshot?.lessonBindings?.map((b) => ({ type: b.bindingType, lessonId: b.lessonId })),
      next: `node scripts/release-fl16-eye-optics.mjs publish ${release.id} ${release.digest}`,
    }, null, 1));
    return;
  }
  if (command === "publish") {
    if (!releaseId || !/^[a-f0-9]{64}$/.test(digest ?? "")) throw new Error("Usage: publish <releaseId> <digest from the draft step>");
    const token = await login();
    const releases = await call(`/admin/labs/${LAB_ID}/releases`, "GET", token);
    const release = releases.find((item) => item.id === releaseId);
    if (!release || release.digest !== digest) throw new Error("Release not found or digest differs from the draft you reviewed");
    const active = await call(`/admin/labs/${LAB_ID}/releases/${releaseId}/publish`, "POST", token, {
      reason: "Owner sign-off FL-16 (Kit EX-A) 2026-11-03",
      releaseDigest: digest,
      evidence: EVIDENCE,
    });
    console.log(JSON.stringify({ releaseId: active.id, version: active.version, status: active.status, activatedAt: active.activatedAt }, null, 1));
    return;
  }
  throw new Error("Usage: draft | publish <releaseId> <digest>");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
