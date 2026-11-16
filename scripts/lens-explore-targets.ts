/** Explore seed targets of the lens bench (K6): FL-23 thin lens, topic KHTN 9 Ánh sáng (spec fl-23-thin-lens-explore-spec.md §4). */
import { FL23_LENS_EXPLORE_CONFIG } from "../packages/sim/optics/lens";
import { FL23_TOPIC_CODE } from "./optics-explore-targets";

export const LENS_EXPLORE_TARGETS = [{ config: FL23_LENS_EXPLORE_CONFIG, topicCode: FL23_TOPIC_CODE }] as const;

export async function loadLensExploreTargets(): Promise<Array<{ config: { labId: string; kit: string }; topicCode: string }>> {
  return LENS_EXPLORE_TARGETS.map(({ config, topicCode }) => ({ config, topicCode }));
}
