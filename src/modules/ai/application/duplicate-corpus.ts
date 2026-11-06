import { jaccard, NEAR_DUPLICATE_THRESHOLD, normalizeText, trigrams } from "./resource-items";

/** One question prompt or card front of a class resource, with the resource it belongs to. */
export type CorpusEntry = { resourceId: string; resourceTitle: string; text: string };
export type DuplicateMatch = { resourceId: string; resourceTitle: string; match: "EXACT" | "NEAR"; similarity: number };

/**
 * Duplicate corpus for VW-01/VW-02: question prompts and card fronts of the class's non-archived resources, read at
 * validation time outside the write transaction. A resource created between validation and review is not re-checked
 * (accepted race, covered by teacher review).
 */
export async function loadCorpusEntries(db: any, classId: string): Promise<CorpusEntry[]> {
  const resources = await db.classResource.findMany({
    where: { classId, status: { in: ["DRAFT", "PUBLISHED"] } },
    select: { id: true, title: true, kind: true, content: true },
  });
  const entries: CorpusEntry[] = [];
  for (const resource of resources) {
    const content = resource.content as any;
    const texts = resource.kind === "DECK" ? (content?.cards ?? []).map((card: any) => card?.front) : (content?.questions ?? []).map((q: any) => q?.prompt);
    for (const text of texts) if (typeof text === "string") entries.push({ resourceId: resource.id, resourceTitle: resource.title, text });
  }
  return entries;
}

export async function loadDuplicateCorpus(db: any, classId: string): Promise<string[]> {
  return (await loadCorpusEntries(db, classId)).map((entry) => entry.text);
}

/** duplicateOf (implementation-contract.md): up to 3 resources, one entry each, highest similarity first. */
export function findDuplicateResources(text: string, entries: CorpusEntry[], limit = 3): DuplicateMatch[] {
  const normalized = normalizeText(text);
  const grams = trigrams(normalized);
  const best = new Map<string, DuplicateMatch>();
  for (const entry of entries) {
    const other = normalizeText(entry.text);
    const exact = other === normalized;
    const similarity = exact ? 1 : jaccard(grams, trigrams(other));
    if (!exact && similarity < NEAR_DUPLICATE_THRESHOLD) continue;
    const rounded = Math.round(similarity * 100) / 100;
    const previous = best.get(entry.resourceId);
    if (!previous || rounded > previous.similarity)
      best.set(entry.resourceId, { resourceId: entry.resourceId, resourceTitle: entry.resourceTitle, match: exact ? "EXACT" : "NEAR", similarity: rounded });
  }
  return [...best.values()].sort((a, b) => b.similarity - a.similarity || a.resourceTitle.localeCompare(b.resourceTitle)).slice(0, limit);
}
