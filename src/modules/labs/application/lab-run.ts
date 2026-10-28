import { createHash } from "node:crypto";
import { z } from "zod";
import { resolveModel } from "./sim-packs";
import { normalizeVerdict } from "./simulation-versions";
import type { ChallengeParams } from "../../lessons/application/lesson-content";

/** Stable JSON for digests and idempotency; key order is not meaningful. */
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  if (value && typeof value === "object")
    return "{" + Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
      .map(([key, item]) => JSON.stringify(key) + ":" + canonical(item)).join(",") + "}";
  return JSON.stringify(value);
}
export const digest = (value: unknown) => createHash("sha256").update(canonical(value)).digest("hex");

export const launchSchema = z.object({
  challengeId: z.string().min(1).max(80),
  assignmentId: z.string().min(1).max(100).optional(),
}).strict();

export const runSubmissionSchema = z.object({
  contract: z.literal("lab-contract/1"),
  runId: z.string().min(1).max(100),
  idempotencyKey: z.string().uuid(),
  stateSchemaVersion: z.literal(1),
  evidenceSchemaVersion: z.literal(1),
  labState: z.unknown().refine((v) => v !== undefined && JSON.stringify(v).length <= 20000),
  durationMs: z.number().int().min(0).max(86400000),
}).strict();

export const executionSchema = z.object({
  modelRef: z.string().min(1),
  engineVersion: z.string().min(1),
  packVersionId: z.string().min(1),
  configVersionId: z.string().min(1),
  activityVersionId: z.string().min(1),
  activityDigest: z.string().min(1),
  activityKey: z.string().min(1),
  activityVersion: z.number().int().positive(),
  rubricRef: z.literal("legacy-challenge@1.0.0"),
  params: z.record(z.string(), z.union([z.number(), z.string()])).nullable(),
  stateSchemaVersion: z.literal(1),
  evidenceSchemaVersion: z.literal(1),
  template: z.unknown(),
}).strict();
/**
 * Frozen compatibility rubric. Its identity is recorded on LabRun; new
 * assessment behavior must use another implementation and version.
 */
export function evaluateRunV1(labId: string, state: any, params: ChallengeParams | null, modelRef: string) {
  let result: any = resolveModel(modelRef).simulate(state);
  if (params) {
    const unmet: string[] = [];
    let verdict = result.verdict as string;
    if (labId === "circuit") {
      const maxA = Number(params.maxCurrentMa ?? 20) / 1000;
      const branches: Array<{ current: number | null; leds: number }> = result.branches ?? [];
      const lit = branches.filter((b) => b.leds > 0 && b.current !== null && b.current >= 0.001 && b.current <= 0.02 + 1e-12);
      const litLeds = lit.reduce((sum, b) => sum + b.leds, 0);
      if (branches.some((b) => b.leds > 0 && b.current !== null && b.current > maxA + 1e-12)) unmet.push("maxCurrentMa");
      if (litLeds < Number(params.minLitLeds ?? 1)) unmet.push("minLitLeds");
      if (verdict === "passed" && unmet.length) verdict = "partial";
    } else if (labId === "chemistry") {
      if (params.experiment === "ph") {
        const samples: Array<{ type: string | null }> = result.samples ?? [];
        if (samples.length !== 3 || samples.some((sample) => sample.type == null)) verdict = "not_passed";
      } else if (params.reactionId && state?.reactionId !== params.reactionId) {
        unmet.push("reactionId");
        verdict = "not_passed";
      }
    } else if (labId === "eye") {
      const score = Number(result.score ?? 0);
      if (score >= Number(params.minScore ?? 100)) verdict = "passed";
      else {
        unmet.push("minScore");
        verdict = score > 0 ? "partial" : "not_passed";
      }
    }
    result = { ...result, verdict, challengeCheck: { params, unmet } };
  }
  return { result, verdict: normalizeVerdict(result.verdict) };
}