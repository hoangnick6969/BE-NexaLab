import {
  CHECKPOINT_HINT_CATALOGS, CHECKPOINT_HINT_RULES, CHECKPOINT_MISCONCEPTION_RULES, detectMisconception, unmetHintKeys,
} from "../../labs/application/checkpoint-hint-rules";
import { misconceptionLabel } from "../../labs/application/misconception-labels";

/**
 * SAI-02A — "where the class is stuck" for one Lab assignment (owner 2026-11-05: descriptive part first).
 * Deterministic counts only: no thresholds (G-5 / SG-3 still open), no student ranking, no names.
 * Every number points at evidence IDs (latest attempts) and the rule versions that produced it.
 */
export const HINT_INSIGHT_RULES = "hint-insights@1";

/** `evidence`: labState, or `{ labState, events }` for catalogs read from run events (station/event B8). */
export type LatestAttempt = { attemptId: string; studentId: string; verdict: string; rubricRef: string; result: unknown; evidence?: unknown };
export type InsightHint = { studentId: string; rubricRef: string; criterion: string | null; level: number };
export type InsightDisagreement = { rubricRef: string; criterion: string; misconception: string; note: string | null; at: string };

type Levels = { 1: number; 2: number; 3: number; 4: number };
export type InsightStep = {
  criterion: string;
  label: string;
  studentsUnmet: number;
  evidence: string[];
  hints: { total: number; students: number; byLevel: Levels; reflections: number };
  misconceptions: Array<{ id: string; label: string; students: number; evidence: string[]; disagreement: { note: string | null; at: string } | null }>;
};
export type HintInsight = {
  ruleVersion: string;
  hintRules: string;
  misconceptionRules: string;
  provider: "rules";
  totals: { targeted: number; submitted: number; passed: number; notPassed: number; notStarted: number };
  rubrics: Array<{ rubricRef: string; submitted: number; steps: InsightStep[] }>;
};

export function buildHintInsight(input: {
  targeted: number;
  latest: readonly LatestAttempt[];
  hints: readonly InsightHint[];
  disagreements: readonly InsightDisagreement[];
}): HintInsight {
  const latest = input.latest.filter((item) => CHECKPOINT_HINT_CATALOGS[item.rubricRef]);
  const passed = latest.filter((item) => item.verdict === "passed").length;
  const rubricRefs = [...new Set([...latest.map((item) => item.rubricRef), ...input.hints.map((hint) => hint.rubricRef)])]
    .filter((ref) => CHECKPOINT_HINT_CATALOGS[ref]).sort();
  const rubrics = rubricRefs.map((rubricRef) => {
    const catalog = CHECKPOINT_HINT_CATALOGS[rubricRef];
    const attempts = latest.filter((item) => item.rubricRef === rubricRef);
    const unmetBy = new Map(attempts.map((item) => [item.attemptId, item.verdict === "passed" ? new Set<string>() : unmetHintKeys(rubricRef, item.result)]));
    const hints = input.hints.filter((hint) => hint.rubricRef === rubricRef);
    const steps = catalog.order.map((criterion): InsightStep => {
      const stuck = attempts.filter((item) => unmetBy.get(item.attemptId)!.has(criterion));
      const stepHints = hints.filter((hint) => hint.criterion === criterion);
      const byLevel: Levels = { 1: 0, 2: 0, 3: 0, 4: 0 };
      for (const hint of stepHints) if (hint.level >= 1 && hint.level <= 4) byLevel[hint.level as 1 | 2 | 3 | 4] += 1;
      const groups = new Map<string, string[]>();
      for (const item of stuck) {
        const id = detectMisconception(rubricRef, criterion, item.result, item.evidence);
        if (id) groups.set(id, [...(groups.get(id) ?? []), item.attemptId]);
      }
      return {
        criterion,
        label: catalog.criteria[criterion].label,
        studentsUnmet: stuck.length,
        evidence: stuck.map((item) => item.attemptId),
        hints: {
          total: stepHints.length,
          students: new Set(stepHints.map((hint) => hint.studentId)).size,
          byLevel,
          reflections: stepHints.filter((hint) => hint.level === 0).length,
        },
        misconceptions: [...groups.entries()]
          .sort(([a, x], [b, y]) => y.length - x.length || a.localeCompare(b))
          .map(([id, evidence]) => {
            const mark = input.disagreements.find((row) => row.rubricRef === rubricRef && row.criterion === criterion && row.misconception === id);
            return { id, label: misconceptionLabel(id), students: evidence.length, evidence, disagreement: mark ? { note: mark.note, at: mark.at } : null };
          }),
      };
    });
    return { rubricRef, submitted: attempts.length, steps };
  });
  return {
    ruleVersion: HINT_INSIGHT_RULES,
    hintRules: CHECKPOINT_HINT_RULES,
    misconceptionRules: CHECKPOINT_MISCONCEPTION_RULES,
    provider: "rules",
    totals: {
      targeted: input.targeted,
      submitted: latest.length,
      passed,
      notPassed: latest.length - passed,
      notStarted: Math.max(0, input.targeted - latest.length),
    },
    rubrics,
  };
}
