/** One candidate only: explicit project-owner remote release authorization in the 2026-11-03 session. */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { readFile, writeFile } from "node:fs/promises";
import { seedFl05Candidate } from "./seed-fl05-candidate";
import { LabReleaseService } from "../src/modules/labs/application/lab-release.service";
const approved = "3afb7388188b213bb8eb255093ff38db6a31f5ef972f024ba2a98530265f34cc";
async function main() {
  if (process.argv[2] !== approved) throw new Error("Pass the exact owner-approved candidate digest");
  await seedFl05Candidate(approved);
  const db = new PrismaClient();
  try {
    const owner = await db.user.findUniqueOrThrow({ where: { id: "admin" } });
    if (owner.role !== "ADMIN" || owner.status !== "active" || owner.disabledAt) throw new Error("Owner account is not active");
    const lessonId = "pack-structured-2bbbebc2843a163b51fd8b4d2088c884565c2ea8-v1";
    const req = { user: { sub: owner.id, role: owner.role, email: owner.email } };
    const service = new LabReleaseService(db as any);
    const draft = await service.createDraft("buoyancy", req, { lessonId, reason: "Owner explicitly approved FL-05 candidate and remote DB override in session 2026-11-03" });
    const evidence = {
      curriculumMapping: "Owner approved KHTN8-B17-O01 / KHTN8-L17; bound to the existing published Archimedes lesson. Existing curriculum domain ENERGY is authoritative; local candidate MATTER metadata is not imported or substituted.",
      sourceReferences: ["Owner explicit approval and remote DB override in Codex session dated 2026-11-03", "Approved candidate SHA-256: " + approved, "Existing reviewed lesson: " + lessonId],
      scientificGoldenCases: "Owner approved rho=1000 kg/m3, g=9.81 m/s2, iron 78g/10mL and pebble 31.2g/12mL. Three model golden cases pass; eight evaluator/registry tests and two renderer/evidence Playwright tests pass.",
      rubric: "Owner approved buoyancy-archimedes@1.0.0: overflow within 1mL and buoyant force within 0.01N; full immersion required; pass 2/2.",
      safetyAssessment: "Owner approved virtual-only K3 instruments and ideal-fluid limitations; no live electrical, chemical or physical equipment operation.",
      rightsAssessment: "Owner approved procedural K3 geometry and authored activity. NASA and OpenStax used as reference only; no external meshes, images or source textbook text are copied.",
    };
    const receipt = { candidateDigest: approved, releaseId: draft.id, kind: "OWNER_SIGNOFF", decision: "APPROVE", releaseDigest: draft.digest, note: "Project Owner explicit approval in this session; executed by coding agent on behalf of admin account under the scoped override", evidence };
    await writeFile("content/fl05/review-receipt.local.json", JSON.stringify(receipt, null, 2) + "\n");
    let release = await db.labRelease.findUniqueOrThrow({ where: { id: draft.id } });
    if (release.status === "DRAFT") await service.review(draft.id, req, { kind: receipt.kind, decision: receipt.decision, releaseDigest: receipt.releaseDigest, note: receipt.note, evidence });
    release = await db.labRelease.findUniqueOrThrow({ where: { id: draft.id } });
    if (release.status === "APPROVED") await service.activate("buoyancy", draft.id, req, { reason: receipt.note });
    console.log(JSON.stringify({ lab: await db.lab.findUnique({ where: { id: "buoyancy" }, select: { id: true, title: true, scope: true, releaseCleared: true, status: true } }), release: await db.labRelease.findUnique({ where: { id: draft.id }, select: { id: true, status: true, digest: true, activatedAt: true } }) }, null, 2));
  } finally { await db.$disconnect(); }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
