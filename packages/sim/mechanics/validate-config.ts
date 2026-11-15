/** Validates a mechanics bench config: kit rules first, then the starting attachments through the lever model. */
import { evaluateLeverBench } from "../lever-bench";
import { leverLabConfigSchema, WEIGHT_MAX_MILLINEWTONS, WEIGHT_STEP_MILLINEWTONS, type LeverLabConfig } from "./contracts";

export type LeverConfigValidation =
  | { ok: true; config: LeverLabConfig; warnings: string[] }
  | { ok: false; errors: string[]; warnings: string[] };

const duplicates = <T>(values: readonly T[]) => values.filter((value, index) => values.indexOf(value) !== index);

export function validateLeverLabConfig(raw: unknown): LeverConfigValidation {
  const parsed = leverLabConfigSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, errors: parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`), warnings: [] };
  const config = parsed.data;
  const errors: string[] = [];
  const warnings: string[] = [];

  const count = (kind: string) => config.enabledApparatus.filter((item) => item.kind === kind).length;
  if (count("lever_bar") !== 1) errors.push("enabledApparatus: needs exactly one lever_bar");
  if (count("weight_set") !== 1) errors.push("enabledApparatus: needs exactly one weight_set");
  if (count("spring_gauge") > 1) errors.push("enabledApparatus: at most one spring_gauge");
  for (const id of new Set(duplicates(config.enabledApparatus.map((item) => item.id)))) errors.push(`enabledApparatus: duplicate id ${id}`);

  const available = config.weights.availableMilliNewtons;
  for (const force of available) {
    if (force < WEIGHT_STEP_MILLINEWTONS || force > WEIGHT_MAX_MILLINEWTONS || force % WEIGHT_STEP_MILLINEWTONS !== 0) errors.push(`weights.availableMilliNewtons: ${force} mN is not a 0.5 N step between 0.5 N and 5 N`);
  }
  for (const force of new Set(duplicates(available))) errors.push(`weights.availableMilliNewtons: duplicate ${force}`);

  const attachments = config.initialAttachments;
  const weights = attachments.filter((item) => item.kind === "WEIGHT");
  for (const item of weights) if (!available.includes(item.forceMilliNewtons)) errors.push(`initialAttachments: weight ${item.forceMilliNewtons} mN is not in weights.availableMilliNewtons`);
  if (weights.length > config.weights.maxCount) errors.push("initialAttachments: more weights than weights.maxCount");
  if (attachments.some((item) => item.kind === "GAUGE") && count("spring_gauge") === 0) errors.push("initialAttachments: a GAUGE needs an enabled spring_gauge");
  const model = evaluateLeverBench({ fixtureId: config.fixtureId, attachments });
  if (!model.ok) errors.push(`initialAttachments: ${model.code}`);

  if (config.modes.guided) errors.push("modes.guided: the mechanics bench config is Explore-only (two-mode Labs wait for D-5)");
  if (config.review.status === "draft") warnings.push("review.status: draft (model constants are technical assumptions, not textbook data)");
  if (!config.measurements.includes("ruler")) warnings.push("measurements: without the ruler learners cannot read lever arms");

  return errors.length ? { ok: false, errors, warnings } : { ok: true, config, warnings };
}
