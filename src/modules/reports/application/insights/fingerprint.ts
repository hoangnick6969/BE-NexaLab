import { createHash } from "node:crypto";
import type { InsightRuleCode, InsightRuleVersion } from "./types";

/**
 * sha256(ruleVersion|ruleCode|classId|studentId[|outcomeCode]|sorted evidenceIds). `outcomeCode` is added only for
 * OBJECTIVE_MASTERY_INCONSISTENT so two outcomes that share one evidence set never collide (PO decision 2026-11-06).
 * The pattern is not part of the fingerprint, so showing or hiding SUDDEN_UNAIDED_PASS never changes it.
 */
export function insightFingerprint(input: {
  ruleVersion: InsightRuleVersion;
  ruleCode: InsightRuleCode;
  classId: string;
  studentId: string;
  outcomeCode?: string;
  evidenceIds: string[];
}): string {
  const ids = [...input.evidenceIds].sort();
  const parts = [input.ruleVersion, input.ruleCode, input.classId, input.studentId, ...(input.outcomeCode === undefined ? [] : [input.outcomeCode]), ids.join(",")];
  return createHash("sha256").update(parts.join("|")).digest("hex");
}
