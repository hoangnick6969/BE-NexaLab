// K2 Explore Labs and their bundled frontend configs: input for the isolated seed and the owner publish script.
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const FE_LABS = resolve(__dirname, "../../FE-NexaLab/src/features/labs/chemistry/wet-bench/labs");
const TARGETS = [
  { file: "fl-13.config.ts", exportName: "fl13Config", topicCode: "KHTN8-L09" },
  { file: "fl-14a.config.ts", exportName: "fl14aConfig", topicCode: "KHTN8-L11" },
] as const;

export async function loadK2ExploreTargets() {
  if (!existsSync(FE_LABS)) throw new Error(`Frontend kit configs not found at ${FE_LABS} (FE-NexaLab must sit beside BE-NexaLab)`);
  const out: Array<{ config: { labId: string; kit: string }; topicCode: string }> = [];
  for (const target of TARGETS) {
    const module = await import(pathToFileURL(resolve(FE_LABS, target.file)).href);
    out.push({ config: module[target.exportName], topicCode: target.topicCode });
  }
  return out;
}
