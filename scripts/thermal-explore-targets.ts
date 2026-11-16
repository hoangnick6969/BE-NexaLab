/** Explore seed targets of the thermal bench (K4): FL-08 heat transfer, topic Bài 28 (spec fl-08-heat-transfer-explore-spec.md §4). */
import { FL08_HEAT_TRANSFER_EXPLORE_CONFIG } from "../packages/sim/thermal";

export const THERMAL_EXPLORE_TARGETS = [{ config: FL08_HEAT_TRANSFER_EXPLORE_CONFIG, topicCode: "KHTN8-L28" }] as const;

export async function loadThermalExploreTargets(): Promise<Array<{ config: { labId: string; kit: string }; topicCode: string }>> {
  return THERMAL_EXPLORE_TARGETS.map(({ config, topicCode }) => ({ config, topicCode }));
}
