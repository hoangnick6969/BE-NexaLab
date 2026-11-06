import { createHash } from "node:crypto";
import { z } from "zod";
import { CHECKPOINT_ACTIVITIES } from "./checkpoint-activities";
import { boundedState } from "./evaluators/legacy-challenge.evaluator";
import { labEvaluators } from "./evaluators/registry";
import type { EvidenceEnvelope } from "./evaluators/lab-evaluator";

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
  releaseId: z.string().min(1).max(100).optional(),
  resourceId: z.string().min(1).max(100).optional(),
}).strict().refine((value) => [value.assignmentId, value.releaseId, value.resourceId].filter(Boolean).length <= 1, "Run selectors cannot be combined");

const runSubmissionBase = z.object({
  contract: z.literal("lab-contract/1"),
  runId: z.string().min(1).max(100),
  idempotencyKey: z.string().uuid(),
  stateSchemaVersion: z.literal(1),
  evidenceSchemaVersion: z.literal(1),
  durationMs: z.number().int().min(0).max(86400000),
}).strict();
export const runSubmissionSchema = z.union([
  runSubmissionBase.extend({ labState: boundedState }).strict(),
  runSubmissionBase.extend({ evidence: boundedState }).strict(),
  ...CHECKPOINT_ACTIVITIES.map((activity) => runSubmissionBase.extend(activity.submission).strict().superRefine(activity.refine)),
]);
export type RunSubmission = z.infer<typeof runSubmissionSchema>;

/** Learner data exactly as stored on the attempt, with the envelope it arrived in. */
export function submittedEvidence(submission: RunSubmission): { envelope: EvidenceEnvelope; data: unknown } {
  if ("checkpoints" in submission) return { envelope: "checkpoints", data: { checkpoints: submission.checkpoints, explanation: submission.explanation } };
  if ("evidence" in submission) return { envelope: "evidence", data: submission.evidence };
  return { envelope: "labState", data: (submission as { labState?: unknown }).labState };}

export { CIRCUIT_BULB_ACTIVITY_KEY, CIRCUIT_BULB_RUBRIC, evaluateCircuitBulbActivity } from "./evaluators/circuit-bulb-checkpoints.evaluator";
export { LEGACY_CHALLENGE_RUBRIC, evaluateRunV1 } from "./evaluators/legacy-challenge.evaluator";
export const FL10_RUBRIC = "mass-conservation-poea@1.0.0";
export const FL06_RUBRIC = "lever-investigation@1.0.0";
export const FL07_RUBRIC = "thermal-energy-investigation@1.0.0";
export const rubricRefForActivity = labEvaluators.rubricRefForActivity;

const executionFieldsSchema = z.object({
  modelRef: z.string().min(1),
  engineVersion: z.string().min(1),
  packVersionId: z.string().min(1),
  configVersionId: z.string().min(1),
  activityVersionId: z.string().min(1),
  activityDigest: z.string().min(1),
  activityKey: z.string().min(1),
  activityVersion: z.number().int().positive(),
  rubricRef: z.string().refine(labEvaluators.isRegistered, "Rubric is not registered"),  params: z.record(z.string(), z.union([z.number(), z.string()])).nullable(),
  stateSchemaVersion: z.literal(1),
  evidenceSchemaVersion: z.literal(1),
  template: z.unknown(),
  binding: z.enum(["ASSIGNMENT_PINNED", "LEGACY_UNPINNED_LAUNCH", "FOUNDATIONAL_LAUNCH", "FOUNDATIONAL_RELEASE"]).optional(),
  releaseId: z.string().min(1).optional(),
  releaseDigest: z.string().length(64).optional(),
  selectedChallengeId: z.string().min(1).optional(),
}).strict();
const compatibleActivityTuple = <T extends z.ZodTypeAny>(schema: T) => schema.superRefine((tuple: any, ctx) => {
  try {
    if (rubricRefForActivity(tuple.activityKey, tuple.activityVersion, tuple.modelRef) !== tuple.rubricRef)
      ctx.addIssue({ code: "custom", message: "Activity rubric does not match the pinned model" });
  } catch (error) {
    ctx.addIssue({ code: "custom", message: error instanceof Error ? error.message : "Invalid activity tuple" });
  }
});
export const executionSchema = compatibleActivityTuple(executionFieldsSchema);

export const assignmentExecutionSchema = compatibleActivityTuple(executionFieldsSchema.omit({ params: true, binding: true }).extend({
  labId: z.string().min(1),
  releaseId: z.string().min(1).optional(),
  releaseDigest: z.string().length(64).optional(),
  selectedChallengeId: z.string().min(1).optional(),
  challengeParams: z.record(z.string(), z.record(z.string(), z.union([z.number(), z.string()]))),
  effectiveParams: z.record(z.string(), z.record(z.string(), z.union([z.number(), z.string()])).nullable()),
}).strict());
