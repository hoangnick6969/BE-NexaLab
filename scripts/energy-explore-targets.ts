/** Explore seed targets of the mechanical energy bench (K5): FL-24, topic KHTN 9 Năng lượng cơ học (spec fl-24-mechanical-energy-explore-spec.md §1, Q-5). */
import { FL24_ENERGY_EXPLORE_CONFIG } from "../packages/sim/mechanics/energy";

/**
 * TODO(FL-24 Q-5): placeholder. The KHTN 9 topic code is not in the DB yet; replace it with the real lesson code
 * once SGK KHTN 9 is provided (Q-6), and drop `publishBlocked`. Until then `publish-explore.ts` refuses this target
 * (dry run included), and the server would also refuse the unknown topic with LAB_TOPIC_MAPPING_REQUIRED.
 */
export const FL24_TOPIC_CODE_PLACEHOLDER = "KHTN9-NANG-LUONG-CO-HOC";

export const ENERGY_EXPLORE_TARGETS = [{
  config: FL24_ENERGY_EXPLORE_CONFIG,
  topicCode: FL24_TOPIC_CODE_PLACEHOLDER,
  publishBlocked: "FL-24 Q-6: chờ SGK KHTN 9 để đối chiếu nguồn và mã topic K9 thật",
}] as const;

export async function loadEnergyExploreTargets(): Promise<Array<{ config: { labId: string; kit: string }; topicCode: string; publishBlocked?: string }>> {
  return ENERGY_EXPLORE_TARGETS.map(({ config, topicCode, publishBlocked }) => ({ config, topicCode, publishBlocked }));
}
