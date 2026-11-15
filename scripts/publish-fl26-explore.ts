// Owner publish for the FL-26 Explore bench (kit `k8-garden`) through the Admin API (P0 C1.3).
// Dry run by default: validates the bundled config locally and prints the request. It sends nothing unless
// `--publish` is passed AND both NEXALAB_ADMIN_API_URL and NEXALAB_ADMIN_TOKEN are set. Never run against prod from an agent.
import { parseArgs } from "node:util";
import { loadFl26ExploreTargets } from "./fl26-explore-targets";
import { EXPLORE_BENCHES } from "../src/modules/labs/application/explore-labs";

async function main() {
  const { values } = parseArgs({ options: { publish: { type: "boolean" }, reason: { type: "string" } } });
  const [target] = await loadFl26ExploreTargets();
  const bench = EXPLORE_BENCHES[target.config.kit];
  const checked = bench.validate(target.config);
  if (!checked.ok) throw new Error(`FL-26 config invalid: ${checked.errors.join("; ")}`);

  const labId = target.config.labId as string;
  const body = { config: target.config, topicCode: target.topicCode, reason: values.reason ?? "FL-26 Explore publish (owner)" };
  const url = process.env.NEXALAB_ADMIN_API_URL;
  const token = process.env.NEXALAB_ADMIN_TOKEN;

  if (!values.publish || !url || !token) {
    console.log(JSON.stringify({ mode: "dry-run", labId, kit: target.config.kit, topicCode: target.topicCode, configValid: true,
      wouldPostTo: `<NEXALAB_ADMIN_API_URL>/admin/labs/${labId}/explore-versions`, sent: false,
      missing: [!values.publish && "--publish", !url && "NEXALAB_ADMIN_API_URL", !token && "NEXALAB_ADMIN_TOKEN"].filter(Boolean) }, null, 1));
    return;
  }
  const response = await fetch(`${url.replace(/\/$/, "")}/admin/labs/${labId}/explore-versions`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  console.log(JSON.stringify({ mode: "publish", status: response.status, labId }, null, 1));
  if (!response.ok) process.exitCode = 1;
}

void main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
