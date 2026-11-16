/**
 * Explore seed target of the lever bench (K5): FL-06 Explore on the Guided Lab `lever-equilibrium` (topic KHTN8-L18).
 * D-5 (lab-two-mode-d5-spec.md): publishing attaches config.explore and leaves the Guided release, challenges and model untouched (D1-3.3).
 */
import { FL06_LEVER_EXPLORE_CONFIG } from "../packages/sim/mechanics";

export const FL06_TOPIC_CODE = "KHTN8-L18";

export const LEVER_EXPLORE_TARGETS = [{ config: FL06_LEVER_EXPLORE_CONFIG, topicCode: FL06_TOPIC_CODE }] as const;

export async function loadLeverExploreTargets(): Promise<Array<{ config: { labId: string; kit: string }; topicCode: string }>> {
  return LEVER_EXPLORE_TARGETS.map(({ config, topicCode }) => ({ config, topicCode }));
}
