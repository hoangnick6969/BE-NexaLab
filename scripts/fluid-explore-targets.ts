/** Explore seed targets of the fluid bench (K3): FL-04 liquid pressure, topic Bài 16 (spec fl-04-liquid-pressure-explore-spec.md §4). */
import { FL04_PRESSURE_EXPLORE_CONFIG } from "../packages/sim/fluid";

export const FLUID_EXPLORE_TARGETS = [{ config: FL04_PRESSURE_EXPLORE_CONFIG, topicCode: "KHTN8-L16" }] as const;

export async function loadFluidExploreTargets(): Promise<Array<{ config: { labId: string; kit: string }; topicCode: string }>> {
  return FLUID_EXPLORE_TARGETS.map(({ config, topicCode }) => ({ config, topicCode }));
}
