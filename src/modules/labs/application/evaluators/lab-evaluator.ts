import type { z } from "zod";
import type { ChallengeParams } from "../../../lessons/application/lesson-content";

/** Pinned values from the LabRun tuple that an evaluator may read. */
export interface LabRuntimeConfig {
  labId: string;
  modelRef: string;
  engineVersion: string;
  params: ChallengeParams | null;
  /** Reviewed pack template (units, ranges, variants); never executable code. */
  template: unknown;
}

/**
 * Where a `lab-contract/1` submission carries learner data. `labState` and
 * `checkpoints` are the shapes already stored by legacy and Circuit attempts;
 * new activities submit `evidence`.
 */
export type EvidenceEnvelope = "labState" | "checkpoints" | "evidence";

export interface LabEvaluation {
  result: Record<string, unknown>;
  verdict: string;
}

/**
 * Server-side activity rubric. Each implementation is immutable once released:
 * new assessment behaviour registers a new rubricRef instead of editing this one.
 */
export interface LabEvaluator<Evidence = unknown> {
  rubricRef: string;
  /** Exact activity this rubric assesses; null only for the legacy fallback. */
  activity: { key: string; version: number } | null;
  /** Allowlisted models the activity can be pinned with; empty means any (legacy fallback). */
  modelRefs: readonly string[];
  /** Frontend renderer to mount for runs pinned to this rubric. */
  rendererKey: string | null;
  envelope: EvidenceEnvelope;
  evidenceSchema: z.ZodType<Evidence>;
  evaluate(labRunId: string | null, studentData: Evidence, runtimeConfig: LabRuntimeConfig): LabEvaluation;
}
