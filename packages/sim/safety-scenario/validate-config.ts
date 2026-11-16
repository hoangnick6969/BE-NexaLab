import { safetyScenarioReagentById } from "../wet-bench/reagents";
import { safetyScenarioConfigSchema, type SafetyScenarioConfig, type SafetyScenarioScene } from "./contracts";

type Validation =
  | { ok: true; config: SafetyScenarioConfig; warnings: string[] }
  | { ok: false; errors: string[]; warnings: string[] };

function indexById<T extends { id: string }>(rows: T[], path: string, errors: string[]) {
  const index = new Map<string, T>();
  for (const row of rows) {
    if (index.has(row.id)) errors.push(`${path}: duplicate id ${row.id}`);
    index.set(row.id, row);
  }
  return index;
}

function validateScene(scene: SafetyScenarioScene, errors: string[]) {
  const path = `scenes.${scene.id}`;
  const steps = indexById(scene.steps, `${path}.steps`, errors);
  const consequences = indexById(scene.consequences, `${path}.consequences`, errors);
  if (!steps.has(scene.startStepId)) errors.push(`${path}.startStepId: unknown step ${scene.startStepId}`);

  for (const consequence of consequences.values()) {
    if (consequence.nextStepId !== null && !steps.has(consequence.nextStepId)) {
      errors.push(`${path}.consequences.${consequence.id}: unknown next step ${consequence.nextStepId}`);
    }
  }

  const outgoing = new Map<string, Array<string | null>>();
  for (const step of steps.values()) {
    const choices = indexById(step.choices, `${path}.steps.${step.id}.choices`, errors);
    const destinations: Array<string | null> = [];
    for (const choice of choices.values()) {
      const consequence = consequences.get(choice.consequenceId);
      if (consequence) destinations.push(consequence.nextStepId);
      else errors.push(`${path}.steps.${step.id}.choices.${choice.id}: unknown consequence ${choice.consequenceId}`);
    }
    outgoing.set(step.id, destinations);
  }

  const reachable = new Set<string>();
  const visit = (id: string) => {
    if (!steps.has(id) || reachable.has(id)) return;
    reachable.add(id);
    for (const next of outgoing.get(id) ?? []) if (next !== null) visit(next);
  };
  visit(scene.startStepId);

  const canEnd = new Set<string | null>([null]);
  let previousSize: number;
  do {
    previousSize = canEnd.size;
    for (const [id, destinations] of outgoing) {
      if (destinations.some((next) => canEnd.has(next))) canEnd.add(id);
    }
  } while (canEnd.size !== previousSize);

  for (const id of steps.keys()) {
    if (!reachable.has(id)) errors.push(`${path}.steps.${id}: unreachable from start`);
    if (!canEnd.has(id)) errors.push(`${path}.steps.${id}: cannot reach an ending`);
  }
}

export function validateSafetyScenarioConfig(raw: unknown): Validation {
  const parsed = safetyScenarioConfigSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, errors: parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`), warnings: [] };
  }

  const config = parsed.data;
  const warnings = config.review.status === "draft" ? ["review.status: scenario content awaits safety review"] : [];
  const errors: string[] = [];
  const apparatus = indexById(config.enabledApparatus, "enabledApparatus", errors);
  indexById(config.scenes, "scenes", errors);
  for (const scene of config.scenes) {
    validateScene(scene, errors);
    const refs = [...scene.itemRefs, ...scene.consequences.flatMap((consequence) => consequence.hazardRefs)];
    for (const ref of refs) {
      const reagent = ref.kind === "reagent" ? safetyScenarioReagentById(ref.id) : null;
      const exists = ref.kind === "reagent" ? reagent !== null : apparatus.has(ref.id);
      if (config.review.status === "reviewed" && reagent?.reviewStatus === "unverified") {
        errors.push(`scenes.${scene.id}: unreviewed reagent reference ${ref.id}`);
      }
      if (!exists) errors.push(`scenes.${scene.id}: unknown ${ref.kind} reference ${ref.id}`);
    }
  }
  return errors.length ? { ok: false, errors, warnings } : { ok: true, config, warnings };
}
