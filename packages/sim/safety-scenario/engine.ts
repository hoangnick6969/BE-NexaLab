import { reagentById } from "../wet-bench/reagents";
import type { SafetyScenarioItemRef, SafetyScenarioScene } from "./contracts";

export function listSafetyScenarioReagents(refs: readonly SafetyScenarioItemRef[]) {
  const ids = new Set(refs.filter((ref) => ref.kind === "reagent").map((ref) => ref.id));
  return [...ids].map(reagentById).filter((reagent) => reagent !== null);
}

type Step = SafetyScenarioScene["steps"][number];
type Choice = Step["choices"][number];
type Consequence = SafetyScenarioScene["consequences"][number];

type Entry = { stepId: string; choice: Choice; consequence: Consequence };
type Replay = { ok: true; step: Step | null; history: Entry[] } | { ok: false; index: number };

/** Replays choices for a validated scene. A null step marks the end of the scenario. */
export function replaySafetyScenario(scene: SafetyScenarioScene, choiceIds: readonly string[]): Replay {
  const steps = new Map(scene.steps.map((step) => [step.id, step]));
  const consequences = new Map(scene.consequences.map((consequence) => [consequence.id, consequence]));
  const history: Entry[] = [];
  let step = steps.get(scene.startStepId) ?? null;
  for (const [index, id] of choiceIds.entries()) {
    const choice = step?.choices.find((option) => option.id === id);
    const consequence = choice && consequences.get(choice.consequenceId);
    if (!step || !choice || !consequence) return { ok: false, index };
    history.push({ stepId: step.id, choice, consequence });
    step = consequence.nextStepId === null ? null : steps.get(consequence.nextStepId) ?? null;
  }
  return { ok: true, step, history };
}
