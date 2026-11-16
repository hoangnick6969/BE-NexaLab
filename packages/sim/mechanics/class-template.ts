/**
 * Class Explore for the mechanics bench (P0 C3.2, spec fl-06-class-explore-spec.md §4): from the FL-06 config, one of its
 * templates and a teacher selection, derive the bench a student works on and what they hand in, and check it strictly.
 * The teacher preview, the assignment and the submission all call `deriveLeverEffectiveConfig`.
 */
import { z } from "zod";
import { exploreIdSchema as id } from "../explore/envelope";
import type { ExploreRequirement } from "../explore/requirements";
import type { LeverAttachment, LeverLabConfig } from "./contracts";
export { leverClassTemplateSchema, type LeverClassTemplate } from "./contracts";
import { validateLeverLabConfig } from "./validate-config";
export { checkLeverClassTemplates } from "./validate-config";

const HOLES = [-250, -200, -150, -100, -50, 0, 50, 100, 150, 200, 250] as const;
const GAUGE_STEP = 100;
const GAUGE_MAX = 5000;
/** What a teacher sends: ids, an index and two switches; the switches only when the template leaves them to the teacher. */
export const leverClassSelectionSchema = z.object({
  templateId: id,
  loadPresetId: id,
  weightOptionIndex: z.number().int().min(0).max(3),
  gauge: z.boolean().optional(),
  momentTable: z.boolean().optional(),
  promptId: id,
}).strict();
export type LeverClassSelection = z.infer<typeof leverClassSelectionSchema>;

export const BALANCE_MOMENT_ITEMS = ["moment-left", "moment-right"] as const;

export type LeverEffectiveResult =
  | { ok: true; config: LeverLabConfig; requirements: ExploreRequirement[]; templateId: string; promptId: string }
  | { ok: false; errors: string[] };

const weightCount = (attachments: readonly LeverAttachment[]) => attachments.filter((item) => item.kind === "WEIGHT").length;
const netMoment = (attachments: readonly LeverAttachment[]) =>
  attachments.reduce((sum, item) => sum - item.positionMillimetres * item.forceMilliNewtons, 0);

/**
 * Can the student level the bar from these fixed loads, adding weights from `weights` (at most `maxCount` weights in all)
 * and, when `gauge` is on, the spring gauge? Holes are 50 mm apart, so the search is small: at most 11 holes and 11 weights.
 * Returns one way to do it, or null.
 */
export function findLeverBalance(fixed: readonly LeverAttachment[], weights: readonly number[], maxCount: number, gauge: boolean): LeverAttachment[] | null {
  const free = HOLES.filter((hole) => hole !== 0 && !fixed.some((item) => item.positionMillimetres === hole));
  // At most four added weights are tried; a load that needs more is refused rather than searched for long.
  const room = Math.min(4, Math.max(0, maxCount - weightCount(fixed)));
  const gaugeFix = (net: number, used: readonly number[]): LeverAttachment | null => {
    if (!gauge) return null;
    for (const hole of free) {
      if (used.includes(hole) || net === 0) continue;
      // A downward pull at `hole` adds -hole × F to the net moment; it levels the bar when that equals -net.
      if (Math.sign(hole) !== Math.sign(net)) continue;
      const force = net / hole;
      if (Number.isInteger(force) && force > 0 && force <= GAUGE_MAX && force % GAUGE_STEP === 0) return { kind: "GAUGE", positionMillimetres: hole, forceMilliNewtons: force };
    }
    return null;
  };
  const search = (from: number, added: LeverAttachment[]): LeverAttachment[] | null => {
    const net = netMoment([...fixed, ...added]);
    if (added.length > 0 && net === 0) return added;
    const pull = gaugeFix(net, added.map((item) => item.positionMillimetres));
    if (pull) return [...added, pull];
    if (added.length >= room) return null;
    for (let index = from; index < free.length; index += 1) {
      for (const force of weights) {
        const found = search(index + 1, [...added, { kind: "WEIGHT", positionMillimetres: free[index], forceMilliNewtons: force }]);
        if (found) return found;
      }
    }
    return null;
  };
  return search(0, []);
}

