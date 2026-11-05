import type { InputSnapshotV1 } from "./generate-resource-prompt";
import { resourceItemsV1 } from "./resource-items";
import { validateItems, type DroppedItem, type DuplicateCorpus } from "./validate-items";

export type { DroppedItem } from "./validate-items";
export type ProcessedItem = { payload: Record<string, unknown>; flags: string[] };
export type ProcessedOutput =
  | { ok: true; items: ProcessedItem[]; dropped: DroppedItem[] }
  | { ok: false; code: "OUTPUT_SCHEMA_INVALID" | "OUTPUT_VALIDATION_FAILED"; dropped: DroppedItem[] };

/**
 * Provider text -> validated items (TAI-T3). Not JSON, or not `resource-items@1` under the strict schema, is
 * OUTPUT_SCHEMA_INVALID (retried once by the runner). Otherwise VR rules drop items with reason codes and VW rules add
 * warning flags; zero surviving items is OUTPUT_VALIDATION_FAILED (not retried). Raw text is never kept.
 */
export function processGenerateResourceOutput(snapshot: InputSnapshotV1, text: string, duplicateCorpus: DuplicateCorpus = []): ProcessedOutput {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, code: "OUTPUT_SCHEMA_INVALID", dropped: [] };
  }
  const parsed = resourceItemsV1.safeParse(raw);
  if (!parsed.success)
    return { ok: false, code: "OUTPUT_SCHEMA_INVALID", dropped: [] };
  const { items, dropped } = validateItems(snapshot, parsed.data.items, duplicateCorpus);
  if (items.length === 0) return { ok: false, code: "OUTPUT_VALIDATION_FAILED", dropped };
  return { ok: true, items: items.map((item) => ({ payload: item.payload as Record<string, unknown>, flags: item.flags })), dropped };
}
