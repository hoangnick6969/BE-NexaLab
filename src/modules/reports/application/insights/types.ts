export type InsightEvidenceKind = "QUIZ" | "TEST" | "PRACTICAL";
export type InsightStatus = "INFORMATIONAL" | "NEEDS_MORE_EVIDENCE" | "TEACHER_REVIEW_RECOMMENDED";
export type InsightRuleVersion = "insights@1" | "insights@2";
/** Evidence entries of an insight: the three scored kinds plus the written submission and a similarity match (insights@2). */
export type InsightEvidenceRefKind = InsightEvidenceKind | "WRITTEN" | "SIMILARITY_MATCH";
export type InsightRuleCode =
  | "INSUFFICIENT_EVIDENCE"
  | "SCORE_CHANGE_UNUSUAL"
  | "HIGH_HINT_DEPENDENCE"
  | "OBJECTIVE_MASTERY_INCONSISTENT"
  | "SUBMISSION_SIMILARITY_HIGH";

/**
 * One normalized evidence item of one student in one class. The loader (TAI4-T2) filters and normalizes: class
 * assignments only, approved members only, auto-scored TEST rows only, late-pending and reject-zero rows removed.
 * The engine trusts this list and never reads the database.
 */
export type InsightEvidence = {
  kind: InsightEvidenceKind;
  id: string;
  at: Date;
  /** QUIZ and TEST: score 0–100. */
  score?: number;
  /** QUIZ: the stored pass flag. */
  passed?: boolean;
  /** PRACTICAL: the attempt verdict. */
  verdict?: string;
  /** PRACTICAL: highest HintLog level used (0 if none). */
  maxHintLevel?: number;
  /** Outcome codes of the evidence item's lesson. */
  outcomeCodes: string[];
};

/**
 * One match of the newest similarity run of a written assignment, seen from one student of the pair. It carries nothing
 * about the other student. The loader keeps only valid matches (both submissions still current, both students approved);
 * `reviewed` tells whether the teacher has reviewed the pair as of the evaluation instant.
 */
export type SimilarityFact = {
  assignmentId: string;
  assignmentTitle: string;
  /** The student's own current submission. */
  submissionId: string;
  submittedAt: Date;
  matchId: string;
  runAt: Date;
  level: string;
  reviewed: boolean;
};

export type InsightInput = {
  classId: string;
  studentId: string;
  evidence: InsightEvidence[];
  /** insights@2: similarity facts of this student; absent or empty when the class has none. */
  similarity?: SimilarityFact[];
  now: Date;
};

export type Insight = {
  fingerprint: string;
  ruleVersion: InsightRuleVersion;
  ruleCode: InsightRuleCode;
  pattern?: "SUDDEN_UNAIDED_PASS";
  status: InsightStatus;
  studentId: string;
  message: string;
  thresholds: Record<string, number>;
  values: Record<string, number | string>;
  evidence: Array<{ kind: InsightEvidenceRefKind; id: string; at: string }>;
  computedAt: string;
};
