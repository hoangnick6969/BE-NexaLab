/** Validates a K2 Lab config against the kit enums, reagent registry and reaction catalog. */
import { chemistryLabConfigSchema, ENGINE_1_1_KINDS, MEASUREMENT_TOOL, VESSEL_SPECS, WET_BENCH_ENGINE, type ChemistryLabConfig, type VesselKind } from "./contracts";
import { FL13_REVIEW } from "./fl13-acid-base.data";
import { K2_REACTIONS, type StoichiometricReaction } from "./reactions";
import { reagentById } from "./reagents";
import type { SpeciesId } from "./species";

export type ConfigValidation =
  | { ok: true; config: ChemistryLabConfig; warnings: string[] }
  | { ok: false; errors: string[]; warnings: string[] };

export function validateChemistryLabConfig(raw: unknown): ConfigValidation {
  const parsed = chemistryLabConfigSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, errors: parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`), warnings: [] };
  const config = parsed.data;
  const errors: string[] = [];
  const warnings: string[] = [];
  const duplicates = (values: readonly (string | number)[]) => values.filter((value, index) => values.indexOf(value) !== index);

  const apparatusIds = config.enabledApparatus.map((item) => item.id);
  for (const value of duplicates(apparatusIds)) errors.push(`enabledApparatus: duplicate id ${value}`);
  for (const value of duplicates(config.enabledApparatus.map((item) => item.slot))) errors.push(`enabledApparatus: two items in slot ${value}`);
  for (const value of duplicates(config.availableReagents.map((item) => item.reagentId))) errors.push(`availableReagents: duplicate ${value}`);
  for (const value of duplicates(config.availableReagents.map((item) => item.shelfPosition))) errors.push(`availableReagents: two bottles at shelf position ${value}`);

  const shelf = config.availableReagents.map((item) => item.reagentId);
  for (const reagentId of shelf) if (!reagentById(reagentId)) errors.push(`availableReagents: unknown reagent ${reagentId}`);
  for (const item of config.enabledApparatus) {
    for (const content of item.initial?.contents ?? []) {
      const reagent = reagentById(content.reagentId);
      if (!reagent) { errors.push(`${item.id}: unknown initial reagent ${content.reagentId}`); continue; }
      if (reagent.composition.kind === "powder") errors.push(`${item.id}: powder ${content.reagentId} cannot be initial contents; the learner weighs it`);
      if (!(item.kind in VESSEL_SPECS)) errors.push(`${item.id}: only vessels can hold initial contents`);
      else if ((content.microliters ?? 0) > VESSEL_SPECS[item.kind as VesselKind].capacityMicroliters) errors.push(`${item.id}: initial volume exceeds capacity`);
    }
    if (item.initial?.stoppered && !(item.kind in VESSEL_SPECS && VESSEL_SPECS[item.kind as VesselKind].stopperable)) errors.push(`${item.id}: cannot be stoppered`);
  }

  // Engine 1.1.0 features: solutions by mass and volume (FL-11).
  const powderOnShelf = shelf.filter((reagentId) => reagentById(reagentId)?.composition.kind === "powder");
  const usesSolutions = config.enabledApparatus.some((item) => ENGINE_1_1_KINDS.includes(item.kind)) || config.measurements.includes("volume")
    || Boolean(config.solutes?.length) || Boolean(config.targets?.length) || powderOnShelf.length > 0;
  if (usesSolutions && config.engine === WET_BENCH_ENGINE) errors.push(`engine: ${WET_BENCH_ENGINE} has no powders, solubility, volume reading or volumetric flask; use wet-bench@1.1.0`);
  const solutes = config.solutes ?? [];
  for (const value of duplicates(solutes.map((item) => item.reagentId))) errors.push(`solutes: duplicate ${value}`);
  for (const item of solutes) if (!powderOnShelf.includes(item.reagentId)) errors.push(`solutes: ${item.reagentId} is not a powder on the shelf`);
  for (const reagentId of powderOnShelf) if (!solutes.some((item) => item.reagentId === reagentId)) errors.push(`solutes: powder ${reagentId} needs a solubility constant`);
  if (powderOnShelf.length && !config.enabledApparatus.some((item) => item.kind === "spatula")) errors.push("enabledApparatus: a powder on the shelf needs a spatula");
  const targets = config.targets ?? [];
  for (const value of duplicates(targets.map((item) => item.id))) errors.push(`targets: duplicate id ${value}`);
  for (const target of targets) if (!powderOnShelf.includes(target.reagentId)) errors.push(`targets.${target.id}: ${target.reagentId} is not a powder on the shelf`);

  const known = new Set(K2_REACTIONS.map((rule) => rule.id));
  for (const reactionId of config.allowedReactions) if (!known.has(reactionId)) errors.push(`allowedReactions: unknown ${reactionId}`);

  const kinds = new Set(config.enabledApparatus.map((item) => item.kind));
  for (const measurement of config.measurements) if (!kinds.has(MEASUREMENT_TOOL[measurement])) errors.push(`measurements: ${measurement} needs ${MEASUREMENT_TOOL[measurement]} on the bench`);
  if (!config.enabledApparatus.some((item) => item.kind in VESSEL_SPECS && item.kind !== "waste_beaker")) errors.push("enabledApparatus: at least one working vessel is required");

  // Reactions whose reactants never reach the bench are allowed but unreachable.
  const suppliedSpecies = new Set<SpeciesId>();
  for (const reagentId of [...shelf, ...config.enabledApparatus.flatMap((item) => (item.initial?.contents ?? []).map((content) => content.reagentId))]) {
    const composition = reagentById(reagentId)?.composition;
    if (composition?.kind === "solution" && composition.solute) suppliedSpecies.add(composition.solute);
    if (composition?.kind === "solid" || composition?.kind === "powder") suppliedSpecies.add(composition.species);
  }
  for (const rule of K2_REACTIONS) {
    if (rule.kind !== "stoichiometric" || !config.allowedReactions.includes(rule.id)) continue;
    const missing = (rule as StoichiometricReaction).reactants.filter((reactant) => !suppliedSpecies.has(reactant.species));
    if (missing.length) warnings.push(`allowedReactions: ${rule.id} cannot happen (no ${missing.map((m) => m.species).join(", ")} on the bench)`);
  }

  const prompts = config.pedagogy.observationPrompts ?? [];
  for (const value of duplicates(prompts.map((prompt) => prompt.id))) errors.push(`observationPrompts: duplicate id ${value}`);
  for (const prompt of prompts) {
    if (prompt.kind === "choice" && !prompt.choices) errors.push(`observationPrompts.${prompt.id}: choice prompt needs choices`);
    if (prompt.focus?.apparatusId && !apparatusIds.includes(prompt.focus.apparatusId)) errors.push(`observationPrompts.${prompt.id}: unknown apparatus ${prompt.focus.apparatusId}`);
    if (prompt.focus?.reagentId && !shelf.includes(prompt.focus.reagentId)) errors.push(`observationPrompts.${prompt.id}: reagent ${prompt.focus.reagentId} is not on the shelf`);
    if (prompt.highlightWhen?.reaction && !config.allowedReactions.includes(prompt.highlightWhen.reaction)) errors.push(`observationPrompts.${prompt.id}: reaction ${prompt.highlightWhen.reaction} is not allowed`);
    if (prompt.highlightWhen?.measurement && !config.measurements.includes(prompt.highlightWhen.measurement)) errors.push(`observationPrompts.${prompt.id}: measurement ${prompt.highlightWhen.measurement} is not enabled`);
  }

  // Class Explore templates (P0 C3.1) may only refer to things this config has.
  const templates = config.classTemplates ?? [];
  for (const value of duplicates(templates.map((template) => template.id))) errors.push(`classTemplates: duplicate id ${value}`);
  const promptIds = prompts.map((prompt) => prompt.id);
  for (const template of templates) {
    const at = `classTemplates.${template.id}`;
    for (const apparatusId of template.requiredApparatusIds) if (!apparatusIds.includes(apparatusId)) errors.push(`${at}: unknown apparatus ${apparatusId}`);
    for (const value of duplicates(template.requiredApparatusIds)) errors.push(`${at}: duplicate apparatus ${value}`);
    const groupIds = template.reagentGroups.map((group) => group.id);
    for (const value of duplicates(groupIds)) errors.push(`${at}: duplicate reagent group ${value}`);
    for (const group of template.reagentGroups) {
      for (const reagentId of group.options) if (!shelf.includes(reagentId)) errors.push(`${at}.${group.id}: option ${reagentId} is not on the shelf`);
      for (const value of duplicates(group.options)) errors.push(`${at}.${group.id}: duplicate option ${value}`);
      if (group.count > group.options.length) errors.push(`${at}.${group.id}: count ${group.count} exceeds the ${group.options.length} options`);
    }
    const groupOptions = new Set(template.reagentGroups.flatMap((group) => group.options));
    for (const choice of template.promptChoices) {
      if (!promptIds.includes(choice.promptId)) errors.push(`${at}: prompt ${choice.promptId} is not in observationPrompts`);
      for (const reagentId of choice.onlyWithReagents ?? []) if (!groupOptions.has(reagentId)) errors.push(`${at}: prompt ${choice.promptId} needs ${reagentId}, which is in no reagent group`);
    }
    for (const value of duplicates(template.promptChoices.map((choice) => choice.promptId))) errors.push(`${at}: duplicate prompt choice ${value}`);
    const measure = template.requirements.measure;
    if (measure) {
      if (!groupIds.includes(measure.perGroup)) errors.push(`${at}: measure refers to unknown reagent group ${measure.perGroup}`);
      const tool = MEASUREMENT_TOOL[measure.measurement];
      if (!template.requiredApparatusIds.some((apparatusId) => config.enabledApparatus.find((item) => item.id === apparatusId)?.kind === tool)) errors.push(`${at}: measure ${measure.measurement} needs ${tool} among requiredApparatusIds`);
    }
    if (!measure && !template.requirements.explain) errors.push(`${at}: a template needs at least one requirement`);
    for (const reactionId of template.requiresReactions ?? []) if (!known.has(reactionId)) errors.push(`${at}: unknown reaction ${reactionId}`);
  }

  // A config may only claim "reviewed" when every scientific input it uses is reviewed.
  if (config.review.status === "reviewed") {
    const unreviewed = [
      ...shelf.filter((reagentId) => reagentById(reagentId)?.reviewStatus !== "reviewed"),
      ...config.allowedReactions.filter((reactionId) => K2_REACTIONS.find((rule) => rule.id === reactionId)?.reviewStatus !== "reviewed"),
      ...(config.allowedReactions.includes("acid-base.neutralization") && FL13_REVIEW.status !== "reviewed" ? ["fl13-acid-base-data"] : []),
    ];
    if (unreviewed.length) errors.push(`review: status "reviewed" but unreviewed inputs remain (${unreviewed.join(", ")})`);
  }
  return errors.length ? { ok: false, errors, warnings } : { ok: true, config, warnings };
}
