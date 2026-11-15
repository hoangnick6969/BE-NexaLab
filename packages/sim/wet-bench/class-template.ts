/**
 * Class Explore for the wet bench (P0 C3.2): from a Lab config, one of its templates and a teacher selection, derive the
 * effective config a student works in, and check it strictly. The teacher preview, the assignment and the submission all
 * call these same functions.
 */
import { z } from "zod";
import { exploreIdSchema as id } from "../explore/envelope";
import { MEASUREMENT_TOOL, type ChemistryLabConfig, type ClassTemplate } from "./contracts";
import { K2_REACTIONS } from "./reactions";
import { reagentById } from "./reagents";
import { SPECIES } from "./species";
import { validateChemistryLabConfig } from "./validate-config";

/** What a teacher sends: ids only. */
export const classSelectionSchema = z.object({
  templateId: id,
  reagents: z.record(id, z.array(id).max(8)),
  promptId: id,
}).strict();
export type ClassSelection = z.infer<typeof classSelectionSchema>;

/** What the student must hand in. `measure` is an integer: the pH shown by the pen, in tenths. */
export type EffectiveRequirement =
  | { kind: "measure"; itemId: string; measurement: "ph_meter"; unit: "tenthsPh" }
  | { kind: "explain" };

export type EffectiveResult =
  | { ok: true; config: ChemistryLabConfig; requirements: EffectiveRequirement[]; templateId: string; promptId: string }
  | { ok: false; errors: string[] };

const soluteRole = (reagentId: string) => {
  const composition = reagentById(reagentId)?.composition;
  return composition?.kind === "solution" && composition.solute ? SPECIES[composition.solute].acidBase.kind : null;
};
const isAcid = (reagentId: string) => soluteRole(reagentId) === "strong_acid" || soluteRole(reagentId) === "weak_acid";
const isBase = (reagentId: string) => soluteRole(reagentId) === "strong_base";

/** Strict check of an effective config against its requirements. Warnings that matter to a requirement become errors. */
export function validateWetBenchEffectiveConfig(
  config: unknown,
  requirements: readonly EffectiveRequirement[],
  requiresReactions: readonly string[] = [],
): { ok: true; config: ChemistryLabConfig } | { ok: false; errors: string[] } {
  const base = validateChemistryLabConfig(config);
  if (!base.ok) return { ok: false, errors: base.errors };
  const effective = base.config;
  const errors: string[] = [];
  const onShelf = effective.availableReagents.map((item) => item.reagentId);

  for (const requirement of requirements) {
    if (requirement.kind !== "measure") continue;
    const tool = MEASUREMENT_TOOL[requirement.measurement];
    if (!effective.measurements.includes(requirement.measurement)) errors.push(`measure ${requirement.itemId}: ${requirement.measurement} is not enabled`);
    if (!effective.enabledApparatus.some((item) => item.kind === tool)) errors.push(`measure ${requirement.itemId}: ${tool} is not on the bench`);
    if (!onShelf.includes(requirement.itemId)) { errors.push(`measure ${requirement.itemId}: not on the shelf`); continue; }
    const composition = reagentById(requirement.itemId)?.composition;
    const solute = composition?.kind === "solution" ? composition.solute : undefined;
    if (composition?.kind !== "solution" || (solute && SPECIES[solute].acidBase.kind === "unmodeled")) errors.push(`measure ${requirement.itemId}: pH is not modelled for this reagent`);
  }
  for (const reactionId of requiresReactions) {
    if (!effective.allowedReactions.includes(reactionId)) { errors.push(`requirement needs reaction ${reactionId}, which is not allowed`); continue; }
    if (base.warnings.some((warning) => warning.startsWith(`allowedReactions: ${reactionId} cannot happen`))) errors.push(`reaction ${reactionId} cannot happen with the reagents on the shelf`);
    else if (K2_REACTIONS.find((rule) => rule.id === reactionId)?.kind === "acid_base" && !(onShelf.some(isAcid) && onShelf.some(isBase))) errors.push(`reaction ${reactionId} needs an acid and a base on the shelf`);
  }
  return errors.length ? { ok: false, errors } : { ok: true, config: effective };
}

/** Effective config and requirements for one template and selection, or every reason it is refused. */
export function deriveWetBenchEffectiveConfig(config: ChemistryLabConfig, rawSelection: unknown): EffectiveResult {
  const parsed = classSelectionSchema.safeParse(rawSelection);
  if (!parsed.success) return { ok: false, errors: parsed.error.issues.map((issue) => `selection.${issue.path.join(".")}: ${issue.message}`) };
  const selection = parsed.data;
  const template: ClassTemplate | undefined = config.classTemplates?.find((item) => item.id === selection.templateId);
  if (!template) return { ok: false, errors: [`unknown template ${selection.templateId}`] };

  const errors: string[] = [];
  const shelfOrder = config.availableReagents.map((item) => item.reagentId);
  const chosen = new Map<string, string[]>();
  for (const group of template.reagentGroups) {
    const picked = selection.reagents[group.id];
    if (!picked) { errors.push(`reagent group ${group.id}: nothing selected`); continue; }
    if (new Set(picked).size !== picked.length) errors.push(`reagent group ${group.id}: a reagent is selected twice`);
    for (const reagentId of picked) if (!group.options.includes(reagentId)) errors.push(`reagent group ${group.id}: ${reagentId} is not in the allow-list`);
    if (picked.length !== group.count) errors.push(`reagent group ${group.id}: select exactly ${group.count}, got ${picked.length}`);
    chosen.set(group.id, [...new Set(picked)].sort((a, b) => shelfOrder.indexOf(a) - shelfOrder.indexOf(b)));
  }
  for (const groupId of Object.keys(selection.reagents)) if (!template.reagentGroups.some((group) => group.id === groupId)) errors.push(`reagent group ${groupId}: not in template ${template.id}`);

  const selected = new Set([...chosen.values()].flat());
  const choice = template.promptChoices.find((item) => item.promptId === selection.promptId);
  if (!choice) errors.push(`prompt ${selection.promptId} is not offered by template ${template.id}`);
  else for (const reagentId of choice.onlyWithReagents ?? []) if (!selected.has(reagentId)) errors.push(`prompt ${choice.promptId} is only valid when ${reagentId} is selected`);
  if (errors.length) return { ok: false, errors };

  const apparatus = config.enabledApparatus.filter((item) => template.requiredApparatusIds.includes(item.id));
  const tools = new Set(apparatus.map((item) => item.kind));
  const { classTemplates: _templates, ...rest } = config;
  const effectiveRaw = {
    ...rest,
    enabledApparatus: apparatus,
    availableReagents: config.availableReagents.filter((item) => selected.has(item.reagentId)).map((item, index) => ({ ...item, shelfPosition: index + 1 })),
    measurements: config.measurements.filter((measurement) => tools.has(MEASUREMENT_TOOL[measurement])),
    pedagogy: { ...config.pedagogy, observationPrompts: (config.pedagogy.observationPrompts ?? []).filter((prompt) => prompt.id === selection.promptId) },
  };

  const requirements: EffectiveRequirement[] = [];
  const measure = template.requirements.measure;
  if (measure) for (const itemId of chosen.get(measure.perGroup) ?? []) requirements.push({ kind: "measure", itemId, measurement: measure.measurement, unit: "tenthsPh" });
  if (template.requirements.explain) requirements.push({ kind: "explain" });

  const checked = validateWetBenchEffectiveConfig(effectiveRaw, requirements, template.requiresReactions);
  if (!checked.ok) return checked;
  return { ok: true, config: checked.config, requirements, templateId: template.id, promptId: selection.promptId };
}
