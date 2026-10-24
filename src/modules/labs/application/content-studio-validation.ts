import { z } from "zod";
import { goldenCaseResults, versionErrors, versionInputSchema } from "./simulation-versions";
import { modelRefForLab, resolveModel } from "./sim-packs";

const requestSchema = z.object({
  labId: z.string().trim().min(1).max(80),
  modelRef: z.string().trim().min(1).max(80),
  challengeIds: z.array(z.string().trim().min(1).max(80)).min(1).max(100),
  config: versionInputSchema,
}).strict();

/** Read-only bridge used by the local Content Tool. It runs the same BE simulation and golden-case checks without storing or activating a Lab. */
export function validateContentStudioBlueprint(value: unknown) {
  const parsed = requestSchema.safeParse(value);
  if (!parsed.success) return { ok: false, errors: parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`), golden: [] };
  const input = parsed.data;
  const errors = versionErrors(input.labId, input.challengeIds, input.config);
  try {
    resolveModel(input.modelRef);
    if (modelRefForLab(input.labId) !== input.modelRef) errors.push("Blueprint modelRef does not match the existing BE Lab capability");
  } catch (error) {
    errors.push(error instanceof Error ? error.message : "Unsupported simulation model");
  }
  const golden = errors.length ? [] : goldenCaseResults(input.labId, input.config);
  if (golden.some((item) => !item.ok)) errors.push("One or more golden cases do not reproduce on the server simulation engine");
  return { ok: errors.length === 0, errors, golden };
}
