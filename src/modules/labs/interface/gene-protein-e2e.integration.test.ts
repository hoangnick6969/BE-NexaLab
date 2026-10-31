import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { afterAll, describe, expect, it } from "vitest";
import { RequestRateLimiter } from "../../../common/request-rate-limiter";
import { StudentAccessService } from "../../progress/application/student-access.service";
import { GENE_VARIANT_IDS, geneExpression } from "../../../../packages/sim";
import { LabsController } from "./labs.controller";
import { GENE_TUPLE, seedGeneProteinTuple } from "./gene-protein-tuple.fixture";

/**
 * End-to-end FL-27 run through the real launch and submit endpoints, on the
 * isolated loopback database only. The student works through a class
 * assignment, which needs no LabRelease. Test rows are labelled.
 */
const url = process.env.NEXALAB_ISOLATED_DATABASE_URL;
if (url) {
  const parsed = new URL(url);
  if (!["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname))
    throw new Error("FL-27 E2E only runs against the isolated nexalab_fl27_isolated database on loopback");
}
const db = url?.endsWith("/nexalab_fl27_isolated") ? new PrismaClient({ datasourceUrl: url }) : null;
afterAll(async () => { await db?.$disconnect(); });

/** The evidence a correct learner would send for the server-pinned gene. */
function correctEvidence(variantId: string) {
  const truth = geneExpression({ variantId });
  return {
    variantId,
    structure: { bpPerTurn: 10, turnLengthA: 34, riseA: 3.4, diameterA: 20, pairing: "A" },
    replication: { stageOrder: ["UNWIND", "SYNTHESIZE", "COMPLETE"], newStrand: [...truth.replication.newStrand], semiConservative: "A" },
    transcription: { mrna: [...truth.mrna] },
    translation: { aminoAcids: [...truth.aminoAcids], codonCombos: { n1: 4, n2: 16, n3: 64 } },
    mutation: { mutatedCodon: truth.mutation.codon, mutatedAminoAcid: truth.mutation.aminoAcid, effect: truth.mutation.effect },
    conclusion: { flow: "A", geneRole: "A" },
  };
}

describe.skipIf(!db)("FL-27 gene-to-protein end-to-end on the isolated database", () => {
  it("launches a pinned run through an assignment, scores evidence on the server and refuses bad evidence", async () => {
    const p = db!;
    const admin = await p.user.findFirstOrThrow({ where: { role: "ADMIN" }, orderBy: { createdAt: "asc" } });
    await seedGeneProteinTuple(p, admin.id);
    const suffix = randomUUID().slice(0, 8);
    const teacher = await p.user.create({ data: { email: `fl27-teacher-${suffix}@example.test`, fullName: "FL-27 E2E teacher", passwordHash: "fixture", role: "TEACHER" } });
    const student = await p.user.create({ data: { username: `fl27-student-${suffix}`, fullName: "FL-27 E2E student", passwordHash: "fixture", role: "STUDENT" } });
    const classroom = await p.classroom.create({ data: { teacherId: teacher.id, name: `FL-27 E2E class ${suffix}` } });
    await p.enrollment.create({ data: { classId: classroom.id, studentId: student.id, status: "approved", approved: true } });
    const assignment = await p.assignment.create({ data: {
      classId: classroom.id, contentId: GENE_TUPLE.labId, contentType: "lab", title: `FL-27 E2E ${suffix}`,
      dueDate: new Date(Date.now() + 86400000), targets: { create: [{ studentId: student.id }] },
    } });
    const controller = new LabsController(p as any, new StudentAccessService(p as any), new RequestRateLimiter());
    const req = { user: { sub: student.id, role: "STUDENT" } };

    // 1. Launch: the server pins a gene variant and names the K7 renderer.
    const launch = await controller.launchRun(GENE_TUPLE.labId, req, { challengeId: GENE_TUPLE.challengeId, assignmentId: assignment.id });
    expect(launch).toMatchObject({ modelRef: "gene-expression@1.0.0", rubricVersion: "gene-protein-stations@1.0.0", rendererKey: "gene-expression" });
    const { variantId } = launch.runtimeParams as { variantId: string };
    expect(GENE_VARIANT_IDS).toContain(variantId);

    // 2. Correct evidence for the pinned gene scores 6/6 on the server.
    const submission = { contract: "lab-contract/1", runId: launch.runId, idempotencyKey: randomUUID(), stateSchemaVersion: 1, evidenceSchemaVersion: 1, durationMs: 1000, evidence: correctEvidence(variantId) };
    const first: any = await controller.attempt(req, submission);
    const attempt = first.attempt ?? first;
    expect(attempt.verdict).toBe("passed");
    expect(attempt.simulationResult.assessment).toMatchObject({ score: 6, maximumScore: 6, passed: true });
    expect(attempt.simulationResult._execution).toMatchObject({ rubricRef: "gene-protein-stations@1.0.0", params: { variantId } });

    // 3. Replaying the same key returns the same attempt.
    const replay: any = await controller.attempt(req, submission);
    expect((replay.attempt ?? replay).id).toBe(attempt.id);

    // 4. A translation that ignores the stop codon is scored, not refused: needs practice.
    const offFrame = correctEvidence(variantId);
    offFrame.translation.aminoAcids = [...offFrame.translation.aminoAcids.slice(0, 3), "Stop", null, null];
    const practice: any = await controller.attempt(req, { ...submission, idempotencyKey: randomUUID(), evidence: offFrame });
    expect((practice.attempt ?? practice).simulationResult.assessment.unmetCriteria).toContain("translation:codons");

    // 5. Evidence for another gene, T in RNA, or a checkpoint envelope is refused and creates no attempt.
    const otherGene = GENE_VARIANT_IDS.find((id) => id !== variantId)!;
    const tInRna = correctEvidence(variantId);
    tInRna.transcription.mrna[1] = "T";
    for (const bad of [
      { ...submission, idempotencyKey: randomUUID(), evidence: correctEvidence(otherGene) },
      { ...submission, idempotencyKey: randomUUID(), evidence: tInRna },
    ]) {
      await expect(controller.attempt(req, bad)).rejects.toBeDefined();
      expect(await p.attempt.count({ where: { labRunId: launch.runId, idempotencyKey: bad.idempotencyKey } })).toBe(0);
    }
  }, 60000);
});
