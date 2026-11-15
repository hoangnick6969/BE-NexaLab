// K2 Explore Labs and their bundled frontend configs: input for the isolated seed and the owner publish script.
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const FE_LABS_PATH = "src/features/labs/chemistry/wet-bench/labs";
// The frontend sits beside this repo as FE-NexaLab or nexalab-fe, depending on the checkout.
const FE_LABS = ["FE-NexaLab", "nexalab-fe"].map((name) => resolve(__dirname, "../..", name, FE_LABS_PATH)).find((path) => existsSync(path))
  ?? resolve(__dirname, "../../FE-NexaLab", FE_LABS_PATH);
const TARGETS = [
  { file: "fl-13.config.ts", exportName: "fl13Config", topicCode: "KHTN8-L09" },
  { file: "fl-14a.config.ts", exportName: "fl14aConfig", topicCode: "KHTN8-L11" },
  { file: "fl-11.config.ts", exportName: "fl11Config", topicCode: "KHTN8-L04" },
] as const;

export async function loadK2ExploreTargets() {
  if (!existsSync(FE_LABS)) throw new Error(`Frontend kit configs not found at ${FE_LABS} (FE-NexaLab or nexalab-fe must sit beside this repo)`);
  const out: Array<{ config: { labId: string; kit: string }; topicCode: string }> = [];
  for (const target of TARGETS) {
    const module = await import(pathToFileURL(resolve(FE_LABS, target.file)).href);
    out.push({ config: module[target.exportName], topicCode: target.topicCode });
  }
  return out;
}
