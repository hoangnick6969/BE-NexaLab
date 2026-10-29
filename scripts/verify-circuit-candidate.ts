import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import assert from "node:assert/strict";
import { activitySpecSchema, resolveModel } from "../src/modules/labs/application/sim-packs";
import { digest, evaluateCircuitBulbActivity } from "../src/modules/labs/application/lab-run";
const document = JSON.parse(readFileSync("_bmad-output/specs/spec-lab-pipeline/circuit-release-candidate.json", "utf8"));
const c = document.candidate;
assert.equal(digest(c), document.contentDigest);
for (const [path, hash] of Object.entries(c.codeSha256)) assert.equal(createHash("sha256").update(readFileSync(path)).digest("hex"), hash);
activitySpecSchema.omit({ reviews: true }).parse(c.activity);
assert.equal(c.releaseDigest, null);
assert.deepEqual(c.reviews, []);
const model = resolveModel(c.modelRef);
for (const golden of c.goldenCases) {
  const actual = (model.simulate as any)(golden.state);
  assert.equal(actual.circuitPath, golden.expected.circuitPath);
  assert.equal(actual.bulbState, golden.expected.bulbState);
}
const checkpoints = c.goldenCases.map((g: any) => ({ id: g.id, state: g.state, prediction: g.expected.bulbState }));
assert.equal(evaluateCircuitBulbActivity(checkpoints, "A").result.assessment.score, 3);
assert.equal(evaluateCircuitBulbActivity(checkpoints, "B").result.assessment.score, 2);
for (const index of [0, 1]) {
  const wrong = structuredClone(checkpoints);
  wrong[index].prediction = wrong[index].prediction === "ON" ? "OFF" : "ON";
  assert.equal(evaluateCircuitBulbActivity(wrong, "A").result.assessment.score, 2);
}
console.log(`PASS: candidate digest/code hashes, activity contract, two golden observations and four rubric cases. Content digest: ${document.contentDigest}. No database accessed.`);
