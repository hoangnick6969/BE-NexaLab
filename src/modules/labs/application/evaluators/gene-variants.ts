import { randomInt } from "node:crypto";
import { GENE_VARIANT_IDS, type GeneVariantId } from "../../../../../packages/sim";

/**
 * Per-run gene pin for FL-27 (plan §4.3). The server picks the teaching gene
 * and its point mutation when a LabRun launches and stores the choice in the
 * run's execution tuple, so a retry or replay evaluates the same gene.
 */
export type GenePins = { variantId: GeneVariantId };

/** A fresh variant for one run. `random` is injectable so tests can pin the choice. */
export function pickGeneVariant(random: (max: number) => number = (max) => randomInt(max)): Record<string, string> {
  return { variantId: GENE_VARIANT_IDS[random(GENE_VARIANT_IDS.length)] };
}

/** Reads the pinned variant from a LabRun tuple; anything else fails closed. */
export function genePinsFrom(params: Record<string, unknown> | null | undefined): GenePins {
  const variantId = params?.variantId;
  if (!(GENE_VARIANT_IDS as readonly unknown[]).includes(variantId)) throw new Error("Phiên làm bài từ gene đến protein thiếu biến thể gene đã ghim");
  return { variantId: variantId as GeneVariantId };
}
