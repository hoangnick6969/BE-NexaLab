import type { InputSnapshotV1 } from "./generate-resource-prompt";

export type ProcessedItem = { payload: Record<string, unknown>; flags: string[] };
export type DroppedItem = { position: number; reasonCodes: string[] };
export type ProcessedOutput =
  | { ok: true; items: ProcessedItem[]; dropped: DroppedItem[] }
  | { ok: false; code: "OUTPUT_SCHEMA_INVALID" | "OUTPUT_VALIDATION_FAILED"; dropped: DroppedItem[] };

/**
 * TAI-T2 output step: only the `resource-items@1` envelope (`{ items: object[] }`) is checked here, so the runner,
 * leases and persistence can be proven end to end. TAI-T3 replaces the body of this function with the strict Zod
 * schema and the VR/VW rules of validation-rules.md; the runner contract (ok / code / dropped) stays the same.
 */
export function processGenerateResourceOutput(_snapshot: InputSnapshotV1, text: string): ProcessedOutput {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, code: "OUTPUT_SCHEMA_INVALID", dropped: [] };
  }
  const items = (parsed as { items?: unknown })?.items;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed) || !Array.isArray(items))
    return { ok: false, code: "OUTPUT_SCHEMA_INVALID", dropped: [] };
  const kept: ProcessedItem[] = [];
  const dropped: DroppedItem[] = [];
  items.forEach((item, position) => {
    if (item && typeof item === "object" && !Array.isArray(item)) kept.push({ payload: item as Record<string, unknown>, flags: [] });
    else dropped.push({ position, reasonCodes: ["ITEM_TYPE_MISMATCH"] });
  });
  if (kept.length === 0) return { ok: false, code: "OUTPUT_VALIDATION_FAILED", dropped };
  return { ok: true, items: kept, dropped };
}
