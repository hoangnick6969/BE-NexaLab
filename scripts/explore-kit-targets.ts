// Seed targets for the INC-3 Explore benches: bundled FE configs with their topic codes.
// Input for the isolated seed (`db:seed:explore --kit <kit>`) and the owner publish. Topic codes must exist in the curriculum catalog; the publish refuses unknown ones.
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const FE_BIOLOGY = resolve(__dirname, "../../FE-NexaLab/src/features/labs/biology");

async function load(relativeFile: string, exportName: string) {
  const file = resolve(FE_BIOLOGY, relativeFile);
  if (!existsSync(file)) throw new Error(`Frontend config not found at ${file} (FE-NexaLab must sit beside BE-NexaLab)`);
  const module = await import(pathToFileURL(file).href);
  return module[exportName];
}

export async function loadDioramaTargets() {
  return [
    { config: await load("ecology/labs/fl-21.config.ts", "fl21Config"), topicCode: "KHTN8-L44" },
    { config: await load("ecology/labs/fl-20.config.ts", "fl20Config"), topicCode: "KHTN8-L41" },
  ];
}

export async function loadMolecularTargets() {
  return [{ config: await load("molecular/labs/fl-27.config.ts", "fl27Config"), topicCode: "KHTN9-CH11-T01" }];
}

export async function loadAnatomyTargets() {
  return [{ config: await load("anatomy/labs/fl-16.config.ts", "fl16Config"), topicCode: "KHTN8-L37" }];
}
