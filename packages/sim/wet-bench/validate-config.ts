/** Validates a K2 Lab config against the kit enums, reagent registry and reaction catalog. */
import { chemistryLabConfigSchema, MEASUREMENT_TOOL, VESSEL_SPECS, type ChemistryLabConfig, type VesselKind } from "./contracts";
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
      if (!(item.kind in VESSEL_SPECS)) errors.push(`${item.id}: only vessels can hold initial contents`);
      else if ((content.microliters ?? 0) > VESSEL_SPECS[item.kind as VesselKind].capacityMicroliters) errors.push(`${item.id}: initial volume exceeds capacity`);
    }
    if (item.initial?.stoppered && !(item.kind in VESSEL_SPECS && VESSEL_SPECS[item.kind as VesselKind].stopperable)) errors.push(`${item.id}: cannot be stoppered`);
  }

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
    if (composition?.kind === "solid") suppliedSpecies.add(composition.species);
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
