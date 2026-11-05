/**
 * SAI-05 — parent help-seeking summary (BR-11). Counts only: hints per level per Lab.
 * Never returns hint content, the rule snapshot (criterion, misconception) or any conversation.
 */
export type HintRow = { level: number; createdAt: Date; labId: string | null };
export type HelpSeekingLab = {
  labId: string;
  labTitle: string;
  total: number;
  /** Ladder levels 1–4. */
  byLevel: { 1: number; 2: number; 3: number; 4: number };
  /** Level-0 reflections asked after an observation differed from the prediction. */
  reflections: number;
  lastAt: string;
};

export function summarizeHelpSeeking(rows: readonly HintRow[], titles: ReadonlyMap<string, string>): HelpSeekingLab[] {
  const byLab = new Map<string, HelpSeekingLab>();
  for (const row of rows) {
    if (!row.labId) continue;
    const lab = byLab.get(row.labId) ?? {
      labId: row.labId,
      labTitle: titles.get(row.labId) ?? "Bài thí nghiệm không còn khả dụng",
      total: 0,
      byLevel: { 1: 0, 2: 0, 3: 0, 4: 0 },
      reflections: 0,
      lastAt: row.createdAt.toISOString(),
    };
    if (row.level >= 1 && row.level <= 4) lab.byLevel[row.level as 1 | 2 | 3 | 4] += 1;
    else if (row.level === 0) lab.reflections += 1;
    else continue;
    lab.total += 1;
    if (row.createdAt.toISOString() > lab.lastAt) lab.lastAt = row.createdAt.toISOString();
    byLab.set(row.labId, lab);
  }
  return [...byLab.values()].sort((a, b) => (a.lastAt < b.lastAt ? 1 : a.lastAt > b.lastAt ? -1 : a.labId.localeCompare(b.labId)));
}
