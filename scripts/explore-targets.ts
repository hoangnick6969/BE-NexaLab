// One map from Explore kit to its bundled FE configs and topic codes. Shared by the isolated seed and the owner publish.
import { K2_KIT } from "../packages/sim/wet-bench/contracts";
import { SAFETY_SCENARIO_KIT } from "../packages/sim/safety-scenario";
import { loadK2ExploreTargets, loadSafetyScenarioTargets } from "./k2-explore-targets";
import { loadFl26ExploreTargets } from "./fl26-explore-targets";
import { loadAnatomyTargets, loadDioramaTargets, loadMolecularTargets } from "./explore-kit-targets";
import { FLUID_KIT } from "../packages/sim/fluid/contracts";
import { loadFluidExploreTargets } from "./fluid-explore-targets";
import { THERMAL_KIT } from "../packages/sim/thermal/contracts";
import { loadThermalExploreTargets } from "./thermal-explore-targets";
import { ENERGY_KIT } from "../packages/sim/mechanics/energy/contracts";
import { loadEnergyExploreTargets } from "./energy-explore-targets";
import { OPTICS_KIT } from "../packages/sim/optics/contracts";
import { loadOpticsExploreTargets } from "./optics-explore-targets";

/** `publishBlocked` holds the reason a target must not be published yet (owner decision pending); the publish script refuses it. */
export type ExploreTarget = { config: { labId: string; kit: string } & Record<string, unknown>; topicCode: string; publishBlocked?: string };

export const EXPLORE_TARGETS: ReadonlyMap<string, () => Promise<ExploreTarget[]>> = new Map<string, () => Promise<ExploreTarget[]>>([
  [SAFETY_SCENARIO_KIT, loadSafetyScenarioTargets],
  [K2_KIT, loadK2ExploreTargets as () => Promise<ExploreTarget[]>],
  ["k8-garden", loadFl26ExploreTargets],
  ["k8-diorama", loadDioramaTargets],
  ["k7-molecular", loadMolecularTargets],
  ["anatomy", loadAnatomyTargets],
  [FLUID_KIT, loadFluidExploreTargets as () => Promise<ExploreTarget[]>],
  [THERMAL_KIT, loadThermalExploreTargets as () => Promise<ExploreTarget[]>],
  [ENERGY_KIT, loadEnergyExploreTargets as () => Promise<ExploreTarget[]>],
  [OPTICS_KIT, loadOpticsExploreTargets as () => Promise<ExploreTarget[]>],
]);
