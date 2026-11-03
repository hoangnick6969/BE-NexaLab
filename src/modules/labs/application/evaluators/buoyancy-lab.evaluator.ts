import { z } from "zod";
import { simulateBuoyancy, buoyancyConfigSchema } from "../../../../../packages/sim/buoyancy";
import type { LabEvaluator } from "./lab-evaluator";

const evidenceSchema = z.object({
  specimenId: z.string().min(1).max(60),
  submergedVolumeMl: z.number().finite().min(0).max(500),
  overflowMl: z.number().finite().min(0).max(500),
  measuredBuoyantForceN: z.number().finite().min(0).max(50),
}).strict();

type BuoyancyEvidence = z.infer<typeof evidenceSchema>;
export const buoyancyLabEvaluator: LabEvaluator<BuoyancyEvidence> = {
  rubricRef: "buoyancy-archimedes@1.0.0",
  activity: { key: "buoyancy-archimedes", version: 1 },
  modelRefs: ["buoyancy@1.0.0"],
  rendererKey: "buoyancy-bench",
  envelope: "evidence",
  evidenceSchema,
  evaluate: (_runId, evidence, runtime) => {
    const template = buoyancyConfigSchema.parse((runtime.template as { buoyancy?: unknown } | null)?.buoyancy);
    const specimen = template.specimens.find((item) => item.id === evidence.specimenId);
    if (!specimen) throw new Error("Specimen is not in the pinned buoyancy pack");
    // Verification is performed at full immersion; a learner cannot choose the expected volume.
    const submergedMl = specimen.volumeMl;
    const truth = simulateBuoyancy({ massKg: specimen.massG / 1000, volumeM3: specimen.volumeMl / 1e6, submergedVolumeM3: submergedMl / 1e6, fluidDensityKgM3: template.fluidDensityKgM3, gravity: template.gravity });
    const volumeErrorMl = Math.abs(evidence.overflowMl - submergedMl);
    const forceErrorN = Math.abs(evidence.measuredBuoyantForceN - truth.buoyantForceN);
    const volumeOk = volumeErrorMl <= template.volumeToleranceMl && Math.abs(evidence.submergedVolumeMl - submergedMl) <= template.volumeToleranceMl;
    const forceOk = forceErrorN <= template.forceToleranceN;
    return { verdict: volumeOk && forceOk ? "passed" : "needs_practice", result: { assessment: { score: Number(volumeOk) + Number(forceOk), maximumScore: 2, unmetCriteria: [...(volumeOk ? [] : ["overflow"]), ...(forceOk ? [] : ["force"])] }, volumeErrorMl, forceErrorN, expected: truth } };
  },
};