/** Effective config and requirements for one template and selection, or every reason it is refused. */
export function deriveLeverEffectiveConfig(config: LeverLabConfig, rawSelection: unknown): LeverEffectiveResult {
  const parsed = leverClassSelectionSchema.safeParse(rawSelection);
  if (!parsed.success) return { ok: false, errors: parsed.error.issues.map((issue) => `selection.${issue.path.join(".")}: ${issue.message}`) };
  const selection = parsed.data;
  const template = config.classTemplates?.find((item) => item.id === selection.templateId);
  if (!template) return { ok: false, errors: [`unknown template ${selection.templateId}`] };

  const errors: string[] = [];
  const preset = template.loadPresets.find((item) => item.id === selection.loadPresetId);
  if (!preset) errors.push(`load preset ${selection.loadPresetId} is not in template ${template.id}`);
  const weights = template.weightOptions[selection.weightOptionIndex];
  if (!weights) errors.push(`weight option ${selection.weightOptionIndex} is not in template ${template.id}`);
  const switchOf = (name: "gauge" | "momentTable") => {
    const rule = template[name];
    const sent = selection[name];
    if (rule === "teacher_choice") {
      if (sent === undefined) errors.push(`${name}: template ${template.id} leaves it to the teacher, so it must be sent`);
      return sent ?? false;
    }
    if (sent !== undefined) errors.push(`${name}: template ${template.id} fixes it to ${rule}`);
    return rule === "on";
  };
  const gauge = switchOf("gauge");
  const momentTable = switchOf("momentTable");
  if (!template.promptChoices.some((choice) => choice.promptId === selection.promptId)) errors.push(`prompt ${selection.promptId} is not offered by template ${template.id}`);
  if (errors.length || !preset || !weights) return { ok: false, errors };

  const { classTemplates: _templates, ...rest } = config;
  const effective: LeverLabConfig = {
    ...rest,
    enabledApparatus: config.enabledApparatus.filter((item) => gauge || item.kind !== "spring_gauge"),
    weights: { ...config.weights, availableMilliNewtons: [...weights] },
    initialAttachments: preset.attachments.map((item) => ({ ...item })),
    lockInitialAttachments: true,
    measurements: config.measurements.filter((item) => momentTable || item !== "moment_table"),
    pedagogy: { ...config.pedagogy, observationPrompts: (config.pedagogy.observationPrompts ?? []).filter((prompt) => prompt.id === selection.promptId) },
  };

  const requirements: ExploreRequirement[] = [];
  if (template.requirements.measure === "balance_moments")
    for (const itemId of BALANCE_MOMENT_ITEMS) requirements.push({ kind: "measure", itemId, measurement: "moment", unit: "milliNewtonMetres" });
  if (template.requirements.explain) requirements.push({ kind: "explain" });

  const checked = validateLeverEffectiveConfig(effective, requirements);
  if (!checked.ok) return checked;
  return { ok: true, config: checked.config, requirements, templateId: template.id, promptId: selection.promptId };
}

/** Strict check (C3.2): the config is valid, the tools a requirement needs are there, and the fixed load can be levelled. */
export function validateLeverEffectiveConfig(raw: unknown, requirements: readonly ExploreRequirement[]): { ok: true; config: LeverLabConfig } | { ok: false; errors: string[] } {
  const base = validateLeverLabConfig(raw);
  if (!base.ok) return { ok: false, errors: base.errors };
  const config = base.config;
  const errors: string[] = [];
  const measuresMoments = requirements.some((item) => item.kind === "measure" && item.measurement === "moment");
  if (measuresMoments) {
    if (!config.measurements.includes("ruler")) errors.push("measure moment: the ruler is needed to read lever arms");
    if (!config.measurements.includes("force_labels")) errors.push("measure moment: force labels are needed to read forces");
    const gauge = config.enabledApparatus.some((item) => item.kind === "spring_gauge");
    if (!findLeverBalance(config.initialAttachments, config.weights.availableMilliNewtons, config.weights.maxCount, gauge))
      errors.push("measure moment: the starting load cannot be levelled with these weights" + (gauge ? " and the gauge" : " without the gauge"));
  }
  return errors.length ? { ok: false, errors } : { ok: true, config };
}
