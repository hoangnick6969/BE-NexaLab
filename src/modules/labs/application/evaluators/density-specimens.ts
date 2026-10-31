import { randomInt } from "node:crypto";
import { DENSITY_BLOCK_IDS, DENSITY_PEBBLE_IDS } from "../../../../../packages/sim";

/**
 * Per-run specimen pins for FL-03 (plan §5.3). The server chooses the wood block
 * and the pebble when a LabRun launches; the choice is stored in the run's
 * execution tuple, so a retry or replay evaluates the same objects.
 */
export type DensityPins = { blockId: (typeof DENSITY_BLOCK_IDS)[number]; pebbleId: (typeof DENSITY_PEBBLE_IDS)[number] };

const pick = <T extends readonly string[]>(options: T, random: (max: number) => number): T[number] => options[random(options.length)];

/** A fresh pair for one run. `random` is injectable so tests can pin the choice. */
export function pickDensitySpecimens(random: (max: number) => number = (max) => randomInt(max)): Record<string, string> {
  return { blockId: pick(DENSITY_BLOCK_IDS, random), pebbleId: pick(DENSITY_PEBBLE_IDS, random) };
}

/** Reads the pinned pair from a LabRun tuple; anything else fails closed. */
export function densityPinsFrom(params: Record<string, unknown> | null | undefined): DensityPins {
  const blockId = params?.blockId;
  const pebbleId = params?.pebbleId;
  if (!(DENSITY_BLOCK_IDS as readonly unknown[]).includes(blockId) || !(DENSITY_PEBBLE_IDS as readonly unknown[]).includes(pebbleId))
    throw new Error("Phiên làm bài khối lượng riêng thiếu mẫu vật đã ghim");
  return { blockId: blockId as DensityPins["blockId"], pebbleId: pebbleId as DensityPins["pebbleId"] };
}
