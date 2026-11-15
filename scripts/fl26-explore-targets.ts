// FL-26 Mendel Explore bench (kit `k8-garden`): the bundled FE config and its topic, input for the isolated seed and the owner publish.
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const FE_GENETICS = resolve(__dirname, "../../FE-NexaLab/src/features/labs/biology/genetics/labs");
// Same chapter as FL-27 (KHTN 9, CH11); confirm with the curriculum catalog before a production publish.
const TOPIC_CODE = "KHTN9-CH11-T01";

export async function loadFl26ExploreTargets() {
  if (!existsSync(FE_GENETICS)) throw new Error(`Frontend genetics configs not found at ${FE_GENETICS} (FE-NexaLab must sit beside BE-NexaLab)`);
  const module = await import(pathToFileURL(resolve(FE_GENETICS, "fl-26.config.ts")).href);
  return [{ config: module.fl26Config, topicCode: TOPIC_CODE }];
}
