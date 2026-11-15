export type InsightEvidenceKind = "QUIZ" | "TEST" | "PRACTICAL";
export type InsightStatus = "INFORMATIONAL" | "NEEDS_MORE_EVIDENCE" | "TEACHER_REVIEW_RECOMMENDED";
export type InsightRuleVersion = "insights@1" | "insights@2" | "insights@3";
/** Evidence entries of an insight: the three scored kinds plus the written submission and a similarity match (insights@2). */
export type InsightEvidenceRefKind = InsightEvidenceKind | "WRITTEN" | "SIMILARITY_MATCH" | "WRITTEN_GRADE";
export type InsightRuleCode =
  | "INSUFFICIENT_EVIDENCE"
  | "SCORE_CHANGE_UNUSUAL"
  | "HIGH_HINT_DEPENDENCE"
  | "OBJECTIVE_MASTERY_INCONSISTENT"
  | "SUBMISSION_SIMILARITY_HIGH"
  | "MCQ_EXPLANATION_MISMATCH"
  | "SIMULATION_EXPLANATION_MISMATCH";

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
  /** The evidence item's lesson (null when it has none); insights@3 links MCQ and practical evidence to a written grade by lesson. */
  lessonId?: string | null;
  /** TEST: the assignment the submission belongs to; tells a retake of the same test from a different test. */
  assignmentId?: string | null;
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

/**
 * insights@3: the teacher-final grade of one student's current written submission, reduced to the explanation criteria
 * (codes `EXPLANATION` and `REASONING`, summed over all prompts). It comes from the newest WrittenGradeDecision only, never
 * from an AI suggestion. `lessonId` is the lesson of the written task's resource.
 */
export type ExplanationFact = {
  assignmentId: string;
  assignmentTitle: string;
  lessonId: string;
  submissionId: string;
  submittedAt: Date;
  gradeId: string;
  gradedAt: Date;
  explanationPoints: number;
  explanationMaxPoints: number;
};

export type InsightInput = {
  classId: string;
  studentId: string;
  evidence: InsightEvidence[];
  /** insights@2: similarity facts of this student; absent or empty when the class has none. */
  similarity?: SimilarityFact[];
  /** insights@3: teacher-final explanation grades of this student; absent or empty when none. */
  explanations?: ExplanationFact[];
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
