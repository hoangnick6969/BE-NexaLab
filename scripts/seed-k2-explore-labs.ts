import { K2_KIT } from "../packages/sim/wet-bench/contracts";
import { runExploreSeed } from "./seed-explore-labs";

// Keep the existing K2 command for local seed workflows.
void runExploreSeed([...process.argv.slice(2), "--kit", K2_KIT]);
