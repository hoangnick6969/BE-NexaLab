import { describe, expect, it } from "vitest";
import { z } from "zod";
import { CIRCUIT_BULB_RUBRIC, circuitBulbEvaluator } from "./circuit-bulb-checkpoints.evaluator";
import { LEGACY_CHALLENGE_RUBRIC } from "./legacy-challenge.evaluator";
import { createLabEvaluatorRegistry, labEvaluators } from "./registry";
import type { LabEvaluator } from "./lab-evaluator";
import { executionSchema, runSubmissionSchema, submittedEvidence } from "../lab-run";

// Synthetic second activity: proves the runtime path does not depend on Circuit.
const syntheticEvaluator: LabEvaluator<{ answer: number }> = {
  rubricRef: "synthetic-ratio@1.0.0",
  activity: { key: "synthetic-ratio", version: 1 },
  modelRefs: ["circuit@1.0.0"],
  rendererKey: "synthetic-ratio",
  envelope: "evidence",
  evidenceSchema: z.object({ answer: z.number().finite() }).strict(),
  evaluate: (labRunId, { answer }, config) => ({
    result: { labRunId, answer, expected: config.params?.expected, template: config.template },
    verdict: answer === config.params?.expected ? "passed" : "needs_practice",
  }),
};
const config = { labId: "synthetic", modelRef: "circuit@1.0.0", engineVersion: "1.0.0", params: { expected: 7 }, template: { unit: "g/cm3" } };

describe("Lab evaluator registry", () => {
  const registry = createLabEvaluatorRegistry([circuitBulbEvaluator, syntheticEvaluator]);

  it("dispatches a registered activity through its own evidence schema", () => {
    expect(registry.evaluate("synthetic-ratio@1.0.0", "run-1", { answer: 7 }, config))
      .toEqual({ verdict: "passed", result: { labRunId: "run-1", answer: 7, expected: 7, template: { unit: "g/cm3" } } });
    expect(registry.evaluate("synthetic-ratio@1.0.0", "run-1", { answer: 6 }, config).verdict).toBe("needs_practice");
    expect(() => registry.evaluate("synthetic-ratio@1.0.0", "run-1", { answer: "7" }, config)).toThrow(/định dạng/);
  });

  it("pins rubrics to their exact activity and model, falling back to legacy otherwise", () => {
    expect(registry.rubricRefForActivity("synthetic-ratio", 1, "circuit@1.0.0")).toBe("synthetic-ratio@1.0.0");
    expect(() => registry.rubricRefForActivity("synthetic-ratio", 2, "circuit@1.0.0")).toThrow();
    expect(() => registry.rubricRefForActivity("synthetic-ratio", 1, "eye@1.0.0")).toThrow();
    expect(registry.rubricRefForActivity("circuit-bulb-checkpoints", 1, "circuit-bulb@1.0.0")).toBe(CIRCUIT_BULB_RUBRIC);
    expect(registry.rubricRefForActivity("unregistered", 1, "eye@1.0.0")).toBe(LEGACY_CHALLENGE_RUBRIC);
  });

  it("fails closed on unknown rubrics and rejects ambiguous registrations", () => {
    expect(() => registry.resolve("missing@1.0.0")).toThrow(/không nằm trong danh sách/);
    expect(() => createLabEvaluatorRegistry([circuitBulbEvaluator, circuitBulbEvaluator])).toThrow(/duplicate/);
    expect(() => createLabEvaluatorRegistry([{ ...syntheticEvaluator, activity: null }])).toThrow(/must pin/);
  });

  it("keeps the released Circuit identity, renderer and legacy fallback", () => {
    expect(labEvaluators.rubricRefs).toEqual([LEGACY_CHALLENGE_RUBRIC, CIRCUIT_BULB_RUBRIC, "em-induction-checkpoints@1.0.0", "ecology-tolerance-checkpoints@1.0.0", "mass-conservation-poea@1.0.0", "lever-investigation@1.0.0", "density-stations@1.0.0", "gene-protein-stations@1.0.0", "eye-anatomy-optics@1.0.0"]);
  });
});
