/** Explore seed targets of the optics bench (K6): FL-23 refraction, topic KHTN 9 Ánh sáng (spec fl-23-refraction-explore-spec.md §4). */
import { FL23_REFRACTION_EXPLORE_CONFIG } from "../packages/sim/optics";

/** KHTN 9 Chương II, topic Ánh sáng (outcomes anh-sang/1…10), active in the curriculum taxonomy. */
export const FL23_TOPIC_CODE = "KHTN9-CH02-T01";

export const OPTICS_EXPLORE_TARGETS = [{ config: FL23_REFRACTION_EXPLORE_CONFIG, topicCode: FL23_TOPIC_CODE }] as const;

export async function loadOpticsExploreTargets(): Promise<Array<{ config: { labId: string; kit: string }; topicCode: string }>> {
  return OPTICS_EXPLORE_TARGETS.map(({ config, topicCode }) => ({ config, topicCode }));
}
