/** Explore seed targets of the mechanical energy bench (K5): FL-24, topic KHTN 9 Năng lượng cơ học (spec fl-24-mechanical-energy-explore-spec.md §1, Q-5). */
import { FL24_ENERGY_EXPLORE_CONFIG } from "../packages/sim/mechanics/energy";

/** KHTN 9 Chương I, topic Năng lượng cơ học (outcomes nang-luong-co-hoc/1…6), active in the curriculum taxonomy (Q-5, 2026-11-16). */
export const FL24_TOPIC_CODE = "KHTN9-CH01-T01";

export const ENERGY_EXPLORE_TARGETS = [{ config: FL24_ENERGY_EXPLORE_CONFIG, topicCode: FL24_TOPIC_CODE }] as const;

export async function loadEnergyExploreTargets(): Promise<Array<{ config: { labId: string; kit: string }; topicCode: string }>> {
  return ENERGY_EXPLORE_TARGETS.map(({ config, topicCode }) => ({ config, topicCode }));
}
