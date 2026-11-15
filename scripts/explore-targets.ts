// One map from Explore kit to its bundled FE configs and topic codes. Shared by the isolated seed and the owner publish.
import { K2_KIT } from "../packages/sim/wet-bench/contracts";
import { loadK2ExploreTargets } from "./k2-explore-targets";
import { loadFl26ExploreTargets } from "./fl26-explore-targets";
import { loadAnatomyTargets, loadDioramaTargets, loadMolecularTargets } from "./explore-kit-targets";

export type ExploreTarget = { config: { labId: string; kit: string } & Record<string, unknown>; topicCode: string };

export const EXPLORE_TARGETS: ReadonlyMap<string, () => Promise<ExploreTarget[]>> = new Map<string, () => Promise<ExploreTarget[]>>([
  [K2_KIT, loadK2ExploreTargets as () => Promise<ExploreTarget[]>],
  ["k8-garden", loadFl26ExploreTargets],
  ["k8-diorama", loadDioramaTargets],
  ["k7-molecular", loadMolecularTargets],
  ["anatomy", loadAnatomyTargets],
]);
